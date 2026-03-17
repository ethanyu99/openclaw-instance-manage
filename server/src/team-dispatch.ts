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
import { parseActionFromOutput } from './execution/action-parser';
import { buildTurnPrompt, describeAction } from './execution/prompt-builder';
import { computeMetrics, buildExecutionGraph, toTurnSummary } from './execution/metrics';
import { DEFAULT_CONFIG, toHttpBase } from './execution/types';
import type { BroadcastFn, RoleInstance } from './execution/types';

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

async function callInstanceRaw(
  instance: Instance,
  content: string,
  ownerId: string,
  broadcastToOwner: BroadcastFn,
  executionId: string,
  turn: Turn,
  sessionKey: string,
): Promise<{ text: string; usage: { prompt: number; completion: number } }> {
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
  let tokenUsage = { prompt: 0, completion: 0 };
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
            // Extract token usage
            const usage = output?.usage as Record<string, number> | undefined;
            if (usage) {
              tokenUsage = {
                prompt: usage.input_tokens || usage.prompt_tokens || 0,
                completion: usage.output_tokens || usage.completion_tokens || 0,
              };
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

  return { text: fullText, usage: tokenUsage };
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
): Promise<{ text: string; usage: { prompt: number; completion: number } }> {
  const result = await callInstanceRaw(instance, content, ownerId, broadcastToOwner, executionId, turn, sessionKey);

  if (result.text.trim().length > 0) {
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

  if (retryResult.text.trim().length > 0) {
    return retryResult;
  }

  // Both attempts returned empty
  console.error(`[execution] Turn ${turn.seq} [${instance.name}] still empty after session reset`);
  throw new Error(`No response from ${instance.name} (empty reply after session reset retry)`);
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
      const callResult = await callInstance(inst, prompt, ownerId, broadcastToOwner, execution.id, turn, sessionKey, teamId);
      output = callResult.text;
      turn.tokenUsage = callResult.usage;
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
