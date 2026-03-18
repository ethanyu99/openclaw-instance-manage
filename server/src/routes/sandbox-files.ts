import path from 'path';
import { Router } from 'express';
import { Sandbox } from 'novita-sandbox';
import { store } from '../store';
import type { SandboxFileEntry } from '../../../shared/types';

export const sandboxFilesRouter = Router();

const SANDBOX_KEEP_ALIVE_MS = 50 * 365 * 24 * 3600 * 1000;
const ALLOWED_ROOT = '/home/user';
const DEFAULT_ROOT = '/home/user/.openclaw/workspace';
const MAX_READ_SIZE = 2 * 1024 * 1024;
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

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

    // Auto-create default workspace dir if it doesn't exist
    let listPath = dirPath;
    try {
      await sandbox.files.list(listPath, { depth: 1 });
    } catch {
      if (listPath === DEFAULT_ROOT) {
        try {
          await sandbox.commands.run(`mkdir -p "${DEFAULT_ROOT}"`, { timeoutMs: 10_000 });
        } catch {
          listPath = ALLOWED_ROOT; // fallback to /home/user
        }
      }
    }

    const entries = await sandbox.files.list(listPath, { depth });

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

sandboxFilesRouter.get('/:id/sandbox/files/download', async (req, res) => {
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
      return res.status(400).json({ error: 'Cannot download a directory — use the archive endpoint' });
    }
    if (info.size > MAX_DOWNLOAD_SIZE) {
      return res.status(413).json({
        error: `File too large to download (${(info.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_DOWNLOAD_SIZE / 1024 / 1024}MB`,
        size: info.size,
      });
    }

    const bytes = await sandbox.files.read(filePath, { format: 'bytes' });
    const filename = path.basename(filePath);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', bytes.length);
    res.send(Buffer.from(bytes));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to download file';
    console.error(`[sandbox-files] Download failed for ${instance.name}:`, msg);
    res.status(500).json({ error: msg });
  }
});

sandboxFilesRouter.get('/:id/sandbox/files/download-archive', async (req, res) => {
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

  const archiveTmp = `/tmp/workspace-download-${Date.now()}.tar.gz`;

  try {
    const sandbox = await connectSandbox(instance.sandboxId, instance.apiKey);

    // Build the archive inside the sandbox
    const parentDir = path.dirname(dirPath);
    const baseName = path.basename(dirPath);
    await sandbox.commands.run(
      `tar czf ${archiveTmp} -C ${parentDir} ${baseName}`,
      { timeoutMs: 120_000 },
    );

    const bytes = await sandbox.files.read(archiveTmp, { format: 'bytes' });

    // Clean up tmp file (best-effort, don't await or block response)
    sandbox.commands.run(`rm -f ${archiveTmp}`, { timeoutMs: 15_000 }).catch(() => {});

    const archiveName = `${baseName}-archive.tar.gz`;
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Length', bytes.length);
    res.send(Buffer.from(bytes));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create archive';
    console.error(`[sandbox-files] Archive download failed for ${instance.name}:`, msg);
    // Best-effort cleanup on error
    try {
      const sandbox = await connectSandbox(instance.sandboxId, instance.apiKey);
      await sandbox.commands.run(`rm -f ${archiveTmp}`, { timeoutMs: 10_000 });
    } catch { /* ignore */ }
    res.status(500).json({ error: msg });
  }
});

// ── Upload files to sandbox workspace ──

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB per file

sandboxFilesRouter.post('/:id/sandbox/files/upload', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  if (!instance.sandboxId || !instance.apiKey) {
    return res.status(400).json({ error: 'Instance is not a sandbox instance' });
  }

  const { fileName, filePath: targetDir, content } = req.body;
  if (!fileName || !content) {
    return res.status(400).json({ error: 'fileName and content (base64) are required' });
  }

  const destDir = targetDir || DEFAULT_ROOT;
  const destPath = path.join(destDir, fileName);
  if (!isPathAllowed(destPath)) {
    return res.status(403).json({ error: 'Access denied: path outside allowed root' });
  }

  const buf = Buffer.from(content, 'base64');
  if (buf.length > MAX_UPLOAD_SIZE) {
    return res.status(413).json({
      error: `File too large (${(buf.length / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_UPLOAD_SIZE / 1024 / 1024}MB`,
    });
  }

  try {
    const sandbox = await connectSandbox(instance.sandboxId, instance.apiKey);
    // Ensure target directory exists
    await sandbox.commands.run(`mkdir -p "${destDir}"`, { timeoutMs: 10_000 });
    await sandbox.files.write(destPath, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    res.json({ success: true, path: destPath, size: buf.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to upload file';
    console.error(`[sandbox-files] Upload failed for ${instance.name}:`, msg);
    res.status(500).json({ error: msg });
  }
});
