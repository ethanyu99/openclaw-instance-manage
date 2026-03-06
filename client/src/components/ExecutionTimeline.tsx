import { useMemo } from 'react';
import type { ExecutionHistory } from '@/hooks/useInstanceManager';

interface ExecutionTimelineProps {
  execution: ExecutionHistory;
}

const LANE_COLORS = [
  { bg: 'bg-blue-100/60', border: 'border-blue-300', bar: 'bg-blue-400', text: 'text-blue-700' },
  { bg: 'bg-violet-100/60', border: 'border-violet-300', bar: 'bg-violet-400', text: 'text-violet-700' },
  { bg: 'bg-emerald-100/60', border: 'border-emerald-300', bar: 'bg-emerald-400', text: 'text-emerald-700' },
  { bg: 'bg-amber-100/60', border: 'border-amber-300', bar: 'bg-amber-400', text: 'text-amber-700' },
  { bg: 'bg-rose-100/60', border: 'border-rose-300', bar: 'bg-rose-400', text: 'text-rose-700' },
  { bg: 'bg-cyan-100/60', border: 'border-cyan-300', bar: 'bg-cyan-400', text: 'text-cyan-700' },
];

const ACTION_SYMBOLS: Record<string, string> = {
  delegate: '\u2192',
  report: '\u2191',
  feedback: '\u21BA',
  done: '\u2713',
};

export function ExecutionTimeline({ execution }: ExecutionTimelineProps) {
  const { turns, edges } = execution;

  const roles = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of turns) {
      if (!seen.has(t.role)) {
        seen.set(t.role, seen.size);
      }
    }
    return Array.from(seen.keys());
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-xs text-muted-foreground">
        No turns recorded yet
      </div>
    );
  }

  const LANE_W = 160;
  const ROW_H = 44;
  const edgeMap = new Map<string, { from: string; actionType: string }>();
  for (const e of edges) {
    edgeMap.set(e.to, { from: e.from, actionType: e.actionType });
  }

  return (
    <div className="overflow-auto px-2 py-3">
      <div className="relative" style={{ minWidth: roles.length * LANE_W + 60 }}>
        {/* Lane headers */}
        <div className="flex sticky top-0 bg-card/95 backdrop-blur z-10 border-b border-border/30">
          <div className="w-[60px] shrink-0" />
          {roles.map((role, i) => {
            const colors = LANE_COLORS[i % LANE_COLORS.length];
            return (
              <div
                key={role}
                className={`flex items-center justify-center h-8 ${colors.text} font-semibold text-[11px] tracking-tight`}
                style={{ width: LANE_W }}
              >
                {role}
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {turns.map((turn, i) => {
          const laneIdx = roles.indexOf(turn.role);
          const colors = LANE_COLORS[laneIdx % LANE_COLORS.length];
          const isRunning = turn.status === 'running';
          const isFailed = turn.status === 'failed';
          const edge = edgeMap.get(turn.id);

          return (
            <div key={turn.id} className="flex items-center relative group" style={{ height: ROW_H }}>
              {/* Seq label */}
              <div className="w-[60px] shrink-0 text-right pr-3">
                <span className="text-[10px] text-muted-foreground/60 font-mono">T{turn.seq}</span>
              </div>

              {/* Lane backgrounds */}
              {roles.map((role) => (
                <div
                  key={role}
                  className="border-r border-border/20"
                  style={{ width: LANE_W, height: ROW_H }}
                />
              ))}

              {/* Turn block (positioned in the correct lane) */}
              <div
                className={`absolute flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] transition-all ${
                  isFailed
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : isRunning
                      ? `${colors.bg} ${colors.border} ${colors.text} ring-1 ring-emerald-300/50`
                      : `${colors.bg} ${colors.border} ${colors.text}`
                }`}
                style={{
                  left: 60 + laneIdx * LANE_W + 8,
                  width: LANE_W - 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                <span className="font-semibold shrink-0">{turn.role}</span>
                <span className="truncate flex-1 opacity-75">{turn.task.slice(0, 20)}</span>
                {turn.actionType && (
                  <span className="shrink-0 font-mono opacity-60">
                    {ACTION_SYMBOLS[turn.actionType] || turn.actionType}
                  </span>
                )}
                {isRunning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                )}
              </div>

              {/* Edge arrow: connect from previous turn's lane to this turn's lane */}
              {edge && (() => {
                const fromTurn = turns.find(t => t.id === edge.from);
                if (!fromTurn) return null;
                const fromLane = roles.indexOf(fromTurn.role);
                const fromRow = turns.indexOf(fromTurn);
                if (fromLane === laneIdx && fromRow === i - 1) return null; // Same lane, adjacent — skip arrow

                const x1 = 60 + fromLane * LANE_W + LANE_W / 2;
                const x2 = 60 + laneIdx * LANE_W + LANE_W / 2;

                if (x1 === x2) return null;

                return (
                  <svg
                    className="absolute pointer-events-none"
                    style={{
                      left: 0,
                      top: -ROW_H / 2,
                      width: '100%',
                      height: ROW_H,
                    }}
                  >
                    <line
                      x1={x1}
                      y1={0}
                      x2={x2}
                      y2={ROW_H}
                      stroke={
                        edge.actionType === 'feedback' ? '#ef4444'
                          : edge.actionType === 'report' ? '#10b981'
                            : '#3b82f6'
                      }
                      strokeWidth={1}
                      strokeDasharray={edge.actionType === 'report' || edge.actionType === 'feedback' ? '3 2' : undefined}
                      opacity={0.5}
                    />
                  </svg>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
