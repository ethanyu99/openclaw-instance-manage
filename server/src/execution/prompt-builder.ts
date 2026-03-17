/**
 * Pure functions for building prompts and formatting execution context.
 * No side effects, no imports of store/redis.
 */
import type {
  Execution, Turn, TurnAction, TeamPublic,
  DelegateAction,
} from '../../../shared/types';

export function buildTurnPrompt(
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

export function buildExecutionSummary(execution: Execution, currentTurn: Turn): string {
  const completed = execution.turns.filter(t => t.status === 'completed');
  if (completed.length === 0) return '（这是第一轮，尚无历史记录）';

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

export function getCausalChain(execution: Execution, turn: Turn): Turn[] {
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

export function buildUpstreamContext(turn: Turn, execution: Execution): string {
  if (!turn.parentTurnId) return '';
  const parent = execution.turns.find(t => t.id === turn.parentTurnId);
  if (!parent || !parent.output) return '';

  const contextLevel = (turn.triggerAction as DelegateAction)?.context;
  let contextContent: string;
  if (contextLevel === 'none') return '';
  else if (contextLevel === 'summary') {
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

export function describeAction(action: TurnAction): string {
  switch (action.type) {
    case 'delegate': return `委派 → ${action.to}：${action.task.slice(0, 60)}`;
    case 'multi_delegate': return `并行委派 → ${action.tasks.map(t => t.to).join('、')}`;
    case 'report': return `汇报：${action.summary.slice(0, 60)}`;
    case 'feedback': return `反馈 → ${action.to}：${action.issue.slice(0, 60)}`;
    case 'done': return `结束：${action.summary.slice(0, 60)}`;
  }
}

export function buildActionInstructions(isLead: boolean, team: TeamPublic): string {
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
