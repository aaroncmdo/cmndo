#!/usr/bin/env node
// CMM-44 SP-I5 PR1 — View-Repoint-DDL (SP-I3/I4-Muster). 1 View (v_faelle_mit_aktuellem_termin,
// hat kf-Join schon), 6 Rüge-Spalten f.<col> -> kf.<col>. ruege_betrag mit Precision-Cast;
// ruege_counter/ruege_frist_tage via COALESCE auf die faelle-Defaults (0/14). kanzlei_id
// (SP-I6) BLEIBT f. (separater Slice nach Aaron-Verdikt). Liest scripts/_spi5-tmp/<view>.out.
// Fetch (intermediate): npx supabase db query --linked -o json
//   "SELECT pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass,true) AS def;" > scripts/_spi5-tmp/v_faelle_mit_aktuellem_termin.out
// Aufruf: node scripts/_spi5-gen-views.mjs <migration.sql>
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const MIGRATION = process.argv[2]
if (!MIGRATION) { console.error('Usage: node _spi5-gen-views.mjs <migration.sql>'); process.exit(1) }

function readDef(view) {
  const out = fs.readFileSync(fileURLToPath(new URL(`./_spi5-tmp/${view}.out`, import.meta.url)), 'utf8')
  const start = out.indexOf('{')
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < out.length; i++) {
    const ch = out[i]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false }
    else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(out.slice(start, i + 1)).rows[0].def }
  }
  throw new Error(`viewdef-JSON fuer ${view} nicht parsebar`)
}

const COALESCE_CNT = 'COALESCE(kf.ruege_counter, 0) AS ruege_counter'
const COALESCE_FRIST = 'COALESCE(kf.ruege_frist_tage, 14) AS ruege_frist_tage'
const REPL = {
  ruege_erhalten_am: 'kf.ruege_erhalten_am',
  ruege_grund: 'kf.ruege_grund',
  ruege_gesendet_am: 'kf.ruege_gesendet_am',
  ruege_betrag: 'kf.ruege_betrag::numeric(10,2) AS ruege_betrag',
  ruege_counter: COALESCE_CNT,
  ruege_frist_tage: COALESCE_FRIST,
}
const KF_JOIN = 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id'
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let s = readDef('v_faelle_mit_aktuellem_termin')
for (const col of Object.keys(REPL)) {
  const re = new RegExp('(?<![A-Za-z_])f\\.' + esc(col) + '\\b', 'g')
  const before = s
  s = s.replace(re, REPL[col])
  if (s === before) { console.error(`FAIL f.${col} nicht gefunden`); process.exit(1) }
}
const ddl = `CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ${s}`
for (const col of Object.keys(REPL)) {
  if (new RegExp('(?<![A-Za-z_])f\\.' + esc(col) + '\\b').test(ddl)) { console.error(`FAIL bare f.${col} verbleibt`); process.exit(1) }
}
// kanzlei_id MUSS f. bleiben (deferred):
if (!/(?<![A-Za-z_])f\.kanzlei_id\b/.test(ddl)) { console.error('FAIL f.kanzlei_id wurde faelschlich angefasst'); process.exit(1) }
const jc = ddl.split(KF_JOIN).length - 1
if (jc !== 1) { console.error(`FAIL kf-Join count=${jc}`); process.exit(1) }
const term = ddl.replace(/[;\s]+$/, '') + ';'

const sql = `-- CMM-44 SP-I5 PR1 -- Rüge (6 Spalten) faelle -> kanzlei_faelle, additiv (kein DROP).
-- Nach Apply: npx supabase migration repair --status applied 20260523200236
-- Plan: docs/superpowers/plans/2026-05-23-cmm44-spi5-ruege.md
-- Live-Drift 2026-05-23: alle 6 nur auf faelle. cov: 4x 0; ruege_counter 49/49 (=Default 0),
--   ruege_frist_tage 49/49 (=Default 14) -> kanzlei_faelle erbt die Defaults, Views COALESCEn.
-- kanzlei_id (SP-I6) NICHT enthalten: TBD-Verdikt + .eq('kanzlei_id')-Billing-Filter (separater Slice).
-- Block 2 (View-Repoint) generiert via scripts/_spi5-gen-views.mjs (1 View, kf-Join existiert).
BEGIN;

-- Block 1: 6 ADD COLUMN auf kanzlei_faelle (Typen exakt von faelle; counter/frist_tage mit Default).
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN ruege_erhalten_am timestamptz,
  ADD COLUMN ruege_grund text,
  ADD COLUMN ruege_gesendet_am timestamptz,
  ADD COLUMN ruege_betrag numeric(10,2),
  ADD COLUMN ruege_counter integer DEFAULT 0,
  ADD COLUMN ruege_frist_tage integer DEFAULT 14;

-- KEIN Daten-Backfill: 4 Spalten cov=0; ruege_counter/ruege_frist_tage via ADD-DEFAULT (0/14)
-- + View-COALESCE gedeckt (existierende kanzlei_faelle-Rows bekommen die Defaults automatisch).

-- Block 2: View-Repoint (v_faelle_mit_aktuellem_termin, 6x f.->kf., kf-Join via SP-I1).
${term}

COMMIT;
`
fs.writeFileSync(MIGRATION, sql)
console.log(`OK — Migration geschrieben (${sql.length} bytes), alle Asserts gruen: ${MIGRATION}`)
