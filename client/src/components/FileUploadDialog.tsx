import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { uploadFileToSandbox } from '@/lib/api';
import { toast } from 'sonner';

interface FileUploadDialogProps {
  instanceId: string;
  instanceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFiles?: File[];
}

interface UploadItem {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function FileUploadDialog({ instanceId, instanceName, open, onOpenChange, initialFiles }: FileUploadDialogProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load initial files (from drag-drop on card)
  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0) {
      setItems(initialFiles.map(file => ({ file, status: 'pending' as const })));
    }
  }, [open, initialFiles]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: UploadItem[] = Array.from(files).map(file => ({ file, status: 'pending' as const }));
    setItems(prev => [...prev, ...newItems]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleUpload = useCallback(async () => {
    if (items.length === 0) return;
    setUploading(true);

    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'done') continue;

      setItems(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));

      try {
        const base64 = await fileToBase64(items[i].file);
        await uploadFileToSandbox(instanceId, items[i].file.name, base64);
        setItems(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'done' } : item));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setItems(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'error', error: msg } : item));
      }
    }

    setUploading(false);
    const doneCount = items.filter(i => i.status !== 'error').length;
    if (doneCount > 0) toast.success(`${doneCount} file(s) uploaded to ${instanceName}`);
  }, [items, instanceId, instanceName]);

  const handleClose = (v: boolean) => {
    if (!uploading) {
      setItems([]);
      onOpenChange(v);
    }
  };

  const doneCount = items.filter(i => i.status === 'done').length;
  const totalCount = items.length;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span className="text-muted-foreground">upload</span>
            <span className="text-primary">~/{instanceName}/workspace</span>
          </DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
          />
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Drop files here or <span className="text-primary font-medium">browse</span>
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
            .pdf .doc .docx .txt .csv .json .md — max 50MB per file
          </p>
        </div>

        {/* File list */}
        {items.length > 0 && (
          <div className="space-y-1 max-h-[240px] overflow-y-auto">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {doneCount}/{totalCount} uploaded
              </span>
              {/* Progress bar */}
              <div className="flex-1 mx-3 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {items.map((item, idx) => (
              <div
                key={`${item.file.name}-${idx}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border/40 font-mono text-xs"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 text-foreground">{item.file.name}</span>
                <span className="text-muted-foreground/60 text-[10px] shrink-0">{formatSize(item.file.size)}</span>

                {item.status === 'pending' && (
                  <button type="button" onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                )}
                {item.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                {item.status === 'error' && (
                  <span title={item.error}>
                    <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground">
            {items.length > 0 ? `${items.length} file(s) selected` : 'No files selected'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs h-7 font-mono" onClick={() => handleClose(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button size="sm" className="text-xs h-7 font-mono gap-1.5" onClick={handleUpload} disabled={uploading || items.length === 0 || doneCount === totalCount}>
              {uploading ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</>
              ) : doneCount === totalCount && totalCount > 0 ? (
                <><CheckCircle2 className="h-3 w-3" /> Done</>
              ) : (
                <><Upload className="h-3 w-3" /> Upload {items.length > 0 ? `(${items.length})` : ''}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
