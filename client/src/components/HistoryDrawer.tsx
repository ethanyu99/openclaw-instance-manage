import { useState } from 'react';
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
import { Trash2, MessageSquare } from 'lucide-react';
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

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) refresh();
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
          <SheetHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <SheetTitle>Session History</SheetTitle>
              {sessions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={handleClearAll}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            <SheetDescription>
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
                    <p className="text-xs font-medium text-muted-foreground px-3 py-1.5 sticky top-0 bg-background/95 backdrop-blur-sm">
                      {date}
                    </p>
                    <div className="space-y-0.5">
                      {dateSessions.map(session => {
                        const status = latestExchangeStatus(session);
                        return (
                          <button
                            key={session.sessionKey}
                            className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted transition-colors group"
                            onClick={() => handleSessionClick(session)}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-muted-foreground truncate">
                                {session.instanceName}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-5 gap-1 shrink-0">
                                <MessageSquare className="h-2.5 w-2.5" />
                                {session.exchanges.length}
                              </Badge>
                              {status === 'running' && (
                                <Badge variant="default" className="text-[10px] h-5">running</Badge>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                                {new Date(session.updatedAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-sm truncate">{sessionPreview(session)}</p>
                            {session.exchanges.length > 1 && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                Latest: {session.exchanges[session.exchanges.length - 1]?.input}
                              </p>
                            )}
                            <div className="flex items-center mt-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-[10px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity px-1"
                                onClick={(e) => handleDeleteSession(e, session.sessionKey)}
                              >
                                <Trash2 className="h-2.5 w-2.5 mr-0.5" />
                                Delete
                              </Button>
                            </div>
                          </button>
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
