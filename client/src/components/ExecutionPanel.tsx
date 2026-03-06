import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, ChevronUp, ChevronDown, GitBranch, Clock, BarChart3, StopCircle } from 'lucide-react';
import type { ExecutionHistory } from '@/hooks/useInstanceManager';
import { ExecutionGraphView } from './ExecutionGraphView';
import { ExecutionTimeline } from './ExecutionTimeline';
import { ExecutionMetricsPanel } from './ExecutionMetricsPanel';

interface ExecutionPanelProps {
  logs: Array<{
    executionId: string;
    message: string;
    type: string;
    timestamp: string;
    turnId?: string;
    role?: string;
  }>;
  streams: Record<string, string>;
  activeExecution: ExecutionHistory | null;
  latestExecution?: ExecutionHistory;
  onClear: () => void;
  onCancelExecution?: (executionId: string) => void;
  onViewDetail: (exec: ExecutionHistory) => void;
}

type PanelView = 'log' | 'graph' | 'timeline' | 'metrics';

const ROLE_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  'text-blue-600',
  'text-violet-600',
  'text-emerald-600',
  'text-amber-600',
  'text-rose-600',
  'text-cyan-600',
  'text-pink-600',
  'text-teal-600',
];

function getRoleColor(role: string): string {
  if (!ROLE_COLORS[role]) {
    ROLE_COLORS[role] = COLOR_PALETTE[Object.keys(ROLE_COLORS).length % COLOR_PALETTE.length];
  }
  return ROLE_COLORS[role];
}

export function ExecutionPanel({
  logs,
  streams,
  activeExecution,
  latestExecution,
  onClear,
  onCancelExecution,
  onViewDetail,
}: ExecutionPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [view, setView] = useState<PanelView>('log');
  const [stopping, setStopping] = useState(false);

  const lastLog = logs[logs.length - 1];
  const isDone = lastLog?.type === 'execution:completed' ||
    lastLog?.type === 'execution:timeout' ||
    lastLog?.type === 'execution:cancelled' ||
    lastLog?.type === 'team:error';

  useEffect(() => {
    if (isDone) setStopping(false);
  }, [isDone]);

  const execution = activeExecution || latestExecution || null;

  return (
    <div className="border-t border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-[0_-2px_12px_-4px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="px-6 py-2 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Execution
          </span>
          {!isDone && stopping && (
            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200 animate-pulse">
              Stopping…
            </Badge>
          )}
          {!isDone && !stopping && (
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200 animate-pulse">
              Running
            </Badge>
          )}
          {isDone && lastLog?.type === 'execution:completed' && (
            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">
              Completed
            </Badge>
          )}
          {isDone && lastLog?.type === 'execution:timeout' && (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">
              Timeout
            </Badge>
          )}
          {isDone && lastLog?.type === 'execution:cancelled' && (
            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">
              Cancelled
            </Badge>
          )}
          {execution && (
            <span className="text-[10px] text-muted-foreground">
              {execution.turns.length} turns
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* View tabs */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5 mr-2">
            {([
              { id: 'log', icon: null, label: 'Log' },
              { id: 'graph', icon: GitBranch, label: 'Graph' },
              { id: 'timeline', icon: Clock, label: 'Timeline' },
              { id: 'metrics', icon: BarChart3, label: 'Metrics' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1 ${
                  view === tab.id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setView(tab.id)}
              >
                {tab.icon && <tab.icon className="h-3 w-3" />}
                {tab.label}
              </button>
            ))}
          </div>
          {!isDone && activeExecution && onCancelExecution && (
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 text-[10px] ${stopping
                ? 'text-red-400 cursor-not-allowed'
                : 'text-red-600 hover:text-red-700 hover:bg-red-50'
              }`}
              disabled={stopping}
              onClick={() => {
                setStopping(true);
                onCancelExecution(activeExecution.id);
              }}
            >
              <StopCircle className={`h-3 w-3 mr-1 ${stopping ? 'animate-spin' : ''}`} />
              {stopping ? 'Stopping…' : 'Stop'}
            </Button>
          )}
          {isDone && latestExecution && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-primary"
              onClick={() => onViewDetail(latestExecution)}
            >
              Detail
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </Button>
          {isDone && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onClear}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="max-h-72 overflow-y-auto">
          {view === 'log' && (
            <div className="px-6 py-3 space-y-1">
              {logs.slice(-30).map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground/50 shrink-0 font-mono text-[10px] w-16 text-right">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  {log.role && (
                    <span className={`shrink-0 font-semibold ${getRoleColor(log.role)}`}>
                      [{log.role}]
                    </span>
                  )}
                  <span className="text-foreground/80">{log.message}</span>
                </div>
              ))}
              {/* Active streaming turns */}
              {Object.entries(streams).map(([turnId, content]) => (
                <div key={turnId} className="ml-20 text-xs text-muted-foreground/60 truncate max-w-xl">
                  {content.slice(-120)}
                </div>
              ))}
            </div>
          )}

          {view === 'graph' && execution && (
            <ExecutionGraphView execution={execution} />
          )}

          {view === 'timeline' && execution && (
            <ExecutionTimeline execution={execution} />
          )}

          {view === 'metrics' && execution && (
            <ExecutionMetricsPanel execution={execution} />
          )}

          {(view === 'graph' || view === 'timeline' || view === 'metrics') && !execution && (
            <div className="px-6 py-8 text-center text-xs text-muted-foreground">
              No execution data available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
