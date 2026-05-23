#!/usr/bin/env node
// CMM-44 SP-I3 PR1 — deterministische View-Repoint-DDL-Generierung (SP-I2-Muster).
// Liest 4 vorgefetchte Live-viewdefs aus scripts/_spi3-tmp/<view>.out, repointet die
// 14 SP-I3-Spalten f.<col> -> kf.<col> (Numerics mit Precision-Cast, vs_eskalationsstufe
// via COALESCE auf den faelle-Default 'vs-01'), injiziert den kf-Join wo er fehlt,
// asserted das Ergebnis und schreibt die komplette Migration.
//
// Fetch der .out-Inputs (intermediate, nicht committed) — git-bash (kein cmd.exe-Quoting):
//   mkdir -p scripts/_spi3-tmp
//   for V in v_faelle_mit_aktuellem_termin faelle_kunde_view faelle_sv_view v_claim_full; do
//     npx supabase db query --linked -o json \
//       "SELECT pg_get_viewdef('public.$V'::regclass, true) AS def;" > scripts/_spi3-tmp/$V.out
//   done
// Aufruf: node scripts/_spi3-gen-views.mjs <pfad-zur-migration.sql>
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const MIGRATION = process.argv[2]
if (!MIGRATION) { console.error('Usage: node _spi3-gen-views.mjs <migration.sql>'); process.exit(1) }

// --- viewdef aus vorgefetchter .out-Datei lesen (Fetch via Bash/git-bash, db query -o json),
//     JSON-Envelope robust per Brace-Matching extrahieren (Strings respektiert). ---
function fetchDef(view) {
  const out = fs.readFileSync(fileURLToPath(new URL(`./_spi3-tmp/${view}.out`, import.meta.url)), 'utf8')
  const start = out.indexOf('{')
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < out.length; i++) {
    const ch = out[i]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false }
    else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { return JSON.parse(out.slice(start, i + 1)).rows[0].def } }
  }
  throw new Error(`konnte viewdef-JSON fuer ${view} nicht parsen`)
}

// --- Replace-Regeln je Spalte. Bare = f.X->kf.X; Cast/COALESCE als Ausdruck mit AS. ---
const COALESCE_ESK = "COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe"
const REPL = {
  regulierung_am: 'kf.regulierung_am',
  regulierung_angekuendigt_am: 'kf.regulierung_angekuendigt_am',
  vs_eskalationsstufe: COALESCE_ESK,
  regulierungsweise: 'kf.regulierungsweise',
  vs_reaktion_typ: 'kf.vs_reaktion_typ',
  vs_reaktion_am: 'kf.vs_reaktion_am',
  kuerzungs_betrag: 'kf.kuerzungs_betrag::numeric(10,2) AS kuerzungs_betrag',
  vs_frist_bis: 'kf.vs_frist_bis',
  vs_kuerzung_grund: 'kf.vs_kuerzung_grund',
  vs_quote_prozent: 'kf.vs_quote_prozent::numeric(5,2) AS vs_quote_prozent',
  vs_quote_grund: 'kf.vs_quote_grund',
  vs_quote_akzeptiert_am: 'kf.vs_quote_akzeptiert_am',
  vs_quote_betrag_ausgezahlt: 'kf.vs_quote_betrag_ausgezahlt::numeric(10,2) AS vs_quote_betrag_ausgezahlt',
  vs_kuerzungs_typ: 'kf.vs_kuerzungs_typ',
}
const KF_JOIN = 'LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id'

// Welche der 14 Spalten liegt in welcher View (Live-Befund 2026-05-23) + ob kf-Join fehlt:
const PLAN = {
  v_faelle_mit_aktuellem_termin: { cols: Object.keys(REPL), addJoin: false },
  faelle_kunde_view: { cols: ['vs_quote_prozent', 'vs_quote_grund', 'vs_quote_akzeptiert_am', 'vs_quote_betrag_ausgezahlt', 'vs_reaktion_typ', 'vs_reaktion_am'], addJoin: true },
  faelle_sv_view: { cols: ['kuerzungs_betrag', 'vs_kuerzung_grund', 'vs_kuerzungs_typ', 'vs_reaktion_typ', 'vs_reaktion_am'], addJoin: false },
  v_claim_full: { cols: ['regulierung_am', 'vs_eskalationsstufe'], addJoin: false },
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function genView(view) {
  let s = fetchDef(view)
  const { cols, addJoin } = PLAN[view]
  // Spalten-Repoint: f.<col> -> Replacement. Wortgrenze + negative-lookbehind auf [A-Za-z_]
  // schliesst kf./xf. aus; \b am Ende verhindert Prefix-Kollision (regulierung_am vs ..._angekuendigt_am).
  for (const col of cols) {
    const re = new RegExp('(?<![A-Za-z_])f\\.' + escapeRe(col) + '\\b', 'g')
    const before = s
    s = s.replace(re, REPL[col])
    if (s === before) { console.error(`FAIL [${view}] f.${col} nicht gefunden`); process.exit(1) }
  }
  if (addJoin) {
    const before = s
    s = s.replace('LEFT JOIN claims c ON c.id = f.claim_id', `LEFT JOIN claims c ON c.id = f.claim_id\n     ${KF_JOIN}`)
    if (s === before) { console.error(`FAIL [${view}] claims-Join fuer kf-Injektion nicht gefunden`); process.exit(1) }
  }
  const ddl = `CREATE OR REPLACE VIEW public.${view} AS ${s}`

  // --- Asserts: kein bare f.<col> mehr; genau 1 kf-Join ---
  for (const col of cols) {
    const re = new RegExp('(?<![A-Za-z_])f\\.' + escapeRe(col) + '\\b')
    if (re.test(ddl)) { console.error(`FAIL [${view}] bare f.${col} verbleibt`); process.exit(1) }
    if (col === 'vs_eskalationsstufe') { if (!ddl.includes(COALESCE_ESK)) { console.error(`FAIL [${view}] COALESCE esk fehlt`); process.exit(1) } }
    else if (!ddl.includes(REPL[col].split(' AS ')[0])) { console.error(`FAIL [${view}] ${REPL[col]} fehlt`); process.exit(1) }
  }
  const joinCount = ddl.split(KF_JOIN).length - 1
  if (joinCount !== 1) { console.error(`FAIL [${view}] kf-Join count=${joinCount} (erwartet 1)`); process.exit(1) }
  return ddl.replace(/[;\s]+$/, '') + ';'
}

const term = genView('v_faelle_mit_aktuellem_termin')
const kunde = genView('faelle_kunde_view')
const sv = genView('faelle_sv_view')
const full = genView('v_claim_full')

const sql = `-- CMM-44 SP-I3 PR1 -- Regulierung/VS (14 Spalten) faelle -> kanzlei_faelle, additiv (kein DROP).
-- Nach Apply: npx supabase migration repair --status applied 20260523170216
-- Plan: docs/superpowers/plans/2026-05-23-cmm44-spi3-vs-regulierung.md
-- Live-Drift 2026-05-23: alle 14 nur auf faelle (kein kanzlei_faelle-Drift). cov: 13x 0,
--   vs_eskalationsstufe 49/49 = Default 'vs-01' (keine echten Eskalationen).
-- Block 2 (View-Repoints) generiert via scripts/_spi3-gen-views.mjs (4 Views, Live-viewdefs).
BEGIN;

-- Block 1: 14 ADD COLUMN auf kanzlei_faelle (Typen exakt von faelle gespiegelt).
-- vs_eskalationsstufe mit DEFAULT 'vs-01' (= faelle-Default) -> existierende kanzlei_faelle-Rows
-- bekommen 'vs-01' automatisch; Views COALESCEn auf 'vs-01' fuer Claims ohne kanzlei_faelle-Row.
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN regulierung_am timestamptz,
  ADD COLUMN regulierung_angekuendigt_am timestamptz,
  ADD COLUMN vs_eskalationsstufe text DEFAULT 'vs-01'::text,
  ADD COLUMN regulierungsweise text,
  ADD COLUMN vs_reaktion_typ text,
  ADD COLUMN vs_reaktion_am timestamptz,
  ADD COLUMN kuerzungs_betrag numeric(10,2),
  ADD COLUMN vs_frist_bis timestamptz,
  ADD COLUMN vs_kuerzung_grund text,
  ADD COLUMN vs_quote_prozent numeric(5,2),
  ADD COLUMN vs_quote_grund text,
  ADD COLUMN vs_quote_akzeptiert_am timestamptz,
  ADD COLUMN vs_quote_betrag_ausgezahlt numeric(10,2),
  ADD COLUMN vs_kuerzungs_typ text;

-- KEIN Backfill: 13 Spalten cov=0; vs_eskalationsstufe via ADD-DEFAULT + View-COALESCE gedeckt.

-- Block 2: View-Repoints (server-seitig generiert aus Live-viewdefs 2026-05-23).
-- v_faelle_mit_aktuellem_termin (14x f.->kf., kf-Join existiert via SP-I1).
${term}

-- faelle_kunde_view (6x f.->kf., NEUER kf-Join).
${kunde}

-- faelle_sv_view (5x f.->kf., kf-Join existiert via SP-I2).
${sv}

-- v_claim_full (2x f.->kf., kf-Join existiert via SP-I2).
${full}

COMMIT;
`
fs.writeFileSync(MIGRATION, sql)
console.log(`OK — Migration geschrieben (${sql.length} bytes), alle Asserts gruen: ${MIGRATION}`)
