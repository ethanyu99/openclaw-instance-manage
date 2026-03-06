import { useMemo } from 'react';
import type { ExecutionHistory } from '@/hooks/useInstanceManager';

interface ExecutionMetricsPanelProps {
  execution: ExecutionHistory;
}

export function ExecutionMetricsPanel({ execution }: ExecutionMetricsPanelProps) {
  const metrics = useMemo(() => {
    if (execution.metrics) return execution.metrics;

    const completed = execution.turns.filter(t => t.status === 'completed');
    const turnsByRole: Record<string, number> = {};
    let maxDepth = 0;
    let feedbackCycles = 0;
    let totalTurnDuration = 0;

    for (const t of completed) {
      turnsByRole[t.role] = (turnsByRole[t.role] || 0) + 1;
      if (t.depth > maxDepth) maxDepth = t.depth;
      if (t.actionType === 'feedback') feedbackCycles++;
      if (t.durationMs) totalTurnDuration += t.durationMs;
    }

    const totalDurationMs = execution.completedAt
      ? new Date(execution.completedAt).getTime() - new Date(execution.createdAt).getTime()
      : Date.now() - new Date(execution.createdAt).getTime();

    return {
      totalTurns: completed.length,
      totalDurationMs,
      turnsByRole,
      maxDepthReached: maxDepth,
      feedbackCycles,
      avgTurnDurationMs: completed.length > 0 ? totalTurnDuration / completed.length : 0,
      tokenUsage: { prompt: 0, completion: 0 },
    };
  }, [execution]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}min`;
  };

  const roleEntries = Object.entries(metrics.turnsByRole).sort((a, b) => b[1] - a[1]);
  const maxRoleCount = Math.max(...roleEntries.map(([, v]) => v), 1);

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Total Turns"
          value={String(metrics.totalTurns)}
        />
        <MetricCard
          label="Duration"
          value={formatDuration(metrics.totalDurationMs)}
        />
        <MetricCard
          label="Max Depth"
          value={String(metrics.maxDepthReached)}
        />
        <MetricCard
          label="Feedback Loops"
          value={String(metrics.feedbackCycles)}
          highlight={metrics.feedbackCycles > 0}
        />
      </div>

      {/* Turns by role bar chart */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Turns by Role
        </h4>
        <div className="space-y-1.5">
          {roleEntries.map(([role, count]) => (
            <div key={role} className="flex items-center gap-2">
              <span className="text-xs font-medium w-24 truncate text-right">{role}</span>
              <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-sm transition-all duration-500 flex items-center pl-1.5"
                  style={{ width: `${(count / maxRoleCount) * 100}%` }}
                >
                  <span className="text-[10px] font-semibold text-primary-foreground">{count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Turn durations */}
      {execution.turns.some(t => t.durationMs != null) && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Turn Durations
          </h4>
          <div className="flex items-end gap-0.5 h-16">
            {execution.turns
              .filter(t => t.status === 'completed' && t.durationMs != null)
              .map(t => {
                const maxDur = Math.max(
                  ...execution.turns.filter(tt => tt.durationMs != null).map(tt => tt.durationMs!),
                  1,
                );
                const pct = ((t.durationMs || 0) / maxDur) * 100;
                return (
                  <div
                    key={t.id}
                    className="flex-1 min-w-[4px] max-w-[20px] bg-primary/40 rounded-t-sm hover:bg-primary/60 transition-colors relative group cursor-default"
                    style={{ height: `${Math.max(pct, 5)}%` }}
                    title={`T${t.seq} (${t.role}): ${formatDuration(t.durationMs || 0)}`}
                  >
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[8px] text-muted-foreground bg-card border border-border rounded px-1 py-0.5 shadow-sm pointer-events-none z-10">
                      T{t.seq} {formatDuration(t.durationMs || 0)}
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="flex items-center justify-between mt-1 text-[9px] text-muted-foreground/50">
            <span>T1</span>
            <span>Avg: {formatDuration(metrics.avgTurnDurationMs || 0)}</span>
            <span>T{execution.turns.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 text-center">
      <div className={`text-lg font-bold tracking-tight ${highlight ? 'text-amber-600' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  );
}
