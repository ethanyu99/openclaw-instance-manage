import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw } from 'lucide-react';
import type { Instance } from '@shared/types';
import { deleteInstance, checkHealth } from '@/lib/api';

interface InstanceCardProps {
  instance: Instance;
  taskStream?: string;
  onRefresh: () => void;
  onSelect: (instance: Instance) => void;
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

export function InstanceCard({ instance, taskStream, onRefresh, onSelect }: InstanceCardProps) {
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete instance "${instance.name}"?`)) return;
    await deleteInstance(instance.id);
    onRefresh();
  };

  const handleHealth = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await checkHealth(instance.id);
    onRefresh();
  };

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors"
      onClick={() => onSelect(instance)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor[instance.status]}`} />
            <CardTitle className="text-base">{instance.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={statusBadgeVariant[instance.status]} className="text-xs">
              {instance.status}
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleHealth}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete}>
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
          <div className="rounded-md bg-muted p-2.5 text-sm space-y-1">
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
            <p className="text-xs text-muted-foreground truncate">
              {instance.currentTask.content}
            </p>
            {instance.currentTask.summary && (
              <p className="text-xs text-foreground/80 line-clamp-2">
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
  );
}
