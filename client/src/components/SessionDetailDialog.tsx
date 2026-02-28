import { type ComponentProps } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
    <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 text-sm text-zinc-100">{children}</pre>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return <code className={`${className} text-[13px] leading-relaxed`}>{children}</code>;
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
    <div className="prose prose-sm dark:prose-invert max-w-none break-words
      prose-headings:mt-4 prose-headings:mb-2
      prose-p:my-2 prose-p:leading-relaxed
      prose-ul:my-2 prose-ol:my-2
      prose-li:my-0.5
      prose-hr:my-4
      prose-pre:my-2 prose-pre:p-0 prose-pre:bg-transparent"
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

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 px-6 pb-6">
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
