import fs from 'fs';
import path from 'path';
import type { Instance, TaskSummary } from '../../shared/types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');

interface PersistedData {
  instances: Instance[];
  version: number;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadInstances(): Map<string, Instance> {
  ensureDataDir();
  const map = new Map<string, Instance>();
  try {
    if (fs.existsSync(INSTANCES_FILE)) {
      const raw = fs.readFileSync(INSTANCES_FILE, 'utf-8');
      const data: PersistedData = JSON.parse(raw);
      for (const inst of data.instances) {
        map.set(inst.id, inst);
      }
    }
  } catch {
    console.error('[persistence] Failed to load instances, starting fresh');
  }
  return map;
}

export function saveInstances(instances: Map<string, Instance>) {
  ensureDataDir();
  const data: PersistedData = {
    instances: Array.from(instances.values()),
    version: 1,
  };
  const tmp = INSTANCES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, INSTANCES_FILE);
}
