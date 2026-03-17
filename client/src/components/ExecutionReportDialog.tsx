import { useState, type ComponentProps } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ChevronDown,
  ChevronRight,
  Users,
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  BarChart3,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ExecutionHistory } from '@/hooks/types';

type ExecutionTurnRecord = ExecutionHistory['turns'][number];

interface ExecutionReportDialogProps {
  execution: ExecutionHistory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const markdownComponents: ComponentProps<typeof ReactMarkdown>['components'] = {
  pre: ({ children }) => (
    <pre className="not-prose overflow-x-auto rounded-md bg-zinc-900 p-3 text-[13px] leading-relaxed text-zinc-100 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    if (className?.startsWith('language-')) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-[13px] dark:bg-zinc-700">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-[13px]
      prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-sm
      prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
      prose-p:my-1.5 prose-p:leading-relaxed prose-p:text-[13px]
      prose-ul:my-1.5 prose-ol:my-1.5
      prose-li:my-0.5 prose-li:text-[13px]
      prose-hr:my-3
      prose-strong:text-[13px]"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

const STATUS_CONFIG = {
  completed: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Completed', icon: CheckCircle2 },
  failed: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Failed', icon: XCircle },
  timeout: { color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Timeout', icon: AlertTriangle },
  running: { color: 'bg-muted/50 text-foreground border-border animate-pulse', label: 'Running', icon: Clock },
  cancelled: { color: 'bg-zinc-50 text-zinc-700 border-zinc-200', label: 'Cancelled', icon: XCircle },
} as const;

const TURN_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  running: { icon: Clock, color: 'text-blue-500 animate-pulse', label: 'Running' },
  pending: { icon: Clock, color: 'text-zinc-400', label: 'Pending' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem}s`;
}

function TurnCard({ turn, defaultExpanded }: { turn: ExecutionTurnRecord; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const config = TURN_STATUS_CONFIG[turn.status] || TURN_STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <StatusIcon className={`h-4 w-4 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
            T{turn.seq}
          </Badge>
          <span className="text-sm font-semibold truncate">{turn.role}</span>
          {turn.actionType && (
            <span className="text-[10px] text-muted-foreground truncate">
              → {turn.actionSummary?.slice(0, 40) || turn.actionType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {turn.durationMs != null && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatDuration(turn.durationMs)}
            </span>
          )}
          {turn.tokenUsage && (turn.tokenUsage.prompt > 0 || turn.tokenUsage.completion > 0) && (
            <span className="text-[10px] text-muted-foreground/70 font-mono">
              {(turn.tokenUsage.prompt + turn.tokenUsage.completion).toLocaleString()}t
            </span>
          )}
          <Badge
            variant={turn.status === 'completed' ? 'secondary' : turn.status === 'failed' ? 'destructive' : 'outline'}
            className="text-[10px] shrink-0"
          >
            {config.label}
          </Badge>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40">
          {turn.task && (
            <div className="px-4 py-2.5 bg-muted/20 border-b border-border/30 min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Task</p>
              <p className="text-xs text-foreground/90 break-words whitespace-pre-wrap line-clamp-4">{turn.task}</p>
            </div>
          )}
          {turn.output ? (
            <div className="px-4 py-3 max-h-[50vh] min-h-[80px] overflow-y-auto overflow-x-hidden">
              <MarkdownContent content={turn.output} />
            </div>
          ) : (
            <div className="px-4 py-4 text-xs text-muted-foreground text-center">
              No output
            </div>
          )}
          {(turn.startedAt || turn.completedAt) && (
            <div className="px-4 py-2 bg-muted/10 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
              {turn.startedAt && <span>Start: {new Date(turn.startedAt).toLocaleTimeString([], { hour12: false })}</span>}
              {turn.completedAt && <span>End: {new Date(turn.completedAt).toLocaleTimeString([], { hour12: false })}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function findLeadFinalOutput(execution: ExecutionHistory): string {
  const completedTurns = execution.turns.filter(t => t.status === 'completed');
  for (let i = completedTurns.length - 1; i >= 0; i--) {
    const t = completedTurns[i];
    if (t.output && t.output.length > 100) {
      return t.output;
    }
  }
  return completedTurns[completedTurns.length - 1]?.output || '';
}

export function ExecutionReportDialog({ execution, open, onOpenChange }: ExecutionReportDialogProps) {
  if (!execution) return null;

  const statusCfg = STATUS_CONFIG[execution.status] || STATUS_CONFIG.running;
  const StatusIcon = statusCfg.icon;
  const completedTurns = execution.turns.filter(t => t.status === 'completed').length;
  const totalDuration = execution.completedAt
    ? Math.round((new Date(execution.completedAt).getTime() - new Date(execution.createdAt).getTime()) / 1000)
    : null;

  const reportSource = execution.summary
    ? (execution.summary.length >= (findLeadFinalOutput(execution) || '').length ? execution.summary : findLeadFinalOutput(execution))
    : findLeadFinalOutput(execution);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                {execution.teamName || 'Team Execution'}
                <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusCfg.label}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                {completedTurns}/{execution.turns.length}  turns completed
                {totalDuration != null && (
                  <>
                    <span className="mx-2 opacity-50">|</span>
                    Duration {totalDuration}s
                  </>
                )}
                <span className="mx-2 opacity-50">|</span>
                {new Date(execution.createdAt).toLocaleString()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {/* Goal */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/40">
              <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Goal</p>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{execution.goal}</p>
              </div>
            </div>

            {/* Report / Summary */}
            {reportSource && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Report
                </p>
                <div className="border border-border/50 rounded-lg p-4 bg-card max-h-[40vh] overflow-y-auto">
                  <MarkdownContent content={reportSource} />
                </div>
              </div>
            )}

            {/* Metrics summary */}
            {execution.metrics && (
              <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>{execution.metrics.totalTurns} turns</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDuration(execution.metrics.totalDurationMs)}</span>
                </div>
                {execution.metrics.maxDepthReached > 0 && (
                  <span>Max depth {execution.metrics.maxDepthReached}</span>
                )}
                {execution.metrics.feedbackCycles > 0 && (
                  <span>{execution.metrics.feedbackCycles} feedback cycles</span>
                )}
                {execution.metrics.avgTurnDurationMs > 0 && (
                  <span>Avg {formatDuration(execution.metrics.avgTurnDurationMs)}/turn</span>
                )}
                {(execution.metrics.tokenUsage.prompt > 0 || execution.metrics.tokenUsage.completion > 0) && (
                  <span>Tokens: {(execution.metrics.tokenUsage.prompt + execution.metrics.tokenUsage.completion).toLocaleString()} ({execution.metrics.tokenUsage.prompt.toLocaleString()} in / {execution.metrics.tokenUsage.completion.toLocaleString()} out)</span>
                )}
              </div>
            )}

            <Separator />

            {/* Turn details */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Execution Details ({execution.turns.length} turns)
              </p>
              <div className="space-y-2">
                {execution.turns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No execution records</p>
                ) : (
                  execution.turns.map(turn => (
                    <TurnCard
                      key={turn.id}
                      turn={turn}
                      defaultExpanded={execution.turns.length <= 3}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <div className="flex items-center gap-3">
            {execution.metrics && (
              <>
                {Object.entries(execution.metrics.turnsByRole).map(([role, count]) => (
                  <span key={role}>{role}: {count}</span>
                ))}
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
