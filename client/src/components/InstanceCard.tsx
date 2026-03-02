import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, Cloud, Edit2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InstancePublic } from '@shared/types';
import { deleteInstance, checkHealth, updateInstance } from '@/lib/api';
import { getExchangeById } from '@/lib/storage';
import { SessionDetailDialog } from '@/components/SessionDetailDialog';

interface InstanceCardProps {
  instance: InstancePublic;
  taskStream?: string;
  onRefresh: () => void;
}

const statusColor: Record<string, string> = {
  online: 'bg-blue-500',
  busy: 'bg-emerald-500 animate-pulse',
  offline: 'bg-zinc-400',
};

const statusBadgeVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  online: 'secondary',
  busy: 'default',
  offline: 'outline',
};

export function InstanceCard({ instance, taskStream, onRefresh }: InstanceCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(instance.name);
  const [editDesc, setEditDesc] = useState(instance.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [deleting, setDeleting] = useState(false);

  const handleEditSave = async () => {
    if (!editName.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateInstance(instance.id, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      setEditOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const msg = instance.sandboxId
      ? `Delete instance "${instance.name}" and terminate its sandbox?`
      : `Delete instance "${instance.name}"?`;
    if (!confirm(msg)) return;
    setDeleting(true);
    try {
      await deleteInstance(instance.id);
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  const handleHealth = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await checkHealth(instance.id);
    onRefresh();
  };

  const handleTaskClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (instance.currentTask?.id) {
      setDetailOpen(true);
    }
  };

  const sessionForTask = useMemo(() => {
    if (!instance.currentTask?.id) return null;
    const result = getExchangeById(instance.currentTask.id);
    return result?.session || null;
  }, [instance.currentTask?.id, instance.currentTask?.status]);

  return (
    <>
      <Card className="hover:border-primary/40 hover:shadow-md transition-all duration-200 bg-card border-border/80 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`inline-block w-2.5 h-2.5 rounded-full shadow-sm ${statusColor[instance.status]}`} />
              <CardTitle className="text-base font-semibold tracking-tight">{instance.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1.5">
              {instance.sandboxId && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold gap-1 text-blue-600 border-blue-200 bg-blue-50/50">
                  <Cloud className="h-3 w-3" />
                  Sandbox
                </Badge>
              )}
              <Badge variant={statusBadgeVariant[instance.status]} className="text-[10px] uppercase tracking-wider font-semibold">
                {instance.status}
              </Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={handleHealth}>
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(instance.name);
                  setEditDesc(instance.description || '');
                  setError('');
                  setEditOpen(true);
                }}
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive text-muted-foreground" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 mt-2.5 min-w-0">
            <div className="font-mono text-xs text-muted-foreground/80 bg-muted/50 px-2 py-1.5 rounded-md border border-border/50 min-w-0 overflow-hidden flex items-center">
              <a href={instance.endpoint?.replace(/^ws/, 'http') || '#'} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline flex items-center gap-1.5 min-w-0 w-full">
                <span className="truncate">{instance.endpoint || 'No endpoint'}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            {instance.sandboxId && instance.token && (
              <div className="font-mono text-xs text-blue-600/80 bg-blue-50/50 px-2 py-1.5 rounded-md border border-blue-200/50 min-w-0 overflow-hidden flex items-center">
                <a href={`${instance.endpoint?.replace(/^ws/, 'http') || ''}?token=${instance.token}`} target="_blank" rel="noreferrer" className="hover:text-blue-600 hover:underline flex items-center gap-1.5 min-w-0 w-full">
                  <span className="truncate">Web UI: {instance.endpoint}?token={instance.token.substring(0, 8)}...</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {instance.description && (
            <p className="text-sm text-muted-foreground mb-3">{instance.description}</p>
          )}

          {instance.currentTask && (
            <div
              className="rounded-lg border border-border/60 bg-card p-3 text-sm space-y-2 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
              onClick={handleTaskClick}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-foreground/80 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40"></span>
                  Current Task
                </span>
                <Badge
                  variant={
                    instance.currentTask.status === 'running'
                      ? 'default'
                      : instance.currentTask.status === 'completed'
                      ? 'secondary'
                      : 'destructive'
                  }
                  className="text-[10px] uppercase tracking-wider font-semibold"
                >
                  {instance.currentTask.status}
                </Badge>
              </div>
              <p className="text-xs text-foreground font-medium border-l-2 border-primary/40 pl-2.5 truncate" title={instance.currentTask.content}>
                {instance.currentTask.content}
              </p>
              {instance.currentTask.summary && (
                <p className="text-xs text-muted-foreground line-clamp-2 pl-3 border-l-2 border-transparent">
                  {instance.currentTask.summary}
                </p>
              )}
            </div>
          )}

          {taskStream && (
            <div className="mt-3 rounded-lg bg-[#0d1117] border border-border/40 text-emerald-400 p-3 font-mono text-[11px] leading-relaxed max-h-36 overflow-y-auto shadow-inner">
              <pre className="whitespace-pre-wrap break-words">{taskStream.slice(-500)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <SessionDetailDialog
        session={sessionForTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Instance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Instance Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editDesc}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
