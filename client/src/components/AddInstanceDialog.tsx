import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Cloud, Server } from 'lucide-react';
import { createInstance, createSandboxInstance } from '@/lib/api';

interface AddInstanceDialogProps {
  onCreated: () => void;
}

type Mode = 'manual' | 'sandbox';

export function AddInstanceDialog({ onCreated }: AddInstanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('sandbox');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Manual fields
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [description, setDescription] = useState('');

  // Sandbox fields
  const [sandboxName, setSandboxName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [gatewayToken, setGatewayToken] = useState('');
  const [sandboxDesc, setSandboxDesc] = useState('');

  const resetForm = () => {
    setName('');
    setEndpoint('');
    setToken('');
    setDescription('');
    setSandboxName('');
    setApiKey('');
    setGatewayToken('');
    setSandboxDesc('');
    setError('');
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !endpoint.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createInstance({
        name: name.trim(),
        endpoint: endpoint.trim(),
        description: description.trim(),
        token: token.trim() || undefined,
      });
      resetForm();
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create instance');
    } finally {
      setLoading(false);
    }
  };

  const handleSandboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxName.trim() || !apiKey.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createSandboxInstance({
        name: sandboxName.trim(),
        apiKey: apiKey.trim(),
        gatewayToken: gatewayToken.trim() || undefined,
        description: sandboxDesc.trim() || undefined,
      });
      resetForm();
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sandbox');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { resetForm(); setLoading(false); } }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Instance
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add OpenClaw Instance</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'sandbox' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setMode('sandbox')}
          >
            <Cloud className="h-4 w-4" />
            Novita Sandbox
          </Button>
          <Button
            variant={mode === 'manual' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setMode('manual')}
          >
            <Server className="h-4 w-4" />
            Manual
          </Button>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {mode === 'sandbox' ? (
          <form onSubmit={handleSandboxSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sb-name">Name</Label>
              <Input
                id="sb-name"
                placeholder="my-sandbox"
                value={sandboxName}
                onChange={e => setSandboxName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-apikey">Novita API Key</Label>
              <Input
                id="sb-apikey"
                type="password"
                placeholder="sk_..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                required
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Get your API key at{' '}
                <a href="https://novita.ai/docs/guides/quickstart#2-manage-api-key" target="_blank" rel="noopener noreferrer" className="underline">
                  novita.ai
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-token">Gateway Token</Label>
              <Input
                id="sb-token"
                type="password"
                placeholder="Auto-generated if empty"
                value={gatewayToken}
                onChange={e => setGatewayToken(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Optional. A secure token will be auto-generated if left empty.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-desc">Description</Label>
              <Input
                id="sb-desc"
                placeholder="What does this instance do?"
                value={sandboxDesc}
                onChange={e => setSandboxDesc(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Sandbox...' : 'Create Sandbox Instance'}
            </Button>
            {loading && (
              <p className="text-xs text-muted-foreground text-center">
                Creating sandbox, writing config, and starting gateway. This may take a few minutes...
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="my-instance"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint URL</Label>
              <Input
                id="endpoint"
                placeholder="https://my-instance.example.com"
                value={endpoint}
                onChange={e => setEndpoint(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Gateway Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="OPENCLAW_GATEWAY_TOKEN (optional)"
                value={token}
                onChange={e => setToken(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                If the instance has OPENCLAW_GATEWAY_TOKEN set, enter it here for authentication.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Input
                id="desc"
                placeholder="What does this instance do?"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create Instance'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
