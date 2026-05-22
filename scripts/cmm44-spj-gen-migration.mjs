#!/usr/bin/env node
// CMM-44 SP-J PR1 (Bucket B) — Migration-Generator.
//
// Baut die komplette ADD-Migration:
//   1. 8x ADD COLUMN auf claims (Typen 1:1 aus Task-0-Live-Messung gespiegelt)
//   2. UPDATE-Backfill claims <- faelle (WHERE f.claim_id = c.id)
//   3. 3x CREATE OR REPLACE VIEW (faelle_kunde_view, faelle_sv_view,
//      v_faelle_mit_aktuellem_termin) — Repoint der 11 A+B-Spalten:
//        Bucket B (8): f.<col>  -> c.<col>
//        Bucket A (3): f.<col>  -> NULL::<exakter-typ> AS <col>  (pre-launch 0-cov;
//                      echte claim_payments-Reads laufen in PR2 ueber Bucket-A-Code)
//
// Die View-Defs werden LIVE via `supabase db query --linked` geholt; jede
// Substitution wird mit einer Occurrence-Assertion (genau 1x) abgesichert —
// bricht ab, falls eine Stelle 0x oder >1x matcht (Drift/Konflikt mit anderer Session).
// => Re-runnable: bei Apply (Task 2) erneut laufen lassen + gegen committete Datei diffen.
//
// Usage: node scripts/cmm44-spj-gen-migration.mjs <pfad-zur-migration.sql>

import { execSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MIG = process.argv[2]
if (!MIG) { console.error('Usage: node cmm44-spj-gen-migration.mjs <migration-file>'); process.exit(1) }

const TMP = mkdtempSync(join(tmpdir(), 'spj-gen-'))

function fetchViewDef(viewName) {
  const sqlFile = join(TMP, `${viewName}.sql`)
  writeFileSync(sqlFile, `SELECT pg_get_viewdef('public.${viewName}'::regclass, true) AS def;\n`)
  const raw = execSync(`npx supabase db query --linked --file "${sqlFile}"`, {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  })
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`[${viewName}] keine JSON-Antwort:\n${raw.slice(0, 400)}`)
  const json = JSON.parse(raw.slice(start, end + 1))
  const def = json?.rows?.[0]?.def
  if (!def || typeof def !== 'string') throw new Error(`[${viewName}] leere viewdef`)
  return def
}

function applyRepoints(def, repoints, viewName) {
  let out = def
  for (const [pat, repl] of repoints) {
    const count = out.split(pat).length - 1
    if (count !== 1) {
      throw new Error(`[${viewName}] pattern ${JSON.stringify(pat)} ${count}x gefunden (erwartet genau 1) — Drift/Konflikt, ABBRUCH`)
    }
    out = out.replace(pat, repl)
  }
  return out
}

// Bucket B (8): f.<col>, -> c.<col>,  (Typen identisch -> kein 42P16)
const BUCKET_B = [
  'guthaben_verrechnet_netto', 'sv_nachzahlung_netto', 'abrechnung_id',
  'schlussabrechnung_am', 'auszahlung_gutachter_eingegangen_am',
  'auszahlung_zahlungsweg', 'kanzlei_abrechnung_id', 'auszahlung_gutachter_betrag',
]
const bucketBRepoints = BUCKET_B.map((c) => [`f.${c},`, `c.${c},`])

// Bucket A (3): f.<col>, -> NULL::<exakter faelle-Typ> AS <col>,
const bucketARepoints = [
  ['f.zahlung_eingegangen_am,', 'NULL::timestamp with time zone AS zahlung_eingegangen_am,'],
  ['f.zahlung_betrag,', 'NULL::numeric(10,2) AS zahlung_betrag,'],
  ['f.zahlungsweg,', 'NULL::text AS zahlungsweg,'],
]

const views = {
  // v_faelle_mit_aktuellem_termin exponiert alle 11 (3 A + 8 B)
  v_faelle_mit_aktuellem_termin: [...bucketBRepoints, ...bucketARepoints],
  // faelle_kunde_view: nur auszahlung_zahlungsweg (Bucket B)
  faelle_kunde_view: [['f.auszahlung_zahlungsweg,', 'c.auszahlung_zahlungsweg,']],
  // faelle_sv_view: nur auszahlung_gutachter_eingegangen_am (Bucket B)
  faelle_sv_view: [['f.auszahlung_gutachter_eingegangen_am,', 'c.auszahlung_gutachter_eingegangen_am,']],
}

const viewBlocks = []
for (const [viewName, repoints] of Object.entries(views)) {
  const def = fetchViewDef(viewName)
  const repointed = applyRepoints(def, repoints, viewName)
  viewBlocks.push(`-- Repoint ${viewName}: ${repoints.length} Stelle(n) f.-> c./NULL (je genau 1x asserted)\nCREATE OR REPLACE VIEW public.${viewName} AS ${repointed.trimStart()}`)
  console.error(`OK  ${viewName}: ${repoints.length} Repoint(s) angewandt`)
}

const sql = `-- CMM-44 SP-J PR1 (Bucket B) — 8 ADD auf claims + Backfill + 3 View-Repoints
-- Generiert von scripts/cmm44-spj-gen-migration.mjs (View-Defs live geholt, Occurrence-asserted).
-- Typen 1:1 aus Task-0-Live-Messung (2026-05-22):
--   guthaben_verrechnet_netto = numeric(10,2) NOT NULL DEFAULT 0 (49 cov, faelle NOT NULL)
--   sv_nachzahlung_netto/auszahlung_* = wie faelle; abrechnung_id = uuid OHNE FK
--   (faelle hat KEINEN FK darauf; Spec-Annahme "REFERENCES abrechnungen" war falsch)
--   kanzlei_abrechnung_id = uuid REFERENCES kanzlei_abrechnungen(id) (NICHT abrechnungen!)
-- Bucket A (zahlung_*) bleiben faelle-only -> in Views als NULL::<typ>-Platzhalter (PR2 = claim_payments-Code).
-- REIN ADDITIV: faelle behaelt alle 12 bis Phase 6.
BEGIN;

-- Block 1: 8 ADD COLUMN auf claims (Bucket B)
${ADD_BLOCK()}

-- Block 2: Backfill claims <- faelle (49 faelle-Rows; 1 claim ohne faelle behaelt DEFAULT)
${BACKFILL_BLOCK()}

-- Block 3: View-Repoints (CREATE OR REPLACE — Spaltennamen/Typen/Reihenfolge unveraendert)
${viewBlocks.join('\n\n')}

COMMIT;
`

writeFileSync(MIG, sql)
console.error(`\nGeschrieben: ${MIG} (${sql.length} bytes)`)

function ADD_BLOCK() {
  return `ALTER TABLE public.claims
  ADD COLUMN guthaben_verrechnet_netto            numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN schlussabrechnung_am                 timestamptz,
  ADD COLUMN auszahlung_gutachter_betrag          numeric,
  ADD COLUMN auszahlung_gutachter_eingegangen_am  timestamptz,
  ADD COLUMN auszahlung_zahlungsweg               text,
  ADD COLUMN sv_nachzahlung_netto                 numeric(10,2),
  ADD COLUMN abrechnung_id                        uuid,
  ADD COLUMN kanzlei_abrechnung_id                uuid REFERENCES public.kanzlei_abrechnungen(id);`
}

function BACKFILL_BLOCK() {
  return `UPDATE public.claims c SET
  guthaben_verrechnet_netto           = COALESCE(f.guthaben_verrechnet_netto, c.guthaben_verrechnet_netto),
  schlussabrechnung_am                = f.schlussabrechnung_am,
  auszahlung_gutachter_betrag         = f.auszahlung_gutachter_betrag,
  auszahlung_gutachter_eingegangen_am = f.auszahlung_gutachter_eingegangen_am,
  auszahlung_zahlungsweg              = f.auszahlung_zahlungsweg,
  sv_nachzahlung_netto                = f.sv_nachzahlung_netto,
  abrechnung_id                       = f.abrechnung_id,
  kanzlei_abrechnung_id               = f.kanzlei_abrechnung_id
FROM public.faelle f
WHERE f.claim_id = c.id;`
}
