import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search, Download, Trash2, Loader2, CheckCircle2, XCircle,
  Package, Code, Globe, Monitor, Database, Wrench, MessageSquare,
  Zap, HelpCircle, Image, Eye, ArrowLeft,
} from 'lucide-react';
import type { InstancePublic, SkillDefinition, SkillCategory } from '@shared/types';
import { fetchSkillRegistry, fetchInstanceSkills, installSkills, uninstallSkills, fetchSkillReadme } from '@/lib/api';

interface SkillsManagerDialogProps {
  instance: InstancePublic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_ICONS: Record<SkillCategory, React.ReactNode> = {
  coding: <Code className="h-3.5 w-3.5" />,
  search: <Globe className="h-3.5 w-3.5" />,
  browser: <Monitor className="h-3.5 w-3.5" />,
  media: <Image className="h-3.5 w-3.5" />,
  devops: <Wrench className="h-3.5 w-3.5" />,
  data: <Database className="h-3.5 w-3.5" />,
  communication: <MessageSquare className="h-3.5 w-3.5" />,
  productivity: <Zap className="h-3.5 w-3.5" />,
  other: <HelpCircle className="h-3.5 w-3.5" />,
};

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  coding: 'Coding',
  search: 'Search',
  browser: 'Browser',
  media: 'Media',
  devops: 'DevOps',
  data: 'Data',
  communication: 'Comms',
  productivity: 'Productivity',
  other: 'Other',
};

const ALL_CATEGORIES: SkillCategory[] = ['coding', 'search', 'browser', 'media', 'devops', 'data', 'communication', 'productivity', 'other'];

type OperationState = Record<string, 'installing' | 'uninstalling' | 'success' | 'error'>;

export function SkillsManagerDialog({ instance, open, onOpenChange }: SkillsManagerDialogProps) {
  const [registry, setRegistry] = useState<SkillDefinition[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [opState, setOpState] = useState<OperationState>({});
  const [previewSkill, setPreviewSkill] = useState<SkillDefinition | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const isSandbox = !!instance.sandboxId;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [registryRes, installedRes] = await Promise.all([
        fetchSkillRegistry(),
        fetchInstanceSkills(instance.id),
      ]);
      setRegistry(registryRes.skills);
      setInstalledIds(new Set(installedRes.skills.map(s => s.id)));
    } catch (err) {
      console.error('Failed to load skills data:', err);
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    if (open) {
      loadData();
      setSearchQuery('');
      setSelectedCategory('all');
      setOpState({});
      setPreviewSkill(null);
      setPreviewContent('');
    }
  }, [open, loadData]);

  const handlePreview = async (skill: SkillDefinition) => {
    setPreviewSkill(skill);
    setPreviewLoading(true);
    try {
      const content = await fetchSkillReadme(skill.id);
      setPreviewContent(content);
    } catch {
      setPreviewContent('Failed to load SKILL.md content.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleInstall = async (skillId: string) => {
    setOpState(prev => ({ ...prev, [skillId]: 'installing' }));
    try {
      const result = await installSkills(instance.id, [skillId]);
      if (result.succeeded > 0) {
        setInstalledIds(prev => new Set([...prev, skillId]));
        setOpState(prev => ({ ...prev, [skillId]: 'success' }));
      } else {
        setOpState(prev => ({ ...prev, [skillId]: 'error' }));
      }
    } catch {
      setOpState(prev => ({ ...prev, [skillId]: 'error' }));
    }
    setTimeout(() => {
      setOpState(prev => {
        const next = { ...prev };
        if (next[skillId] === 'success' || next[skillId] === 'error') delete next[skillId];
        return next;
      });
    }, 2000);
  };

  const handleUninstall = async (skillId: string) => {
    setOpState(prev => ({ ...prev, [skillId]: 'uninstalling' }));
    try {
      const result = await uninstallSkills(instance.id, [skillId]);
      if (result.succeeded > 0) {
        setInstalledIds(prev => {
          const next = new Set(prev);
          next.delete(skillId);
          return next;
        });
        setOpState(prev => ({ ...prev, [skillId]: 'success' }));
      } else {
        setOpState(prev => ({ ...prev, [skillId]: 'error' }));
      }
    } catch {
      setOpState(prev => ({ ...prev, [skillId]: 'error' }));
    }
    setTimeout(() => {
      setOpState(prev => {
        const next = { ...prev };
        if (next[skillId] === 'success' || next[skillId] === 'error') delete next[skillId];
        return next;
      });
    }, 2000);
  };

  const handleInstallAll = async () => {
    const toInstall = filteredSkills.filter(s => !installedIds.has(s.id)).map(s => s.id);
    if (toInstall.length === 0) return;

    for (const id of toInstall) {
      setOpState(prev => ({ ...prev, [id]: 'installing' }));
    }

    try {
      const result = await installSkills(instance.id, toInstall);
      const succeeded = new Set(result.results.filter(r => r.success).map(r => r.skillId));
      setInstalledIds(prev => new Set([...prev, ...succeeded]));
      for (const id of toInstall) {
        setOpState(prev => ({ ...prev, [id]: succeeded.has(id) ? 'success' : 'error' }));
      }
    } catch {
      for (const id of toInstall) {
        setOpState(prev => ({ ...prev, [id]: 'error' }));
      }
    }

    setTimeout(() => {
      setOpState(prev => {
        const next = { ...prev };
        for (const id of toInstall) {
          if (next[id] === 'success' || next[id] === 'error') delete next[id];
        }
        return next;
      });
    }, 2000);
  };

  const filteredSkills = registry.filter(skill => {
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const installedCount = registry.filter(s => installedIds.has(s.id)).length;
  const notInstalledInView = filteredSkills.filter(s => !installedIds.has(s.id)).length;

  const usedCategories = ALL_CATEGORIES.filter(cat => registry.some(s => s.category === cat));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Skills — {instance.name}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {installedCount} / {registry.length} installed
            </Badge>
            {!isSandbox && (
              <Badge variant="destructive" className="text-xs">
                Sandbox instance required for Skills management
              </Badge>
            )}
          </div>
        </DialogHeader>

        {!isSandbox ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Skills install/uninstall requires a Sandbox instance</p>
            <p className="text-xs mt-1">Non-sandbox instances cannot write files via SDK</p>
          </div>
        ) : previewSkill ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 gap-1 text-xs"
                onClick={() => setPreviewSkill(null)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <span className="font-medium text-sm">{previewSkill.name}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                {CATEGORY_ICONS[previewSkill.category]}
                {CATEGORY_LABELS[previewSkill.category]}
              </Badge>
            </div>
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
                <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono bg-muted/30 rounded-lg p-4 border">{previewContent}</pre>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              {notInstalledInView > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={handleInstallAll}
                  disabled={Object.values(opState).some(s => s === 'installing' || s === 'uninstalling')}
                >
                  <Download className="h-3 w-3" />
                  Install All ({notInstalledInView})
                </Button>
              )}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              <Badge
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                className="cursor-pointer text-xs px-2 py-0.5 hover:bg-primary/10 transition-colors"
                onClick={() => setSelectedCategory('all')}
              >
                All
              </Badge>
              {usedCategories.map(cat => (
                <Badge
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  className="cursor-pointer text-xs px-2 py-0.5 gap-1 hover:bg-primary/10 transition-colors"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {CATEGORY_ICONS[cat]}
                  {CATEGORY_LABELS[cat]}
                </Badge>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
                <div className="space-y-2 pb-2">
                  {filteredSkills.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      No matching skills found
                    </div>
                  ) : (
                    filteredSkills.map(skill => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        installed={installedIds.has(skill.id)}
                        opState={opState[skill.id]}
                        onInstall={() => handleInstall(skill.id)}
                        onUninstall={() => handleUninstall(skill.id)}
                        onPreview={() => handlePreview(skill)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SkillCardProps {
  skill: SkillDefinition;
  installed: boolean;
  opState?: string;
  onInstall: () => void;
  onUninstall: () => void;
  onPreview: () => void;
}

function SkillCard({ skill, installed, opState, onInstall, onUninstall, onPreview }: SkillCardProps) {
  const isOperating = opState === 'installing' || opState === 'uninstalling';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
      installed
        ? 'border-primary/30 bg-primary/5'
        : 'border-border/60 bg-card hover:border-border'
    }`}>
      <div className="mt-0.5 p-1.5 rounded-md bg-muted/60 text-muted-foreground">
        {CATEGORY_ICONS[skill.category]}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{skill.name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
            {CATEGORY_ICONS[skill.category]}
            {CATEGORY_LABELS[skill.category]}
          </Badge>
          {installed && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5 text-emerald-600">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Installed
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
        {skill.tags.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {skill.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-[10px] text-muted-foreground/70 bg-muted/50 px-1.5 py-0 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 mt-0.5 flex items-center gap-1">
        {opState === 'success' && (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        )}
        {opState === 'error' && (
          <XCircle className="h-5 w-5 text-destructive" />
        )}
        {isOperating && (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}
        {!opState && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
              onClick={onPreview}
              title="View SKILL.md"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            {installed ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={onUninstall}
                title="Uninstall"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={onInstall}
                title="Install"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
