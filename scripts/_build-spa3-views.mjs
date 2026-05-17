// CMM-44 SP-A3 PR1 — deterministischer View-Migrations-Generator.
//
// Zweck: fuegt `claim_nummer` additiv zu den 3 Views hinzu, die es noch nicht
//   exponieren — faelle_kunde_view, faelle_sv_view, v_faelle_mit_aktuellem_termin.
//   v_claim_full + v_claim_listing fuehren `c.claim_nummer` bereits -> NICHT angefasst.
//
// Quelle der View-Defs: scripts/_spa3-viewdefs.json — ein Live-Snapshot der
//   pg_get_viewdef-Outputs (2026-05-17), analog zum SP-A2-JSON-Pattern. Deterministisch
//   reproduzierbar; kein DB-Connect zur Generierungszeit noetig.
//
// Mechanik: `CREATE OR REPLACE VIEW` erlaubt nur das Anhaengen von Spalten am
//   ENDE der Spaltenliste. Das Script fuegt `c.claim_nummer::text AS claim_nummer`
//   als letzte Select-Spalte direkt vor dem top-level `FROM faelle f` ein.
//   Alle 3 Views haben `LEFT JOIN claims c ON c.id = f.claim_id` bereits -> kein
//   neuer Join noetig. Cast auf ::text (Quell-Typ von claims.claim_nummer), damit
//   CREATE OR REPLACE den Output-Typ garantiert nicht aendert (SP-A2-Lesson).
//
// Aufruf: node scripts/_build-spa3-views.mjs > supabase/migrations/<ts>_cmm44_spa3_views_add_claim_nummer.sql
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const json = JSON.parse(readFileSync(join(HERE, '_spa3-viewdefs.json'), 'utf8'))
const defs = Object.fromEntries(json.rows.map((r) => [r.view, r.def]))

const TARGET_VIEWS = ['faelle_kunde_view', 'faelle_sv_view', 'v_faelle_mit_aktuellem_termin']

// Fuegt `c.claim_nummer::text AS claim_nummer` als letzte Select-Spalte vor dem
// top-level `FROM faelle f` ein. Das erste Vorkommen von `\n   FROM faelle f` ist
// das top-level FROM (LATERAL-Subqueries nutzen `FROM gutachter_termine gt`).
function addClaimNummer(rawDef) {
  const def = rawDef.replace(/\r\n/g, '\n')
  const m = def.match(/\n( *)FROM faelle f\b/)
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
