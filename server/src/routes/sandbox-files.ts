import { Router } from 'express';
import { Sandbox } from 'novita-sandbox';
import { store } from '../store';
import type { SandboxFileEntry } from '../../../shared/types';

export const sandboxFilesRouter = Router();

const SANDBOX_KEEP_ALIVE_MS = 50 * 365 * 24 * 3600 * 1000;
const ALLOWED_ROOT = '/home/user';
const DEFAULT_ROOT = '/home/user/.openclaw/workspace';
const MAX_READ_SIZE = 2 * 1024 * 1024;

async function connectSandbox(sandboxId: string, apiKey: string) {
  return Sandbox.connect(sandboxId, {
    apiKey,
    timeoutMs: SANDBOX_KEEP_ALIVE_MS,
  });
}

function isPathAllowed(targetPath: string): boolean {
  const normalized = targetPath.replace(/\/+$/, '');
  return normalized === ALLOWED_ROOT || normalized.startsWith(ALLOWED_ROOT + '/');
}

sandboxFilesRouter.get('/:id/sandbox/files', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  if (!instance.sandboxId || !instance.apiKey) {
    return res.status(400).json({ error: 'Instance is not a sandbox instance' });
  }

  const dirPath = (req.query.path as string) || DEFAULT_ROOT;
  if (!isPathAllowed(dirPath)) {
    return res.status(403).json({ error: 'Access denied: path outside allowed root' });
  }

  const depth = Math.min(parseInt(req.query.depth as string) || 1, 3);
  const showHidden = req.query.hidden === 'true';

  try {
    const sandbox = await connectSandbox(instance.sandboxId, instance.apiKey);
    const entries = await sandbox.files.list(dirPath, { depth });

    const files: SandboxFileEntry[] = entries
      .filter(e => showHidden || !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: e.path,
        type: e.type === 'dir' ? 'dir' as const : 'file' as const,
        size: e.size,
        permissions: e.permissions,
        modifiedTime: e.modifiedTime?.toISOString(),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    res.json({ path: dirPath, files });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list files';
    console.error(`[sandbox-files] List failed for ${instance.name}:`, msg);
    res.status(500).json({ error: msg });
  }
});

sandboxFilesRouter.get('/:id/sandbox/files/read', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  if (!instance.sandboxId || !instance.apiKey) {
    return res.status(400).json({ error: 'Instance is not a sandbox instance' });
  }

  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
  if (!isPathAllowed(filePath)) {
    return res.status(403).json({ error: 'Access denied: path outside allowed root' });
  }

  try {
    const sandbox = await connectSandbox(instance.sandboxId, instance.apiKey);

    const info = await sandbox.files.getInfo(filePath);
    if (info.type === 'dir') {
      return res.status(400).json({ error: 'Cannot read a directory' });
    }
    if (info.size > MAX_READ_SIZE) {
      return res.status(413).json({
        error: `File too large to preview (${(info.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_READ_SIZE / 1024 / 1024}MB`,
        size: info.size,
      });
    }

    const content = await sandbox.files.read(filePath, { format: 'text' });
    res.json({ path: filePath, content, size: info.size });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read file';
    console.error(`[sandbox-files] Read failed for ${instance.name}:`, msg);
    res.status(500).json({ error: msg });
  }
});
