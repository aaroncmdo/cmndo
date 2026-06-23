// Bulk-CSV-Import fuer sv_leads.
// Kanonischer Schreibweg: upsertSvLead (DB-RPC sv_lead_upsert).
// Loest das alte DELETE+INSERT-Script (scripts/sv-import-small.sql) ab.

import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { upsertSvLead } from '@/lib/sv-leads/upsert'

// CSV-Spaltenreihenfolge (header-basiert):
const EXPECTED_COLUMNS = [
  'name',
  'firma',
  'adresse',
  'plz',
  'ort',
  'telefon',
  'email',
  'dat_id',
  'dat_expert_nr',
  'qualifikationen',
  'paket_umkreis_km',
] as const

export type ParsedSvLeadRow = {
  name: string
  firma: string | null
  adresse: string
  plz: string | null
  ort: string | null
  telefon: string | null
  email: string | null
  dat_id: string | null
  dat_expert_nr: string | null
  /** Zelle kann semikolon- oder pipe-getrennte Werte enthalten. */
  qualifikationen: string[] | null
  paket_umkreis_km: number | null
}

/**
 * Rein synchroner, I/O-freier CSV-Parser.
 * Erwartet eine header-basierte CSV mit den Spalten in EXPECTED_COLUMNS
 * (Reihenfolge muss stimmen). Zeilen ohne `name` oder `adresse` wandern in
 * `fehler`, nicht in `rows`.
 */
export function parseSvLeadCsv(csvText: string): {
  rows: ParsedSvLeadRow[]
  fehler: string[]
} {
  const lines = csvText.split(/\r?\n/)
  const rows: ParsedSvLeadRow[] = []
  const fehler: string[] = []

  // Erste nicht-leere Zeile = Header — ueberspringen
  let headerSkipped = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (!headerSkipped) {
      headerSkipped = true
      continue
    }

    // Einfaches CSV-Split: kein Anführungszeichen-Handling noetig (Felder
    // enthalten in diesem Kontext keine Kommas ausser im qualifikationen-Feld,
    // das Semikolon/Pipe-getrennt ist).
    const cells = line.split(',')

    const get = (idx: number) => (cells[idx] ?? '').trim()

    const name = get(0)
    const firma = get(1) || null
    const adresse = get(2)
    const plz = get(3) || null
    const ort = get(4) || null
    const telefon = get(5) || null
    const email = get(6) || null
    const dat_id = get(7) || null
    const dat_expert_nr = get(8) || null
    const qualiRaw = get(9)
    const paketRaw = get(10)

    if (!name) {
      fehler.push(`Zeile ohne name uebersprungen: "${line.slice(0, 60)}"`)
      continue
    }
    if (!adresse) {
      fehler.push(`"${name}": adresse fehlt — Zeile uebersprungen`)
      continue
    }

    // qualifikationen: semikolon- oder pipe-getrennt innerhalb der Zelle
    const qualifikationen =
      qualiRaw
        ? qualiRaw.split(/[;|]/).map(q => q.trim()).filter(Boolean)
        : null

    const paket_umkreis_km =
      paketRaw && !isNaN(Number(paketRaw)) ? Number(paketRaw) : null

    rows.push({
      name,
      firma,
      adresse,
      plz,
      ort,
      telefon,
      email,
      dat_id,
      dat_expert_nr,
      qualifikationen,
      paket_umkreis_km,
    })
  }

  return { rows, fehler }
}

/**
 * Importiert SV-Leads aus einem CSV-Text.
 * Fuer jede Zeile: geocodiert die Adresse (best-effort), dann upsertSvLead.
 * Zeilen ohne Geocoding-Ergebnis werden uebersprungen und in `fehler` gelistet.
 * Der Batch laeuft durch — Einzelfehler brechen ihn NICHT ab.
 *
 * Idempotenz: liegt in upsertSvLead (DB-RPC dedup via dat_id ODER
 * normalized_name+plz). Zweimal dieselbe CSV importieren erzeugt kein Duplikat.
 */
export async function importSvLeads(csvText: string): Promise<
  | { ok: true; importiert: number; fehler: string[] }
  | { ok: false; error: string }
> {
  let parsed: ReturnType<typeof parseSvLeadCsv>
  try {
    parsed = parseSvLeadCsv(csvText)
  } catch (err) {
    return {
      ok: false,
      error: `CSV-Parse-Fehler: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const fehler: string[] = [...parsed.fehler]
  let importiert = 0

  for (const row of parsed.rows) {
    // Adress-String fuer Geocoder zusammensetzen
    const adressQuery = [row.adresse, row.plz, row.ort]
      .filter(Boolean)
      .join(' ')
      .trim()

    const geo = await geocodeAdresse(adressQuery)

    if (!geo) {
      fehler.push(`"${row.name}": Adresse nicht geokodierbar ("${adressQuery}")`)
      continue
    }

    const result = await upsertSvLead({
      name: row.name,
      firma: row.firma,
      adresse: row.adresse,
      lat: geo.lat,
      lng: geo.lng,
      plz: row.plz,
      ort: row.ort,
      telefon: row.telefon,
      email: row.email,
      dat_id: row.dat_id,
      dat_expert_nr: row.dat_expert_nr,
      qualifikationen: row.qualifikationen,
      paket_umkreis_km: row.paket_umkreis_km,
      quelle: 'admin_bulk',
      ist_aktiv: true,
    })

    if (!result.ok) {
      fehler.push(`"${row.name}": Upsert-Fehler — ${result.error}`)
      continue
    }

    importiert++
  }

  return { ok: true, importiert, fehler }
}
