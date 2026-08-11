// AAR-437: Zentrale Modell-Konfiguration für Claude-API-Aufrufe.
//
// Vollständiger Rollout Nacht-Shift 17./18.04.2026: Alle sechs KI-Features
// nutzen nun diese Config statt hardcoded Modell-Strings. Zukünftige Upgrades
// sind damit ein Ein-Zeilen-Change pro Feature.
//
// Modell-Upgrade 29.07.2026: die Sonnet-Use-Cases von 'claude-sonnet-4-6' auf die aktuelle
// Sonnet 5 ('claude-sonnet-5') gehoben — Qualitäts-/Judgment-/Multimodal-Fälle profitieren; die
// kosten-sensitiven bleiben Haiku 4.5, der schwerste Dokument-OCR bleibt Opus 4.8. Zusätzlich
// linkedin_compose aus dem vormals hardcoded compose.ts ins Register gezogen (Konsistenz).
//
// Auswahl-Heuristik:
//   Kunden-facing + Speed-kritisch + kurze Antwort → Haiku 4.5
//   Interne Tools + Qualität > Speed + strukturierter Output → Sonnet 5
//   Multimodal / komplexe Generierung (SVG/OCR) → Sonnet 5

export const AI_MODELS = {
  /** FAQ-Bot Kunde — 2-4 Sätze, Speed kritisch. Haiku 4.5. */
  faq_bot_kunde: 'claude-haiku-4-5-20251001',
  /** FAQ-Bot KB — tiefe Antworten, Qualität wichtiger als Speed. */
  faq_bot_kb: 'claude-sonnet-5',
  /**
   * AAR-445: Fall-Analyse nach Bot-Sessions. JSON-Output, klar strukturierter
   * Input — Haiku 4.5 reicht, günstig und schnell.
   */
  fall_summary: 'claude-haiku-4-5-20251001',
  /**
   * AAR-377: SV-Briefing vor Vor-Ort-Termin. 3-5 Sätze, aus Fall/Lead-Daten
   * zusammengefasst. Sonnet 5 — Qualität und guter deutscher Sprachstil
   * wichtiger als Speed (Batch-Generierung beim Fall-Anlegen).
   */
  sv_briefing: 'claude-sonnet-5',
  /**
   * AAR-385: Strukturiertes SV-Briefing (kurzversion + hinweise[] +
   * warnungen[] + checkliste_vor_ort[]). JSON-Response-Format erzwungen via
   * System-Prompt. Sonnet 5 — Qualität > Speed (Batch beim Fall-Anlegen).
   */
  sv_briefing_struktur: 'claude-sonnet-5',
  /**
   * KI-gefuehrtes /flow-Intake — konversationelle Feststellungs-Erfassung mit
   * Tool-Use (strukturierte Feld-Extraktion). Kunden-facing, aber Qualitaet der
   * Extraktion > Speed -> Struktur-Output-Stufe (wie sv_briefing_struktur).
   */
  flow_intake: 'claude-sonnet-5',
  /**
   * KFZ-143: Pre-Call-Briefing für KB vor Kunden-Call. Strukturierter Output
   * aus Fall + Lead + letzter Bot-Analyse. Sonnet 5 — Entscheidungsgrundlage.
   */
  pre_call_briefing: 'claude-sonnet-5',
  /**
   * KFZ-143: Post-Call-Analyse nach beendetem Call. Zusammenfassung längerer
   * Transkripte braucht Qualität. Sonnet 5.
   */
  post_call_summary: 'claude-sonnet-5',
  /**
   * /api/schadenkalkulation: OCR / Multimodal-Analyse von Schadensfotos + Text-
   * Schätzung. Multimodal, Qualität bei Dokumenten-Extraktion wichtig. Sonnet 5.
   */
  ocr: 'claude-sonnet-5',
  /**
   * Dokument-OCR (Aaron 13.07.): fall_dokumente (Fahrzeugschein/ID/Führerschein/
   * Versicherung/Polizei — api/ocr-trigger, ersetzt Google Vision) + Gutachten-
   * Wert-Extraktion (gutachten-ocr). Opus 4.8 — maximale Extraktions-Genauigkeit
   * bei schwierigen Scans/PDFs; structured outputs erzwingen valides JSON.
   */
  doc_ocr: 'claude-opus-4-8',
  /**
   * KFZ-??: Unfallskizze-SVG-Generator. Komplexe strukturierte Output-Generation
   * (SVG) — Sonnet 5 nötig.
   */
  unfallskizze: 'claude-sonnet-5',
  /**
   * AAR-420: Logo-Vision-Analyse (Brand-Mood + Font-Kategorie + Primary-Check).
   * Multimodal Sonnet 5.
   */
  vision_branding: 'claude-sonnet-5',
  /**
   * AAR-104: Claimondo AI Assistant — Fall-Zusammenfassung in der Fallakte.
   * Kunden-Anliegen-Antwort und Fall-Zusammenfassung. Sonnet 5.
   */
  fall_assistant: 'claude-sonnet-5',
  /**
   * AAR-489 (M7): Makler-Copilot im Akte-Detail. Nutzt vollen Fall-Kontext +
   * Gutachten + Gruppenchat-Auszug + Eskalations-Playbook. User-facing,
   * komplexer Prompt — Sonnet 5.
   */
  makler_copilot: 'claude-sonnet-5',
  /**
   * Werkstatt-Copilot in der Auftrag-Detail (reparatur-/abwicklungs-fokussiert):
   * Reparaturweg/Abrechnung, KVA, Gutachten-Abweichung, Reparaturtermin, Totalschaden.
   * User-facing, komplexer Prompt — Sonnet 5 (analog makler_copilot).
   */
  werkstatt_copilot: 'claude-sonnet-5',
  /**
   * SV-Copilot in der Fallakte (technisch-fachlich): Kalkulation, Wertminderung,
   * Vorschaeden, Nutzungsausfall, Totalschaden/Restwert, BVSK. User-facing,
   * komplexer Prompt — Sonnet 5 (analog makler_copilot).
   */
  gutachter_copilot: 'claude-sonnet-5',
  /**
   * AAR-472 (C6): Vision-Analyse der Schadensfotos im Kunden-Flow Schritt 2b.
   * Liefert strukturiertes JSON (beschaedigte_teile, schweregrad, fahrzeug_hinweise).
   * Multimodal → Sonnet 5.
   */
  vision_lead: 'claude-sonnet-5',
  /**
   * AAR-470 (C4): Struktur-Extraktion aus dem Voice-Transkript im Kunden-Flow
   * Schritt 1. Sonnet 5 — deutscher Sprachstil, konservative Null-Felder
   * wenn Info fehlt.
   */
  voice_extract: 'claude-sonnet-5',
  /**
   * AAR-518 (S1): Support-Bot fürs Bug/Feature-Widget. 4-Tool-Flow mit
   * Duplikat-Check (search_similar_issues → ask_clarifying_question →
   * comment_on_issue | create_linear_issue). Multimodal (Screenshot) +
   * Qualität der Ticket-Beschreibung wichtig → Sonnet 5.
   */
  support_bot: 'claude-sonnet-5',
  /**
   * AAR-504/505 (B2+B3): BKat-Inferenz aus Unfallhergang-Text.
   * Klassifiziert Unfall in bkat_unfallart und schlägt 1-3 TBNR-Vorschläge
   * vor. Deutscher Jura-Kontext, strukturierter JSON-Output → Sonnet 5.
   */
  bkat_inference: 'claude-sonnet-5',
  /**
   * AAR-504 (B2): Polizeibericht-OCR via Claude Vision — extrahiert TBNRs
   * aus gescannten/fotografierten Polizeiberichten. Multimodal-OCR mit
   * Confidence-Handling → Sonnet 5.
   */
  bkat_ocr: 'claude-sonnet-5',
  /**
   * AAR-unfallfotos: Dispatch-Flow Lead-Step-4 — Unfallfotos per WA/SMS/Email
   * beim Kunden angefordert, nach Upload füllt Haiku 4.5 das Feld
   * leads.sachschaden_beschreibung. Nur „was ist am Auto kaputt", KEIN
   * Unfallhergang. Kurze Antwort, Speed + niedrige Kosten → Haiku 4.5.
   */
  vision_schadenbeschreibung: 'claude-haiku-4-5-20251001',
  /**
   * Chat-i18n Phase 2: kunde-facing maschinelle Übersetzung von Human-Freitext-
   * Chatnachrichten (de → Leser-Locale) im Kunde-Chat. Kurze Antwort, lazy +
   * gecacht, Speed + niedrige Kosten dominieren → Haiku 4.5.
   */
  chat_translate: 'claude-haiku-4-5-20251001',
  /**
   * AI-Claim-Orchestrator (Phase-1-PoC): liest Fall-Kontext, schlägt via Tool-Use
   * den nächsten Schritt vor (Shadow-Mode). Judgment > Speed → Sonnet 5.
   */
  claim_orchestrator: 'claude-sonnet-5',
  /**
   * Claim-AI-Konsole: interaktiver Admin-Copilot in der Claim-View (Streaming +
   * Tool-Use). Nutzt vollen Fall-Kontext, schlaegt freigabepflichtige Aktionen vor.
   * Judgment > Speed → Sonnet 5.
   */
  claim_copilot: 'claude-sonnet-5',
  /**
   * KI-Aufsicht SLA-Rollen (Inkrement 1): Batch-Tool-Use ueber alle Rollen-SLAs,
   * schlaegt freigabepflichtige Remediation-Tasks vor (quelle='aufsicht').
   * Judgment ueber mehrere Rollen > Speed → Sonnet 5.
   */
  ki_aufsicht: 'claude-sonnet-5',
  /**
   * KI-Task-Executor: agentische Aufgaben-Ausfuehrung via Tool-Use (planen,
   * bestaetigen, anwenden). Judgment ueber Risikostufen > Speed → Sonnet 5.
   */
  task_executor: 'claude-sonnet-5',
  /**
   * Vertrieb Lead-Website-Enrichment: extrahiert den Ansprechpartner + Kontakt (Email/Telefon)
   * aus Impressum/Kontakt der Firmen-Website. Einfache strukturierte Extraktion aus kurzem
   * Text, kostensensitiv (per-Lead, ggf. Batch) → Haiku 4.5.
   */
  lead_enrichment: 'claude-haiku-4-5-20251001',
  /**
   * Cold-Mailer S1: KI-Generierung von Cold-Mail-Vorlagen (Betreff + HTML-Body) je
   * Lead-Rolle. Deutsche B2B-Vertriebstexte, Qualität > Speed → Sonnet 5.
   */
  cold_mail_compose: 'claude-sonnet-5',
  /**
   * LinkedIn-Post-Generator (linkedin/compose.ts): deutscher B2B-Content für die Claimondo-
   * Unternehmensseite, sachlich-kompetenter Rechts-Ton. Qualität > Speed (Batch, deterministisches
   * Fallback-Template vorhanden) → Sonnet 5. Vormals hardcoded in compose.ts (29.07.2026 ins
   * Register gezogen).
   */
  linkedin_compose: 'claude-sonnet-5',
} as const

export type AiModelKey = keyof typeof AI_MODELS
export type AiModel = (typeof AI_MODELS)[AiModelKey]
