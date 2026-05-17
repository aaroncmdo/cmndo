// CMM-44 SP-A2 PR2 — deterministischer View-Repoint-Generator.
// Liest die aktuellen pg_get_viewdef-Outputs (probe-JSON) und ersetzt mechanisch
// die 28 gedroppten faelle-Spalten durch die claims-Spalte (Alias-Name bleibt).
// Aufruf: node scripts/_build-spa2-views.mjs <pfad-zur-viewdef-json>
import { readFileSync } from 'node:fs'

// faelle (alt) -> claims (neu)
const MAP = {
  schadens_adresse: 'schadenort_adresse',
  unfallort: 'schadenort_adresse',
  schadens_plz: 'schadenort_plz',
  schadens_ort: 'schadenort_ort',
  unfallort_kategorie: 'schadenort_kategorie',
  unfallort_lat: 'schadenort_lat',
  unfallort_lng: 'schadenort_lng',
  schadens_datum: 'schadentag',
  unfalldatum: 'schadentag',
  schadens_entdeckt_am: 'entdeckt_am',
  unfall_uhrzeit: 'schadenzeit',
  schadens_beschreibung: 'hergang_kunde_text',
  unfallhergang: 'hergang_kunde_text',
  schadens_hergang: 'hergang_kunde_text',
  schadens_art: 'schadenart',
  schadens_fall_typ: 'fall_typ',
  personenschaden_flag: 'hat_personenschaden',
  halter_ungleich_fahrer_flag: 'halter_ungleich_fahrer',
  sachschaden_flag: 'hat_sachschaden',
  mietwagen_flag: 'hat_mietwagen',
  mietwagen_hat: 'hat_mietwagen',
  nutzungsausfall: 'hat_nutzungsausfall',
  gegner_schadennummer: 'gegner_aktenzeichen',
  no_show_count: 'kunde_no_show_count',
  aktuelle_phase: 'phase',
  konvertiert_von_lead: 'lead_id',
  regulierung_betrag: 'regulierungs_betrag',
  vs_ablehnungsgrund: 'vs_ablehnungs_grund',
}
const OLD = Object.keys(MAP)

// Exakte faelle-Spaltentypen (format_type, 2026-05-17). Jede repointete
// View-Spalte wird hierauf gecastet, damit CREATE OR REPLACE VIEW den
// Output-Typ unveraendert laesst ("cannot change data type of column").
const FAELLE_TYPE = {
  schadens_adresse: 'text', unfallort: 'text', schadens_plz: 'text',
  schadens_ort: 'text', unfallort_kategorie: 'text', unfallort_lat: 'numeric',
  unfallort_lng: 'numeric', schadens_datum: 'date', unfalldatum: 'date',
  schadens_entdeckt_am: 'date', unfall_uhrzeit: 'text', schadens_beschreibung: 'text',
  unfallhergang: 'text', schadens_hergang: 'text', schadens_art: 'text',
  schadens_fall_typ: 'text', personenschaden_flag: 'boolean',
  halter_ungleich_fahrer_flag: 'boolean', sachschaden_flag: 'boolean',
  mietwagen_flag: 'boolean', mietwagen_hat: 'boolean', nutzungsausfall: 'boolean',
  gegner_schadennummer: 'text', no_show_count: 'integer', aktuelle_phase: 'text',
  konvertiert_von_lead: 'uuid', regulierung_betrag: 'numeric(10,2)',
  vs_ablehnungsgrund: 'text',
}

// Ersetzt  f.<alt>  ->  c.<neu>::<faelle-typ> AS <alt>.  \b nach dem Namen
// verhindert, dass unfallort in f.unfallort_lat matcht (nach 't' folgt '_').
function repoint(sql) {
  let out = sql
  const counts = {}
  for (const o of OLD) {
    const re = new RegExp(`\\bf\\.${o}\\b`, 'g')
    counts[o] = (out.match(re) || []).length
    out = out.replace(re, `c.${MAP[o]}::${FAELLE_TYPE[o]} AS ${o}`)
  }
  return { out, counts }
}

// faelle_sv_view: bare Spaltennamen ohne Tabellen-Alias, FROM faelle ohne Join.
// -> jede bare Select-Spalte mit f. praefixen, claims-Join ergaenzen, dann repoint.
function rewriteSvView(rawDef) {
  const lines = rawDef.split('\n').map((l) => {
    // Erste Select-Zeile: " SELECT <ident>,?"  -> " SELECT f.<ident>,?"
    const ms = l.match(/^(\s*SELECT\s+)([a-z_][a-z0-9_]*)(,?)$/)
    if (ms) return `${ms[1]}f.${ms[2]}${ms[3]}`
    // Folge-Select-Item-Zeile: "    <ident>,?"  -> "    f.<ident>,?"
    const m = l.match(/^(\s+)([a-z_][a-z0-9_]*)(,?)$/)
    if (m) return `${m[1]}f.${m[2]}${m[3]}`
    return l
  })
  let body = lines.join('\n')
  body = body.replace(/FROM faelle;?\s*$/m, 'FROM faelle f\n     LEFT JOIN claims c ON c.id = f.claim_id;')
  return repoint(body)
}

const json = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const defs = Object.fromEntries(json.rows.map((r) => [r.view, r.def]))

const results = {}
for (const [view, transform] of [
  ['faelle_kunde_view', repoint],
  ['faelle_sv_view', rewriteSvView],
  ['v_claim_full', repoint],
  ['v_faelle_mit_aktuellem_termin', repoint],
]) {
  let raw = defs[view]
  // pg_get_viewdef liefert teils \r\n -> normalisieren
  raw = raw.replace(/\r\n/g, '\n')
  const { out, counts } = transform(raw)
  results[view] = out
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.error(`-- ${view}: ${total} f.<spalte>-Treffer ersetzt`)
  for (const [k, v] of Object.entries(counts)) if (v) console.error(`--   ${k} (x${v}) -> ${MAP[k]}`)
  // Sicherheit: keine alten faelle-Namen mehr als f.<alt>
  for (const o of OLD) {
    if (new RegExp(`\\bf\\.${o}\\b`).test(out)) {
      console.error(`!! FEHLER: f.${o} noch vorhanden in ${view}`)
      process.exit(1)
    }
  }
}

for (const view of ['faelle_kunde_view', 'faelle_sv_view', 'v_claim_full', 'v_faelle_mit_aktuellem_termin']) {
  console.log(`CREATE OR REPLACE VIEW public.${view} AS`)
  console.log(results[view].replace(/;?\s*$/, ';'))
  console.log('')
}
