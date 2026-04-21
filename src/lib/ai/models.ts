// AAR-437: Zentrale Modell-Konfiguration für Claude-API-Aufrufe.
//
// Vollständiger Rollout Nacht-Shift 17./18.04.2026: Alle sechs KI-Features
// nutzen nun diese Config statt hardcoded Modell-Strings. Zukünftige Upgrades
// sind damit ein Ein-Zeilen-Change pro Feature.
//
// Auswahl-Heuristik:
//   Kunden-facing + Speed-kritisch + kurze Antwort → Haiku 4.5
//   Interne Tools + Qualität > Speed + strukturierter Output → Sonnet 4.6
//   Multimodal / komplexe Generierung (SVG/OCR) → Sonnet 4.6

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
  /**
   * AAR-385: Strukturiertes SV-Briefing (kurzversion + hinweise[] +
   * warnungen[] + checkliste_vor_ort[]). JSON-Response-Format erzwungen via
   * System-Prompt. Sonnet 4.6 — Qualität > Speed (Batch beim Fall-Anlegen).
   */
  sv_briefing_struktur: 'claude-sonnet-4-6',
  /**
   * KFZ-143: Pre-Call-Briefing für KB vor Kunden-Call. Strukturierter Output
   * aus Fall + Lead + letzter Bot-Analyse. Sonnet 4.6 — Entscheidungsgrundlage.
   */
  pre_call_briefing: 'claude-sonnet-4-6',
  /**
   * KFZ-143: Post-Call-Analyse nach beendetem Call. Zusammenfassung längerer
   * Transkripte braucht Qualität. Sonnet 4.6.
   */
  post_call_summary: 'claude-sonnet-4-6',
  /**
   * /api/schadenkalkulation: OCR / Multimodal-Analyse von Schadensfotos + Text-
   * Schätzung. Multimodal, Qualität bei Dokumenten-Extraktion wichtig. Sonnet 4.6.
   */
  ocr: 'claude-sonnet-4-6',
  /**
   * KFZ-??: Unfallskizze-SVG-Generator. Komplexe strukturierte Output-Generation
   * (SVG) — Sonnet 4.6 nötig.
   */
  unfallskizze: 'claude-sonnet-4-6',
  /**
   * AAR-420: Logo-Vision-Analyse (Brand-Mood + Font-Kategorie + Primary-Check).
   * Multimodal Sonnet 4.6.
   */
  vision_branding: 'claude-sonnet-4-6',
  /**
   * AAR-104: Claimondo AI Assistant — Fall-Zusammenfassung in der Fallakte.
   * Kunden-Anliegen-Antwort und Fall-Zusammenfassung. Sonnet 4.6.
   */
  fall_assistant: 'claude-sonnet-4-6',
  /**
   * AAR-489 (M7): Makler-Copilot im Akte-Detail. Nutzt vollen Fall-Kontext +
   * Gutachten + Gruppenchat-Auszug + Eskalations-Playbook. User-facing,
   * komplexer Prompt — Sonnet 4.6.
   */
  makler_copilot: 'claude-sonnet-4-6',
  /**
   * AAR-472 (C6): Vision-Analyse der Schadensfotos im Kunden-Flow Schritt 2b.
   * Liefert strukturiertes JSON (beschaedigte_teile, schweregrad, fahrzeug_hinweise).
   * Multimodal → Sonnet 4.6.
   */
  vision_lead: 'claude-sonnet-4-6',
  /**
   * AAR-470 (C4): Struktur-Extraktion aus dem Voice-Transkript im Kunden-Flow
   * Schritt 1. Sonnet 4.6 — deutscher Sprachstil, konservative Null-Felder
   * wenn Info fehlt.
   */
  voice_extract: 'claude-sonnet-4-6',
  /**
   * AAR-518 (S1): Support-Bot fürs Bug/Feature-Widget. 4-Tool-Flow mit
   * Duplikat-Check (search_similar_issues → ask_clarifying_question →
   * comment_on_issue | create_linear_issue). Multimodal (Screenshot) +
   * Qualität der Ticket-Beschreibung wichtig → Sonnet 4.6.
   */
  support_bot: 'claude-sonnet-4-6',
  /**
   * AAR-504/505 (B2+B3): BKat-Inferenz aus Unfallhergang-Text.
   * Klassifiziert Unfall in bkat_unfallart und schlägt 1-3 TBNR-Vorschläge
   * vor. Deutscher Jura-Kontext, strukturierter JSON-Output → Sonnet 4.6.
   */
  bkat_inference: 'claude-sonnet-4-6',
  /**
   * AAR-504 (B2): Polizeibericht-OCR via Claude Vision — extrahiert TBNRs
   * aus gescannten/fotografierten Polizeiberichten. Multimodal-OCR mit
   * Confidence-Handling → Sonnet 4.6.
   */
  bkat_ocr: 'claude-sonnet-4-6',
} as const

export type AiModelKey = keyof typeof AI_MODELS
export type AiModel = (typeof AI_MODELS)[AiModelKey]
