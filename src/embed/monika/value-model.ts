// AAR-939 · Monika dataLayer-Spec (Doc 11) · PURE value-based Conversion-Modell.
//
// Leitet aus dem Funnel-`anliegen` die schadenart der Tracking-Spec ab und mappt
// sie auf einen Geldwert (EUR), damit Google Ads auf den ECHTEN Lead-Wert
// optimieren kann (tROAS / Maximize Conversion Value) statt nur auf Lead-Anzahl.
//
// Kein DOM, keine Imports ausser den Typen → vitest-testbar (Embed-Pattern wie
// payload.ts / conversion.ts).

import type { Answers } from './flow-script'
import type { MonikaConfig } from './types'

export type Schadenart = 'haftpflicht' | 'wertgutachten' | 'gegengutachten' | 'schadensberatung' | 'unbekannt'

/** Funnel-`anliegen` → schadenart-Vokabular der Tracking-Spec (Doc 11 §1). */
export function schadenartFromAnswers(answers: Answers): Schadenart {
  switch (answers.anliegen) {
    case 'haftpflichtgutachten':
      return 'haftpflicht'
    case 'wertgutachten':
      return 'wertgutachten'
    case 'gegengutachten':
      return 'gegengutachten'
    case 'schadensberatung':
      return 'schadensberatung'
    default:
      return 'unbekannt'
  }
}

// Geldwert (EUR) pro schadenart. Doc 11 §1 + Aaron 08.06.2026: schadensberatung = 25
// (gleichwertig zur reinen Rueckrufbitte). gegengutachten/unbekannt = 0 ("nur beobachten").
const VALUE_BY_SCHADENART: Record<Schadenart, number> = {
  haftpflicht: 100,
  wertgutachten: 50,
  schadensberatung: 25,
  gegengutachten: 0,
  unbekannt: 0,
}

/** Geldwert (EUR, Number) fuer eine schadenart. */
export function valueForSchadenart(art: Schadenart): number {
  return VALUE_BY_SCHADENART[art]
}

/**
 * Normalisiert eine (deutsche) Telefonnummer auf E.164 (+49…) — Pflicht fuer
 * Enhanced Conversions (Doc-12 Ä9), sonst kein Hash-Match in Google Ads.
 * Leere/unbrauchbare Eingabe -> '' (wird dann nicht in den dataLayer geschrieben).
 */
export function toE164(raw: string, cc = '49'): string {
  const s = (raw || '').replace(/[^\d+]/g, '')
  if (!s || s === '+') return ''
  if (s.startsWith('+')) return s
  if (s.startsWith('00')) return '+' + s.slice(2)
  if (s.startsWith('0')) return '+' + cc + s.slice(1)
  if (s.startsWith(cc)) return '+' + s
  return '+' + cc + s
}

export interface ConversionExtra {
  schadenart: Schadenart
  /** EUR-Wert als ZAHL (nie String — sonst ignoriert GA4/Ads das Wert-Bidding). */
  value: number
  currency: 'EUR'
  /** Server-Anfrage-ID = Transaction-ID → Dedupe. Nur gesetzt wenn vorhanden. */
  lead_id?: string
  /** Klartext, E.164 — GTM hasht clientseitig SHA-256 (Enhanced Conversions). */
  phone?: string
  gclid?: string
  // Index-Signatur: das Objekt geht 1:1 als dataLayer-Bag in track(extra: Record<string, unknown>).
  [key: string]: unknown
}

/**
 * Baut die value-based-Conversion-Felder fuer den `monika_anfrage_submit`-dataLayer-Push.
 *
 * NUR Cluster-LP (`kfz_gutachter_lp`): sv_embed gibt `undefined` zurueck — der SV definiert
 * seinen Conversion-Wert in der EIGENEN GA4-/Ads-Action; wir ueberschreiben ihn nicht
 * (gleiche Logik wie conversion.ts:fireSiteConversion). Cluster + stadt traegt `track()` schon.
 */
export function buildConversionExtra(
  cfg: MonikaConfig,
  answers: Answers,
  meta: { leadId?: string | null; phone?: string; gclid?: string },
): ConversionExtra | undefined {
  if (cfg.source !== 'kfz_gutachter_lp') return undefined

  const schadenart = schadenartFromAnswers(answers)
  const extra: ConversionExtra = {
    schadenart,
    value: valueForSchadenart(schadenart),
    currency: 'EUR',
  }
  // Leere Werte weglassen: ein leeres lead_id wuerde GTM alle id-losen Conversions
  // zu EINER zusammenfassen (Unterzaehlung). Fehlt es, behandelt GA4/Ads jedes Event
  // als eigene Conversion — das sichere Failure-Mode.
  if (meta.leadId) extra.lead_id = meta.leadId
  const phoneE164 = meta.phone ? toE164(meta.phone) : '' // Doc-12 Ä9: E.164 fuer Enhanced Conversions
  if (phoneE164) extra.phone = phoneE164
  if (meta.gclid) extra.gclid = meta.gclid
  return extra
}
