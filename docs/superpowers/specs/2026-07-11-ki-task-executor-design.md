# KI-Task-Executor — Admin/KB-Aufgaben per Klick von der KI ausführen lassen

**Datum:** 2026-07-11
**Status:** Design freigegeben (Brainstorming abgeschlossen), bereit für Umsetzungsplan
**Branch:** `kitta/ki-task-executor` (Worktree off `staging`, tip `51053a3e2`)
**DB:** eine additive Migration (`ai_task_executions`), via Supabase-Plugin (Regel 2)

## Motivation

Auf `staging` läuft bereits ein **AI-Claim-Orchestrator**: ein Cron reviewt stagnierende
Claims (Anthropic Tool-Use), schreibt `ai_claim_proposals` (Shadow-Mode), ein Admin nimmt sie
unter `/admin/ai-vorschlaege` an → `buildTaskFromProposal()` erzeugt **genau einen echten Task**.
Phase 2 graduiert bewährte `(vorschlag_typ, ziel_rolle)`-Paare zu `auto` (Cron legt den Task
selbst an, Rate-Cap + Auto-Revert).

Diese Pipeline endet heute bei **„ein Mensch hat eine Aufgabe zu tun"**. Der Wunsch (Aaron,
2026-07-11):

- KI-Vorschläge bleiben **konvertierbar** zu echten Aufgaben → ✅ bleibt unangetastet
  (`buildTaskFromProposal`).
- **Alle KI-fähigen** echten Aufgaben sollen per Klick **von der KI ausgeführt** werden → 🆕
  **die fehlende zweite Hälfte**.

Der Kreis schließt sich zu: **KI schlägt vor → Task → KI führt aus → erledigt**, mit
Mensch-Eingriff an beiden Toren. Die vorhandene Graduierungs-Philosophie (Phase 1 manuell →
Phase 2 autonom) überträgt sich 1:1 auf die *Ausführung* (P3, Nicht-Ziel jetzt).

## Entscheidungen (aus dem Brainstorming, fix)

1. **Hybrid nach Risiko.** Jedes Executor-Tool trägt eine Risiko-Klasse. *Safe*-Aktionen
   (interne Notiz, Timeline, Task schließen) laufen sofort; *consequential*-Aktionen
   (Outbound-Kommunikation an Kunde, Statuswechsel, SV-Zuweisung) brauchen eine Bestätigung.
2. **Nur KI-fähige Task-Typen.** Eine **Playbook-Registry** (`task_typ → Playbook`) gatet, wo
   der Button erscheint. Kein Playbook → kein Button (z.B. `filmcheck`, `sonstiges`).
3. **Gebundener KI-Agent.** Anthropic Tool-Use, aber **nur** mit den Tools, die das Playbook
   erlaubt. Das LLM plant den Ablauf und komponiert die Inhalte (exakter Nachrichtentext,
   Ziel-Status); ein deterministischer Wrapper erzwingt Sofort-vs-Bestätigen.
4. **Gating auf Plan-Ebene (v1-Vereinfachung).** Enthält der Plan **≥1** consequential-Aktion,
   wartet der **ganze** Plan auf **eine** Bestätigung (keine halb-angewandten Seiteneffekte vor
   dem Klick). Reine Safe-Pläne laufen instant (echt ein Klick). Schritt-granulares Gating ist
   später nachrüstbar (P3).
5. **Engine-Reuse statt Parallel-Stack.** Der Executor ist ein **neuer Consumer** der
   geteilten `claim-ai/engine` — kein neuer Agent-Loop, kein zweiter Anthropic-Wrapper.
6. **Audit-Spine.** Jede Ausführung wird in `ai_task_executions` + Claim-Timeline (actor=KI)
   protokolliert — Basis für spätere Graduierung.

## Ausgangslage (verifiziert auf `staging`)

Die geteilte **`claim-ai/engine`** ist explizit für mehrere Konsumenten gebaut
(Orchestrator/Copilot/Aufsicht/Konsole „wählen ihr Verb-Subset"):

- `src/lib/claim-ai/engine/verbs.ts` — `VerbDefinition<T> = { name, tool, validate }`,
  `toolsFrom(verbs)`, `validateVerb(verbs, name, input)`. Generisch über den Draft-Typ `T`.
- `src/lib/claim-ai/engine/call.ts` — `callForProposals<T>({ model, system, tools, userContent,
  extract, logEndpoint, logFallId })`: **Single-Turn** Tool-Use-Call (Client-im-try,
  Usage-Log non-critical, Fehler→`[]`). `streamForProposals` als Streaming-Geschwister.
- `src/lib/orchestrator/tools.ts` — `ORCHESTRATOR_VERBS` (`propose_task`/`flag_escalation`/
  `suggest_next_step`) als `VerbDefinition<ProposalDraft>` — die **Vorlage** für unsere Verben.
- `src/lib/orchestrator/run.ts` — `reviewClaim(ctx)`: nutzt `callForProposals`, extrahiert
  Drafts aus `tool_use`-Blöcken, persistiert. **Genau das Muster**, das wir für Ausführung
  spiegeln — nur mit seiteneffekt-tragenden Verben.
- `src/lib/orchestrator/context.ts` — `buildClaimContext` / `summarizeClaimForPrompt` (kompakter
  prompt-tauglicher Fall-Kontext aus Basis-Tabellen, service_role-lesbar). **Wiederverwenden.**
- `src/lib/orchestrator/policy.ts` — `getAutoMode` / `isAutoEligible` / `isKillSwitchOn`
  (Graduierung + Kill-Switch). Für P3 relevant; Kill-Switch-Muster jetzt schon adaptieren.
- `src/lib/orchestrator/task-from-proposal.ts` — `buildTaskFromProposal` (Proposal→Task, bleibt).
- `src/lib/ai/models.ts` — `AI_MODELS` (zentrale Modell-Zuordnung). Neuer Key `task_executor`.

Wiederverwendbare Aktions-Funktionen (Apply-Layer):

- `src/lib/communications/send-fall.ts` — `sendFallCommunication(fallId, trigger, …)` (Outbound).
- `src/lib/faelle/state-machine.ts` — `transitionFallStatus(fallId, newStatus, meta?)` (Status +
  Folge-Effekte).
- `src/lib/dispatch/findBestSV.ts` — `findBestSV(input)` (SV-Matching, read-only) + SV-Zuweisung
  (`/api/sv-zuweisung` bzw. der dahinterliegende Helper).
- `src/lib/tasks/update-status-core.ts` — `updateTaskStatusCore()` (Task-Status + Gates + Reminder).
- Timeline/Mitteilung — `src/lib/mitteilungen/*`, Claim-Timeline (`v_claim_timeline`).

Task-Flächen (Button-Einbau):

- `src/app/admin/tasks/KanbanBoard.tsx` — Admin-Kanban (P1).
- `src/app/admin/meine-tasks/MyTasksClient.tsx` — Admin+KB „Meine Tasks" (P2).
- `src/app/mitarbeiter/tasks/page.tsx` — KB-Portal-Liste (P2).

## Zielarchitektur

### A · `ActionVerb` — Engine-Erweiterung per Intersection

Der Executor-Verb-Typ erweitert `VerbDefinition` um **Risiko** + **Apply** — `toolsFrom` und
`validateVerb` bleiben unverändert nutzbar (sie lesen nur `name`/`tool`/`validate`):

```ts
type Risk = 'safe' | 'consequential'

type ActionDraft = { verb: string; args: Record<string, unknown>; begruendung?: string }

type ActionVerb = VerbDefinition<ActionDraft> & {
  risk: Risk
  apply: (draft: ActionDraft, ctx: ExecCtx) => Promise<ActionResult>
}

type ExecCtx = { db: SupabaseAdmin; claimId: string; fallId: string | null; task: TaskRow; userId: string }
type ActionResult = { ok: boolean; detail?: string; error?: string }
```

`validate` liefert `{ ok: true, draft: { verb: name, args, begruendung } }` — der Draft trägt den
Verb-Namen, damit Risk + Apply nach der Extraktion auffindbar sind.

### B · Flow — Plan → Apply/Confirm (kein zweiter LLM-Call)

```
Klick "Per KI erledigen" (Task mit Playbook)
  └─ starteKiAusfuehrung(taskId)                     [Server-Action, requireAdmin/KB + RLS-Check]
       ├─ ctx = buildClaimContext(claimId)           [reuse Orchestrator]
       ├─ playbook = playbookForTask(task)
       ├─ drafts = callForProposals({                [Single-Turn, tools = toolsFrom(playbook.verbs)]
       │     model: AI_MODELS.task_executor,
       │     system: playbook.system (+ guardrails, cache_control),
       │     userContent: summarizeClaimForPrompt(ctx) + Task-Beschreibung,
       │     extract: extractActions(playbook.verbs),
       │  })
       ├─ plan = buildPlan(drafts, playbook)          [Risk klassifizieren; schliessen als letzte]
       ├─ Persist ai_task_executions (plan, modell, gestartet_von, begruendung)
       └─ if plan hat 0 consequential:
              applyPlan(plan, ctx) → status=ausgefuehrt → Task erledigt → Timeline   ← ein Klick
          else:
              status=warte_bestaetigung → UI zeigt Vorschau (Drawer)

Klick "Bestätigen & ausführen"
  └─ bestaetigeKiAusfuehrung(execId)                  [Server-Action, gleiche Guards]
       └─ applyPlan(plan, ctx) → status=ausgefuehrt → Task erledigt → Timeline
          (Args liegen im gespeicherten Plan — KEIN erneuter LLM-Call)

Klick "Abbrechen"
  └─ brichAbKiAusfuehrung(execId) → status=abgebrochen
```

`applyPlan` führt die Aktionen **in Reihenfolge** aus (`schliessen` immer zuletzt, erst nachdem
alle anderen ok sind); bei Fehler → `status=fehler`, Stop, kein weiterer Schritt, Task bleibt offen.
`extractActions` spiegelt `extractProposalsFromToolUse` (unbekannte/ungültige Verben still
überspringen).

### C · Verben (v1 Tool-Layer)

| Verb | Risk | Apply wraps |
|---|---|---|
| `interne_notiz` (`text`) | safe | Timeline-Eintrag / Mitteilung (intern) |
| `task_schliessen` (`ergebnis`) | safe | `updateTaskStatusCore(→ erledigt)` — immer letzte Aktion |
| `sende_kommunikation` (`empfaenger`, `kanal`, `text` \| `trigger`) | **consequential** | `sendFallCommunication` |
| `setze_status` (`neuer_status`, `grund`) | **consequential** | `transitionFallStatus` |
| `weise_sv_zu` (`sv_id?`) | **consequential** | `findBestSV` + SV-Zuweisung *(P2)* |

Exakte Apply-Signaturen (Parameter-Namen der Wrapper-Ziele) beim Bau gegen die realen Module
verifizieren. Jeder `apply` gibt `ActionResult` zurück (kein throw); Fehler werden im Plan
festgehalten.

### D · Playbook-Registry

```ts
type Playbook = {
  key: string
  label: string
  matches: (task: TaskRow) => boolean   // primär task_typ; ggf. trigger_event/task_code
  verbs: ActionVerb[]                    // Subset der Executor-Verben (harte Allow-List)
  system: string                         // Scaffold: was diese Aufgabe ist + Guardrails
}

function playbookForTask(task: TaskRow): Playbook | null   // Button-Sichtbarkeit
```

Reine Funktion (kein DB), damit Server-Component + Client identisch entscheiden können, ob der
Button erscheint.

### E · Server-Actions (`{ ok, … }`-Shape, kein throw)

- `starteKiAusfuehrung(taskId)` → `{ ok, execution?: { id, status, plan-preview }, error? }`
- `bestaetigeKiAusfuehrung(execId)` → `{ ok, error? }`
- `brichAbKiAusfuehrung(execId)` → `{ ok, error? }`

Alle drei: Auth-Guard (Admin/KB), RLS-Check (Task muss für den User zugreifbar sein — via
`can_access_fall`/Zuweisung), erst dann `createAdminClient` für die Ausführung. `revalidatePath`
der betroffenen Task-Flächen (`/admin/tasks`, `/admin/meine-tasks`, `/mitarbeiter/tasks`, ggf.
`/faelle/[id]`).

### F · Datenmodell — Audit-Tabelle (eine Migration)

Analog `ai_claim_proposals` (RLS an, kein anon/authenticated-Grant → nur service_role; Admin-
Surface liest via `createAdminClient` nach Guard):

```sql
create table public.ai_task_executions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete cascade,
  playbook text not null,
  status text not null default 'geplant'
    check (status in ('geplant','warte_bestaetigung','ausgefuehrt','abgebrochen','fehler')),
  plan jsonb not null default '[]'::jsonb,   -- [{verb, args, risk, applied, result}]
  begruendung text,
  modell text not null,
  gestartet_von uuid references auth.users(id),
  bestaetigt_von uuid references auth.users(id),
  erstellt_am timestamptz not null default now(),
  abgeschlossen_am timestamptz,
  fehler text
);
create index ai_task_executions_task_idx on public.ai_task_executions(task_id);
-- Idempotenz-Lock: max. eine offene Ausführung je Task
create unique index ai_task_executions_offen_idx
  on public.ai_task_executions(task_id) where status in ('geplant','warte_bestaetigung');
alter table public.ai_task_executions enable row level security;
revoke all on public.ai_task_executions from anon, authenticated;
```

Plugin-Ablauf (Regel 2): `apply_migration` → `list_migrations` → File exakt nach getrackter
Version benennen → committen → `execute_sql` (READ) verifizieren → Typen regenerieren/aufschieben.

### G · UI & Flow

- **Button „✨ Per KI erledigen"** auf Task-Cards/-Zeilen — nur wenn `playbookForTask(task)` ≠ null.
  Reuse `primitives.Button` (Component-Set-Policy; kein handgerolltes Markup). Icon = Sparkle/Bot.
  Claimondo-Tokens, echte Umlaute (UI-String-Pflicht).
- **All-safe-Plan** → Toast „KI hat erledigt: …", Task wandert nach *Erledigt*.
- **Consequential-Plan** → **Bestätigungs-Drawer** (shared `primitives` Modal/Sheet): `begruendung`
  + je geplanter Aktion eine Vorschau (Nachrichtentext / Ziel-Status / SV-Name) →
  `[Abbrechen]` `[Bestätigen & ausführen]`.
- **Idempotenz:** existiert bereits eine offene Ausführung (`warte_bestaetigung`), zeigt der Button
  „Plan bestätigen" (öffnet den Drawer) statt neu zu planen. Button während laufender Aktion
  disabled (`loading`).

## Playbook-Set v1

`task_typ → Playbook`. Button erscheint nur bei Match:

| # | task_typ | Verben | Zweck |
|---|---|---|---|
| 1 | `dokument_nachfordern` / `dokument-pruefen` | `notiz, sende_komm, schliessen` | fehlendes Dokument freundlich anfordern |
| 2 | `sv-termin` (Termin bestätigen) | `notiz, sende_komm, schliessen` | Termin dem Kunden bestätigen |
| 3 | `vs_eskalation_pruefen` | `notiz, setze_status, schliessen` | VS-Frist prüfen, zusammenfassen, ggf. Status |
| 4 | `kunde-rueckfrage` | `notiz, sende_komm, schliessen` | Kundenrückfrage beantworten |
| 5 | `versicherung-kontakt` | `notiz, sende_komm, schliessen` | Nachricht an Versicherung entwerfen+senden |
| 6 | `kanzlei-anschlussschreiben` / `kanzlei-nachfrage` | `notiz, sende_komm, schliessen` | Kanzlei-Schreiben |
| 7 | `zahlung-pruefen` | `notiz, schliessen` | Zahlungsstatus prüfen (reine Safe-Task → instant) |

Kein Playbook / kein Button: `filmcheck` (menschlicher Video-Check), `sonstiges`/Freitext.

> **P1 baut nur Playbook #1 end-to-end.** P2 ergänzt #2–#7 (+ `weise_sv_zu`).

## Guardrails & Sicherheit

- **Tool-Allow-List je Playbook** = harte Obergrenze dessen, was das LLM überhaupt erreichen kann.
- **Consequential immer Confirm** in v1 — nichts läuft autonom nach außen.
- **Executor-Kill-Switch** (ENV, z.B. `TASK_EXECUTOR_ENABLED`) — Ops kann global abschalten;
  Muster analog `isKillSwitchOn()`.
- **RLS-Guard vor Admin-Client:** die Server-Action prüft Zugriff des Users auf den Task, bevor
  `createAdminClient` ausgeführt wird.
- **Idempotenz-Lock** (Partial-Unique-Index) verhindert doppelte/parallele Ausführung je Task →
  kein Doppel-Send.
- **Fail-safe LLM:** `callForProposals` wirft nie (→`[]`); leerer Plan → „KI hat keinen Vorschlag,
  bitte manuell" (kein stiller No-Op als „erledigt").
- **Kein throw** aus Server-Actions; Non-critical Sub-Sends (Timeline/Mitteilung) in lokalem
  try/catch.

## Audit & Timeline

- `ai_task_executions` hält Plan + Status + wer-gestartet/-bestätigt + Fehler (voller Verlauf).
- Jede Ausführung schreibt zusätzlich einen **Claim-Timeline-Eintrag** (actor=KI): „KI hat Aufgabe
  ‚<titel>' bearbeitet — <begruendung>". Consequential-Wrapper (`sendFallCommunication`,
  `transitionFallStatus`) erzeugen ihre eigenen bestehenden Audit-Spuren (`email_log`, Timeline).

## Graduierung (P3 — Nicht-Ziel jetzt)

Über `ai_task_executions` lassen sich je Playbook Confirm-/Abbruch-/Fehler-Quoten messen. Bewährte
Playbooks können später — exakt wie `GRADUATION` heute — consequential-Aktionen ohne Confirm
ausführen (autonom), mit Rate-Cap + Auto-Revert. Bewusst **nicht** in v1.

## Phasing

- **P0 — Engine + Spine (kein UI):** Migration `ai_task_executions`; `ActionVerb`-Typ +
  `extractActions`; Verben `interne_notiz`/`task_schliessen`/`sende_kommunikation`/`setze_status`;
  `planTaskExecution` (reuse `callForProposals`) + `applyPlan` + Playbook-Registry mit **1**
  Playbook (`dokument_nachfordern`); Server-Actions start/bestaetige/abbrich. TDD-schwer.
- **P1 — Erste Fläche + Confirm-UI:** Button auf `KanbanBoard` + Bestätigungs-Drawer +
  Timeline-Audit → **End-to-End ein Playbook** (Prod-Smoke).
- **P2 — Verbreitern:** Playbooks #2–#7 + `weise_sv_zu`; Button auf `MyTasksClient` +
  `mitarbeiter/tasks` (KB-Flächen).
- **P3 (future):** Ausführungs-Graduierung zu autonom, Schritt-granulares Gating,
  Text-Editieren vor Confirm.

## Tests

- **Verben (Unit):** jede `validate` (gültig/ungültig), `risk`-Klassifizierung korrekt.
- **`extractActions` (Unit):** tool_use → ActionDrafts; ungültige/unbekannte Verben übersprungen.
- **`buildPlan` (Unit):** Risk-Aggregation (all-safe vs. hat-consequential), `schliessen` zuletzt.
- **`applyPlan` (Unit, gemockte Wrapper):** Reihenfolge, Stop-bei-Fehler, Status-Übergänge
  (geplant→ausgefuehrt / warte_bestaetigung→ausgefuehrt / →fehler).
- **Server-Actions:** Guard/RLS (fremder Task → `{ ok:false }`), Idempotenz-Lock, `{ ok }`-Shape.
- **Playbook-Matching:** `playbookForTask` für alle v1-Typen + Nicht-Match (`filmcheck`).
- **Playwright-Smoke (P1):** Kanban → Button → (Doku-Task) → Drawer → Bestätigen → WhatsApp-Send
  (Mock) + Task in *Erledigt* + `ai_task_executions.status='ausgefuehrt'`.

## 7-Punkte-Audit-Vorschau

- **Build:** `tsc` + `npm run build` (Server-Actions/Routen berührt → voller Build Pflicht).
- **UI-Erreichbarkeit:** Button auf Task-Cards (Admin P1, KB P2), rollen-korrekt sichtbar.
- **Redundanz:** `claim-ai/engine` + `buildClaimContext` + Kommunikations-/State-Helper **reused**,
  nicht kopiert; `primitives.Button`/Modal statt handgerollt.
- **Dead-Code:** keine verwaisten Pfade; knip-Baseline prüfen (neue Files sind genutzt).
- **Inkonsistenz:** Claimondo-Tokens, echte Umlaute in UI-Strings, `{ ok }`-Shape, `revalidatePath`
  der Task-Flächen, DB-Spalten via Supabase-MCP verifiziert (nicht geraten).
- **Regression:** Orchestrator/`ai-vorschlaege`/Kanban-D&D/`buildTaskFromProposal` unberührt;
  Auth-Weichen intakt.

## Nicht-Ziele (YAGNI)

- Keine autonome Ausführung consequential-Aktionen in v1 (P3).
- Kein Voice-/Anruf-Automatismus (Aircall) — `filmcheck`/physische Tasks bleiben ohne Button.
- Kein Umbau des Orchestrators oder der `ai-vorschlaege`-Fläche.
- Kein Schritt-granulares Gating, kein Message-Editing vor Confirm (P3).
- Kein neuer Nav-Eintrag — der Button lebt auf den bestehenden Task-Flächen.

## Offene Verifikations-Punkte (beim Bau)

1. **task_typ von Proposal-Tasks:** `createLinkedTask` setzt `typ` (Legacy), aber trägt ein aus
   `buildTaskFromProposal` erzeugter Task ein spezifisches `task_typ`? Ggf. `null` → Matcher auf
   `trigger_event`/`task_code` erweitern. **Gegen echte Daten prüfen.**
2. **Exakte Apply-Signaturen:** `sendFallCommunication` / `transitionFallStatus` / SV-Zuweisung /
   `updateTaskStatusCore` — Parameter-Namen + Result-Shapes.
3. **Claim↔Fall-Auflösung im ExecCtx:** `tasks` trägt `fall_id` **und** (neu) `claim_id`? Bridge
   (`faelle_claim_bridge`) wie in `buildTaskFromProposal` nutzen.
4. **`AI_MODELS.task_executor`** ergänzen (Sonnet 4.6 — Planung + Textqualität), `cache_control`
   auf dem statischen Playbook-System-Prompt.

## Koordination

- **Eigener Worktree** `.claude/worktrees/ki-task-executor`, Branch `kitta/ki-task-executor` off
  `staging`; PR gegen `staging` (Regel 1).
- **Shared-Touch-Files** vs. Parallel-Sessions: `KanbanBoard.tsx` / `MyTasksClient.tsx` /
  `mitarbeiter/tasks/page.tsx` — Marker gegen `386b3bd8` (SV/live-ops), `3c0b2713` (Header-Refactor),
  `61e1d996` (Interaktions-Flags → DB-driven). Additiver Button, Konflikte klein halten.
- Neue Files (`src/lib/task-executor/*`, Migration, Drawer-Component) kollidieren mit niemandem.

## Rollout

Worktree off `staging` → TDD/Subagent-Bau (P0→P1) → 7-Punkte-Audit → PR gegen `staging` →
Prod-Smoke nach Deploy (Kanban → Button → Doku-Task → Drawer → Bestätigen → Send + Erledigt +
`ai_task_executions`-Row). P2 als Folge-PR.
