import { useState } from 'react';
import { StatusBar } from '@/components/StatusBar';
import { InstanceCard } from '@/components/InstanceCard';
import { AddInstanceDialog } from '@/components/AddInstanceDialog';
import { TaskInput } from '@/components/TaskInput';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { useInstanceManager } from '@/hooks/useInstanceManager';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function App() {
  const { instances, stats, taskStreams, connected, dispatchTask, refreshInstances } = useInstanceManager();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fa] text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      <StatusBar
        stats={stats}
        instances={instances}
        connected={connected}
        onHistoryClick={() => setHistoryOpen(true)}
      />

      <div className="flex-1 overflow-hidden relative">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        <div className="h-full flex flex-col relative z-10">
          <div className="px-8 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight text-muted-foreground uppercase">
              Instances ({instances.length})
            </h2>
            <AddInstanceDialog onCreated={refreshInstances} />
          </div>
          <ScrollArea className="flex-1 min-h-0 px-2">
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
          </ScrollArea>
        </div>
      </div>

      <TaskInput instances={instances} onDispatch={dispatchTask} />

      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
