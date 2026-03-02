import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, X, RotateCcw, Layers } from 'lucide-react';
import type { InstancePublic } from '@shared/types';

interface TaskInputProps {
  instances: InstancePublic[];
  onDispatch: (instanceId: string, content: string, instanceName: string, newSession?: boolean) => void;
}

const ALL_OPTION_ID = '__all__';

interface AllOption {
  id: typeof ALL_OPTION_ID;
  name: string;
}

type SuggestionItem = InstancePublic | AllOption;

function isAllOption(item: SuggestionItem): item is AllOption {
  return item.id === ALL_OPTION_ID;
}

export function TaskInput({ instances, onDispatch }: TaskInputProps) {
  const [value, setValue] = useState('');
  const [targetInstances, setTargetInstances] = useState<InstancePublic[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [pendingNewSession, setPendingNewSession] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value.startsWith('@')) {
      setSuggestions([]);
      return;
    }

    const match = value.match(/^@(\S*)/);
    const partial = match ? match[1].toLowerCase() : '';
    const selectedIds = new Set(targetInstances.map(t => t.id));
    const available = instances.filter(i => !selectedIds.has(i.id));
    const filtered = available.filter(i =>
      !partial || i.name.toLowerCase().includes(partial)
    );

    const items: SuggestionItem[] = [];

    if (available.length > 1 && (!partial || 'all'.startsWith(partial))) {
      items.push({ id: ALL_OPTION_ID, name: 'all' });
    }

    items.push(...filtered);
    setSuggestions(items);
    setHighlightIndex(0);
  }, [value, instances, targetInstances]);

  const selectSuggestion = (item: SuggestionItem) => {
    if (isAllOption(item)) {
      setTargetInstances([...instances]);
    } else {
      setTargetInstances(prev => {
        if (prev.some(t => t.id === item.id)) return prev;
        return [...prev, item];
      });
    }
    setValue('');
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const removeTarget = (id: string) => {
    setTargetInstances(prev => prev.filter(i => i.id !== id));
  };

  const clearAllTargets = () => {
    setTargetInstances([]);
    setValue('');
    setPendingNewSession(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetInstances.length === 0) return;

    const content = value.trim();
    if (!content) return;

    for (const inst of targetInstances) {
      onDispatch(inst.id, content, inst.name, pendingNewSession || undefined);
    }
    setValue('');
    setPendingNewSession(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          selectSuggestion(suggestions[highlightIndex]);
          return;
        case 'Enter':
          e.preventDefault();
          selectSuggestion(suggestions[highlightIndex]);
          return;
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex(prev => (prev + 1) % suggestions.length);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex(prev =>
            (prev - 1 + suggestions.length) % suggestions.length
          );
          return;
        case 'Escape':
          e.preventDefault();
          setValue('');
          setSuggestions([]);
          return;
      }
    }

    if (e.key === 'Backspace' && !value && targetInstances.length > 0) {
      removeTarget(targetInstances[targetInstances.length - 1].id);
    }
  };

  const handleNewSession = () => {
    setPendingNewSession(prev => !prev);
    inputRef.current?.focus();
  };

  const isAllSelected =
    targetInstances.length === instances.length && instances.length > 1;

  const isSubmitDisabled =
    suggestions.length > 0 ||
    targetInstances.length === 0 ||
    !value.trim();

  return (
    <div className="border-t bg-card px-6 py-3 space-y-2">
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-0.5 bg-popover border rounded-lg p-1 shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((item, idx) => (
            <button
              key={isAllOption(item) ? ALL_OPTION_ID : item.id}
              className={`px-3 py-1.5 text-sm rounded-md text-left transition-colors flex items-center gap-2 ${
                idx === highlightIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted'
              }`}
              onClick={() => selectSuggestion(item)}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              {isAllOption(item) ? (
                <>
                  <Layers className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                  <span className="font-medium">@all</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    select all {instances.length} instances
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      item.status === 'online'
                        ? 'bg-blue-500'
                        : item.status === 'busy'
                          ? 'bg-emerald-500'
                          : 'bg-zinc-400'
                    }`}
                  />
                  <span>{item.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {item.status}
                  </span>
                </>
              )}
            </button>
          ))}
          {suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No matching instances
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {targetInstances.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap shrink-0">
            {isAllSelected ? (
              <Badge variant="default" className="gap-1 text-xs">
                @all ({instances.length})
                <button
                  type="button"
                  onClick={clearAllTargets}
                  className="ml-0.5 hover:text-primary-foreground/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : (
              targetInstances.map(inst => (
                <Badge key={inst.id} variant="default" className="gap-1 text-xs">
                  @{inst.name}
                  <button
                    type="button"
                    onClick={() => removeTarget(inst.id)}
                    className="ml-0.5 hover:text-primary-foreground/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
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
          onKeyDown={handleKeyDown}
          placeholder={
            targetInstances.length > 0
              ? pendingNewSession
                ? `New session — send message to ${targetInstances.length} instance(s)...`
                : `Send task to ${targetInstances.length} instance(s)... (type @ to add more)`
              : 'Type @ to select instance(s)...'
          }
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={isSubmitDisabled}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
