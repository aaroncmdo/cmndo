// CMM-44 SP-A3 — deterministischer View-Migrations-Generator.
//
// Zwei Modi:
//
//   (Default, PR1)  node scripts/_build-spa3-views.mjs
//     Fuegt `claim_nummer` additiv zu den 3 Views hinzu, die es noch nicht
//     exponieren (faelle_kunde_view, faelle_sv_view, v_faelle_mit_aktuellem_termin).
//     Quelle: scripts/_spa3-viewdefs.json. CREATE OR REPLACE VIEW — additiv,
//     nicht brechend. v_claim_full + v_claim_listing fuehren claim_nummer schon.
//
//   (--drop, PR3)   node scripts/_build-spa3-views.mjs --drop
//     Entfernt `f.fall_nummer` aus allen 5 Views. CREATE OR REPLACE VIEW kann
//     KEINE Spalte entfernen -> DROP VIEW + CREATE VIEW zwingend. Quelle:
//     scripts/_spa3-viewdefs-pr3.json (frischer Snapshot inkl. der nach PR1
//     ergaenzten claim_nummer-Spalte). Step-2(a)-pg_depend-Probe (2026-05-18)
//     ergab: keine der 5 Views haengt von einer anderen ab -> DROP-Reihenfolge
//     beliebig, kein CASCADE noetig. claim_nummer (von PR1) bleibt unangetastet.
//
//     Kein Spalten-Cast: DROP VIEW + CREATE VIEW baut die View komplett neu;
//     es gibt keine "alte" View, mit deren Output-Typ ein Cast kollidieren
//     muesste. pg_get_viewdef liefert die Definition bereits parser-normalisiert
//     -> CREATE VIEW daraus reproduziert die Spaltentypen byte-genau. (Die
//     SP-A2-Cast-Lesson galt fuer CREATE OR REPLACE mit *repointeten* Quell-
//     spalten anderen Typs — hier wird nur eine Zeile entfernt, kein Typwechsel.)
//
// Status-Meldungen gehen nach stderr, das generierte SQL nach stdout — so kann
// der Aufrufer stdout in die Migration-Datei umleiten, ohne die Logs zu mischen.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DROP_MODE = process.argv.includes('--drop')

// --- Modus 2: --drop (PR3) -------------------------------------------------
if (DROP_MODE) {
  const json = JSON.parse(readFileSync(join(HERE, '_spa3-viewdefs-pr3.json'), 'utf8'))
  const defs = Object.fromEntries(json.rows.map((r) => [r.view, r.def]))

  // Alle 5 Views. Reihenfolge fix (deterministisch); da keine View-auf-View-
  // Abhaengigkeit besteht, ist die Reihenfolge sachlich beliebig.
  const ALL_VIEWS = [
    'faelle_kunde_view',
    'faelle_sv_view',
    'v_claim_full',
    'v_claim_listing',
    'v_faelle_mit_aktuellem_termin',
  ]

  // Entfernt die Select-Spalte `f.fall_nummer` aus einer View-Definition.
  // In allen 5 Views liegt sie GENAU als Zeile "    f.fall_nummer," vor
  // (4 Spaces Einrueckung, mit Komma, nie als letzte Select-Spalte) —
  // empirisch verifiziert (.tmp check-lines, 2026-05-18). Daher reicht das
  // Entfernen genau dieser Zeile; kein Komma-Handling am Listenende noetig.
  const FALL_NUMMER_LINE = '    f.fall_nummer,'
  function removeFallNummer(rawDef) {
    const def = rawDef.replace(/\r\n/g, '\n')
    const lines = def.split('\n')
    const matches = lines.filter((l) => l === FALL_NUMMER_LINE).length
    if (matches !== 1) {
      throw new Error(
        `erwartete genau 1 Zeile "${FALL_NUMMER_LINE}", gefunden: ${matches}`,
      )
    }
    const out = lines.filter((l) => l !== FALL_NUMMER_LINE).join('\n')
    if (/\bf\.fall_nummer\b/.test(out)) {
      throw new Error('f.fall_nummer nach Entfernen noch vorhanden')
    }
    return out
  }

  const dropStmts = []
  const createStmts = []
  for (const view of ALL_VIEWS) {
    const raw = defs[view]
    if (!raw) throw new Error(`View-Def fehlt in _spa3-viewdefs-pr3.json: ${view}`)
    const body = removeFallNummer(raw).replace(/;?\s*$/, ';')
    dropStmts.push(`DROP VIEW IF EXISTS public.${view};`)
    createStmts.push(`CREATE VIEW public.${view} AS\n${body}`)
    console.error(`-- ${view}: f.fall_nummer-Select-Spalte entfernt (DROP + CREATE)`)
  }

  console.log('-- CMM-44 SP-A3 PR3 — f.fall_nummer aus den 5 Views entfernen + DROP COLUMN.')
  console.log('-- Generiert von scripts/_build-spa3-views.mjs --drop (Quelle: _spa3-viewdefs-pr3.json).')
  console.log('-- DROP VIEW + CREATE VIEW (CREATE OR REPLACE kann keine Spalte entfernen).')
  console.log('-- pg_depend-Probe: keine View-auf-View-Abhaengigkeit -> Reihenfolge beliebig, kein CASCADE.')
  console.log('-- c.claim_nummer (PR1) bleibt in allen 5 Views erhalten.')
  console.log('--')
  console.log('-- Reihenfolge-Hinweis: Der Trigger set_fall_nummer traegt eine WHEN-Klausel')
  console.log("-- ((new.fall_nummer IS NULL)) -> er ist ein column-dependent object. Postgres")
  console.log('-- verweigert DROP COLUMN, solange er existiert (Dry-Run-Befund 2026-05-18:')
  console.log('-- "cannot drop column fall_nummer ... trigger set_fall_nummer depends on").')
  console.log('-- Deshalb: Trigger + Funktion VOR dem DROP COLUMN aufraeumen.')
  console.log('')
  console.log('BEGIN;')
  console.log('')
  console.log('-- 1. Views ohne f.fall_nummer neu bauen (DROP, dann CREATE).')
  console.log(dropStmts.join('\n'))
  console.log('')
  console.log(createStmts.join('\n\n'))
  console.log('')
  console.log('-- 2. Toten Trigger + Funktion aufraeumen — MUSS vor DROP COLUMN stehen, weil')
  console.log("--    die WHEN-Klausel (new.fall_nummer IS NULL) den Trigger an die Spalte")
  console.log('--    bindet. (App generierte fall_nummer immer selbst -> Trigger feuerte nie.)')
  console.log('DROP TRIGGER IF EXISTS set_fall_nummer ON public.faelle;')
  console.log('DROP FUNCTION IF EXISTS public.generate_fall_nummer();')
  console.log('')
  console.log('-- 3. Spalte droppen — UNIQUE-Constraint faelle_fall_nummer_key + Backing-Index')
  console.log('--    fallen automatisch mit.')
  console.log('ALTER TABLE public.faelle DROP COLUMN fall_nummer;')
  console.log('')
  console.log('COMMIT;')
  process.exit(0)
}

// --- Modus 1: Default (PR1) ------------------------------------------------
const json = JSON.parse(readFileSync(join(HERE, '_spa3-viewdefs.json'), 'utf8'))
const defs = Object.fromEntries(json.rows.map((r) => [r.view, r.def]))

const TARGET_VIEWS = ['faelle_kunde_view', 'faelle_sv_view', 'v_faelle_mit_aktuellem_termin']

// Fuegt `c.claim_nummer::text AS claim_nummer` als letzte Select-Spalte vor dem
// top-level `FROM faelle f` ein. Das erste Vorkommen von `\n   FROM faelle f` ist
// das top-level FROM (LATERAL-Subqueries nutzen `FROM gutachter_termine gt`).
function addClaimNummer(rawDef) {
  const def = rawDef.replace(/\r\n/g, '\n')
  // Non-capturing fuer die Einrueckung — die neue Spalte wird fest auf 4 Spaces
  // eingerueckt (pg_get_viewdef-Standard-Format), keine dynamische Uebernahme noetig.
  const m = def.match(/\n(?: *)FROM faelle f\b/)
  if (!m) throw new Error('top-level "FROM faelle f" nicht gefunden')
  const fromIdx = m.index // Position des \n vor FROM
  const head = def.slice(0, fromIdx) // Select-Liste, endet mit letzter Spalte (kein Komma)
  const tail = def.slice(fromIdx) // ab \n FROM ...
  if (/\bclaim_nummer\b/.test(def)) {
    throw new Error('claim_nummer bereits in der View-Definition vorhanden')
  }
  return `${head},\n    c.claim_nummer::text AS claim_nummer${tail}`
}

const stmts = []
for (const view of TARGET_VIEWS) {
  const raw = defs[view]
  if (!raw) throw new Error(`View-Def fehlt in _spa3-viewdefs.json: ${view}`)
  const body = addClaimNummer(raw).replace(/;?\s*$/, ';')
  stmts.push(`CREATE OR REPLACE VIEW public.${view} AS\n${body}`)
  console.error(`-- ${view}: claim_nummer als letzte Select-Spalte ergaenzt`)
}

// Migration in BEGIN; ... COMMIT;
console.log('-- CMM-44 SP-A3 PR1 — claim_nummer additiv zu 3 Views ergaenzen.')
console.log('-- Generiert von scripts/_build-spa3-views.mjs (Quelle: _spa3-viewdefs.json).')
console.log('-- Rein additiv, nicht brechend: f.fall_nummer bleibt vorerst erhalten (Drop = PR3).')
console.log('-- v_claim_full + v_claim_listing exponieren claim_nummer bereits -> nicht angefasst.')
console.log('')
console.log('BEGIN;')
console.log('')
console.log(stmts.join('\n\n'))
console.log('')
console.log('COMMIT;')
