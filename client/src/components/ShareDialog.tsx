import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Check, Copy, Clock } from 'lucide-react';
import { createShareLink } from '@/lib/api';
import type { ShareDuration } from '@shared/types';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareType: 'team' | 'instance';
  targetId: string;
  targetName: string;
}

const DURATION_OPTIONS: { value: ShareDuration; label: string }[] = [
  { value: '1h', label: '1 Hour' },
  { value: '3h', label: '3 Hours' },
  { value: '12h', label: '12 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '2d', label: '2 Days' },
  { value: '3d', label: '3 Days' },
  { value: '1w', label: '1 Week' },
  { value: '1M', label: '1 Month' },
  { value: 'permanent', label: 'Permanent' },
];

export function ShareDialog({ open, onOpenChange, shareType, targetId, targetName }: ShareDialogProps) {
  const [duration, setDuration] = useState<ShareDuration>('12h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setDuration('12h');
    setError('');
    setShareUrl('');
    setCopied(false);
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const { shareToken } = await createShareLink({
        shareType,
        targetId,
        duration,
      });
      const url = `${window.location.origin}/share/${shareToken.token}`;
      setShareUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share {shareType === 'team' ? 'Team' : 'Instance'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                {shareType === 'team' ? 'Team' : 'Instance'}
              </Badge>
              <span className="text-sm font-medium">{targetName}</span>
            </div>
          </div>

          {!shareUrl ? (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Expiration
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                        duration === opt.value
                          ? 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setDuration(opt.value)}
                      disabled={loading}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Shared users can view and dispatch tasks via @ mentions. Sensitive info (endpoint, token, etc.) will be hidden.
              </p>

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="font-mono text-xs"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {duration === 'permanent'
                  ? 'This link never expires'
                  : `Link expires in ${DURATION_OPTIONS.find(o => o.value === duration)?.label}`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {!shareUrl ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? 'Generating...' : 'Generate Link'}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
