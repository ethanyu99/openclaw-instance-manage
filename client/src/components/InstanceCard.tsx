import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, Cloud, Edit2, ExternalLink, Star, Settings, Share2, XCircle, Package, FolderOpen, MessageSquare, Terminal, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InstancePublic } from '@shared/types';
import { deleteInstance, checkHealth, updateInstance } from '@/lib/api';
import { toast } from 'sonner';
import { useWSStore } from '@/stores/wsStore';
import { useInstanceStore } from '@/stores/instanceStore';
import { SessionDetailDialog } from '@/components/SessionDetailDialog';
import { SandboxConfigDialog } from '@/components/SandboxConfigDialog';
import { ShareDialog } from '@/components/ShareDialog';
import { SkillsManagerDialog } from '@/components/skills/SkillsManagerDialog';
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

const statusBadgeVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  online: 'secondary',
  busy: 'default',
  offline: 'outline',
};

export function InstanceCard({ instance, onRefresh }: InstanceCardProps) {
  // Subscribe to this instance's stream only (avoids re-render on other instances' streams)
  const taskStream = useInstanceStore(s => s.taskStreams[instance.id]);
  const activeSession = useInstanceStore(s => s.activeSessions[instance.id]);
  const cancelTask = useWSStore(s => s.cancelTask);
  const [detailOpen, setDetailOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
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
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`inline-block w-2.5 h-2.5 rounded-full shadow-sm ${statusColor[instance.status]}`} />
              <CardTitle className="text-base font-semibold tracking-tight">{instance.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1.5">
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
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold gap-1 text-blue-600 border-blue-200 bg-blue-50/50">
                  <Cloud className="h-3 w-3" />
                  Sandbox
                </Badge>
              )}
              <Badge variant={statusBadgeVariant[instance.status]} className="text-[10px] uppercase tracking-wider font-semibold">
                {instance.status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={handleHealth} title="Refresh">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-muted"
              onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
              title="Share"
            >
              <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            {instance.sandboxId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-muted"
                onClick={(e) => { e.stopPropagation(); setSkillsOpen(true); }}
                title="Skills"
              >
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
            {instance.sandboxId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-muted"
                onClick={(e) => { e.stopPropagation(); setFilesOpen(true); }}
                title="Files"
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
            {instance.sandboxId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-muted"
                onClick={(e) => { e.stopPropagation(); setUploadOpen(true); }}
                title="Upload"
              >
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
            {instance.sandboxId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-muted"
                onClick={(e) => { e.stopPropagation(); setTerminalOpen(true); }}
                title="Terminal"
              >
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-muted"
              onClick={(e) => { e.stopPropagation(); setConfigOpen(true); }}
              title="Config"
            >
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
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
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive text-muted-foreground" onClick={handleDelete} disabled={deleting} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-col gap-1.5 mt-2.5 min-w-0">
            <div className="font-mono text-xs text-muted-foreground/80 bg-muted/50 px-2 py-1.5 rounded-md border border-border/50 min-w-0 overflow-hidden flex items-center">
              <span className="truncate select-text">{instance.endpoint || 'No endpoint'}</span>
            </div>
            {instance.endpoint && instance.token && (
              <div className="font-mono text-xs text-blue-600/80 bg-blue-50/50 px-2 py-1.5 rounded-md border border-blue-200/50 min-w-0 overflow-hidden flex items-center">
                <a href={`${instance.endpoint?.replace(/^ws/, 'http') || ''}#token=${instance.token}`} target="_blank" rel="noreferrer" className="hover:text-blue-600 hover:underline flex items-center gap-1.5 min-w-0 w-full">
                  <span className="truncate">Web UI: {instance.endpoint}?token={instance.token.substring(0, 8)}...</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
            {instance.currentTask?.sessionKey && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/30 min-w-0 overflow-hidden">
                <MessageSquare className="h-3 w-3 text-violet-500 shrink-0" />
                <span className="text-[11px] text-violet-700 dark:text-violet-400 truncate">
                  {instance.currentTask.content?.slice(0, 60) || instance.currentTask.sessionKey.slice(0, 20)}
                </span>
              </div>
            )}
            {!instance.currentTask && activeSession && (
              <div className="flex items-center gap-1.5 mt-0.5 px-2 py-1.5 rounded-md bg-muted/30 border border-border/30 min-w-0 overflow-hidden">
                <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground truncate">
                  Session: <span className="font-medium text-foreground/70">{activeSession.topic || 'Active session'}</span>
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {instance.description && (
            <p className="text-sm text-muted-foreground mb-3">{instance.description}</p>
          )}

          {instance.role && instance.role.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {instance.role.capabilities.map((cap, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {cap}
                </Badge>
              ))}
            </div>
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
                <div className="flex items-center gap-1.5">
                  {instance.currentTask.status === 'running' && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      onClick={(e) => { e.stopPropagation(); cancelTask(instance.currentTask!.id); }}
                      title="Cancel task"
                    >
                      <XCircle className="h-3 w-3" />
                      Cancel
                    </button>
                  )}
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

      <SkillsManagerDialog
        instance={instance}
        open={skillsOpen}
        onOpenChange={setSkillsOpen}
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
