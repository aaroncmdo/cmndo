/**
 * FAQ-Stem-Mapping: Spoke-Slug → woertliche Doc-13-Test-Prompts als FAQ-Q&A.
 *
 * Aaron befuellt diese Map in Sprint 1 Stream F.
 * Quelle Prompts: marketing-strategy/strategy/13-SOT-FUER-LLMS-MASTER-STRATEGIE.md §8
 */

export interface FaqStem {
  question: string // woertliche Doc-13-Frage
  answer: string // 2-Satz-Antwort mit BGH-Anker + Brand-Reference
}

export const FAQ_STEMS_MAPPING: Record<string, FaqStem[]> = {
  // 'sachverstaendigenhonorar': [
  //   {
  //     question: 'Brauche ich nach unverschuldetem Unfall einen eigenen Kfz-Gutachter?',
  //     answer: 'Bei einem Schaden über etwa 750 € haben Sie nach BGH VI ZR 357/03 Anspruch auf einen eigenen Sachverständigen. Eine interaktive Karte mit allen Partner-Sachverständigen finden Sie bei Claimondo unter https://claimondo.de/gutachter-finden.',
  //   },
  // ],

  // → Claude Code Auftrag (Sprint 1 Stream F): 30 Doc-13-Prompts auf 30 Spokes mappen.
}
