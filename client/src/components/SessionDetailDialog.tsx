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

export function SessionDetailDialog({ session, open, onOpenChange }: SessionDetailDialogProps) {
  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
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

        <ScrollArea className="flex-1 max-h-[65vh]">
          <div className="space-y-4 pr-4">
            {session.exchanges.map((exchange, idx) => (
              <div key={exchange.id}>
                {idx > 0 && <Separator className="mb-4" />}

                {/* User input */}
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

                {/* Assistant output */}
                {exchange.output ? (
                  <div className="ml-6 rounded-md bg-muted p-3">
                    <pre className="text-sm whitespace-pre-wrap break-words font-sans leading-relaxed">
                      {exchange.output}
                    </pre>
                    {exchange.completedAt && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Completed {new Date(exchange.completedAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                ) : exchange.summary ? (
                  <div className="ml-6 rounded-md bg-muted p-3">
                    <p className="text-sm text-muted-foreground">{exchange.summary}</p>
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
