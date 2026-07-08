# Claim-AI Voll-Konvergenz — Design (Co-Design-Proposal)

**Datum:** 2026-07-08
**Status:** **Design-Proposal (SP2) — „Vordenken".** Co-Design mit ad4c0df0 (ownt Konsole + KI-Aufsicht). **Bau deferred, bis KI-Aufsicht (#3897) live + geprüft ist** — nicht auf wackelndem Fundament.
**Autor:** Session 876a45e8 (Orchestrator/Precision). Aaron-Wahl 08.07.: „Voll-Konvergenz".
**Verwandt:** [[coordination-orchestrator-precision-pass]] (autonom) · [[coordination-claim-ai-konsole]] (interaktiv) · [[coordination-ki-aufsicht]] (cross-Rollen) · [[coordination-claim-ai-central-ownership]] (Lane-Aufteilung + Invarianten).

---

## 1 · Vision & Motivation

Es existieren drei Claim-AI-Ebenen auf demselben Spine `ai_claim_proposals`:

| Ebene | Trigger | Kontext-Linse | Quelle | Fläche |
|---|---|---|---|---|
| **Orchestrator** (autonom) | Cron (Stagnation/Risiko) | per-Claim | `orchestrator` | `/admin/ai-vorschlaege` |
| **Konsole** (interaktiv) | Admin-Chat in-Claim | per-Claim + Konversation | `copilot` | In-Claim-Panel `/faelle/[id]` |
| **KI-Aufsicht** (cross-Rollen) | Cron (SLA-Scan) | cross-Rollen-Aggregat | `aufsicht` | `/admin/ki-aufsicht` |

Sie teilen bereits: den **Spine** (`quelle`-Discriminator), den **Executor** (`buildTaskFromProposal`/`decideProposal`, jetzt owner-routed), die **4 Invarianten**. Aber die **Mitte ist dreifach dupliziert** (drei Claude-Call-Sites, drei Verb-Registries, drei Freigabe-Executor) und die **Fläche dreifach getrennt** (ein Admin muss drei Orte prüfen).

**Ziel:** Eine **Claim-AI-Engine** (ein Kern) + ein **Claim-AI-Cockpit** (eine Fläche), gefüttert von den drei distinkten Eingängen. Die Kulmination der Ursprungs-Vision („Claude als treibende Kraft, ein Modell das Tasks an Rollen steuert, Admins steuern mehr"): *ein* Ort, an dem der Mensch die gesamte KI-Arbeit am Fall überblickt + freigibt.

## 2 · Was dupliziert vs. was legitim verschieden ist

**Dupliziert (→ vereinheitlichen):**
- **Claude-Call-Mechanik:** `orchestrator/run.ts` (reviewClaim) · `api/admin/claim-copilot/route.ts` · `aufsicht/synthese.ts` — alle: Anthropic-Client → `messages.create({model, system, tools, messages})` → Tool-Use extrahieren → Zod-validieren → `logAiUsage` → persistieren. Identische Mechanik.
- **Verb-Registry:** orchestrator `propose_task/flag_escalation/suggest_next_step` · konsole `create_task/draft_message/add_note` · aufsicht `propose_sla_task`. Konzeptionell überlappend, drei getrennte Zod-Sets.
- **Freigabe-Executor:** `annehmenVorschlag` (orchestrator, nur task) · `freigebenClaimAiVorschlag` (konsole, hybrid: task/add_note/draft_message) · `freigebenAufsichtVorschlag` (aufsicht, nur task). Der Konsolen-Hybrid ist der vollständigste.

**Legitim verschieden (→ als distinkte Kanten behalten):** die **Trigger** (Cron-Stagnation / Chat / Cron-SLA), die **Kontext-Linsen** (per-Claim / interaktiv / cross-Rollen), und die **UX-Linsen** im Cockpit (eine Chat-Ansicht ist keine SLA-Dashboard-Ansicht). Diese zu mergen wäre Über-Merge.

## 3 · Ziel-Architektur

```
  ┌─ Eingang: Autonom (Cron-Stagnation/Risiko) ─┐
  ├─ Eingang: Interaktiv (Admin-Chat in-Claim) ─┤   jeder liefert Kontext + Verb-Subset
  └─ Eingang: Aufsicht (Cron-SLA-Scan) ─────────┘
                     │
                     ▼
          ┌──────────────────────────┐
          │   CLAIM-AI-ENGINE (Kern)  │
          │  · callForProposals()     │  ← ein Anthropic-Call-Mechanismus
          │  · kanonische Verb-Registry│  ← ein Zod-Set aller Verben
          │  · freigebenVorschlag()   │  ← ein Executor, kann alle Verben
          └──────────────────────────┘
                     │ ai_claim_proposals (quelle-Discriminator bleibt)
                     ▼
          ┌──────────────────────────┐
          │   CLAIM-AI-COCKPIT (Fläche)│  ← eine Review-/Freigabe-Fläche
          │  Linsen-Ansichten: autonom │     (Quelle/Rolle/Fall-Filter),
          │  · interaktiv · aufsicht   │     ein Freigabe-Flow überall
          └──────────────────────────┘
```

### 3.1 Die Claim-AI-Engine (Kern)

**`src/lib/claim-ai/engine/*`** (neuer geteilter Namespace):

- **`callForProposals(input): Promise<ProposalDraft[]>`** — `input = { context: string; tools: Anthropic.Tool[]; system: string; model: keyof AI_MODELS; maxTokens?: number; fallId?: string }`. Kapselt: Anthropic-Client-Konstruktor (im try), `messages.create`, `extractDraftsFromToolUse` + `validateToolCall` (Zod), `logAiUsage` (non-critical), Fehler → `[]` (wirft nie). **Ersetzt die drei identischen Call-Blöcke.**
- **`CANONICAL_VERBS`** — ein Zod-validiertes Registry aller Aktions-Verben mit einer `verb → { schema, kind, executorFn }`-Mapping-Tabelle. Verben: `propose_task` · `flag_escalation` · `suggest_next_step` · `draft_message` · `add_note` · `assign_sv` (Ink.2) · erweiterbar (`set_status`/`request_document`). Jeder Eingang wählt sein Subset (Orchestrator: task/escalation/next_step; Konsole: alle Aktions-Verben; Aufsicht: task).
- **`freigebenVorschlag(proposalId, opts): Promise<{ok; error?}>`** — der **eine Executor**. Lädt den Vorschlag, dispatcht per `kind`: `task` → owner-routed `buildTaskFromProposal` · `draft_message` → nur Entwurf setzen (2. Klick = `sendeEntwurf`) · `add_note` → `logFallEvent` · `assign_sv` → SV-Zuweisung. Wahrt alle 4 Invarianten. **Basis = der Konsolen-Hybrid-Executor** (`freigebenClaimAiVorschlag`, der vollständigste) — dorthin generalisiert, nicht neu erfunden.

### 3.2 Die drei Eingänge (bleiben distinkt, rufen die Engine)

- **Autonom:** `orchestrator/run.ts reviewClaim` → baut per-Claim-Kontext (buildClaimContext, Precision-Pass-Hygiene + Risk-Signale) → `callForProposals({context, tools: [task,escalation,next_step], system: ORCHESTRATOR_SYSTEM})` → persist `quelle='orchestrator'`.
- **Interaktiv:** `api/admin/claim-copilot/route.ts` → per-Claim + Konversations-Kontext → `callForProposals` (streaming-Variante) → persist `quelle='copilot'`.
- **Aufsicht:** `aufsicht/synthese.ts` → cross-Rollen-SlaRollenLage-Kontext → `callForProposals({tools: [propose_sla_task→task]})` → persist `quelle='aufsicht'`.

### 3.3 Das Claim-AI-Cockpit (eine Fläche)

**`src/app/admin/claim-ai/*`** — ein Cockpit zeigt *alle* offenen Vorschläge/Aktionen, mit:
- **Linsen-Ansichten** (Tabs/Filter, nicht separate Apps): „Autonom" (quelle=orchestrator, cross-Claim-Queue) · „Aufsicht" (quelle=aufsicht, cross-Rollen-Ampel) · „Interaktiv/In-Claim" (Chat + per-Claim). Filter nach Quelle/Rolle/Fall.
- **Ein Review-/Freigabe-Flow** (owner-routed Task-Freigabe · 2-stufiger Outbound · Reject-Grund-Chips) — überall gleich, via `freigebenVorschlag`.
- Der **Chat** bleibt Eingang (In-Claim ODER als Panel im Cockpit).
- Die drei heutigen Flächen (`/admin/ai-vorschlaege`, In-Claim-Panel, `/admin/ki-aufsicht`) konvergieren hinein — **Legacy-Redirects** (kein Bookmark bricht).

## 4 · Invarianten (aus der Konsolen-Absorption — bleiben zwingend)

1. **ID-Dualität** `claim_id` vs `fall_id` explizit (Executor).
2. **`quelle`-Filter = Sicherheitsleitplanke** — Reader nach Quelle scopen (Cockpit-Linsen filtern quelle; Auto-Graduierungs-Quote nur `orchestrator`, s. #3886).
3. **Outbound immer 2-stufig** (DSGVO Art. 22) — `draft_message`-Freigabe setzt nur Entwurf; Senden = separater 2. Klick mit Doppel-Send-Guard.
4. **Auto-Graduierung nur `quelle='orchestrator'`** — der Cron-Auto-Pfad greift nie Copilot-/Aufsicht-Vorschläge.

## 5 · Phasierung (non-breaking, inkrementell)

- **P1 — Engine extrahieren** (`claim-ai/engine/*`: callForProposals + CANONICAL_VERBS + freigebenVorschlag). **Additiv** — noch kein Consumer umgestellt, keine Ebene bricht. *(Owner: 876a45e8)*
- **P2 — Orchestrator adoptiert** die Engine (run.ts + annehmenVorschlag → callForProposals + freigebenVorschlag). Verhalten byte-gleich, TDD-gesichert. *(Owner: 876a45e8)*
- **P3 — Konsole adoptiert** (route.ts + freigebenClaimAiVorschlag → Engine). *(Owner: ad4c0df0, co-designed)*
- **P4 — Aufsicht adoptiert** (synthese.ts + freigebenAufsichtVorschlag → Engine). *(Owner: ad4c0df0, co-designed)*
- **P5 — Cockpit** (`/admin/claim-ai` mit Linsen-Ansichten + Legacy-Redirects). *(gemeinsam)*

Jede Phase ist eigenständig shippbar + prod-verifizierbar (bis 1+). Nach jeder Phase laufen die drei Ebenen weiter.

## 6 · Risiken & Leitplanken

- **Regression an frisch-geshippten Live-Ebenen** → strikte Byte-Gleichheit je Adoptions-Phase (TDD: alte + neue Engine erzeugen denselben Vorschlag/Task), Phasen einzeln geshippt + prod-verifiziert.
- **Über-Merge der Linsen** → das Cockpit behält getrennte Ansichten je Linse (Chat ≠ SLA-Dashboard). Nicht eine generische Liste erzwingen.
- **Koordinations-Kollision** → jede Ebene wird von ihrem Owner adoptiert (nicht ein Session refactort fremden Code); die Engine (P1) ist additiv + wird gemeinsam reviewt.
- **Timing** → Start erst nach KI-Aufsicht-Live (sonst konvergieren wir eine noch nicht stabile Ebene).

## 7 · Koordination / Ownership

- **876a45e8 (diese Session):** Engine (P1) + Orchestrator-Adoption (P2).
- **ad4c0df0:** Konsole (P3) + Aufsicht (P4) — co-designed; die Engine-Interfaces werden vor P3/P4 gemeinsam finalisiert.
- **P5 Cockpit:** gemeinsam (UX + Linsen-Ansichten).
- **⚠ Berührt ad4c0df0s Live-Code stark** → dieses Proposal ist ein **Co-Design-Start**, kein Alleingang-Spec. Vor jedem Bau: Interface-Review mit ad4c0df0.

## 8 · Offene Fragen fürs Co-Design (mit ad4c0df0)

1. **Streaming vs. Batch** in `callForProposals`: der Copilot streamt (route.ts), Orchestrator/Aufsicht sind Batch. → Engine mit optionalem Streaming-Modus, oder zwei Einstiege (`callForProposals` / `streamForProposals`) mit geteiltem Extraktions-/Persist-Kern?
2. **Verb-Namen-Reconcile:** `propose_task`/`create_task`/`propose_sla_task` → ein kanonischer Name (`propose_task`?) + Alias-Map für Bestand, oder Migration der Prompts?
3. **Cockpit-Scope P5:** ersetzt es die 3 Flächen (Redirects) oder ergänzt es sie zunächst additiv (sanfter)?
4. **`ki_gespraeche`** (Konsolen-Chat-Persistenz): bleibt Konsolen-lokal oder wandert in den Engine-/Cockpit-Kern?
5. **Reihenfolge P3/P4:** welche Ebene adoptiert zuerst (Aufsicht ist am jüngsten → evtl. erst stabilisieren)?
