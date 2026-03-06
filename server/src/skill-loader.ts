import fs from 'fs';
import path from 'path';
import type { SkillDefinition, SkillCategory } from '../../shared/types';

const VALID_CATEGORIES: SkillCategory[] = [
  'coding', 'search', 'browser', 'media', 'devops',
  'data', 'communication', 'productivity', 'other',
];

function isValidCategory(val: string): val is SkillCategory {
  return VALID_CATEGORIES.includes(val as SkillCategory);
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  homepage?: string;
  metadata?: Record<string, unknown>;
}

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const raw = match[1];
  const fm: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[key] = val;
  }

  const body = content.slice(match[0].length).trim();
  return { frontmatter: fm as unknown as SkillFrontmatter, body };
}

interface SkillMetadata {
  id: string;
  author?: string;
  category?: string;
  tags?: string[];
  homepage?: string;
  emoji?: string;
  requires?: {
    bins?: string[];
    env?: string[];
    config?: string[];
  };
}

function loadSingleSkill(dirPath: string, dirName: string): SkillDefinition | null {
  const skillMdPath = path.join(dirPath, 'SKILL.md');
  const metaPath = path.join(dirPath, 'metadata.json');

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const skillMd = fs.readFileSync(skillMdPath, 'utf-8');
  const { frontmatter } = parseFrontmatter(skillMd);

  let meta: SkillMetadata = { id: dirName };
  if (fs.existsSync(metaPath)) {
    try {
      meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) };
    } catch (err) {
      console.warn(`[skill-loader] Invalid metadata.json in ${dirName}:`, err);
    }
  }

  const extraFiles: Record<string, string> = {};
  const scanExtras = (base: string, prefix: string) => {
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.name === 'SKILL.md' || entry.name === 'metadata.json') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanExtras(path.join(base, entry.name), rel);
      } else {
        try {
          extraFiles[rel] = fs.readFileSync(path.join(base, entry.name), 'utf-8');
        } catch { /* skip binary or unreadable files */ }
      }
    }
  };
  scanExtras(dirPath, '');

  const category = isValidCategory(meta.category ?? '') ? meta.category as SkillCategory : 'other';

  return {
    id: meta.id || dirName,
    name: frontmatter.name || dirName,
    description: frontmatter.description || '',
    author: meta.author || 'unknown',
    category,
    tags: meta.tags || [],
    skillMd,
    extraFiles: Object.keys(extraFiles).length > 0 ? extraFiles : undefined,
    metadata: {
      homepage: meta.homepage || frontmatter.homepage,
      emoji: meta.emoji,
      requires: meta.requires,
    },
  };
}

class SkillLoader {
  private skills: SkillDefinition[] = [];
  private skillMap = new Map<string, SkillDefinition>();
  private skillsDir: string;
  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || path.resolve(process.cwd(), '..', 'skills');
    if (!fs.existsSync(this.skillsDir)) {
      this.skillsDir = path.resolve(process.cwd(), 'skills');
    }
  }

  loadAll(): void {
    if (!fs.existsSync(this.skillsDir)) {
      console.warn(`[skill-loader] Skills directory not found: ${this.skillsDir}`);
      this.skills = [];
      this.skillMap.clear();
      return;
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const loaded: SkillDefinition[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dirPath = path.join(this.skillsDir, entry.name);
      const skill = loadSingleSkill(dirPath, entry.name);
      if (skill) loaded.push(skill);
    }

    this.skills = loaded;
    this.skillMap.clear();
    for (const s of loaded) {
      this.skillMap.set(s.id, s);
    }
    console.log(`[skill-loader] Loaded ${loaded.length} skills from ${this.skillsDir}`);
  }

  watch(): void {
    if (this.watcher) return;
    if (!fs.existsSync(this.skillsDir)) return;

    try {
      this.watcher = fs.watch(this.skillsDir, { recursive: true }, (_event, _filename) => {
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => {
          console.log('[skill-loader] Skills directory changed, reloading...');
          this.loadAll();
        }, 500);
      });
      console.log(`[skill-loader] Watching ${this.skillsDir} for changes`);
    } catch (err) {
      console.warn('[skill-loader] Could not start file watcher:', err);
    }
  }

  stopWatch(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  getAll(): SkillDefinition[] {
    return this.skills;
  }

  getById(id: string): SkillDefinition | undefined {
    return this.skillMap.get(id);
  }

  search(query: string): SkillDefinition[] {
    const q = query.toLowerCase();
    return this.skills.filter(s =>
      s.name.toLowerCase().includes(q)
      || s.description.toLowerCase().includes(q)
      || s.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  getByCategory(category: string): SkillDefinition[] {
    return this.skills.filter(s => s.category === category);
  }

  getSkillMd(id: string): string | null {
    const skill = this.skillMap.get(id);
    return skill?.skillMd ?? null;
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }
}

export const skillLoader = new SkillLoader();

export function initSkillLoader(): void {
  skillLoader.loadAll();
  skillLoader.watch();
}
