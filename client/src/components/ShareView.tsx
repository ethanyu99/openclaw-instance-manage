import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Clock, Users, Star, AlertCircle, Loader2 } from 'lucide-react';
import { fetchShareView, createShareWebSocket } from '@/lib/api';
import { TaskInput } from '@/components/TaskInput';
import { ExecutionPanel } from '@/components/ExecutionPanel';
import type { ShareViewData, InstancePublic, TeamPublic, WSMessage, TurnSummary } from '@shared/types';
import type { ExecutionHistory } from '@/hooks/useInstanceManager';

type ExecutionTurnRecord = ExecutionHistory['turns'][number];
type ExecutionEdgeRecord = ExecutionHistory['edges'][number];

interface ShareViewProps {
  token: string;
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

function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `${days}d ${remainHours}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ShareView({ token }: ShareViewProps) {
  const [data, setData] = useState<ShareViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [instances, setInstances] = useState<InstancePublic[]>([]);
  const [taskStreams, setTaskStreams] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const [executionLogs, setExecutionLogs] = useState<Array<{
    executionId: string;
    message: string;
    type: string;
    timestamp: string;
    turnId?: string;
    role?: string;
  }>>([]);
  const [executionStreams, setExecutionStreams] = useState<Record<string, string>>({});
  const activeExecutionRef = useRef<ExecutionHistory | null>(null);
  const [activeExecutionSnapshot, setActiveExecutionSnapshot] = useState<ExecutionHistory | null>(null);

  const loadShareData = useCallback(async () => {
    try {
      const result = await fetchShareView(token);
      setData(result);
      setInstances(result.instances || []);
      setTimeRemaining(formatTimeRemaining(result.expiresAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared content');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadShareData();
  }, [loadShareData]);

  // WebSocket for real-time updates + task dispatching
  useEffect(() => {
    if (!data) return;

    const ws = createShareWebSocket(token, (msg: WSMessage) => {
      if (msg.type === 'instance:status') {
        const payload = msg.payload;
        if (payload.instances) {
          setInstances(payload.instances);
        } else if (payload.instanceId && payload.status) {
          setInstances(prev =>
            prev.map(i =>
              i.id === payload.instanceId ? { ...i, status: payload.status } : i
            )
          );
        }
      }

      if (msg.type === 'task:status' && msg.instanceId) {
        setInstances(prev =>
          prev.map(i =>
            i.id === msg.instanceId
              ? { ...i, currentTask: msg.payload, status: msg.payload.status === 'running' ? 'busy' : i.status }
              : i
          )
        );
      }

      if (msg.type === 'task:stream' && msg.instanceId) {
        const { chunk } = msg.payload;
        setTaskStreams(prev => ({
          ...prev,
          [msg.instanceId!]: (prev[msg.instanceId!] || '') + chunk,
        }));
      }

      if (msg.type === 'task:complete' && msg.instanceId) {
        setInstances(prev =>
          prev.map(i =>
            i.id === msg.instanceId
              ? {
                  ...i,
                  status: 'online',
                  currentTask: i.currentTask
                    ? { ...i.currentTask, status: 'completed', summary: msg.payload.summary }
                    : undefined,
                }
              : i
          )
        );
        setTaskStreams(prev => {
          const next = { ...prev };
          delete next[msg.instanceId!];
          return next;
        });
      }

      if (msg.type === 'task:error' && msg.instanceId) {
        setInstances(prev =>
          prev.map(i =>
            i.id === msg.instanceId
              ? {
                  ...i,
                  status: 'online',
                  currentTask: i.currentTask
                    ? { ...i.currentTask, status: 'failed', summary: msg.payload.error }
                    : undefined,
                }
              : i
          )
        );
        setTaskStreams(prev => {
          const next = { ...prev };
          delete next[msg.instanceId!];
          return next;
        });
      }

      if (msg.type === 'execution:started') {
        const execId = msg.payload.executionId;
        activeExecutionRef.current = {
          id: execId,
          teamId: msg.payload.teamId || msg.teamId || '',
          teamName: msg.payload.teamName || '',
          goal: msg.payload.goal || '',
          turns: [],
          edges: [],
          status: 'running',
          createdAt: msg.timestamp,
        };
        setActiveExecutionSnapshot({ ...activeExecutionRef.current });
        setExecutionLogs(prev => [...prev, {
          executionId: execId,
          message: `Execution started: ${msg.payload.goal}`,
          type: 'execution:started',
          timestamp: msg.timestamp,
        }]);
      }

      if (msg.type === 'execution:turn_start') {
        const turn = msg.payload.turn as TurnSummary;
        if (activeExecutionRef.current) {
          const existing = activeExecutionRef.current.turns.find((t: ExecutionTurnRecord) => t.id === turn.id);
          if (!existing) {
            activeExecutionRef.current.turns.push({
              id: turn.id,
              seq: turn.seq,
              role: turn.role,
              instanceId: turn.instanceId,
              task: turn.task,
              output: '',
              status: 'running',
              depth: turn.depth,
              parentTurnId: turn.parentTurnId,
              startedAt: msg.timestamp,
            });
          }
          setActiveExecutionSnapshot({ ...activeExecutionRef.current, turns: [...activeExecutionRef.current.turns] });
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: msg.payload.message || `Turn ${turn.seq}: ${turn.role} started`,
          type: 'execution:turn_start',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        }]);
      }

      if (msg.type === 'execution:turn_stream') {
        const { turnId, chunk } = msg.payload;
        setExecutionStreams(prev => ({
          ...prev,
          [turnId]: (prev[turnId] || '') + chunk,
        }));
        if (activeExecutionRef.current) {
          const turnRec = activeExecutionRef.current.turns.find((t: ExecutionTurnRecord) => t.id === turnId);
          if (turnRec) turnRec.output += chunk;
        }
        if (msg.instanceId) {
          setTaskStreams(prev => ({
            ...prev,
            [msg.instanceId!]: (prev[msg.instanceId!] || '') + chunk,
          }));
        }
      }

      if (msg.type === 'execution:turn_complete') {
        const turn = msg.payload.turn as TurnSummary;
        if (activeExecutionRef.current) {
          const turnRec = activeExecutionRef.current.turns.find((t: ExecutionTurnRecord) => t.id === turn.id);
          if (turnRec) {
            turnRec.status = 'completed';
            turnRec.completedAt = msg.timestamp;
            turnRec.durationMs = turn.durationMs;
            turnRec.actionType = turn.actionType;
            turnRec.actionSummary = turn.actionSummary;
          }
          setActiveExecutionSnapshot({ ...activeExecutionRef.current, turns: [...activeExecutionRef.current.turns] });
        }
        if (msg.instanceId) {
          setTaskStreams(prev => {
            const next = { ...prev };
            delete next[msg.instanceId!];
            return next;
          });
        }
        setExecutionStreams(prev => {
          const next = { ...prev };
          delete next[turn.id];
          return next;
        });
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Turn ${turn.seq}: ${turn.role} completed${msg.payload.action ? ` → ${msg.payload.action.summary}` : ''}`,
          type: 'execution:turn_complete',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        }]);
      }

      if (msg.type === 'execution:turn_failed') {
        const turn = msg.payload.turn as TurnSummary;
        if (activeExecutionRef.current) {
          const turnRec = activeExecutionRef.current.turns.find((t: ExecutionTurnRecord) => t.id === turn.id);
          if (turnRec) {
            turnRec.status = 'failed';
            turnRec.completedAt = msg.timestamp;
            turnRec.output = msg.payload.error || '';
          }
          setActiveExecutionSnapshot({ ...activeExecutionRef.current, turns: [...activeExecutionRef.current.turns] });
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Turn ${turn.seq}: ${turn.role} FAILED — ${msg.payload.error}`,
          type: 'execution:turn_failed',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        }]);
      }

      if (msg.type === 'execution:edge_created') {
        if (activeExecutionRef.current) {
          activeExecutionRef.current.edges.push({
            from: msg.payload.from,
            to: msg.payload.to,
            actionType: msg.payload.actionType,
          } as ExecutionEdgeRecord);
          setActiveExecutionSnapshot({ ...activeExecutionRef.current, edges: [...activeExecutionRef.current.edges] });
        }
      }

      if (msg.type === 'execution:warning') {
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId || '',
          message: `WARNING: ${msg.payload.message}`,
          type: 'execution:warning',
          timestamp: msg.timestamp,
        }]);
      }

      if (msg.type === 'execution:completed') {
        if (activeExecutionRef.current) {
          const exec = activeExecutionRef.current;
          exec.status = 'completed';
          exec.completedAt = msg.timestamp;
          exec.summary = msg.payload.summary;
          exec.graph = msg.payload.graph;
          exec.metrics = msg.payload.metrics;
          if (msg.payload.teamName) exec.teamName = msg.payload.teamName;
          if (msg.payload.goal) exec.goal = msg.payload.goal;
          setActiveExecutionSnapshot({ ...exec });
          activeExecutionRef.current = null;
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Execution completed: ${msg.payload.summary}`,
          type: 'execution:completed',
          timestamp: msg.timestamp,
        }]);
      }

      if (msg.type === 'execution:timeout') {
        if (activeExecutionRef.current) {
          const exec = activeExecutionRef.current;
          exec.status = 'timeout';
          exec.completedAt = msg.timestamp;
          exec.graph = msg.payload.graph;
          exec.metrics = msg.payload.metrics;
          setActiveExecutionSnapshot({ ...exec });
          activeExecutionRef.current = null;
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Execution TIMEOUT: ${msg.payload.message}`,
          type: 'execution:timeout',
          timestamp: msg.timestamp,
        }]);
      }

      if (msg.type === 'team:error') {
        setExecutionLogs(prev => [...prev, {
          executionId: '',
          message: `Team error: ${msg.payload.error || msg.payload.message || 'Unknown error'}`,
          type: 'team:error',
          timestamp: msg.timestamp,
        }]);
      }
    });

    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [data, token]);

  // Update time remaining every minute
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(data.expiresAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [data]);

  const handleDispatchTask = useCallback(
    (instanceId: string, content: string, _instanceName: string, newSession?: boolean, imageUrls?: string[]) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const taskId = crypto.randomUUID();
      const msg: WSMessage = {
        type: 'task:dispatch',
        payload: { instanceId, content, taskId, newSession, imageUrls },
        instanceId,
        taskId,
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(msg));
    },
    [],
  );

  const handleTeamDispatch = useCallback(
    (teamId: string, content: string, newSession?: boolean) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const msg: WSMessage = {
        type: 'team:dispatch',
        payload: { teamId, content, newSession },
        teamId,
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(msg));
    },
    [],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-1">Access Denied</h2>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" onClick={() => window.location.href = '/'}>
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const teams: TeamPublic[] = data.team ? [data.team] : [];

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fa] text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      {/* Share banner */}
      <div className="bg-primary/5 border-b border-primary/20 shrink-0">
        <div className="max-w-full px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-1.5">
              <Eye className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Using shared {data.shareType === 'team' ? 'team' : 'instance'} from user <span className="font-mono text-primary">{data.ownerShortId}</span>
              </p>
              <p className="text-xs text-muted-foreground">Type @ to select an instance or team to dispatch tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {data.stats && (
              <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Online {data.stats.online}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Busy {data.stats.busy}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-400" />
                  Offline {data.stats.offline}
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border border-border/50">
              <Clock className="h-3.5 w-3.5" />
              <span>{timeRemaining} left</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 py-6 relative z-10">
          {/* Team info */}
          {data.shareType === 'team' && data.team && (
            <Card className="mb-6 border-border/80 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                <div className="flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-semibold tracking-tight">{data.team.name}</CardTitle>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                    {data.team.roles.length} roles
                  </Badge>
                </div>
                {data.team.description && (
                  <p className="text-xs text-muted-foreground mt-1.5">{data.team.description}</p>
                )}
              </CardHeader>
              <CardContent className="pt-4 space-y-2.5">
                {data.team.roles.map(role => {
                  const member = data.team!.members.find(m => m.roleId === role.id);
                  const boundInstance = member?.instanceId
                    ? instances.find(i => i.id === member.instanceId)
                    : undefined;
                  return (
                    <div
                      key={role.id}
                      className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5 bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {role.isLead && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                          <span className="text-sm font-semibold truncate">{role.name}</span>
                          {role.isLead && (
                            <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-amber-600 border-amber-200 bg-amber-50/50">
                              Lead
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-[11px] text-muted-foreground truncate mb-1">{role.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {role.capabilities.slice(0, 4).map((cap, i) => (
                            <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0">
                              {cap}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="ml-3 shrink-0">
                        {boundInstance ? (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/5 border border-primary/20">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor[boundInstance.status]}`} />
                            <span className="text-xs font-medium break-all">{boundInstance.name}</span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Unbound</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Instances grid */}
          <div className={`grid gap-4 ${
            instances.length === 1
              ? 'grid-cols-1 max-w-xl mx-auto'
              : 'grid-cols-2 xl:grid-cols-3'
          }`}>
            {instances.map(instance => (
              <Card key={instance.id} className="bg-card border-border/80 shadow-sm hover:border-primary/40 hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/20 overflow-hidden">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full shadow-sm shrink-0 ${statusColor[instance.status]}`} />
                    <CardTitle className="text-base font-semibold tracking-tight break-words">{instance.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {instance.role && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] tracking-wider font-semibold gap-1 whitespace-nowrap ${
                          instance.role.isLead
                            ? 'text-amber-600 border-amber-200 bg-amber-50/50'
                            : 'text-violet-600 border-violet-200 bg-violet-50/50'
                        }`}
                      >
                        {instance.role.isLead && <Star className="h-2.5 w-2.5" />}
                        {instance.role.name}
                      </Badge>
                    )}
                    {instance.sandboxId && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold gap-1 text-blue-600 border-blue-200 bg-blue-50/50 whitespace-nowrap">
                        Sandbox
                      </Badge>
                    )}
                    <Badge variant={statusBadgeVariant[instance.status]} className="text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap">
                      {instance.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {instance.description && (
                    <p className="text-sm text-muted-foreground mb-3">{instance.description}</p>
                  )}
                  {instance.role && instance.role.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {instance.role.capabilities.map((cap, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {instance.currentTask && (
                    <div className="rounded-lg border border-border/60 bg-card p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground/80 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
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

                  {taskStreams[instance.id] && (
                    <div className="mt-3 rounded-lg bg-[#0d1117] border border-border/40 text-emerald-400 p-3 font-mono text-[11px] leading-relaxed max-h-36 overflow-y-auto shadow-inner">
                      <pre className="whitespace-pre-wrap break-words">{taskStreams[instance.id].slice(-500)}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {instances.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No instances available</p>
            </div>
          )}
        </div>
      </div>

      {/* Execution panel */}
      {executionLogs.length > 0 && (
        <ExecutionPanel
          logs={executionLogs}
          streams={executionStreams}
          activeExecution={activeExecutionSnapshot}
          latestExecution={activeExecutionSnapshot || undefined}
          onClear={() => {
            setExecutionLogs([]);
            setExecutionStreams({});
            setActiveExecutionSnapshot(null);
          }}
          onViewDetail={() => {}}
        />
      )}

      {/* Task input at bottom */}
      <TaskInput
        instances={instances}
        teams={teams}
        onDispatch={handleDispatchTask}
        onTeamDispatch={handleTeamDispatch}
        shareMode
      />
    </div>
  );
}
