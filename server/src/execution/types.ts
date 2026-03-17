import type { WSMessage, ExecutionConfig, ClawRole, Instance } from '../../../shared/types';

export interface BroadcastFn {
  (ownerId: string, message: WSMessage): void;
}

export interface RoleInstance {
  role: ClawRole;
  instance: Instance;
}

export const DEFAULT_CONFIG: ExecutionConfig = {
  maxTurns: 50,
  maxDepth: 15,
  turnTimeoutMs: 600_000,
  maxRetriesPerRole: 2,
};

export function toHttpBase(endpoint: string | undefined): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}
