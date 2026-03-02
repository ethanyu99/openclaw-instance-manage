import { useState, useEffect } from 'react';
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
import { Trash2 } from 'lucide-react';
import { getSessions, clearSessions, deleteSession, type SessionHistory } from '@/lib/storage';
import { SessionDetailDialog } from '@/components/SessionDetailDialog';

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HistoryDrawer({ open, onOpenChange }: HistoryDrawerProps) {
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionHistory | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const refresh = () => setSessions(getSessions());

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const handleClearAll = () => {
    if (!confirm('Clear all session history?')) return;
    clearSessions();
    setSessions([]);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionKey: string) => {
    e.stopPropagation();
    deleteSession(sessionKey);
    refresh();
  };

  const handleSessionClick = (session: SessionHistory) => {
    setSelectedSession(session);
    setDetailOpen(true);
  };

  const latestExchangeStatus = (session: SessionHistory) => {
    const last = session.exchanges[session.exchanges.length - 1];
    return last?.status || 'pending';
  };

  const sessionPreview = (session: SessionHistory) => {
    const first = session.exchanges[0];
    return first?.input || '';
  };

  // Group sessions by date
  const grouped = sessions.reduce<Record<string, SessionHistory[]>>((acc, session) => {
    const date = new Date(session.updatedAt).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(session);
    return acc;
  }, {});

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex flex-col p-0">
          <SheetHeader className="p-6 pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-mono text-base flex items-center gap-2">
                <span className="text-blue-500">~/history</span>
              </SheetTitle>
              {sessions.length > 0 && (
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
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded
            </SheetDescription>
          </SheetHeader>

          <Separator />

          <ScrollArea className="flex-1">
            {sessions.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No session history yet
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
                      {dateSessions.map(session => {
                        const status = latestExchangeStatus(session);
                        return (
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
                                {status === 'running' && (
                                  <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                                )}
                                <Badge variant="secondary" className="text-[9px] font-mono h-4 px-1 rounded-sm shrink-0">
                                  {session.exchanges.length} msg
                                </Badge>
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
                            <p className="text-[11px] truncate text-muted-foreground font-mono">
                              <span className="text-blue-500 mr-1.5">❯</span>
                              {sessionPreview(session)}
                            </p>
                            {session.exchanges.length > 1 && (
                              <p className="text-[11px] text-muted-foreground/70 truncate font-mono">
                                <span className="mr-1.5 opacity-0">❯</span>
                                {session.exchanges[session.exchanges.length - 1]?.input}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
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
