import type { Db } from '../anreicherung/schreiben'
import { erzeugeToken } from './token'

/** Eine Zeile der Vertriebs-Uebersicht. */
export type VertriebsZeile = {
  checkId: string
  /** Der oeffentliche Check-Token — fuer den Sprung in die Kundensicht. */
  token: string
  firmenname: string | null
  ort: string | null
  erhobenAm: string | null
  score: number | null
  keinScore: boolean
  /** Zeitpunkt des Terminwunsches, falls einer vorliegt. */
  terminAm: string | null
  svLeadId: string | null
  claimStatus: string | null
}

/**
 * Reihenfolge der Uebersicht.
 *
 * ⭐ Wer einen Termin will, steht oben — unabhaengig davon, wie alt sein Check
 * ist. Nach Datum zu sortieren waere die naheliegende Wahl und die falsche:
 * der juengste Check ist nicht der dringendste Vorgang, sondern der, bei dem
 * jemand auf einen Rueckruf wartet.
 */
export function ordneFuerVertrieb(zeilen: VertriebsZeile[]): VertriebsZeile[] {
  const zeit = (s: string | null) => (s ? Date.parse(s) : 0)

  return [...zeilen].sort((a, b) => {
    const aTermin = Boolean(a.terminAm)
    const bTermin = Boolean(b.terminAm)
    if (aTermin !== bTermin) return aTermin ? -1 : 1

    // Innerhalb der Termine: der naechste zuerst. Sonst: der neueste Check.
    if (aTermin && bTermin) return zeit(a.terminAm) - zeit(b.terminAm)
    return zeit(b.erhobenAm) - zeit(a.erhobenAm)
  })
}

export type LinkErgebnis = { ok: true; token: string } | { ok: false; error: string }

/**
 * Holt den Auswertungslink eines Checks — und legt ihn an, falls es keinen gibt.
 *
 * ⚠ IDEMPOTENT. Ohne die Vorab-Suche sammelt jeder Aufruf ein weiteres
 * gueltiges Token an; kommt eines davon abhanden, muesste man sie einzeln
 * widerrufen und wuesste nicht einmal, wie viele es gibt.
 */
export async function erzeugeAuswertungslink(
  db: Db,
  checkId: string,
  userId: string | null,
): Promise<LinkErgebnis> {
  const { data: vorhanden, error: leseFehler } = await db
    .from('levelup_auswertungslinks')
    .select('token')
    .eq('check_id', checkId)
    .limit(1)
    .maybeSingle()

  if (leseFehler) return { ok: false, error: `Link nicht lesbar: ${leseFehler.message}` }
  if (vorhanden) return { ok: true, token: (vorhanden as { token: string }).token }

  const token = erzeugeToken()
  const { data, error } = await db
    .from('levelup_auswertungslinks')
    .insert({ check_id: checkId, token, erstellt_von: userId })
    .select()
    .single()

  if (error || !data) {
    return { ok: false, error: `Link nicht anlegbar: ${error?.message ?? 'kein Ergebnis'}` }
  }
  return { ok: true, token }
}
