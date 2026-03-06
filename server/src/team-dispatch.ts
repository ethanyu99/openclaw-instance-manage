import { v4 as uuid } from 'uuid';
import type {
  WSMessage, TeamPublic, ClawRole, Instance,
  Execution, Turn, TurnAction, TurnSummary,
  ExecutionConfig, ExecutionMetrics, ExecutionGraph, GraphNode, GraphEdge,
  DelegateAction, FeedbackAction, MultiDelegateAction, ExecutionRecord,
} from '../../shared/types';
import { store } from './store';
import { logWS, createLogEntry } from './ws-logger';
import { saveExecution as persistExecution } from './persistence';

const cancelledExecutions = new Map<string, boolean>();
const executionAbortControllers = new Map<string, Set<AbortController>>();

export function cancelExecution(executionId: string) {
  cancelledExecutions.set(executionId, true);
  const controllers = executionAbortControllers.get(executionId);
  if (controllers) {
    for (const ctrl of controllers) {
      ctrl.abort();
    }
  }
}

function registerAbortController(executionId: string, controller: AbortController): void {
  let set = executionAbortControllers.get(executionId);
  if (!set) {
    set = new Set();
    executionAbortControllers.set(executionId, set);
  }
  set.add(controller);
}

function unregisterAbortController(executionId: string, controller: AbortController): void {
  const set = executionAbortControllers.get(executionId);
  if (set) {
    set.delete(controller);
    if (set.size === 0) executionAbortControllers.delete(executionId);
  }
}

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

function toHttpBase(endpoint: string | undefined): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

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
    case 'multi_delegate':
      return `并行委派 → ${action.tasks.map(t => t.to).join('、')}`;
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

**2. 并行委派** — 同时将多个子任务分配给不同成员并行执行（推荐用于独立子任务）：
\`\`\`json
{ "action": "multi_delegate", "tasks": [
  { "to": "角色名A", "task": "子任务A描述", "context": "full" },
  { "to": "角色名B", "task": "子任务B描述", "context": "summary" }
] }
\`\`\`
- 多个子任务会**同时并行**执行，适用于相互独立的任务
- 所有子任务完成后，结果会自动汇报给你

**3. 汇报结果** — 将工作成果汇报给委派你任务的人：
\`\`\`json
{ "action": "report", "summary": "工作成果摘要" }
\`\`\`

**4. 反馈问题** — 发现其他成员的产出有问题，请求他们修改：
\`\`\`json
{ "action": "feedback", "to": "角色名", "issue": "发现的问题描述", "suggestion": "修改建议" }
\`\`\``;

  if (isLead) {
    instructions += `

**5. 结束任务** — 你作为 Lead，认为团队目标已达成，结束整个协作：
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

function parseActionFromOutput(output: string): TurnAction | null {
  // Strategy 1: Find the LAST ```json...``` block (the action block is always at the end).
  // Use greedy match to skip past nested code blocks inside the task content.
  const allJsonBlocks = [...output.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (allJsonBlocks.length > 0) {
    // Try from last to first — the action block is instructed to be at the end
    for (let i = allJsonBlocks.length - 1; i >= 0; i--) {
      const raw = allJsonBlocks[i][1].trim();
      try {
        const result = validateAction(JSON.parse(raw));
        if (result) return result;
      } catch { /* try next */ }
    }
  }

  // Strategy 2: Extract JSON by finding balanced braces starting from an "action" key.
  // This handles cases where the JSON is not in a code block, or nested ``` broke extraction.
  const actionStart = output.lastIndexOf('"action"');
  if (actionStart !== -1) {
    // Walk backwards to find the opening brace
    let braceStart = output.lastIndexOf('{', actionStart);
    if (braceStart !== -1) {
      const extracted = extractBalancedJson(output, braceStart);
      if (extracted) {
        try {
          return validateAction(JSON.parse(extracted));
        } catch { /* fall through */ }
      }
    }
  }

  return null;
}

function extractBalancedJson(str: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return str.slice(start, i + 1);
      }
    }
  }

  return null;
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
    case 'multi_delegate': {
      const tasks = obj.tasks as Array<{ to: string; task: string; context?: string }>;
      if (!Array.isArray(tasks) || tasks.length === 0) return null;
      const validTasks = tasks.filter(t => t.to && t.task).map(t => ({
        to: t.to,
        task: t.task,
        context: (['full', 'summary', 'none'].includes(t.context || '')
          ? t.context as 'full' | 'summary' | 'none'
          : 'full') as 'full' | 'summary' | 'none',
      }));
      if (validTasks.length === 0) return null;
      return { type: 'multi_delegate', tasks: validTasks };
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

async function callInstanceRaw(
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

  console.log(`[execution] >>> Turn ${turn.seq} [${instance.name}] role=${turn.role} session=${sessionKey}`);
  logWS(createLogEntry('outbound', instance.id, instance.name, `[exec:turn-${turn.seq}] ${body.slice(0, 200)}`));

  await store.updateInstance(instance.id, { status: 'busy' });
  broadcastToOwner(ownerId, {
    type: 'instance:status',
    payload: { instanceId: instance.id, status: 'busy' },
    instanceId: instance.id,
    timestamp: new Date().toISOString(),
  });

  let fullText = '';
  const controller = new AbortController();
  registerAbortController(executionId, controller);

  try {
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
    const msg = err instanceof Error ? err.message : String(err);
    const isCancelled = cancelledExecutions.get(executionId) || msg === 'This operation was aborted';
    if (isCancelled) {
      console.log(`[execution] Turn ${turn.seq} [${instance.name}] aborted by cancel`);
    } else {
      console.error(`[execution] Turn ${turn.seq} [${instance.name}] ERROR:`, msg);
    }
    throw err;
  } finally {
    unregisterAbortController(executionId, controller);
    await store.updateInstance(instance.id, { status: 'online' });
    broadcastToOwner(ownerId, {
      type: 'instance:status',
      payload: { instanceId: instance.id, status: 'online' },
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
    });
  }

  return fullText;
}

/**
 * Wraps callInstanceRaw with a fallback: if the first call returns empty (no response),
 * resets the team session to start a new chat and retries once. Only returns empty or
 * throws after both attempts fail.
 */
async function callInstance(
  instance: Instance,
  content: string,
  ownerId: string,
  broadcastToOwner: BroadcastFn,
  executionId: string,
  turn: Turn,
  sessionKey: string,
  teamId?: string,
): Promise<string> {
  const result = await callInstanceRaw(instance, content, ownerId, broadcastToOwner, executionId, turn, sessionKey);

  if (result.trim().length > 0) {
    return result;
  }

  // Empty response — likely a stale/corrupted session. Retry with a fresh session.
  console.warn(`[execution] Turn ${turn.seq} [${instance.name}] got empty response with session=${sessionKey}, retrying with new session…`);

  broadcastToOwner(ownerId, {
    type: 'execution:warning',
    payload: {
      message: `「${turn.role}」(${instance.name}) 返回空响应，正在重置会话并重试…`,
      turnId: turn.id,
    },
    teamId: teamId || turn.executionId,
    timestamp: new Date().toISOString(),
  });

  let newSessionKey: string;
  if (teamId) {
    await store.resetTeamSession(ownerId, teamId);
    newSessionKey = await store.getTeamSessionKey(ownerId, teamId, instance.id);
  } else {
    newSessionKey = await store.resetSessionKey(ownerId, instance.id);
  }

  console.log(`[execution] Turn ${turn.seq} [${instance.name}] retrying with new session=${newSessionKey}`);

  const retryResult = await callInstanceRaw(instance, content, ownerId, broadcastToOwner, executionId, turn, newSessionKey);

  if (retryResult.trim().length > 0) {
    return retryResult;
  }

  // Both attempts returned empty
  console.error(`[execution] Turn ${turn.seq} [${instance.name}] still empty after session reset`);
  throw new Error(`No response from ${instance.name} (empty reply after session reset retry)`);
}

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

async function resolveRoleInstance(team: TeamPublic, roleName: string): Promise<RoleInstance | null> {
  const role = team.roles.find(r => r.name === roleName);
  if (!role) return null;

  const member = team.members.find(m => m.roleId === role.id);
  if (!member?.instanceId) return null;

  const instance = await store.getInstanceRaw(member.instanceId);
  if (!instance) return null;

  return { role, instance };
}

export async function dispatchToTeam(
  ownerId: string,
  teamId: string,
  goal: string,
  broadcastToOwner: BroadcastFn,
  newSession?: boolean,
  userConfig?: Partial<ExecutionConfig>,
) {
  const team = await store.getTeam(ownerId, teamId);
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

  const leadRI = await resolveRoleInstance(team, leadRole.name);
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
    await store.resetTeamSession(ownerId, teamId);
  }

  const previousExecutions = await store.getTeamExecutionSummaries(ownerId, teamId);

  const execution: Execution = {
    id: uuid(),
    teamId,
    ownerId,
    goal,
    status: 'running',
    turns: [],
    config: { ...DEFAULT_CONFIG, ...userConfig },
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

  pendingTurns.push(createTurn(
    leadRole.name,
    leadRI.instance.id,
    goal,
    null,
    null,
    0,
  ));

  function persistCurrentExecution() {
    const record: ExecutionRecord = {
      id: execution.id,
      ownerId,
      teamId,
      teamName: team!.name,
      goal,
      summary: execution.summary,
      status: execution.status,
      turns: execution.turns.map(toTurnSummary),
      edges: execution.turns
        .filter(t => t.parentTurnId)
        .map(t => ({
          from: t.parentTurnId!,
          to: t.id,
          actionType: (t.triggerAction?.type || 'delegate'),
        })),
      graph: buildExecutionGraph(execution),
      metrics: computeMetrics(execution),
      createdAt: execution.createdAt,
      completedAt: execution.completedAt,
    };
    persistExecution(record).catch(err =>
      console.error('[execution] Failed to persist execution:', err)
    );
  }

  while (pendingTurns.length > 0) {
    if (cancelledExecutions.get(execution.id)) {
      cancelledExecutions.delete(execution.id);
      executionAbortControllers.delete(execution.id);
      execution.status = 'failed';
      execution.summary = '执行被用户取消';
      execution.completedAt = new Date().toISOString();
      execution.metrics = computeMetrics(execution);
      persistCurrentExecution();

      broadcastToOwner(ownerId, {
        type: 'execution:cancelled',
        payload: {
          executionId: execution.id,
          summary: '执行被用户取消',
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

    const parallelBatch: Turn[] = [];
    const firstTurn = pendingTurns[0];
    if (firstTurn) {
      parallelBatch.push(pendingTurns.shift()!);
      while (pendingTurns.length > 0 && pendingTurns[0].parentTurnId === firstTurn.parentTurnId && pendingTurns[0].depth === firstTurn.depth) {
        parallelBatch.push(pendingTurns.shift()!);
      }
    }

    if (parallelBatch.length === 0) break;

    const turnResults = await Promise.all(parallelBatch.map(turn => executeSingleTurn(turn)));

    for (const result of turnResults) {
      if (result.finished) {
        persistCurrentExecution();
        return;
      }
    }
  }

  execution.status = 'timeout';
  execution.completedAt = new Date().toISOString();
  execution.metrics = computeMetrics(execution);
  persistCurrentExecution();

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

  async function executeSingleTurn(turn: Turn): Promise<{ finished: boolean }> {
    const team_ = team!;
    const leadRole_ = leadRole!;
    const leadRI_ = leadRI!;

    if (cancelledExecutions.get(execution.id)) {
      return { finished: false };
    }

    if (turn.depth >= execution.config.maxDepth) {
      turn.task += `\n\n[系统提示: 已达最大委派深度 (${execution.config.maxDepth})，请直接汇报结果给上级，不要继续委派]`;
    }

    const prompt = buildTurnPrompt(turn, execution, team_, previousExecutions);

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

    let output: string;
    try {
      const ri = await resolveRoleInstance(team_, turn.role);
      const inst = ri?.instance || await store.getInstanceRaw(turn.instanceId);
      if (!inst) throw new Error(`Instance not found for role "${turn.role}"`);

      await store.markUsedByTeam(ownerId, inst.id);
      const sessionKey = await store.getTeamSessionKey(ownerId, teamId, inst.id);
      output = await callInstance(inst, prompt, ownerId, broadcastToOwner, execution.id, turn, sessionKey, teamId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const isCancelAbort = cancelledExecutions.get(execution.id) || errMsg === 'This operation was aborted';

      turn.status = 'failed';
      turn.completedAt = new Date().toISOString();
      turn.durationMs = new Date(turn.completedAt).getTime() - new Date(turn.startedAt!).getTime();
      turn.output = isCancelAbort ? '执行被用户取消' : errMsg;
      execution.turns.push(turn);

      if (isCancelAbort) {
        return { finished: false };
      }

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

      roleFailures[turn.role] = (roleFailures[turn.role] || 0) + 1;
      const isLeadRole = turn.role === leadRole_.name;
      const maxRetries = isLeadRole ? leadMaxRetries : execution.config.maxRetriesPerRole;
      const failures = roleFailures[turn.role];

      if (failures < maxRetries) {
        broadcastToOwner(ownerId, {
          type: 'execution:warning',
          payload: { message: `「${turn.role}」执行失败 (${failures}/${maxRetries})，正在重试…`, turnId: turn.id },
          teamId, timestamp: new Date().toISOString(),
        });

        const ri = await resolveRoleInstance(team_, turn.role);
        if (ri) {
          const retryTurn = createTurn(turn.role, ri.instance.id,
            `[系统提示: 上一次执行失败，错误信息: ${turn.output.slice(0, 200)}。请重试以下任务]\n\n${turn.task}`,
            turn.parentTurnId, turn.triggerAction, turn.depth);
          pendingTurns.push(retryTurn);
          broadcastEdge(ownerId, teamId, turn.id, retryTurn.id, 'delegate', broadcastToOwner);
        }
      } else if (isLeadRole) {
        execution.status = 'failed';
        execution.summary = `执行失败：Lead「${turn.role}」连续失败 ${failures} 次`;
        execution.completedAt = new Date().toISOString();
        execution.metrics = computeMetrics(execution);
        persistCurrentExecution();

        broadcastToOwner(ownerId, {
          type: 'execution:completed',
          payload: { executionId: execution.id, summary: execution.summary, graph: buildExecutionGraph(execution), metrics: execution.metrics, goal, teamName: team_.name, status: 'failed' },
          teamId, timestamp: new Date().toISOString(),
        });
        return { finished: true };
      } else {
        broadcastToOwner(ownerId, {
          type: 'execution:warning',
          payload: { message: `「${turn.role}」重试次数耗尽 (${failures}/${maxRetries})，将失败信息上报给上级`, turnId: turn.id },
          teamId, timestamp: new Date().toISOString(),
        });

        const parentTurn = turn.parentTurnId ? execution.turns.find(t => t.id === turn.parentTurnId) : null;
        const escalateRI = parentTurn ? await resolveRoleInstance(team_, parentTurn.role) : leadRI_;
        if (escalateRI) {
          const escalateTask = `「${turn.role}」在执行任务时连续失败 ${failures} 次，已无法完成。\n\n**原始任务**：${turn.task.slice(0, 500)}\n**最后错误**：${turn.output.slice(0, 300)}\n\n请决定如何处理。`;
          const escalateTurn = createTurn(escalateRI.role.name, escalateRI.instance.id, escalateTask, turn.id,
            { type: 'report', summary: `${turn.role} 执行失败 ${failures} 次` }, turn.depth);
          pendingTurns.push(escalateTurn);
          broadcastEdge(ownerId, teamId, turn.id, escalateTurn.id, 'report', broadcastToOwner);
        }
      }
      return { finished: false };
    }

    turn.output = output;
    turn.completedAt = new Date().toISOString();
    turn.durationMs = new Date(turn.completedAt).getTime() - new Date(turn.startedAt!).getTime();
    turn.status = 'completed';
    roleFailures[turn.role] = 0;

    const action = parseActionFromOutput(output);
    turn.action = action;
    execution.turns.push(turn);

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

    if (!action) {
      const isLeadTurn = turn.role === leadRole_.name;
      if (isLeadTurn) {
        execution.status = 'completed';
        execution.summary = output.slice(0, 2000);
        execution.completedAt = new Date().toISOString();
        execution.metrics = computeMetrics(execution);
        await store.addTeamExecutionSummary(ownerId, teamId, goal, execution.summary);
        persistCurrentExecution();
        broadcastToOwner(ownerId, {
          type: 'execution:completed',
          payload: { executionId: execution.id, summary: execution.summary, graph: buildExecutionGraph(execution), metrics: execution.metrics, goal, teamName: team_.name, status: 'completed' },
          teamId, timestamp: new Date().toISOString(),
        });
        return { finished: true };
      }

      const reportTask = `「${turn.role}」完成了任务，以下是其产出（未附带明确操作指令，系统自动汇报给你）：\n\n${output.slice(0, 3000)}`;
      const newTurn = createTurn(leadRole_.name, leadRI_.instance.id, reportTask, turn.id, { type: 'report', summary: output.slice(0, 200) }, turn.depth);
      pendingTurns.push(newTurn);
      broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'report', broadcastToOwner);
      return { finished: false };
    }

    switch (action.type) {
      case 'delegate': {
        const targetRI = await resolveRoleInstance(team_, action.to);
        if (!targetRI) {
          broadcastToOwner(ownerId, { type: 'execution:warning', payload: { message: `角色「${action.to}」不存在或未绑定实例`, turnId: turn.id }, teamId, timestamp: new Date().toISOString() });
          break;
        }
        roleFailures[targetRI.role.name] = 0;
        const newTurn = createTurn(targetRI.role.name, targetRI.instance.id, action.task, turn.id, action, turn.depth + 1);
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'delegate', broadcastToOwner);
        break;
      }

      case 'multi_delegate': {
        for (const sub of action.tasks) {
          const targetRI = await resolveRoleInstance(team_, sub.to);
          if (!targetRI) {
            broadcastToOwner(ownerId, { type: 'execution:warning', payload: { message: `角色「${sub.to}」不存在或未绑定实例`, turnId: turn.id }, teamId, timestamp: new Date().toISOString() });
            continue;
          }
          roleFailures[targetRI.role.name] = 0;
          const delegateAction: DelegateAction = { type: 'delegate', to: sub.to, task: sub.task, context: sub.context };
          const newTurn = createTurn(targetRI.role.name, targetRI.instance.id, sub.task, turn.id, delegateAction, turn.depth + 1);
          pendingTurns.push(newTurn);
          broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'delegate', broadcastToOwner);
        }
        break;
      }

      case 'report': {
        const parentTurn = turn.parentTurnId ? execution.turns.find(t => t.id === turn.parentTurnId) : null;
        const targetRI = parentTurn ? await resolveRoleInstance(team_, parentTurn.role) : leadRI_;
        if (!targetRI) break;

        if (targetRI.role.name === turn.role && turn.role === leadRole_.name) {
          execution.status = 'completed';
          execution.summary = action.summary;
          execution.completedAt = new Date().toISOString();
          execution.metrics = computeMetrics(execution);
          await store.addTeamExecutionSummary(ownerId, teamId, goal, action.summary);
          persistCurrentExecution();
          broadcastToOwner(ownerId, {
            type: 'execution:completed',
            payload: { executionId: execution.id, summary: action.summary, graph: buildExecutionGraph(execution), metrics: execution.metrics, goal, teamName: team_.name },
            teamId, timestamp: new Date().toISOString(),
          });
          return { finished: true };
        }

        const reportTask = `「${turn.role}」向你汇报工作结果：\n\n**汇报摘要**：${action.summary}\n\n**详细内容**：\n${output.slice(0, 4000)}`;
        const newTurn = createTurn(targetRI.role.name, targetRI.instance.id, reportTask, turn.id, action, turn.depth);
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'report', broadcastToOwner);
        break;
      }

      case 'feedback': {
        const targetRI = await resolveRoleInstance(team_, action.to);
        if (!targetRI) {
          broadcastToOwner(ownerId, { type: 'execution:warning', payload: { message: `反馈目标角色「${action.to}」不存在或未绑定实例`, turnId: turn.id }, teamId, timestamp: new Date().toISOString() });
          break;
        }
        roleFailures[targetRI.role.name] = 0;
        const feedbackTask = `「${turn.role}」对你的工作提出了反馈，请根据反馈修改：\n\n**问题**：${action.issue}${action.suggestion ? `\n**建议**：${action.suggestion}` : ''}\n\n**原始上下文**：\n${output.slice(0, 3000)}`;
        const newTurn = createTurn(targetRI.role.name, targetRI.instance.id, feedbackTask, turn.id, action, turn.depth);
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'feedback', broadcastToOwner);
        break;
      }

      case 'done': {
        if (turn.role === leadRole_.name) {
          execution.status = 'completed';
          execution.summary = action.summary;
          execution.completedAt = new Date().toISOString();
          execution.metrics = computeMetrics(execution);
          await store.addTeamExecutionSummary(ownerId, teamId, goal, action.summary);
          persistCurrentExecution();
          broadcastToOwner(ownerId, {
            type: 'execution:completed',
            payload: { executionId: execution.id, summary: action.summary, graph: buildExecutionGraph(execution), metrics: execution.metrics, goal, teamName: team_.name },
            teamId, timestamp: new Date().toISOString(),
          });
          return { finished: true };
        }

        const reportTask = `「${turn.role}」认为任务已完成并汇报：\n\n${action.summary}\n\n**详细内容**：\n${output.slice(0, 4000)}`;
        const newTurn = createTurn(leadRole_.name, leadRI_.instance.id, reportTask, turn.id, { type: 'report', summary: action.summary }, turn.depth);
        pendingTurns.push(newTurn);
        broadcastEdge(ownerId, teamId, turn.id, newTurn.id, 'report', broadcastToOwner);
        break;
      }
    }

    return { finished: false };
  }
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
