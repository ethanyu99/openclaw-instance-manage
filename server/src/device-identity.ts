import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const KEYS_FILE = path.join(DATA_DIR, 'device-keys.json');

interface DeviceKeys {
  publicKey: string;
  privateKey: string;
  deviceId: string;
}

let cachedKeys: DeviceKeys | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function generateKeys(): DeviceKeys {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const pubDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const fingerprint = crypto.createHash('sha256').update(pubDer).digest('hex').slice(0, 32);

  return {
    publicKey,
    privateKey,
    deviceId: fingerprint,
  };
}

export function getDeviceKeys(): DeviceKeys {
  if (cachedKeys) return cachedKeys;

  ensureDataDir();
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const raw = fs.readFileSync(KEYS_FILE, 'utf-8');
      cachedKeys = JSON.parse(raw);
      return cachedKeys!;
    }
  } catch {
    // regenerate on corruption
  }

  cachedKeys = generateKeys();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(cachedKeys, null, 2), 'utf-8');
  return cachedKeys;
}

export function getPublicKeyBase64(): string {
  const keys = getDeviceKeys();
  const pubDer = crypto.createPublicKey(keys.publicKey).export({ type: 'spki', format: 'der' });
  return pubDer.toString('base64');
}

/**
 * Sign a connect payload with the device private key.
 * OpenClaw v2 signature payload format:
 *   JSON.stringify({ deviceId, clientId, role, scopes, token, nonce, ts })
 */
export function signConnectPayload(params: {
  nonce: string;
  clientId: string;
  role: string;
  scopes: string[];
  token?: string;
}): { signature: string; signedAt: number } {
  const keys = getDeviceKeys();
  const signedAt = Date.now();

  const payload = JSON.stringify({
    deviceId: keys.deviceId,
    clientId: params.clientId,
    role: params.role,
    scopes: params.scopes,
    token: params.token || '',
    nonce: params.nonce,
    ts: signedAt,
  });

  const privateKeyObj = crypto.createPrivateKey(keys.privateKey);
  const signature = crypto.sign(null, Buffer.from(payload), privateKeyObj);

  return {
    signature: signature.toString('base64'),
    signedAt,
  };
}
