# Pipeline-Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Effekt-basierte Health-Check-Schicht, die Silent Failures der Backbone (Funnel-Stillstand, dormante Crons, Send-Fehler, fehlende Config) per Anomalie in vorhandenen Daten erkennt und Email + In-App + Dead-Letter alarmiert.

**Architecture:** Deklarative Checks (`HealthCheck`-Interface, je eine reine async-Funktion über den Admin-Client) → Registry → Runner (per-Check try/catch) → Persist+Alert (Ergebnis in `health_check_runs`, Alert bei Verschlechterung) → stündlicher Cron `/api/cron/pipeline-health` → Admin-Dashboard `/admin/health`. Read-only über vorhandene Tabellen; keine neue Instrumentierung.

**Tech Stack:** Next.js 16 (Route-Handler + Server-Components), Supabase (`createAdminClient`), vitest. Reuse: `src/lib/reliability/dead-letter.ts`, `src/lib/mitteilungen/create-mitteilung.ts` (`createMitteilungMulti`), `src/lib/email/google/client.ts` (`sendEmail`), `log_cron_job_run` (RPC), `src/lib/faelle/state-machine.ts` (Phasen/Terminal), `v_claim_phase`.

## Global Constraints
- **DDL nur via Supabase-Plugin** `apply_migration` (Regel 2) — danach `list_migrations` → File `supabase/migrations/<V>_<name>.sql` exakt nach getrackter Version benennen → `execute_sql` READ-verify. `execute_sql` NUR für READ.
- **Nie auf `main` pushen** — Branch `kitta/pipeline-observability`, PR gegen `staging`.
- **Alle Writes/Edits auf den Worktree-Pfad** `C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\.claude\worktrees\makler-portal-cmm49-fixes\…` (Worktree-Trap-Vermeidung).
- **Result-Object statt throw** in route/action-Pfaden; Non-critical-Sends in try/catch.
- **Umlaute** in nutzersichtbaren Strings (Dashboard, Alert-Email/In-App): echte `ä/ö/ü/ß`.
- **Token-Audit-Skip-Header** in der Alert-Email-HTML-Datei (raw Hex wie alle Email-Templates).
- **Design-Tokens** im Dashboard: `bg-success/-soft`, `text-warning-strong`, `bg-danger-soft` etc. (kein roh `green-50`); Komponenten aus `@/components/shared` (`SectionCard`, `DataTable`, `StatusBadge`/`EmptyState`) + `primitives`.
- **7-Punkte-Audit** im Commit-Body jedes Commits.
- Reminder: `tsc --noEmit`, `vitest`, `npm run build` (8GB-Heap: `NODE_OPTIONS=--max-old-space-size=8192`), 3 Ratchets (`check:token-audit`, `check:component-set -- --ratchet`, `check:knip -- --ratchet`) müssen grün sein.

---

### Task 1: Types + Migration `health_check_runs`

**Files:**
- Create: `src/lib/health/types.ts`
- Create (via apply_migration → committed): `supabase/migrations/<V>_health_check_runs.sql`

**Interfaces — Produces:**
```ts
export type HealthStatus = 'ok' | 'warn' | 'crit' | 'error'
export type CheckResult = { status: HealthStatus; metric?: number; detail: string; sampleIds?: string[] }
export type CheckCtx = { supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient> }
export type HealthCheck = { id: string; category: 'funnel' | 'cron' | 'sends' | 'config'; title: string; run: (ctx: CheckCtx) => Promise<CheckResult> }
export const STATUS_RANK: Record<HealthStatus, number> = { ok: 0, warn: 1, error: 2, crit: 2 }
```

- [ ] **Step 1: Write `src/lib/health/types.ts`** mit exakt dem Interface oben (JSDoc deutsch optional; `STATUS_RANK` für Verschlechterungs-Vergleich, `error` == `crit`-Rang).
- [ ] **Step 2: DDL anwenden** via `apply_migration({ name: 'health_check_runs', query: <DDL> })` mit:
```sql
create table public.health_check_runs (
  id uuid primary key default gen_random_uuid(),
  check_id text not null,
  category text not null,
  status text not null check (status in ('ok','warn','crit','error')),
  metric numeric,
  detail text not null default '',
  sample_ids jsonb not null default '[]'::jsonb,
  alerted_at timestamptz,
  run_at timestamptz not null default now()
);
create index idx_health_runs_check_recent on public.health_check_runs (check_id, run_at desc);
create index idx_health_runs_recent on public.health_check_runs (run_at desc);
alter table public.health_check_runs enable row level security;
create policy "admin liest health_check_runs" on public.health_check_runs
  for select using (public.is_admin());
```
- [ ] **Step 3: `list_migrations`** → getrackte Version `<V>` ablesen; Migration-File als `supabase/migrations/<V>_health_check_runs.sql` mit identischem DDL anlegen (Twin-Drift vermeiden).
- [ ] **Step 4: Verify** `execute_sql('select count(*) from health_check_runs')` → 0 Zeilen, kein Fehler. `execute_sql` für `select polname from pg_policies where tablename='health_check_runs'` → Policy da.
- [ ] **Step 5: Commit** `git add src/lib/health/types.ts supabase/migrations/<V>_health_check_runs.sql` + Audit-Body.

---

### Task 2: Funnel-Checks (`funnel-stuck-claims`, `funnel-stalled-flow`)

**Files:**
- Create: `src/lib/health/phase-slas.ts`, `src/lib/health/checks/funnel-stuck-claims.ts`, `src/lib/health/checks/funnel-stalled-flow.ts`
- Test: `src/lib/health/checks/__tests__/funnel-stuck-claims.test.ts`, `…/funnel-stalled-flow.test.ts`

**Interfaces — Consumes:** `HealthCheck`, `CheckResult`, `CheckCtx` (Task 1). **Produces:** `funnelStuckClaimsCheck: HealthCheck`, `funnelStalledFlowCheck: HealthCheck`, `PHASE_SLA_TAGE: Record<string, number>`, `TERMINAL_PHASES: Set<string>`.

`phase-slas.ts`:
```ts
// Terminal-Set: aus state-machine ableiten (nicht neu raten). Falls dort kein Export,
// hier explizit + Kommentar "muss zu FALL_STATUS_TRANSITIONS passen".
export const TERMINAL_PHASES = new Set(['abgeschlossen', 'storniert'])
// SLA in Tagen pro operative_status (Spec §4). Default 14 fuer nicht gelistete.
export const PHASE_SLA_TAGE: Record<string, number> = {
  ersterfassung: 7, 'sv-zugewiesen': 5, 'sv-termin': 10, besichtigung: 7,
  'begutachtung-laeuft': 7, 'gutachten-eingegangen': 7, filmcheck: 5,
  'kanzlei-uebergeben': 21, anschlussschreiben: 30, regulierung: 30, 'regulierung-laeuft': 30,
  'zahlung-eingegangen': 14,
}
export const slaTage = (phase: string) => PHASE_SLA_TAGE[phase] ?? 14
```

- [ ] **Step 1: Failing test `funnel-stuck-claims`** — Fake-`CheckCtx` mit `supabase` stub, dessen Query Zeilen `[{operative_status, n, ueber_sla, aeltester_tage}]` liefert; assert: leer→`ok`; 3 über SLA→`warn`; 12 über SLA→`crit`; ältester > 2×SLA→`crit`. `detail` enthält Phase + Anzahl.
- [ ] **Step 2: Run** `npx vitest run src/lib/health/checks/__tests__/funnel-stuck-claims.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implement `funnel-stuck-claims.ts`** — Query (verifiziert):
```sql
select operative_status as phase, count(*) as n,
  count(*) filter (where status_changed_at < now() - make_interval(days => :sla)) as ueber_sla,
  round(extract(epoch from max(now()-status_changed_at))/86400)::int as aeltester_tage
from claims where operative_status not in ('abgeschlossen','storniert') group by 1
```
Da `:sla` pro Phase variiert: in JS pro Phase auswerten — lade `select operative_status, status_changed_at from claims where operative_status not in (TERMINAL)`, gruppiere in JS, vergleiche je Phase gegen `slaTage(phase)`. `status`= crit wenn (Σ über SLA ≥10) oder (ältester > 2×SLA der jeweiligen Phase), sonst warn wenn ≥1 über SLA, sonst ok. `detail`: „N Claims über SLA (älteste in <phase>: Xd)". `sampleIds`: bis 5 Claim-IDs der ältesten.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Failing test `funnel-stalled-flow`** — stub liefert pro `main_phase` (`v_claim_phase`) eine Anzahl + Upstream-Alter; assert: regulierung/abschluss=0 & begutachtung-Stau >14d ≥N → `crit`; alles besetzt → `ok`.
- [ ] **Step 6: Run** → FAIL.
- [ ] **Step 7: Implement `funnel-stalled-flow.ts`** — Query: `select main_phase, count(*) from v_claim_phase group by 1` + Alter via join auf claims.status_changed_at. Meilenstein-Reihenfolge `['erfassung','begutachtung','regulierung','abschluss']`. Wall = ein Meilenstein-Index ohne Claims, während ein früherer ≥`MIN_UPSTREAM=5` Claims >14d hat. `crit` bei Wall an `regulierung`/`abschluss` mit großem gealtertem Upstream, sonst `warn`. `detail`: „Fluss versiegt: 0 in <phase>, aber N gealterte Upstream".
- [ ] **Step 8: Run** → PASS.
- [ ] **Step 9: Commit** beide Checks + phase-slas + Tests + Audit-Body.

---

### Task 3: Cron-Effekt-Checks (`slots-stale-reservations`, `reminders-overdue`)

**Files:** Create `src/lib/health/checks/slots-stale-reservations.ts`, `…/reminders-overdue.ts`; Test je `__tests__/*.test.ts`.
**Interfaces — Produces:** `slotsStaleReservationsCheck`, `remindersOverdueCheck` (`HealthCheck`).

- [ ] **Step 1: Failing test `slots-stale-reservations`** — stub liefert `{n_stale, aeltester_h}`; assert 0→ok, >0→warn, ältester>168h(7d)→crit.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — Query (verifiziert, Tabelle `gutachter_finder_anfragen`):
```sql
select count(*) as n, round(extract(epoch from max(now()-reservierter_slot_von))/3600)::int as aeltester_h
from gutachter_finder_anfragen
where reservierter_slot_von is not null and reservierter_slot_von < now() - interval '24 hours'
```
`crit` wenn `aeltester_h > 168`, `warn` wenn `n>0`, sonst ok. `detail`: „N Slot-Reservierungen >24h gehalten (älteste Xd) — slot-ttl-cleanup prüfen".
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Failing test `reminders-overdue`** — stub liefert `{overdue, aeltester_overdue_h, failed_48h, total_48h}`; assert: 0 overdue & 0 failed→ok; ≥1 overdue→warn; ältester overdue>24h→crit; failed/total>0.2 (Floor total≥5)→warn.
- [ ] **Step 6: Run → FAIL.**
- [ ] **Step 7: Implement** — Queries (verifiziert, `task_reminders`):
```sql
-- overdue (Cron haette senden muessen)
select count(*) as overdue, round(extract(epoch from max(now()-geplant_fuer))/3600)::int as aeltester_h
from task_reminders where status='pending' and geplant_fuer < now() - interval '2 hours';
-- failure-rate 48h
select count(*) filter (where status='failed') as failed, count(*) as total
from task_reminders where created_at > now() - interval '48 hours';
```
`crit` wenn `aeltester_h>24`; `warn` wenn `overdue≥1` oder (`total≥5` und `failed/total>0.2`); sonst ok. `detail` entsprechend.
- [ ] **Step 8: Run → PASS.**
- [ ] **Step 9: Commit** + Audit.

---

### Task 4: Send-Checks (`email-failure-rate`, `webhook-inbound-silent`)

**Files:** Create `src/lib/health/checks/email-failure-rate.ts`, `…/webhook-inbound-silent.ts`; Tests.
**Interfaces — Produces:** `emailFailureRateCheck`, `webhookInboundSilentCheck`.

- [ ] **Step 1: Failing test `email-failure-rate`** — stub `{sent, failed}`; assert: total<5→ok (Floor); 1/20=5%→ok; 3/20=15%→warn; 7/20=35%→crit.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — Query (verifiziert, `email_log`):
```sql
select count(*) filter (where status='sent') as sent,
       count(*) filter (where status in ('failed','bounced')) as failed
from email_log where created_at > now() - interval '24 hours'
```
`total=sent+failed`; wenn `total<5`→ok. rate=failed/total. `crit` >0.3, `warn` >0.1, sonst ok. `detail`: „X% Email-Fehlerrate (24h): failed/total".
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Failing test `webhook-inbound-silent`** — stub `{tage_seit_letztem}` (oder null=nie); assert: <7→ok, ≥7→warn, ≥30→crit, null(nie)→crit.
- [ ] **Step 6: Run → FAIL.**
- [ ] **Step 7: Implement** — Query (verifiziert, `webhook_events`):
```sql
select round(extract(epoch from (now()-max(created_at)))/86400)::int as tage_seit_letztem,
       count(*) filter (where status='failed') as failed_offen
from webhook_events
```
`crit` wenn `tage_seit_letztem is null` oder `>30`; `warn` wenn `>7` oder `failed_offen>0`; sonst ok. `detail`: „Letztes Inbound-Webhook vor X Tagen (LexDrive-Rückkanal prüfen)".
- [ ] **Step 8: Run → PASS.**
- [ ] **Step 9: Commit** + Audit.

---

### Task 5: Config-Check (`config-required-env`)

**Files:** Create `src/lib/health/checks/config-required-env.ts`; Test.
**Interfaces — Produces:** `configRequiredEnvCheck`.

- [ ] **Step 1: Failing test** — der Check liest `process.env` über eine injizierbare `env`-Map (damit testbar): `run(ctx)` nutzt `ctx`… → erweitere die Check-Funktion intern, `process.env` via `const env = process.env`. Test: setze/lösche Keys via `vi.stubEnv`. assert: VAPID fehlt→warn; KANZLEI_API_ENABLED='true' ohne KANZLEI_SF_API_URL→warn; kein RESEND_API_KEY & kein GMAIL_SMTP_USER→crit; alles da→ok.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — prüfe: VAPID-Paar (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`+`VAPID_PRIVATE_KEY`); wenn `KANZLEI_API_ENABLED==='true'` dann `KANZLEI_SF_API_URL`+`KANZLEI_SF_CLIENT_ID`+`KANZLEI_SF_CLIENT_SECRET`; Email-Provider (`RESEND_API_KEY` ODER `GMAIL_SMTP_USER`). Sammle fehlende. `crit` wenn Email-Provider komplett fehlt; `warn` wenn andere Pflicht-ENV fehlen; sonst ok. `detail`: Liste der fehlenden Keys. (Dieser Check ignoriert `ctx.supabase`.)
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** + Audit.

---

### Task 6: Registry + Runner

**Files:** Create `src/lib/health/checks/index.ts`, `src/lib/health/run-checks.ts`; Test `src/lib/health/__tests__/run-checks.test.ts`.
**Interfaces — Consumes:** alle `*Check` (Tasks 2-5). **Produces:** `ALL_CHECKS: HealthCheck[]`; `runAllChecks(ctx): Promise<Array<{ check: HealthCheck; result: CheckResult }>>`.

- [ ] **Step 1: `index.ts`** — `export const ALL_CHECKS = [funnelStuckClaimsCheck, funnelStalledFlowCheck, slotsStaleReservationsCheck, remindersOverdueCheck, emailFailureRateCheck, webhookInboundSilentCheck, configRequiredEnvCheck]`.
- [ ] **Step 2: Failing test `run-checks`** — `ALL_CHECKS`-Ersatz mit 1 werfendem + 1 ok-Check (injiziert); assert: werfender → `{status:'error', detail:<msg>}`, ok-Check läuft trotzdem; Länge=2.
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement `run-checks.ts`** — `runAllChecks(ctx, checks=ALL_CHECKS)`: `Promise.all(checks.map(async c => { try { return {check:c, result: await c.run(ctx)} } catch(e) { return {check:c, result:{status:'error', detail: e instanceof Error ? e.message : String(e)}} } }))`. (Checks-Param injizierbar für Test.)
- [ ] **Step 5: Run → PASS.**
- [ ] **Step 6: Commit** + Audit.

---

### Task 7: Persist + Alerter

**Files:** Create `src/lib/health/persist-and-alert.ts`, `src/lib/health/alert-email.ts`; Test `src/lib/health/__tests__/persist-and-alert.test.ts`.
**Interfaces — Consumes:** runner-Output, `STATUS_RANK`. **Produces:** `persistAndAlert(ctx, results, deps?): Promise<void>`.

`alert-email.ts` (Token-Audit-Skip-Header!): `buildHealthAlertEmailHtml(items: {title, status, detail}[]): string` — branded inline-HTML, `escapeHtml` auf alle Werte.

- [ ] **Step 1: Failing test** — injizierte `deps = { sendEmail, createMitteilungMulti, recordFailedOperation, markOperationResolved }` (Spies) + ein supabase-stub, der „letzten Status" liefert. Fälle: ok→crit ⇒ alle drei Alert-Pfade gerufen + Insert mit `alerted_at`; crit→crit mit letztem `alerted_at` < 24h ⇒ KEIN Re-Alert; crit→crit mit `alerted_at` >24h ⇒ Re-Alert; crit→ok ⇒ `markOperationResolved` + „behoben"-Mitteilung; alle non-fatal (Spy wirft → kein throw).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — pro Ergebnis: letzten Run dieses `check_id` lesen (`order by run_at desc limit 1`); `worse = STATUS_RANK[neu] > STATUS_RANK[alt]`; Insert-Row (mit `alerted_at = worse || (crit && lastAlert<24h ? now : null)`). Bei `worse` (oder sustained crit & letztes alerted_at >24h): `sendEmail({to: <admin-emails>, empfaengerTyp:'admin', subject, html: buildHealthAlertEmailHtml(...)})` + `createMitteilungMulti(adminEmpf, {kategorie:'update', prioritaet: crit?'kritisch':'dringend', titel, inhalt, route_url:'/admin/health'})` + bei crit `recordFailedOperation({operationType:'pipeline_health', dedupKey:'health-'+id, entityType:'health_check', entityId:id, error: detail})`. Bei Recovery (alt≥warn, neu=ok): `markOperationResolved('health-'+id)` + kurze In-App-Notiz. Admin-Empfänger: `select id from profiles where rolle='admin'` (+ deren email). Alles in try/catch (non-fatal). `is_admin`/Rollen-Query verifiziert in Task 1.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** + Audit.

---

### Task 8: Cron-Route `/api/cron/pipeline-health`

**Files:** Create `src/app/api/cron/pipeline-health/route.ts`. (Smoke per `execute_sql` nach erstem Lauf; kein Unit-Test nötig — dünne Verdrahtung.)
**Interfaces — Consumes:** `runAllChecks`, `persistAndAlert`, `createAdminClient`, `log_cron_job_run` (RPC).

- [ ] **Step 1: Implement** — `GET`-Handler: CRON_SECRET-Bearer-Check (Muster aus `src/app/api/cron/recovery-monitor/route.ts` kopieren); `const supabase = createAdminClient(); const results = await runAllChecks({supabase}); await persistAndAlert({supabase}, results)`; `supabase.rpc('log_cron_job_run', {p_job_name:'pipeline-health', p_status:'success', p_rows: results.length, p_metadata: {worst: <schlechtester status>}})`; `return Response.json({ ok:true, summary: results.map(r=>({id:r.check.id, status:r.result.status})) })`. try/catch → bei Crash `log_cron_job_run(..., 'error', ...)` + 500.
- [ ] **Step 2: Build-Verify** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Route-Handler → Build-Validator). Erwartung: grün.
- [ ] **Step 3: Commit** + Audit (UI: n/a Cron; Regression: neuer Cron, isoliert).

---

### Task 9: Dashboard `/admin/health` + `/api/health`-Freshness

**Files:** Create `src/app/admin/health/page.tsx`; Modify `src/app/api/health/route.ts`.
**Interfaces — Consumes:** `health_check_runs` (jüngste Zeile je check_id).

- [ ] **Step 1: Implement Dashboard** — Server-Component, `requireRole(['admin'])` (Muster aus existierender admin-Seite); Query „jüngste Zeile je check_id" (`distinct on (check_id) … order by check_id, run_at desc`); Gruppierung nach `category`; je Check `StatusBadge` (ok=success, warn=warning, crit/error=danger Tokens) + `detail` + `metric` + `run_at`-relativ; oben „Letzter Lauf vor X" prominent (max run_at). Leerzustand `EmptyState` „Noch keine Health-Läufe". Shared-Komponenten (`SectionCard`/`DataTable`), Umlaute, Tokens.
- [ ] **Step 2: Modify `/api/health` GET** — Zusatz: `const { data } = await admin.from('health_check_runs').select('run_at').order('run_at',{ascending:false}).limit(1); checks.pipeline_health = data?.[0] && (Date.now()-new Date(data[0].run_at).getTime() < 2*3600*1000) ? 'ok' : 'fail'`. (Wenn Tabelle leer → 'fail' bis erster Lauf; akzeptiert.) Status-Aggregation wie gehabt.
- [ ] **Step 3: UI-Erreichbarkeit** — Admin-Nav-Eintrag „Pipeline-Health" → `/admin/health` ergänzen (Admin-Portal-Nav-File; additiv).
- [ ] **Step 4: Build-Verify** + tsc.
- [ ] **Step 5: Commit** + Audit.

---

### Task 10: Integrations-Verify + finaler Gate + PR

- [ ] **Step 1:** `npx tsc --noEmit` → 0.
- [ ] **Step 2:** `npx vitest run src/lib/health` → alle grün.
- [ ] **Step 3:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → exit 0.
- [ ] **Step 4:** 3 Ratchets (`check:token-audit`, `check:component-set -- --ratchet`, `check:knip -- --ratchet`) → 0 neue.
- [ ] **Step 5: Manueller Cron-Smoke** — Route lokal/per curl mit CRON_SECRET treffen (oder `runAllChecks` per Node-Script); `execute_sql('select check_id, status, detail from health_check_runs order by run_at desc limit 7')` → erwartet u.a. `funnel-stuck-claims=crit` (66 in sv-termin), `webhook-inbound-silent=crit` (47d), `config-required-env=warn` (VAPID), `slots-stale-reservations` je nach cleanup. **Danach Test-Zeilen wieder löschen** (`execute_sql delete from health_check_runs where run_at > <smoke-ts>`), damit Prod sauber bleibt (Regel-3-Disziplin).
- [ ] **Step 6: PR** gegen `staging` (`gh pr create --base staging`), Body mit Summary + Test-Plan + Infra-Hinweis (VPS-Crontab-Eintrag für `/api/cron/pipeline-health` stündlich). Marker `COORDINATION-pipeline-observability.md` schreiben + MEMORY.md-Pointer.

---

## Hinweise zur Ausführung
- Subagenten WRITE+TEST nur, **kein git-commit** durch Subagenten (Worktree-Trap) — der Orchestrator committet nach Review je Task; pro Commit Trap-Check `git -C <main> status` (Spec/Plan dürfen dort nicht auftauchen).
- DDL (Task 1) macht der Orchestrator selbst via Plugin (nicht der Subagent) — `apply_migration`/`list_migrations`/`execute_sql` sind MCP-Tools.
- Admin-Empfänger-Query + `requireRole`-Muster + Cron-Auth-Muster vor Implementierung an je einem Bestands-File gegenlesen (nicht raten).
