/**
 * Sync skills from the upstream openclaw/skills GitHub repository.
 *
 * Usage:
 *   npx tsx scripts/sync-skills.ts                   # sync all
 *   npx tsx scripts/sync-skills.ts --filter web      # sync skills matching "web"
 *   npx tsx scripts/sync-skills.ts --list             # list upstream skills without syncing
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const UPSTREAM_DIR = path.join(SKILLS_DIR, '.upstream');
const UPSTREAM_REPO = 'https://github.com/openclaw/skills.git';

interface SyncReport {
  added: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}

function run(cmd: string, opts?: { cwd?: string }): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: opts?.cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err: any) {
    throw new Error(`Command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

function cloneOrPull(): void {
  if (!fs.existsSync(UPSTREAM_DIR)) {
    console.log(`Cloning ${UPSTREAM_REPO} ...`);
    run(`git clone --depth 1 "${UPSTREAM_REPO}" "${UPSTREAM_DIR}"`);
  } else {
    console.log('Pulling latest changes...');
    try {
      run('git pull --ff-only', { cwd: UPSTREAM_DIR });
    } catch {
      console.warn('Pull failed, re-cloning...');
      fs.rmSync(UPSTREAM_DIR, { recursive: true, force: true });
      run(`git clone --depth 1 "${UPSTREAM_REPO}" "${UPSTREAM_DIR}"`);
    }
  }
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[key] = val;
  }
  return fm;
}

function findUpstreamSkills(): Array<{ dirName: string; dirPath: string; name: string; description: string }> {
  const skillsRoot = path.join(UPSTREAM_DIR, 'skills');
  if (!fs.existsSync(skillsRoot)) {
    console.error(`No skills/ directory found in upstream repo at ${skillsRoot}`);
    return [];
  }

  const results: Array<{ dirName: string; dirPath: string; name: string; description: string }> = [];

  // openclaw/skills has structure: skills/<author>/<skill-name>/SKILL.md
  for (const authorEntry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!authorEntry.isDirectory() || authorEntry.name.startsWith('.')) continue;
    const authorDir = path.join(skillsRoot, authorEntry.name);

    for (const skillEntry of fs.readdirSync(authorDir, { withFileTypes: true })) {
      if (!skillEntry.isDirectory() || skillEntry.name.startsWith('.')) continue;
      const skillDir = path.join(authorDir, skillEntry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const fm = parseFrontmatter(content);
      results.push({
        dirName: fm.name || skillEntry.name,
        dirPath: skillDir,
        name: fm.name || skillEntry.name,
        description: fm.description || '',
      });
    }
  }

  return results;
}

function syncSkill(
  upstream: { dirName: string; dirPath: string; name: string; description: string },
  report: SyncReport,
  overwrite: boolean,
): void {
  const targetDir = path.join(SKILLS_DIR, upstream.dirName);
  const targetSkillMd = path.join(targetDir, 'SKILL.md');
  const targetMeta = path.join(targetDir, 'metadata.json');
  const sourceSkillMd = path.join(upstream.dirPath, 'SKILL.md');

  const isNew = !fs.existsSync(targetDir);

  if (!isNew && !overwrite) {
    const existingContent = fs.existsSync(targetSkillMd)
      ? fs.readFileSync(targetSkillMd, 'utf-8')
      : '';
    const newContent = fs.readFileSync(sourceSkillMd, 'utf-8');
    if (existingContent === newContent) {
      report.skipped.push(upstream.dirName);
      return;
    }
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourceSkillMd, targetSkillMd);

  // Copy extra files (scripts/ etc.) but never overwrite metadata.json
  for (const entry of fs.readdirSync(upstream.dirPath, { withFileTypes: true })) {
    if (entry.name === 'SKILL.md' || entry.name === 'metadata.json' || entry.name === '_meta.json') continue;
    const srcPath = path.join(upstream.dirPath, entry.name);
    const dstPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(srcPath, dstPath, { recursive: true, force: true });
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }

  // Generate metadata.json only if it doesn't exist
  if (!fs.existsSync(targetMeta)) {
    const parentDir = path.basename(path.dirname(upstream.dirPath));
    const meta = {
      id: upstream.dirName,
      author: parentDir,
      category: 'other',
      tags: [] as string[],
    };
    fs.writeFileSync(targetMeta, JSON.stringify(meta, null, 2) + '\n');
  }

  if (isNew) {
    report.added.push(upstream.dirName);
  } else {
    report.updated.push(upstream.dirName);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const overwrite = args.includes('--force');
  const filterIdx = args.indexOf('--filter');
  const filter = filterIdx !== -1 && args[filterIdx + 1] ? args[filterIdx + 1].toLowerCase() : null;

  fs.mkdirSync(SKILLS_DIR, { recursive: true });

  cloneOrPull();

  const upstreamSkills = findUpstreamSkills();
  console.log(`\nFound ${upstreamSkills.length} skills in upstream repo\n`);

  if (upstreamSkills.length === 0) {
    console.log('No skills found. The upstream repo structure may have changed.');
    return;
  }

  const filtered = filter
    ? upstreamSkills.filter(s =>
        s.name.toLowerCase().includes(filter) ||
        s.description.toLowerCase().includes(filter)
      )
    : upstreamSkills;

  if (listOnly) {
    console.log('Available upstream skills:\n');
    for (const s of filtered) {
      const exists = fs.existsSync(path.join(SKILLS_DIR, s.dirName, 'SKILL.md'));
      const status = exists ? '[synced]' : '[new]';
      console.log(`  ${status} ${s.dirName} — ${s.description.slice(0, 80)}`);
    }
    console.log(`\nTotal: ${filtered.length} skills`);
    return;
  }

  const report: SyncReport = { added: [], updated: [], skipped: [], errors: [] };

  for (const skill of filtered) {
    try {
      syncSkill(skill, report, overwrite);
    } catch (err: any) {
      console.error(`  Error syncing ${skill.dirName}:`, err.message);
      report.errors.push(`${skill.dirName}: ${err.message}`);
    }
  }

  console.log('\n=== Sync Report ===');
  console.log(`  Added:   ${report.added.length}${report.added.length > 0 ? ' (' + report.added.join(', ') + ')' : ''}`);
  console.log(`  Updated: ${report.updated.length}${report.updated.length > 0 ? ' (' + report.updated.join(', ') + ')' : ''}`);
  console.log(`  Skipped: ${report.skipped.length} (unchanged)`);
  if (report.errors.length > 0) {
    console.log(`  Errors:  ${report.errors.length}`);
    for (const e of report.errors) console.log(`    - ${e}`);
  }
  console.log('');
}

main();
