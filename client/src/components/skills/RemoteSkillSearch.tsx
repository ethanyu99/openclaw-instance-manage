import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search, Download, Loader2, CheckCircle2, XCircle, Eye, ExternalLink,
  Globe, Star, AlertTriangle, KeyRound, ShieldAlert, Sparkles,
} from 'lucide-react';
import {
  searchRemoteSkills, fetchRemoteSkillContent, checkRemoteStatus, SkillsMPApiError,
} from '@/lib/api';
import type { RemoteSkill, SkillsMPErrorCode } from '@/lib/api';

type SearchMode = 'keyword' | 'ai';
type RemoteSortBy = 'relevance' | 'stars';

interface RemoteSkillSearchProps {
  installedIds: Set<string>;
  opState: Record<string, string>;
  onInstall: (skill: RemoteSkill) => void;
  onPreview: (title: string, content: string) => void;
  onPreviewLoading: (title: string) => void;
}

export function RemoteSkillSearch({ installedIds, opState, onInstall, onPreview, onPreviewLoading }: RemoteSkillSearchProps) {
  const [remoteQuery, setRemoteQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<RemoteSkill[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteSearched, setRemoteSearched] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword');
  const [remoteConfigured, setRemoteConfigured] = useState<boolean | null>(null);
  const [remoteError, setRemoteError] = useState<{ code: SkillsMPErrorCode; message: string } | null>(null);
  const [remoteSortBy, setRemoteSortBy] = useState<RemoteSortBy>('relevance');
  const remoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (remoteConfigured === null) {
      checkRemoteStatus().then(s => setRemoteConfigured(s.configured)).catch(() => setRemoteConfigured(false));
    }
  }, [remoteConfigured]);

  const handleRemoteSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setRemoteResults([]);
      setRemoteSearched(false);
      setRemoteError(null);
      return;
    }
    setRemoteLoading(true);
    setRemoteSearched(true);
    setRemoteError(null);
    try {
      const result = await searchRemoteSkills(q, searchMode);
      setRemoteResults(result.skills ?? []);
    } catch (err) {
      setRemoteResults([]);
      if (err instanceof SkillsMPApiError) {
        setRemoteError({ code: err.code, message: err.message });
      } else {
        setRemoteError({ code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Unknown error' });
      }
    } finally {
      setRemoteLoading(false);
    }
  }, [searchMode]);

  const onRemoteQueryChange = (val: string) => {
    setRemoteQuery(val);
    if (remoteTimerRef.current) clearTimeout(remoteTimerRef.current);
    if (val.trim().length >= 2) {
      remoteTimerRef.current = setTimeout(() => handleRemoteSearch(val), 600);
    } else {
      setRemoteResults([]);
      setRemoteSearched(false);
      setRemoteError(null);
    }
  };

  const handleRemotePreview = async (skill: RemoteSkill) => {
    if (!skill.githubUrl) return;
    onPreviewLoading(skill.name);
    try {
      const content = await fetchRemoteSkillContent(skill.githubUrl);
      onPreview(skill.name, content);
    } catch {
      onPreview(skill.name, 'Failed to load SKILL.md content from remote source.');
    }
  };

  const sortedRemoteResults = remoteSortBy === 'stars'
    ? [...remoteResults].sort((a, b) => b.stars - a.stars)
    : remoteResults;

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={searchMode === 'ai' ? 'Describe what you need...' : 'Search skills by keyword...'}
            value={remoteQuery}
            onChange={(e) => onRemoteQueryChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRemoteSearch(remoteQuery); }}
            className="pl-8 h-8 text-sm"
            disabled={remoteConfigured === false}
          />
        </div>
        <div className="flex rounded-md border overflow-hidden shrink-0">
          <button
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              searchMode === 'keyword'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSearchMode('keyword')}
            title="Keyword Search"
          >
            <Search className="h-3 w-3" />
          </button>
          <button
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              searchMode === 'ai'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSearchMode('ai')}
            title="AI Semantic Search"
          >
            <Sparkles className="h-3 w-3" />
          </button>
        </div>
      </div>

      {remoteSearched && remoteResults.length > 0 && !remoteError && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{remoteResults.length} results</span>
          <div className="flex rounded-md border overflow-hidden shrink-0">
            <button
              className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
                remoteSortBy === 'relevance'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setRemoteSortBy('relevance')}
            >
              Relevance
            </button>
            <button
              className={`px-2 py-0.5 text-[11px] font-medium transition-colors flex items-center gap-0.5 ${
                remoteSortBy === 'stars'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setRemoteSortBy('stars')}
            >
              <Star className="h-2.5 w-2.5" /> Stars
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
        {remoteConfigured === false ? (
          <EmptyPanel
            icon={<KeyRound className="h-10 w-10 mb-3 text-amber-500" />}
            title="API Key Not Configured"
            description="Add SKILLSMP_API_KEY to your .env file to enable remote skill search."
          />
        ) : remoteLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              {searchMode === 'ai' ? 'AI searching...' : 'Searching SkillsMP...'}
            </span>
          </div>
        ) : remoteError ? (
          <RemoteApiError error={remoteError} onRetry={() => handleRemoteSearch(remoteQuery)} />
        ) : !remoteSearched ? (
          <EmptyPanel
            icon={<Globe className="h-10 w-10 mb-3 opacity-30" />}
            title="Explore the SKILL.md Ecosystem"
            description={
              searchMode === 'ai'
                ? 'Describe what you need in natural language. AI will find the best matching skills.'
                : 'Search 386,000+ open-source agent skills from GitHub by keyword.'
            }
          />
        ) : remoteResults.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No results found for &ldquo;{remoteQuery}&rdquo;
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {sortedRemoteResults.map(skill => (
              <RemoteSkillCard
                key={skill.slug}
                skill={skill}
                installed={installedIds.has(skill.slug)}
                opState={opState[skill.slug]}
                onInstall={() => onInstall(skill)}
                onPreview={() => handleRemotePreview(skill)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Helper components ──

function EmptyPanel({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs mt-1 max-w-xs">{description}</p>
    </div>
  );
}

function RemoteApiError({ error, onRetry }: { error: { code: SkillsMPErrorCode; message: string }; onRetry: () => void }) {
  const configs: Record<string, { icon: React.ReactNode; title: string; desc: string; retryable: boolean }> = {
    INVALID_API_KEY: { icon: <ShieldAlert className="h-10 w-10 mb-3 text-red-500" />, title: 'Invalid API Key', desc: 'Your SKILLSMP_API_KEY is invalid or expired.', retryable: false },
    MISSING_API_KEY: { icon: <KeyRound className="h-10 w-10 mb-3 text-amber-500" />, title: 'API Key Missing', desc: 'SKILLSMP_API_KEY is not set.', retryable: false },
    NOT_CONFIGURED: { icon: <KeyRound className="h-10 w-10 mb-3 text-amber-500" />, title: 'API Key Not Configured', desc: 'Add SKILLSMP_API_KEY to your .env file.', retryable: false },
    DAILY_QUOTA_EXCEEDED: { icon: <AlertTriangle className="h-10 w-10 mb-3 text-amber-500" />, title: 'Daily Quota Exceeded', desc: 'Daily search limit reached. Try again tomorrow.', retryable: false },
    NETWORK_ERROR: { icon: <Globe className="h-10 w-10 mb-3 text-muted-foreground/50" />, title: 'Network Error', desc: error.message || 'Failed to connect.', retryable: true },
    INTERNAL_ERROR: { icon: <XCircle className="h-10 w-10 mb-3 text-red-400" />, title: 'Server Error', desc: 'SkillsMP is experiencing issues.', retryable: true },
  };
  const config = configs[error.code] || configs.INTERNAL_ERROR;
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      {config.icon}
      <p className="text-sm font-medium text-foreground">{config.title}</p>
      <p className="text-xs mt-1 max-w-xs">{config.desc}</p>
      {config.retryable && (
        <Button size="sm" variant="outline" className="mt-3 text-xs h-7 gap-1" onClick={onRetry}>Retry</Button>
      )}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  const num = Number(ts);
  if (!num || isNaN(num)) return ts;
  return new Date(num * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function RemoteSkillCard({ skill, installed, opState, onInstall, onPreview }: {
  skill: RemoteSkill;
  installed: boolean;
  opState?: string;
  onInstall: () => void;
  onPreview: () => void;
}) {
  const isOperating = opState === 'installing';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
      installed ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-card hover:border-border'
    }`}>
      <div className="mt-0.5 p-1.5 rounded-md bg-muted/60 text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{skill.name}</span>
          {skill.stars > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <Star className="h-2.5 w-2.5 fill-amber-500" />
              {skill.stars >= 1000 ? `${(skill.stars / 1000).toFixed(1)}k` : skill.stars}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/60">{skill.repo}</span>
          {installed && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5 text-emerald-600">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Installed
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground/60">by {skill.author}</span>
          {skill.updatedAt && (
            <span className="text-[10px] text-muted-foreground/60">{formatTimestamp(skill.updatedAt)}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-0.5 flex items-center gap-1">
        {opState === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        {opState === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
        {isOperating && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        {!opState && (
          <>
            {skill.githubUrl && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10" onClick={onPreview} title="View SKILL.md">
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            {skill.skillUrl && (
              <a href={skill.skillUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-7 w-7 text-muted-foreground hover:text-foreground" title="View on SkillsMP">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {!installed && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onInstall} title="Install to sandbox">
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
