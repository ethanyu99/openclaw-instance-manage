import fs from 'fs';
import path from 'path';
import type { WSLogEntry } from '../../shared/types';

const LOG_DIR = path.join(__dirname, '..', 'logs');
const isDev = process.env.NODE_ENV !== 'production';

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `ws-${date}.log`);
}

function truncate(str: string, maxLen = 500): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

export function logWS(entry: WSLogEntry) {
  const arrow = entry.direction === 'outbound' ? '>>>' : '<<<';
  const label = `[${entry.instanceName}:${entry.instanceId.slice(0, 8)}]`;
  const detail = entry.method || entry.event || entry.frameType;
  const line = `${entry.timestamp} ${arrow} ${label} ${detail} | ${truncate(entry.summary)}`;

  console.log(`[ws-log] ${line}`);

  if (isDev) {
    ensureLogDir();
    const jsonLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(getLogFilePath(), jsonLine, 'utf-8');
  }
}

export function createLogEntry(
  direction: WSLogEntry['direction'],
  instanceId: string,
  instanceName: string,
  raw: string,
): WSLogEntry {
  let frameType = 'unknown';
  let method: string | undefined;
  let event: string | undefined;
  let summary = truncate(raw, 200);

  try {
    const parsed = JSON.parse(raw);
    frameType = parsed.type || 'unknown';
    if (parsed.type === 'req') {
      method = parsed.method;
      summary = `${parsed.method}(${JSON.stringify(parsed.params || {}).slice(0, 150)})`;
    } else if (parsed.type === 'res') {
      summary = parsed.ok ? `ok: ${truncate(JSON.stringify(parsed.payload || {}), 150)}` : `error: ${parsed.error?.message || 'unknown'}`;
    } else if (parsed.type === 'event') {
      event = parsed.event;
      summary = `${parsed.event}: ${truncate(JSON.stringify(parsed.payload || {}), 150)}`;
    } else {
      summary = truncate(JSON.stringify(parsed), 200);
    }
  } catch {
    // raw is not valid JSON
  }

  return {
    timestamp: new Date().toISOString(),
    direction,
    instanceId,
    instanceName,
    frameType,
    method,
    event,
    summary,
    raw,
  };
}
