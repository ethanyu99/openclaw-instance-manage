import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search, Download, Trash2, Loader2, CheckCircle2, XCircle, Eye,
  Code, Globe, Monitor, Database, Wrench, MessageSquare, Zap, HelpCircle, Image,
} from 'lucide-react';
import type { SkillDefinition, SkillCategory } from '@shared/types';

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

interface LocalSkillsListProps {
  registry: SkillDefinition[];
  installedIds: Set<string>;
  opState: Record<string, string>;
  loading: boolean;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onInstallAll: (ids: string[]) => void;
  onPreview: (skill: SkillDefinition) => void;
  installedCount: number;
}

export function LocalSkillsList({
  registry, installedIds, opState, loading,
  onInstall, onUninstall, onInstallAll, onPreview, installedCount,
}: LocalSkillsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');

  const filteredSkills = registry.filter(skill => {
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const notInstalledInView = filteredSkills.filter(s => !installedIds.has(s.id)).length;
  const usedCategories = ALL_CATEGORIES.filter(cat => registry.some(s => s.category === cat));

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search local skills..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
        {notInstalledInView > 0 && (
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
            onClick={() => onInstallAll(filteredSkills.filter(s => !installedIds.has(s.id)).map(s => s.id))}
            disabled={Object.values(opState).some(s => s === 'installing' || s === 'uninstalling')}>
            <Download className="h-3 w-3" />
            Install All ({notInstalledInView})
          </Button>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <Badge variant={selectedCategory === 'all' ? 'default' : 'outline'} className="cursor-pointer text-xs px-2 py-0.5 hover:bg-primary/10 transition-colors" onClick={() => setSelectedCategory('all')}>
          All
        </Badge>
        {usedCategories.map(cat => (
          <Badge key={cat} variant={selectedCategory === cat ? 'default' : 'outline'} className="cursor-pointer text-xs px-2 py-0.5 gap-1 hover:bg-primary/10 transition-colors" onClick={() => setSelectedCategory(cat)}>
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
              <div className="text-center text-sm text-muted-foreground py-8">No matching skills found</div>
            ) : (
              filteredSkills.map(skill => (
                <LocalSkillCard
                  key={skill.id}
                  skill={skill}
                  installed={installedIds.has(skill.id)}
                  opState={opState[skill.id]}
                  onInstall={() => onInstall(skill.id)}
                  onUninstall={() => onUninstall(skill.id)}
                  onPreview={() => onPreview(skill)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Local Skill Card ──

function LocalSkillCard({ skill, installed, opState, onInstall, onUninstall, onPreview }: {
  skill: SkillDefinition;
  installed: boolean;
  opState?: string;
  onInstall: () => void;
  onUninstall: () => void;
  onPreview: () => void;
}) {
  const isOperating = opState === 'installing' || opState === 'uninstalling';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
      installed ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-card hover:border-border'
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
              <span key={tag} className="text-[10px] text-muted-foreground/70 bg-muted/50 px-1.5 py-0 rounded">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 mt-0.5 flex items-center gap-1">
        {opState === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        {opState === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
        {isOperating && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        {!opState && (
          <>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10" onClick={onPreview} title="View SKILL.md">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            {installed ? (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onUninstall} title="Uninstall">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onInstall} title="Install">
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
