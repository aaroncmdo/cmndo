// src/lib/kasko-wb/persistenz.ts
// Der EINE Schreibsatz der Kasko-Tarif-Antwort fuer FlowLink, Kunde-Portal und Dispatcher: welche Felder auf
// Lead + Claim, wann eine Werkstattbindungs-Disqualifikation aufgehoben wird, wann die E6-Mail geht.
// Pure + client-safe (kein DB-Import), unit-getestet. Vorher lag die Logik dreimal inline und driftete
// (Review #5864, Befund 1: die Korrektur gebunden -> unbekannt liess freie_werkstattwahl=false stehen, weil
// null an keiner der drei Stellen geschrieben wurde — Dispatch, Reminder-Cron und Portal hielten den Lead
// weiter fuer gebunden, „Angaben korrigieren" war eine Schleife).

import { buildReQualifikationPatch } from '@/lib/self-service/disqualifikation-patch'
import type { KaskoTarifAuswahl, WbErgebnis } from './types'

export type KaskoAltStand = {
  disqualifiziertGrundKey: string | null
  freieWerkstattwahl: boolean | null
  markeId: string | null
  tarifId: string | null
  /** Lead schon zu Claim/Fall konvertiert -> Re-Qualifikation stellt status 'umgewandelt' statt 'neu' her. */
  konvertiert: boolean
}

/** Die Lead-Spalten, aus denen der Alt-Stand gelesen wird (beliebig partiell selektierbar). */
export type KaskoAltRow = {
  disqualifiziert_grund_key?: string | null
  freie_werkstattwahl?: boolean | null
  eigene_versicherung_marke_id?: string | null
  eigene_kasko_tarif_id?: string | null
  konvertiert_zu_claim_id?: string | null
  konvertiert_zu_fall_id?: string | null
}

/** DB-Zeile (snake_case) -> Alt-Stand. null, wenn es die Zeile nicht gibt. */
export function leseKaskoAltStand(row: KaskoAltRow | null | undefined): KaskoAltStand | null {
  if (!row) return null
  return {
    disqualifiziertGrundKey: row.disqualifiziert_grund_key ?? null,
    freieWerkstattwahl: row.freie_werkstattwahl ?? null,
    markeId: row.eigene_versicherung_marke_id ?? null,
    tarifId: row.eigene_kasko_tarif_id ?? null,
    konvertiert: Boolean(row.konvertiert_zu_claim_id || row.konvertiert_zu_fall_id),
  }
}

/**
 * Tarif- und Bindungsfelder — identisch fuer leads UND claims. freie_werkstattwahl steht IMMER drin, auch als
 * null: nur so loescht die Korrektur gebunden -> unbekannt das alte false. (Ein Erst-Durchlauf mit unbekannt
 * schreibt null auf null — kein Unterschied zu vorher.)
 */
export function baueKaskoTarifFelder(
  auswahl: KaskoTarifAuswahl,
  ergebnis: WbErgebnis,
  namen: { markeName: string | null; tarifName: string | null },
): Record<string, unknown> {
  return {
    eigene_versicherung_marke_id: auswahl.markeId,
    eigene_versicherung_name: namen.markeName,
    eigene_kasko_tarif_id: auswahl.tarifId,
    eigene_kasko_tarif_name: namen.tarifName,
    werkstattbindung_quelle: ergebnis.quelle,
    freie_werkstattwahl: ergebnis.freieWerkstattwahl,
  }
}

/**
 * Lead-Patch: Tariffelder plus Re-Qualifikation, wenn der Lead wegen Werkstattbindung disqualifiziert war und die
 * neue Antwort nicht (mehr) gebunden ist (frei ODER unbekannt — E3 laesst unbekannt durch). Andere
 * Disqualifikationsgruende (Eigenverschulden, manuell) bleiben unangetastet.
 */
export function baueKaskoLeadPatch(
  tarifFelder: Record<string, unknown>,
  ergebnis: WbErgebnis,
  alt: Pick<KaskoAltStand, 'disqualifiziertGrundKey' | 'konvertiert'> | null,
): Record<string, unknown> {
  if (alt && ergebnis.freieWerkstattwahl !== false && alt.disqualifiziertGrundKey === 'werkstattbindung') {
    return { ...tarifFelder, ...buildReQualifikationPatch({ konvertiert: alt.konvertiert }) }
  }
  return tarifFelder
}

/**
 * E6-Zusammenfassung nur bei NEUER oder GEAENDERTER Bindung. Wer im Re-Visit-Gate „Angaben korrigieren" waehlt
 * und denselben gebundenen Tarif erneut bestaetigt, bekommt die Mail nicht noch einmal (Review #5864, Befund 8).
 * Vorsicht beim Aufrufer: den Alt-Stand VOR dem Quali-Pfad lesen — speichereQualiFlow schreibt bei „gebunden"
 * bereits freie_werkstattwahl=false, danach saehe eine ERSTE Bindung wie eine unveraenderte aus.
 */
export function sollBindungsMailSenden(ergebnis: WbErgebnis, auswahl: KaskoTarifAuswahl, alt: KaskoAltStand | null): boolean {
  if (ergebnis.freieWerkstattwahl !== false) return false
  if (!alt || alt.freieWerkstattwahl !== false) return true
  return alt.markeId !== auswahl.markeId || alt.tarifId !== auswahl.tarifId
}
