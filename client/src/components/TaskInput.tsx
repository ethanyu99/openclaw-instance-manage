import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, X, RotateCcw, Layers, ImagePlus, Loader2, Users, Settings2, MessageSquare } from 'lucide-react';
import type { InstancePublic, TeamPublic, ExecutionConfig } from '@shared/types';
import { uploadFiles } from '@/lib/api';
import { useInstanceStore } from '@/stores/instanceStore';

interface TaskInputProps {
  instances: InstancePublic[];
  teams?: TeamPublic[];
  onDispatch: (instanceId: string, content: string, instanceName: string, newSession?: boolean, imageUrls?: string[]) => void;
  onTeamDispatch?: (teamId: string, content: string, newSession?: boolean, config?: Partial<ExecutionConfig>) => void;
  shareMode?: boolean;
}

interface PastedImage {
  id: string;
  file: File;
  preview: string;
}

const ALL_OPTION_ID = '__all__';
const TEAM_PREFIX = '__team__';

interface AllOption {
  id: typeof ALL_OPTION_ID;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
  team: TeamPublic;
}

type SuggestionItem = InstancePublic | AllOption | TeamOption;

function isAllOption(item: SuggestionItem): item is AllOption {
  return item.id === ALL_OPTION_ID;
}

function isTeamOption(item: SuggestionItem): item is TeamOption {
  return item.id.startsWith(TEAM_PREFIX);
}

export function TaskInput({ instances, teams = [], onDispatch, onTeamDispatch, shareMode = false }: TaskInputProps) {
  const activeSessions = useInstanceStore(s => s.activeSessions);
  const [value, setValue] = useState('');
  const [targetInstances, setTargetInstances] = useState<InstancePublic[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamPublic | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [pendingNewSession, setPendingNewSession] = useState(false);
  const [images, setImages] = useState<PastedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [execConfig, setExecConfig] = useState<Partial<ExecutionConfig>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select single instance in share mode (no teams available)
  useEffect(() => {
    if (shareMode && teams.length === 0 && instances.length === 1 && targetInstances.length === 0 && !selectedTeam) {
      setTargetInstances([instances[0]]);
    }
  }, [shareMode, teams.length, instances, targetInstances.length, selectedTeam]);

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

    // Team options
    if (!selectedTeam && teams.length > 0) {
      const filteredTeams = teams.filter(t =>
        !partial || t.name.toLowerCase().includes(partial) || 'team'.startsWith(partial)
      );
      for (const t of filteredTeams) {
        items.push({ id: `${TEAM_PREFIX}${t.id}`, name: t.name, team: t });
      }
    }

    if (!shareMode) {
      if (!selectedTeam && available.length > 1 && (!partial || 'all'.startsWith(partial))) {
        items.push({ id: ALL_OPTION_ID, name: 'all' });
      }

      if (!selectedTeam) {
        items.push(...filtered);
      }
    }

    setSuggestions(items);
    setHighlightIndex(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, instances, teams, targetInstances, selectedTeam]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const selectSuggestion = (item: SuggestionItem) => {
    if (isTeamOption(item)) {
      setSelectedTeam(item.team);
      setTargetInstances([]);
    } else if (isAllOption(item)) {
      setSelectedTeam(null);
      setTargetInstances([...instances]);
    } else {
      setSelectedTeam(null);
      setTargetInstances(prev => {
        if (prev.some(t => t.id === item.id)) return prev;
        return [...prev, item as InstancePublic];
      });
    }
    setValue('');
    setSuggestions([]);
    textareaRef.current?.focus();
  };

  const removeTarget = (id: string) => {
    setTargetInstances(prev => prev.filter(i => i.id !== id));
  };

  const clearAllTargets = () => {
    setTargetInstances([]);
    setSelectedTeam(null);
    setValue('');
    setPendingNewSession(false);
    setImages([]);
    textareaRef.current?.focus();
  };

  const addImages = useCallback((files: File[]) => {
    const newImages = files
      .filter(f => f.type.startsWith('image/'))
      .map(file => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      }));
    if (newImages.length) {
      setImages(prev => [...prev, ...newImages]);
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems
        .map(item => item.getAsFile())
        .filter((f): f is File => f !== null);
      addImages(files);
    }
  }, [addImages]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/')
    );
    addImages(files);
  }, [addImages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleSubmit = async () => {
    if (uploading) return;

    const content = value.trim();
    if (!content && images.length === 0) return;

    // Team mode
    if (selectedTeam) {
      if (!content) return;
      const config = Object.keys(execConfig).length > 0 ? execConfig : undefined;
      onTeamDispatch?.(selectedTeam.id, content, pendingNewSession || undefined, config);
      setValue('');
      setPendingNewSession(false);
      return;
    }

    if (targetInstances.length === 0) return;

    let imageUrls: string[] | undefined;

    if (images.length > 0) {
      setUploading(true);
      try {
        const results = await uploadFiles(images.map(img => img.file));
        imageUrls = results.map(r => r.url);
      } catch (err) {
        console.warn('Image upload failed:', err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    for (const inst of targetInstances) {
      onDispatch(inst.id, content, inst.name, pendingNewSession || undefined, imageUrls);
    }

    for (const img of images) {
      URL.revokeObjectURL(img.preview);
    }

    setValue('');
    setImages([]);
    setPendingNewSession(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    // Enter = submit, Shift+Enter = newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    if (e.key === 'Backspace' && !value && targetInstances.length > 0) {
      removeTarget(targetInstances[targetInstances.length - 1].id);
    }
  };

  const handleNewSession = () => {
    setPendingNewSession(prev => !prev);
    textareaRef.current?.focus();
  };

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      if (input.files) addImages(Array.from(input.files));
    };
    input.click();
  };

  const isAllSelected =
    targetInstances.length === instances.length && instances.length > 1;

  const hasTarget = targetInstances.length > 0 || selectedTeam !== null;

  const isSubmitDisabled =
    uploading ||
    suggestions.length > 0 ||
    !hasTarget ||
    (!value.trim() && images.length === 0);

  return (
    <div className="border-t border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-6 py-4 space-y-2 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.05)] z-10 relative">
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-0.5 bg-popover border border-border/80 rounded-lg p-1.5 shadow-xl max-h-56 overflow-y-auto absolute bottom-full mb-2 left-6 right-6 w-[calc(100%-3rem)] z-50">
          {suggestions.map((item, idx) => (
            <button
              key={isAllOption(item) ? ALL_OPTION_ID : item.id}
              className={`px-3 py-2 text-sm rounded-md text-left transition-all flex items-center gap-2.5 ${
                idx === highlightIndex
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'hover:bg-muted/60'
              }`}
              onClick={() => selectSuggestion(item)}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              {isTeamOption(item) ? (
                <>
                  <div className="flex items-center justify-center w-5 h-5 rounded bg-violet-100 dark:bg-violet-900/30">
                    <Users className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                  </div>
                  <span className="font-semibold tracking-tight">@team:{item.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto font-medium">
                    {item.team.roles.length} roles
                  </span>
                </>
              ) : isAllOption(item) ? (
                <>
                  <div className="flex items-center justify-center w-5 h-5 rounded bg-purple-100 dark:bg-purple-900/30">
                    <Layers className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  </div>
                  <span className="font-semibold tracking-tight">@all</span>
                  <span className="text-xs text-muted-foreground ml-auto font-medium">
                    select all {instances.length} instances
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 shadow-sm ${
                      (item as InstancePublic).status === 'online'
                        ? 'bg-blue-500'
                        : (item as InstancePublic).status === 'busy'
                          ? 'bg-emerald-500'
                          : 'bg-zinc-400'
                    }`}
                  />
                  <span className="font-medium">{item.name}</span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground ml-auto bg-muted px-1.5 py-0.5 rounded-sm">
                    {(item as InstancePublic).status}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      <div
        className="flex flex-col bg-background border border-border/80 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-ring/50 transition-all overflow-hidden"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex items-center gap-2 px-3 pt-3 pb-1 flex-wrap">
            {images.map(img => (
              <div key={img.id} className="relative group">
                <img
                  src={img.preview}
                  alt="preview"
                  className="w-16 h-16 object-cover rounded-lg border border-border/60 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Target badges row */}
        {(targetInstances.length > 0 || selectedTeam) && (
          <div className="flex items-center gap-1.5 flex-wrap px-3 pt-2.5 pb-0.5">
            {selectedTeam ? (
              <Badge variant="default" className="gap-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700">
                <Users className="h-3 w-3" />
                @team:{selectedTeam.name}
                <button
                  type="button"
                  onClick={clearAllTargets}
                  className="ml-0.5 hover:text-primary-foreground/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : isAllSelected ? (
              <Badge variant="default" className="gap-1 text-xs font-medium bg-primary/90 hover:bg-primary">
                @all ({instances.length})
                <button
                  type="button"
                  onClick={clearAllTargets}
                  className="ml-0.5 hover:text-primary-foreground/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : (
              targetInstances.map(inst => (
                <Badge key={inst.id} variant="default" className="gap-1 text-xs font-medium bg-primary/90 hover:bg-primary">
                  @{inst.name}
                  <button
                    type="button"
                    onClick={() => removeTarget(inst.id)}
                    className="ml-0.5 hover:text-primary-foreground/80 transition-colors"
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
              className={`h-7 text-xs gap-1.5 shrink-0 font-medium ${pendingNewSession ? 'bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={handleNewSession}
              title="Start a new session (reset context)"
            >
              <RotateCcw className="h-3 w-3" />
              {pendingNewSession ? 'New Chat ✓' : 'New Chat'}
            </Button>
            {selectedTeam && (
              <Button
                type="button"
                variant={showConfig ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-7 text-xs gap-1.5 shrink-0 font-medium ${showConfig ? 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setShowConfig(prev => !prev)}
                title="Execution config"
              >
                <Settings2 className="h-3 w-3" />
                Config
              </Button>
            )}
          </div>
        )}

        {/* Active session hint */}
        {targetInstances.length === 1 && !pendingNewSession && activeSessions[targetInstances[0].id] && (
          <div className="flex items-center gap-1.5 px-3 pb-1 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3 shrink-0" />
            <span>Continuing: <span className="font-medium text-foreground/70">{activeSessions[targetInstances[0].id].topic || 'Previous session'}</span></span>
          </div>
        )}

        {/* Execution config panel */}
        {showConfig && selectedTeam && (
          <div className="px-4 py-2.5 border-t border-border/30 bg-muted/30 space-y-2.5">
            <div className="flex items-center gap-4">
              <label className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">Max Turns</label>
              <input
                type="range"
                min={5} max={100} step={5}
                value={execConfig.maxTurns ?? 50}
                onChange={e => setExecConfig(prev => ({ ...prev, maxTurns: Number(e.target.value) }))}
                className="flex-1 h-1.5 accent-violet-600"
              />
              <span className="text-[11px] font-mono text-foreground w-8 text-right">{execConfig.maxTurns ?? 50}</span>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">Max Depth</label>
              <input
                type="range"
                min={3} max={30} step={1}
                value={execConfig.maxDepth ?? 15}
                onChange={e => setExecConfig(prev => ({ ...prev, maxDepth: Number(e.target.value) }))}
                className="flex-1 h-1.5 accent-violet-600"
              />
              <span className="text-[11px] font-mono text-foreground w-8 text-right">{execConfig.maxDepth ?? 15}</span>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">Turn Timeout</label>
              <select
                value={execConfig.turnTimeoutMs ?? 600000}
                onChange={e => setExecConfig(prev => ({ ...prev, turnTimeoutMs: Number(e.target.value) }))}
                className="flex-1 h-7 rounded border border-border/60 bg-card text-xs px-2"
              >
                <option value={120000}>2 min</option>
                <option value={300000}>5 min</option>
                <option value={600000}>10 min</option>
                <option value={900000}>15 min</option>
              </select>
            </div>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2 px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleFileSelect}
            title="Attach image"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              selectedTeam
                ? `Send goal to team "${selectedTeam.name}"...`
                : targetInstances.length > 0
                  ? pendingNewSession
                    ? `New session — send message to ${targetInstances.length} instance(s)...`
                    : `Send task to ${targetInstances.length} instance(s)... (type @ to add more)`
                  : 'Type @ to select instance(s) or team...'
            }
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-5 placeholder:text-muted-foreground focus:outline-none min-h-[36px] max-h-[200px] scrollbar-thin"
          />
          <Button
            type="button"
            size="icon"
            disabled={isSubmitDisabled}
            onClick={handleSubmit}
            className="h-8 w-8 rounded-lg shrink-0 transition-all mb-0.5"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Hint */}
        {value.includes('\n') && (
          <div className="px-4 pb-1.5 -mt-1">
            <span className="text-[10px] text-muted-foreground/60">
              Enter to send · Shift+Enter for new line
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
