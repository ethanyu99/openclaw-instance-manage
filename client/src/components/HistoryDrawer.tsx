import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trash2, Monitor, Zap, Loader2 } from 'lucide-react';
import { fetchSessionsPaginated, deleteSessionApi, clearSessionsApi, clearExecutionsApi, deleteExecutionApi } from '@/lib/api';
import type { SessionRecord } from '@shared/types';
import type { ExecutionHistory } from '@/hooks/types';
import { SessionDetailDialog } from '@/components/SessionDetailDialog';

type HistoryTab = 'sessions' | 'executions';

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executions?: ExecutionHistory[];
  onViewExecution?: (exec: ExecutionHistory) => void;
}

const SESSION_PAGE_SIZE = 20;

export function HistoryDrawer({ open, onOpenChange, executions = [], onViewExecution }: HistoryDrawerProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>('sessions');

  const fetchPage = useCallback(async (page: number, replace: boolean) => {
    try {
      const data = await fetchSessionsPaginated({ page, limit: SESSION_PAGE_SIZE });
      setSessions(prev => replace ? data.data : [...prev, ...data.data]);
      setSessionsPage(page);
      setSessionsHasMore(data.pagination.hasMore);
      setSessionsTotal(data.pagination.total);
    } catch (err) {
      console.warn('Failed to fetch sessions:', err);
    }
  }, []);

  const refresh = useCallback(() => fetchPage(1, true), [fetchPage]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    await fetchPage(sessionsPage + 1, false);
    setLoadingMore(false);
  }, [fetchPage, sessionsPage]);

  useEffect(() => {
    if (open) refresh(); // eslint-disable-line react-hooks/set-state-in-effect -- Fetch data when drawer opens
  }, [open, refresh]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const handleClearAll = async () => {
    if (tab === 'sessions') {
      if (!confirm('Clear all session history?')) return;
      await clearSessionsApi();
      setSessions([]);
      setSessionsTotal(0);
      setSessionsHasMore(false);
    } else {
      if (!confirm('Clear all execution history?')) return;
      await clearExecutionsApi();
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionKey: string) => {
    e.stopPropagation();
    await deleteSessionApi(sessionKey);
    refresh();
  };

  const handleDeleteExecution = async (e: React.MouseEvent, execId: string) => {
    e.stopPropagation();
    await deleteExecutionApi(execId);
  };

  const handleSessionClick = (session: SessionRecord) => {
    setSelectedSession(session);
    setDetailOpen(true);
  };

  // Group sessions by date
  const grouped = sessions.reduce<Record<string, SessionRecord[]>>((acc, session) => {
    const date = new Date(session.updatedAt).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(session);
    return acc;
  }, {});

  // Group autonomous executions by date
  const execGrouped = (executions ?? []).reduce<Record<string, ExecutionHistory[]>>((acc, exec) => {
    const date = exec.createdAt ? new Date(exec.createdAt).toLocaleDateString() : 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(exec);
    return acc;
  }, {});

  const currentCount = tab === 'sessions' ? sessionsTotal : executions.length;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex flex-col p-0">
          <SheetHeader className="p-6 pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-mono text-base flex items-center gap-2">
                <span className="text-blue-500">~/history</span>
              </SheetTitle>
              {currentCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={handleClearAll}
                >
                  <Trash2 className="h-3 w-3 mr-1.5" />
                  Clear All
                </Button>
              )}
            </div>
            <SheetDescription className="font-mono text-xs mt-1">
              {currentCount} {tab === 'sessions' ? 'sessions' : 'executions'}
            </SheetDescription>
          </SheetHeader>

          {/* Tab switcher */}
          <div className="px-6 pb-3">
            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5 border border-border/50">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-all ${
                  tab === 'sessions'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setTab('sessions')}
              >
                <Monitor className="h-3 w-3" />
                Sessions ({sessionsTotal})
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-all ${
                  tab === 'executions'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setTab('executions')}
              >
                <Zap className="h-3 w-3" />
                Executions ({executions.length})
              </button>
            </div>
          </div>

          <Separator />

          <ScrollArea className="flex-1">
            {tab === 'sessions' && (
              sessions.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  No session history
                </div>
              ) : (
                <div className="p-2">
                  {Object.entries(grouped).map(([date, dateSessions]) => (
                    <div key={date} className="mb-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                        <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
                          {date}
                        </p>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                      <div className="space-y-1">
                        {dateSessions.map(session => (
                            <div
                              key={session.sessionKey}
                              className="w-full text-left px-3 py-2 rounded-sm hover:bg-muted/50 border border-transparent hover:border-border transition-colors group relative cursor-pointer flex flex-col gap-1.5"
                              onClick={() => handleSessionClick(session)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="text-xs font-mono text-primary font-medium truncate">
                                    {session.instanceName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 h-4">
                                  <span className="text-[10px] text-muted-foreground font-mono group-hover:hidden">
                                    {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-destructive hidden group-hover:flex -my-0.5"
                                    onClick={(e) => handleDeleteSession(e, session.sessionKey)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              {session.topic ? (
                                <p className="text-[11px] truncate text-foreground/70">
                                  <span className="text-blue-500 mr-1.5">❯</span>
                                  {session.topic}
                                </p>
                              ) : (
                                <p className="text-[11px] truncate text-muted-foreground font-mono">
                                  <span className="text-blue-500 mr-1.5">❯</span>
                                  {session.sessionKey.slice(0, 30)}
                                </p>
                              )}
                            </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {sessionsHasMore && (
                    <div className="flex justify-center py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs font-mono"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          `Load more (${sessionsTotal - sessions.length}  remaining)`
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )
            )}

            {tab === 'executions' && (
              executions.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  No execution history
                </div>
              ) : (
                <div className="p-2">
                  {Object.entries(execGrouped).map(([date, dateExecs]) => (
                    <div key={date} className="mb-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                        <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
                          {date}
                        </p>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                      <div className="space-y-1">
                        {dateExecs.map(exec => (
                          <div
                            key={exec.id}
                            className="w-full text-left px-3 py-2.5 rounded-sm hover:bg-muted/50 border border-transparent hover:border-border transition-colors group relative cursor-pointer flex flex-col gap-1.5"
                            onClick={() => onViewExecution?.(exec)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                  <Zap className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                </div>
                                <span className="text-xs font-semibold text-foreground truncate">
                                  {exec.teamName}
                                </span>
                                <Badge
                                  variant={exec.status === 'completed' ? 'secondary' : exec.status === 'failed' ? 'destructive' : exec.status === 'timeout' ? 'outline' : 'default'}
                                  className="text-[9px] font-mono h-4 px-1 rounded-sm shrink-0"
                                >
                                  {exec.turns?.length ?? 0} turns
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 h-4">
                                <span className="text-[10px] text-muted-foreground font-mono group-hover:hidden">
                                  {new Date(exec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-muted-foreground hover:text-destructive hidden group-hover:flex -my-0.5"
                                  onClick={(e) => handleDeleteExecution(e, exec.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-[11px] truncate text-muted-foreground">
                              <span className="text-blue-500 mr-1.5">❯</span>
                              {exec.goal}
                            </p>
                            {exec.summary && (
                              <p className="text-[10px] text-muted-foreground/70 truncate">
                                {exec.summary.slice(0, 80)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <SessionDetailDialog
        session={selectedSession}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
