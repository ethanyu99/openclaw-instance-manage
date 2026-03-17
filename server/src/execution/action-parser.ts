/**
 * Pure functions for parsing AI output into structured actions.
 * No side effects, no imports of store/redis.
 */
import type { TurnAction } from '../../../shared/types';

export function parseActionFromOutput(output: string): TurnAction | null {
  // Strategy 1: Find the LAST ```json...``` block
  const allJsonBlocks = [...output.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (allJsonBlocks.length > 0) {
    for (let i = allJsonBlocks.length - 1; i >= 0; i--) {
      const raw = allJsonBlocks[i][1].trim();
      try {
        const result = validateAction(JSON.parse(raw));
        if (result) return result;
      } catch { /* try next */ }
    }
  }

  // Strategy 2: Extract JSON by finding balanced braces starting from an "action" key
  const actionStart = output.lastIndexOf('"action"');
  if (actionStart !== -1) {
    const braceStart = output.lastIndexOf('{', actionStart);
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

export function extractBalancedJson(str: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }

  return null;
}

export function validateAction(obj: Record<string, unknown>): TurnAction | null {
  const action = obj.action as string;
  if (!action) return null;

  switch (action) {
    case 'delegate': {
      const to = obj.to as string;
      const task = obj.task as string;
      if (!to || !task) return null;
      return {
        type: 'delegate', to, task,
        context: (['full', 'summary', 'none'].includes(obj.context as string)
          ? obj.context as 'full' | 'summary' | 'none' : 'full'),
        message: (obj.message as string) || undefined,
      };
    }
    case 'multi_delegate': {
      const tasks = obj.tasks as Array<{ to: string; task: string; context?: string }>;
      if (!Array.isArray(tasks) || tasks.length === 0) return null;
      const validTasks = tasks.filter(t => t.to && t.task).map(t => ({
        to: t.to, task: t.task,
        context: (['full', 'summary', 'none'].includes(t.context || '')
          ? t.context as 'full' | 'summary' | 'none' : 'full') as 'full' | 'summary' | 'none',
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
      return { type: 'feedback', to, issue, suggestion: (obj.suggestion as string) || undefined };
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
