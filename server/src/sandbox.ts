import { Sandbox } from 'novita-sandbox';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

function generateOpenClawConfig(apiKey: string, gatewayToken: string): Record<string, unknown> {
  const config = loadOpenClawConfigTemplate();

  const models = config.models as Record<string, unknown> | undefined;
  const providers = models?.providers as Record<string, Record<string, unknown>> | undefined;
  if (providers) {
    for (const provider of Object.values(providers)) {
      if (provider.apiKey === API_KEY_PLACEHOLDER) {
        provider.apiKey = apiKey;
      }
    }
  }

  config.gateway = {
    mode: 'local',
    auth: { mode: 'token', token: gatewayToken },
    http: {
      endpoints: {
        responses: { enabled: true },
      },
    },
    controlUi: {
      dangerouslyAllowHostHeaderOriginFallback: true,
      dangerouslyDisableDeviceAuth: true,
    },
  };

  return config;
}

const DEVICE_AUTO_APPROVE_SCRIPT = `#!/bin/bash
export OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH}"
while true; do
  openclaw devices list --json 2>/dev/null \\
    | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{JSON.parse(d).pending.forEach(p=>console.log(p.requestId))}catch(e){}})' \\
    | while read -r rid; do
        openclaw devices approve "$rid" 2>/dev/null
      done
  sleep 2
done
`;

export interface SandboxCreateResult {
  sandboxId: string;
  endpoint: string;
  gatewayToken: string;
}

export async function createSandbox(
  apiKey: string,
  gatewayToken?: string,
): Promise<SandboxCreateResult> {
  const gwToken = gatewayToken || crypto.randomBytes(16).toString('base64url');

  console.log('[sandbox] Creating sandbox from template:', TEMPLATE_ID);
  const sandbox = await Sandbox.create(TEMPLATE_ID, {
    timeoutMs: SANDBOX_KEEP_ALIVE_MS,
    metadata: SANDBOX_METADATA,
    apiKey,
  });

  const sandboxId = sandbox.sandboxId;
  console.log('[sandbox] Sandbox created:', sandboxId);

  try {
    console.log('[sandbox] Writing OpenClaw configuration...');
    const config = generateOpenClawConfig(apiKey, gwToken);
    const configContent = JSON.stringify(config, null, 2);

    await sandbox.commands.run('mkdir -p /home/user/.openclaw', { timeoutMs: 10_000 });
    await sandbox.files.write(OPENCLAW_CONFIG_PATH, configContent);
    console.log('[sandbox] OpenClaw configuration written');

    console.log('[sandbox] Starting OpenClaw Gateway on port', GATEWAY_PORT);
    await sandbox.commands.run(
      `nohup bash -c 'OPENCLAW_CONFIG_PATH=${OPENCLAW_CONFIG_PATH} openclaw gateway --port ${GATEWAY_PORT} --bind lan' > /tmp/gateway.log 2>&1 &`,
      { timeoutMs: 10_000 },
    );

    const maxChecks = 120;
    let ready = false;
    for (let i = 0; i < maxChecks; i++) {
      try {
        const result = await sandbox.commands.run(
          `curl -s --max-time 2 -o /dev/null -w "%{http_code}" http://localhost:${GATEWAY_PORT}/ 2>/dev/null; echo`,
          { timeoutMs: 10_000 },
        );
        if (result.stdout?.trim() === '200') {
          ready = true;
          break;
        }
      } catch {
        // retry
      }
      if ((i + 1) % 10 === 0) {
        console.log(`[sandbox] Waiting for Gateway to start (${i + 1}/${maxChecks})...`);
      }
      await sleep(1000);
    }

    if (!ready) {
      let logText = '';
      try {
        const logResult = await sandbox.commands.run('tail -30 /tmp/gateway.log 2>&1 || true', { timeoutMs: 5_000 });
        logText = logResult.stdout?.trim() || '';
      } catch { /* ignore */ }
      console.error('[sandbox] Gateway failed to start. Log:', logText || '(empty)');
      throw new Error(`Gateway did not start in time.${logText ? `\n${logText}` : ''}`);
    }
    console.log('[sandbox] Gateway is ready');

    console.log('[sandbox] Starting device auto-approve daemon...');
    await sandbox.files.write('/tmp/device-auto-approve.sh', DEVICE_AUTO_APPROVE_SCRIPT);
    await sandbox.commands.run(
      'nohup bash /tmp/device-auto-approve.sh > /tmp/device-auto-approve.log 2>&1 &',
      { timeoutMs: 10_000 },
    );
    console.log('[sandbox] Device auto-approve daemon started');

    const host = sandbox.getHost(GATEWAY_PORT);
    const endpoint = `https://${host}`;
    console.log('[sandbox] Sandbox ready — endpoint:', endpoint);

    return { sandboxId, endpoint, gatewayToken: gwToken };
  } catch (err) {
    console.error('[sandbox] Creation failed, cleaning up sandbox', sandboxId);
    try { await sandbox.kill(); } catch { /* ignore */ }
    throw err;
  }
}

export async function killSandbox(sandboxId: string, apiKey?: string): Promise<void> {
  console.log('[sandbox] Killing sandbox:', sandboxId);
  const opts = apiKey ? { apiKey } : {};
  const sandbox = await Sandbox.connect(sandboxId, opts);
  await sandbox.kill();
  console.log('[sandbox] Sandbox terminated:', sandboxId);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
