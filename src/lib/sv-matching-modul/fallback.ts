// AAR-956 Dead-Pin-Fallback — VERTRAG (Typen + Signaturen, Typ-Ebene).
//
// Additiv: laesst planeTerminOeffentlich + den Partner-Pfad UNBERUEHRT. Der Fallback
// wird vom Consumer NUR aufgerufen, wenn der Partner-Match 0 Treffer hat (onKeinMatch
// auf FlowSlotStep) — kein Doppel-Match, Partner-Pfad unbesteuert (aar-956-Design 12.06.).
// Modell: memory COORDINATION-deadpin-fallback-to-aar956.md (Aaron-abgestimmt).
//
// REINE Typ-Ebene (kein Live-Stub). Bodies (ladeDeadPinFallback / bucheDeadPinTermin)
// folgen separat (Schritt b) und erfuellen exakt diese Signaturen.

import type { SlotVorschlag } from './types'

/**
 * Dead-Pin Lite-Projektion (sv_leads = unclaimter Excel-Import, Tier-4).
 * Leak-safe: KEIN name/firma/adresse. Dem Kunden als ABGESPECKTE Partner-Karte gezeigt.
 */
export type DeadPinOeffentlich = {
  /** sv_leads.id — opakes Buchungs-Handle. */
  deadPinId: string
  /** Stadt (grob) — Label „Kfz-Gutachter in {ort}". KEIN Name (Privacy). */
  ort: string | null
  /** Datenschutz-gerundet, z.B. „in Ihrer Naehe" — Paritaet zu OeffentlichesSvProfil. */
  distanzGerundet: string
  /** Fuer die Karte (Dead-Pin-Pin; KEINE Route — Dead-Pins sind eh nur Pins). */
  lat: number
  lng: number
  /** GENERISCHE Immer-frei-Slots. Partner-Slot-Shape → gleicher SvSlotAuswahl-Renderer. KEIN freieSlots/ETA/Busy. */
  slots: SlotVorschlag[]
  /** Diskriminator → Lite-Karte + bucheDeadPinTermin-Pfad. */
  istDeadPin: true
}

/**
 * Standalone Dead-Pin-Fallback-Fetch. Consumer ruft das via `onKeinMatch` (GENAU wenn
 * 0 Partner) — NICHT als Upfront-Branch (kein Doppel-Match, Partner-Pfad unbesteuert).
 * Liefert die sv_leads, deren Isochrone den Ort deckt, mit generischen Slots.
 * Leer = keine Dead-Pin-Abdeckung (sehr selten).
 */
export type LadeDeadPinFallbackInput = { lat: number; lng: number }
export type LadeDeadPinFallback = (
  input: LadeDeadPinFallbackInput,
) => Promise<DeadPinOeffentlich[]>

export type BucheDeadPinTerminInput = {
  /** flow_links-Token (konsistent zu bucheTerminFlow(token, …)); wird intern zu lead aufgeloest. */
  token: string
  /** = DeadPinOeffentlich.deadPinId (sv_leads.id). */
  deadPinId: string
  /** Gewaehlter generischer Slot (ISO/UTC). */
  startIso: string
}

export type BucheDeadPinTerminResult =
  | { ok: true; terminId: string }
  | { ok: false; error: string }

/**
 * Dead-Pin-Buchung → `gutachter_termine` (`assignee_typ='sv_lead'`,
 * `status='dispatch_pending'`). NUR der Write — KEIN Versand: Kunde+Team-Notify macht der
 * Embed (generisches „Kfz-Gutachter in {ort}"-Label), der SV wird NIE benachrichtigt.
 * KEINE Exclusion-Constraint (dispatch_pending exempt). Landet zur MANUELLEN Koordination
 * beim Dispatch.
 */
export type BucheDeadPinTermin = (
  input: BucheDeadPinTerminInput,
) => Promise<BucheDeadPinTerminResult>
