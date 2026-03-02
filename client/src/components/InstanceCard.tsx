import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, Cloud } from 'lucide-react';
import type { InstancePublic } from '@shared/types';
import { deleteInstance, checkHealth } from '@/lib/api';
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

  const [deleting, setDeleting] = useState(false);

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
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
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
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive text-muted-foreground" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <CardDescription className="font-mono text-xs truncate mt-1.5 text-muted-foreground/80 bg-muted/50 px-2 py-1 rounded-md border border-border/50 inline-block w-fit max-w-full">
            {instance.endpoint}
          </CardDescription>
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
    </>
  );
}
