# AI-Redaktions-Loop: DSGVO-Threshold + AI-/Content-Governance (Kurzbewertung)

**Stand:** 2026-07-01 · **Status:** Launch-Gate-Entwurf · **Feature:** AI-generierte /wissen-Artikel (Draft → Pflicht-Review → publish)

> **Hinweis:** Strukturierte Orientierung nach EDPB WP 248 rev.01 + EDPB Opinion 28/2024 (AI). **Keine Rechtsberatung.** Finale Bewertung durch DSB (Art. 35(2)) + qualifizierten Anwalt.

## 1 — Beschreibung der Verarbeitung

- **Zweck:** Claude erstellt Entwürfe für allgemeine Wissens-Artikel zur Kfz-Schadenregulierung; ein Mensch (Aaron) prüft/editiert/gibt frei; nur freigegebene Artikel werden veröffentlicht.
- **Input in die KI:** Themen-Titel + Kurzbrief + Cluster/Keyword (Phase 2: aggregierte Content-Gap-/Keyword-Daten). **Keine personenbezogenen Daten.**
- **Output:** allgemeiner, redaktioneller Rechtscontent (kein Personenbezug).
- **Verantwortlicher:** Claimondo GmbH (DE). **Modell-Anbieter:** Anthropic (Claude, `claude-sonnet-4-6`) als technischer Dienstleister für die Generierung.

## 2 — DSGVO-Art.-35-Threshold

- **Art. 35(3) Pflicht-Trigger:** (a) kein Profiling/keine automatisierte Einzelentscheidung über Personen · (b) keine Art-9/Art-10-Daten · (c) keine Überwachung. → **keiner erfüllt.**
- **EDPB 9 Kriterien:** greifen im Kern **nicht**, weil **keine personenbezogenen Daten** verarbeitet werden (die Kriterien bewerten Risiken für *Betroffene* — hier gibt es keine). Kriterium #8 „innovative Technologie (KI)" ist thematisch berührt, entfaltet ohne Personenbezug aber keine DPIA-Pflicht.
- **EDPB Opinion 28/2024 (AI):** betrifft primär die Verarbeitung **personenbezogener** Trainings-/Inferenzdaten. Hier: Inferenz ohne Personenbezug → nicht einschlägig für eine DSGVO-DPIA.

**→ VERDIKT: Eine DSGVO-Art.-35-DPIA ist für die aktuelle (PII-freie) Ausgestaltung NICHT ausgelöst.** Diese Kurzbewertung dokumentiert den Befund (Art. 35(1) verlangt die *Prüfung* — sie ist hiermit erfolgt) und behandelt das eigentliche Risiko separat (§3).

## 3 — Das reale Risiko: Content-/Rechts-Governance (nicht Datenschutz)

| ID | Risiko | Kategorie | L | S | Level |
|---|---|---|---|---|---|
| C1 | **Halluzinierter/falscher Rechtscontent** (v.a. BGH-Aktenzeichen, Rechtssätze) wird als „Aaron Sprafke" veröffentlicht → irreführt Leser, Haftung | Inhalt/Haftung | 3 | 4 | **Hoch (vor Mitigation)** |
| C2 | **Unerlaubte Rechtsdienstleistung (RDG)** — Content kippt in konkrete Einzelfallberatung | Recht/RDG | 2 | 4 | Mittel |
| C3 | **Byline-Ehrlichkeit** — Artikel firmiert unter Aaron, obwohl KI-verfasst | Vertrauen/Transparenz | 2 | 2 | Niedrig |
| C4 | **Marken-/Qualitätsschaden** durch schwachen oder falschen Artikel | Reputation | 2 | 3 | Mittel |

## 4 — Maßnahmen (✅ gebaut, ⬜ offen)

- ✅ **Kein Auto-Publish** — jeder Artikel `in_review` → menschliche Freigabe. *Die* Kern-Mitigation (→ C1/C2/C4).
- ✅ **Prompt-Härtung** (Smoke-getrieben): §§ Pflicht, BGH-Az nur bei absoluter Sicherheit, sonst Rechtssatz ohne Az. Re-Smoke bestätigt: nur noch korrekte §§, keine geratenen Az → C1 deutlich reduziert.
- ✅ **Reviewer-Pflichthinweis** im DraftEditor: „BGH-Aktenzeichen und Rechtsaussagen vor Freigabe prüfen" → operationalisiert C1 an der Freigabe-Stelle.
- ✅ **RDG-Verbot** im System-Prompt + **Disclaimer** in jedem Artikel („allgemeine Information, keine Rechtsberatung i.S.d. RDG") → C2.
- ✅ **Byline durch Review verdient** (Aaron prüft jeden Artikel) → C3.
- ⬜ **Optionale Transparenz-Zeile** („mit KI-Unterstützung erstellt, redaktionell geprüft") — Aarons Entscheidung → C3.
- ⬜ **Redaktions-Leitfaden** (kurz): was der Reviewer prüft (Zitate, Fakten, RDG-Grenze, Qualität) — analog zum Kommentar-Moderations-Leitfaden.

## 5 — AI Act / FRIA

Das System = Content-Generierungs-Assistent **mit menschlicher Aufsicht und Pflicht-Freigabe**, kein verbotener/hochriskanter Anwendungsfall i.S.d. AI Act (keine Entscheidung über Personen, kein biometrisches/Scoring-System). **FRIA voraussichtlich nicht erforderlich** — finale Einordnung durch Anwalt. Transparenzpflichten für KI-generierte Inhalte (AI Act Art. 50 / künftige Kennzeichnung) im Blick behalten → die optionale Transparenz-Zeile (§4) deckt das proaktiv ab.

## 6 — Re-Assessment-Trigger

Diese Bewertung gilt für die **PII-freie** Ausgestaltung. **Neu bewerten, sobald personenbezogene Daten einfließen**, z.B.: echte Nutzerfragen als Themen-Input, Personalisierung, oder Verknüpfung mit Nutzerprofilen. (Phase-2-Keyword-Daten sind aggregiert/anonym → weiterhin PII-frei.)

## 7 — Empfehlung

1. **DSB/Anwalt** diesen Befund gegenzeichnen (keine volle DPIA für die aktuelle Ausgestaltung; Content-Governance ist der relevante Hebel).
2. **Redaktions-Leitfaden** (kurz) + optionale Transparenz-Entscheidung vor breitem Rollout.
3. Re-Assessment bei PII-Einfluss (§6).
