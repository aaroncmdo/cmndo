# Supabase-Selfhost-Migration (Ein-Server) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claimondo verlaesst Supabase komplett (DB, Auth/Logins inkl. MFA, Auth-E-Mails, Storage, Realtime, Edge Function) und laeuft self-hosted auf dem bestehenden — auf ≥8 GB hochgestuften — IONOS-VPS `212.132.119.110`; Zielkosten ~20–25 $/Mo statt ~85–95 $/Mo.

**Architecture:** Ein-Server-Setup (Aaron-Entscheidung 03.09.2026, SPOF bewusst akzeptiert): Der offizielle Supabase-Docker-Stack (Postgres 17 + Kong + GoTrue + PostgREST + Realtime + Storage-API, OHNE Studio/Analytics) laeuft per Docker Compose mit harten RAM-Limits NEBEN den 13 bestehenden pm2-Diensten. nginx (bestehend, 13 Vhosts) bekommt einen 14. Vhost `api.claimondo.de` als TLS-Front vor Kong (inkl. WebSocket fuer Realtime). JWT-Secret wird von Supabase uebernommen → alle Sessions/MFA-Faktoren/RLS-Policies funktionieren unveraendert, supabase-js bleibt, nur URL+Keys wechseln. Backups gehen zwingend OFFSITE (Ein-Server!). Grundlagen: `docs/2026-09-03-supabase-selfhost-kostenanalyse.md` (7 Gates) + `docs/2026-09-03-supabase-selfhost-inventar.md` (Phase-0-Inventar).

**Tech Stack:** Docker Compose (supabase/docker, Minimal-Profil), Postgres 17 (Supabase-Image — Pflicht wegen `supabase_vault`/`wrappers`/`pg_net`), nginx + certbot, pgbackrest ODER pg_dump+rclone (Offsite), pm2, GitHub Actions, Resend-SMTP fuer GoTrue.

## Global Constraints

- **Regel 1:** Nie direkt auf `main` pushen — Feature-Branches `kitta/aar-<nr>-<slug>`, PR gegen `staging`.
- **Regel 2:** Solange Supabase prod lebt, DDL NUR via `mcp__plugin_supabase_supabase__apply_migration` (getrackte Version ablesen, File exakt danach benennen). Task 12 definiert den Nachfolge-Workflow; bis dahin gilt Regel 2 unveraendert.
- **Regel 3:** Kein unbegleiteter Stash am Session-Ende.
- **NICHT auf Branch `kitta/aar-956-embed-reservierung-rueckruf` arbeiten** (2 fremde Sessions aktiv) — jeder Task nutzt einen frischen Branch von `origin/staging`.
- Frontend-Texte mit echten Umlauten (`ä/ö/ü/ß`); Backend/Docs ASCII erlaubt.
- prod-Messwerte Stand 03.09.2026: DB 224 MB, 227 Tabellen, 207 Auth-User (MFA aktiv), Storage 313 MB/16 Buckets, 26 pg_cron-Jobs, Realtime-Publication 22 Tabellen.
- Supabase-Projekt `paizkjajbuxxksdoycev` bleibt bis Task 14 unangetastet online (Rollback-Pfad).
- Vor JEDEM prod-Eingriff auf dem VPS: `free -h` pruefen — der Server swappt bis zum RAM-Upgrade (Task 2).

---

### Task 1: pm2-Reboot-Festigkeit herstellen (VOR dem RAM-Upgrade)

Das RAM-Upgrade (Task 2) rebootet den Server (Uptime 117 Tage!). Wenn pm2 nicht reboot-fest ist, sind danach ALLE 13 Dienste tot — inklusive prod-App.

**Files:** keine (Server-Ops auf `212.132.119.110`, SSH-Key `~/.ssh/claimondo_vps`).

**Interfaces:**
- Produces: reboot-sicherer pm2-Zustand; Task 2 darf erst nach gruenem Schritt 3 starten.

- [ ] **Step 1: Ist-Zustand pruefen**

Run: `ssh -i ~/.ssh/claimondo_vps root@212.132.119.110 "systemctl is-enabled pm2-root 2>&1; ls -la /root/.pm2/dump.pm2 2>&1"`
Expected: `enabled` + eine dump.pm2 mit aktuellem Datum. Wenn NICHT →

- [ ] **Step 2: pm2 startup + save setzen**

Run: `ssh -i ~/.ssh/claimondo_vps root@212.132.119.110 "pm2 startup systemd -u root --hp /root && pm2 save"`
Expected: `[PM2] Successfully saved in /root/.pm2/dump.pm2`

- [ ] **Step 3: Verifikation**

Run: `ssh -i ~/.ssh/claimondo_vps root@212.132.119.110 "systemctl is-enabled pm2-root && stat -c '%y' /root/.pm2/dump.pm2 && pm2 ls | grep -c online"`
Expected: `enabled`, Datum = heute, `13` online-Prozesse in der Dump-Abdeckung. Ergebnis in `docs/superpowers/plans/2026-09-03-supabase-selfhost-migration.md` als erledigt abhaken.

### Task 2: VPS auf ≥8 GB RAM hochstufen (AARON, IONOS-Panel)

**Files:** keine.

**Interfaces:**
- Consumes: Task 1 gruen (Reboot-Sicherheit).
- Produces: Server mit ≥8 GB RAM; alle Folge-Tasks setzen das voraus.

- [ ] **Step 1 (AARON): Upgrade buchen** — IONOS-Panel → Server & Cloud → VPS → Tarif-Upgrade auf mind. 8 GB RAM (VPS Linux L, ~15 $/Mo; falls 12–16 GB < 5 € Aufpreis: nehmen). Reboot in Randzeit (nach 22 Uhr) einplanen.

- [ ] **Step 2: Nach dem Reboot alle Dienste verifizieren**

Run: `ssh -i ~/.ssh/claimondo_vps root@212.132.119.110 "free -h; nproc; pm2 ls | grep -c online; curl -so /dev/null -w '%{http_code}' https://app.claimondo.de"`
Expected: `Mem: >= 7.8Gi total`, `13` online, HTTP `200`. Bei < 13 online: `pm2 resurrect`, dann Fehlerbild pro Dienst klaeren BEVOR weitergemacht wird.

### Task 3: Phase-0-Inventar als Migrationen versionieren (cron-Jobs, Publication, Extensions)

Macht die prod-DB erstmals VOLLSTAENDIG aus dem Repo reproduzierbar — Voraussetzung fuer Task 8 und die CI in Task 12. Unabhaengig mergebar und auch bei Supabase-Verbleib wertvoll.

**Files:**
- Create: `supabase/migrations/<V1>_versioniere_pg_cron_jobs.sql` (Dateiname = von apply_migration getrackte Version!)
- Create: `supabase/migrations/<V2>_versioniere_realtime_publication.sql`
- Create: `supabase/migrations/<V3>_versioniere_extensions.sql`

**Interfaces:**
- Consumes: SQL-Vorlagen aus `docs/2026-09-03-supabase-selfhost-inventar.md` §1–§3 (dort vollstaendig ausformuliert: 23 `cron.schedule`-perform-Aufrufe im pg_cron-Guard-DO-Block; Publication-foreach ueber die 22 Tabellen; `create extension if not exists`-Zeilen fuer die 10 Extensions mit exakten Schemas, `pg_trgm` → `schema public`).
- Produces: 3 getrackte Migrationen; `select count(*) from cron.job` bleibt 26, `pg_publication_tables` bleibt 22 — die Migrationen sind idempotent (Bestand wird nur re-registriert, nicht dupliziert).

- [ ] **Step 1: Branch anlegen** — `git fetch origin staging && git checkout -b kitta/aar-957-supabase-inventar-versionierung origin/staging` (Ticket-Nr. anpassen falls AAR-957 vergeben; Linear-Issue anlegen).
- [ ] **Step 2: Migration 1 anwenden** — `apply_migration({ name: "versioniere_pg_cron_jobs", query: "<DO-Block aus Inventar §1>" })`, danach `list_migrations` → Version `<V1>` ablesen.
- [ ] **Step 3: Verifikation** — `execute_sql`: `select count(*) from cron.job;` Expected: `26` (unveraendert — idempotent).
- [ ] **Step 4: Migration 2 + 3 analog** (Publication-Block §2, Extensions-Zeilen §3); Versionen `<V2>`, `<V3>` ablesen; Verifikation: `select count(*) from pg_publication_tables where pubname='supabase_realtime';` → `22`; `select count(*) from pg_extension;` → `10`.
- [ ] **Step 5: Files committen** — die 3 SQL-Files exakt als `<V>_<name>.sql` ins Repo, Commit `feat(db): pg_cron-Jobs + Realtime-Publication + Extensions versioniert (Selfhost Phase 0)` mit 7-Punkte-Audit-Block, PR gegen `staging`.

### Task 4: Die 4 toten Realtime-Subscriptions + 2 fehlende Buckets fixen

**Files:**
- Modify: `src/hooks/useGeoTracking.ts:126` (abonniert `sv_live_location`)
- Modify: `src/app/dispatch/_components/RealtimeLeadAlert.tsx:63,81` (abonniert `gutachter_finder_anfragen`)
- Modify: `src/app/gutachter/GutachterShell.tsx:315` (abonniert `gutachter_mitteilungen`)
- Modify: `src/components/claims/InvitationStatusBadge.tsx:46` (abonniert `airdrop_invitations`)
- Create: `supabase/migrations/<V4>_realtime_publication_fehlende_tabellen.sql`
- Modify: `src/lib/abrechnung/kanzlei/generate-pdf.tsx:226` (Bucket `kanzlei-abrechnungen`)
- Modify: `src/lib/pdf/onboarding-rechnung.tsx:262` (Bucket `onboarding-rechnungen`)

**Interfaces:**
- Consumes: Publication-Stand aus Task 3.
- Produces: Code-Subscriptions == Publication (0 tote Listener); alle im Code referenzierten Buckets existieren. Cutover-Smokes (Task 13) testen sonst gegen kaputte Referenz.

- [ ] **Step 1: Je Subscription entscheiden (Standard: Tabelle in Publication aufnehmen, WENN das Feature laut Linear/Owner leben soll; sonst Subscription-Code entfernen).** Sonderfall `useGeoTracking.ts`: Code sagt `sv_live_location`, Publication hat `sv_live_position`, der cron-Job `cmm36` loescht aus `sv_live_location` — BEIDE Tabellen existieren. Erst klaeren, welche die lebende ist: `execute_sql`: `select 'location' t, count(*), max(updated_at) from sv_live_location union all select 'position', count(*), max(created_at) from sv_live_position;` — die Tabelle mit aktuellen Timestamps gewinnt; Code/Job auf SIE vereinheitlichen.
- [ ] **Step 2: Publication-Migration** via `apply_migration` (nur fuer die als „soll leben" entschiedenen Tabellen), File committen.
- [ ] **Step 3: Buckets anlegen** — `execute_sql` ist hier falsch (Storage-API): im Supabase-Dashboard → Storage → New bucket: `kanzlei-abrechnungen` (private) + `onboarding-rechnungen` (private) MIT denselben RLS-Policies wie `abrechnungen-pdf` (Vorlage kopieren). Alternativ Code auf existierende Buckets umstellen — Entscheidung im PR dokumentieren.
- [ ] **Step 4: Verifikation** — `execute_sql`: `select name from storage.buckets order by 1;` Expected: enthaelt beide neuen Namen. Manuell: Dispatch-Portal oeffnen, neuen Test-Lead anlegen → RealtimeLeadAlert feuert.
- [ ] **Step 5: Commit + PR** (`fix(realtime+storage): tote Subscriptions und fehlende Buckets`).

### Task 4b: DB-Optimierungspaket (via apply_migration auf prod — der Umzug ERBT alles)

Messbasis 03.09.2026 (`pg_stat_statements` seit Projektstart): **Realtime-WAL-Poll = groesster DB-Verbraucher** (392.002 Calls, 11.622 s = 3,2 h total, Ø 29,65 ms — Faktor ~47 zum Zweitplatzierten); 59 MB Bloat `job_run_details` (0 rows) + 1,7 MB `plz_geo` (0 rows) = 27 % der DB; 271 nie gescannte Non-Unique-Indexe (11 MB); 27 FKs ohne Index; 17/349 RLS-Policies mit per-row `auth.uid()`; 9 Tabellen `REPLICA IDENTITY FULL`; `gutachten_ocr_recovery` + `exif_worker` laufen alle 5 Min (OCR-Feature existiert nicht).

**Files:**
- Create: `supabase/migrations/<V>_realtime_diaet_publication_und_replica_identity.sql`
- Create: `supabase/migrations/<V>_rls_authuid_initplan_17_policies.sql`
- Create: `supabase/migrations/<V>_fk_indexe_public.sql`
- Create: `supabase/migrations/<V>_index_drop_liste_und_retention.sql`

**Interfaces:**
- Consumes: Task-4-Entscheidungen (welche Realtime-Tabellen leben); Regel 2 (apply_migration).
- Produces: messbar niedrigere DB-Grundlast VOR dem Umzug (P4-Baseline im Testplan) — senkt zugleich die Compute-Anforderung an den VPS-Stack.

- [ ] **Step 1: Realtime-Diaet** — (a) Publication von 22 auf die tatsaechlich abonnierten Tabellen stutzen (`alter publication supabase_realtime drop table only public.<nie-abonniert>` fuer die 7 ungenutzten — Abgleich mit Code-Scan-Liste im Kostenanalyse-Anhang); (b) `REPLICA IDENTITY FULL → DEFAULT` erst NACH Task 11b-A: Der Code-Scan (03.09., staging) fand genau EINEN `payload.old`-Blocker (`src/app/kunde/_components/useKundeUnreadByKanal.ts:70-73` liest `oldRow.gelesen` — bricht STILL, weil der `!oldRow`-Guard `{id}` durchlaesst) plus die zweite Achse: server-seitige `filter:` werden bei DELETE-Events gegen `old` ausgewertet — 6 Stellen mit `event:'*'` + Nicht-PK-Filter (Liste in Task 11b-A) koennten DELETE-Events verlieren. Erst 11b-A fixen/verifizieren, dann umstellen.
- [ ] **Step 2: 17 RLS-Policies auf `(select auth.uid())`** — Liste generieren: `select schemaname, tablename, policyname from pg_policies where (coalesce(qual,'')||coalesce(with_check,'')) like '%auth.uid()%' and (coalesce(qual,'')||coalesce(with_check,'')) not like '%SELECT auth.uid()%';` → je Policy `drop policy` + `create policy` mit InitPlan-Form (Supabase-Skill-Pattern).
- [ ] **Step 3: FK-Indexe** — nur public-Schema (auth/storage sind Systemschemas: NICHT anfassen): u.a. `claims.kanzlei_id`, `claims.netzwerk_owner_id`, `profiles.kanzlei_id`, `profiles.netzwerk_owner_id`, `sv_leads.levelup_letzter_check_id` — vollstaendige Liste per Query aus der Messung; `create index concurrently` geht nicht in Transaktions-Migration → normale `create index` (Tabellen sind klein, Lock-Zeit ms).
- [ ] **Step 4: Index-Drops + Retention + tote Jobs** — (a) Drop-Liste NUR public-Indexe mit 0 Scans seit Maerz UND ohne Constraint-Funktion, im PR einzeln begruendet (Kandidaten: `levelup_anreicherung_lead_idx`, `plz_geo_lat_lng_idx`, `idx_werkstaetten_trgm_name`, `idx_benachrichtigungen_user_unread`, `idx_ai_usage_log_created_endpoint`, `gfa_status_erstellt_idx`); (b) Retention-Job fuer `cron.job_run_details` (> 7 Tage loeschen), `cron_jobs_audit` + `health_check_runs` (> 90 Tage); (c) `gutachten_ocr_recovery`-Job **unschedule** (Feature nie deployed — konsistent mit Task 11 OCR-Bereinigung; Inventar-Doc §1 nachfuehren!); `exif_worker_trigger`-Frequenz mit Owner klaeren; (d) `plz_geo` klaeren: befuellen (haengt mit dem Werkstattsuche-Distanz-Befund zusammen, `AUDIT-werkstattsuche-sortiert-alphabetisch`) ODER droppen — Entscheidung im PR.
- [ ] **Step 5: Wirkung messen** — 48 h spaeter `pg_stat_statements`-Top-10 erneut: Realtime-Poll-`ms_mean` und Gesamtanteil deutlich gesunken; Werte in P4-Baseline des Abnahme-Testplans eintragen.

**Bewusst NICHT (YAGNI bei 224 MB / 133 MAU):** Partitionierung, Read-Replicas, Materialized Views, zusaetzlicher Pooler. Der Restore beim Umzug liefert VACUUM FULL + frische Indexe gratis; Config-Rightsizing auf NEU (max_connections 120→60, shared_buffers 512 MB — die GANZE DB passt in den Cache, `log_min_duration_statement=500ms`) steht in Task 6.

### Task 5: GATE — Repo-Public-Lage + Secret-Hygiene (AARON-Entscheidung)

Hartes Gate aus der Analyse (§6 Gate 4): Neue selbstverwaltete Secrets (JWT-Secret-Kopie, DB-Passwoerter, service_role) duerfen nicht entstehen, solange das Repo public mit prod-Credentials ist.

- [ ] **Step 1 (AARON):** Repo auf private stellen ODER dokumentierte Entscheidung, warum nicht.
- [ ] **Step 2:** Die 175 bekannten Credential-Dateien (siehe `BROADCAST-repo-public-blocker-prod-credentials.md` im Memory) — Rotation-Status pruefen: alles, was der neue Stack erbt (DB-Passwort, CRON_SECRET, Resend-Key), MUSS nach Repo-Privatstellung rotiert sein.
- [ ] **Step 3:** Ab hier gilt: Alle neuen Stack-Secrets NUR in `/root/claimondo-supabase/.env` auf dem VPS (chmod 600) + GitHub-Actions-Secrets — NIEMALS im Repo. Check vor jedem Commit: `git diff --cached | grep -iE 'secret|password|jwt' → manuell sichten`.

### Task 6: Supabase-Docker-Stack auf dem VPS aufsetzen (localhost-only)

**Files (auf dem VPS):**
- Create: `/root/claimondo-supabase/docker-compose.yml` + `/root/claimondo-supabase/.env`

**Interfaces:**
- Consumes: ≥8 GB RAM (Task 2); Docker fehlt noch auf dem Server.
- Produces: Laufender Stack auf `127.0.0.1:8000` (Kong); Postgres auf `127.0.0.1:5432`; `.env` mit `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`. Task 7–9 bauen darauf.

- [ ] **Step 1: Docker installieren** — `ssh … "curl -fsSL https://get.docker.com | sh && docker --version"` Expected: `Docker version 2x.x`.
- [ ] **Step 2: Offizielle Compose-Vorlage ziehen** — `git clone --depth 1 https://github.com/supabase/supabase /root/supabase-src && cp -r /root/supabase-src/docker /root/claimondo-supabase`. WICHTIG (Supabase-Skill-Regel): Die Vorlage aendert sich — IMMER die frisch geklonte nutzen, nicht eine aus Doku/Gedaechtnis.
- [ ] **Step 3: Minimal-Profil konfigurieren** — in der compose die Dienste `studio`, `analytics` (Logflare), `vector`, `imgproxy` (wir transformieren keine Bilder serverseitig — verifizieren: 0 `transform`-Optionen im Code-Scan) auskommentieren. Jedem verbleibenden Dienst RAM-Limit setzen (compose `deploy.resources.limits.memory` wird von `docker compose` ignoriert → `mem_limit` nutzen): `db: 2g`, `kong: 512m`, `realtime: 512m`, `auth: 256m`, `rest: 256m`, `storage: 256m`. Alle Port-Mappings auf `127.0.0.1:` binden (`127.0.0.1:8000:8000`, `127.0.0.1:5432:5432`) — NICHTS direkt public.
- [ ] **Step 4: `.env` fuellen** — `POSTGRES_PASSWORD` neu generieren (`openssl rand -base64 32`); **`JWT_SECRET` = der Wert aus Supabase-Dashboard → Project Settings → API → JWT Secret** (AARON kopiert ihn; DAS ist der Schluessel, der alle 207 Logins + MFA nahtlos weiterleben laesst); `ANON_KEY`/`SERVICE_ROLE_KEY` mit diesem Secret neu signieren (Script in der Compose-Doku: `docker/README` bzw. supabase.com/docs/guides/self-hosting → „Generate API Keys" — die Rollen-Claims `role: anon` / `role: service_role` muessen exakt stimmen); GoTrue-SMTP: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=<RESEND_API_KEY>`, `SMTP_SENDER_NAME=Claimondo`, `GOTRUE_SMTP_ADMIN_EMAIL=noreply@claimondo.de`; `SITE_URL=https://app.claimondo.de`; `API_EXTERNAL_URL=https://api.claimondo.de`.
- [ ] **Step 5: Stack starten + verifizieren**

Run: `cd /root/claimondo-supabase && docker compose up -d && sleep 30 && docker compose ps --format '{{.Name}} {{.Status}}' && curl -s 127.0.0.1:8000/auth/v1/health && free -h`
Expected: alle Dienste `Up (healthy)`, Auth-Health `{"date":...}`, RAM-Verbrauch gesamt +2–3 GB, `available` weiterhin > 2 GB. Wenn `available < 1 GB` → mem_limits nachziehen BEVOR weitergemacht wird.

### Task 7: nginx-Vhost `api.claimondo.de` (TLS-Front vor Kong, WebSocket-faehig)

**Files (VPS):**
- Create: `/etc/nginx/sites-available/api.claimondo.de` (+ Symlink in sites-enabled)

**Interfaces:**
- Consumes: Kong auf `127.0.0.1:8000` (Task 6).
- Produces: `https://api.claimondo.de` als neue `NEXT_PUBLIC_SUPABASE_URL` — Browser-Clients (Auth, PostgREST, Storage, Realtime-WSS) laufen darueber.

- [ ] **Step 1 (AARON oder DNS-Zugang): DNS-A-Record** `api.claimondo.de → 212.132.119.110`.
- [ ] **Step 2: Vhost anlegen**

```nginx
server {
  server_name api.claimondo.de;
  listen 80;
  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # Realtime-WebSocket
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;                    # lange WS-Verbindungen
    client_max_body_size 50m;                    # Storage-Uploads (Fotos/PDFs)
  }
}
```

- [ ] **Step 3: TLS via certbot** — `certbot --nginx -d api.claimondo.de --non-interactive --agree-tos -m aaron.sprafke@claimondo.de && nginx -t && systemctl reload nginx`. ⚠ Lehre `AUDIT-staging-tls-zertifikat-abgelaufen`: `systemctl list-timers | grep certbot` muss einen aktiven Renewal-Timer zeigen — explizit pruefen.
- [ ] **Step 4: Verifikation** — `curl -s https://api.claimondo.de/auth/v1/health` → `{"date":...}`; `curl -s -o /dev/null -w '%{http_code}' -H 'apikey: <ANON_KEY>' 'https://api.claimondo.de/rest/v1/'` → `200`.

### Task 8: Daten-Generalprobe — pg_dump-Restore + Storage-Sync + Zaehl-Verifikation

**Files:**
- Create: `scripts/selfhost/dump-prod.sh`, `scripts/selfhost/sync-storage.mjs`, `scripts/selfhost/verify-counts.sql` (im Repo, Branch `kitta/aar-958-selfhost-generalprobe`)

**Interfaces:**
- Consumes: laufender Stack (Task 6/7); Supabase-DB-Connstring (Dashboard → Database → Connection string, Session mode).
- Produces: bewiesene Restore-Prozedur + Zaehlwerte-Abgleich; Task 13 nutzt exakt diese Scripts im Cutover.

- [ ] **Step 1: Dump-Script** — `dump-prod.sh`: `pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --exclude-schema=supabase_migrations_backup --format=custom -f prod.dump` PLUS `pg_dumpall --roles-only` fuer die Rollen-Passwoerter? NEIN — Rollen legt das Supabase-Image selbst an (supabase_admin, authenticator, service_role …); wir restoren NUR Daten/Schema in die vorhandene Rollenwelt: `pg_restore --no-owner --role=postgres -d "$LOCAL_DB_URL" prod.dump`. Schemas `public`, `auth`, `storage`, `monitoring`, `vault` einschliessen (`vault`: nur Struktur — das eine Secret `cron_secret` wird manuell neu geseedet, Wert aus altem Vault via Dashboard).
- [ ] **Step 2: Storage-Sync-Script** — `sync-storage.mjs` (Node, `@supabase/supabase-js`): fuer jeden der 16 Buckets `storage.from(b).list()` rekursiv auf ALT (service_role alt) → `download()` → `upload()` auf NEU (service_role neu, `https://api.claimondo.de`); Bucket-Definitionen (public-Flag!) vorher via `select id, name, public from storage.buckets` uebertragen. 1.896 Objekte / 313 MB ≈ Minuten.
- [ ] **Step 3: Probe fahren** — Dump → Restore → Sync ausfuehren, Dauer notieren (Ziel: < 15 Min gesamt).
- [ ] **Step 4: Verifikation `verify-counts.sql` auf ALT und NEU ausfuehren und Zeile fuer Zeile vergleichen:**

```sql
select 'tables' k, count(*) v from pg_tables where schemaname='public'
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'policies', count(*) from pg_policies
union all select 'auth_users', count(*) from auth.users
union all select 'mfa_factors', count(*) from auth.mfa_factors
union all select 'storage_objects', count(*) from storage.objects
union all select 'cron_jobs', count(*) from cron.job
union all select 'publication_tables', count(*) from pg_publication_tables where pubname='supabase_realtime'
union all select 'claims', count(*) from public.claims
union all select 'leads', count(*) from public.leads;
```
Expected: identische Werte (Stand 03.09.: tables 227, policies ~486+, auth_users 207, storage_objects 1896, cron_jobs 26, publication 22 ± Task-4/4b-Aenderungen).

- [ ] **Step 5: Volle Abnahme-Suite P1+P2** gemaess `docs/superpowers/specs/2026-09-03-selfhost-abnahme-testplan.md` (Paritaet inkl. Checksummen/Sequenzen + Auth/RLS/Storage/Realtime/RPC/Cron/Mail-Funktionstests) — die Suite wird hier zum ERSTEN Mal komplett gefahren; Befunde fixen, bis gruen.

### Task 9: Auth-Generalprobe — Login, MFA, Passwort-Reset gegen den neuen Stack

**Interfaces:**
- Consumes: restoreter Stack (Task 8), Test-Accounts aus `reference-internal-test-account-logins.md` (Memory; ⚠ `seed-test-2fa.mjs` NIE starten).
- Produces: Beweis, dass JWT-Uebernahme + MFA + Mails funktionieren — DER kritische Migrations-Beweis.

- [ ] **Step 1: Lokalen App-Build gegen neuen Stack starten** — `.env.local`: `NEXT_PUBLIC_SUPABASE_URL=https://api.claimondo.de`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<neu>`, `SUPABASE_SERVICE_ROLE_KEY=<neu>` → `npm run dev`.
- [ ] **Step 2: Passwort-Login** mit SMOKE-Admin-Konto → Expected: Login ok, Dashboard laedt (PostgREST + RLS greifen).
- [ ] **Step 3: MFA-Pfad** — Konto mit aktivem TOTP-Faktor: Challenge erscheint, korrekter Code → AAL2, Middleware laesst durch. (Beweist: mfa_factors + JWT_SECRET-Uebernahme korrekt.)
- [ ] **Step 4: Passwort-Reset-Mail** — `resetPasswordForEmail` gegen Test-Konto → Expected: Mail kommt via Resend an (`email_log` prueft nur eigene Mails — hier den Resend-Dashboard-Eintrag pruefen), Link zeigt auf `SITE_URL`.
- [ ] **Step 5: Realtime** — Dispatch-Ansicht offen, per SQL einen Test-Lead inserten → Alert feuert (beweist WSS durch nginx).

### Task 10: Offsite-Backup-Kette + externes Monitoring (VOR dem Cutover, nicht danach)

**Interfaces:**
- Consumes: laufender Stack.
- Produces: taegliches Offsite-Backup MIT bewiesenem Restore; Alerts in gelesenes Postfach. Ersetzt Supabase-PITR. Ein-Server-Setup macht das nicht verhandelbar.

- [ ] **Step 1 (AARON): Offsite-Ziel beschaffen** — Hetzner Storage Box BX11 (1 TB, ~3,80 €/Mo) o.ae.
- [ ] **Step 2: Backup-Cronjob (VPS-Crontab, 03:30)** — `pg_dump --format=custom` + `tar` des Storage-Volumes + `rclone copy` zur Storage Box, 30 Tage Retention, danach `curl -fsS https://hc-ping.com/<uuid>` (Healthchecks.io, free) — ⚠ Lehre `tote Postfaecher`: Der Ping-Alarm geht an eine Mail, die Aaron TAEGLICH liest.
- [ ] **Step 3: Restore-Test** — Backup von der Storage Box zurueckholen und in einen Wegwerf-Container restoren, `verify-counts.sql` gruen. Erst dieser Schritt schliesst den Task ab — ein ungetestetes Backup existiert nicht.
- [ ] **Step 4: Externes Uptime-Monitoring** — UptimeRobot (free) auf `https://api.claimondo.de/auth/v1/health` + `https://app.claimondo.de`, Alert-Mail wie oben.

### Task 11: App-Anpassungen — Webhook-Portierung, ENV-Matrix, Cleanup

**Files:**
- Create: `src/app/api/webhooks/elementor-lead/route.ts` (Port von `supabase/functions/elementor-lead-webhook/index.ts`, 288 Zeilen — gleiche Payload-Validierung, gleicher `WEBHOOK_API_KEY`-Check, Insert via `createAdminClient()`)
- Modify: `src/lib/gutachten/ocr-actions.ts:96,166` — die 3 `functions.invoke('gutachten-ocr')`-Aufrufe entfernen/stubben (Funktion war NIE deployed, AAR-846 nie gebaut → toter Pfad; im PR dokumentieren)
- Create: `docs/superpowers/specs/2026-09-XX-selfhost-env-matrix.md` — Tabelle ALLER Stellen, an denen die 3 Supabase-ENVs leben: GitHub-Actions-Secrets (deploy-vps.yml, deploy-vps-staging.yml, journey-gate), VPS-`.env`s (prod + staging pm2), lokale `.env.local`s, `scripts/`-Consumer (78 Dateien!)

**Interfaces:**
- Produces: Ab Cutover braucht kein Codepfad mehr die Supabase-Cloud; die ENV-Matrix ist die Checkliste fuer Task 13 Step 3.

- [ ] **Step 1: Webhook-Route schreiben** (Test: `curl -X POST localhost:3000/api/webhooks/elementor-lead -H 'x-api-key: …' -d '<Beispiel-Payload aus supabase/functions/elementor-lead-webhook/index.ts>'` → 200 + Lead in DB).
- [ ] **Step 2 (AARON/extern): Elementor-Formular-Webhook-URL umstellen** — von `https://paizkjajbuxxksdoycev.supabase.co/functions/v1/elementor-lead-webhook` auf `https://app.claimondo.de/api/webhooks/elementor-lead`. Kann VOR dem Cutover passieren (Route schreibt via Admin-Client in dieselbe DB — solange Supabase lebt, zeigt der Admin-Client eben noch dorthin).
- [ ] **Step 3: OCR-Aufrufe bereinigen + ENV-Matrix-Doku erstellen, PR.**

### Task 11b: Code-Optimierung gegen das optimierte Schema (Befunde der zwei Struktur-Scans 03.09., staging-Stand `37dc558c2`)

Reale Zahlen (staging, nicht der stale Branch): 526 `getUser()`-Calls in 377 Dateien; 1.075 `createAdminClient()`-Sites; 33 RPCs/53 Sites; 30 Realtime-Channel-Dateien (0 Leaks — 10 via `subscribeWhenAuthed` gekapselt).

**Block A — BLOCKER fuer Task 4b Step 1b (vor der REPLICA-IDENTITY-Umstellung):**
- [ ] `src/app/kunde/_components/useKundeUnreadByKanal.ts:70-73` — Handler auf `newRow.gelesen === true` + Re-Fetch umstellen; `oldRow.gelesen`-Lesung entfernen (mit DEFAULT waere `old` nur `{id}`, der Guard `if (!oldRow)` greift nicht, der Ungelesen-Zaehler des Kunden korrigiert sich still nie mehr nach unten).
- [ ] DELETE-Filter-Achse EMPIRISCH verifizieren (1 Testtabelle auf DEFAULT stellen, DELETE mit Nicht-PK-`filter:` ausloesen, Event-Zustellung messen). Betroffene 6 Stellen: `dispatch/rueckrufe/RueckrufeRealtimeRefresher.tsx:32`, `components/shared/LeadRealtimeRefresh.tsx:69,75`, `components/shared/fall-mitteilungen/FallMitteilungenBanner.tsx:78`, `components/fall/FallRealtimeRefresh.tsx:70,78`, `hooks/useGeoTracking.ts:127`, `gutachter/feldmodus/SvFallakteView.tsx:137`. Ergebnis entscheidet, welche Tabellen FULL bleiben muessen.

**Block B — vor dem Cutover (senkt die Grundlast, die der VPS-Stack tragen muss):**
- [ ] **PostgREST-1000-Live-Fixes** (eigene PRs, unabhaengig vom Umzug Geschaeftsschaden): `src/lib/onboarding/svMatching.ts:91` + `src/lib/sv-matching-modul/lade-deadpin-fallback.ts:76` (SV-Matching sieht nur willkuerliche 1.000/10.019 — auf `alleSeiten()` aus `src/lib/db/alle-seiten.ts:39` umstellen ODER Distanzfilter in die Query), `src/app/admin/kalender/page.tsx:11` (719/1.719 Termine fehlen), **`src/app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts:192` VOR dem Isochronen-Backfill der SV-Leads-Lane**.
- [ ] **`cache()`-gewrappter `getCurrentUser()`** in `src/lib/supabase/server.ts` (React `cache` — aktuell nur 2 cache()-Stellen im ganzen src/, keine fuer Auth); `requirePortalAccess` (`portal-guard.ts:60`) + `requireAuth`/`requireRole` darauf umstellen. Der Kunden-Pfad macht heute 3× getUser + 5 profiles-Selects pro Request; Ziel: 1×+1×. NICHT die 352 rohen Call-Sites umschreiben — der Helper-Hebel reicht, Call-Site-Migration ist Boy-Scout.
- [ ] **Wildcard-Konsolidierung Gutachter-Portal:** 3 parallele ungefilterte `nachrichten`-Abos pro Seite (`GutachterShell.tsx:336-340`, `GlobalPosteingangFab.tsx:58`, `useUpdates.ts:58-60`) → ein Layout-Channel, der die drei Consumer bedient. Jede Nachrichten-Aenderung loest heute 3 Refetches aus.
- [ ] **`select('*')`-Hotspot:** `src/lib/sv-basic/claim-actions.ts:224` — 4 Felder statt `*` (zieht heute das ~18k-Punkte-`isochrone_polygon` mit).

**Block C — Wartungspaket nach dem Cutover (Struktur, kein Cutover-Risiko):**
- [ ] `createAdminClient()` (`src/lib/supabase/admin.ts:8`) als Modul-Singleton (stateless: `autoRefreshToken:false, persistSession:false`; 1.075 Sites profitieren ohne Umbau); `createServiceClient` (`server.ts:11`, 43 Sites) auf `createAdminClient` deduplizieren.
- [ ] N+1-Crons batchen: `api/cron/pflichtdokumente-reminder/route.ts:63` (~850 serielle Roundtrips/Lauf — Treiber filtern + Batch-Hydration wie `admin/faelle/(hub)/page.tsx:125-171`), `api/cron/send-reminders/route.ts:44,60`; Muster-Vorbild mit `.limit(BATCH_CAP)`: `api/cron/cold-mailer-advance/route.ts:56`.
- [ ] Promise.all-Konsistenz (108 vermeidbare Roundtrips): `gutachter/GutachterShell.tsx:294-317`, `mitarbeiter/page.tsx:49-73`, `faelle/[id]/page.tsx:876-898`, `lib/partner-rang/signals.ts:25-48`, `lib/flotte/flotten-claim-detail.ts:68-93`.
- [ ] Admin-Faelle-Hub (`admin/faelle/(hub)/page.tsx:69-90`) — einzige Hauptliste ohne Limit → `.limit()` + Nachlade-Pfad.
- [ ] **6 RPC-Divergenzen aufloesen** (je eigenes Ticket — zwei Wahrheiten im Code): (1) `count_unread_updates`: kanonischer Leser tot, 3 divergente Handzaehlungen → Badge-Konsolidierung (nutzersichtbar: Chat-Badge bleibt stehen); (2) `apply_gutachten_ocr` COALESCE loescht nie vs. Direktpfad loescht (wird mit Task-11-OCR-Bereinigung teilobsolet — konsistent aufloesen); (3) `link_lead_data_to_fall` haengt stornierte Termine an (kein Status-Filter, Legacy-`fall_id`-Achse); (4) `get_aktueller_gt_termin_id`: 3 Definitionen, RPC matcht Legacy-`claim_id` (47/58 NULL) — bekannte Termin-Legacy-Klasse; (5) `increment_offene_faelle` fuer alle Leser wirkungslos (Fallback greift nie, Feld init 0) → RPC + Aufruf entfernen; (6) `check_gfa_rate_limit`: 2 Sites mit Namespace-Bucket, 2 ohne — vereinheitlichen (Namespace-Trennung ist dokumentierte Absicht in `claim-actions.ts:36`).

### Task 12: DDL-Workflow-Ersatz + CI ohne Preview-Branches (Regel-2-Neufassung)

**Files:**
- Create: `scripts/db/migrate.mjs` — Migrations-Runner: liest `supabase/migrations/*.sql` sortiert, fuehrt fehlende gegen `DATABASE_URL` in Transaktion aus, traegt sie in `supabase_migrations.schema_migrations` ein (KOMPATIBEL zur bestehenden Tabelle — Historie bleibt eine Linie)
- Create: `.github/workflows/db-migrate.yml` — Job auf `staging`-Push: laeuft NACH Review, per SSH auf den VPS, `node scripts/db/migrate.mjs` gegen die lokale DB
- Modify: bestehender PR-CI-Workflow — Wegwerf-Postgres (`supabase/postgres`-Image als Service-Container) + kompletter Migrations-Replay als Gate
- Modify: `AGENTS.md` — Regel 2 neu: „DDL nur als Migrations-File via `scripts/db/migrate.mjs`; nie raw psql auf prod"

**Interfaces:**
- Consumes: vollstaendige Reproduzierbarkeit aus Task 3 (sonst repliziert die CI eine falsche DB).
- Produces: Der Workflow, mit dem ab Cutover JEDE Schema-Aenderung laeuft. MUSS vor Task 13 gruen sein — sonst Drift ab Tag 1.

- [ ] **Step 1: Runner schreiben + lokal testen** (gegen Task-6-Stack: bereits applizierte 1.260+ Migrationen werden als vorhanden erkannt, 0 ausgefuehrt; eine neue Dummy-Migration wird ausgefuehrt und getrackt, danach wieder entfernt).
- [ ] **Step 2: PR-CI-Replay** — frischer Container, alle Migrationen von 0 → Expected: gruen durchgelaufen (DAS beweist Task 3 endgueltig; bekannte Replay-Fallen: `cron.schedule`-Guard, harte UUIDs — beide Klassen sind als Memory-Broadcasts dokumentiert und werden hier zum ersten Mal systematisch erwischt).
- [ ] **Step 2b (empfohlen): Baseline-Squash** — statt 1.260 Files ewig zu replayen: `pg_dump --schema-only --no-owner` des optimierten prod-Stands als `supabase/migrations-baseline/0000_baseline.sql`; der Runner (Step 1) lernt: leere Ziel-DB → Baseline einspielen + alle historischen Versionen als applied markieren; bestehende DBs → nur Delta. Alte Migrations-Files wandern nach `supabase/migrations-archiv/` (Historie bleibt im Git). Tilgt ALLE Replay-Fallen auf einen Schlag und macht den CI-Lauf sekundenschnell. Nur zusammen mit gruenem Step 2 einfuehren (der Squash-Stand muss dem Replay-Stand entsprechen — einmal beides bauen und `pg_dump --schema-only` beider Ergebnisse diffen).
- [ ] **Step 3: AGENTS.md-Neufassung im selben PR** (tritt erst mit Cutover in Kraft — bis dahin Banner „ab Cutover gueltig").

### Task 13: Cutover (Wartungsfenster nachts, 30–60 Min)

**Interfaces:**
- Consumes: ALLE Tasks 1–12 gruen + Aaron-GO fuer den Termin.
- Produces: prod laeuft self-hosted; Supabase nur noch Rollback-Reserve.

- [ ] **Step 0 (Vortag): Ankuendigung + Rollback-Kriterien fixieren** — Abbruch, wenn: Login/MFA rot, verify-counts differiert, Realtime tot, oder Fenster > 90 Min.
- [ ] **Step 1: Maintenance an** — pm2 stop der App-Prozesse (claimondo-v2, -staging), nginx-Maintenance-Page.
- [ ] **Step 2: Final-Sync** — `dump-prod.sh` + `pg_restore` (DB vorher droppen/neu) + `sync-storage.mjs` (Delta) + `vault`-Secret seeden; `verify-counts.sql` ALT vs NEU → identisch.
- [ ] **Step 3: ENV-Rollout nach Matrix (Task 11)** — GitHub-Secrets, VPS-`.env`s: URL → `https://api.claimondo.de`, neue Keys; `pm2 restart` App-Prozesse.
- [ ] **Step 4: Abnahme-Suite komplett** — P1–P4 aus `docs/superpowers/specs/2026-09-03-selfhost-abnahme-testplan.md` (Paritaet, Subsystem-Tests, Journey-Gate + Kundenfluss-Smoke + Token-Strecken, Performance-Paritaet). P5 (Rollback-Beweis) wurde bereits in der Generalprobe erbracht. Rote P1/P2 = Abbruch nach Step-0-Kriterien.
- [ ] **Step 5: Beobachtung 48 h** — `docker stats`, `free -h`, Healthchecks gruen; Supabase-Projekt NICHT anfassen (Rollback = ENVs zurueckdrehen, Daten-Delta seit Cutover manuell nachziehen — Kriterium und Verfahren VOR dem Fenster in `docs/` notiert).

### Task 14: Nachlauf — Supabase abbauen (fruehestens +14 Tage stabil)

- [ ] **Step 1: Supabase Compute auf Micro stellen** (Dashboard) — Rollback-Reserve wird billig (~10 $ statt 60 $).
- [ ] **Step 2 (Tag 28+): Export-Archiv** (letzter Dump + Storage-Tar auf die Storage Box, dauerhaft) → Projekt `paizkjajbuxxksdoycev` loeschen, Projekt `Cmndo` loeschen, **Pro-Abo der Org kuendigen**.
- [ ] **Step 3: Doku-Schlussstand** — Kostenanalyse-Report um „Umgesetzt am …" ergaenzen; Memory-Eintraege aktualisieren; `db-backups`-Cron-Route (`api/cron/db-backup`) auf neues Ziel umstellen oder zugunsten Task-10-Kette stilllegen.

---

## Self-Review (gegen Spec = Kostenanalyse §4 „komplett alles" + §6 Gates)

- Postgres ✔ (T8), Auth/Logins/MFA ✔ (T6 JWT + T9), Auth-E-Mails ✔ (T6 SMTP + T9 Step 4), Storage ✔ (T8 Sync + T4 Buckets), Realtime ✔ (T3/T4 Publication + T9 Step 5), Edge Function ✔ (T11), pg_cron/pg_net/Vault ✔ (T3 + T8 vault-Seed), Workflow-Ersatz Regel 2/CI ✔ (T12), Backups/Monitoring ✔ (T10), DSGVO-TOM/AVV → bewusst NICHT als Task (kein Code): Aaron-Pflicht, in T13 Step 0 Ankuendigung erwaehnt — **offener Punkt fuer Aaron**.
- Ein-Server-Risiken adressiert: T1 (Reboot), T6 (mem_limits, localhost-Bindung), T10 (Offsite), T13 Step 5 (Beobachtung).
- Typ-/Namens-Konsistenz: `api.claimondo.de`, `/root/claimondo-supabase`, Script-Pfade `scripts/selfhost/*`, `scripts/db/migrate.mjs` — durchgaengig identisch verwendet.
