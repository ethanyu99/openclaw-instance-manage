import { useMemo } from 'react';
import type { ExecutionHistory } from '@/hooks/useInstanceManager';

type ExecutionTurnRecord = ExecutionHistory['turns'][number];
type ExecutionEdgeRecord = ExecutionHistory['edges'][number];

interface ExecutionGraphViewProps {
  execution: ExecutionHistory;
}

const ROLE_COLORS: Record<string, { bg: string; border: string; text: string }> = {};
const PALETTE = [
  { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' },
  { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700' },
  { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700' },
  { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700' },
  { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-700' },
  { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700' },
  { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700' },
];

function getRoleColors(role: string) {
  if (!ROLE_COLORS[role]) {
    ROLE_COLORS[role] = PALETTE[Object.keys(ROLE_COLORS).length % PALETTE.length];
  }
  return ROLE_COLORS[role];
}

const ACTION_STYLES: Record<string, { label: string; color: string }> = {
  delegate: { label: 'delegate', color: '#3b82f6' },
  report: { label: 'report', color: '#10b981' },
  feedback: { label: 'feedback', color: '#ef4444' },
  done: { label: 'done', color: '#8b5cf6' },
};

interface LayoutNode {
  id: string;
  turn: ExecutionTurnRecord;
  x: number;
  y: number;
}

function layoutGraph(turns: ExecutionTurnRecord[], edges: ExecutionEdgeRecord[]) {
  const NODE_W = 180;
  const NODE_H = 60;
  const H_GAP = 40;
  const V_GAP = 30;

  const childMap = new Map<string, string[]>();
  for (const e of edges) {
    const children = childMap.get(e.from) || [];
    children.push(e.to);
    childMap.set(e.from, children);
  }

  const parentMap = new Map<string, string>();
  for (const e of edges) {
    parentMap.set(e.to, e.from);
  }

  // Assign depth (BFS from root)
  const depthMap = new Map<string, number>();
  const roots = turns.filter(t => !parentMap.has(t.id));
  const queue = roots.map(r => ({ id: r.id, depth: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    depthMap.set(id, depth);
    const children = childMap.get(id) || [];
    for (const c of children) {
      if (!visited.has(c)) {
        queue.push({ id: c, depth: depth + 1 });
      }
    }
  }

  // Unvisited turns get sequential depth
  for (const t of turns) {
    if (!depthMap.has(t.id)) {
      depthMap.set(t.id, t.seq - 1);
    }
  }

  // Group by depth, assign horizontal position
  const byDepth = new Map<number, ExecutionTurnRecord[]>();
  for (const t of turns) {
    const d = depthMap.get(t.id) || 0;
    const arr = byDepth.get(d) || [];
    arr.push(t);
    byDepth.set(d, arr);
  }

  const nodes: LayoutNode[] = [];
  for (const [depth, group] of byDepth) {
    const totalWidth = group.length * NODE_W + (group.length - 1) * H_GAP;
    const startX = -totalWidth / 2 + NODE_W / 2;
    group.forEach((t, i) => {
      nodes.push({
        id: t.id,
        turn: t,
        x: startX + i * (NODE_W + H_GAP),
        y: depth * (NODE_H + V_GAP),
      });
    });
  }

  // Normalize positions to start at (0, 0)
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  for (const n of nodes) {
    n.x -= minX;
    n.y -= minY;
  }

  const maxX = Math.max(...nodes.map(n => n.x)) + NODE_W;
  const maxY = Math.max(...nodes.map(n => n.y)) + NODE_H;

  return { nodes, width: maxX, height: maxY, nodeW: NODE_W, nodeH: NODE_H };
}

export function ExecutionGraphView({ execution }: ExecutionGraphViewProps) {
  const { turns, edges } = execution;

  const layout = useMemo(() => layoutGraph(turns, edges), [turns, edges]);

  if (turns.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-xs text-muted-foreground">
        No turns recorded yet
      </div>
    );
  }

  const padding = 20;
  const svgW = layout.width + padding * 2;
  const svgH = layout.height + padding * 2;
  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));

  return (
    <div className="px-4 py-3 overflow-auto">
      <svg
        width={Math.max(svgW, 300)}
        height={Math.max(svgH, 100)}
        viewBox={`0 0 ${Math.max(svgW, 300)} ${Math.max(svgH, 100)}`}
        className="mx-auto"
      >
        <defs>
          <marker
            id="arrowDelegate"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L8,3 L0,6" fill="#3b82f6" />
          </marker>
          <marker
            id="arrowReport"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L8,3 L0,6" fill="#10b981" />
          </marker>
          <marker
            id="arrowFeedback"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L8,3 L0,6" fill="#ef4444" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const from = nodeMap.get(e.from);
          const to = nodeMap.get(e.to);
          if (!from || !to) return null;

          const x1 = padding + from.x + layout.nodeW / 2;
          const y1 = padding + from.y + layout.nodeH;
          const x2 = padding + to.x + layout.nodeW / 2;
          const y2 = padding + to.y;

          const style = ACTION_STYLES[e.actionType] || ACTION_STYLES.delegate;
          const markerId = `arrow${e.actionType.charAt(0).toUpperCase() + e.actionType.slice(1)}`;
          const isDashed = e.actionType === 'report' || e.actionType === 'feedback';

          const midY = (y1 + y2) / 2;

          return (
            <g key={i}>
              <path
                d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
                fill="none"
                stroke={style.color}
                strokeWidth={1.5}
                strokeDasharray={isDashed ? '4 3' : undefined}
                markerEnd={`url(#${markerId})`}
                opacity={0.7}
              />
              <text
                x={(x1 + x2) / 2}
                y={midY - 4}
                textAnchor="middle"
                className="text-[9px] fill-muted-foreground"
              >
                {style.label}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {layout.nodes.map(node => {
          getRoleColors(node.turn.role);
          const isRunning = node.turn.status === 'running';
          const isFailed = node.turn.status === 'failed';

          return (
            <g key={node.id}>
              <rect
                x={padding + node.x}
                y={padding + node.y}
                width={layout.nodeW}
                height={layout.nodeH}
                rx={8}
                className={`fill-card stroke-1 ${
                  isFailed ? 'stroke-red-400' : isRunning ? 'stroke-emerald-400' : 'stroke-border/60'
                }`}
                filter={isRunning ? undefined : undefined}
              />
              {isRunning && (
                <rect
                  x={padding + node.x}
                  y={padding + node.y}
                  width={layout.nodeW}
                  height={layout.nodeH}
                  rx={8}
                  fill="none"
                  className="stroke-emerald-400"
                  strokeWidth={2}
                  opacity={0.6}
                >
                  <animate
                    attributeName="opacity"
                    values="0.6;0.2;0.6"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              <text
                x={padding + node.x + 8}
                y={padding + node.y + 16}
                className="text-[10px] font-semibold fill-foreground"
              >
                T{node.turn.seq}
              </text>
              <text
                x={padding + node.x + layout.nodeW - 8}
                y={padding + node.y + 16}
                textAnchor="end"
                className={`text-[10px] font-semibold`}
                fill={isFailed ? '#ef4444' : isRunning ? '#10b981' : '#6b7280'}
              >
                {node.turn.role}
              </text>
              <text
                x={padding + node.x + 8}
                y={padding + node.y + 34}
                className="text-[9px] fill-muted-foreground"
              >
                {node.turn.task.slice(0, 22)}{node.turn.task.length > 22 ? '...' : ''}
              </text>
              {node.turn.durationMs != null && (
                <text
                  x={padding + node.x + 8}
                  y={padding + node.y + 50}
                  className="text-[8px] fill-muted-foreground/50"
                >
                  {(node.turn.durationMs / 1000).toFixed(1)}s
                </text>
              )}
              {node.turn.actionType && (
                <text
                  x={padding + node.x + layout.nodeW - 8}
                  y={padding + node.y + 50}
                  textAnchor="end"
                  className="text-[8px]"
                  fill={ACTION_STYLES[node.turn.actionType]?.color || '#6b7280'}
                >
                  {node.turn.actionType}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
