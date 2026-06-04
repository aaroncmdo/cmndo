#!/usr/bin/env node
/**
 * Token-Drift-Lint
 * ----------------
 * Prüft, ob die :root-Hex-Werte in den Cluster-`globals.css`-Files
 * mit der zentralen `tokens.json` (Single-Source-of-Truth) übereinstimmen.
 *
 * Exit-Codes:
 *   0  → alle Cluster sync OK
 *   1  → Drift detected (CI-Fail, Build blockiert)
 *   2  → Setup-Fehler (tokens.json fehlt etc.)
 *
 * Defaults (overridable via ENV):
 *   TOKENS_PATH  → <repo-root>/tokens.json
 *   REPO_ROOT    → ../ relative zum Script
 *
 * Erwartete Repo-Struktur:
 *   <repo-root>/
 *     scripts/gen-tokens-check.mjs   (dieses Script)
 *     tokens.json                     (Single-Source-of-Truth)
 *     kfz-gutachter-wuppertal/app/globals.css
 *     kfz-gutachter-duesseldorf/app/globals.css
 *     kfz-gutachter-bonn/app/globals.css
 *
 * Verwendung:
 *   node scripts/gen-tokens-check.mjs
 *   TOKENS_PATH=/path/to/tokens.json node scripts/gen-tokens-check.mjs
 *
 * Cowork + Claude-Code · 2026-06-04
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.REPO_ROOT
  ? resolve(process.env.REPO_ROOT)
  : resolve(__dirname, '..');

const TOKENS_PATH = process.env.TOKENS_PATH
  ? resolve(process.env.TOKENS_PATH)
  : join(REPO_ROOT, 'tokens.json');

const CHECKED_TOKENS = [
  'petrol',
  'petrol-tint',
  'petrol-300',
  'petrol-700',
  'amber',
  'amber-aa',
  'amber-700',
];

const PLACEHOLDER_PREFIX = 'TODO_';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeColor(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase().replace(/\s+/g, '');
}

function loadTokens() {
  if (!existsSync(TOKENS_PATH)) {
    console.error(`\n✗ tokens.json not found at ${TOKENS_PATH}`);
    console.error(`  Set TOKENS_PATH env var or place tokens.json in repo root.\n`);
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  } catch (err) {
    console.error(`\n✗ tokens.json at ${TOKENS_PATH} is not valid JSON:`);
    console.error(`  ${err.message}\n`);
    process.exit(2);
  }
}

function findClusterCss(cluster) {
  const candidates = [
    join(REPO_ROOT, `kfz-gutachter-${cluster}`, 'app', 'globals.css'),
    join(REPO_ROOT, `kfz-unfallgutachter-${cluster}`, 'app', 'globals.css'),
    join(REPO_ROOT, cluster, 'app', 'globals.css'),
  ];
  return candidates.find(p => existsSync(p));
}

function extractCssVar(css, varName) {
  const regex = new RegExp(`--${escapeRegex(varName)}\\s*:\\s*([^;]+);`, 'i');
  const match = css.match(regex);
  return match ? match[1].trim() : null;
}

function main() {
  console.log(`\n🔍 Token-Drift Check\n   tokens.json: ${TOKENS_PATH}\n   repo-root:   ${REPO_ROOT}\n`);

  const tokens = loadTokens();
  if (!tokens.clusters || typeof tokens.clusters !== 'object') {
    console.error('✗ tokens.json missing "clusters" object\n');
    process.exit(2);
  }

  const clusters = Object.keys(tokens.clusters);
  const errors = [];
  const warnings = [];
  const summary = { checked: 0, ok: 0, drift: 0, missing: 0, skipped: 0 };

  for (const cluster of clusters) {
    const cssPath = findClusterCss(cluster);
    if (!cssPath) {
      warnings.push(`⚠ ${cluster}: globals.css not found (skip — checked kfz-gutachter-${cluster}/, kfz-unfallgutachter-${cluster}/, ${cluster}/)`);
      continue;
    }

    const css = readFileSync(cssPath, 'utf-8');
    const clusterTokens = tokens.clusters[cluster];

    for (const token of CHECKED_TOKENS) {
      summary.checked++;
      const expected = clusterTokens[token];

      if (!expected || typeof expected !== 'string') {
        warnings.push(`⚠ ${cluster}.${token}: tokens.json value missing or not a string (skip)`);
        summary.skipped++;
        continue;
      }
      if (expected.startsWith(PLACEHOLDER_PREFIX)) {
        warnings.push(`⚠ ${cluster}.${token}: tokens.json has placeholder "${expected}" (skip until value provided)`);
        summary.skipped++;
        continue;
      }

      const actualRaw = extractCssVar(css, token);
      if (actualRaw === null) {
        errors.push(`✗ ${cluster}: --${token} MISSING in ${cssPath}`);
        summary.missing++;
        continue;
      }

      const expectedNorm = normalizeColor(expected);
      const actualNorm = normalizeColor(actualRaw);

      if (actualNorm !== expectedNorm) {
        errors.push(`✗ ${cluster}: --${token} expected ${expected}, got ${actualRaw}  (${cssPath})`);
        summary.drift++;
      } else {
        summary.ok++;
      }
    }
  }

  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach(w => console.log('  ' + w));
    console.log('');
  }

  if (errors.length) {
    console.error(`✗ ${errors.length} token drift(s) detected:\n`);
    errors.forEach(e => console.error('  ' + e));
    console.error('\nFix either tokens.json or the cluster globals.css to align.\n');
    console.error(`Summary: ${summary.ok} ok, ${summary.drift} drift, ${summary.missing} missing, ${summary.skipped} skipped (of ${summary.checked} checks)\n`);
    process.exit(1);
  }

  console.log(`✓ All cluster tokens sync OK`);
  console.log(`Summary: ${summary.ok} ok, ${summary.skipped} skipped (of ${summary.checked} checks across ${clusters.length} clusters)\n`);
  process.exit(0);
}

main();
