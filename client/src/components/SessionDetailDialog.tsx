import { type ComponentProps, useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SessionRecord, SessionDetail, SessionExchangeRecord } from '@shared/types';
import { fetchSessionDetail } from '@/lib/api';

interface SessionDetailDialogProps {
  session: SessionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskStream?: string;
  fetchDetail?: (sessionKey: string) => Promise<SessionDetail>;
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

export function SessionDetailDialog({ session, open, onOpenChange, taskStream, fetchDetail }: SessionDetailDialogProps) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const lastStreamContentRef = useRef<string>('');
  const refetchAfterCompleteRef = useRef(false);

  const sessionKey = session?.sessionKey;
  const doFetch = fetchDetail ?? fetchSessionDetail;

  useEffect(() => {
    if (open && sessionKey) {
      setLoading(true);
      refetchAfterCompleteRef.current = false;
      doFetch(sessionKey)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));
    } else {
      setDetail(null);
      lastStreamContentRef.current = '';
    }
  }, [open, sessionKey]);

  useEffect(() => {
    if (!open || !sessionKey || loading) return;
    const exchanges = detail?.exchanges ?? [];
    const hasRunning = exchanges.some(e => e.status === 'running');
    if (hasRunning && !taskStream && lastStreamContentRef.current && !refetchAfterCompleteRef.current) {
      refetchAfterCompleteRef.current = true;
      setLoading(true);
      doFetch(sessionKey)
        .then((d) => {
          setDetail(d);
          lastStreamContentRef.current = '';
        })
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));
    }
  }, [open, sessionKey, loading, taskStream, detail?.exchanges]);

  if (!session) return null;

  const exchanges: SessionExchangeRecord[] = detail?.exchanges || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[85vh] flex flex-col overflow-hidden p-0">
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
            <span className="text-muted-foreground">Total records: {exchanges.length}</span>
            <span className="mx-2 opacity-50">|</span>
            <span className="text-muted-foreground">Init: {new Date(session.createdAt).toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto px-6 py-6 bg-zinc-50/50 dark:bg-zinc-950/50">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : (
            <div className="space-y-6">
              {[...exchanges].reverse().map((exchange) => (
                <div key={exchange.id} className="font-mono text-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-[10px] text-muted-foreground mt-1 shrink-0 w-16">
                      {new Date(exchange.timestamp).toLocaleTimeString([], { hour12: false })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                        <span className="text-blue-500 font-bold shrink-0">❯</span>
                        <span className="text-primary font-medium flex-1 min-w-0 whitespace-pre-wrap break-words">{exchange.input}</span>
                        <Badge variant={statusVariant[exchange.status] || 'outline'} className="text-[9px] h-4 rounded-sm uppercase tracking-wider shrink-0 whitespace-nowrap flex-shrink-0">
                          {exchange.status}
                        </Badge>
                      </div>

                      <div className="pl-4 border-l-2 border-muted/60 dark:border-muted/30 mt-2 min-w-0">
                        {exchange.output ? (
                          <div className="py-1 min-w-0 font-sans break-words overflow-visible">
                            <MarkdownContent content={exchange.output} />
                            {exchange.completedAt && (
                              <p className="text-[10px] text-muted-foreground font-mono mt-3 opacity-60">
                                [Process exited at {new Date(exchange.completedAt).toLocaleTimeString([], { hour12: false })}]
                              </p>
                            )}
                          </div>
                        ) : exchange.status === 'running' && taskStream ? (
                          <div className="py-1 min-w-0 font-sans break-words">
                            {(() => {
                              lastStreamContentRef.current = taskStream;
                              return <MarkdownContent content={taskStream} />;
                            })()}
                            <div className="flex items-center gap-2 text-muted-foreground mt-2">
                              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                              <span className="text-[11px]">Streaming...</span>
                            </div>
                          </div>
                        ) : exchange.status === 'running' && lastStreamContentRef.current ? (
                          <div className="py-1 min-w-0 font-sans break-words">
                            <MarkdownContent content={lastStreamContentRef.current} />
                            <div className="flex items-center gap-2 text-muted-foreground mt-2">
                              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                              <span className="text-[11px]">正在加载最终结果…</span>
                            </div>
                          </div>
                        ) : exchange.summary ? (
                          <div className="py-1 min-w-0 font-sans break-words opacity-80">
                            <MarkdownContent content={exchange.summary} />
                          </div>
                        ) : exchange.status === 'running' ? (
                          <div className="py-3 text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                              <span className="text-[11px]">Executing...</span>
                            </div>
                            <p className="text-[11px] mt-2 opacity-70">正在执行，输出将在此处流式显示</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
