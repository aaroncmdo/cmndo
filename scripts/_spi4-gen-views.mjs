#!/usr/bin/env node
// CMM-44 SP-I4 PR1 — View-Repoint-DDL-Generierung (SP-I3-Muster, vereinfacht).
// Liest vorgefetchte Live-viewdefs aus scripts/_spi4-tmp/<view>.out und repointet die
// 12 Eskalations-Spalten f.<col> -> kf.<col> (alle timestamptz/text/uuid, KEINE Casts,
// KEINE Defaults -> bare Swap). Alle 3 Views haben den kf-Join schon (SP-I1/I2/I3).
// Wortgrenzen-Regex verhindert die Substring-Falle (ergebnis ⊂ ergebnis_am/_von).
//
// Fetch der .out-Inputs (intermediate, nicht committed) — git-bash:
//   mkdir -p scripts/_spi4-tmp
//   for V in v_faelle_mit_aktuellem_termin faelle_kunde_view faelle_sv_view; do
//     npx supabase db query --linked -o json \
//       "SELECT pg_get_viewdef('public.$V'::regclass, true) AS def;" > scripts/_spi4-tmp/$V.out
//   done
// Aufruf: node scripts/_spi4-gen-views.mjs <pfad-zur-migration.sql>
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const MIGRATION = process.argv[2]
if (!MIGRATION) { console.error('Usage: node _spi4-gen-views.mjs <migration.sql>'); process.exit(1) }

function readDef(view) {
  const out = fs.readFileSync(fileURLToPath(new URL(`./_spi4-tmp/${view}.out`, import.meta.url)), 'utf8')
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

const TAGE = [14, 21, 28]
const SUFFIX_ALL = ['am', 'ergebnis', 'ergebnis_am', 'ergebnis_von']
const SUFFIX_ERG = ['ergebnis', 'ergebnis_am'] // kunde/sv-Views fuehren nur ergebnis + ergebnis_am
const colsFor = (suffixes) => TAGE.flatMap((t) => suffixes.map((s) => `eskalation_tag_${t}_${s}`))
const ALL12 = colsFor(SUFFIX_ALL)
const PLAN = {
  v_faelle_mit_aktuellem_termin: ALL12,
  faelle_kunde_view: colsFor(SUFFIX_ERG),
  faelle_sv_view: colsFor(SUFFIX_ERG),
}
const KF_JOIN = 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id'
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function genView(view) {
  let s = readDef(view)
  for (const col of PLAN[view]) {
    const re = new RegExp('(?<![A-Za-z_])f\\.' + esc(col) + '\\b', 'g')
    const before = s
    s = s.replace(re, `kf.${col}`)
    if (s === before) { console.error(`FAIL [${view}] f.${col} nicht gefunden`); process.exit(1) }
  }
  const ddl = `CREATE OR REPLACE VIEW public.${view} AS ${s}`
  for (const col of PLAN[view]) {
    if (new RegExp('(?<![A-Za-z_])f\\.' + esc(col) + '\\b').test(ddl)) { console.error(`FAIL [${view}] bare f.${col} verbleibt`); process.exit(1) }
    if (!ddl.includes(`kf.${col}`)) { console.error(`FAIL [${view}] kf.${col} fehlt`); process.exit(1) }
  }
  const jc = ddl.split(KF_JOIN).length - 1
  if (jc !== 1) { console.error(`FAIL [${view}] kf-Join count=${jc} (erwartet 1)`); process.exit(1) }
  return ddl.replace(/[;\s]+$/, '') + ';'
}

const term = genView('v_faelle_mit_aktuellem_termin')
const kunde = genView('faelle_kunde_view')
const sv = genView('faelle_sv_view')

const sql = `-- CMM-44 SP-I4 PR1 -- Eskalation (12 Spalten) faelle -> kanzlei_faelle, additiv (kein DROP).
-- Nach Apply: npx supabase migration repair --status applied <version-aus-dateiname>
-- Plan: docs/superpowers/plans/2026-05-23-cmm44-spi4-eskalation.md
-- Live-Drift 2026-05-23: alle 12 nur auf faelle (kein kanzlei_faelle-Drift), cov=0 -> kein Backfill.
-- Typen: am/ergebnis_am=timestamptz, ergebnis=text, ergebnis_von=uuid (keine Casts/Defaults).
-- Block 2 (View-Repoints) generiert via scripts/_spi4-gen-views.mjs (3 Views, alle haben kf-Join via SP-I1/I2/I3).
BEGIN;

-- Block 1: 12 ADD COLUMN auf kanzlei_faelle (Typen exakt von faelle gespiegelt).
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN eskalation_tag_14_am timestamptz,
  ADD COLUMN eskalation_tag_14_ergebnis text,
  ADD COLUMN eskalation_tag_14_ergebnis_am timestamptz,
  ADD COLUMN eskalation_tag_14_ergebnis_von uuid,
  ADD COLUMN eskalation_tag_21_am timestamptz,
  ADD COLUMN eskalation_tag_21_ergebnis text,
  ADD COLUMN eskalation_tag_21_ergebnis_am timestamptz,
  ADD COLUMN eskalation_tag_21_ergebnis_von uuid,
  ADD COLUMN eskalation_tag_28_am timestamptz,
  ADD COLUMN eskalation_tag_28_ergebnis text,
  ADD COLUMN eskalation_tag_28_ergebnis_am timestamptz,
  ADD COLUMN eskalation_tag_28_ergebnis_von uuid;

-- KEIN Backfill: alle 12 cov=0.

-- Block 2: View-Repoints (server-seitig generiert aus Live-viewdefs 2026-05-23).
-- v_faelle_mit_aktuellem_termin (12x f.->kf.), faelle_kunde_view + faelle_sv_view (je 6x: ergebnis+ergebnis_am).
${term}

${kunde}

${sv}

COMMIT;
`
fs.writeFileSync(MIGRATION, sql)
console.log(`OK — Migration geschrieben (${sql.length} bytes), alle Asserts gruen: ${MIGRATION}`)
