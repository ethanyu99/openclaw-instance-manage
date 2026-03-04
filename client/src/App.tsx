import { useState, useEffect, useCallback } from 'react';
import { StatusBar } from '@/components/StatusBar';
import { InstanceCard } from '@/components/InstanceCard';
import { AddInstanceDialog } from '@/components/AddInstanceDialog';
import { TaskInput } from '@/components/TaskInput';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { CreateTeamDialog } from '@/components/CreateTeamDialog';
import { TeamCard } from '@/components/TeamCard';
import { useInstanceManager } from '@/hooks/useInstanceManager';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchTeams } from '@/lib/api';
import type { TeamPublic } from '@shared/types';

type ViewTab = 'instances' | 'teams';

export default function App() {
  const { instances, stats, taskStreams, connected, dispatchTask, dispatchTeamTask, teamLogs, refreshInstances } = useInstanceManager();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('instances');
  const [teams, setTeams] = useState<TeamPublic[]>([]);

  const loadTeams = useCallback(async () => {
    try {
      const data = await fetchTeams();
      setTeams(data.teams);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleTeamRefresh = useCallback(() => {
    loadTeams();
    refreshInstances();
  }, [loadTeams, refreshInstances]);

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fa] text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      <StatusBar
        stats={stats}
        instances={instances}
        connected={connected}
        onHistoryClick={() => setHistoryOpen(true)}
      />

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="h-full flex flex-col relative z-10">
          <div className="px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5 border border-border/50">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-all ${
                  activeTab === 'instances'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('instances')}
              >
                Instances ({instances.length})
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-all ${
                  activeTab === 'teams'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('teams')}
              >
                Teams ({teams.length})
              </button>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'instances' ? (
                <AddInstanceDialog onCreated={refreshInstances} />
              ) : (
                <CreateTeamDialog onCreated={handleTeamRefresh} />
              )}
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0 px-2">
            {activeTab === 'instances' ? (
              <div className="p-6 pt-2 grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {instances.length === 0 ? (
                  <div className="col-span-full text-center py-32 text-muted-foreground bg-card/50 rounded-xl border border-dashed border-border/60 backdrop-blur-sm">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <span className="text-2xl">⚡️</span>
                    </div>
                    <p className="text-xl font-semibold mb-2 text-foreground/80">No instances configured</p>
                    <p className="text-sm">Add an instance to get your Lobster Squad started</p>
                  </div>
                ) : (
                  instances.map(inst => (
                    <InstanceCard
                      key={inst.id}
                      instance={inst}
                      taskStream={taskStreams[inst.id]}
                      onRefresh={refreshInstances}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="p-6 pt-2 grid gap-6 grid-cols-1 lg:grid-cols-2">
                {teams.length === 0 ? (
                  <div className="col-span-full text-center py-32 text-muted-foreground bg-card/50 rounded-xl border border-dashed border-border/60 backdrop-blur-sm">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <span className="text-2xl">👥</span>
                    </div>
                    <p className="text-xl font-semibold mb-2 text-foreground/80">No teams yet</p>
                    <p className="text-sm mb-4">Create a team from a template or define custom roles</p>
                    <CreateTeamDialog onCreated={handleTeamRefresh} />
                  </div>
                ) : (
                  teams.map(team => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      instances={instances}
                      onRefresh={handleTeamRefresh}
                    />
                  ))
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Team execution log */}
      {teamLogs.length > 0 && (
        <div className="border-t border-border/60 bg-card/95 px-6 py-3 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Team Execution</span>
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                // Clear team logs - access via the hook is read-only, so we'd need a setter
                // For now just keep showing
              }}
            >
              {teamLogs[teamLogs.length - 1]?.phase === 'team:complete' || teamLogs[teamLogs.length - 1]?.phase === 'team:error' ? 'Done' : 'Running...'}
            </button>
          </div>
          <div className="space-y-1">
            {teamLogs.slice(-20).map((log, i) => (
              <div key={i} className="text-xs text-foreground/80">
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <TaskInput instances={instances} teams={teams} onDispatch={dispatchTask} onTeamDispatch={dispatchTeamTask} />

      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
