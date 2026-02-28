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
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base">Session Detail</DialogTitle>
            <Badge variant="outline" className="text-xs font-mono">
              {session.instanceName}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            {session.exchanges.length} exchange{session.exchanges.length !== 1 ? 's' : ''}
            {' · '}Started {new Date(session.createdAt).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          <div className="space-y-4">
            {session.exchanges.map((exchange, idx) => (
              <div key={exchange.id}>
                {idx > 0 && <Separator className="mb-4" />}

                <div className="flex items-start gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] mt-0.5 shrink-0">Q{idx + 1}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{exchange.input}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(exchange.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <Badge variant={statusVariant[exchange.status] || 'outline'} className="text-[10px] shrink-0">
                    {exchange.status}
                  </Badge>
                </div>

                {exchange.output ? (
                  <div className="ml-6 rounded-md bg-muted p-3 overflow-hidden">
                    <MarkdownContent content={exchange.output} />
                    {exchange.completedAt && (
                      <p className="text-[10px] text-muted-foreground mt-2 border-t pt-2 border-border/50">
                        Completed {new Date(exchange.completedAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                ) : exchange.summary ? (
                  <div className="ml-6 rounded-md bg-muted p-3 overflow-hidden">
                    <MarkdownContent content={exchange.summary} />
                  </div>
                ) : exchange.status === 'running' ? (
                  <div className="ml-6 rounded-md bg-muted p-3">
                    <p className="text-sm text-muted-foreground italic animate-pulse">Generating...</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
