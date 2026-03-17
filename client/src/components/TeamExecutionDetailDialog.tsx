import { useState, type ComponentProps } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronRight, Users, Target, ListChecks, CheckCircle2, XCircle, Clock, SkipForward } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TeamExecutionHistory, TeamStepRecord } from '@/hooks/types';

interface TeamExecutionDetailDialogProps {
  execution: TeamExecutionHistory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const markdownComponents: ComponentProps<typeof ReactMarkdown>['components'] = {
  pre: ({ children }) => (
    <pre className="not-prose overflow-x-auto rounded-md bg-zinc-900 p-3 text-[13px] leading-relaxed text-zinc-100 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    if (className?.startsWith('language-')) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-[13px] dark:bg-zinc-700">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-[13px]
      prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-sm
      prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
      prose-p:my-1.5 prose-p:leading-relaxed prose-p:text-[13px]
      prose-ul:my-1.5 prose-ol:my-1.5
      prose-li:my-0.5 prose-li:text-[13px]
      prose-hr:my-3
      prose-strong:text-[13px]"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

const stepStatusConfig: Record<TeamStepRecord['status'], { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: '已完成' },
  failed: { icon: XCircle, color: 'text-red-500', label: '失败' },
  running: { icon: Clock, color: 'text-blue-500 animate-pulse', label: '执行中' },
  pending: { icon: Clock, color: 'text-zinc-400', label: '等待中' },
  skipped: { icon: SkipForward, color: 'text-zinc-400', label: '已跳过' },
};

function StepCard({ step, defaultExpanded }: { step: TeamStepRecord; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const config = stepStatusConfig[step.status];
  const StatusIcon = config.icon;

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <StatusIcon className={`h-4 w-4 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
            #{step.step}
          </Badge>
          <span className="text-sm font-semibold truncate">{step.role}</span>
        </div>
        <Badge
          variant={step.status === 'completed' ? 'secondary' : step.status === 'failed' ? 'destructive' : 'outline'}
          className="text-[10px] shrink-0"
        >
          {config.label}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t border-border/40">
          {step.task && (
            <div className="px-4 py-2.5 bg-muted/20 border-b border-border/30 min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">任务</p>
              <p className="text-xs text-foreground/90 break-words whitespace-pre-wrap">{step.task}</p>
            </div>
          )}
          {step.output ? (
            <div className="px-4 py-3 max-h-[50vh] min-h-[120px] overflow-y-auto overflow-x-hidden">
              <MarkdownContent content={step.output} />
            </div>
          ) : (
            <div className="px-4 py-4 text-xs text-muted-foreground text-center">
              暂无输出内容
            </div>
          )}
          {(step.startedAt || step.completedAt) && (
            <div className="px-4 py-2 bg-muted/10 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
              {step.startedAt && <span>开始: {new Date(step.startedAt).toLocaleTimeString([], { hour12: false })}</span>}
              {step.completedAt && <span>结束: {new Date(step.completedAt).toLocaleTimeString([], { hour12: false })}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamExecutionDetailDialog({ execution, open, onOpenChange }: TeamExecutionDetailDialogProps) {
  if (!execution) return null;

  const completedSteps = execution.steps.filter(s => s.status === 'completed').length;
  const totalSteps = execution.steps.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                {execution.teamName || '团队执行'}
                <Badge
                  variant={execution.status === 'completed' ? 'secondary' : execution.status === 'failed' ? 'destructive' : 'default'}
                  className="text-[10px]"
                >
                  {execution.status === 'completed' ? '已完成' : execution.status === 'failed' ? '失败' : '执行中'}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                {completedSteps}/{totalSteps} 步骤完成
                <span className="mx-2 opacity-50">|</span>
                {new Date(execution.createdAt).toLocaleString()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {/* Goal */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/40">
              <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">目标</p>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{execution.goal}</p>
              </div>
            </div>

            {/* Plan overview */}
            {execution.plan && execution.plan.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    执行计划 ({execution.plan.length} 步)
                  </p>
                </div>
                <div className="space-y-1 pl-1">
                  {execution.plan.map(p => (
                    <div key={p.step} className="flex items-start gap-2 text-xs text-foreground/80">
                      <span className="text-muted-foreground font-mono w-5 text-right shrink-0 pt-0.5">{p.step}.</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 shrink-0 mt-0.5">{p.assignTo}</Badge>
                      <span className="min-w-0 flex-1 break-words">{p.task}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Step details */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                执行详情
              </p>
              <div className="space-y-2">
                {execution.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">暂无执行步骤记录</p>
                ) : (
                  execution.steps.map(step => (
                    <StepCard key={step.step} step={step} defaultExpanded={execution.steps.length <= 3} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {execution.completedAt && (
          <div className="shrink-0 px-6 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
            <span>
              耗时 {Math.round((new Date(execution.completedAt).getTime() - new Date(execution.createdAt).getTime()) / 1000)}s
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
