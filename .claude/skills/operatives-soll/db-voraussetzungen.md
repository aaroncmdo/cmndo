# DB-Voraussetzungen — was in prod wahr sein muss, damit eine Matrix-Zelle funktioniert

Der Migrations-Abgleich (Files ↔ `schema_migrations`) prüft **Tabellen**. Die Betriebsfähigkeit eines
Features hängt an mehr: Grants je Spalte, Policies je Rolle, View-Spalten, RPC-Grants, enum-CHECKs,
Realtime-Publication, Buckets, deployte Edge Functions, pg_cron, Build-Env, `publicPaths`, Outbox.
Jede Achse hatte ihren stillen Bruch. **Vor dem Bau lesen, nicht annehmen** — MCP `execute_sql` ist dafür
da (nur READ; DDL ausschließlich über `apply_migration`, Regel 2).

## Zwei Fallen beim Lesen

* **MCP `execute_sql` läuft als `postgres`** und sieht durch die `v_claim_*`-Views **0 Zeilen** (der Filter
  `claim_sichtbar_fuer_aktuellen_user()` lässt nur App-User durch). Zeilen einer Rollen-Sicht misst man
  **als die Rolle** (Playwright-Login oder supabase-js mit dem Testkonto), nie über MCP.
* **Leer ist erst ein Befund, wenn die Abfrage vollständig war:** PostgREST liefert ohne Range 1.000 Zeilen,
  die GitHub-Secrets-API paginiert bei 30. Glatte Grenzwerte sind Alarm.

## Die Achsen

| # | Achse | Symptom, wenn es fehlt (real passiert) | Lese-Kommando (prod, READ) |
|---|---|---|---|
| 1 | **Spalten-Grant** (`claims` ist spaltenweise gegrantet) | Spalte für User-Clients unsichtbar; CI-Ratchet rot (#5813: 4 Spalten) | `select has_column_privilege('authenticated','public.claims','<spalte>','SELECT');` — und **den Kopf der jüngsten `*_grant_*`-Migration lesen**: dort steht, ob die Spalte bewusst intern ist |
| 2 | **RLS-Policy je Rolle** (positiv: existiert der Zweig der gemeinten Rolle?) | KB sah 28/81 Fälle leer — die Policy kannte `IS NULL`, die Funktion `can_access_claim()` nicht (#5773) | `select policyname, roles, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='<t>';` |
| 3 | **View-Spalte** (`v_claim_*`, `v_werkstatt_auftrag`, …) | Kernwert existiert in der Tabelle, aber nicht in der Sicht, die das Portal liest | `select column_name from information_schema.columns where table_schema='public' and table_name='<view>' order by ordinal_position;` |
| 4 | **RPC-Grant** (`security definer`-Funktionen) | Server-Action wirft 42501 | `select grantee, privilege_type from information_schema.routine_privileges where specific_schema='public' and routine_name='<fn>';` |
| 5 | **enum-CHECK** (`*_check`-Constraints) | Write wird still verworfen (`geplant` in `gutachter_termine`, `kanal='system'` 0/159) | `scripts/lib/status-check-constraints.json` + `npm run check:flag-drift`. Neuer Wert → **zuerst** Migration, dann Snapshot |
| 6 | **Realtime-Publication** | Listener feuert nie — der Dispatch-Lead-Alert war tot (4 Subscriptions, 03.09.) | `select * from pg_publication_tables where pubname='supabase_realtime' and tablename='<t>';` |
| 7 | **Storage-Bucket** | Upload schlägt fehl (`kanzlei-abrechnungen`, `onboarding-rechnungen` existierten nicht) | `select id, public from storage.buckets where id='<bucket>';` |
| 8 | **Edge Function deployed** | `functions.invoke` läuft ins Leere (`gutachten-ocr` nie deployed) | MCP `list_edge_functions` |
| 9 | **pg_cron-Job** (aktiv **und** versioniert) | Job existiert nur auf prod (25/26 unversioniert) oder nie (`task-eskalation` eskalierte nie) | `select jobname, schedule, active from cron.job where jobname ilike '%<x>%';` — neue Jobs nur mit Guard (`if exists (select 1 from pg_namespace where nspname='cron')`), sonst bricht der Preview-Replay |
| 10 | **Build-Env** (`NEXT_PUBLIC_*` zur **Build**-Zeit) | Pixel/Feature auf prod still tot; per `--update-env` nicht nachrüstbar | Deploy-Workflow `env:` + `pm2 describe <name>` — Prozess **per Name** auflösen, nie per geratener ID (id 0 ist Baileys, die App ist 862) |
| 11 | **`publicPaths`** (`src/lib/supabase/middleware.ts`) | neue Token-Route antwortet 307 trotz grüner Tests | Eintrag **mit** Slash prüfen; anon-`curl` ist Vorprüfung, kein Regel-4-Nachweis |
| 12 | **Outbox / Notification** | Kunde bekommt nichts — Fan-out adressierte `geschaedigter_user_id`, die noch NULL war (Neukunden 0/9) | Zeile in `docs/fundament/notification-matrix.md` (Event × Rolle × Kanal); nach dem Lauf `notification_deliveries.recipient_role`, `notifications_outbox.status`; interne Test-Identitäten → `email_log`, nie `nachrichten.template_key` |
| 13 | **Intake-Nachwirkungen** (Lead „kommt in die App") | Lead ohne FlowLink = Kunde ohne Weg zurück (Rückruf: 2/2) | Eingang läuft über `createCase` (Ratchet `check:intake-funnel`); die sechs Nachwirkungen aus `entry-points.md`: Fall · Pflichtdok · FlowLink · Erstnotification · Dedup · Reservierung |
| 14 | **Auth-Weiche** | Rolle landet nach Login im falschen Portal oder auf leerer Shell (Redirect-Stub) | `src/lib/auth/role-redirect.ts`; `npm run check:redirect-stubs` |

## So kommt es ins Blatt (Abschnitt 6b)

```
| Zelle | Achse | Kommando | Ergebnis (Datum) | Folge |
| Kunde sieht Tarif-Card | 1 Spalten-Grant | has_column_privilege('authenticated','public.claims','eigene_kasko_tarif_name','SELECT') | true (05.09.) | — |
| Dispatch-Alert bei neuem Lead | 6 Publication | pg_publication_tables … 'gutachter_finder_anfragen' | 0 Zeilen (03.09.) | Migration: Tabelle in Publication → Teil des Auftrags |
```

Fehlt eine Voraussetzung, ist sie **Auftrag** (Migration über MCP `apply_migration`, Datei nach getrackter
Version benennen, Types regenerieren — Regel 2), nicht Follow-up. Eine Config-Zeile wirkt sofort, Code erst
nach dem Deploy (`BROADCAST-config-migration-wirkt-sofort-code-erst-nach-deploy`): Reihenfolge im Blatt
festhalten.
