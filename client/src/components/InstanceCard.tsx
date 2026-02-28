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
      <Card className="hover:border-primary/30 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor[instance.status]}`} />
              <CardTitle className="text-base">{instance.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              {instance.sandboxId && (
                <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-300">
                  <Cloud className="h-3 w-3" />
                  Sandbox
                </Badge>
              )}
              <Badge variant={statusBadgeVariant[instance.status]} className="text-xs">
                {instance.status}
              </Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleHealth}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <CardDescription className="font-mono text-xs truncate">
            {instance.endpoint}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {instance.description && (
            <p className="text-sm text-muted-foreground mb-2">{instance.description}</p>
          )}

          {instance.currentTask && (
            <div
              className="rounded-md bg-muted p-2.5 text-sm space-y-1.5 cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={handleTaskClick}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs">Current Task</span>
                <Badge
                  variant={
                    instance.currentTask.status === 'running'
                      ? 'default'
                      : instance.currentTask.status === 'completed'
                      ? 'secondary'
                      : 'destructive'
                  }
                  className="text-xs"
                >
                  {instance.currentTask.status}
                </Badge>
              </div>
              <p className="text-xs text-foreground border-l-2 border-primary/40 pl-2 truncate" title={instance.currentTask.content}>
                {instance.currentTask.content}
              </p>
              {instance.currentTask.summary && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {instance.currentTask.summary}
                </p>
              )}
            </div>
          )}

          {taskStream && (
            <div className="mt-2 rounded-md bg-zinc-950 text-emerald-400 p-2.5 font-mono text-xs max-h-32 overflow-y-auto">
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
