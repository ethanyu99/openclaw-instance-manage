import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History } from 'lucide-react';
import type { InstanceStats } from '@shared/types';

interface StatusBarProps {
  stats: InstanceStats;
  connected: boolean;
  onHistoryClick: () => void;
}

export function StatusBar({ stats, connected, onHistoryClick }: StatusBarProps) {
  return (
    <div className="border-b border-border/80 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center shadow-sm">
            <span className="text-primary-foreground font-bold text-xs">OC</span>
          </div>
          <h1 className="text-base font-bold tracking-tight text-foreground">OpenClaw Console</h1>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground/80 bg-muted/50 px-3 py-1.5 rounded-full border border-border/50">
          <span>
            Instances{' '}
            <span className="font-mono font-bold text-foreground ml-1">
              {stats.online + stats.busy}/{stats.total}
            </span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            Running: <span className="text-foreground">{stats.busy}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            Online: <span className="text-foreground">{stats.online}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-zinc-400" />
            Offline: <span className="text-foreground">{stats.offline}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs font-semibold h-8 border-border/80 hover:bg-muted/60"
          onClick={onHistoryClick}
        >
          <History className="h-3.5 w-3.5" />
          History
        </Button>
        <Badge variant={connected ? 'default' : 'destructive'} className="text-[10px] uppercase tracking-wider font-bold h-6 px-2.5 shadow-sm">
          {connected ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>
    </div>
  );
}
