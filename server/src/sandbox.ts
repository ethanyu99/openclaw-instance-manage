import { Sandbox } from 'novita-sandbox';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { SandboxProgress } from '../../shared/types';

const TEMPLATE_ID = 'openclaw';
const SANDBOX_APP_LABEL = 'novita-openclaw';
const SANDBOX_METADATA = { app: SANDBOX_APP_LABEL, long_running: 'true' };
const GATEWAY_PORT = 18789;
const OPENCLAW_CONFIG_PATH = '/home/user/.openclaw/config.json';
const API_KEY_PLACEHOLDER = 'NOVITA_API_KEY';
const SANDBOX_KEEP_ALIVE_MS = 50 * 365 * 24 * 3600 * 1000; // 50 years

function loadOpenClawConfigTemplate(): Record<string, unknown> {
  const templatePath = path.join(__dirname, '..', 'openclaw', 'example.json');
  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw);
}

function replacePlaceholder(obj: unknown, placeholder: string, value: string): unknown {
  if (typeof obj === 'string') {
    return obj === placeholder ? value : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => replacePlaceholder(item, placeholder, value));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = replacePlaceholder(v, placeholder, value);
    }
    return result;
  }
  return obj;
}

function generateOpenClawConfig(apiKey: string, gatewayToken: string): Record<string, unknown> {
  const template = loadOpenClawConfigTemplate();
  const config = replacePlaceholder(template, API_KEY_PLACEHOLDER, apiKey) as Record<string, unknown>;

  config.gateway = {
    mode: 'local',
    auth: { mode: 'token', token: gatewayToken },
    http: {
      endpoints: {
        responses: {
          enabled: true,
          maxBodyBytes: 20000000,
          maxUrlParts: 10,
          files: {
            allowUrl: true,
            urlAllowlist: ["*.r2.dev"],
            allowedMimes: [
              "text/plain",
              "text/markdown",
              "text/html",
              "text/csv",
              "application/json",
              "application/pdf",
            ],
            maxBytes: 5242880,
            maxChars: 200000,
            maxRedirects: 3,
            timeoutMs: 10000,
            pdf: {
              maxPages: 10,
              maxPixels: 1000000,
              minTextChars: 200,
            },
          },
          images: {
            allowUrl: true,
            urlAllowlist: ["*.r2.dev"],
            allowedMimes: ["image/jpg", "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
            maxBytes: 10485760,
            maxRedirects: 3,
            timeoutMs: 10000,
          },
        },
      },
    },
    controlUi: {
      dangerouslyAllowHostHeaderOriginFallback: true,
      dangerouslyDisableDeviceAuth: true,
    },
  };

  return config;
}

export interface SandboxCreateResult {
  sandboxId: string;
  endpoint: string;
  gatewayToken: string;
}

export async function createSandbox(
  apiKey: string,
  gatewayToken?: string,
  onProgress?: (progress: SandboxProgress) => void,
): Promise<SandboxCreateResult> {
  const gwToken = gatewayToken || crypto.randomBytes(16).toString('base64url');
  const emit = (progress: SandboxProgress) => {
    console.log(`[sandbox] ${progress.message}`);
    onProgress?.(progress);
  };

  emit({ step: 'creating_sandbox', message: `Creating sandbox from template: ${TEMPLATE_ID}` });
  const sandbox = await Sandbox.create(TEMPLATE_ID, {
    timeoutMs: SANDBOX_KEEP_ALIVE_MS,
    metadata: SANDBOX_METADATA,
    apiKey,
  });

  const sandboxId = sandbox.sandboxId;
  emit({ step: 'sandbox_created', message: `Sandbox created: ${sandboxId}`, detail: sandboxId });

  try {
    emit({ step: 'writing_config', message: 'Writing OpenClaw configuration...' });
    const config = generateOpenClawConfig(apiKey, gwToken);
    const configContent = JSON.stringify(config, null, 2);

    await sandbox.commands.run('mkdir -p /home/user/.openclaw', { timeoutMs: 30_000 });
    await sandbox.files.write(OPENCLAW_CONFIG_PATH, configContent);
    await sandbox.commands.run(
      'chmod 755 /home/user /home/user/.openclaw && chmod 644 /home/user/.openclaw/config.json',
      { timeoutMs: 30_000 },
    );
    await sandbox.commands.run(
      'chmod -R 755 /usr/local/lib/node_modules/openclaw/extensions/ 2>/dev/null || true',
      { timeoutMs: 30_000 },
    );
    emit({ step: 'config_written', message: 'OpenClaw configuration written' });

    emit({ step: 'starting_gateway', message: `Starting OpenClaw Gateway on port ${GATEWAY_PORT}` });
    await sandbox.commands.run(
      `nohup bash -c 'OPENCLAW_CONFIG_PATH=${OPENCLAW_CONFIG_PATH} openclaw gateway --port ${GATEWAY_PORT} --bind lan' > /tmp/gateway.log 2>&1 &`,
      { timeoutMs: 30_000 },
    );

    const maxChecks = 120;
    let ready = false;
    for (let i = 0; i < maxChecks; i++) {
      try {
        const result = await sandbox.commands.run(
          `curl -s --max-time 2 -o /dev/null -w "%{http_code}" http://localhost:${GATEWAY_PORT}/ 2>/dev/null; echo`,
          { timeoutMs: 30_000 },
        );
        if (result.stdout?.trim() === '200') {
          ready = true;
          break;
        }
      } catch {
        // retry
      }
      if ((i + 1) % 10 === 0) {
        emit({ step: 'waiting_gateway', message: `Waiting for Gateway to start (${i + 1}/${maxChecks})...`, detail: `${i + 1}/${maxChecks}` });
      }
      await sleep(1000);
    }

    if (!ready) {
      let logText = '';
      try {
        const logResult = await sandbox.commands.run('tail -30 /tmp/gateway.log 2>&1 || true', { timeoutMs: 30_000 });
        logText = logResult.stdout?.trim() || '';
      } catch { /* ignore */ }
      console.error('[sandbox] Gateway failed to start. Log:', logText || '(empty)');
      throw new Error(`Gateway did not start in time.${logText ? `\n${logText}` : ''}`);
    }
    emit({ step: 'gateway_ready', message: 'Gateway is ready' });

    emit({ step: 'starting_daemon', message: 'Starting device auto-approve daemon...' });

    const host = sandbox.getHost(GATEWAY_PORT);
    const endpoint = `https://${host}`;
    emit({ step: 'sandbox_ready', message: `Sandbox ready — endpoint: ${endpoint}` });
    console.log('[sandbox] WebUI:', `${endpoint}#token=${gwToken}`);

    return { sandboxId, endpoint, gatewayToken: gwToken };
  } catch (err) {
    console.error('[sandbox] Creation failed, cleaning up sandbox', sandboxId);
    try { await sandbox.kill(); } catch { /* ignore */ }
    throw err;
  }
}

export async function killSandbox(sandboxId: string, apiKey?: string): Promise<void> {
  console.log('[sandbox] Killing sandbox:', sandboxId);
  const opts = apiKey ? { apiKey, timeoutMs: SANDBOX_KEEP_ALIVE_MS } : { timeoutMs: SANDBOX_KEEP_ALIVE_MS };
  const sandbox = await Sandbox.connect(sandboxId, opts);
  await sandbox.kill();
  console.log('[sandbox] Sandbox terminated:', sandboxId);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
