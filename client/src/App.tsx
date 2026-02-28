import { useState } from 'react';
import { StatusBar } from '@/components/StatusBar';
import { InstanceCard } from '@/components/InstanceCard';
import { AddInstanceDialog } from '@/components/AddInstanceDialog';
import { TaskInput } from '@/components/TaskInput';
import { useInstanceManager } from '@/hooks/useInstanceManager';
import type { Instance } from '@shared/types';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function App() {
  const { instances, stats, taskStreams, connected, dispatchTask, refreshInstances } = useInstanceManager();
  const [_selectedInstance, setSelectedInstance] = useState<Instance | null>(null);

  const handleSelect = (instance: Instance) => {
    setSelectedInstance(instance);
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Top: Status Bar */}
      <StatusBar stats={stats} connected={connected} />

      {/* Middle: Instance Grid */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="px-6 py-3 flex items-center justify-between border-b">
            <h2 className="text-sm font-medium text-muted-foreground">
              Instances ({instances.length})
            </h2>
            <AddInstanceDialog onCreated={refreshInstances} />
          </div>
          <ScrollArea className="flex-1">
            <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {instances.length === 0 ? (
                <div className="col-span-full text-center py-20 text-muted-foreground">
                  <p className="text-lg mb-2">No instances configured</p>
                  <p className="text-sm">Add an OpenClaw instance to get started</p>
                </div>
              ) : (
                instances.map(inst => (
                  <InstanceCard
                    key={inst.id}
                    instance={inst}
                    taskStream={taskStreams[inst.id]}
                    onRefresh={refreshInstances}
                    onSelect={handleSelect}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Bottom: Task Input */}
      <TaskInput instances={instances} onDispatch={dispatchTask} />
    </div>
  );
}
