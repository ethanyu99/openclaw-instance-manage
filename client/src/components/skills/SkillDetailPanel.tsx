import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface SkillDetailPanelProps {
  title: string;
  content: string;
  loading: boolean;
  onBack: () => void;
}

export function SkillDetailPanel({ title, content, loading, onBack }: SkillDetailPanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <span className="font-medium text-sm">{title}</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono bg-muted/30 rounded-lg p-4 border">{content}</pre>
        </div>
      )}
    </div>
  );
}
