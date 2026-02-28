import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, History } from 'lucide-react';
import type { Instance } from '@shared/types';
import { getInstanceHistory, clearInstanceHistory, type TaskHistoryEntry } from '@/lib/storage';
import { resolveInstanceByName } from '@/lib/storage';

interface TaskInputProps {
  instances: Instance[];
  onDispatch: (instanceId: string, content: string, instanceName: string) => void;
}

export function TaskInput({ instances, onDispatch }: TaskInputProps) {
  const [value, setValue] = useState('');
  const [targetInstance, setTargetInstance] = useState<Instance | null>(null);
  const [suggestions, setSuggestions] = useState<Instance[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseInput = useCallback((input: string) => {
    const match = input.match(/^@(\S+)\s*/);
    if (match) {
      const name = match[1];
      const resolved = resolveInstanceByName(name, instances);
      if (resolved) {
        setTargetInstance(resolved);
        setSuggestions([]);
      } else {
        setTargetInstance(null);
        const lower = name.toLowerCase();
        setSuggestions(instances.filter(i => i.name.toLowerCase().includes(lower)));
      }
    } else if (input.startsWith('@')) {
      setTargetInstance(null);
      const partial = input.slice(1).toLowerCase();
      setSuggestions(partial ? instances.filter(i => i.name.toLowerCase().includes(partial)) : instances);
    } else {
      setTargetInstance(null);
      setSuggestions([]);
    }
  }, [instances]);

  useEffect(() => {
    parseInput(value);
  }, [value, parseInput]);

  useEffect(() => {
    if (targetInstance) {
      setHistory(getInstanceHistory(targetInstance.id));
    }
  }, [targetInstance]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInstance) return;

    const match = value.match(/^@\S+\s+(.*)/);
    const content = match ? match[1].trim() : value.trim();
    if (!content) return;

    onDispatch(targetInstance.id, content, targetInstance.name);
    setValue(`@${targetInstance.name} `);
    setHistory(getInstanceHistory(targetInstance.id));
  };

  const selectSuggestion = (inst: Instance) => {
    setTargetInstance(inst);
    setValue(`@${inst.name} `);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const clearTarget = () => {
    setTargetInstance(null);
    setValue('');
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const handleClearHistory = () => {
    if (targetInstance) {
      clearInstanceHistory(targetInstance.id);
      setHistory([]);
    }
  };

  return (
    <div className="border-t bg-card px-6 py-3 space-y-2">
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(inst => (
            <button
              key={inst.id}
              className="px-2.5 py-1 text-xs rounded-md bg-muted hover:bg-accent transition-colors flex items-center gap-1.5"
              onClick={() => selectSuggestion(inst)}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                inst.status === 'online' ? 'bg-blue-500' :
                inst.status === 'busy' ? 'bg-emerald-500' : 'bg-zinc-400'
              }`} />
              {inst.name}
            </button>
          ))}
        </div>
      )}

      {/* Task history panel */}
      {showHistory && targetInstance && (
        <div className="rounded-md border bg-muted/50 max-h-48">
          <div className="flex items-center justify-between px-3 py-1.5 border-b">
            <span className="text-xs font-medium">Task History - {targetInstance.name}</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearHistory}>
              Clear
            </Button>
          </div>
          <ScrollArea className="max-h-36">
            <div className="p-2 space-y-1.5">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No task history</p>
              ) : (
                history.map(entry => (
                  <div key={entry.id} className="text-xs flex items-start gap-2 py-1">
                    <Badge
                      variant={
                        entry.status === 'completed' ? 'secondary' :
                        entry.status === 'running' ? 'default' : 'outline'
                      }
                      className="text-[10px] shrink-0 mt-0.5"
                    >
                      {entry.status}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate">{entry.content}</p>
                      {entry.summary && (
                        <p className="text-muted-foreground truncate">{entry.summary}</p>
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0 ml-auto">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Input row */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {targetInstance && (
          <div className="flex items-center gap-1">
            <Badge variant="default" className="gap-1 text-xs shrink-0">
              @{targetInstance.name}
              <button type="button" onClick={clearTarget} className="ml-0.5 hover:text-primary-foreground/80">
                <X className="h-3 w-3" />
              </button>
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <Input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={targetInstance
            ? `Send task to ${targetInstance.name}...`
            : 'Type @instance-name to target an instance...'
          }
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!targetInstance || !value.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
