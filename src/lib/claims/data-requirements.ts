// Pflichtdok-Kanonisierung: operative Pflicht-Anzeige leitet jetzt aus
// dokument_katalog (SSoT) ab — keine hardcodierten DOC_DEFINITIONS mehr.
//
// getOffeneDokumentAnforderungen ist rein/testbar: der Caller laedt die
// Katalog-Rows (getAlleSlots) + baut den EvalContext (buildDokumentKontext aus
// @/lib/dokumente/build-kontext) und reicht beides rein. Pflicht-fokussiert:
// gezeigt werden Slots die fuer die Rolle uploadbar + freigeschaltet + Pflicht
// sind (plus bestehende Pflicht-DB-Rows). Optionale freigeschaltete Slots
// laufen weiter ueber getFreieSlotsFuerKunde (Onboarding-Step 4).

import type { DokumentKatalogRow } from '@/lib/dokumente/katalog'
import { evaluateKatalogRule, type EvalContext } from '@/lib/dokumente/ruleEvaluator'
import type { PflichtdokumentStand } from '@/app/kunde/onboarding/actions'

export type DokumentStatus = 'offen' | 'erfuellt' | 'spaeter' | 'nicht_relevant'

export type DokumentAnforderung = {
  slot_id: string
  label: string
  beschreibung: string
  pflicht: boolean
  status: DokumentStatus
  /** Bestehender pflichtdokumente-Eintrag (fuer Upload-Pfad) — null wenn das Slot noch nicht angelegt ist. */
  pflichtdoc?: PflichtdokumentStand
}

function statusOf(pd: PflichtdokumentStand | undefined): DokumentStatus {
  if (pd?.dokument_url) return 'erfuellt'
  if (pd?.status === 'spaeter') return 'spaeter'
  return 'offen'
}

/**
 * Liefert die fuer diesen Claim relevanten PFLICHT-Dokument-Anforderungen mit
 * Status. Quelle = dokument_katalog (katalogRows) gegen den EvalContext (ctx).
 *
 * @param katalogRows — alle aktiven Katalog-Slots (getAlleSlots)
 * @param ctx — EvalContext aus buildDokumentKontext({ claim, lead })
 * @param pflichtDocs — bestehende pflichtdokumente fuer den Fall (Status-Source)
 * @param rolle — Upload-Rolle (default 'kunde'); filtert uploadbar_von
 */
export function getOffeneDokumentAnforderungen(
  katalogRows: DokumentKatalogRow[],
  ctx: EvalContext,
  pflichtDocs: PflichtdokumentStand[],
  rolle: string = 'kunde',
): DokumentAnforderung[] {
  const result: DokumentAnforderung[] = []
  const seen = new Set<string>()

  for (const slot of katalogRows) {
    if (slot.slot_id === 'kunde-nachreichung') continue // eigener UI-Block
    if (!slot.uploadbar_von?.includes(rolle)) continue
    if (!evaluateKatalogRule(slot.freigeschaltet_wenn, ctx)) continue
    const istKatalogPflicht =
      slot.pflicht_wenn != null && evaluateKatalogRule(slot.pflicht_wenn, ctx)
    const pflichtdoc = pflichtDocs.find((d) => d.slot_id === slot.slot_id)
    // Pflicht-fokussierte Anzeige: nur Katalog-Pflicht ODER bereits angelegte DB-Pflicht.
    if (!istKatalogPflicht && !pflichtdoc?.pflicht) continue
    result.push({
      slot_id: slot.slot_id,
      label: slot.label,
      beschreibung: slot.beschreibung ?? '',
      pflicht: true,
      status: statusOf(pflichtdoc),
      pflichtdoc,
    })
    seen.add(slot.slot_id)
  }

  // Legacy/KB-Pflicht-Rows die (noch) nicht im Katalog stehen — durchreichen.
  const katalogIds = new Set(katalogRows.map((s) => s.slot_id))
  for (const pd of pflichtDocs) {
    if (seen.has(pd.slot_id) || katalogIds.has(pd.slot_id)) continue
    if (!pd.pflicht) continue
    result.push({
      slot_id: pd.slot_id,
      label: pd.label ?? pd.slot_id ?? '',
      beschreibung: pd.beschreibung ?? '',
      pflicht: true,
      status: statusOf(pd),
      pflichtdoc: pd,
    })
  }

  // Stabile Sortierung nach Katalog-sort_order, dann Label.
  const orderOf = (slotId: string) =>
    katalogRows.find((s) => s.slot_id === slotId)?.sort_order ?? 999
  result.sort((a, b) => orderOf(a.slot_id) - orderOf(b.slot_id) || (a.label ?? '').localeCompare(b.label ?? '', 'de'))

  return result
}

/**
 * Anzahl noch offener Pflicht-Punkte (Banner-Counter + Onboarding-Ende).
 * Alles was Pflicht ist und nicht 'erfuellt' zaehlt als offen (CMM-22).
 */
export function countOffenePflicht(anforderungen: DokumentAnforderung[]): number {
  return anforderungen.filter((a) => a.pflicht && a.status !== 'erfuellt').length
}
