import { v4 as uuid } from 'uuid';
import type {
  WSMessage, TeamPublic, ClawRole, Instance,
  Execution, Turn, TurnAction, TurnSummary,
  ExecutionConfig, ExecutionMetrics, ExecutionGraph, GraphNode, GraphEdge,
  DelegateAction, FeedbackAction,
} from '../../shared/types';
import { store } from './store';
import { logWS, createLogEntry } from './ws-logger';

// ──────────────────────────────────────
// Types
// ──────────────────────────────────────

interface BroadcastFn {
  (ownerId: string, message: WSMessage): void;
}

interface RoleInstance {
  role: ClawRole;
  instance: Instance;
}

const DEFAULT_CONFIG: ExecutionConfig = {
  maxTurns: 50,
  maxDepth: 15,
  turnTimeoutMs: 600_000,
  maxRetriesPerRole: 2,
};

// ──────────────────────────────────────
// HTTP helpers
// ──────────────────────────────────────

function toHttpBase(endpoint: string | undefined): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

// ──────────────────────────────────────
// Prompt building
// ──────────────────────────────────────

function buildTurnPrompt(
  turn: Turn,
  execution: Execution,
  team: TeamPublic,
  previousExecutions: Array<{ goal: string; summary: string; completedAt: string }> = [],
): string {
  const role = team.roles.find(r => r.name === turn.role)!;
  const isLead = role.isLead;

  const memberList = team.roles
    .map(r => `- **${r.name}**${r.isLead ? '（Lead）' : ''}：${r.description}｜能力：${r.capabilities.join('、')}`)
    .join('\n');

  const executionSummary = buildExecutionSummary(execution, turn);

  const upstreamContext = buildUpstreamContext(turn, execution);

  const actionInstructions = buildActionInstructions(isLead, team);

  let historySection = '';
  if (isLead && previousExecutions.length > 0 && execution.turns.length === 0) {
    const recent = previousExecutions.slice(-5);
    const items = recent.map((e, i) =>
      `${i + 1}. **目标**：${e.goal.slice(0, 100)}\n   **结果**：${e.summary.slice(0, 300)}\n   **时间**：${e.completedAt}`
    ).join('\n\n');
    historySection = `\n## 之前的执行记录\n\n以下是本团队近期完成的任务，你可以参考上下文：\n\n${items}\n`;
  }

  return `# 系统说明

你正在一个**多实例协作编排平台**中工作。你是团队「${team.name}」的**「${role.name}」**。

**你的职责**：${role.description}
**你的能力**：${role.capabilities.join('、')}

## 团队成员

${memberList}

## 团队目标

${execution.goal}
${historySection}
## 当前执行进展

${executionSummary}

## 你当前的任务

${turn.task}
${upstreamContext}
---

${actionInstructions}`;
}

function buildExecutionSummary(execution: Execution, currentTurn: Turn): string {
  const completed = execution.turns.filter(t => t.status === 'completed');
  if (completed.length === 0) {
    return '（这是第一轮，尚无历史记录）';
  }

  const causalChain = getCausalChain(execution, currentTurn);
  const causalIds = new Set(causalChain.map(t => t.id));

  const lines: string[] = [];

  for (const t of completed) {
    const isCausal = causalIds.has(t.id);
    const actionDesc = t.action ? describeAction(t.action) : '（无后续操作）';

    if (isCausal || completed.indexOf(t) >= completed.length - 5) {
      lines.push(`Turn ${t.seq} │ **${t.role}** │ ${t.task.slice(0, 80)}${t.task.length > 80 ? '…' : ''}\n  └→ ${actionDesc}`);
    } else {
      lines.push(`Turn ${t.seq} │ ${t.role} │ ${actionDesc}`);
    }
  }

  return lines.join('\n');
}

function getCausalChain(execution: Execution, turn: Turn): Turn[] {
  const chain: Turn[] = [];
  let parentId = turn.parentTurnId;
  while (parentId) {
    const parent = execution.turns.find(t => t.id === parentId);
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parentTurnId;
  }
  return chain;
}

function buildUpstreamContext(turn: Turn, execution: Execution): string {
  if (!turn.parentTurnId) return '';

  const parent = execution.turns.find(t => t.id === turn.parentTurnId);
  if (!parent || !parent.output) return '';

  const contextLevel = (turn.triggerAction as DelegateAction)?.context;

  let contextContent: string;
  if (contextLevel === 'none') {
    return '';
  } else if (contextLevel === 'summary') {
    contextContent = parent.output.slice(0, 1500);
    if (parent.output.length > 1500) contextContent += '\n…（已截断）';
  } else {
    contextContent = parent.output;
  }

  const triggerType = turn.triggerAction?.type || 'delegate';
  const fromLabel = triggerType === 'feedback'
    ? `来自「${parent.role}」的反馈`
    : `来自「${parent.role}」的上游产出`;

  return `\n## ${fromLabel}\n\n${contextContent}\n`;
}

function describeAction(action: TurnAction): string {
  switch (action.type) {
    case 'delegate':
      return `委派 → ${action.to}：${action.task.slice(0, 60)}`;
    case 'report':
      return `汇报：${action.summary.slice(0, 60)}`;
    case 'feedback':
      return `反馈 → ${action.to}：${action.issue.slice(0, 60)}`;
    case 'done':
      return `结束：${action.summary.slice(0, 60)}`;
  }
}

function buildActionInstructions(isLead: boolean, team: TeamPublic): string {
  const roleNames = team.roles.map(r => r.name).join('、');

  let instructions = `## 完成任务后的操作指令

完成以上任务后，你**必须**在回复末尾输出一个 JSON 代码块，告诉编排引擎下一步做什么。

### 可用操作

**1. 委派任务** — 将子任务交给其他团队成员执行：
\`\`\`json
{ "action": "delegate", "to": "角色名", "task": "具体任务描述（越详细越好）", "context": "full" }
\`\`\`
- \`to\`：必须是以下角色之一：${roleNames}
- \`context\`：\`"full"\`（传递你的完整输出）、\`"summary"\`（传递摘要）、\`"none"\`（不传递）

**2. 汇报结果** — 将工作成果汇报给委派你任务的人：
\`\`\`json
{ "action": "report", "summary": "工作成果摘要" }
\`\`\`

**3. 反馈问题** — 发现其他成员的产出有问题，请求他们修改：
\`\`\`json
{ "action": "feedback", "to": "角色名", "issue": "发现的问题描述", "suggestion": "修改建议" }
\`\`\``;

  if (isLead) {
    instructions += `

**4. 结束任务** — 你作为 Lead，认为团队目标已达成，结束整个协作：
\`\`\`json
{ "action": "done", "summary": "最终总结" }
\`\`\``;
  }

  instructions += `

### 重要规则
- 每次回复只能选择**一个**操作
- JSON 必须放在回复末尾的代码块中
- ${isLead ? '只有你（Lead）可以使用 "done" 结束任务' : '你不能使用 "done"，如果任务已完成请使用 "report" 汇报'}
- 选择最合适的团队成员来委派任务，充分利用他们的能力`;

  return instructions;
}

// ──────────────────────────────────────
// Action parsing
// ──────────────────────────────────────

function parseActionFromOutput(output: string): TurnAction | null {
  const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1].trim() : null;

  if (!raw) {
    const braceMatch = output.match(/\{\s*"action"\s*:\s*"(?:delegate|report|feedback|done)"[\s\S]*?\}/);
    if (braceMatch) {
      try {
        return validateAction(JSON.parse(braceMatch[0]));
      } catch { /* fall through */ }
    }
    return null;
  }

  try {
    return validateAction(JSON.parse(raw));
  } catch {
    return null;
  }
}

function validateAction(obj: Record<string, unknown>): TurnAction | null {
  const action = obj.action as string;
  if (!action) return null;

  switch (action) {
    case 'delegate': {
      const to = obj.to as string;
      const task = obj.task as string;
      if (!to || !task) return null;
      return {
        type: 'delegate',
        to,
        task,
        context: (['full', 'summary', 'none'].includes(obj.context as string)
          ? obj.context as 'full' | 'summary' | 'none'
          : 'full'),
        message: (obj.message as string) || undefined,
      };
    }
    case 'report': {
      const summary = obj.summary as string;
      if (!summary) return null;
      return { type: 'report', summary };
    }
    case 'feedback': {
      const to = obj.to as string;
      const issue = obj.issue as string;
      if (!to || !issue) return null;
      return {
        type: 'feedback',
        to,
        issue,
        suggestion: (obj.suggestion as string) || undefined,
      };
    }
    case 'done': {
      const summary = obj.summary as string;
      if (!summary) return null;
      return { type: 'done', summary };
    }
    default:
      return null;
  }
}

// ──────────────────────────────────────
// Instance calling (SSE stream)
// ──────────────────────────────────────

async function callInstance(
  instance: Instance,
  content: string,
  ownerId: string,
  broadcastToOwner: BroadcastFn,
  executionId: string,
  turn: Turn,
  sessionKey: string,
): Promise<string> {
  const baseUrl = toHttpBase(instance.endpoint);
  const url = `${baseUrl}/v1/responses`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-openclaw-agent-id': 'main',
  };
  if (instance.token) {
    headers['Authorization'] = `Bearer ${instance.token}`;
  }

  const body = JSON.stringify({
    model: 'openclaw',
    input: content,
    stream: true,
    user: sessionKey,
  });

  console.log(`[execution] >>> Turn ${turn.seq} [${instance.name}] role=${turn.role}`);
  logWS(createLogEntry('outbound', instance.id, instance.name, `[exec:turn-${turn.seq}] ${body.slice(0, 200)}`));

  store.updateInstance(instance.id, { status: 'busy' });
  broadcastToOwner(ownerId, {
    type: 'instance:status',
    payload: { instanceId: instance.id, status: 'busy' },
    instanceId: instance.id,
    timestamp: new Date().toISOString(),
  });

  let fullText = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_CONFIG.turnTimeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Connection': 'keep-alive' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          if (event.type === 'response.output_text.delta' && event.delta) {
            fullText += event.delta;
            broadcastToOwner(ownerId, {
              type: 'execution:turn_stream',
              payload: {
                executionId,
                turnId: turn.id,
                seq: turn.seq,
                role: turn.role,
                chunk: event.delta,
              },
              instanceId: instance.id,
              teamId: turn.executionId,
              timestamp: new Date().toISOString(),
            });
          }

          if (event.type === 'response.completed') {
            const output = event.response as Record<string, unknown> | undefined;
            if (output?.output && Array.isArray(output.output)) {
              let text = '';
              for (const item of output.output) {
                if (item.type === 'message' && Array.isArray(item.content)) {
                  for (const part of item.content) {
                    if (part.type === 'output_text') text += part.text || '';
                  }
                }
              }
              if (text) fullText = text;
            }
          }
        } catch {
          // skip
        }
      }
    }
  } catch (err) {
    console.error(`[execution] Turn ${turn.seq} [${instance.name}] ERROR:`, err instanceof Error ? err.message : err);
    throw err;
  } finally {
    store.updateInstance(instance.id, { status: 'online' });
    broadcastToOwner(ownerId, {
      type: 'instance:status',
      payload: { instanceId: instance.id, status: 'online' },
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
    });
  }

  return fullText;
}

// ──────────────────────────────────────
// Graph building
// ──────────────────────────────────────

function buildExecutionGraph(execution: Execution): ExecutionGraph {
  const nodes: GraphNode[] = execution.turns
    .filter(t => t.status === 'completed' || t.status === 'failed')
    .map(t => ({
      id: t.id,
      seq: t.seq,
      role: t.role,
      instanceId: t.instanceId,
      task: t.task.slice(0, 120),
      output: t.output.slice(0, 200),
      actionType: t.action?.type || 'none',
      status: t.status,
      durationMs: t.durationMs || 0,
      depth: t.depth,
    }));

  const edges: GraphEdge[] = execution.turns
    .filter(t => t.parentTurnId)
    .map(t => ({
      id: `${t.parentTurnId}->${t.id}`,
      from: t.parentTurnId!,
      to: t.id,
      actionType: (t.triggerAction?.type || 'delegate') as GraphEdge['actionType'],
      label: t.triggerAction
        ? describeAction(t.triggerAction).slice(0, 60)
        : t.task.slice(0, 60),
    }));

  return { nodes, edges };
}

function computeMetrics(execution: Execution): ExecutionMetrics {
  const completed = execution.turns.filter(t => t.status === 'completed');
  const turnsByRole: Record<string, number> = {};
  let feedbackCycles = 0;
  let maxDepth = 0;

  for (const t of completed) {
    turnsByRole[t.role] = (turnsByRole[t.role] || 0) + 1;
    if (t.depth > maxDepth) maxDepth = t.depth;
    if (t.action?.type === 'feedback') feedbackCycles++;
  }

  const totalDuration = execution.completedAt
    ? new Date(execution.completedAt).getTime() - new Date(execution.createdAt).getTime()
    : Date.now() - new Date(execution.createdAt).getTime();

  const durations = completed.map(t => t.durationMs || 0);
  const avgTurnDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return {
    totalTurns: completed.length,
    totalDurationMs: totalDuration,
    turnsByRole,
    maxDepthReached: maxDepth,
    feedbackCycles,
    avgTurnDurationMs,
    tokenUsage: { prompt: 0, completion: 0 },
  };
}

function toTurnSummary(turn: Turn): TurnSummary {
  return {
    id: turn.id,
    seq: turn.seq,
    role: turn.role,
    instanceId: turn.instanceId,
    task: turn.task.slice(0, 200),
    status: turn.status,
    depth: turn.depth,
    parentTurnId: turn.parentTurnId,
    durationMs: turn.durationMs,
    actionType: turn.action?.type,
    actionSummary: turn.action ? describeAction(turn.action).slice(0, 100) : undefined,
  };
}

// ──────────────────────────────────────
// Role resolution
// ──────────────────────────────────────

function resolveRoleInstance(team: TeamPublic, roleName: string): RoleInstance | null {
  const role = team.roles.find(r => r.name === roleName);
  if (!role) return null;

  const member = team.members.find(m => m.roleId === role.id);
  if (!member?.instanceId) return null;

  const instance = store.getInstanceRaw(member.instanceId);
  if (!instance) return null;

  return { role, instance };
}

// ──────────────────────────────────────
// Main execution engine
// ──────────────────────────────────────

export async function dispatchToTeam(
  ownerId: string,
  teamId: string,
  goal: string,
  broadcastToOwner: BroadcastFn,
  newSession?: boolean,
) {
  const team = store.getTeam(ownerId, teamId);
  if (!team) {
    broadcastToOwner(ownerId, {
      type: 'team:error',
      payload: { error: 'Team not found' },
      teamId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const leadRole = team.roles.find(r => r.isLead);
  if (!leadRole) {
    broadcastToOwner(ownerId, {
      type: 'team:error',
      payload: { error: 'Team has no Lead role' },
      teamId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const leadRI = resolveRoleInstance(team, leadRole.name);
  if (!leadRI) {
    broadcastToOwner(ownerId, {
      type: 'team:error',
      payload: { error: `Lead role "${leadRole.name}" has no bound instance` },
      teamId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (newSession) {
    store.resetTeamSession(ownerId, teamId);
  }

  const previousExecutions = store.getTeamExecutionSummaries(ownerId, teamId);

  const execution: Execution = {
    id: uuid(),
    teamId,
    ownerId,
    goal,
    status: 'running',
    turns: [],
    config: { ...DEFAULT_CONFIG },
    metrics: {
      totalTurns: 0,
      totalDurationMs: 0,
      turnsByRole: {},
      maxDepthReached: 0,
      feedbackCycles: 0,
      avgTurnDurationMs: 0,
      tokenUsage: { prompt: 0, completion: 0 },
    },
    createdAt: new Date().toISOString(),
  };

  broadcastToOwner(ownerId, {
    type: 'execution:started',
    payload: {
      executionId: execution.id,
      teamId,
      teamName: team.name,
      goal,
      leadRole: leadRole.name,
      config: execution.config,
    },
    teamId,
    timestamp: new Date().toISOString(),
  });

  let seqCounter = 0;

  const pendingTurns: Turn[] = [];
  const roleFailures: Record<string, number> = {};

  const memberCount = team.roles.filter(r => !r.isLead).length || 1;
  const leadMaxRetries = execution.config.maxRetriesPerRole * memberCount;

  function createTurn(
    role: string,
    instanceId: string,
    task: string,
    parentTurnId: string | null,
    triggerAction: TurnAction | null,
    depth: number,
  ): Turn {
    seqCounter++;
    return {
      id: uuid(),
      executionId: execution.id,
      seq: seqCounter,
      role,
      instanceId,
      parentTurnId,
      triggerAction,
      depth,
      task,
      output: '',
      action: null,
      status: 'pending',
    };
  }

  // Bootstrap: Lead receives the goal
  pendingTurns.push(createTurn(
    leadRole.name,
    leadRI.instance.id,
    goal,
    null,
    null,
    0,
  ));

  // ── Main loop ──
  while (pendingTurns.length > 0) {
    // Safety: max turns
    if (execution.turns.filter(t => t.status === 'completed').length >= execution.config.maxTurns) {
      broadcastToOwner(ownerId, {
        type: 'execution:warning',
        payload: { message: `已达最大轮次上限 (${execution.config.maxTurns})，正在强制 Lead 总结…` },
        teamId,
        timestamp: new Date().toISOString(),
      });

      pendingTurns.length = 0;
      pendingTurns.push(createTurn(
        leadRole.name,
        leadRI.instance.id,
        `[系统强制指令] 已达最大执行轮次 (${execution.config.maxTurns})。请立即总结当前所有进展，使用 "done" 结束任务。\n\n团队目标：${goal}`,
        null,
        null,
        0,
      ));
    }

    const turn = pendingTurns.shift()!;

    // Depth check
    if (turn.depth >= execution.config.maxDepth) {
      turn.task += `\n\n[系统提示: 已达最大委派深度 (${execution.config.maxDepth})，请直接汇报结果给上级，不要继续委派]`;
    }

    // Build prompt
    const prompt = buildTurnPrompt(turn, execution, team, previousExecutions);

    // Broadcast: turn start
    turn.status = 'running';
    turn.startedAt = new Date().toISOString();
    broadcastToOwner(ownerId, {
      type: 'execution:turn_start',
      payload: {
        executionId: execution.id,
        turn: toTurnSummary(turn),
        message: `Turn ${turn.seq}：「${turn.role}」开始执行 — ${turn.task.slice(0, 80)}`,
      },
      teamId,
      timestamp: new Date().toISOString(),
    });

    // Call instance
    let output: string;
    try {
      const ri = resolveRoleInstance(team, turn.role);
      const inst = ri?.instance || store.getInstanceRaw(turn.instanceId);
      if (!inst) throw new Error(`Instance not found for role "${turn.role}"`);

      const sessionKey = store.getTeamSessionKey(ownerId, teamId, inst.id);
      output = await callInstance(inst, prompt, ownerId, broadcastToOwner, execution.id, turn, sessionKey);
    } catch (err) {
      turn.status = 'failed';
      turn.completedAt = new Date().toISOString();
      turn.durationMs = new Date(turn.completedAt).getTime() - new Date(turn.startedAt!).getTime();
      turn.output = err instanceof Error ? err.message : 'Unknown error';
      execution.turns.push(turn);

      broadcastToOwner(ownerId, {
        type: 'execution:turn_failed',
        payload: {
          executionId: execution.id,
          turn: toTurnSummary(turn),
          error: turn.output,
        },
        teamId,
        timestamp: new Date().toISOString(),
      });

      // ── Retry / escalation logic ──
      roleFailures[turn.role] = (roleFailures[turn.role] || 0) + 1;
      const isLead = turn.role === leadRole.name;
      const maxRetries = isLead ? leadMaxRetries : execution.config.maxRetriesPerRole;
      const failures = roleFailures[turn.role];

      if (failures < maxRetries) {
        // Retry: re-enqueue the same task with a hint
        broadcastToOwner(ownerId, {
          type: 'execution:warning',
          payload: {
            message: `「${turn.role}」执行失败 (${failures}/${maxRetries})，正在重试…`,
            turnId: turn.id,
          },
          teamId,
          timestamp: new Date().toISOString(),
        });

        const ri = resolveRoleInstance(team, turn.role);
        if (ri) {
          const retryTurn = createTurn(
            turn.role,
            ri.instance.id,
            `[系统提示: 上一次执行失败，错误信息: ${turn.output.slice(0, 200)}。请重试以下任务]\n\n${turn.task}`,
            turn.parentTurnId,
            turn.triggerAction,
            turn.depth,
          );
          pendingTurns.push(retryTurn);
          broadcastEdge(ownerId, teamId, turn.id, retryTurn.id, 'delegate', broadcastToOwner);
        }
      } else {
        // Retries exhausted
        if (isLead) {
          // Lead exhausted → execution fails
          execution.status = 'failed';
          execution.completedAt = new Date().toISOString();
          execution.metrics = computeMetrics(execution);

          broadcastToOwner(ownerId, {
            type: 'execution:completed',
            payload: {
              executionId: execution.id,
              summary: `执行失败：Lead「${turn.role}」连续失败 ${failures} 次，已耗尽重试次数`,
              graph: buildExecutionGraph(execution),
              metrics: execution.metrics,
              goal,
              teamName: team.name,
              status: 'failed',
            },
            teamId,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Non-Lead exhausted → escalate to parent or Lead
        broadcastToOwner(ownerId, {
          type: 'execution:warning',
          payload: {
            message: `「${turn.role}」重试次数耗尽 (${failures}/${maxRetries})，将失败信息上报给上级`,
            turnId: turn.id,
          },
          teamId,
          timestamp: new Date().toISOString(),
        });

        const parentTurn = turn.parentTurnId
          ? execution.turns.find(t => t.id === turn.parentTurnId)
          : null;
        const escalateRI = parentTurn
          ? resolveRoleInstance(team, parentTurn.role)
          : leadRI;

        if (escalateRI) {
          const escalateTask = `「${turn.role}」在执行任务时连续失败 ${failures} 次，已无法完成。\n\n**原始任务**：${turn.task.slice(0, 500)}\n**最后错误**：${turn.output.slice(0, 300)}\n\n请决定如何处理：你可以将任务重新分配给其他成员，或者调整任务后再次委派给该成员，或者汇报整体情况。`;
          const escalateTurn = createTurn(
            escalateRI.role.name,
            escalateRI.instance.id,
            escalateTask,
            turn.id,
            { type: 'report', summary: `${turn.role} 执行失败 ${failures} 次，任务未完成` },
            turn.depth,
          );
          pendingTurns.push(escalateTurn);
          broadcastEdge(ownerId, teamId, turn.id, escalateTurn.id, 'report', broadcastToOwner);
        }
      }
      continue;
    }

    // Complete turn
    turn.output = output;
    turn.completedAt = new Date().toISOString();
    turn.durationMs = new Date(turn.completedAt).getTime() - new Date(turn.startedAt!).getTime();
    turn.status = 'completed';
    roleFailures[turn.role] = 0;

    const action = parseActionFromOutput(output);
    turn.action = action;
    execution.turns.push(turn);

    // Broadcast: turn complete
    broadcastToOwner(ownerId, {
      type: 'execution:turn_complete',
      payload: {
        executionId: execution.id,
        turn: toTurnSummary(turn),
        action: action ? { type: action.type, summary: describeAction(action) } : null,
      },
      teamId,
      timestamp: new Date().toISOString(),
    });

    // ── Route based on action ──
    if (!action) {
      const isLeadTurn = turn.role === leadRole.name;

      if (isLeadTurn) {
        execution.status = 'completed';
        execution.summary = output.slice(0, 2000);
        execution.completedAt = new Date().toISOString();
        execution.metrics = computeMetrics(execution);
        store.addTeamExecutionSummary(ownerId, teamId, goal, execution.summary);

        broadcastToOwner(ownerId, {
          type: 'execution:completed',
          payload: {
            executionId: execution.id,
            summary: execution.summary,
            graph: buildExecutionGraph(execution),
            metrics: execution.metrics,
            goal,
            teamName: team.name,
            status: 'completed',
          },
          teamId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Non-Lead with no action → auto-report to Lead (not to parentTurn's role)
      const reportTask = `「${turn.role}」完成了任务，以下是其产出（未附带明确操作指令，系统自动汇报给你）：\n\n${output.slice(0, 3000)}`;
      const newTurn = createTurn(
        leadRole.name,
        leadRI.instance.id,
        reportTask,
        turn.id,
        { type: 'report', summary: output.slice(0, 200) },
        turn.depth,
      );
      pendingTurns.push(newTurn);
      broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'report', broadcastToOwner);
      continue;
    }

    switch (action.type) {
      case 'delegate': {
        const targetRI = resolveRoleInstance(team, action.to);
        if (!targetRI) {
          broadcastToOwner(ownerId, {
            type: 'execution:warning',
            payload: {
              message: `角色「${action.to}」不存在或未绑定实例，跳过该委派`,
              turnId: turn.id,
            },
            teamId,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        roleFailures[targetRI.role.name] = 0;

        const newTurn = createTurn(
          targetRI.role.name,
          targetRI.instance.id,
          action.task,
          turn.id,
          action,
          turn.depth + 1,
        );
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'delegate', broadcastToOwner);
        break;
      }

      case 'report': {
        const parentTurn = turn.parentTurnId
          ? execution.turns.find(t => t.id === turn.parentTurnId)
          : null;
        const targetRI = parentTurn
          ? resolveRoleInstance(team, parentTurn.role)
          : leadRI;

        if (!targetRI) break;

        // Avoid Lead reporting to Lead in an infinite loop
        if (targetRI.role.name === turn.role && turn.role === leadRole.name) {
          execution.status = 'completed';
          execution.summary = action.summary;
          execution.completedAt = new Date().toISOString();
          execution.metrics = computeMetrics(execution);
          store.addTeamExecutionSummary(ownerId, teamId, goal, action.summary);

          broadcastToOwner(ownerId, {
            type: 'execution:completed',
            payload: {
              executionId: execution.id,
              summary: action.summary,
              graph: buildExecutionGraph(execution),
              metrics: execution.metrics,
              goal,
              teamName: team.name,
            },
            teamId,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const reportTask = `「${turn.role}」向你汇报工作结果：\n\n**汇报摘要**：${action.summary}\n\n**详细内容**：\n${output.slice(0, 4000)}`;
        const newTurn = createTurn(
          targetRI.role.name,
          targetRI.instance.id,
          reportTask,
          turn.id,
          action,
          turn.depth,
        );
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'report', broadcastToOwner);
        break;
      }

      case 'feedback': {
        const targetRI = resolveRoleInstance(team, action.to);
        if (!targetRI) {
          broadcastToOwner(ownerId, {
            type: 'execution:warning',
            payload: {
              message: `反馈目标角色「${action.to}」不存在或未绑定实例`,
              turnId: turn.id,
            },
            teamId,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        roleFailures[targetRI.role.name] = 0;

        const feedbackTask = `「${turn.role}」对你的工作提出了反馈，请根据反馈修改：\n\n**问题**：${action.issue}${action.suggestion ? `\n**建议**：${action.suggestion}` : ''}\n\n**原始上下文**：\n${output.slice(0, 3000)}`;
        const newTurn = createTurn(
          targetRI.role.name,
          targetRI.instance.id,
          feedbackTask,
          turn.id,
          action,
          turn.depth,
        );
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'feedback', broadcastToOwner);
        break;
      }

      case 'done': {
        if (turn.role === leadRole.name) {
          execution.status = 'completed';
          execution.summary = action.summary;
          execution.completedAt = new Date().toISOString();
          execution.metrics = computeMetrics(execution);
          store.addTeamExecutionSummary(ownerId, teamId, goal, action.summary);

          broadcastToOwner(ownerId, {
            type: 'execution:completed',
            payload: {
              executionId: execution.id,
              summary: action.summary,
              graph: buildExecutionGraph(execution),
              metrics: execution.metrics,
              goal,
              teamName: team.name,
            },
            teamId,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Non-lead cannot end → convert to report to Lead
        const reportTask = `「${turn.role}」认为任务已完成并汇报：\n\n${action.summary}\n\n**详细内容**：\n${output.slice(0, 4000)}`;
        const newTurn = createTurn(
          leadRole.name,
          leadRI.instance.id,
          reportTask,
          turn.id,
          { type: 'report', summary: action.summary },
          turn.depth,
        );
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'report', broadcastToOwner);
        break;
      }
    }
  }

  // Timeout
  execution.status = 'timeout';
  execution.completedAt = new Date().toISOString();
  execution.metrics = computeMetrics(execution);

  broadcastToOwner(ownerId, {
    type: 'execution:timeout',
    payload: {
      executionId: execution.id,
      message: '执行超时：所有待处理轮次已耗尽',
      graph: buildExecutionGraph(execution),
      metrics: execution.metrics,
      goal,
      teamName: team.name,
    },
    teamId,
    timestamp: new Date().toISOString(),
  });
}

function broadcastEdge(
  ownerId: string,
  teamId: string,
  fromId: string,
  toId: string,
  actionType: string,
  broadcastToOwner: BroadcastFn,
) {
  broadcastToOwner(ownerId, {
    type: 'execution:edge_created',
    payload: { from: fromId, to: toId, actionType },
    teamId,
    timestamp: new Date().toISOString(),
  });
}
