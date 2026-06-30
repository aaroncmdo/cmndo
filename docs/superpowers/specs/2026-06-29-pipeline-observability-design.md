# Pipeline-Observability + Alerting — Design Spec

**Datum:** 2026-06-29 · **Status:** approved (Aaron), business-logic gegen Prod verifiziert · **Ansatz:** A (Effekt-Health-Check-Framework)

## 1 · Ziel & Erfolgskriterium

Silent Failures der automatisierten Backbone **per Effekt** erkennen (Anomalien in vorhandenen Daten), nicht per Exception. Diese Fehler werfen keinen Error — ein Cron der nicht läuft, ein Flow der aufhört zu advancieren, ein Feature das wegen fehlendem ENV still übersprungen wird — also ist Sentry blind. Es braucht eine Schicht, die das **Erwartete vermisst**.

**Erfolg:** Die nächste stille Panne wird in **Stunden statt Wochen** alarmiert; ein Admin sieht den Pipeline-Zustand auf einen Blick.

**Live-Motivation (verifiziert 2026-06-29, 89 Claims):** Funnel eingefroren bei `sv-termin` (66/74 Claims >14d, ältester 47d; 0 Claims je jenseits `gutachten-eingegangen`); LexDrive-Inbound tot (letztes `webhook_events` vor 47d); slot-ttl-cleanup dormant. Alle drei wären von diesem Framework sofort als CRIT erkannt worden.

## 2 · Architektur (Kern-Einheiten)

Alle neuen Files unter `src/lib/health/**`, der Cron unter `src/app/api/cron/pipeline-health/`, das Dashboard unter `src/app/admin/health/`.

- **Check-Interface** (`src/lib/health/types.ts`):
  ```ts
  export type HealthStatus = 'ok' | 'warn' | 'crit' | 'error'
  export type CheckResult = {
    status: HealthStatus
    metric?: number        // primäre Kennzahl (z.B. Anzahl stuck)
    detail: string         // menschenlesbar, deutsch (Dashboard/Alert)
    sampleIds?: string[]   // bis zu ~5 Beispiel-IDs zur Triage
  }
  export type HealthCheck = {
    id: string             // stabil, kebab-case (z.B. 'funnel-stuck-claims')
    category: 'funnel' | 'cron' | 'sends' | 'config'
    title: string          // deutsch, Dashboard-Label
    run: (ctx: CheckCtx) => Promise<CheckResult>
  }
  export type CheckCtx = { supabase: SupabaseAdminClient }
  ```
  Jeder Check = eigene Datei, eine reine async-Funktion über den injizierten Admin-Client → ohne DB testbar (Fake-Client).
- **Registry** (`src/lib/health/checks/index.ts`): exportiert `ALL_CHECKS: HealthCheck[]`.
- **Runner** (`src/lib/health/run-checks.ts`): `runAllChecks(ctx)` führt alle Checks aus, **per-Check try/catch** → ein werfender Check wird selbst zu `{status:'error', detail: <message>}` (der Monitor überwacht sich selbst). Gibt `Array<{check, result}>` zurück.
- **Persistenz + Alerter** (`src/lib/health/persist-and-alert.ts`): schreibt Ergebnisse, vergleicht mit letztem Status, alarmiert bei Verschlechterung. Details §5.
- **Cron-Route** (`src/app/api/cron/pipeline-health/route.ts`): CRON_SECRET-Bearer-Auth (wie alle Crons), ruft `runAllChecks` + `persistAndAlert`, loggt via `log_cron_job_run('pipeline-health', …)`, gibt `{ ok, summary }` zurück. Stündlicher Lauf (VPS-Crontab).
- **Dashboard** (`src/app/admin/health/page.tsx`): Server-Component, admin-only (`requireRole(['admin'])`), zeigt den jüngsten Lauf je Check gruppiert nach Kategorie + Status-Badge (Token `success/warning/danger`) + Detail + Metrik + „letzter Lauf vor X".

**Datenfluss:** Cron → `runAllChecks` → pro Check letzten Status aus `health_check_runs` lesen → neue Zeile schreiben → bei Verschlechterung alarmieren → Dashboard liest jüngste Zeilen.

## 3 · Datenmodell

Eine additive Tabelle (DDL via Supabase-Plugin `apply_migration`, Regel 2; in der Bau-Phase):

```sql
create table public.health_check_runs (
  id uuid primary key default gen_random_uuid(),
  check_id text not null,
  category text not null,
  status text not null check (status in ('ok','warn','crit','error')),
  metric numeric,
  detail text not null default '',
  sample_ids jsonb not null default '[]'::jsonb,
  alerted_at timestamptz,        -- gesetzt wenn fuer diese Zeile ein Alert feuerte (Re-Alert-Dedup)
  run_at timestamptz not null default now()
);
create index idx_health_runs_check_recent on public.health_check_runs (check_id, run_at desc);
create index idx_health_runs_recent on public.health_check_runs (run_at desc);
alter table public.health_check_runs enable row level security;
-- admin liest via kanonischem is_admin()-Helper; service_role (Cron) schreibt (bypassed RLS).
create policy "admin liest health_check_runs" on public.health_check_runs
  for select using (public.is_admin());
```

**Keine separate State-Tabelle** — „letzter Status" wird per `idx_health_runs_check_recent` aus der Tabelle abgeleitet (Dedup gratis). Retention: optionaler späterer Cleanup-Cron (Phase 2); MVP behält alles (Volumen trivial: ~7 Checks × 24/Tag).

> RLS verifiziert: `is_admin()` ist der kanonische Helper (u.a. `abrechnung_reminders.admin_only` nutzt genau das). service_role-Writes bypassen RLS.

## 4 · Die 7 MVP-Checks (verifizierte Spalten, an Prod kalibrierte Schwellen)

Phasen-Reihenfolge + Terminal-Set (`abgeschlossen`, `storniert`) werden aus `src/lib/faelle/state-machine.ts` (`FALL_STATUS_TRANSITIONS`) importiert — **nicht** neu definiert.

| id | Kategorie | Query (Effekt, read-only) | WARN / CRIT |
|---|---|---|---|
| `funnel-stuck-claims` | funnel | `claims` in nicht-terminalem `operative_status` mit `status_changed_at < now() - <Phasen-SLA>`. Phasen-SLA-Map: ersterfassung 7d · sv-termin 10d · begutachtung/gutachten 7d · kanzlei-uebergeben 21d · anschlussschreiben/regulierung 30d. | WARN ≥1 über SLA · CRIT Anzahl ≥10 **oder** ältester >2×SLA. *(heute: CRIT — 66 in sv-termin, 47d)* |
| `funnel-stalled-flow` | funnel | Pro Meilenstein (`v_claim_phase.main_phase`: erfassung→begutachtung→regulierung→abschluss) Anzahl Claims at-or-beyond. Wall = Downstream-Meilenstein = 0, während Upstream ≥`N` Claims >14d alt hat. | WARN Wall an spätem Meilenstein · CRIT Wall + großer gealterter Upstream-Stau. *(heute: CRIT — regulierung/abschluss=0, begutachtung-Stau gealtert)* |
| `slots-stale-reservations` | cron | `gutachter_finder_anfragen` mit `reservierter_slot_von is not null and reservierter_slot_von < now() - interval '24 hours'`. | WARN >0 · CRIT ältester >7d *(slot-ttl-cleanup dormant-Proxy)* |
| `reminders-overdue` | cron | `task_reminders` mit `status='pending' and geplant_fuer < now() - interval '2 hours'` (Cron hätte senden müssen) + Failure-Rate `status='failed'` in letzten 48h. | WARN ≥1 überfällig **oder** >20% failed/48h · CRIT ältester überfällig >24h. *(heute: grün — 0 pending)* |
| `email-failure-rate` | sends | `email_log` letzte 24h: `failed/(sent+failed)`, Mindest-Volumen-Floor 5 (sonst ok). | WARN >10% · CRIT >30%. *(heute: 0%)* |
| `webhook-inbound-silent` | sends | **(korrigiert von „backlog")** Tage seit letztem `webhook_events.created_at` (je `source`, v.a. LexDrive). Sekundär: `status='failed'` unverarbeitet. | WARN >7d still · CRIT >30d still. *(heute: CRIT — 47d still)* |
| `config-required-env` | config | Pflicht-ENV vorhanden je Feature-Flag: VAPID-Paar (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`+`VAPID_PRIVATE_KEY`), `KANZLEI_SF_*` wenn `KANZLEI_API_ENABLED='true'`, Email-Provider (`RESEND_API_KEY` oder `GMAIL_SMTP_*`). | WARN aktiviertes Feature ohne ENV · CRIT Email-Provider komplett fehlt. *(heute: WARN — VAPID fehlt → web_push 100% skip)* |

Jeder Check liefert `detail` auf Deutsch (Dashboard/Alert-sichtbar → echte Umlaute) + `sampleIds` (Claim/Lead-IDs zur Triage).

## 5 · Alerting + Dedup

`persistAndAlert(results)`:
1. Pro Check letzten Status aus `health_check_runs` lesen, neue Zeile schreiben.
2. **Verschlechterung** (Rang ok<warn<crit; `error` = wie crit behandelt): Alert.
   - **Email** an Admins (`sendEmail`, `empfaengerTyp:'admin'`, inline-branded HTML, escapeHtml) — der vertrauenswürdige Weck-Kanal (separat vom ~100%-ungelesenen In-App).
   - **In-App** `createMitteilungMulti` an Admin-Rolle, `prioritaet` `kritisch` (crit) / `dringend` (warn), `route_url='/admin/health'`.
   - **CRIT zusätzlich** `recordFailedOperation({ operationType:'pipeline_health_<checkId>', dedupKey:'health-<checkId>', … })` → `recovery-monitor`-Cron trackt/eskaliert es im bestehenden Dead-Letter.
3. **Anhaltend CRIT** → täglicher Re-Alert (nicht stündlich): re-alert nur wenn `max(alerted_at)` dieses Checks `< now() - 24h`. Jeder gefeuerte Alert setzt `alerted_at` auf der neuen Run-Zeile.
4. **Recovered** (→ ok): kurze „behoben"-In-App-Notiz + `markOperationResolved('health-<checkId>')`.
Alle Sends best-effort in try/catch (ein Send-Fail darf den Lauf nicht abbrechen).

## 6 · Self-Monitoring (wer überwacht den Wächter?)

- Dashboard zeigt **„letzter Lauf vor X"** prominent (stale = sichtbar).
- `/api/health` (GET) bekommt einen Zusatz-Check: `pipeline_health = 'ok'` wenn jüngste `health_check_runs.run_at < 2h`, sonst `'fail'` (→ externes Uptime-Monitoring auf /api/health sieht es).
- **Bekannte MVP-Grenze (dokumentiert):** stoppt der pipeline-health-Cron selbst, alarmiert nichts aktiv (nur passiv über /api/health-Staleness). Phase-2: `recovery-monitor` prüft die Freshness mit.
- **Self-Alert-Loop:** ist Email selbst down, schlägt der Email-Alert des `email-failure-rate`-Checks fehl — In-App + Dashboard + Dead-Letter zeigen es trotzdem. Akzeptiert.

## 7 · Error Handling

- Runner: per-Check try/catch → `error`-Result (Monitor überwacht sich selbst).
- Cron-Route: gibt 200 auch wenn Checks Probleme finden (Probleme = Daten, kein Route-Fehler); 500 nur wenn der Runner selbst crasht. `log_cron_job_run` mit status `success`/`error`.
- Result-Object-Pattern, kein throw (außer requireRole-Guards).

## 8 · Testing (vitest)

- **Pro Check** (`src/lib/health/checks/__tests__/*`): Fake-`CheckCtx` mit injiziertem Supabase-Stub, der fixe Zeilen liefert → Schwellen-**Grenzfälle** asserten (knapp unter/über WARN/CRIT, Leer-Fall = ok, Volumen-Floor bei email).
- **Runner**: ein werfender Check → `error`-Result, andere laufen weiter.
- **Alerter**: Transitions-Logik (ok→crit alarmiert; crit→crit kein Re-Alert außer periodisch; →ok = resolved), injizierte Sender (`sendEmail`/`createMitteilungMulti`/`recordFailedOperation` als Spies).

## 9 · Scope

**MVP (dieser Spec):** Framework (types/registry/runner/persist-alert) + 7 Checks + Cron-Route + `health_check_runs`-Tabelle + Alerter + schlankes `/admin/health`-Dashboard + `/api/health`-Freshness + Tests.

**Phase 2 (eigene Specs, nicht jetzt):** Cron-Run-Logging-Wrapper für die ~50 VPS-Routen (Ursache statt Effekt); Dead-Letter auf Email/Web-Push/Reminder ausweiten; Web-Push-Effekt-Check (Subscriptions vorhanden, 0 Sends/7d); Trend-Sparklines + Retention-Cleanup; externer Kanal (Slack/Telegram); per-Rollen-Health (Dispatch/KB-Domäne).

## 10 · Eine Infra-Abhängigkeit (Aaron)

Der pipeline-health-Cron muss in die VPS-Crontab (stündlich, `Authorization: Bearer $CRON_SECRET` auf `/api/cron/pipeline-health`) — wie alle anderen Crons. Ohne den Eintrag läuft die Route nicht (Code ist ready, Aktivierung = Crontab).

## 11 · Koordination

Neue Files unter `src/lib/health/**` + `src/app/api/cron/pipeline-health/` + `src/app/admin/health/page.tsx` + **eine additive Migration** (`health_check_runs`). Wiederverwendet (kein Edit): `dead-letter.ts`, `create-mitteilung.ts` (`createMitteilungMulti`), `email/google/client.ts` (`sendEmail`), `log_cron_job_run`, `state-machine.ts`, `v_claim_phase`. Disjunkt zu aktiven Sessions (admin-finance-guards/cron-audit-doc/kunde-reschedule berühren keine `src/lib/health`-Files oder die neue Tabelle). `/admin/health` ist neue Route ≠ admin-stats.
