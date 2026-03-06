import { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, ChevronDown, Loader2, User, Copy, Check, LogOut, Bell, BellOff } from 'lucide-react';
import type { InstancePublic, InstanceStats } from '@shared/types';
import { getUserId } from '@/lib/user';
import { useAuth } from '@/hooks/useAuth';

interface StatusBarProps {
  stats: InstanceStats;
  instances: InstancePublic[];
  connected: boolean;
  onHistoryClick: () => void;
  notifSupported?: boolean;
  notifEnabled?: boolean;
  onToggleNotif?: () => void;
}

function UserBadge() {
  const [copied, setCopied] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const { user, logout } = useAuth();
  const fullId = getUserId();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [fullId]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDetail(prev => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
        title={user?.email}
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-4 w-4 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <User className="h-3 w-3" />
        )}
        <span className="font-medium">
          {user?.name || user?.email?.split('@')[0] || fullId.slice(0, 8)}
        </span>
      </button>
      {showDetail && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDetail(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-border bg-card p-3 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-3 mb-3">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full ring-2 ring-border" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground">User ID</span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <><Check className="h-3 w-3 text-emerald-500" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
              </button>
            </div>
            <div className="font-mono text-[11px] text-muted-foreground bg-muted/40 px-2 py-1.5 rounded border border-border/50 break-all select-all mb-3">
              {fullId}
            </div>
            <button
              type="button"
              onClick={() => { setShowDetail(false); logout(); }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 dark:text-red-400 transition-colors"
            >
              <LogOut className="h-3 w-3" />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function StatusBar({ stats, instances, connected, onHistoryClick, notifSupported, notifEnabled, onToggleNotif }: StatusBarProps) {
  const [expanded, setExpanded] = useState(false);

  const busyInstances = useMemo(
    () => instances.filter(i => i.status === 'busy' && i.currentTask),
    [instances],
  );

  return (
    <div className="border-b border-border/80 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-20 shadow-sm">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Lobster Squad" className="w-6 h-6" />
            <h1 className="text-base font-bold tracking-tight text-foreground">Lobster Squad</h1>
          </div>
          <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground/80 bg-muted/50 px-3 py-1.5 rounded-full border border-border/50">
            <span>
              Instances{' '}
              <span className="font-mono font-bold text-foreground ml-1">
                {stats.online + stats.busy}/{stats.total}
              </span>
            </span>
            <span className="text-border">|</span>
            {busyInstances.length > 0 ? (
              <button
                type="button"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                onClick={() => setExpanded(prev => !prev)}
              >
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                Running: <span className="text-foreground font-bold">{stats.busy}</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                Running: <span className="text-foreground">{stats.busy}</span>
              </span>
            )}
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
          <UserBadge />
          {notifSupported && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${notifEnabled ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={onToggleNotif}
              title={notifEnabled ? 'Notifications enabled' : 'Enable notifications'}
            >
              {notifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </Button>
          )}
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

      {busyInstances.length > 0 && expanded && (
        <div className="border-t border-border/50 bg-emerald-50/40 dark:bg-emerald-950/10 px-6 py-2.5 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
          {busyInstances.map(inst => (
            <div key={inst.id} className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2 shrink-0 min-w-[120px]">
                <Loader2 className="h-3 w-3 text-emerald-600 animate-spin" />
                <span className="font-semibold text-foreground truncate">{inst.name}</span>
              </div>
              <span className="text-border shrink-0">—</span>
              <span className="text-muted-foreground truncate flex-1" title={inst.currentTask!.content}>
                {inst.currentTask!.content}
              </span>
              {inst.currentTask!.summary && (
                <>
                  <span className="text-border shrink-0">|</span>
                  <span className="text-emerald-700 dark:text-emerald-400 truncate max-w-[300px] font-medium" title={inst.currentTask!.summary}>
                    {inst.currentTask!.summary}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
