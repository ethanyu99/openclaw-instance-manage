import { useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { XCircle, Loader2 } from 'lucide-react';
import type { InstancePublic } from '@shared/types';
import { useWSStore } from '@/stores/wsStore';

interface RunningTasksDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: InstancePublic[];
  taskStreams: Record<string, string>;
}

function StreamBlock({ instance, stream }: { instance: InstancePublic; stream?: string }) {
  const cancelTask = useWSStore(s => s.cancelTask);
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stream]);

  const task = instance.currentTask;
  if (!task) return null;

  return (
    <div className="border border-border/50 dark:border-border/30 rounded-lg overflow-hidden bg-card">
      {/* Instance header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 dark:bg-muted/10 border-b border-border/40 dark:border-border/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.5)] shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">{instance.name}</span>
          <span className="text-[10px] uppercase tracking-widest font-bold text-amber-600 dark:text-amber-400">
            Running
          </span>
        </div>
        <button
          type="button"
          className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
          onClick={() => cancelTask(task.id)}
        >
          <XCircle className="h-3 w-3" />
          Cancel
        </button>
      </div>

      {/* Task content */}
      <div className="px-3 py-2 border-b border-border/30 dark:border-border/15">
        <p className="text-[11px] text-foreground font-mono truncate" title={task.content}>
          <span className="text-muted-foreground/60 mr-1.5">$</span>
          {task.content}
        </p>
        {task.summary && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{task.summary}</p>
        )}
      </div>

      {/* Stream output */}
      <pre
        ref={scrollRef}
        className="px-3 py-2 bg-[#0d1117] dark:bg-[#010409] text-emerald-400 font-mono text-[11px] leading-[1.6] max-h-48 min-h-[80px] overflow-y-auto whitespace-pre-wrap break-words"
      >
        {stream ? stream.slice(-2000) : (
          <span className="text-muted-foreground/40 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for output...
          </span>
        )}
      </pre>
    </div>
  );
}

export function RunningTasksDrawer({ open, onOpenChange, instances, taskStreams }: RunningTasksDrawerProps) {
  const busyInstances = instances.filter(i => i.status === 'busy' && i.currentTask);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] sm:w-[560px] p-0 flex flex-col bg-background border-border/60">
        <SheetHeader className="px-4 py-3 border-b border-border/40 dark:border-border/20 shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
              Running Tasks
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 dark:bg-muted/30 px-1.5 py-0.5 rounded">
                {busyInstances.length}
              </span>
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {busyInstances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-xs text-muted-foreground/50 font-mono">No running tasks</p>
            </div>
          ) : (
            busyInstances.map(inst => (
              <StreamBlock
                key={inst.id}
                instance={inst}
                stream={taskStreams[inst.id]}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
