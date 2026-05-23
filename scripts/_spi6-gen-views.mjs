#!/usr/bin/env node
// CMM-44 SP-I6 PR1 — View-Repoint-DDL. 1 View (v_faelle_mit_aktuellem_termin, kf-Join via SP-I1),
// 1 Spalte f.kanzlei_id -> kf.kanzlei_id (uuid, bare Swap). Liest scripts/_spi6-tmp/v.out.
// Fetch: npx supabase db query --linked -o json "SELECT pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass,true) AS def;" > scripts/_spi6-tmp/v.out
// Aufruf: node scripts/_spi6-gen-views.mjs <migration.sql>
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const MIGRATION = process.argv[2]
if (!MIGRATION) { console.error('Usage: node _spi6-gen-views.mjs <migration.sql>'); process.exit(1) }

const out = fs.readFileSync(fileURLToPath(new URL('./_spi6-tmp/v.out', import.meta.url)), 'utf8')
const start = out.indexOf('{')
let depth = 0, inStr = false, esc = false, def = null
for (let i = start; i < out.length; i++) {
  const ch = out[i]
  if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false }
  else if (ch === '"') inStr = true
  else if (ch === '{') depth++
  else if (ch === '}') { depth--; if (depth === 0) { def = JSON.parse(out.slice(start, i + 1)).rows[0].def; break } }
}
if (!def) { console.error('viewdef nicht parsebar'); process.exit(1) }

const re = /(?<![A-Za-z_])f\.kanzlei_id\b/g
const before = def
const swapped = def.replace(re, 'kf.kanzlei_id')
if (swapped === before) { console.error('FAIL f.kanzlei_id nicht gefunden'); process.exit(1) }
const ddl = `CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ${swapped}`
if (/(?<![A-Za-z_])f\.kanzlei_id\b/.test(ddl)) { console.error('FAIL bare f.kanzlei_id verbleibt'); process.exit(1) }
if (!ddl.includes('kf.kanzlei_id')) { console.error('FAIL kf.kanzlei_id fehlt'); process.exit(1) }
const jc = ddl.split('LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id').length - 1
if (jc !== 1) { console.error(`FAIL kf-Join count=${jc}`); process.exit(1) }
const term = ddl.replace(/[;\s]+$/, '') + ';'

const sql = `-- CMM-44 SP-I6 PR1 -- kanzlei_id (1 Spalte) faelle -> kanzlei_faelle, additiv (kein DROP).
-- Nach Apply: npx supabase migration repair --status applied 20260523202538
-- Plan: docs/superpowers/plans/2026-05-23-cmm44-spi6-kanzlei-id.md
-- kanzlei_id = Fall->Kanzlei-Zuordnung (kanzleien-Tabelle, FK unenforced), cov=0 -> kein Backfill.
-- Letzter SP-I-Slice -> SP-I komplett. Block 2 (View-Repoint) via scripts/_spi6-gen-views.mjs.
BEGIN;

-- Block 1: kanzlei_id additiv auf kanzlei_faelle (uuid, wie faelle; FK auf kanzleien bewusst NICHT
-- gesetzt — faelle hatte auch keine, wird ggf. spaeter ergaenzt).
ALTER TABLE public.kanzlei_faelle ADD COLUMN kanzlei_id uuid;

-- KEIN Backfill: cov=0.

-- Block 2: View-Repoint (v_faelle_mit_aktuellem_termin, f.kanzlei_id -> kf.kanzlei_id).
${term}

COMMIT;
`
fs.writeFileSync(MIGRATION, sql)
console.log(`OK — Migration geschrieben (${sql.length} bytes): ${MIGRATION}`)
