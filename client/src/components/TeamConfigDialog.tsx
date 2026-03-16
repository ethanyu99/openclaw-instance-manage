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
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  AlertCircle,
  HelpCircle,
  Star,
  Unplug,
  Key,
} from 'lucide-react';
import { configureTeamGit, getTeamGitStatus } from '@/lib/api';
import type { TeamPublic } from '@shared/types';
import type { TeamGitConfigResult, TeamGitStatusResult } from '@/lib/api';

interface TeamConfigDialogProps {
  team: TeamPublic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamConfigDialog({ team, open, onOpenChange }: TeamConfigDialogProps) {
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
  const [result, setResult] = useState<TeamGitConfigResult | null>(null);
  const [teamStatus, setTeamStatus] = useState<TeamGitStatusResult | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await getTeamGitStatus(team.id);
      setTeamStatus(status);
      const withName = status.roleStatuses.find(s => s.gitName);
      if (withName) {
        if (withName.gitName && !gitName) setGitName(withName.gitName);
        if (withName.gitEmail && !gitEmail) setGitEmail(withName.gitEmail);
      }
    } catch (err) {
      console.warn('Team git status load failed (not critical):', err);
    } finally {
      setStatusLoading(false);
    }
  }, [team.id]);

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
        const res = await configureTeamGit(team.id, {
          authMethod: 'ssh',
          sshPrivateKey: sshPrivateKey.trim(),
          sshPublicKey: sshPublicKey.trim() || undefined,
          gitName: gitName.trim() || undefined,
          gitEmail: gitEmail.trim() || undefined,
          host: host.trim() || undefined,
        });
        setResult(res);
        setSshPrivateKey('');
        setSshPublicKey('');
      } else {
        const res = await configureTeamGit(team.id, {
          authMethod: 'pat',
          pat: pat.trim(),
          username: username.trim() || undefined,
          gitName: gitName.trim() || undefined,
          gitEmail: gitEmail.trim() || undefined,
          host: host.trim() || undefined,
        });
        setResult(res);
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
            Team Configuration — {team.name}
          </DialogTitle>
        </DialogHeader>

        {/* Per-role Status Overview */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Role Coverage</span>
            {statusLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : teamStatus ? (
              <Badge
                variant={teamStatus.configured === teamStatus.configurable && teamStatus.configurable > 0 ? 'secondary' : 'outline'}
                className="text-[10px] gap-1"
              >
                {teamStatus.configured === teamStatus.configurable && teamStatus.configurable > 0 ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                )}
                {teamStatus.configured}/{teamStatus.configurable} configured
              </Badge>
            ) : null}
          </div>

          {teamStatus && teamStatus.roleStatuses.length > 0 && (
            <div className="space-y-1.5">
              {teamStatus.roleStatuses.map(r => (
                <div key={r.roleId} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-background/60 border border-border/40">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {r.isLead && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                    <span className="font-medium truncate">{r.roleName}</span>
                    {r.instanceName && (
                      <span className="text-muted-foreground truncate max-w-[100px]">→ {r.instanceName}</span>
                    )}
                  </div>
                  <div className="shrink-0 ml-2 flex items-center gap-1">
                    {r.reason === 'unbound' ? (
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Unplug className="h-3 w-3" /> Unbound
                      </span>
                    ) : r.reason === 'no_endpoint' ? (
                      <span className="flex items-center gap-1 text-zinc-400">
                        <XCircle className="h-3 w-3" /> No endpoint
                      </span>
                    ) : r.reason === 'connection_failed' ? (
                      <span className="flex items-center gap-1 text-red-500">
                        <XCircle className="h-3 w-3" /> Offline
                      </span>
                    ) : r.hasCredentials === true ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> PAT
                      </span>
                    ) : r.hasSshKeys ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <Key className="h-3 w-3" /> SSH Keys
                      </span>
                    ) : r.hasCredentials === null ? (
                      <span className="flex items-center gap-1 text-blue-500">
                        <HelpCircle className="h-3 w-3" /> Configurable
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-500">
                        <AlertCircle className="h-3 w-3" /> Not configured
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {teamStatus && teamStatus.configurable === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No configurable instances bound to this team
            </p>
          )}
        </div>

        {/* Batch Result */}
        {result && (
          <div className={`rounded-md p-3 text-sm space-y-2 ${
            result.failed === 0
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-700'
          }`}>
            <div className="font-medium flex items-center gap-2">
              {result.failed === 0 ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {result.succeeded}/{result.total} instances configured
              {result.failed > 0 && `, ${result.failed} failed`}
            </div>
            <div className="space-y-1">
              {result.results.map(r => (
                <div key={r.instanceId} className="text-xs flex items-center gap-2">
                  {r.success ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                  )}
                  <span className="font-medium">{r.instanceName}</span>
                  <span className="opacity-70">
                    {r.success ? r.verifyMessage : r.error}
                  </span>
                </div>
              ))}
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
                <Label htmlFor="team-pat">Personal Access Token (PAT)</Label>
                <Input
                  id="team-pat"
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
                  {' '}— will be applied to all sandbox instances in this team
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="team-ssh-private">Private Key <span className="text-destructive">*</span></Label>
                <Textarea
                  id="team-ssh-private"
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
                <Label htmlFor="team-ssh-public">
                  Public Key <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="team-ssh-public"
                  placeholder="ssh-ed25519 AAAA..."
                  value={sshPublicKey}
                  onChange={e => setSshPublicKey(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                  className="font-mono text-xs h-16 resize-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Keys will be written to <span className="font-mono">~/.ssh/</span> in each sandbox instance
              </p>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="team-name">Git user.name</Label>
              <Input
                id="team-name"
                placeholder="Your Name"
                value={gitName}
                onChange={e => setGitName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-email">Git user.email</Label>
              <Input
                id="team-email"
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
                <Label htmlFor="team-host">Git Host</Label>
                <Input
                  id="team-host"
                  placeholder="github.com"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  disabled={loading}
                />
              </div>
              {authMethod === 'pat' && (
                <div className="space-y-2">
                  <Label htmlFor="team-user">Username</Label>
                  <Input
                    id="team-user"
                    placeholder="git (default)"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}
            </div>
          </details>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={loading || (teamStatus?.configurable === 0)}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Configuring {teamStatus?.configurable ?? 0} instances...
              </>
            ) : (
              <>
                {authMethod === 'ssh' ? <Key className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
                Configure All Instances
                {teamStatus && teamStatus.configurable > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    {teamStatus.configurable}
                  </Badge>
                )}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
