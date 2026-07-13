# KI-Task-Executor — Admin/KB-Aufgaben per Klick von der KI ausführen lassen

**Datum:** 2026-07-11
**Status:** Design freigegeben (Brainstorming abgeschlossen + auf Prod-Daten geerdet), bereit für Umsetzungsplan
**Branch:** `kitta/ki-task-executor` (Worktree off `staging`)
**DB:** eine additive Migration (`ai_task_executions`), via Supabase-Plugin (Regel 2)

## Motivation

Auf `staging` läuft der **AI-Claim-Orchestrator**: ein Cron reviewt stagnierende Claims (Anthropic
Tool-Use), schreibt `ai_claim_proposals` (Shadow-Mode), ein Admin nimmt sie unter
`/admin/ai-vorschlaege` an → `buildTaskFromProposal()` erzeugt **einen echten Task**. Phase 2
graduiert bewährte Paare zu `auto`.

Diese Pipeline endet bei **„ein Mensch hat eine Aufgabe zu tun"**. Wunsch (Aaron 2026-07-11):

- KI-Vorschläge bleiben **konvertierbar** zu Tasks → ✅ unverändert (`buildTaskFromProposal`).
- **Alle KI-fähigen** echten Aufgaben sollen per Klick **von der KI ausgeführt** werden → 🆕.

Der Kreis schließt sich: **KI schlägt vor → Task → KI führt aus → erledigt**, mit Mensch-Eingriff
an beiden Toren.

## Entscheidungen (Brainstorming, fix)

1. **Hybrid nach Risiko.** Jedes Tool trägt eine Risiko-Klasse. *Safe* (interne Notiz, Timeline,
   Task schließen) läuft sofort; *consequential* (Outbound an Kunde, Statuswechsel, SV-Zuweisung)
   braucht eine Bestätigung.
2. **Executable-Types-Allow-List** (keyed auf `tasks.typ`) gatet **nur den Button** — kein Button
   auf nicht-KI-fähigen Typen (DevOps-`reliability`, SV-physisch, Lead-Pool-`dispatch`). „Nur
   KI-fähige Typen."
3. **General-Executor mit vollem, risiko-klassifiziertem Tool-Belt** (Aaron 2026-07-11: „eigentlich
   alles davon, je nachdem was gebraucht wird"). Die KI bekommt je Task das **volle Belt** + Task-
   und Claim-Kontext und wählt selbst, was gebraucht wird. **Der Schutz ist das Risiko-Gating,
   nicht das Pro-Typ-Verengen** — die Typ-Allow-List gatet den Button, das Risiko-Gating gatet die
   Ausführung. Die Registry erlaubt später, einen heiklen Typ doch zu verengen (Default = volles Belt).
4. **Gating auf Plan-Ebene (v1).** Enthält der Plan ≥1 consequential-Aktion, wartet der **ganze**
   Plan auf **eine** Bestätigung (keine halb-angewandten Effekte). Reine Safe-Pläne laufen instant.
5. **Engine-Reuse.** Der Executor ist ein neuer Consumer der geteilten `claim-ai/engine`
   (Single-Turn Tool-Use), **kein** neuer Agent-Loop.
6. **Audit-Spine.** `ai_task_executions` + Claim-Timeline (actor=KI).
7. **Comms = Template-Select, kein Freitext.** `sendFallCommunication` ist template-gebunden
   (WhatsApp-Business-Regel: nur registrierte Templates). Das `sende_kommunikation`-Tool wählt einen
   **erlaubten Trigger** aus `COMMUNICATION_REGISTRY` + füllt dessen Variablen; die KI komponiert
   also *Variablen*, nicht beliebigen Text. (Freitext-Email via `sendEmail` ist ein späterer,
   optionaler zweiter Kanal — P3.)

## Geerdete Fakten (Prod-DB, 2026-07-11) — ersetzen die ursprünglichen Annahmen

- **`typ` ist der Diskriminator, nicht `task_typ`.** `task_typ` ist nur auf 30/266 Tasks gesetzt;
  `typ` auf allen 266. Der Matcher keyt auf `tasks.typ`.
- **Reale `typ`-Verteilung** (admin/KB-relevant, claim-verankert): `dokument-pruefen` (28, KB,
  claim), `sa_ausstehend` (21, admin-sichtbar, 11 claim), `allgemein` (3, KB/admin, claim —
  = Orchestrator-Vorschlags-Tasks), `erster-kontakt` (1, KB, claim), `sla_breach` (71, claim,
  interne Alerts), `reliability` (34, admin, **kein Claim**, DevOps), `sv_dokument_review` (21,
  admin, kein Claim, SV-Onboarding), `dispatch` (71, Lead-Pool, meist kein Claim), `sv-*`
  (SV-physisch). Die Spec-Playbooks der Erst-Version (`dokument_nachfordern` etc.) existieren in
  den Daten **nicht** und sind verworfen.
- **ID-Auflösung:** `tasks.fall_id` FKt auf `faelle_claim_bridge.fall_id`, `tasks.claim_id` auf
  `claims.id`. Jeder Task hat **beide oder keins** (`fall_only=0, claim_only=0`). → **ExecCtx liest
  `claim_id` (Claims-/Kontext-/Audit-Anker) UND `fall_id` (Comms-/Status-Anker) direkt vom Task —
  keine Bridge-Auflösung nötig.** Tasks ohne IDs → kein Button.
- **Templates existieren** für den Reminder/Doc-Bereich: `dokumente_nachreichen`,
  `dokumente_upload_anfrage` u.a. — Grundlage für `sende_kommunikation`.

## Ausgangslage (verifiziert auf `staging`)

Geteilte **`claim-ai/engine`** (mehrere Consumer wählen ihr Verb-Subset):
- `src/lib/claim-ai/engine/verbs.ts` — `VerbDefinition<T> = { name, tool, validate }`, `toolsFrom`,
  `validateVerb`.
- `src/lib/claim-ai/engine/call.ts` — `callForProposals<T>({ model, system, tools, userContent,
  extract, logEndpoint, logFallId })` (Single-Turn, wirft nie → `[]`, Usage-Log non-critical).
- `src/lib/orchestrator/tools.ts` — `ORCHESTRATOR_VERBS` (Zod + `tool` + `validate`) = Verb-Vorlage.
- `src/lib/orchestrator/run.ts` — `extractProposalsFromToolUse` = Extraktions-Vorlage.
- `src/lib/orchestrator/context.ts` — `buildClaimContext(claimId): Promise<ClaimContext|null>` +
  `summarizeClaimForPrompt(ctx)` (nutzt `createAdminClient`).
- `src/lib/orchestrator/policy.ts` — `isKillSwitchOn()` (ENV `ORCHESTRATOR_AUTO_ENABLED`) = Muster.
- `src/lib/ai/models.ts` — `AI_MODELS` (neuer Key `task_executor` nötig).

Apply-Layer (wiederverwenden):
- `sendFallCommunication(fallId, triggerName, extraData?): Promise<void>` — template-gebunden.
- `transitionFallStatus(fallId, newStatus, metadata?): Promise<void>` — nimmt `fallId`;
  gültige Ziel-Status aus `FALL_STATUS_TRANSITIONS`.
- `updateTaskStatusCore(supabase, taskId, newStatus): Promise<UpdateTaskStatusResult>` — **wirft**
  bei Fehler; nimmt einen Supabase-Client; setzt `erledigt_am` bei `'erledigt'` + `resolveGates`.
- `findBestSV(input)` + SV-Zuweisung (P2).
- `createAdminClient()` (`@/lib/supabase/admin`) · `createClient()` (`@/lib/supabase/server`) ·
  Guards `requireRole(['admin'|'kundenbetreuer'])` (Result, wirft nicht).

Task-Flächen: `src/app/admin/tasks/KanbanBoard.tsx` (`'use client'`, Card keyt auf `task.typ`; Query
in `page.tsx` selektiert `typ, task_typ, claim_id?`…) · `MyTasksClient.tsx` · `mitarbeiter/tasks`.
Primitives: `Button` (`variant`, `loading`, `onClick`, `iconLeft`), `Modal` (`open/onClose/…`).

## Zielarchitektur

### A · `ActionVerb` — Engine-Erweiterung per Intersection

```ts
type Risk = 'safe' | 'consequential'
type ActionDraft = { verb: string; args: Record<string, unknown>; begruendung?: string }

type ActionVerb = VerbDefinition<ActionDraft> & {
  risk: Risk
  apply: (draft: ActionDraft, ctx: ExecCtx) => Promise<ActionResult>
}

type ExecCtx = {
  db: SupabaseClient          // createAdminClient (nach Guard)
  task: TaskRow               // inkl. id, typ, titel, beschreibung, claim_id, fall_id, empfaenger_rolle
  claimId: string             // = task.claim_id (Claims-Anker)
  fallId: string | null       // = task.fall_id (Comms/Status-Anker)
  userId: string
}
type ActionResult = { ok: boolean; detail?: string; error?: string }
```

`toolsFrom`/`validateVerb` bleiben unverändert nutzbar (lesen nur `name`/`tool`/`validate`).
`validate` liefert `{ ok: true, draft: { verb: name, args, begruendung } }`.

### B · Flow — Plan → Apply/Confirm (kein zweiter LLM-Call)

```
Klick "Per KI erledigen" (Task mit executable typ + claim_id)
  └─ starteKiAusfuehrung(taskId)              [Server-Action: requireRole(['admin','kundenbetreuer']) + Task-RLS-Check]
       ├─ ctx aus Task-Row (claimId, fallId) + buildClaimContext(claimId)
       ├─ drafts = callForProposals({ model: AI_MODELS.task_executor,
       │             system: EXECUTOR_SYSTEM + typHint(task.typ),
       │             tools: toolsFrom(EXECUTOR_VERBS),       // volles Belt
       │             userContent: summarizeClaimForPrompt(ctx) + Task-Titel/Beschreibung,
       │             extract: extractActions(EXECUTOR_VERBS) })
       ├─ plan = buildPlan(drafts)                          // Risk aggregieren; task_schliessen zuletzt
       ├─ persist ai_task_executions (plan, modell, begruendung, gestartet_von)
       └─ 0 consequential → applyPlan → status=ausgefuehrt → Task erledigt → Timeline   (ein Klick)
          sonst           → status=warte_bestaetigung → UI-Vorschau (Modal)

Klick "Bestätigen & ausführen"
  └─ bestaetigeKiAusfuehrung(execId) → applyPlan (gespeicherte Args) → ausgefuehrt   (kein LLM-Call)
Klick "Abbrechen" → brichAbKiAusfuehrung(execId) → abgebrochen
```

`applyPlan` führt Aktionen in Reihenfolge aus (`task_schliessen` zuletzt), stoppt bei Fehler →
`status=fehler`, Task bleibt offen. `extractActions` spiegelt `extractProposalsFromToolUse`.

### C · Tool-Belt (voll, risiko-klassifiziert)

| Verb | Risk | Args (LLM komponiert) | Apply wraps |
|---|---|---|---|
| `interne_notiz` | safe | `text` | Timeline-/Mitteilung-Insert (intern) |
| `task_schliessen` | safe | `ergebnis` | `updateTaskStatusCore(db, taskId, 'erledigt')` — immer letzte |
| `sende_kommunikation` | **conseq** | `trigger` (aus Allow-List), `variablen: Record<string,string>` | `sendFallCommunication(fallId, trigger, variablen)` |
| `setze_status` | **conseq** | `neuer_status` (aus `FALL_STATUS_TRANSITIONS`), `grund` | `transitionFallStatus(fallId, neuer_status, { grund, user_id })` |
| `weise_sv_zu` *(P2)* | **conseq** | `sv_id?` | `findBestSV` + SV-Zuweisung |
| `lese_dokument` *(P2)* | safe | `dokument_id?` | Storage-Fetch + OCR/Vision (`AI_MODELS.ocr`) → Text in Kontext |

`sende_kommunikation.trigger` ist ein **enum der erlaubten Trigger** (kuratierte Teilmenge von
`COMMUNICATION_REGISTRY`, z.B. `dokumente_nachreichen`, `dokumente_upload_anfrage`,
Reminder-Trigger). Vorschau = Trigger + Empfänger + Variablen + Registry-`description`.

### D · Executable-Types-Registry (Button-Gate + Prompt-Hint)

```ts
type ExecutableType = {
  typ: string                    // matcht tasks.typ
  label: string
  promptHint: string             // "was dieser Typ meist braucht"
  toolOverride?: ActionVerb[]    // optional: heiklen Typ verengen (Default = volles Belt)
}
function executableTypeFor(task: TaskRow): ExecutableType | null   // + Guard: task.claim_id != null
```

`playbookForTask`-Äquivalent — reine Funktion (kein DB), Server + Client entscheiden identisch die
Button-Sichtbarkeit.

**v1-Allow-List** (claim-verankert, admin/KB, vom v1-Belt bedienbar):
`sa_ausstehend` · `allgemein` · `erster-kontakt` · `sla_breach`.
**P2 ergänzt:** `dokument-pruefen` (sobald `lese_dokument` existiert), `sv_dokument_review`
(SV-Kontext-Variante). **Nie:** `reliability`, `dispatch` (Lead-Pool), `sv-zum-termin`,
`sv-onboarding`.

### E · Datenmodell — Audit-Tabelle (eine Migration, RLS service_role-only)

```sql
create table public.ai_task_executions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete cascade,
  typ text,
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
create unique index ai_task_executions_offen_idx
  on public.ai_task_executions(task_id) where status in ('geplant','warte_bestaetigung');
alter table public.ai_task_executions enable row level security;
revoke all on public.ai_task_executions from anon, authenticated;
```

Plugin-Ablauf (Regel 2): `apply_migration` → `list_migrations` → File exakt nach getrackter
Version benennen → committen → `execute_sql`(READ) verifizieren → Typen regenerieren/aufschieben.

### F · Server-Actions (`{ ok, … }`-Shape, kein throw; neue Files)

- `starteKiAusfuehrung(taskId)` → `{ ok, execution?: { id, status, plan }, error? }`
- `bestaetigeKiAusfuehrung(execId)` → `{ ok, error? }`
- `brichAbKiAusfuehrung(execId)` → `{ ok, error? }`

Guard: `requireRole(['admin','kundenbetreuer'])` + Task-Zugriff über den **user-scoped** Client
prüfen (RLS), dann `createAdminClient` für die Ausführung. `revalidatePath` der Task-Flächen.

### G · UI & Flow

- **Button „✨ Per KI erledigen"** auf Task-Cards — nur wenn `executableTypeFor(task) != null`.
  `primitives.Button` (`variant="ghost"`, `iconLeft`, `loading`). Claimondo-Tokens, echte Umlaute.
- **All-safe-Plan** → Inline-Erfolg + `router.refresh()`, Task → *Erledigt*.
- **Consequential-Plan** → **Confirm-Modal** (`primitives.Modal`, Muster wie `NewTaskDialog` in
  `KanbanBoard.tsx`): `begruendung` + je Aktion Vorschau (Trigger+Variablen / Ziel-Status / SV) →
  `[Abbrechen]` `[Bestätigen & ausführen]`.
- **Idempotenz:** offene Ausführung (`warte_bestaetigung`) → Button zeigt „Plan bestätigen"; während
  Lauf `loading`. (Kein zentrales Toast-System vorhanden → Inline-Message-Muster wie im Bestand.)

## Guardrails & Sicherheit

- **Executable-Types-Allow-List** gatet den Button (nichts auf DevOps/physisch/Lead-Pool).
- **Consequential immer Confirm** in v1 — nichts läuft autonom nach außen.
- **Executor-Kill-Switch** (ENV `TASK_EXECUTOR_ENABLED`, Muster `isKillSwitchOn`) — global abschaltbar.
- **RLS-Guard vor Admin-Client.** **Idempotenz-Lock** (Partial-Unique-Index) je Task.
- **Fail-safe LLM:** `callForProposals` → `[]`; leerer Plan → „keine Aktion, bitte manuell" (kein
  stiller No-Op als erledigt).
- **Kein throw** aus Actions; `updateTaskStatusCore`/`transitionFallStatus`-Wrapper in try/catch →
  `ActionResult`.

## Audit & Timeline

`ai_task_executions` (Plan + Status + wer + Fehler) + Claim-Timeline actor=KI. Consequential-Wrapper
erzeugen zusätzlich ihre bestehenden Spuren (`email_log`, Timeline). Basis für P3-Graduierung
(Confirm-/Abbruch-Quote je Typ, analog `GRADUATION`).

## Phasing

- **P0 — Engine + Spine + volles Belt (kein UI):** Migration `ai_task_executions`; `ActionVerb`-Typ
  + `extractActions`; Verben `interne_notiz`/`task_schliessen`/`sende_kommunikation`/`setze_status`;
  Executable-Types-Registry (v1-Allow-List) + `EXECUTOR_SYSTEM`; `planTaskExecution`/`buildPlan`/
  `applyPlan`; Server-Actions start/bestaetige/abbrich; `AI_MODELS.task_executor`. TDD-schwer.
- **P1 — Fläche + Confirm-UI:** Button auf `KanbanBoard` + Confirm-Modal + Timeline → **End-to-End
  über die v1-Typen**, bewiesen an `sa_ausstehend` (consequential/Confirm) **und** `allgemein`
  (freeform/general). Prod-Smoke.
- **P2 — Breite:** `lese_dokument` (schaltet `dokument-pruefen` frei) + `weise_sv_zu`; KB-Flächen
  (`MyTasksClient`, `mitarbeiter/tasks`); Pro-Typ-Prompt-Hints verfeinern.
- **P3 (Nicht-Ziel jetzt):** Ausführungs-Graduierung zu autonom, Schritt-granulares Gating,
  Freitext-Email-Kanal, Text-Editieren vor Confirm.

## Tests

- **Verben (Unit):** jede `validate` (gültig/ungültig, `trigger`/`status`-Enums), `risk`-Klasse.
- **`extractActions` (Unit):** tool_use → ActionDrafts; ungültige/unbekannte Verben übersprungen.
- **`buildPlan` (Unit):** all-safe vs. hat-consequential; `task_schliessen` zuletzt.
- **`applyPlan` (Unit, gemockte Wrapper):** Reihenfolge, Stop-bei-Fehler, Status-Übergänge.
- **`executableTypeFor` (Unit):** v1-Typen match + Guard (kein `claim_id` → null) + Nicht-Match
  (`reliability`).
- **Server-Actions:** Guard/RLS (fremder Task → `{ ok:false }`), Idempotenz-Lock, `{ ok }`-Shape.
- **Playwright-Smoke (P1):** Kanban → Button auf `sa_ausstehend` → Confirm-Modal → Bestätigen →
  Template-Send (Mock) + Task *Erledigt* + `ai_task_executions.status='ausgefuehrt'`; sowie ein
  `allgemein`-Task (freeform) → Plan → Confirm/instant.

## 7-Punkte-Audit-Vorschau

- **Build:** `tsc` + `npm run build` (Server-Actions/Routen → voller Build Pflicht).
- **UI-Erreichbarkeit:** Button auf Task-Cards (Admin P1, KB P2), rollen-korrekt.
- **Redundanz:** `claim-ai/engine` + `buildClaimContext` + Comms/State-Helper **reused**;
  `primitives.Button`/`Modal` statt handgerollt.
- **Dead-Code:** knip-Baseline prüfen (neue Files genutzt).
- **Inkonsistenz:** Claimondo-Tokens, echte Umlaute, `{ ok }`-Shape, `revalidatePath`, DB-Spalten
  via MCP verifiziert.
- **Regression:** Orchestrator/`ai-vorschlaege`/Kanban-D&D/`buildTaskFromProposal` unberührt; Auth intakt.

## Nicht-Ziele (YAGNI)

Keine autonome consequential-Ausführung (P3) · kein Voice/Aircall (SV-physische Tasks bleiben ohne
Button) · kein Umbau von Orchestrator/`ai-vorschlaege` · kein Schritt-granulares Gating · kein
Freitext-Kanal in v1 · kein neuer Nav-Eintrag.

## Koordination

Eigener Worktree `.claude/worktrees/ki-task-executor`, Branch `kitta/ki-task-executor` off `staging`;
PR gegen `staging` (Regel 1). Shared-Touch (additiver Button, P1/P2): `KanbanBoard.tsx` ·
`MyTasksClient.tsx` · `mitarbeiter/tasks/page.tsx` — Marker gegen Parallel-Sessions `386b3bd8`
(Vertrieb-Cockpit), `3c0b2713` (Header-Refactor, portal-weit/shared), `61e1d996` (Flags→DB-driven).
Neue Files (`src/lib/task-executor/*`, Migration, Confirm-Modal) kollidieren mit niemandem.

## Rollout

Worktree off `staging` → TDD/Subagent-Bau (P0→P1) → 7-Punkte-Audit → PR gegen `staging` →
Prod-Smoke (Kanban → Button → `sa_ausstehend` → Confirm → Send + Erledigt + Audit-Row). P2 Folge-PR.
