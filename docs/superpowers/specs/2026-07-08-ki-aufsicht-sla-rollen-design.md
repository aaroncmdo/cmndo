# KI-Aufsicht — SLA/Fristen-Aufsicht pro Rolle (Inkrement 1) — Design-Spec

**Datum:** 2026-07-08
**Branch:** `kitta/ki-aufsicht-sla-rollen` (Worktree, von `origin/staging`)
**Status:** Design — wartet auf Aaron-Review vor writing-plans
**Verwandt:** [[coordination-claim-ai-konsole]] (der Freigabe-Executor + `ai_claim_proposals`-Spine, den die Remediation wiederverwendet) · [[coordination-ai-claim-orchestrator]] (per-Fall-Linse, andere als diese cross-Rollen-Linse)

---

## 1 · Problem & Ziel

Aaron (07.07.): „Sitzt die Claude-Instanz wirklich da, wo sie **alle Rollen überblickt** und Probleme/Unstimmigkeiten sauber **reporten** — und, wenn gewünscht, **eingreifen** kann?"

**Ist-Befund:** Die Claim-AI-Konsole (Ink. 1, live) gibt Claude eine *per-Claim*-Sicht (alle Rollen-Touchpoints EINES Falls) — bewiesen im Prod-Smoke. Aber **keine Operations-Höhe**: kein cross-Claim/cross-Rollen-Blick, reaktiv (nur auf Klick), keine Rollen-Level-Muster. Der Orchestrator (live) scannt autonom *stagnierende Einzelfälle* — auch keine Rollen-Aufsicht.

**Ziel:** Eine **KI-Aufsichts-Schicht** auf Operations-Höhe. Erstes Detektor-Set: **SLA/Fristen-Aufsicht pro Rolle** — Claude überblickt die Fristen-Lage über alle Rollen, priorisiert/erklärt Unstimmigkeiten, und schlägt (freigabe-gated) Remediation vor. Die *Augen*; die operativen Verben aus Ink. 1/2 sind die *Hände*.

## 2 · Ausgangslage (im Code + Prod verifiziert)

Es existiert eine **deterministische SLA-Infrastruktur** — wir bauen darauf, duplizieren nichts:
- `src/lib/sla/tracker.ts` + Tabelle **`sla_tracking`** (`fall_id, claim_id, sla_typ, started_at, breach_at, status ∈ {pending,completed,breached}, eskalation_task_id`). Fristen `SLA_FRIST_MIN`: `gutachter_zuweisung` 30min · `termin_bestaetigung` 60min · `besichtigung` 48h · `gutachten_upload` 24h · `qc_filmcheck` 4h. Cron `checkAndEscalateBreaches()` → markiert Breaches + erzeugt `sla_breach`-Task (kritisch) + Timeline.
- `src/lib/sla/kanzlei-tracker.ts` + `kanzlei-mahnungen.ts` — Kanzlei-seitige SLAs/Mahnungen (Modell bei Plan verifizieren).
- **Prod (08.07.):** `sla_tracking` = 48 Zeilen, 43 breached / 5 pending / **0 completed**, jüngster heute. → befüllt + aktiv; das breached-lastige Muster ist selbst ein Aufsichts-Finding.

**Was fehlt (= der Aufsichts-Mehrwert):** (a) **Rollen-Aggregation** (welche Rolle hängt, wie viele Breaches/impending wo), (b) **Vorwarnung** (nur nach Breach, nicht „gleich fällig"), (c) **Claude-Synthese** (Priorisierung/Erklärung/Vorschlag statt mechanischer Einzel-Task).

## 3 · Kernentscheidung — Ansatz A: deterministische Aggregation + Claude-Synthese

Deterministische Fakten (aus `sla_tracking`) → Claude **urteilt** nur (priorisiert/erklärt/schlägt vor), **erfindet keine Breaches**. Efficient, präzise, halluzinationsarm. (Ansatz B „reines Board ohne Claude" liefert nicht die Aufsicht; Ansatz C „in den Orchestrator" = falsche Linse + Kollision mit `876a45e8` → verworfen.)

## 4 · Architektur (neuer Namespace `src/lib/aufsicht/*`, isoliert)

1. **`sla-rollen.ts`** — Rollen-Attribution + Aggregation. `SLA_ROLLE: Record<SlaTyp, Rolle>` (`gutachter_zuweisung`→dispatch · `termin_bestaetigung`/`besichtigung`/`gutachten_upload`→sachverstaendiger · `qc_filmcheck`→admin · kanzlei-Typen→kanzlei). `buildSlaRollenLage()` liest `sla_tracking` (+ kanzlei) **read-only** → `SlaRollenLage` = pro Rolle `{ breached, impending (breach_at in < X h), pending, kritischste: Claim[] }`. Pure Aggregation testbar; `impending`-Fenster als Konstante.
2. **`synthese.ts`** — Claude-Tool-Use (Batch, non-streaming wie orchestrator `reviewClaim`). Input: `summarizeSlaRollenLage(lage)`. Output: **Aufsichts-Findings** (`schweregrad` info/warnung/kritisch + Begründung + betroffene Rolle) + **freigabe-gated Remediation-Vorschläge** über die bestehenden Verben (`create_task` Nudge/Eskalation · `assign_sv` re-assign · `draft_message` Nachfassen). Persistiert Remediations in `ai_claim_proposals` mit `quelle='aufsicht'`.
3. **Report-Fläche `src/app/admin/ki-aufsicht/`** — **surface-agnostischer Kern-Component** `KiAufsichtPanel`: rendert die Rollen-Lage (pro Rolle Ampel + Zahlen), Drill-down auf die kritischsten Claims, Remediation-Karten (`[Freigeben]`/`[Verwerfen]`, wiederverwendet aus Ink. 1). Eigene Route `/admin/ki-aufsicht` **und** exportierter Component, den die Ops-Cockpit-Lane (`470d55c9`) einbetten kann.
4. **Cadence** — on-demand (Admin öffnet die Fläche → Live-`buildSlaRollenLage` + optional Synthese-Trigger) + **täglicher Cron** `/api/cron/ki-aufsicht-sla` (Synthese + Findings persistieren, damit der Digest da ist, ohne dass jemand klickt).

## 5 · Datenmodell

- **Read-only:** `sla_tracking`, `kanzlei`-SLA-Tabelle(n), `claims` (claim_nummer/rolle-Zuordnung). Kein Write an SLA-Daten.
- **Remediations:** geteilter `ai_claim_proposals`-Spine, **additive** Migration: `quelle`-CHECK um `'aufsicht'` erweitern (aktuell `orchestrator|copilot`). Gleiche Freigabe-Action/UI wie Ink. 1.
- **Rollen-Aggregat:** MVP **live berechnet** (kein neues Table). Snapshot/Trends (`aufsicht_sla_snapshot`) = späteres Increment.
- **AI-Modell:** `src/lib/ai/models.ts` +1 Key `ki_aufsicht: 'claude-sonnet-4-6'` (additiv).

## 6 · Claude-Synthese (Verben + Guardrails)

Tool-Use-Verben (Teilmenge der Ink.-Registry, importiert): `propose_task` (Nudge/Eskalation an die hängende Rolle), `propose_draft_message` (Nachfass-Entwurf), `propose_assign_sv` (Ink. 2, re-assign bei SV-Stau). Findings mit `schweregrad` → Priorisierung, Alarm-Fatigue vermeiden. **DSGVO Art. 22:** jede Aktion freigabe-gated (Admin entscheidet); Aufsicht *meldet + schlägt vor*, führt NIE autonom aus.

## 7 · Sicherheit & Koordination

- Admin-gated (Route + Cron service-role). Remediation freigabe-gated. Read-only auf `sla_tracking`.
- **Isolierter Namespace** `src/lib/aufsicht/*` + `src/app/admin/ki-aufsicht/*` + `src/app/api/cron/ki-aufsicht-sla/`. **Fasst `orchestrator/*`, `ops-cockpit/*`, `sla/*` NICHT an** (nur import/read). Einzige geteilte Edits: `src/lib/ai/models.ts` (+1 Key) + additive `ai_claim_proposals.quelle`-CHECK-Migration.
- **Cockpit-Einbettung** mit `470d55c9` koordinieren (sie betten `KiAufsichtPanel` ein) — Marker `COORDINATION-ki-aufsicht`.

## 8 · Inkremente

- **Ink. 1 (dieses Spec):** SLA-Rollen-Aggregation + Claude-Synthese + Report-Fläche + Cron-Digest + freigabe-gated Remediation. Deckt die getrackten SLAs (dispatch/SV/QC/kanzlei).
- **Ink. 2:** mehr SLA-Coverage (KB-/Makler-Handoff-SLAs neu tracken) + Snapshot/Trends.
- **Ink. 3:** Detektor-Klasse **Handoff-Lücken + stille Fehler**; **Ink. 4:** **Daten-Widersprüche cross-Rolle**. (Die Aufsicht wächst um Detektor-Klassen; Engine/Report/Remediation bleiben.)

## 9 · Testing (TDD)

- `sla-rollen.ts`: Rollen-Attribution-Map (jeder SlaTyp → Rolle); Aggregation (gegebene Zeilen → korrekte breached/impending/pending-Zählung + impending-Fenster-Grenze).
- `synthese.ts`: Tool-Call → Finding/Remediation-Draft (zod), `quelle='aufsicht'`-Persist, kein Auto-Execute.
- Env=node, Module mocken (No-DOM-Lehre aus Ink. 1).

## 10 · Offene Plan-Verifikationen (gegen echte Datei/DB)

1. `kanzlei-tracker`-Modell (Tabelle/Spalten/Fristen) für die Rollen-Aggregation.
2. `ai_claim_proposals.quelle`-CHECK exakt (additive DDL) + `vorschlag_typ`-Set (Ink.-1/2-Verben vorhanden?).
3. Rollen-Attribution `qc_filmcheck` → admin vs. kundenbetreuer (QC-Owner klären).
4. `impending`-Fenster (z. B. 25 % der Frist / feste Stunden) — Default festlegen.
5. Ink.-1-Verb-Registry-Importpfad (`@/lib/claim-ai/verbs`) auf staging.

## 11 · Verifizierte Fakten (08.07.)

- `sla_tracking`: 48 Zeilen (43 breached / 5 pending / 0 completed), aktiv. Spalten + `SlaTyp`/`SLA_FRIST_MIN`/`SLA_LABEL` aus `src/lib/sla/tracker.ts`. `checkAndEscalateBreaches`-Cron existiert.
- `ai_claim_proposals` (aus Ink. 1): `quelle`-CHECK = `orchestrator|copilot` → additiv `aufsicht`. Freigabe-Executor + Verb-Registry aus Ink. 1 (`@/lib/claim-ai/*`) auf staging.
- `logAiUsage`-Sig / Batch-Anthropic-Muster wie orchestrator `run.ts`.
