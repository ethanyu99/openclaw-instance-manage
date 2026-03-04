import type { WSMessage, TeamPublic, ClawRole, Instance } from '../../shared/types';
import { store } from './store';
import { logWS, createLogEntry } from './ws-logger';

interface BroadcastFn {
  (ownerId: string, message: WSMessage): void;
}

interface StepResult {
  step: number;
  role: string;
  instanceId: string;
  output: string;
}

function toHttpBase(endpoint: string | undefined): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

function buildLeadPrompt(team: TeamPublic, goal: string): string {
  const memberList = team.roles
    .map(r => `- ${r.name}${r.isLead ? '（你自己）' : ''}：${r.description}  能力：${r.capabilities.join('、')}`)
    .join('\n');

  return `你是团队「${team.name}」的 Lead，负责规划和协调。

## 你的团队成员
${memberList}

## 用户目标
${goal}

## 你的任务
1. 理解用户目标
2. 设计执行方案
3. 将方案拆解为子任务，分配给合适的团队成员
4. 输出结构化的执行计划

## 输出格式要求
请在回复的最后输出一个 JSON 代码块，格式如下：

\`\`\`json
{
  "plan": [
    {
      "step": 1,
      "assignTo": "角色名",
      "task": "具体任务描述",
      "dependencies": [],
      "contextNeeds": []
    },
    {
      "step": 2,
      "assignTo": "角色名",
      "task": "具体任务描述",
      "dependencies": [1],
      "contextNeeds": [
        { "fromStep": 1, "need": "full", "hint": "为什么需要这个上下文" }
      ]
    }
  ]
}
\`\`\`

注意：
- assignTo 必须是团队成员的角色名
- dependencies 是依赖的前置步骤编号数组
- contextNeeds.need 可选值："full"（完整内容）、"summary"（摘要）、"none"
- 你自己（Lead）也可以作为执行者出现在 plan 中`;
}

function buildStepPrompt(
  step: { step: number; assignTo: string; task: string; contextNeeds?: { fromStep: number; need: string; hint?: string }[] },
  role: ClawRole,
  team: TeamPublic,
  goal: string,
  previousResults: StepResult[],
): string {
  let prompt = `你是团队「${team.name}」中的「${role.name}」。
职责：${role.description}

## 团队目标
${goal}

## 你的任务
${step.task}
`;

  if (step.contextNeeds && step.contextNeeds.length > 0) {
    prompt += '\n## 上游参考\n';
    for (const need of step.contextNeeds) {
      const upstream = previousResults.find(r => r.step === need.fromStep);
      if (!upstream) continue;

      const content = need.need === 'summary'
        ? upstream.output.slice(0, 1000) + (upstream.output.length > 1000 ? '\n...(已截断)' : '')
        : upstream.output;

      prompt += `\n### 来自「${upstream.role}」（步骤 ${upstream.step}）\n`;
      if (need.hint) prompt += `> ${need.hint}\n\n`;
      prompt += content + '\n';
    }
  }

  prompt += '\n请开始执行你的任务。';
  return prompt;
}

interface ParsedPlan {
  plan: {
    step: number;
    assignTo: string;
    task: string;
    dependencies: number[];
    contextNeeds?: { fromStep: number; need: string; hint?: string }[];
  }[];
}

function parsePlanFromOutput(output: string): ParsedPlan | null {
  // Try to extract JSON from markdown code block
  const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try to find raw JSON object
  const braceMatch = output.match(/\{[\s\S]*"plan"\s*:\s*\[[\s\S]*\]\s*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // fall through
    }
  }

  return null;
}

async function callInstance(
  instance: Instance,
  content: string,
  ownerId: string,
  broadcastToOwner: BroadcastFn,
  teamId: string,
  stepLabel: string,
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

  const sessionUser = store.getSessionKey(ownerId, instance.id);

  // Reset session for team tasks to avoid context pollution
  store.resetSessionKey(ownerId, instance.id);
  const freshSession = store.getSessionKey(ownerId, instance.id);

  const body = JSON.stringify({
    model: 'openclaw',
    input: content,
    stream: true,
    user: freshSession,
  });

  console.log(`[team-dispatch] Sending to ${instance.name} (${instance.id}) at ${url} [${stepLabel}]`);
  logWS(createLogEntry('outbound', instance.id, instance.name, `[team:${stepLabel}] ${body.slice(0, 200)}`));

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
    const timeout = setTimeout(() => controller.abort(), 600_000);

    console.log(`[team-dispatch] Fetching ${url}...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Connection': 'keep-alive' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    console.log(`[team-dispatch] Response status: ${response.status} from ${instance.name}`);

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;

    console.log(`[team-dispatch] Starting SSE stream read from ${instance.name}`);

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`[team-dispatch] SSE stream ended from ${instance.name}, ${eventCount} events, ${fullText.length} chars`);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          eventCount++;

          if (eventCount <= 3 || eventCount % 50 === 0) {
            console.log(`[team-dispatch] Event #${eventCount} from ${instance.name}: ${event.type}`);
          }

          if (event.type === 'response.output_text.delta' && event.delta) {
            fullText += event.delta;
            broadcastToOwner(ownerId, {
              type: 'task:stream',
              payload: { instanceId: instance.id, chunk: event.delta, summary: event.delta.slice(0, 200) },
              instanceId: instance.id,
              teamId,
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
    console.error(`[team-dispatch] Error from ${instance.name}:`, err instanceof Error ? err.message : err);
    throw err;
  } finally {
    console.log(`[team-dispatch] Finished with ${instance.name}, collected ${fullText.length} chars`);
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

function topologicalSort(steps: ParsedPlan['plan']): ParsedPlan['plan'] {
  const sorted: ParsedPlan['plan'] = [];
  const visited = new Set<number>();
  const stepMap = new Map(steps.map(s => [s.step, s]));

  function visit(step: number) {
    if (visited.has(step)) return;
    visited.add(step);
    const s = stepMap.get(step);
    if (!s) return;
    for (const dep of s.dependencies) {
      visit(dep);
    }
    sorted.push(s);
  }

  for (const s of steps) visit(s.step);
  return sorted;
}

export async function dispatchToTeam(
  ownerId: string,
  teamId: string,
  goal: string,
  broadcastToOwner: BroadcastFn,
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

  const leadMember = team.members.find(m => m.roleId === leadRole.id);
  if (!leadMember?.instanceId) {
    broadcastToOwner(ownerId, {
      type: 'team:error',
      payload: { error: `Lead role "${leadRole.name}" has no bound instance` },
      teamId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const leadInstance = store.getInstanceRaw(leadMember.instanceId);
  if (!leadInstance) {
    broadcastToOwner(ownerId, {
      type: 'team:error',
      payload: { error: 'Lead instance not found' },
      teamId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Phase 1: Send to Lead for planning
  broadcastToOwner(ownerId, {
    type: 'team:step',
    payload: {
      phase: 'planning',
      message: `🎯 Lead「${leadRole.name}」正在规划任务...`,
      role: leadRole.name,
      instanceId: leadInstance.id,
    },
    teamId,
    timestamp: new Date().toISOString(),
  });

  let leadOutput: string;
  try {
    const leadPrompt = buildLeadPrompt(team, goal);
    leadOutput = await callInstance(leadInstance, leadPrompt, ownerId, broadcastToOwner, teamId, 'planning');
  } catch (err) {
    broadcastToOwner(ownerId, {
      type: 'team:error',
      payload: { error: `Lead planning failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
      teamId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Phase 2: Parse execution plan
  const parsed = parsePlanFromOutput(leadOutput);
  if (!parsed || !parsed.plan || parsed.plan.length === 0) {
    broadcastToOwner(ownerId, {
      type: 'team:step',
      payload: {
        phase: 'plan_failed',
        message: 'Lead 未输出有效的执行计划 JSON，直接展示 Lead 的回复。',
        output: leadOutput,
      },
      teamId,
      timestamp: new Date().toISOString(),
    });
    broadcastToOwner(ownerId, {
      type: 'team:complete',
      payload: {
        message: 'Lead 已完成分析（未生成可编排的执行计划）',
        results: [{ step: 0, role: leadRole.name, output: leadOutput }],
      },
      teamId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  broadcastToOwner(ownerId, {
    type: 'team:step',
    payload: {
      phase: 'planned',
      message: `📋 执行计划已生成，共 ${parsed.plan.length} 个步骤`,
      plan: parsed.plan,
    },
    teamId,
    timestamp: new Date().toISOString(),
  });

  // Phase 3: Execute steps in dependency order
  const sortedSteps = topologicalSort(parsed.plan);
  const results: StepResult[] = [];

  for (const step of sortedSteps) {
    const role = team.roles.find(r => r.name === step.assignTo);
    if (!role) {
      broadcastToOwner(ownerId, {
        type: 'team:step',
        payload: {
          phase: 'step_skip',
          step: step.step,
          message: `⚠️ 角色「${step.assignTo}」不存在，跳过步骤 ${step.step}`,
        },
        teamId,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const member = team.members.find(m => m.roleId === role.id);
    if (!member?.instanceId) {
      broadcastToOwner(ownerId, {
        type: 'team:step',
        payload: {
          phase: 'step_skip',
          step: step.step,
          message: `⚠️ 角色「${step.assignTo}」未绑定实例，跳过步骤 ${step.step}`,
        },
        teamId,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const instance = store.getInstanceRaw(member.instanceId);
    if (!instance) {
      broadcastToOwner(ownerId, {
        type: 'team:step',
        payload: {
          phase: 'step_skip',
          step: step.step,
          message: `⚠️ 实例不存在，跳过步骤 ${step.step}`,
        },
        teamId,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    broadcastToOwner(ownerId, {
      type: 'team:step',
      payload: {
        phase: 'step_start',
        step: step.step,
        role: step.assignTo,
        task: step.task,
        instanceId: instance.id,
        message: `🔄 步骤 ${step.step}：「${step.assignTo}」正在执行 — ${step.task}`,
      },
      instanceId: instance.id,
      teamId,
      timestamp: new Date().toISOString(),
    });

    try {
      const prompt = buildStepPrompt(step, role, team, goal, results);
      const output = await callInstance(instance, prompt, ownerId, broadcastToOwner, teamId, `step-${step.step}`);

      results.push({
        step: step.step,
        role: step.assignTo,
        instanceId: instance.id,
        output,
      });

      broadcastToOwner(ownerId, {
        type: 'team:step',
        payload: {
          phase: 'step_done',
          step: step.step,
          role: step.assignTo,
          instanceId: instance.id,
          message: `✅ 步骤 ${step.step}：「${step.assignTo}」已完成`,
          summary: output.slice(0, 300),
        },
        instanceId: instance.id,
        teamId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      broadcastToOwner(ownerId, {
        type: 'team:step',
        payload: {
          phase: 'step_error',
          step: step.step,
          role: step.assignTo,
          message: `❌ 步骤 ${step.step} 失败: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
        teamId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Phase 4: Complete
  broadcastToOwner(ownerId, {
    type: 'team:complete',
    payload: {
      message: `🎉 团队任务完成，共执行 ${results.length} 个步骤`,
      results: results.map(r => ({
        step: r.step,
        role: r.role,
        summary: r.output.slice(0, 500),
      })),
    },
    teamId,
    timestamp: new Date().toISOString(),
  });
}
