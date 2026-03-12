import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';
import type { InstancePublic, SkillDefinition } from '@shared/types';
import { fetchSkillReadme } from '@/lib/api';
import { useSkillInstall } from './hooks/useSkillInstall';
import { LocalSkillsList } from './LocalSkillsList';
import { RemoteSkillSearch } from './RemoteSkillSearch';
import { SkillDetailPanel } from './SkillDetailPanel';

interface SkillsManagerDialogProps {
  instance: InstancePublic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabType = 'local' | 'explore';

export function SkillsManagerDialog({ instance, open, onOpenChange }: SkillsManagerDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isSandbox = !!instance.sandboxId;

  const {
    registry, installedIds, loading, opState,
    loadData, handleInstall, handleUninstall, handleInstallAll, handleRemoteInstall, reset,
  } = useSkillInstall(instance.id);

  const installedCount = registry.filter(s => installedIds.has(s.id)).length;

  useEffect(() => {
    if (open) {
      loadData();
      reset();
      setShowPreview(false);
      setActiveTab('local');
    }
  }, [open, loadData, reset]);

  const handleLocalPreview = async (skill: SkillDefinition) => {
    setPreviewTitle(skill.name);
    setShowPreview(true);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Skills — {instance.name}
          </DialogTitle>
          {!isSandbox && (
            <Badge variant="destructive" className="text-xs w-fit mt-1">
              Sandbox instance required for Skills management
            </Badge>
          )}
        </DialogHeader>

        {!isSandbox ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Skills install/uninstall requires a Sandbox instance</p>
            <p className="text-xs mt-1">Non-sandbox instances cannot write files via SDK</p>
          </div>
        ) : showPreview ? (
          <SkillDetailPanel
            title={previewTitle}
            content={previewContent}
            loading={previewLoading}
            onBack={() => setShowPreview(false)}
          />
        ) : (
          <>
            <div className="flex border-b mb-2">
              <button
                className={`px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'local'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('local')}
              >
                Local
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {installedCount}/{registry.length}
                </Badge>
              </button>
              <button
                className={`px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'explore'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('explore')}
              >
                Explore
                <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0">SkillsMP</Badge>
              </button>
            </div>

            {activeTab === 'local' ? (
              <LocalSkillsList
                registry={registry}
                installedIds={installedIds}
                opState={opState}
                loading={loading}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onInstallAll={handleInstallAll}
                onPreview={handleLocalPreview}
                installedCount={installedCount}
              />
            ) : (
              <RemoteSkillSearch
                installedIds={installedIds}
                opState={opState}
                onInstall={handleRemoteInstall}
                onPreviewLoading={(title) => {
                  setPreviewTitle(title);
                  setShowPreview(true);
                  setPreviewLoading(true);
                }}
                onPreview={(title, content) => {
                  setPreviewTitle(title);
                  setPreviewContent(content);
                  setPreviewLoading(false);
                  setShowPreview(true);
                }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
