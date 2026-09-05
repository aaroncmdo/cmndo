// Pure Ergebnis-Modell fuer die /check Anspruchs-Pruefung.
// Mappt die 3 Antworten auf ein antwort-adaptives Ergebnis (4 Tiers) und gibt
// i18n-KEYS zurueck (kein Text) -> pur, testbar, i18n-sauber. Die Component
// (CheckFunnelClient) loest die Keys via next-intl t() auf.
// Design: docs/superpowers/specs/2026-06-26-check-anspruch-rebuild-design.md

export type Schuld = 'gegner' | 'teils' | 'unklar' | 'selbst'
export type Frist = 'unter_woche' | 'bis_monat' | 'ueber_monat'
export type Gutachten = 'nein' | 'versicherung' | 'ja'

export type CheckAnswers = {
  schuld?: Schuld
  unfall_her?: Frist
  gutachten?: Gutachten
}

/** voll = §249 Vollanspruch · quote = §254 anteilig · pruefen = Schuld offen · kasko = Eigenverschulden */
export type Tier = 'voll' | 'quote' | 'pruefen' | 'kasko'

export type CheckResult = {
  tier: Tier
  headingKey: string
  subKey: string
  /** Position-Keys -> Component rendert ent_<key>_t / ent_<key>_d */
  positions: string[]
  insightKeys: string[]
  /** illustrative EUR-Spannen nur wo ein echter Gegner-Anspruch besteht */
  showRanges: boolean
  /** Foto-Check-CTA ueberall, wo das Tool die Schuld vorbelegen kann (voll/quote/kasko) — Kasko-WB Phase 2, D4 */
  showFotoCta: boolean
}

export function resolveTier(schuld: Schuld | undefined): Tier {
  switch (schuld) {
    case 'gegner':
      return 'voll'
    case 'teils':
      return 'quote'
    case 'selbst':
      return 'kasko'
    default:
      // 'unklar' oder noch nicht beantwortet
      return 'pruefen'
  }
}

const HAFTPFLICHT_POSITIONS = [
  'gutachten',
  'wertminderung',
  'nutzungsausfall',
  'anwalt',
  'auslagen',
] as const

const KASKO_POSITIONS = ['kasko_gutachten', 'kasko_werkstatt', 'kasko_abwicklung'] as const

export function buildCheckResult(answers: CheckAnswers): CheckResult {
  const tier = resolveTier(answers.schuld)

  const positions = tier === 'kasko' ? [...KASKO_POSITIONS] : [...HAFTPFLICHT_POSITIONS]

  const insightKeys: string[] = []
  if (answers.gutachten === 'versicherung') insightKeys.push('insight_versicherung')
  if (answers.unfall_her === 'unter_woche') insightKeys.push('insight_frist_frisch')
  if (answers.unfall_her === 'ueber_monat') insightKeys.push('insight_verjaehrung')
  if (tier === 'quote') insightKeys.push('insight_teilschuld')
  if (tier === 'pruefen') insightKeys.push('insight_unklar')
  // Kasko-WB Phase 2 (D3): das Quiz verspricht keine Partnerwerkstatt mehr, sondern die Tarifpruefung.
  if (tier === 'kasko') insightKeys.push('insight_kasko', 'insight_kasko_werkstattbindung')

  return {
    tier,
    headingKey: `result_${tier}_heading`,
    subKey: `result_${tier}_sub`,
    positions,
    insightKeys,
    showRanges: tier === 'voll' || tier === 'quote',
    showFotoCta: tier === 'voll' || tier === 'quote' || tier === 'kasko',
  }
}
