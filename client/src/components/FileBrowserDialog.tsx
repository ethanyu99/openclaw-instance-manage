import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Folder, FolderOpen, FileText, FileCode, FileImage, File,
  ChevronRight, ChevronDown, RefreshCw, Eye, EyeOff,
  Home, Loader2, AlertCircle, X, Copy, Check, Download, FolderArchive,
} from 'lucide-react';
import type { InstancePublic, SandboxFileEntry } from '@shared/types';
import { listSandboxFiles, readSandboxFile, downloadSandboxFile, downloadSandboxArchive } from '@/lib/api';

interface FileBrowserDialogProps {
  instance: InstancePublic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TreeNode extends SandboxFileEntry {
  children?: TreeNode[];
  loaded?: boolean;
  loading?: boolean;
  expanded?: boolean;
}

const ROOT_PATH = '/home/user/.openclaw/workspace';

const EXT_ICON_MAP: Record<string, typeof FileText> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
  py: FileCode, rs: FileCode, go: FileCode, java: FileCode,
  c: FileCode, cpp: FileCode, h: FileCode, rb: FileCode,
  sh: FileCode, bash: FileCode, zsh: FileCode,
  json: FileCode, yaml: FileCode, yml: FileCode, toml: FileCode,
  html: FileCode, css: FileCode, scss: FileCode, less: FileCode,
  svg: FileImage, png: FileImage, jpg: FileImage, jpeg: FileImage,
  gif: FileImage, webp: FileImage, ico: FileImage,
};

function getFileIcon(entry: SandboxFileEntry) {
  if (entry.type === 'dir') return Folder;
  const ext = entry.name.split('.').pop()?.toLowerCase() || '';
  return EXT_ICON_MAP[ext] || FileText;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function getLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    html: 'html', css: 'css', scss: 'scss',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    md: 'markdown', xml: 'xml', sql: 'sql',
    c: 'c', cpp: 'cpp', h: 'c', rb: 'ruby',
  };
  return map[ext] || 'plaintext';
}

export function FileBrowserDialog({ instance, open, onOpenChange }: FileBrowserDialogProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [rootLoading, setRootLoading] = useState(false);
  const [rootError, setRootError] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [archiveDownloading, setArchiveDownloading] = useState(false);

  const treeRef = useRef(tree);
  treeRef.current = tree;

  const loadDirectory = useCallback(async (dirPath: string) => {
    const result = await listSandboxFiles(instance.id, dirPath, { hidden: showHidden });
    return result.files;
  }, [instance.id, showHidden]);

  const loadRoot = useCallback(async () => {
    setRootLoading(true);
    setRootError('');
    try {
      const files = await loadDirectory(ROOT_PATH);
      setTree(files.map(f => ({
        ...f,
        children: f.type === 'dir' ? [] : undefined,
        loaded: false,
        expanded: false,
      })));
    } catch (err) {
      setRootError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setRootLoading(false);
    }
  }, [loadDirectory]);

  useEffect(() => {
    if (open) {
      loadRoot();
      setSelectedFile(null);
      setFileContent(null);
      setFileError('');
    }
  }, [open, loadRoot]);

  const updateNodeInTree = useCallback((
    nodes: TreeNode[],
    targetPath: string,
    updater: (node: TreeNode) => TreeNode,
  ): TreeNode[] => {
    return nodes.map(node => {
      if (node.path === targetPath) return updater(node);
      if (node.children && node.children.length > 0) {
        return { ...node, children: updateNodeInTree(node.children, targetPath, updater) };
      }
      return node;
    });
  }, []);

  const handleToggleDir = useCallback(async (node: TreeNode) => {
    if (node.expanded) {
      setTree(prev => updateNodeInTree(prev, node.path, n => ({ ...n, expanded: false })));
      return;
    }

    if (node.loaded) {
      setTree(prev => updateNodeInTree(prev, node.path, n => ({ ...n, expanded: true })));
      return;
    }

    setTree(prev => updateNodeInTree(prev, node.path, n => ({ ...n, loading: true, expanded: true })));

    try {
      const files = await loadDirectory(node.path);
      const children: TreeNode[] = files.map(f => ({
        ...f,
        children: f.type === 'dir' ? [] : undefined,
        loaded: false,
        expanded: false,
      }));
      setTree(prev => updateNodeInTree(prev, node.path, n => ({
        ...n,
        children,
        loaded: true,
        loading: false,
      })));
    } catch (err) {
      console.warn('Failed to load directory:', err);
      setTree(prev => updateNodeInTree(prev, node.path, n => ({
        ...n,
        loading: false,
        expanded: false,
      })));
    }
  }, [loadDirectory, updateNodeInTree]);

  const handleCopy = useCallback(async () => {
    if (!fileContent) return;
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fileContent]);

  const handleDownloadFile = useCallback(async () => {
    if (!selectedFile) return;
    setDownloading(true);
    try {
      await downloadSandboxFile(instance.id, selectedFile);
    } catch (err) {
      console.error('[FileBrowser] Download failed:', err);
    } finally {
      setDownloading(false);
    }
  }, [selectedFile, instance.id]);

  const handleDownloadArchive = useCallback(async () => {
    setArchiveDownloading(true);
    try {
      await downloadSandboxArchive(instance.id, ROOT_PATH);
    } catch (err) {
      console.error('[FileBrowser] Archive download failed:', err);
    } finally {
      setArchiveDownloading(false);
    }
  }, [instance.id]);

  const handleFileSelect = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    setFileContent(null);
    setFileError('');
    setFileLoading(true);
    setCopied(false);
    try {
      const result = await readSandboxFile(instance.id, filePath);
      setFileContent(result.content);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setFileLoading(false);
    }
  }, [instance.id]);

  const renderTreeNode = useCallback((node: TreeNode, depth: number = 0) => {
    const isDir = node.type === 'dir';
    const isSelected = node.path === selectedFile;
    const Icon = isDir
      ? (node.expanded ? FolderOpen : Folder)
      : getFileIcon(node);

    return (
      <div key={node.path}>
        <button
          className={`flex items-center gap-1.5 w-full text-left text-xs py-1 px-1.5 rounded-sm transition-colors hover:bg-muted/80 group ${
            isSelected ? 'bg-primary/10 text-primary' : 'text-foreground/80'
          }`}
          style={{ paddingLeft: `${depth * 16 + 6}px` }}
          onClick={() => isDir ? handleToggleDir(node) : handleFileSelect(node.path)}
        >
          {isDir ? (
            <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {node.loading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : node.expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          ) : (
            <span className="w-3.5 h-3.5 shrink-0" />
          )}
          <Icon className={`h-3.5 w-3.5 shrink-0 ${
            isDir ? 'text-blue-500' : 'text-muted-foreground'
          }`} />
          <span className="truncate flex-1">{node.name}</span>
          {!isDir && (
            <span className="text-[10px] text-muted-foreground/60 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatSize(node.size)}
            </span>
          )}
        </button>
        {isDir && node.expanded && node.children && (
          <div>
            {node.children.length === 0 && node.loaded && (
              <div
                className="text-[10px] text-muted-foreground/50 italic py-0.5"
                style={{ paddingLeft: `${(depth + 1) * 16 + 22}px` }}
              >
                (empty)
              </div>
            )}
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [selectedFile, handleToggleDir, handleFileSelect]);

  const selectedFileName = selectedFile?.split('/').pop() || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <File className="h-4 w-4" />
              Workspace Files
              <span className="text-muted-foreground font-normal">— {instance.name}</span>
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowHidden(h => !h)}
                title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
              >
                {showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={loadRoot}
                disabled={rootLoading}
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rootLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDownloadArchive}
                disabled={archiveDownloading}
                title="Download workspace as tar.gz"
              >
                {archiveDownloading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FolderArchive className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-70 hover:opacity-100"
                onClick={() => onOpenChange(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* File tree panel */}
          <div className="w-64 border-r border-border/50 flex flex-col shrink-0">
            <div className="px-3 py-1.5 border-b border-border/30 bg-muted/20">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Home className="h-3 w-3" />
                <span className="font-mono truncate">workspace/</span>
              </div>
            </div>
            <ScrollArea className="flex-1 h-[60vh]">
              <div className="p-1.5">
                {rootLoading && tree.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : rootError ? (
                  <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="text-xs text-destructive">{rootError}</p>
                    <Button variant="outline" size="sm" onClick={loadRoot} className="text-xs h-7">
                      Retry
                    </Button>
                  </div>
                ) : tree.length === 0 ? (
                  <div className="text-xs text-muted-foreground/50 text-center py-8 italic">
                    No files found
                  </div>
                ) : (
                  tree.map(node => renderTreeNode(node))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* File content panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedFile ? (
              <>
                <div className="px-3 py-1.5 border-b border-border/30 bg-muted/20 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground truncate">
                    {selectedFile.replace(ROOT_PATH + '/', '')}
                  </span>
                  {!fileLoading && fileContent !== null && (
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] text-muted-foreground/60">
                        {getLanguage(selectedFileName)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleCopy}
                        title="Copy file content"
                      >
                        {copied
                          ? <Check className="h-3 w-3 text-emerald-500" />
                          : <Copy className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleDownloadFile}
                        disabled={downloading}
                        title="Download file"
                      >
                        {downloading
                          ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          : <Download className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                    </div>
                  )}
                </div>
                <ScrollArea className="flex-1 h-[60vh]">
                  {fileLoading ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : fileError ? (
                    <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      <p className="text-xs text-destructive max-w-sm">{fileError}</p>
                    </div>
                  ) : fileContent !== null ? (
                    <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-foreground/90 select-text">
                      {fileContent}
                    </pre>
                  ) : null}
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground/40">
                <div className="text-center space-y-2">
                  <FileText className="h-10 w-10 mx-auto" />
                  <p className="text-xs">Select a file to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
