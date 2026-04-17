// AAR-437: Zentrale Modell-Konfiguration für Claude-API-Aufrufe.
//
// Scope dieses Rollouts: nur FAQ-Bot Chat (Kunde + KB). Briefing, Post-Call,
// OCR, Unfallskizze, Vision und Fall-Summary bleiben vorerst unverändert —
// werden in Folge-Tickets einzeln auditiert und umgestellt.
//
// Auswahl-Matrix für FAQ-Bot:
//   Kunde → Haiku 4.5 — 2-4 Sätze, Speed kritisch, günstig.
//   KB    → Sonnet 4.6 — Qualität und Tiefe wichtiger als Speed.

export const AI_MODELS = {
  /** FAQ-Bot Kunde — 2-4 Sätze, Speed kritisch. Haiku 4.5. */
  faq_bot_kunde: 'claude-haiku-4-5-20251001',
  /** FAQ-Bot KB — tiefe Antworten, Qualität wichtiger als Speed. */
  faq_bot_kb: 'claude-sonnet-4-6',
  /**
   * AAR-445: Fall-Analyse nach Bot-Sessions. JSON-Output, klar strukturierter
   * Input — Haiku 4.5 reicht, günstig und schnell.
   */
  fall_summary: 'claude-haiku-4-5-20251001',
  /**
   * AAR-377: SV-Briefing vor Vor-Ort-Termin. 3-5 Sätze, aus Fall/Lead-Daten
   * zusammengefasst. Sonnet 4.6 — Qualität und guter deutscher Sprachstil
   * wichtiger als Speed (Batch-Generierung beim Fall-Anlegen).
   */
  sv_briefing: 'claude-sonnet-4-6',
} as const

export type AiModelKey = keyof typeof AI_MODELS
export type AiModel = (typeof AI_MODELS)[AiModelKey]
