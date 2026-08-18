// AAR-437: Zentrale Modell-Konfiguration für Claude-API-Aufrufe.
//
// Vollständiger Rollout Nacht-Shift 17./18.04.2026: Alle sechs KI-Features
// nutzen nun diese Config statt hardcoded Modell-Strings. Zukünftige Upgrades
// sind damit ein Ein-Zeilen-Change pro Feature.
//
// Modell-Upgrade 29.07.2026: die Sonnet-Use-Cases von 'claude-sonnet-4-6' auf
// Sonnet 5 gehoben; kosten-sensitive Fälle blieben Haiku 4.5. Zusätzlich
// linkedin_compose aus dem vormals hardcoded compose.ts ins Register gezogen.
//
// ── Vereinheitlichung 18.08.2026 (Aaron): ALLE Use-Cases auf Opus 5 ──────────
//
// Es gibt nur noch EIN Modell. Die frühere Dreiteilung (Haiku 4.5 für Speed,
// Sonnet 5 für Qualität, Opus für schwerste Extraktion) ist aufgehoben —
// Qualität schlägt Latenz und Kosten in jedem Use-Case.
//
// Die fachliche Charakterisierung pro Eintrag ist ABSICHTLICH stehen geblieben
// ("Speed kritisch", "Batch-Generierung", "kostensensitiv"): sie beschreibt die
// Anforderung, nicht das Modell, und ist die Grundlage, falls je wieder
// differenziert werden soll. Die Modell-Nennung ist bewusst entfernt, damit
// Kommentar und Wert nicht auseinanderlaufen.
//
// ⚠ ZWEI KONSEQUENZEN, die beim Ändern eines Call-Sites zu beachten sind:
//
// 1. Opus 5 DENKT standardmässig (adaptive thinking ist an, wenn `thinking`
//    nicht gesetzt ist — anders als Opus 4.8/4.7). Thinking und Antworttext
//    teilen sich `max_tokens`; ein zu enges Budget schneidet die Antwort ab,
//    ohne Fehler zu werfen (`stop_reason: 'max_tokens'` ist das einzige Signal).
//
//    GEMESSEN am 18.08. gegen ein echtes 24-seitiges Gutachten-PDF, damit die
//    Budgets nicht auf Vermutung beruhen:
//      • Komplexe Aufgabe (Gutachten-Extraktion, 37 Felder): 754 → 1515
//        Output-Tokens, also gut das Doppelte gegenüber Sonnet 5 — bei
//        max_tokens=2048 sind das 74 % Auslastung.
//      • Einfache Aufgabe (kurze JSON-Extraktion aus Impressums-Text): 53 Tokens
//        auf BEIDEN Modellen, identisch, auch bei max_tokens=200. Adaptive
//        Thinking heisst wörtlich adaptiv — bei trivialen Aufgaben denkt Opus 5
//        gar nicht.
//
//    Die engen Budgets im Repo (200–800, z.B. zustand-foto-qualitaet,
//    schadenbild-gewerke, lead-website-enrichment) bleiben deshalb bewusst
//    unverändert: ihre Aufgaben sind einfach, ein pauschales Anheben wäre eine
//    Änderung ohne belegten Nutzen. Wer ein NEUES Feature mit komplexer
//    Extraktion baut, dimensioniert grosszügig und prüft `stop_reason`.
// 2. `temperature` / `top_p` / `top_k` werden von Opus 5 mit HTTP 400
//    abgelehnt. Keiner unserer Anthropic-Calls setzte sie (geprüft 18.08.) —
//    also nicht neu einführen.
//
// Latenz/Kosten: die vormaligen Haiku-Fälle (FAQ-Bot Kunde, Chat-Übersetzung,
// Unfallfoto-Beschreibung, Lead-Enrichment) werden spürbar langsamer und
// teurer. Das ist die bewusste Abwägung dieser Entscheidung.

export const AI_MODELS = {
  /** FAQ-Bot Kunde — 2-4 Sätze, Speed kritisch. */
  faq_bot_kunde: 'claude-opus-5',
  /** FAQ-Bot KB — tiefe Antworten, Qualität wichtiger als Speed. */
  faq_bot_kb: 'claude-opus-5',
  /**
   * AAR-445: Fall-Analyse nach Bot-Sessions. JSON-Output, klar strukturierter
   * Input.
   */
  fall_summary: 'claude-opus-5',
  /**
   * AAR-377: SV-Briefing vor Vor-Ort-Termin. 3-5 Sätze, aus Fall/Lead-Daten
   * zusammengefasst. Qualität und guter deutscher Sprachstil wichtiger als
   * Speed (Batch-Generierung beim Fall-Anlegen).
   */
  sv_briefing: 'claude-opus-5',
  /**
   * AAR-385: Strukturiertes SV-Briefing (kurzversion + hinweise[] +
   * warnungen[] + checkliste_vor_ort[]). JSON-Response-Format erzwungen via
   * System-Prompt. Qualität > Speed (Batch beim Fall-Anlegen).
   */
  sv_briefing_struktur: 'claude-opus-5',
  /**
   * KI-gefuehrtes /flow-Intake — konversationelle Feststellungs-Erfassung mit
   * Tool-Use (strukturierte Feld-Extraktion). Kunden-facing, aber Qualitaet der
   * Extraktion > Speed.
   */
  flow_intake: 'claude-opus-5',
  /**
   * KFZ-143: Pre-Call-Briefing für KB vor Kunden-Call. Strukturierter Output
   * aus Fall + Lead + letzter Bot-Analyse. Entscheidungsgrundlage.
   */
  pre_call_briefing: 'claude-opus-5',
  /**
   * KFZ-143: Post-Call-Analyse nach beendetem Call. Zusammenfassung längerer
   * Transkripte braucht Qualität.
   */
  post_call_summary: 'claude-opus-5',
  /**
   * /api/schadenkalkulation + Beleg-OCR (lib/ocr-beleg): Multimodal-Analyse von
   * Schadensfotos und Belegen. Qualität bei Dokumenten-Extraktion wichtig.
   */
  ocr: 'claude-opus-5',
  /**
   * Dokument-OCR (Aaron 13.07.): fall_dokumente (Fahrzeugschein/ID/
   * Fuehrerschein/Versicherung/Polizei — api/ocr-trigger, ersetzt Google
   * Vision) + die Gutachten-Wert-Extraktion (lib/ai/gutachten-ocr, seit E3b
   * 13.08. ueber `messages.parse` mit Structured Outputs). Schwierige Scans
   * und PDFs — hoechste Extraktions-Genauigkeit noetig.
   */
  doc_ocr: 'claude-opus-5',
  /**
   * KFZ-??: Unfallskizze-SVG-Generator. Komplexe strukturierte Output-
   * Generation (SVG).
   */
  unfallskizze: 'claude-opus-5',
  /**
   * AAR-420: Logo-Vision-Analyse (Brand-Mood + Font-Kategorie + Primary-Check).
   * Multimodal.
   */
  vision_branding: 'claude-opus-5',
  /**
   * AAR-104: Claimondo AI Assistant — Fall-Zusammenfassung in der Fallakte.
   * Kunden-Anliegen-Antwort und Fall-Zusammenfassung.
   */
  fall_assistant: 'claude-opus-5',
  /**
   * AAR-489 (M7): Makler-Copilot im Akte-Detail. Nutzt vollen Fall-Kontext +
   * Gutachten + Gruppenchat-Auszug + Eskalations-Playbook. User-facing,
   * komplexer Prompt.
   */
  makler_copilot: 'claude-opus-5',
  /**
   * Werkstatt-Copilot in der Auftrag-Detail (reparatur-/abwicklungs-fokussiert):
   * Reparaturweg/Abrechnung, KVA, Gutachten-Abweichung, Reparaturtermin, Totalschaden.
   * User-facing, komplexer Prompt.
   */
  werkstatt_copilot: 'claude-opus-5',
  /**
   * SV-Copilot in der Fallakte (technisch-fachlich): Kalkulation, Wertminderung,
   * Vorschaeden, Nutzungsausfall, Totalschaden/Restwert, BVSK. User-facing,
   * komplexer Prompt.
   */
  gutachter_copilot: 'claude-opus-5',
  /**
   * AAR-472 (C6): Vision-Analyse der Schadensfotos im Kunden-Flow Schritt 2b.
   * Liefert strukturiertes JSON (beschaedigte_teile, schweregrad, fahrzeug_hinweise).
   * Multimodal.
   */
  vision_lead: 'claude-opus-5',
  /**
   * AAR-470 (C4): Struktur-Extraktion aus dem Voice-Transkript im Kunden-Flow
   * Schritt 1. Deutscher Sprachstil, konservative Null-Felder wenn Info fehlt.
   */
  voice_extract: 'claude-opus-5',
  /**
   * AAR-518 (S1): Support-Bot fürs Bug/Feature-Widget. 4-Tool-Flow mit
   * Duplikat-Check (search_similar_issues → ask_clarifying_question →
   * comment_on_issue | create_linear_issue). Multimodal (Screenshot) +
   * Qualität der Ticket-Beschreibung wichtig.
   */
  support_bot: 'claude-opus-5',
  /**
   * AAR-504/505 (B2+B3): BKat-Inferenz aus Unfallhergang-Text.
   * Klassifiziert Unfall in bkat_unfallart und schlägt 1-3 TBNR-Vorschläge
   * vor. Deutscher Jura-Kontext, strukturierter JSON-Output.
   */
  bkat_inference: 'claude-opus-5',
  /**
   * AAR-504 (B2): Polizeibericht-OCR via Claude Vision — extrahiert TBNRs
   * aus gescannten/fotografierten Polizeiberichten. Multimodal-OCR mit
   * Confidence-Handling.
   */
  bkat_ocr: 'claude-opus-5',
  /**
   * AAR-unfallfotos: Dispatch-Flow Lead-Step-4 — Unfallfotos per WA/SMS/Email
   * beim Kunden angefordert, nach Upload wird leads.sachschaden_beschreibung
   * gefüllt. Nur „was ist am Auto kaputt", KEIN Unfallhergang. Kurze Antwort.
   */
  vision_schadenbeschreibung: 'claude-opus-5',
  /**
   * Chat-i18n Phase 2: kunde-facing maschinelle Übersetzung von Human-Freitext-
   * Chatnachrichten (de → Leser-Locale) im Kunde-Chat. Kurze Antwort, lazy +
   * gecacht.
   */
  chat_translate: 'claude-opus-5',
  /**
   * AI-Claim-Orchestrator (Phase-1-PoC): liest Fall-Kontext, schlägt via Tool-Use
   * den nächsten Schritt vor (Shadow-Mode). Judgment > Speed.
   */
  claim_orchestrator: 'claude-opus-5',
  /**
   * Claim-AI-Konsole: interaktiver Admin-Copilot in der Claim-View (Streaming +
   * Tool-Use). Nutzt vollen Fall-Kontext, schlaegt freigabepflichtige Aktionen vor.
   * Judgment > Speed.
   */
  claim_copilot: 'claude-opus-5',
  /**
   * KI-Aufsicht SLA-Rollen (Inkrement 1): Batch-Tool-Use ueber alle Rollen-SLAs,
   * schlaegt freigabepflichtige Remediation-Tasks vor (quelle='aufsicht').
   * Judgment ueber mehrere Rollen > Speed.
   */
  ki_aufsicht: 'claude-opus-5',
  /**
   * KI-Task-Executor: agentische Aufgaben-Ausfuehrung via Tool-Use (planen,
   * bestaetigen, anwenden). Judgment ueber Risikostufen > Speed.
   */
  task_executor: 'claude-opus-5',
  /**
   * Vertrieb Lead-Website-Enrichment: extrahiert den Ansprechpartner + Kontakt (Email/Telefon)
   * aus Impressum/Kontakt der Firmen-Website. Einfache strukturierte Extraktion aus kurzem
   * Text, kostensensitiv (per-Lead, ggf. Batch).
   */
  lead_enrichment: 'claude-opus-5',
  /**
   * Cold-Mailer S1: KI-Generierung von Cold-Mail-Vorlagen (Betreff + HTML-Body) je
   * Lead-Rolle. Deutsche B2B-Vertriebstexte, Qualität > Speed.
   */
  cold_mail_compose: 'claude-opus-5',
  /**
   * LinkedIn-Post-Generator (linkedin/compose.ts): deutscher B2B-Content für die Claimondo-
   * Unternehmensseite, sachlich-kompetenter Rechts-Ton. Qualität > Speed (Batch, deterministisches
   * Fallback-Template vorhanden). Vormals hardcoded in compose.ts (29.07.2026 ins
   * Register gezogen).
   */
  linkedin_compose: 'claude-opus-5',
} as const

export type AiModelKey = keyof typeof AI_MODELS
export type AiModel = (typeof AI_MODELS)[AiModelKey]
