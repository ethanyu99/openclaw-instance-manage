import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, X, RotateCcw } from 'lucide-react';
import type { InstancePublic } from '@shared/types';
import { resolveInstanceByName } from '@/lib/storage';

interface TaskInputProps {
  instances: InstancePublic[];
  onDispatch: (instanceId: string, content: string, instanceName: string, newSession?: boolean) => void;
}

export function TaskInput({ instances, onDispatch }: TaskInputProps) {
  const [value, setValue] = useState('');
  const [targetInstance, setTargetInstance] = useState<InstancePublic | null>(null);
  const [suggestions, setSuggestions] = useState<InstancePublic[]>([]);
  const [pendingNewSession, setPendingNewSession] = useState(false);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInstance) return;

    const match = value.match(/^@\S+\s+(.*)/);
    const content = match ? match[1].trim() : value.trim();
    if (!content) return;

    onDispatch(targetInstance.id, content, targetInstance.name, pendingNewSession || undefined);
    setValue(`@${targetInstance.name} `);
    setPendingNewSession(false);
  };

  const selectSuggestion = (inst: InstancePublic) => {
    setTargetInstance(inst);
    setValue(`@${inst.name} `);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const clearTarget = () => {
    setTargetInstance(null);
    setValue('');
    setPendingNewSession(false);
    inputRef.current?.focus();
  };

  const handleNewSession = () => {
    setPendingNewSession(true);
    inputRef.current?.focus();
  };

  return (
    <div className="border-t bg-card px-6 py-3 space-y-2">
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
              variant={pendingNewSession ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs gap-1 shrink-0"
              onClick={handleNewSession}
              title="Start a new session (reset context)"
            >
              <RotateCcw className="h-3 w-3" />
              {pendingNewSession ? 'New Chat ✓' : 'New Chat'}
            </Button>
          </div>
        )}
        <Input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={targetInstance
            ? pendingNewSession
              ? `New session — send first message to ${targetInstance.name}...`
              : `Send task to ${targetInstance.name} (same session)...`
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
