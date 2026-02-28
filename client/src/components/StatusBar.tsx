import { Badge } from '@/components/ui/badge';
import type { InstanceStats } from '@shared/types';

interface StatusBarProps {
  stats: InstanceStats;
  connected: boolean;
}

export function StatusBar({ stats, connected }: StatusBarProps) {
  return (
    <div className="border-b bg-card px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold tracking-tight">OpenClaw Console</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Instances{' '}
            <span className="font-mono font-medium text-foreground">
              {stats.online + stats.busy}/{stats.total}
            </span>
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Running: {stats.busy}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
            Online: {stats.online}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-zinc-400" />
            Offline: {stats.offline}
          </span>
        </div>
      </div>
      <Badge variant={connected ? 'default' : 'destructive'} className="text-xs">
        {connected ? 'Connected' : 'Disconnected'}
      </Badge>
    </div>
  );
}
