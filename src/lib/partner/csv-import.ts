// Pure, testbarer CSV-Import fuer das Partner-Vertriebsdashboard (Slice C).
// KEIN 'server-only' — laeuft clientseitig (Vorschau im Modal) UND serverseitig.
// Es gibt bewusst KEINE CSV-Parser-Library im Projekt → hier ein kleiner,
// selbstgeschriebener Parser (Komma-getrennt, RFC-4180-Quote-Handling: "..."
// mit escaped "" im Feld, \r\n und \n als Zeilenende, Header-Zeile).

/** Eine gemappte, insert-bereite Lead-Zeile aus dem CSV. */
export type PartnerCsvLead = {
  firma: string
  ansprechpartner_vorname?: string
  ansprechpartner_nachname?: string
  email?: string
  telefon?: string
  plz?: string
  ort?: string
  rollen_details?: Record<string, unknown>
}

export type ParsedCsv = { header: string[]; rows: string[][] }

export type MapCsvResult = { valide: PartnerCsvLead[]; uebersprungen: number }

/**
 * Manueller CSV-Parser. Trennt Felder an Kommas, respektiert Anfuehrungszeichen
 * ("Feld, mit Komma") und escapte Quotes innerhalb eines gequoteten Felds ("").
 * Zeilenumbrueche innerhalb gequoteter Felder bleiben Teil des Feldwerts.
 *
 * Die erste nicht-leere logische Zeile ist der Header. Voellig leere Zeilen
 * (nur Whitespace, kein Komma) am Ende/zwischendrin werden verworfen — ein
 * abschliessendes \n erzeugt so keine Geister-Zeile.
 *
 * @returns { header, rows } — rows sind die Datenzeilen (ohne Header).
 */
export function parseCsv(text: string): ParsedCsv {
  const records = parseRecords(text)
  if (records.length === 0) return { header: [], rows: [] }
  const [header, ...rows] = records
  return { header, rows }
}

/**
 * Zerlegt den gesamten Text in Records (Felder pro Zeile) unter Beruecksichtigung
 * gequoteter Felder. Verwirft rein leere Records (eine einzelne leere Zelle ohne
 * jeden Inhalt) — das eliminiert Trailing-Newline-Artefakte.
 */
function parseRecords(text: string): string[][] {
  // BOM entfernen (Excel-Exporte beginnen oft mit ﻿).
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0

  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    // Rein leere Zeile (genau ein leeres Feld) verwerfen.
    if (!(record.length === 1 && record[0] === '')) {
      records.push(record)
    }
    record = []
  }

  while (i < src.length) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          // Escaptes Quote ("") → ein literales " im Feld.
          field += '"'
          i += 2
          continue
        }
        // Schliessendes Quote.
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      pushField()
      i += 1
      continue
    }
    if (ch === '\r') {
      // \r\n oder einzelnes \r als Zeilenende behandeln.
      pushRecord()
      i += src[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (ch === '\n') {
      pushRecord()
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  // Letztes Feld/Record flushen (Datei ohne abschliessenden Newline).
  if (field.length > 0 || record.length > 0) {
    pushRecord()
  }

  return records
}

/**
 * Die 8 Ziel-Felder fuer das explizite Mapping-Panel.
 * 'ignorieren' = Spalte wird beim Import uebergangen.
 * rollen_details.datNr/ihk sind Heuristik-only — kein LLM-Target im MVP.
 */
export type CsvZielFeld =
  | 'firma'
  | 'email'
  | 'telefon'
  | 'ansprechpartner_vorname'
  | 'ansprechpartner_nachname'
  | 'plz'
  | 'ort'
  | 'ignorieren'

export const CSV_ZIEL_FELDER: readonly CsvZielFeld[] = [
  'firma',
  'email',
  'telefon',
  'ansprechpartner_vorname',
  'ansprechpartner_nachname',
  'plz',
  'ort',
  'ignorieren',
]

// Header-Alias-Tabelle: normalisierter Header-Text → Ziel-Feld. Der Wert
// 'rollen_details.datNr' bzw. '.ihk' signalisiert Ablage im rollen_details-jsonb.
type Ziel =
  | 'firma'
  | 'ansprechpartner_vorname'
  | 'ansprechpartner_nachname'
  | 'email'
  | 'telefon'
  | 'plz'
  | 'ort'
  | 'rollen_details.datNr'
  | 'rollen_details.ihk'

const HEADER_ALIASE: Record<string, Ziel> = {
  firma: 'firma',
  company: 'firma',
  name: 'firma',
  unternehmen: 'firma',
  email: 'email',
  'e-mail': 'email',
  mail: 'email',
  telefon: 'telefon',
  phone: 'telefon',
  tel: 'telefon',
  vorname: 'ansprechpartner_vorname',
  first: 'ansprechpartner_vorname',
  firstname: 'ansprechpartner_vorname',
  'first name': 'ansprechpartner_vorname',
  nachname: 'ansprechpartner_nachname',
  last: 'ansprechpartner_nachname',
  lastname: 'ansprechpartner_nachname',
  'last name': 'ansprechpartner_nachname',
  plz: 'plz',
  zip: 'plz',
  postleitzahl: 'plz',
  ort: 'ort',
  stadt: 'ort',
  city: 'ort',
  dat: 'rollen_details.datNr',
  datnr: 'rollen_details.datNr',
  'dat-nr': 'rollen_details.datNr',
  ihk: 'rollen_details.ihk',
}

/** Normalisiert einen Header-Zellentext fuer den Alias-Lookup (case-insensitiv, getrimmt). */
function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Gibt fuer jeden Header-Eintrag das passende CsvZielFeld zurueck.
 * rollen_details.datNr/.ihk sind Heuristik-only — werden als 'ignorieren' behandelt
 * (kein LLM-Target im MVP). Unbekannte Header ebenfalls 'ignorieren'.
 */
export function heuristischesMapping(header: string[]): CsvZielFeld[] {
  return header.map((h) => {
    const ziel = HEADER_ALIASE[normHeader(h)]
    if (!ziel) return 'ignorieren'
    if (ziel === 'rollen_details.datNr' || ziel === 'rollen_details.ihk') return 'ignorieren'
    return ziel satisfies CsvZielFeld
  })
}

/**
 * Wendet ein EXPLIZITES Spalten-Mapping (Spaltenindex → CsvZielFeld) auf die
 * Datenzeilen an. 'ignorieren'-Eintraege werden uebersprungen. `firma` ist
 * Pflicht — Zeilen ohne befuellte firma-Spalte werden gezaehlt und verworfen.
 *
 * Die interne Feld-Zuordnungs-Logik ist identisch mit der frueheren mapCsvZuLeads-
 * Implementierung; mapCsvZuLeads delegiert jetzt hierhin.
 */
export function mapCsvMitMapping(rows: string[][], mapping: CsvZielFeld[]): MapCsvResult {
  const valide: PartnerCsvLead[] = []
  let uebersprungen = 0

  for (const row of rows) {
    const lead: PartnerCsvLead = { firma: '' }

    mapping.forEach((zielFeld, idx) => {
      if (zielFeld === 'ignorieren') return
      const raw = (row[idx] ?? '').trim()
      if (!raw) return
      switch (zielFeld) {
        case 'firma':
          if (!lead.firma) lead.firma = raw
          break
        case 'ansprechpartner_vorname':
          if (!lead.ansprechpartner_vorname) lead.ansprechpartner_vorname = raw
          break
        case 'ansprechpartner_nachname':
          if (!lead.ansprechpartner_nachname) lead.ansprechpartner_nachname = raw
          break
        case 'email':
          if (!lead.email) lead.email = raw
          break
        case 'telefon':
          if (!lead.telefon) lead.telefon = raw
          break
        case 'plz':
          if (!lead.plz) lead.plz = raw
          break
        case 'ort':
          if (!lead.ort) lead.ort = raw
          break
      }
    })

    if (!lead.firma) {
      uebersprungen += 1
      continue
    }
    valide.push(lead)
  }

  return { valide, uebersprungen }
}

/**
 * Validiert die JSON-Antwort des LLM (Mapping-Vorschlag) und gibt ein
 * CsvZielFeld-Array in Header-Reihenfolge zurueck. Erwartet JSON der Form
 * { "<headerName>": "<zielfeld>" }. Unbekannte Zielfelder und fehlende
 * Header-Eintraege werden als 'ignorieren' behandelt.
 *
 * @returns CsvZielFeld[] in Header-Reihenfolge, oder null bei kaputtem/nicht-
 *          parsebarem JSON (kein gueltige JSON-Objekt).
 */
export function parseLlmMapping(json: string, header: string[]): CsvZielFeld[] | null {
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  // Muss ein nicht-null Objekt sein (kein Array, kein primitiver Typ).
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  const obj = parsed as Record<string, unknown>
  const zielFeldSet = new Set<string>(CSV_ZIEL_FELDER)

  return header.map((h) => {
    const kandidat = obj[h]
    if (typeof kandidat === 'string' && zielFeldSet.has(kandidat)) {
      return kandidat as CsvZielFeld
    }
    return 'ignorieren'
  })
}

/**
 * Mappt geparste CSV-Zeilen flexibel auf PartnerCsvLead. Header werden ueber
 * die Alias-Tabelle (case-insensitiv) den Ziel-Feldern zugeordnet; unbekannte
 * Spalten werden ignoriert. Eine Zeile ist valide, wenn `firma` non-empty ist.
 *
 * Delegiert intern an mapCsvMitMapping(rows, heuristischesMapping(header)) —
 * Verhalten unveraendert, Logik DRY.
 *
 * Hinweis: rollen_details (datNr/ihk) werden hier weiterhin unterstuetzt, weil
 * die Heuristik diese Aliase kennt und der bestehende Import-Flow sie benoetigt.
 * mapCsvMitMapping selbst kennt rollen_details NICHT (kein CsvZielFeld-Target im
 * MVP) — daher werden datNr/ihk-Spalten beim expliziten Mapping als 'ignorieren'
 * behandelt. Fuer die automatische Heuristik hier bleibt das Verhalten stabil,
 * indem wir die alte Logik fuer rollen_details separat anwenden.
 *
 * @param rolle nur zur Signatur-Vollstaendigkeit durchgereicht — die Rolle wird
 *   beim Insert (Server-Action) gesetzt, nicht pro Zeile aus dem CSV.
 * @returns { valide, uebersprungen } — uebersprungen = Anzahl Zeilen ohne Firma.
 */
export function mapCsvZuLeads(
  header: string[],
  rows: string[][],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _rolle: string,
): MapCsvResult {
  // Basis-Mapping ueber heuristischesMapping (ohne rollen_details-Spalten).
  const zielFeldProSpalte = heuristischesMapping(header)

  // rollen_details separat tracken (die Aliase landen als 'ignorieren' im
  // CsvZielFeld-Mapping, aber der existierende Import-Flow braucht sie).
  const rollenDetailProSpalte: (Ziel | undefined)[] = header.map((h) => {
    const ziel = HEADER_ALIASE[normHeader(h)]
    if (ziel === 'rollen_details.datNr' || ziel === 'rollen_details.ihk') return ziel
    return undefined
  })

  const hasRollenDetailCols = rollenDetailProSpalte.some((z) => z !== undefined)

  if (!hasRollenDetailCols) {
    // Kein rollen_details-Overhead — direkt delegieren.
    return mapCsvMitMapping(rows, zielFeldProSpalte)
  }

  // Mit rollen_details: Basis-Mapping + Details zusammenfuehren.
  const valide: PartnerCsvLead[] = []
  let uebersprungen = 0

  for (const row of rows) {
    const lead: PartnerCsvLead = { firma: '' }
    const details: Record<string, unknown> = {}

    zielFeldProSpalte.forEach((zielFeld, idx) => {
      if (zielFeld === 'ignorieren') return
      const raw = (row[idx] ?? '').trim()
      if (!raw) return
      switch (zielFeld) {
        case 'firma':
          if (!lead.firma) lead.firma = raw
          break
        case 'ansprechpartner_vorname':
          if (!lead.ansprechpartner_vorname) lead.ansprechpartner_vorname = raw
          break
        case 'ansprechpartner_nachname':
          if (!lead.ansprechpartner_nachname) lead.ansprechpartner_nachname = raw
          break
        case 'email':
          if (!lead.email) lead.email = raw
          break
        case 'telefon':
          if (!lead.telefon) lead.telefon = raw
          break
        case 'plz':
          if (!lead.plz) lead.plz = raw
          break
        case 'ort':
          if (!lead.ort) lead.ort = raw
          break
      }
    })

    rollenDetailProSpalte.forEach((ziel, idx) => {
      if (!ziel) return
      const raw = (row[idx] ?? '').trim()
      if (!raw) return
      if (ziel === 'rollen_details.datNr' && details.datNr === undefined) details.datNr = raw
      if (ziel === 'rollen_details.ihk' && details.ihk === undefined) details.ihk = raw
    })

    if (!lead.firma) {
      uebersprungen += 1
      continue
    }
    if (Object.keys(details).length > 0) lead.rollen_details = details
    valide.push(lead)
  }

  return { valide, uebersprungen }
}
