// Kunden-Unterschriftsfeld auf SV-Dokumenten — die pure Logik (kein DB-Zugriff).
//
// Aaron 20.09.2026: „ja aber das Unterschriftsfeld muss gesetzt werden." Seit dem 19.09. prüft
// kein Admin mehr, was ein Gutachter hochlädt (Entscheidung A2). Für die vier Unterlagen, die der
// Kunde im FlowLink mit-signiert (Aaron 04.07.: alle vier), ist das gesetzte Feld damit die
// einzige Sicherung, dass die Unterschrift AUF dem Dokument landet — und nicht, wie bis heute auf
// prod immer (0 Klick-Konfigs, 0 signierte SV-Dokumente), auf einer angehängten Extra-Seite.
//
// Persistenz: `pflichtdokumente.signatur_position` (jsonb, Migration 20260920160631).
// Koordinaten in PDF-Punkten, Ursprung unten links — dasselbe System wie pdf-lib und der
// Admin-Klick-Editor (/admin/vertraege), dessen JSON-Sidecar als globaler Fallback bleibt.

/** Die vier Kunden-Unterlagen, die der Kunde mit-signiert (= PFLICHT_SLOTS des SA-Tools). */
export const SIGNATUR_SLOTS = [
  'sv_sicherungsabtretung',
  'sv_honorarvereinbarung',
  'sv_datenschutzerklaerung',
  'sv_widerrufsbelehrung',
] as const

export type SignaturSlot = (typeof SIGNATUR_SLOTS)[number]

export function istSignaturSlot(slotId: string): slotId is SignaturSlot {
  return (SIGNATUR_SLOTS as readonly string[]).includes(slotId)
}

/** Was der Merge braucht — kompatibel zur KlickKonfig des Admin-Editors. */
export type SignaturKonfig = {
  page: number
  x: number
  y: number
  width: number
  height: number
  datum_x?: number
  datum_y?: number
  name_x?: number
  name_y?: number
}

/** Was in `pflichtdokumente.signatur_position` steht: Konfig + Seitenmaße + Zeitstempel. */
export type SignaturPosition = SignaturKonfig & {
  pdf_breite: number
  pdf_hoehe: number
  seiten: number
  gesetzt_am: string
}

export type PdfMasse = { breite: number; hoehe: number; seiten: number }

function zahl(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Prüft und normalisiert eine vom Client gesetzte Position gegen die Maße des PDFs.
 * Pflicht: page/x/y/width/height innerhalb der Seite. Datum/Name nur als Paar, sonst weggelassen.
 */
export function validiereSignaturPosition(
  input: unknown,
  pdf: PdfMasse,
  jetzt: Date = new Date(),
): { ok: true; position: SignaturPosition } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Keine Position übergeben.' }
  const o = input as Record<string, unknown>
  const page = zahl(o.page)
  const x = zahl(o.x)
  const y = zahl(o.y)
  const width = zahl(o.width)
  const height = zahl(o.height)
  if (page == null || x == null || y == null || width == null || height == null) {
    return { ok: false, error: 'Position unvollständig (Seite, x, y, Breite, Höhe).' }
  }
  const p = Math.round(page)
  if (p < 0 || p >= pdf.seiten) {
    return { ok: false, error: `Seite ${p + 1} gibt es in diesem Dokument nicht (${pdf.seiten} Seiten).` }
  }
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.round(width)
  const rh = Math.round(height)
  if (rw <= 0 || rh <= 0) return { ok: false, error: 'Das Unterschriftsfeld braucht eine Breite und Höhe.' }
  if (rx < 0 || ry < 0 || rx + rw > pdf.breite || ry + rh > pdf.hoehe) {
    return { ok: false, error: 'Das Unterschriftsfeld liegt außerhalb der Seite.' }
  }

  const position: SignaturPosition = {
    page: p,
    x: rx,
    y: ry,
    width: rw,
    height: rh,
    pdf_breite: Math.round(pdf.breite),
    pdf_hoehe: Math.round(pdf.hoehe),
    seiten: pdf.seiten,
    gesetzt_am: jetzt.toISOString(),
  }
  const dx = zahl(o.datum_x)
  const dy = zahl(o.datum_y)
  if (dx != null && dy != null) {
    position.datum_x = Math.round(dx)
    position.datum_y = Math.round(dy)
  }
  const nx = zahl(o.name_x)
  const ny = zahl(o.name_y)
  if (nx != null && ny != null) {
    position.name_x = Math.round(nx)
    position.name_y = Math.round(ny)
  }
  return { ok: true, position }
}

function istKonfig(v: unknown): v is SignaturKonfig {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return ['page', 'x', 'y', 'width', 'height'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k] as number))
}

/**
 * Welche Konfig der Merge nimmt: die des Gutachters vor der globalen Admin-Vorlage,
 * und null, wenn beides fehlt (→ Anhang-Seite, Bestand / Annahme A1).
 * Eine kaputte gespeicherte Position wird ignoriert statt angewendet.
 */
export function waehleSignaturKonfig(
  eigene: unknown,
  global: SignaturKonfig | null | undefined,
): SignaturKonfig | null {
  if (istKonfig(eigene)) {
    const { page, x, y, width, height, datum_x, datum_y, name_x, name_y } = eigene
    return { page, x, y, width, height, datum_x, datum_y, name_x, name_y }
  }
  return global ?? null
}

export type DokumentZustand = 'leer' | 'feld_fehlt' | 'aktiv_ohne_feld' | 'aktiv' | 'abgelehnt'

/**
 * Zustand eines Slots aus der pflichtdokumente-Zeile, für Wizard, Nachweise-Seite und Admin-Akte:
 *  - leer            keine Datei
 *  - abgelehnt       Admin hat zurückgewiesen
 *  - feld_fehlt      Datei da, aber Unterschriftsfeld fehlt → NICHT im Kundenflow (neuer Upload)
 *  - aktiv_ohne_feld Bestand: schon im Kundenflow, bekommt aber noch die Anhang-Seite
 *  - aktiv           im Kundenflow; Nachweis-Slots (ohne Feld-Pflicht) sind mit Datei immer aktiv
 */
export function dokumentZustand(row: {
  dokument_typ: string
  status: string | null
  dokument_url: string | null
  signatur_position: unknown
}): DokumentZustand {
  if (row.status === 'abgelehnt') return 'abgelehnt'
  if (!row.dokument_url) return 'leer'
  const aktivStatus = row.status === 'hochgeladen' || row.status === 'geprueft'
  if (!istSignaturSlot(row.dokument_typ)) return aktivStatus ? 'aktiv' : 'leer'
  const feld = row.signatur_position != null
  if (aktivStatus) return feld ? 'aktiv' : 'aktiv_ohne_feld'
  return 'feld_fehlt'
}
