// Stream-2-Prune-Helper: BFS vom Landing-Entry durch alle Imports/Re-Exports.
// Ausgabe: erreichbarer File-Set + Prune-Kandidaten in ueber-kopierten Dirs.
// Read-only. Loescht NICHTS — Vorschlag liegt als JSON vor.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENTRIES = [
  path.join(ROOT, 'app/page.tsx'),
  path.join(ROOT, 'app/layout.tsx'),
  path.join(ROOT, 'i18n/request.ts'),
  path.join(ROOT, 'next.config.ts'),
];

const EXT = ['.tsx', '.ts', '.web.tsx', '.web.ts'];
function tryResolve(p) {
  for (const e of EXT) { if (existsSync(p + e)) return p + e; }
  for (const e of EXT) { if (existsSync(path.join(p, 'index' + e))) return path.join(p, 'index' + e); }
  if (existsSync(p) && statSync(p).isFile()) return p;
  return null;
}

function resolveImport(spec, fromFile) {
  if (spec.startsWith('@/')) return tryResolve(path.join(ROOT, spec.slice(2)));
  if (spec.startsWith('./') || spec.startsWith('../')) return tryResolve(path.resolve(path.dirname(fromFile), spec));
  return null; // external
}

const visited = new Set();
const queue = ENTRIES.filter((e) => existsSync(e));
const IMPORT_RE = /(?:import\s[^'"\n]*from\s*|export\s[^'"\n]*from\s*|import\s*\(\s*)['"`]([^'"`]+)['"`]/g;

while (queue.length) {
  const f = queue.shift();
  if (visited.has(f)) continue;
  visited.add(f);
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const resolved = resolveImport(m[1], f);
    if (resolved && !visited.has(resolved)) queue.push(resolved);
  }
}

// Walk over-copied dirs, list files NOT reachable
const SCAN_DIRS = [
  'components/shared', 'components/ui', 'components/primitives',
  'components/analytics', 'components/landing',
  'lib/actions', 'lib/leads', 'lib/email', 'lib/whatsapp',
  'lib/branding', 'lib/analytics', 'lib/brand',
];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(fp));
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(fp);
  }
  return out;
}

const orphans = [];
for (const rel of SCAN_DIRS) {
  const dir = path.join(ROOT, rel);
  if (!existsSync(dir)) continue;
  for (const f of walk(dir)) if (!visited.has(f)) orphans.push(path.relative(ROOT, f).replace(/\\/g, '/'));
}

const prune = process.argv.includes('--prune');
if (prune) {
  const { unlinkSync } = await import('node:fs');
  let deleted = 0;
  for (const rel of orphans) {
    try { unlinkSync(path.join(ROOT, rel)); deleted++; } catch {}
  }
  // entferne leere Verzeichnisse rekursiv (best effort)
  const { rmdirSync } = await import('node:fs');
  function pruneEmpty(dir) {
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(path.join(dir, e.name));
      if (readdirSync(dir).length === 0) rmdirSync(dir);
    } catch {}
  }
  for (const rel of SCAN_DIRS) { const d = path.join(ROOT, rel); if (existsSync(d)) pruneEmpty(d); }
  console.log(JSON.stringify({ pruned: deleted, reachable_kept: visited.size }, null, 1));
} else {
  console.log(JSON.stringify({
    reachable: visited.size,
    orphans_count: orphans.length,
    by_dir: orphans.reduce((acc, p) => { const d = p.split('/').slice(0, 2).join('/'); acc[d] = (acc[d] || 0) + 1; return acc; }, {}),
    orphans,
  }, null, 1));
}
