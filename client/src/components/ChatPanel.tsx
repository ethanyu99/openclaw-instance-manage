import { useEffect, useRef } from 'react';
import { XCircle, Loader2 } from 'lucide-react';
import type { InstancePublic } from '@shared/types';
import { useWSStore } from '@/stores/wsStore';

interface ChatPanelProps {
  instances: InstancePublic[];
  taskStreams: Record<string, string>;
}

function InstanceStream({ instance, stream }: { instance: InstancePublic; stream?: string }) {
  const cancelTask = useWSStore(s => s.cancelTask);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stream, instance.currentTask?.summary]);

  const task = instance.currentTask;
  const isRunning = task?.status === 'running';
  const isDone = task?.status === 'completed';
  const isFailed = task?.status === 'failed' || task?.status === 'cancelled';

  return (
    <div className="flex flex-col min-w-0 flex-1 h-full border border-border/40 dark:border-border/20 rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 dark:bg-muted/10 border-b border-border/30 dark:border-border/15 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            isRunning ? 'bg-amber-500 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.5)]' :
            isDone ? 'bg-emerald-500' :
            isFailed ? 'bg-red-500' : 'bg-zinc-400'
          }`} />
          <span className="text-xs font-semibold text-foreground truncate">{instance.name}</span>
          {task && (
            <span className={`text-[9px] uppercase tracking-widest font-bold ${
              isRunning ? 'text-amber-600 dark:text-amber-400' :
              isDone ? 'text-emerald-600 dark:text-emerald-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {task.status}
            </span>
          )}
        </div>
        {isRunning && task && (
          <button
            type="button"
            className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 shrink-0"
            onClick={() => cancelTask(task.id)}
          >
            <XCircle className="h-3 w-3" />
            Cancel
          </button>
        )}
      </div>

      {/* Task content */}
      {task?.content && (
        <div className="px-3 py-1.5 border-b border-border/20 dark:border-border/10 bg-muted/10 dark:bg-muted/5 shrink-0">
          <p className="text-xs text-foreground/80 font-mono truncate">
            <span className="text-muted-foreground/50 mr-1">$</span>
            {task.content}
          </p>
        </div>
      )}

      {/* Stream output */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto bg-[#0d1117] dark:bg-[#010409] p-2.5"
      >
        {stream ? (
          <pre className="text-emerald-300 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
            {stream.slice(-3000)}
          </pre>
        ) : isRunning ? (
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-mono py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for output...
          </div>
        ) : (
          <div className="text-zinc-400 text-xs font-mono py-2 leading-relaxed">
            {task?.summary || 'No output'}
          </div>
        )}

        {/* Summary after stream */}
        {task?.summary && stream && (
          <div className="mt-2 pt-2 border-t border-[#30363d] text-xs text-zinc-400 font-mono leading-relaxed">
            <span className="text-zinc-600">// </span>
            {task.summary}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({ instances, taskStreams }: ChatPanelProps) {
  if (instances.length === 0) return null;

  return (
    <div className={`flex gap-2 w-full h-full ${instances.length === 1 ? '' : 'overflow-x-auto'}`}>
      {instances.map(inst => (
        <div
          key={inst.id}
          className={`h-full ${instances.length === 1 ? 'w-full' : 'min-w-[320px] flex-1'}`}
          style={instances.length > 1 ? { maxWidth: `${Math.max(100 / instances.length, 33)}%` } : undefined}
        >
          <InstanceStream
            instance={inst}
            stream={taskStreams[inst.id]}
          />
        </div>
      ))}
    </div>
  );
}
