import { type ComponentProps } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SessionHistory } from '@/lib/storage';

interface SessionDetailDialogProps {
  session: SessionHistory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'secondary',
  running: 'default',
  pending: 'outline',
  failed: 'destructive',
};

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

export function SessionDetailDialog({ session, open, onOpenChange }: SessionDetailDialogProps) {
  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-base font-mono flex items-center gap-2">
              <span className="text-blue-500">~/sessions</span>
            </DialogTitle>
            <Badge variant="outline" className="text-[11px] font-mono bg-muted/50">
              {session.instanceName}
            </Badge>
          </div>
          <DialogDescription className="text-xs font-mono mt-1.5">
            <span className="text-muted-foreground">Total records: {session.exchanges.length}</span>
            <span className="mx-2 opacity-50">|</span>
            <span className="text-muted-foreground">Init: {new Date(session.createdAt).toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="space-y-6">
            {[...session.exchanges].reverse().map((exchange, idx) => (
              <div key={exchange.id} className="font-mono text-sm">
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-[10px] text-muted-foreground mt-1 shrink-0 w-16">
                    {new Date(exchange.timestamp).toLocaleTimeString([], { hour12: false })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-blue-500 font-bold">❯</span>
                      <span className="text-primary font-medium flex-1 whitespace-pre-wrap">{exchange.input}</span>
                      <Badge variant={statusVariant[exchange.status] || 'outline'} className="text-[9px] h-4 rounded-sm uppercase tracking-wider shrink-0">
                        {exchange.status}
                      </Badge>
                    </div>

                    <div className="pl-4 border-l-2 border-muted/60 dark:border-muted/30 mt-2">
                      {exchange.output ? (
                        <div className="py-1 overflow-hidden font-sans">
                          <MarkdownContent content={exchange.output} />
                          {exchange.completedAt && (
                            <p className="text-[10px] text-muted-foreground font-mono mt-3 opacity-60">
                              [Process exited at {new Date(exchange.completedAt).toLocaleTimeString([], { hour12: false })}]
                            </p>
                          )}
                        </div>
                      ) : exchange.summary ? (
                        <div className="py-1 overflow-hidden font-sans opacity-80">
                          <MarkdownContent content={exchange.summary} />
                        </div>
                      ) : exchange.status === 'running' ? (
                        <div className="py-2 flex items-center gap-2 text-muted-foreground">
                          <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-[11px]">Executing...</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
