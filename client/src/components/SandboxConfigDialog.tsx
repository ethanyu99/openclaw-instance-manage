import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { GitBranch, CheckCircle2, XCircle, Loader2, ExternalLink, HelpCircle, Cloud, Server, Key } from 'lucide-react';
import { configureSandboxGit, getSandboxGitStatus } from '@/lib/api';
import type { InstancePublic } from '@shared/types';
import type { GitStatusResult } from '@/lib/api';

interface InstanceConfigDialogProps {
  instance: InstancePublic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SandboxConfigDialog({ instance, open, onOpenChange }: InstanceConfigDialogProps) {
  const [authMethod, setAuthMethod] = useState<'pat' | 'ssh'>('pat');
  const [pat, setPat] = useState('');
  const [username, setUsername] = useState('');
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [host, setHost] = useState('github.com');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshPublicKey, setSshPublicKey] = useState('');

  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ verified: boolean; message: string } | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);

  const isSandbox = !!instance.sandboxId;

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await getSandboxGitStatus(instance.id);
      setGitStatus(status);
      if (status.gitName && !gitName) setGitName(status.gitName);
      if (status.gitEmail && !gitEmail) setGitEmail(status.gitEmail);
    } catch (err) {
      console.warn('Sandbox git status load failed (not critical):', err);
    } finally {
      setStatusLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  useEffect(() => {
    if (open) {
      setError('');
      setResult(null);
      loadStatus();
    }
  }, [open, loadStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (authMethod === 'pat' && !pat.trim()) return;
    if (authMethod === 'ssh' && !sshPrivateKey.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      if (authMethod === 'ssh') {
        const res = await configureSandboxGit(instance.id, {
          authMethod: 'ssh',
          sshPrivateKey: sshPrivateKey.trim(),
          sshPublicKey: sshPublicKey.trim() || undefined,
          gitName: gitName.trim() || undefined,
          gitEmail: gitEmail.trim() || undefined,
          host: host.trim() || undefined,
        });
        setResult({ verified: res.verified, message: res.verifyMessage });
        setSshPrivateKey('');
        setSshPublicKey('');
      } else {
        const res = await configureSandboxGit(instance.id, {
          authMethod: 'pat',
          pat: pat.trim(),
          username: username.trim() || undefined,
          gitName: gitName.trim() || undefined,
          gitEmail: gitEmail.trim() || undefined,
          host: host.trim() || undefined,
        });
        setResult({ verified: res.verified, message: res.verifyMessage });
        setPat('');
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            <span>Instance Configuration — {instance.name}</span>
            {isSandbox ? (
              <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-200">
                <Cloud className="h-3 w-3" /> Sandbox
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Server className="h-3 w-3" /> Manual
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Current Status */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Git Credentials</span>
            <div className="flex items-center gap-1.5">
              {statusLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  {gitStatus?.hasCredentials === true ? (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      PAT
                    </Badge>
                  ) : gitStatus?.hasCredentials === null ? (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <HelpCircle className="h-3 w-3 text-zinc-400" />
                      Unknown
                    </Badge>
                  ) : gitStatus?.hasCredentials === false && !gitStatus?.hasSshKeys ? (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <XCircle className="h-3 w-3 text-zinc-400" />
                      Not configured
                    </Badge>
                  ) : null}
                  {gitStatus?.hasSshKeys && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Key className="h-3 w-3 text-emerald-500" />
                      SSH Keys
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
          {gitStatus && (gitStatus.gitName || gitStatus.gitEmail) && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {gitStatus.gitName && <div>user.name: <span className="font-mono">{gitStatus.gitName}</span></div>}
              {gitStatus.gitEmail && <div>user.email: <span className="font-mono">{gitStatus.gitEmail}</span></div>}
            </div>
          )}
        </div>

        {/* Result feedback */}
        {result && (
          <div className={`rounded-md p-3 text-sm flex items-start gap-2 ${
            result.verified
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-700'
          }`}>
            {result.verified ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <div>
              <div className="font-medium">{result.verified ? 'Configured successfully' : 'Configured with warning'}</div>
              <div className="text-xs mt-0.5 opacity-80">{result.message}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Auth method toggle */}
          <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5 border border-border/50">
            <button
              type="button"
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                authMethod === 'pat'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setAuthMethod('pat')}
            >
              PAT Token
            </button>
            <button
              type="button"
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                authMethod === 'ssh'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setAuthMethod('ssh')}
            >
              <Key className="h-3 w-3" />
              SSH Key
            </button>
          </div>

          {authMethod === 'pat' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="cfg-pat">Personal Access Token (PAT)</Label>
                <Input
                  id="cfg-pat"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={pat}
                  onChange={e => setPat(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Generate at{' '}
                  <a
                    href="https://github.com/settings/tokens?type=beta"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline inline-flex items-center gap-0.5"
                  >
                    GitHub Settings <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  {' '}— recommended: Fine-grained token with repository access only
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="cfg-ssh-private">Private Key <span className="text-destructive">*</span></Label>
                <Textarea
                  id="cfg-ssh-private"
                  placeholder={`-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA...\n-----END OPENSSH PRIVATE KEY-----`}
                  value={sshPrivateKey}
                  onChange={e => setSshPrivateKey(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="off"
                  className="font-mono text-xs h-28 resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cfg-ssh-public">
                  Public Key <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="cfg-ssh-public"
                  placeholder="ssh-ed25519 AAAA..."
                  value={sshPublicKey}
                  onChange={e => setSshPublicKey(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                  className="font-mono text-xs h-16 resize-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Keys will be written to <span className="font-mono">~/.ssh/</span> in the sandbox
              </p>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cfg-name">Git user.name</Label>
              <Input
                id="cfg-name"
                placeholder="Your Name"
                value={gitName}
                onChange={e => setGitName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-email">Git user.email</Label>
              <Input
                id="cfg-email"
                type="email"
                placeholder="you@example.com"
                value={gitEmail}
                onChange={e => setGitEmail(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Advanced options
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-2">
                <Label htmlFor="cfg-host">Git Host</Label>
                <Input
                  id="cfg-host"
                  placeholder="github.com"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  disabled={loading}
                />
              </div>
              {authMethod === 'pat' && (
                <div className="space-y-2">
                  <Label htmlFor="cfg-user">Username</Label>
                  <Input
                    id="cfg-user"
                    placeholder="git (default)"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}
            </div>
          </details>

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Configuring...
              </>
            ) : (
              <>
                {authMethod === 'ssh' ? <Key className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
                {(gitStatus?.hasCredentials === true || gitStatus?.hasSshKeys === true)
                  ? 'Update Git Configuration'
                  : 'Configure Git Access'}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
