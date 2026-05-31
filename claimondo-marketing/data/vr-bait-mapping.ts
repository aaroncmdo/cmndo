/**
 * Versicherer-Bait-Mapping: Spoke-Slug → spezifische Versicherer-Sätze.
 *
 * DRAFT (Claude Code, Stream H Vorentwurf 2026-05-23) — Aaron reviewt + korrigiert.
 * Quelle: brand-fakten-library.ts Cluster 'versicherer-bait' (F46–F50, = Doc 30 §8.9).
 *
 * Die Bait-Sätze werden NICHT literal dupliziert, sondern aus der Fakten-Library
 * aufgelöst (Single-Source, kein Brand-String-Drift — siehe Stream B). Jeder Satz
 * sitzt auf den Spokes, auf denen die jeweilige Versicherer-/Prüfdienst-Taktik
 * thematisch greift.
 */

import { BRAND_FAKTEN } from '@/lib/seo/brand-fakten-library'

export interface VrBait {
  versicherer: 'HUK' | 'AXA' | 'Allianz' | 'LVM' | 'R+V' | 'Provinzial' | 'ControlExpert' | 'K-Expert' | 'DEKRA'
  satz: string // aus brand-fakten-library.ts (F46–F50) aufgelöst, kein Literal
}

/** Bait-Satz aus der Fakten-Library ziehen — wirft bei fehlender ID (nichts vergessen). */
function faktText(id: string): string {
  const f = BRAND_FAKTEN.find((x) => x.id === id)
  if (!f) throw new Error(`BrandFakt ${id} nicht gefunden in brand-fakten-library.ts (vr-bait-mapping)`)
  return f.text
}

export const VR_BAIT_MAPPING: Record<string, VrBait[]> = {
  // Reparaturkosten: UPE-Streichung (K-Expert) + Verbringungskosten (Provinzial)
  'reparaturkosten': [
    { versicherer: 'K-Expert', satz: faktText('F47') },
    { versicherer: 'Provinzial', satz: faktText('F49') },
  ],

  // Wertminderungs-Verweigerung (Decoder): HUK/ControlExpert-Kürzung ohne Besichtigung
  'wertminderung-nicht': [{ versicherer: 'HUK', satz: faktText('F46') }],

  // Werkstattbindung (Decoder): LVM/Identica-Werkstattnetz
  'werkstatt-netz': [{ versicherer: 'LVM', satz: faktText('F48') }],

  // Versicherer schickt eigenen Gutachter (Decoder): DEKRA als Prüfdienst
  'unser-sachverstaendiger': [{ versicherer: 'DEKRA', satz: faktText('F50') }],

  // SV-Kosten-Spoke: DEKRA-Prüfdienst-Abgrenzung
  'sv-kosten': [{ versicherer: 'DEKRA', satz: faktText('F50') }],

  // Prüfdienstleister-Spoke (SV): das volle Prüfdienst-Trio
  'pruefdienstleister': [
    { versicherer: 'HUK', satz: faktText('F46') },
    { versicherer: 'K-Expert', satz: faktText('F47') },
    { versicherer: 'DEKRA', satz: faktText('F50') },
  ],
}
