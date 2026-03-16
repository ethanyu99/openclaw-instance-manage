import { Router } from 'express';
import { Sandbox } from 'novita-sandbox';
import { store } from '../store';
import type { Instance } from '../../../shared/types';

export const instanceConfigRouter = Router();
export const teamConfigRouter = Router();

const SANDBOX_KEEP_ALIVE_MS = 50 * 365 * 24 * 3600 * 1000;

async function connectSandbox(sandboxId: string, apiKey: string) {
  return Sandbox.connect(sandboxId, {
    apiKey,
    timeoutMs: SANDBOX_KEEP_ALIVE_MS,
  });
}

interface GitCredentialPayload {
  pat?: string;
  username?: string;
  gitName?: string;
  gitEmail?: string;
  host?: string;
  authMethod?: 'pat' | 'ssh';
  sshPrivateKey?: string;
  sshPublicKey?: string;
}

interface GitConfigureResult {
  instanceId: string;
  instanceName: string;
  success: boolean;
  verified: boolean;
  verifyMessage: string;
  method: 'sandbox_sdk' | 'task';
  error?: string;
}

function buildGitCredentialLine(pat: string, host: string, username: string) {
  return `https://${username}:${pat}@${host}`;
}

async function configureGitViaSdk(
  instance: Instance,
  payload: GitCredentialPayload,
): Promise<GitConfigureResult> {
  const { pat, username, gitName, gitEmail, host } = payload;
  const gitHost = host || 'github.com';
  const gitUser = username || 'git';

  try {
    const sandbox = await connectSandbox(instance.sandboxId!, instance.apiKey!);

    await sandbox.commands.run('git config --global credential.helper store', { timeoutMs: 10_000 });
    await sandbox.files.write('/home/user/.git-credentials', buildGitCredentialLine(pat!, gitHost, gitUser) + '\n');
    await sandbox.commands.run('chmod 600 /home/user/.git-credentials', { timeoutMs: 10_000 });

    if (gitName) await sandbox.commands.run(`git config --global user.name "${gitName}"`, { timeoutMs: 10_000 });
    if (gitEmail) await sandbox.commands.run(`git config --global user.email "${gitEmail}"`, { timeoutMs: 10_000 });

    let verified = false;
    let verifyMessage = '';
    try {
      const result = await sandbox.commands.run(
        `git ls-remote https://${gitUser}:${pat}@${gitHost} 2>&1 | head -1`,
        { timeoutMs: 15_000 },
      );
      verified = !result.stderr?.includes('fatal');
      verifyMessage = verified ? 'Authentication successful' : (result.stderr?.trim() || 'Verification failed');
    } catch {
      verifyMessage = 'Verification skipped (timeout)';
    }

    return { instanceId: instance.id, instanceName: instance.name, success: true, verified, verifyMessage, method: 'sandbox_sdk' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[instance-config] SDK configure failed for ${instance.name}:`, msg);
    return { instanceId: instance.id, instanceName: instance.name, success: false, verified: false, verifyMessage: '', method: 'sandbox_sdk', error: msg };
  }
}

async function configureGitSshViaSdk(
  instance: Instance,
  payload: GitCredentialPayload,
): Promise<GitConfigureResult> {
  const { sshPrivateKey, sshPublicKey, gitName, gitEmail, host } = payload;
  const gitHost = host || 'github.com';

  try {
    const sandbox = await connectSandbox(instance.sandboxId!, instance.apiKey!);

    // Detect key type based on key content
    const keyType = sshPrivateKey!.includes('RSA') ? 'id_rsa' : 'id_ed25519';

    // Create .ssh directory
    await sandbox.commands.run('mkdir -p /home/user/.ssh && chmod 700 /home/user/.ssh', { timeoutMs: 10_000 });

    // Write keys via sandbox.files.write
    await sandbox.files.write(`/home/user/.ssh/${keyType}`, sshPrivateKey!.trim() + '\n');
    if (sshPublicKey) {
      await sandbox.files.write(`/home/user/.ssh/${keyType}.pub`, sshPublicKey.trim() + '\n');
    }

    // Set permissions
    await sandbox.commands.run(`chmod 600 /home/user/.ssh/${keyType}`, { timeoutMs: 10_000 });
    if (sshPublicKey) {
      await sandbox.commands.run(`chmod 644 /home/user/.ssh/${keyType}.pub`, { timeoutMs: 10_000 });
    }

    // Write SSH config
    const sshConfig = [
      `Host ${gitHost}`,
      `  HostName ${gitHost}`,
      `  User git`,
      `  IdentityFile ~/.ssh/${keyType}`,
      `  StrictHostKeyChecking no`,
      '',
    ].join('\n');
    await sandbox.files.write('/home/user/.ssh/config', sshConfig);
    await sandbox.commands.run('chmod 600 /home/user/.ssh/config', { timeoutMs: 10_000 });

    // Set git user config
    if (gitName) await sandbox.commands.run(`git config --global user.name "${gitName}"`, { timeoutMs: 10_000 });
    if (gitEmail) await sandbox.commands.run(`git config --global user.email "${gitEmail}"`, { timeoutMs: 10_000 });

    // Verify SSH connection
    let verified = false;
    let verifyMessage = '';
    try {
      const result = await sandbox.commands.run(
        `ssh -T git@${gitHost} 2>&1 || true`,
        { timeoutMs: 15_000 },
      );
      const output = (result.stdout || '') + (result.stderr || '');
      verified = output.includes('successfully authenticated') || output.includes('You\'ve successfully authenticated');
      verifyMessage = verified ? 'SSH authentication successful' : output.trim().slice(0, 200) || 'Verification inconclusive';
    } catch {
      verifyMessage = 'Verification skipped (timeout)';
    }

    return { instanceId: instance.id, instanceName: instance.name, success: true, verified, verifyMessage, method: 'sandbox_sdk' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[instance-config] SSH SDK configure failed for ${instance.name}:`, msg);
    return { instanceId: instance.id, instanceName: instance.name, success: false, verified: false, verifyMessage: '', method: 'sandbox_sdk', error: msg };
  }
}

function buildGitConfigPrompt(payload: GitCredentialPayload): string {
  const { pat, username, gitName, gitEmail, host } = payload;
  const gitHost = host || 'github.com';
  const gitUser = username || 'git';
  const credLine = buildGitCredentialLine(pat!, gitHost, gitUser);

  const commands = [
    'git config --global credential.helper store',
    `printf '%s\\n' '${credLine}' > ~/.git-credentials`,
    'chmod 600 ~/.git-credentials',
  ];
  if (gitName) commands.push(`git config --global user.name '${gitName}'`);
  if (gitEmail) commands.push(`git config --global user.email '${gitEmail}'`);

  return [
    'Run these shell commands exactly as shown, one by one. Do not modify them.',
    '',
    '```bash',
    ...commands,
    '```',
  ].join('\n');
}

function buildGitSshConfigPrompt(payload: GitCredentialPayload): string {
  const { sshPrivateKey, sshPublicKey, gitName, gitEmail, host } = payload;
  const gitHost = host || 'github.com';
  const keyType = sshPrivateKey!.includes('RSA') ? 'id_rsa' : 'id_ed25519';

  const sshConfigContent = [
    `Host ${gitHost}`,
    `  HostName ${gitHost}`,
    `  User git`,
    `  IdentityFile ~/.ssh/${keyType}`,
    `  StrictHostKeyChecking no`,
  ].join('\\n');

  const commands = [
    'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
    `cat > ~/.ssh/${keyType} << 'SSHKEY'\n${sshPrivateKey}\nSSHKEY`,
    `chmod 600 ~/.ssh/${keyType}`,
  ];

  if (sshPublicKey) {
    commands.push(`printf '%s\\n' '${sshPublicKey.trim()}' > ~/.ssh/${keyType}.pub`);
    commands.push(`chmod 644 ~/.ssh/${keyType}.pub`);
  }

  commands.push(`printf '${sshConfigContent}\\n' > ~/.ssh/config`);
  commands.push('chmod 600 ~/.ssh/config');

  if (gitName) commands.push(`git config --global user.name '${gitName}'`);
  if (gitEmail) commands.push(`git config --global user.email '${gitEmail}'`);

  commands.push(`ssh -T git@${gitHost} 2>&1 || true`);

  return [
    'Run these shell commands exactly as shown, one by one. Do not modify them.',
    '',
    '```bash',
    ...commands,
    '```',
  ].join('\n');
}

function toHttpBase(endpoint: string): string {
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

async function configureGitViaTask(
  instance: Instance,
  payload: GitCredentialPayload,
): Promise<GitConfigureResult> {
  const prompt = buildGitConfigPrompt(payload);

  try {
    const baseUrl = toHttpBase(instance.endpoint);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (instance.token) headers['Authorization'] = `Bearer ${instance.token}`;

    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'openclaw', input: prompt, stream: true }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return {
        instanceId: instance.id, instanceName: instance.name,
        success: false, verified: false, verifyMessage: '', method: 'task',
        error: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        instanceId: instance.id, instanceName: instance.name,
        success: false, verified: false, verifyMessage: '', method: 'task',
        error: 'No response body',
      };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let completed = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'response.output_text.delta' && event.delta) fullText += event.delta;
          if (event.type === 'response.completed') completed = true;
        } catch { /* ignore */ }
      }
    }

    const lowerText = fullText.toLowerCase();
    const hasError = lowerText.includes('error') && (lowerText.includes('fatal') || lowerText.includes('failed'));
    const verified = completed && !hasError;
    return {
      instanceId: instance.id, instanceName: instance.name,
      success: completed, verified,
      verifyMessage: verified ? 'Configuration task completed' : (hasError ? 'Task completed with errors' : 'Task did not complete'),
      method: 'task',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[instance-config] Task configure failed for ${instance.name}:`, msg);
    return {
      instanceId: instance.id, instanceName: instance.name,
      success: false, verified: false, verifyMessage: '', method: 'task', error: msg,
    };
  }
}

async function configureGitSshViaTask(
  instance: Instance,
  payload: GitCredentialPayload,
): Promise<GitConfigureResult> {
  const prompt = buildGitSshConfigPrompt(payload);

  try {
    const baseUrl = toHttpBase(instance.endpoint);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (instance.token) headers['Authorization'] = `Bearer ${instance.token}`;

    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'openclaw', input: prompt, stream: true }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return {
        instanceId: instance.id, instanceName: instance.name,
        success: false, verified: false, verifyMessage: '', method: 'task',
        error: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        instanceId: instance.id, instanceName: instance.name,
        success: false, verified: false, verifyMessage: '', method: 'task',
        error: 'No response body',
      };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let completed = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'response.output_text.delta' && event.delta) fullText += event.delta;
          if (event.type === 'response.completed') completed = true;
        } catch { /* ignore */ }
      }
    }

    const lowerText = fullText.toLowerCase();
    const hasError = lowerText.includes('error') && (lowerText.includes('fatal') || lowerText.includes('failed'));
    const verified = completed && !hasError;
    return {
      instanceId: instance.id, instanceName: instance.name,
      success: completed, verified,
      verifyMessage: verified ? 'SSH configuration task completed' : (hasError ? 'Task completed with errors' : 'Task did not complete'),
      method: 'task',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[instance-config] SSH task configure failed for ${instance.name}:`, msg);
    return {
      instanceId: instance.id, instanceName: instance.name,
      success: false, verified: false, verifyMessage: '', method: 'task', error: msg,
    };
  }
}

async function configureGitForInstance(
  instance: Instance,
  payload: GitCredentialPayload,
): Promise<GitConfigureResult> {
  if (payload.authMethod === 'ssh') {
    if (!payload.sshPrivateKey) {
      return {
        instanceId: instance.id, instanceName: instance.name,
        success: false, verified: false, verifyMessage: '', method: 'task',
        error: 'sshPrivateKey is required for SSH auth method',
      };
    }
    if (instance.sandboxId && instance.apiKey) {
      return configureGitSshViaSdk(instance, payload);
    }
    if (instance.endpoint) {
      return configureGitSshViaTask(instance, payload);
    }
    return {
      instanceId: instance.id, instanceName: instance.name,
      success: false, verified: false, verifyMessage: '', method: 'task',
      error: 'Instance has no endpoint configured',
    };
  }

  // Default PAT flow
  if (instance.sandboxId && instance.apiKey) {
    return configureGitViaSdk(instance, payload);
  }
  if (instance.endpoint) {
    return configureGitViaTask(instance, payload);
  }
  return {
    instanceId: instance.id, instanceName: instance.name,
    success: false, verified: false, verifyMessage: '', method: 'task',
    error: 'Instance has no endpoint configured',
  };
}

instanceConfigRouter.post('/:id/sandbox/configure/git', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  const payload = req.body as GitCredentialPayload;

  // Validate based on auth method
  if (payload.authMethod === 'ssh') {
    if (!payload.sshPrivateKey) return res.status(400).json({ error: 'sshPrivateKey is required for SSH auth method' });
  } else {
    if (!payload.pat) return res.status(400).json({ error: 'pat is required' });
  }

  const result = await configureGitForInstance(instance, payload);

  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  const steps = payload.authMethod === 'ssh'
    ? ['ssh_keys', ...(payload.gitName ? ['git_name'] : []), ...(payload.gitEmail ? ['git_email'] : [])]
    : ['git_credentials', ...(payload.gitName ? ['git_name'] : []), ...(payload.gitEmail ? ['git_email'] : [])];

  res.json({
    success: true,
    method: result.method,
    steps,
    verified: result.verified,
    verifyMessage: result.verifyMessage,
  });
});

instanceConfigRouter.get('/:id/sandbox/configure/git/status', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  if (instance.sandboxId && instance.apiKey) {
    try {
      const sandbox = await connectSandbox(instance.sandboxId, instance.apiKey);
      const credResult = await sandbox.commands.run(
        'test -f /home/user/.git-credentials && echo "exists" || echo "missing"',
        { timeoutMs: 10_000 },
      );
      const hasCredentials = credResult.stdout?.trim() === 'exists';

      const sshResult = await sandbox.commands.run(
        'test -f /home/user/.ssh/id_ed25519 -o -f /home/user/.ssh/id_rsa && echo "exists" || echo "missing"',
        { timeoutMs: 10_000 },
      );
      const hasSshKeys = sshResult.stdout?.trim() === 'exists';

      let gitName = '';
      let gitEmail = '';
      try {
        const nameResult = await sandbox.commands.run('git config --global user.name 2>/dev/null || true', { timeoutMs: 5_000 });
        gitName = nameResult.stdout?.trim() || '';
        const emailResult = await sandbox.commands.run('git config --global user.email 2>/dev/null || true', { timeoutMs: 5_000 });
        gitEmail = emailResult.stdout?.trim() || '';
      } catch { /* ignore */ }

      return res.json({ hasCredentials, hasSshKeys, gitName, gitEmail, method: 'sandbox_sdk' });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to check git status' });
    }
  }

  res.json({ hasCredentials: null, hasSshKeys: null, gitName: '', gitEmail: '', method: 'task' });
});

teamConfigRouter.post('/:id/configure/git', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const team = await store.getTeam(ownerId, req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const payload = req.body as GitCredentialPayload;

  // Validate based on auth method
  if (payload.authMethod === 'ssh') {
    if (!payload.sshPrivateKey) return res.status(400).json({ error: 'sshPrivateKey is required for SSH auth method' });
  } else {
    if (!payload.pat) return res.status(400).json({ error: 'pat is required' });
  }

  const instanceIds = team.members
    .map(m => m.instanceId)
    .filter((id): id is string => !!id);

  const instances: Instance[] = [];
  for (const id of instanceIds) {
    const inst = await store.getInstanceRawForOwner(ownerId, id);
    if (inst && inst.endpoint) instances.push(inst);
  }

  if (instances.length === 0) {
    return res.status(400).json({ error: 'No instances bound to this team' });
  }

  const results = await Promise.all(
    instances.map(inst => configureGitForInstance(inst, payload)),
  );

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  res.json({ total: results.length, succeeded, failed, results });
});

teamConfigRouter.get('/:id/configure/git/status', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const team = await store.getTeam(ownerId, req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const roleStatuses = await Promise.all(
    team.roles.map(async role => {
      const member = team.members.find(m => m.roleId === role.id);
      const instanceId = member?.instanceId;

      const base = { roleId: role.id, roleName: role.name, isLead: role.isLead };

      if (!instanceId) {
        return { ...base, instanceId: null, instanceName: null, isSandbox: false, hasCredentials: false as boolean | null, hasSshKeys: false as boolean | null, gitName: '', gitEmail: '', reason: 'unbound' as const };
      }

      const inst = await store.getInstanceRawForOwner(ownerId, instanceId);
      if (!inst) {
        return { ...base, instanceId, instanceName: null, isSandbox: false, hasCredentials: false as boolean | null, hasSshKeys: false as boolean | null, gitName: '', gitEmail: '', reason: 'not_found' as const };
      }

      if (!inst.endpoint) {
        return { ...base, instanceId: inst.id, instanceName: inst.name, isSandbox: false, hasCredentials: false as boolean | null, hasSshKeys: false as boolean | null, gitName: '', gitEmail: '', reason: 'no_endpoint' as const };
      }

      const isSandbox = !!(inst.sandboxId && inst.apiKey);

      if (isSandbox) {
        try {
          const sandbox = await connectSandbox(inst.sandboxId!, inst.apiKey!);
          const credResult = await sandbox.commands.run(
            'test -f /home/user/.git-credentials && echo "exists" || echo "missing"',
            { timeoutMs: 10_000 },
          );
          const hasCredentials = credResult.stdout?.trim() === 'exists';

          const sshResult = await sandbox.commands.run(
            'test -f /home/user/.ssh/id_ed25519 -o -f /home/user/.ssh/id_rsa && echo "exists" || echo "missing"',
            { timeoutMs: 10_000 },
          );
          const hasSshKeys = sshResult.stdout?.trim() === 'exists';

          let gitName = '';
          let gitEmail = '';
          try {
            const nr = await sandbox.commands.run('git config --global user.name 2>/dev/null || true', { timeoutMs: 5_000 });
            gitName = nr.stdout?.trim() || '';
            const er = await sandbox.commands.run('git config --global user.email 2>/dev/null || true', { timeoutMs: 5_000 });
            gitEmail = er.stdout?.trim() || '';
          } catch { /* ignore */ }
          return { ...base, instanceId: inst.id, instanceName: inst.name, isSandbox: true, hasCredentials, hasSshKeys, gitName, gitEmail, reason: null };
        } catch {
          return { ...base, instanceId: inst.id, instanceName: inst.name, isSandbox: true, hasCredentials: false as boolean | null, hasSshKeys: false as boolean | null, gitName: '', gitEmail: '', reason: 'connection_failed' as const };
        }
      }

      return { ...base, instanceId: inst.id, instanceName: inst.name, isSandbox: false, hasCredentials: null, hasSshKeys: null, gitName: '', gitEmail: '', reason: null };
    }),
  );

  const configurable = roleStatuses.filter(r => r.reason === null).length;
  const configured = roleStatuses.filter(r => r.hasCredentials === true || r.hasSshKeys === true).length;

  res.json({ totalRoles: team.roles.length, configurable, configured, roleStatuses });
});
