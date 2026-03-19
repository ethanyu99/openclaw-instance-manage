import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, Cloud, Edit2, ExternalLink, Star, Settings, Share2, FolderOpen, MessageSquare, Terminal, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InstancePublic } from '@shared/types';
import { deleteInstance, checkHealth, updateInstance } from '@/lib/api';
import { toast } from 'sonner';
import { useInstanceStore } from '@/stores/instanceStore';
import { SessionDetailDialog } from '@/components/SessionDetailDialog';
import { SandboxConfigDialog } from '@/components/SandboxConfigDialog';
import { ShareDialog } from '@/components/ShareDialog';
import { FileBrowserDialog } from '@/components/FileBrowserDialog';
import { TerminalDialog } from '@/components/TerminalDialog';
import { FileUploadDialog } from '@/components/FileUploadDialog';

interface InstanceCardProps {
  instance: InstancePublic;
  onRefresh: () => void;
}

const statusColor: Record<string, string> = {
  online: 'bg-blue-500',
  busy: 'bg-emerald-500 animate-pulse',
  offline: 'bg-zinc-400',
};

export function InstanceCard({ instance, onRefresh }: InstanceCardProps) {
  // Subscribe to this instance's stream only (avoids re-render on other instances' streams)
  const taskStream = useInstanceStore(s => s.taskStreams[instance.id]);
  const activeSession = useInstanceStore(s => s.activeSessions[instance.id]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [editName, setEditName] = useState(instance.name);
  const [editDesc, setEditDesc] = useState(instance.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [deleting, setDeleting] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

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
      toast.success(`Instance "${instance.name}" deleted`);
      onRefresh();
    } catch {
      toast.error('Failed to delete instance');
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


  return (
    <>
      <Card
        className={`hover:border-primary/40 hover:shadow-md transition-all duration-200 bg-card border-border/80 shadow-sm relative ${dragOver ? 'ring-2 ring-primary border-primary' : ''}`}
        onDragOver={instance.sandboxId ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); } : undefined}
        onDragLeave={instance.sandboxId ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); } : undefined}
        onDrop={instance.sandboxId ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (e.dataTransfer.files.length > 0) { setDroppedFiles(Array.from(e.dataTransfer.files)); setUploadOpen(true); } } : undefined}
      >
        <CardHeader className="p-3 pb-2.5 space-y-0 overflow-hidden">
          {/* Row 1: Name + Badges */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-block w-2 h-2 rounded-full shadow-sm shrink-0 ${statusColor[instance.status]}`} />
              <CardTitle className="text-sm font-semibold tracking-tight truncate">{instance.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {instance.role && (
                <Badge
                  variant="outline"
                  className={`text-[10px] tracking-wider font-semibold gap-1 ${
                    instance.role.isLead
                      ? 'text-amber-600 border-amber-200 bg-amber-50/50'
                      : 'text-violet-600 border-violet-200 bg-violet-50/50'
                  }`}
                >
                  {instance.role.isLead && <Star className="h-2.5 w-2.5" />}
                  {instance.role.name}
                </Badge>
              )}
              {instance.sandboxId && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold gap-1 text-muted-foreground border-border bg-muted/50">
                  <Cloud className="h-3 w-3" />
                  Sandbox
                </Badge>
              )}
            </div>
          </div>

          {/* Row 2: Toolbar + Open Web UI */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-0.5 flex-wrap">
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={handleHealth} title="Refresh">
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={(e) => { e.stopPropagation(); setShareOpen(true); }} title="Share">
                <Share2 className="h-3 w-3 text-muted-foreground" />
              </Button>
              {instance.sandboxId && (
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={(e) => { e.stopPropagation(); setFilesOpen(true); }} title="Files">
                  <FolderOpen className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
              {instance.sandboxId && (
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={(e) => { e.stopPropagation(); setUploadOpen(true); }} title="Upload">
                  <Upload className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
              {instance.sandboxId && (
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={(e) => { e.stopPropagation(); setTerminalOpen(true); }} title="Terminal">
                  <Terminal className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={(e) => { e.stopPropagation(); setConfigOpen(true); }} title="Config">
                <Settings className="h-3 w-3 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={(e) => { e.stopPropagation(); setEditName(instance.name); setEditDesc(instance.description || ''); setError(''); setEditOpen(true); }} title="Edit">
                <Edit2 className="h-3 w-3 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive text-muted-foreground" onClick={handleDelete} disabled={deleting} title="Delete">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {instance.endpoint && instance.token && (
              <a
                href={`${instance.endpoint.replace(/^ws/, 'http')}#token=${instance.token}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary underline underline-offset-2 decoration-muted-foreground/30 hover:decoration-primary transition-colors shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                Web UI
              </a>
            )}
          </div>

          {/* Row 3: Status info */}
          {(instance.currentTask || activeSession || instance.description) && (
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/30 dark:border-border/15 min-w-0">
              {instance.currentTask?.sessionKey && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/30 min-w-0 overflow-hidden">
                  <MessageSquare className="h-3 w-3 text-violet-500 shrink-0" />
                  <span className="text-[11px] text-violet-700 dark:text-violet-400 truncate">
                    {instance.currentTask.content?.slice(0, 60) || instance.currentTask.sessionKey.slice(0, 20)}
                  </span>
                </div>
              )}
              {!instance.currentTask && activeSession && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/30 border border-border/30 min-w-0 overflow-hidden">
                  <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground truncate">
                    Session: <span className="font-medium text-foreground/70">{activeSession.topic || 'Active session'}</span>
                  </span>
                </div>
              )}
              {instance.currentTask && (
                <div
                  className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30 dark:bg-muted/10 border border-border/30 dark:border-border/15 cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20 transition-colors"
                  onClick={handleTaskClick}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    instance.currentTask.status === 'running' ? 'bg-amber-500 animate-pulse' :
                    instance.currentTask.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'
                  }`} />
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground shrink-0">
                    {instance.currentTask.status}
                  </span>
                  <span className="text-[11px] text-foreground/80 font-mono truncate">
                    {instance.currentTask.content}
                  </span>
                </div>
              )}
              {!instance.currentTask && !activeSession && instance.description && (
                <p className="text-[11px] text-muted-foreground truncate">{instance.description}</p>
              )}
            </div>
          )}
        </CardHeader>

        {/* Drag overlay */}
        {dragOver && instance.sandboxId && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary pointer-events-none">
            <div className="text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-mono font-medium text-primary">Drop to upload</p>
              <p className="text-[10px] text-muted-foreground font-mono">{instance.name}/workspace</p>
            </div>
          </div>
        )}
      </Card>

      <SessionDetailDialog
        session={instance.currentTask?.sessionKey ? {
          sessionKey: instance.currentTask.sessionKey,
          ownerId: instance.currentTask.ownerId,
          instanceId: instance.id,
          instanceName: instance.name,
          createdAt: instance.currentTask.createdAt,
          updatedAt: instance.currentTask.updatedAt,
        } : null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        taskStream={taskStream}
      />

      <SandboxConfigDialog
        instance={instance}
        open={configOpen}
        onOpenChange={setConfigOpen}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Instance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="name">Name</Label>
                <span className="text-xs text-muted-foreground">{editName.length}/30</span>
              </div>
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Instance Name"
                maxLength={30}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description</Label>
                <span className="text-xs text-muted-foreground">{editDesc.length}/200</span>
              </div>
              <Textarea
                id="description"
                value={editDesc}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
                maxLength={200}
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

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        shareType="instance"
        targetId={instance.id}
        targetName={instance.name}
      />

      <FileBrowserDialog
        instance={instance}
        open={filesOpen}
        onOpenChange={setFilesOpen}
      />

      <TerminalDialog
        instance={instance}
        open={terminalOpen}
        onOpenChange={setTerminalOpen}
      />

      <FileUploadDialog
        instanceId={instance.id}
        instanceName={instance.name}
        open={uploadOpen}
        onOpenChange={(v) => { setUploadOpen(v); if (!v) setDroppedFiles([]); }}
        initialFiles={droppedFiles}
      />
    </>
  );
}
