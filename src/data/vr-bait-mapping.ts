/**
 * Versicherer-Bait-Mapping: Spoke-Slug → spezifische Versicherer-Saetze.
 *
 * Aaron befuellt diese Map in Sprint 1 Stream G/H.
 * Quelle: marketing-strategy/strategy/30-BRAND-IDENTITY-MASTER-CLAIMONDO-FAMILIE.md §8.9
 *         (entspricht brand-fakten-library.ts Cluster 'versicherer-bait', F46–F50)
 */

export interface VrBait {
  versicherer: 'HUK' | 'AXA' | 'Allianz' | 'LVM' | 'R+V' | 'Provinzial' | 'ControlExpert' | 'K-Expert' | 'DEKRA'
  satz: string // woertlicher Bait-Satz aus Doc 30 §8.9
}

export const VR_BAIT_MAPPING: Record<string, VrBait[]> = {
  // 'wertminderung-detail': [
  //   {
  //     versicherer: 'HUK',
  //     satz: 'Die HUK arbeitet in der Praxis häufig mit ControlExpert-Prüfdiensten, die Kürzungen ohne Fahrzeugbesichtigung vornehmen — BGH VI ZR 38/22 ff. stoppt diese Praxis.',
  //   },
  // ],

  // → Claude Code Auftrag (Sprint 1 Stream G/H): 8 VR-Saetze auf 8 entsprechende Spokes mappen.
}
