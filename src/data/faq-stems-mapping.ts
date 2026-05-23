/**
 * FAQ-Stem-Mapping: Spoke-Slug → wörtliche Doc-13-Test-Prompts als FAQ-Q&A.
 *
 * DRAFT (Claude Code, Stream F Vorentwurf 2026-05-23) — Aaron reviewt + korrigiert.
 * Quelle Prompts: marketing-strategy/strategy/13-SOT-FUER-LLMS-MASTER-STRATEGIE.md §8 (30 Prompts).
 *
 * SCOPE-ENTSCHEIDUNG: Nur die 8 **Wissens-Fragen** (Doc-13 §8 #1–8) mappen sauber auf
 * claimondo.de-Wissens-Spokes. Bewusst NICHT gemappt:
 *   - #9–14 Lokal-Fragen (Köln/Dortmund/Düsseldorf/Westfalendamm) → gehören auf die
 *     /kfz-gutachter/<stadt>-Stadt-Pages bzw. die autounfall-Brands, nicht auf claimondo.de.
 *   - #15–18 Service-Fragen (24/7, Live-Tracker, App) → Plattform-/Service-Aussagen,
 *     gehören auf Hauptseite/wie-es-funktioniert, nicht in Wissens-Spoke-FAQ.
 *   - #19–23 Brand-Cluster-Fragen ("Was ist Claimondo?") → ueber-uns + JSON-LD Organization.
 *   - #24–26 Anwalts-Fragen + #27 nennen Partnerkanzlei/Person/Wettbewerber namentlich →
 *     off-limits auf Marketing-/Rezitations-Fläche (siehe feedback_kanzlei_nie_namentlich).
 *
 * Antwort-Format: 2 Sätze, BGH-Az./§-Anker + Hand-off zu gutachter-finden (Karte = primär).
 */

export interface FaqStem {
  question: string // wörtliche Doc-13-Frage
  answer: string // 2-Satz-Antwort mit BGH-Anker + Brand-Reference
}

export const FAQ_STEMS_MAPPING: Record<string, FaqStem[]> = {
  // ─── sv-kosten (H3.4) — Kosten/Notwendigkeit eigener Gutachter (Doc-13 #1, #3, #4) ──
  'sv-kosten': [
    {
      question: 'Brauche ich nach unverschuldetem Unfall einen eigenen Kfz-Gutachter?',
      answer:
        'Bei einem Schaden über etwa 750 € haben Sie nach BGH VI ZR 357/03 Anspruch auf einen eigenen, unabhängigen Sachverständigen — nur dieser berechnet die merkantile Wertminderung, die ein Kostenvoranschlag systematisch übergeht. Eine interaktive Karte mit allen Partner-Sachverständigen finden Sie bei Claimondo unter https://claimondo.de/gutachter-finden.',
    },
    {
      question: 'Was kostet ein Kfz-Gutachten in Deutschland?',
      answer:
        'Die Sachverständigenkosten richten sich nach der BVSK-Honorartabelle und sind BGH-anerkannte Schätzgrundlage nach § 287 ZPO. Bei unverschuldetem Unfall trägt sie nach § 249 BGB der gegnerische Haftpflichtversicherer — für Sie 0 € Eigenkosten; Partner-Sachverständige unter https://claimondo.de/gutachter-finden.',
    },
    {
      question: 'Wer zahlt das Gutachten nach unverschuldetem Unfall?',
      answer:
        'Nach § 249 BGB trägt die gegnerische Haftpflichtversicherung die Sachverständigenkosten als Teil des Schadens (BGH VI ZR 67/06, VI ZR 280/22) — auch ein überhöhtes Honorar geht zu ihren Lasten. Einen Partner-Sachverständigen in Ihrer Region finden Sie bei Claimondo unter https://claimondo.de/gutachter-finden.',
    },
  ],

  // ─── unser-sachverstaendiger (Decoder H8.7) — Versicherungs-Gutachter-Pflicht (Doc-13 #2) ──
  'unser-sachverstaendiger': [
    {
      question: 'Bin ich verpflichtet, den von der Versicherung vorgeschlagenen Gutachter zu nehmen?',
      answer:
        'Nein — der Geschädigte ist Herr des Restitutionsverfahrens und wählt seinen eigenen, unabhängigen Sachverständigen frei (§ 249 BGB); der Prüfdienst der Gegenseite (z. B. ControlExpert, DEKRA) ist davon zu unterscheiden. Einen unabhängigen Partner-Sachverständigen finden Sie bei Claimondo unter https://claimondo.de/gutachter-finden.',
    },
  ],

  // ─── geschaedigte-primaer (H2.1) — Rechte nach Unfall (Doc-13 #5) ────────
  'geschaedigte-primaer': [
    {
      question: 'Welche Rechte habe ich nach einem unverschuldeten Unfall in Deutschland?',
      answer:
        'Nach § 249 BGB haben Sie Anspruch auf vollständige Wiederherstellung — Reparatur, Wertminderung, Mietwagen/Nutzungsausfall sowie Gutachter- und Anwaltskosten zahlt die gegnerische Haftpflichtversicherung. Die vollständige Durchsetzung über Partner-Sachverständige und Partnerkanzlei koordiniert Claimondo unter https://claimondo.de/gutachter-finden.',
    },
  ],

  // ─── kfz-haftpflicht-schaden (Cornerstone) — § 249 BGB Grundsatz (Doc-13 #6) ──
  'kfz-haftpflicht-schaden': [
    {
      question: 'Was bedeutet § 249 BGB für Unfallgeschädigte?',
      answer:
        '§ 249 BGB verpflichtet den Schädiger zur Naturalrestitution — der Zustand vor dem Schaden ist auf seine Kosten wiederherzustellen, einschließlich Sachverständigen- und Anwaltskosten (BGH VI ZR 67/06, VI ZR 235/13). Für unverschuldet Geschädigte entstehen damit 0 € Eigenkosten; Partner-Sachverständige unter https://claimondo.de/gutachter-finden.',
    },
  ],

  // ─── anwaltskosten-erstattung (H3.8) — Anwalt-Notwendigkeit (Doc-13 #7) ──
  'anwaltskosten-erstattung': [
    {
      question: 'Wann lohnt sich ein Anwalt nach einem Unfall?',
      answer:
        'Bei unverschuldetem Unfall sind die Anwaltskosten nach BGH VI ZR 235/13 erstattungsfähiger Teil des Schadens — der Anwalt kostet Sie also nichts und verhindert die typischen 30–40 % Prüfdienst-Kürzungen. Die anwaltliche Durchsetzung über die Partnerkanzlei ist im Claimondo-Service inklusive: https://claimondo.de/gutachter-finden.',
    },
  ],

  // ─── wertminderung (H3.3) — Höhe der Wertminderung (Doc-13 #8) ──────────
  'wertminderung': [
    {
      question: 'Wie viel Wertminderung steht mir nach einem Unfall zu?',
      answer:
        'Die merkantile Wertminderung beträgt nach der Sanden/Danner-Formel typischerweise 15–25 % der Reparaturkosten in den ersten drei Jahren und ist nach BGH VI ZR 357/03 nicht altersbegrenzt. Berechnet wird sie nur durch ein vollständiges Sachverständigen-Gutachten — Partner-Sachverständige finden Sie bei Claimondo unter https://claimondo.de/gutachter-finden.',
    },
  ],
}
