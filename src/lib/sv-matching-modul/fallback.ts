// AAR-956 Dead-Pin-Fallback — VERTRAG (Typen + Signaturen, Typ-Ebene).
//
// Additiv: laesst planeTerminOeffentlich (/flow + SV-Embed) UNBERUEHRT. Der Fallback
// ist ein neuer, opt-in Entry-Point fuer den gutachter-finder-Embed (aar-956).
// Modell + Begruendung: memory-Marker COORDINATION-deadpin-fallback-to-aar956.md
// (Aaron-abgestimmt 12.06.).
//
// Diese Datei ist REINE Typ-Ebene (kein Live-Stub), damit aar-956 driftfrei dagegen
// bauen kann. Die Bodies (planeTerminMitFallback / bucheDeadPinTermin) folgen separat
// (Schritt b) und erfuellen exakt diese Signaturen.

import type { OeffentlichesSvProfil, SlotVorschlag } from './types'
import type { PlaneTerminOeffentlichInput } from './plane-termin-oeffentlich'

/**
 * Dead-Pin Lite-Projektion (sv_leads = unclaimter Excel-Import, Tier-4).
 * Leak-safe wie die Marketing-Karte: KEIN name/firma/adresse. Wird dem Kunden als
 * ABGESPECKTE Partner-Karte gezeigt — nur Ort + gerundete Distanz + generische Slots.
 */
export type DeadPinOeffentlich = {
  /** sv_leads.id — opakes Buchungs-Handle (Rolle wie OeffentlichesSvProfil.svId). */
  deadPinId: string
  /** Stadt (grob) — Label „Kfz-Gutachter in {ort}". KEIN Name (Privacy). */
  ort: string | null
  /** Datenschutz-gerundet, z.B. „in Ihrer Naehe" — Paritaet zu OeffentlichesSvProfil. */
  distanzGerundet: string
  /** Fuer die Karte (Dead-Pin-Pin). */
  lat: number
  lng: number
  /** GENERISCHE Immer-frei-Slots — KEIN freieSlots/ETA/Busy (Dispatch koordiniert manuell). */
  slots: SlotVorschlag[]
  /** Diskriminator → Lite-Karte + bucheDeadPinTermin-Pfad. */
  istDeadPin: true
}

/**
 * Diskriminiertes Matching-Ergebnis. Echte Partner haben IMMER Vorrang; Dead-Pins
 * erscheinen NUR, wenn die Engine 0 buchbare Partner-Slots liefert (kein Partner in
 * Reichweite ODER kein Partner hat freie Termine).
 */
export type PlaneTerminMitFallbackResult =
  | { kind: 'partner'; svs: OeffentlichesSvProfil[] }
  | { kind: 'fallback'; deadPins: DeadPinOeffentlich[] }

export type BucheDeadPinTerminInput = {
  /** = DeadPinOeffentlich.deadPinId (sv_leads.id). */
  deadPinId: string
  /** bezug=lead (aus gfa→lead, wie bucheTerminFlow). */
  leadId: string
  /** Gewaehlter generischer Slot (ISO/UTC). */
  startIso: string
}

export type BucheDeadPinTerminResult =
  | { ok: true; terminId: string }
  | { ok: false; error: string }

// ─── Signaturen (Typ-Ebene; Bodies in Schritt b) ──────────────────────────────

/**
 * Matching mit Dead-Pin-Fallback. Laeuft ERST den Partner-Match (engine-ranked, =
 * planeTerminOeffentlich-Logik): ≥1 Partner mit ≥1 Slot → `{kind:'partner', svs}`
 * (`svs[0]` = empfohlen, da findBestSV-Score-sortiert). Sonst → `{kind:'fallback',
 * deadPins}`. `fixerSvId` gesetzt → immer `{kind:'partner'}` (dieser SV, kein Fallback).
 */
export type PlaneTerminMitFallback = (
  input: PlaneTerminOeffentlichInput,
) => Promise<PlaneTerminMitFallbackResult>

/**
 * Dead-Pin-Buchung → `gutachter_termine` (`assignee_typ='sv_lead'`,
 * `status='dispatch_pending'`). KEINE SV-Notification, KEINE Exclusion-Constraint
 * (dispatch_pending ist exempt). Landet zur MANUELLEN Koordination beim Dispatch.
 */
export type BucheDeadPinTermin = (
  input: BucheDeadPinTerminInput,
) => Promise<BucheDeadPinTerminResult>
