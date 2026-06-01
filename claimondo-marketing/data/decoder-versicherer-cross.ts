/**
 * Decoder x Versicherer — Kürzungs-Matrix (CONTRACT F-41).
 *
 * Quelle: marketing-strategy/sprint-1-versicherer-hubs/data/02-r2-kuerzungs-praxis-vollstaendig.md
 * Teil B/C (12x16-Matrix, Skala 0-3). Treibt die KuerzungsHeatmap je Versicherer.
 *
 * Decoder-Ziele (Welle 2): bewusst nur EXISTIERENDE Routen (10 Decoder + Haftpflicht-
 * Spokes), damit keine Heatmap-Zelle 404't. Welle 3 repointet die mit TODO markierten
 * Zeilen auf die dann existierenden spezialisierten Decoder (upe-aufschlaege-fiktiv,
 * restwertboerse-versicherer-hoch, beilackierung-zahlung-verweigert, werkstattrisiko-bgh-2024).
 */
import type { KuerzungEntry, KuerzungScore } from '@/components/content/KuerzungsHeatmap'

/** 16 Kürzungstaktiken (R2 T1-T16) — Label + Decoder-Ziel, in CSV-Spaltenreihenfolge. */
const TAKTIK_META: Array<{ taktik: string; decoderUrl: string }> = [
  { taktik: 'Werkstatt-Steuerung / Verweisungswerkstatt', decoderUrl: '/decoder/werkstatt-netz' },
  { taktik: 'Restwert künstlich hoch (Restwertbörse)', decoderUrl: '/haftpflicht/wiederbeschaffungswert' }, // Welle 3: /decoder/restwertboerse-versicherer-hoch
  { taktik: 'Sachverständigen-Honorar (BVSK, Nebenkosten)', decoderUrl: '/decoder/unser-sachverstaendiger' },
  { taktik: 'Stundenverrechnungssätze', decoderUrl: '/decoder/werkstatt-netz' },
  { taktik: 'UPE-Aufschläge & Verbringung (fiktiv)', decoderUrl: '/haftpflicht/reparaturkosten' }, // Welle 3: /decoder/upe-aufschlaege-fiktiv
  { taktik: 'Nutzungsausfall (Klassenabstufung)', decoderUrl: '/decoder/nutzungsausfall-nicht' },
  { taktik: 'Mietwagen (Fraunhofer statt Schwacke)', decoderUrl: '/decoder/mietwagen-zu-hoch' },
  { taktik: 'Wertminderung (merkantil)', decoderUrl: '/decoder/wertminderung-nicht' },
  { taktik: 'Anwaltskosten', decoderUrl: '/haftpflicht/anwaltskosten-erstattung' },
  { taktik: 'Mehrwertsteuer bei fiktiver Abrechnung', decoderUrl: '/haftpflicht/reparaturkosten' },
  { taktik: 'Reparaturbestätigung / Werkstattrisiko', decoderUrl: '/haftpflicht/reparaturkosten' }, // Welle 3: /decoder/werkstattrisiko-bgh-2024
  { taktik: 'Quotelung / Mitverschulden', decoderUrl: '/decoder/mitverschulden-30-prozent' },
  { taktik: 'Verzögerung / Zahlung erst nach Klage', decoderUrl: '/decoder/wir-pruefen-sachverhalt' },
  { taktik: 'Vorhaltekosten', decoderUrl: '/haftpflicht/nutzungsausfall' },
  { taktik: 'Bagatell-Schwelle künstlich erhöht', decoderUrl: '/decoder/pauschal-abgeltung' },
  { taktik: 'Eigener Versicherer-Gutachter', decoderUrl: '/decoder/unser-sachverstaendiger' },
]

/**
 * Scores 0-3 je Versicherer in TAKTIK_META-Reihenfolge (R2 Teil C CSV).
 * HUK-Coburg VVaG + Allgemeine teilen den dokumentierten Gruppen-Score (gleicher
 * Schadenapparat in Coburg). 0=selten 1=gelegentlich 2=Standard 3=aggressiv.
 */
export const DECODER_VERSICHERER_MATRIX: Record<string, KuerzungScore[]> = {
  'huk-coburg-allgemeine': [3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 3, 2, 3, 2, 2, 2],
  'huk-coburg': [3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 3, 2, 3, 2, 2, 2],
  huk24: [3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 3, 2, 2, 2],
  allianz: [3, 2, 3, 3, 3, 2, 3, 2, 2, 2, 2, 2, 3, 2, 2, 2],
  axa: [2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2],
  'r-plus-v': [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1],
  generali: [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  cosmosdirekt: [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2],
  lvm: [2, 1, 2, 2, 2, 2, 2, 1, 2, 2, 1, 1, 2, 2, 2, 1],
  ergo: [3, 2, 3, 2, 3, 2, 2, 2, 2, 2, 1, 2, 3, 2, 2, 2],
  vhv: [2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  zurich: [2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  'da-direkt': [2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
}

/** Heatmap-Eintraege (Taktik + Score + Decoder-Link) fuer einen Versicherer. */
export function getKuerzungen(slug: string): KuerzungEntry[] {
  const scores = DECODER_VERSICHERER_MATRIX[slug]
  if (!scores) return []
  return TAKTIK_META.map((m, i) => ({
    taktik: m.taktik,
    score: scores[i] ?? 1,
    decoderUrl: m.decoderUrl,
  }))
}
