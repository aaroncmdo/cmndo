# Supabase-Selfhost-Kostenanalyse — 03.09.2026

**Auftrag (Aaron):** Supabase-Kosten sparen. Gesamtes SQL-Schema verifizieren, alles — DB, Auth/Logins, E-Mails, Storage — auf den eigenen Server ziehen. Fragen: Haben wir genug Kapazitaet? Wie muesste der Server hochgestuft werden?

**Kurzantwort:** Der eigene Server hat die Kapazitaet NICHT (2 vCPU / 1,8 GB RAM, bereits 2 GB Swap in Benutzung). Die Supabase-Rechnung liegt geschaetzt bei ~85–95 $/Monat, davon sind ~55–65 $ ohne jede Migration einsparbar (Compute-Downgrade + Branch-Hygiene). Eine Voll-Migration wuerde netto ~60 €/Monat sparen, kostet 1–2 Wochen Aufwand plus laufenden Betrieb und traegt erhebliches Ausfall-/DSGVO-Risiko fuer eine prod-App mit echten Kundendaten. Empfehlung: nicht migrieren, stattdessen Kostenhebel innerhalb Supabase ziehen.

---

## 1 · Ist-Zustand Supabase (gemessen 03.09.2026, read-only)

| Punkt | Wert |
|---|---|
| Organisation | Aaroncmndo, Plan **Pro** ($25/Mo, inkl. $10 Compute-Credits) |
| Projekt prod | Claimondo-v2 (`paizkjajbuxxksdoycev`), eu-west-2, Postgres 17.6, ACTIVE_HEALTHY |
| Zweitprojekt | „Cmndo" (`rodwfaezmiovbyniysby`), eu-central-1, **INACTIVE** — verursacht keine Compute-Kosten, kann geloescht werden |
| Compute-Tier | `max_connections=120`, `shared_buffers=1GB`, `effective_cache_size=3GB` → entspricht **Medium (~$60/Mo)**. Aus DB-Settings abgeleitet — im Dashboard unter Settings → Compute verifizieren! |
| DB-Groesse | **224 MB** (8 GB im Pro inkludiert) |
| Schema | 227 public-Tabellen, 222 public-Funktionen, 1.260 getrackte Migrationen |
| Auth | **207 User**, 133 aktiv in 30 Tagen, MFA/2FA in Benutzung (`mfa_amr_claims`: 424 Zeilen) |
| Storage | **313 MB** in 1.895 Objekten, **16 Buckets**: kanzlei, profile, gutachter-logos, abrechnungen-pdf, vertraege, abrechnungen, avatare, gutachten-pdfs, unterschriften, schadensfotos, gutachten, fall-dokumente, email-hero, marketing-content, **db-backups**, fahrzeug-zustand (100 GB inkludiert) |
| Realtime | **6 aktive Subscriptions** — wird live genutzt |
| pg_cron | **26 Jobs**; installierte Extensions u.a. pg_net (async HTTP), supabase_vault, wrappers, pg_trgm, btree_gist |
| Edge Functions | 1 (`elementor-lead-webhook`, verify_jwt=false) |
| Branching | 2 Preview-Branches offen: PR 5784 (MIGRATIONS_FAILED, seit 30.08.) + **`release-consolidate-r165` seit 28.07.** — Branches kosten $0.01344/h ≈ **$10/Mo pro Dauerbranch** |
| Verbindungen | 54 gesamt, 2 aktiv (bei 120 max) |
| Groesste Tabellen | job_run_details 59 MB (cron-Historie!), sv_leads 29 MB, cron_jobs_audit 14 MB — Rest < 10 MB |

**Geschaetzte Ist-Rechnung:** $25 (Pro) + $60 (Medium) − $10 (Credits) + ~$10–20 (liegengebliebene Branches) ≈ **$85–95/Monat ≈ 80–90 €**. Egress von hier nicht messbar (250 GB inkludiert — bei 133 MAU sehr wahrscheinlich weit drunter). MAU-/Disk-/Storage-Zusatzkosten: $0.

## 2 · Schema-Verifizierung (Aarons Frage 1) — Ergebnis: SAUBER

- `origin/staging` traegt **1.258** Migration-Files, die DB trackt **1.260**.
- Delta = 2, beide erklaerbar: `20260903190341_leads_oppref_openai_ads_attribution` (HEUTE appliziert, File folgt per PR aus der parallelen Lane) + 1 bekannter Nachzuegler der #5837-Konstellation (Migration auf prod, File-Nachtrag im PR).
- → Das TABELLEN-Schema (Tabellen, Funktionen, Policies) ist praktisch vollstaendig im Repo reproduzierbar. Kein nennenswerter Twin-Drift.
- ⚠ ABER — ausserhalb der Migrationen leben drei Dinge (Code-Scan, s. Anhang): **25 der 26 pg_cron-Jobs** sind nirgends im Repo versioniert (nur `20260529212846_schedule_connection_snapshot_cron.sql` ist es), die **Extension-Aktivierungen** (pg_cron, pg_net, vault, …) stehen bis auf `btree_gist` in keiner Migration, und die **Realtime-Publication-Mitgliedschaft** (22 Tabellen) ist ebenfalls unversioniert. Ein `supabase db reset`/Neuaufbau aus Migrationen ergaebe also eine DB OHNE Scheduler und OHNE Realtime-Feeds. Fuer echte Reproduzierbarkeit: diese drei Bestaende aus prod extrahieren und als Migration nachtragen — unabhaengig von jeder Umzugsentscheidung sinnvoll.
- Fuer eine Voll-Sicherung/Umzug waere ohnehin **`pg_dump`** der Weg (224-MB-DB → Dump wenige MB komprimiert), nicht ein Replay von 1.260 Migrationen.
- ⚠ Henne-Ei-Befund: Der Bucket **`db-backups` liegt IN Supabase Storage**. Ein Supabase-Ausfall traefe Datenbank UND Backups. Unabhaengig von jeder Migrations-Entscheidung gehoert ein taegliches pg_dump-Offsite-Backup (VPS oder S3/Storage-Box) eingerichtet.

## 3 · Server-Kapazitaet (Aarons Frage 2) — Ergebnis: NEIN

Gemessen per SSH auf `212.132.119.110` (IONOS AS8560, Ubuntu, Uptime 117 Tage):

| Ressource | Ist | Bewertung |
|---|---|---|
| CPU | 2 vCPU, load average 1.31 | zu 65 % ausgelastet, prod-App-Prozess stand bei 123 % CPU |
| RAM | **1,8 GB total, 104 MB available** | ueberbucht |
| Swap | **2,0 von 4,0 GB belegt** | Server swappt bereits heute aktiv |
| Disk | 77 GB, 51 % belegt | ok |
| Dienste | 13 pm2-Prozesse als root: claimondo-v2 (prod! 888 MB), claimondo-v2-staging, claimondo-marketing, 5 Cluster-LPs, autounfall-io, baileys, claimondo-mcp, powerdialer, sv-levelup | kein Platz fuer weitere Last |
| Docker | **nicht installiert** | Self-hosted-Supabase-Stack ist Docker-Compose-basiert |

Ein Self-hosted-Supabase-Stack (Postgres + Kong + GoTrue + PostgREST + Realtime + Storage-API + Studio) braucht dediziert **+3–4 GB RAM** und Docker.

Dimensionierung des Stacks fuer UNSERE Groesse (224-MB-DB, 133 MAU, 2 aktive Queries) — Minimal-Compose ohne Studio/Logflare:

| Komponente | RAM-Bedarf |
|---|---|
| Postgres (shared_buffers 512 MB–1 GB, 26 cron-Jobs, Realtime-WAL) | 1–2 GB |
| Kong (API-Gateway) | 0,3–0,5 GB |
| Realtime (Elixir/BEAM) | 0,2–0,4 GB |
| GoTrue + PostgREST + Storage-API + imgproxy | 0,3–0,5 GB |
| Docker-Daemon + OS-Anteil | 0,3–0,5 GB |
| **Summe dediziert** | **~2,3–3,5 GB** + Peaks (pg_dump, VACUUM) |

→ **4 GB RAM ist das absolute Minimum, 8 GB der komfortable Zielwert.** Vorhanden auf dem VPS: −0,1 GB (104 MB frei bei 2 GB Swap-Schulden). CPU (2 vCPU) und Disk (39 GB frei; DB+Storage+Backups brauchen < 5 GB) waeren fuer die Datenmenge kein Problem — der Engpass ist ausschliesslich RAM plus die Architekturfrage (alles auf einer Kiste). Auf diesem Server ist das ausgeschlossen; er hat schon fuer die HEUTIGE Last zu wenig RAM (passt zum bekannten Befund „Startseite nach jedem prod-Deploy minutenlang unbenutzbar").

**Wie hochstufen (falls gewuenscht):** IONOS VPS Linux L = 4 vCPU / 8 GB RAM / 240 GB ≈ **$15/Monat** (Upgrade im IONOS-Panel = vertikales Skalieren + Reboot). Diese Hochstufung lohnt sich unabhaengig von der DB-Frage — fuer die App-Prozesse, die jetzt swappen — aber sie macht Self-Hosting der DB nicht automatisch sinnvoll.

## 4 · Was „komplett alles" wirklich umfasst

Aarons Anforderung: DB + E-Mails + Logins + alles. Vollstaendige Umzugsliste:

1. **Postgres** inkl. 26 pg_cron-Jobs, pg_net-HTTP-Calls aus der DB, Vault-Secrets, komplettes RLS-/Grant-/Rollenmodell (anon/authenticated/service_role) — Grants sind bei uns nachweislich fehleranfaellig (staging-CI-Vorfaelle).
2. **Auth/GoTrue:** 207 echte Logins inkl. bcrypt-Passwort-Hashes (exportierbar, da `auth.users` sie enthaelt), Refresh-Tokens/Sessions, **MFA-Faktoren**, JWT-Secret-Uebernahme oder -Wechsel (Wechsel = alle 207 User ausgeloggt), Magic-Links, publicPaths-/Token-Routen.
3. **Auth-E-Mails:** Recovery/Invite/Confirmation laufen heute ueber Supabase-Built-in-SMTP (bekannter Go-Live-Blocker) → eigener SMTP/Resend waere so oder so noetig; bei Self-Host zwingend Teil des Pakets.
4. **Storage:** 16 Buckets, 313 MB, `storage.objects`-Metadaten, Storage-RLS-Policies, signierte URLs → S3-kompatibler Dienst (MinIO) oder Supabase-Storage-API selbst hosten.
5. **Realtime:** WebSocket-Server, wird live genutzt (6 aktive Subscriptions).
6. **Edge Function** `elementor-lead-webhook` → als Next-API-Route umziehen (klein).
7. **Workflow-Verluste:** Preview-Branches je PR (CI haengt dran), der MCP-`apply_migration`-DDL-Workflow (**AGENTS.md Regel 2 basiert darauf** — muesste komplett neu gedacht werden), Managed Backups/PITR, Dashboard, Advisors.
8. **Dauerbetrieb:** Backups + Offsite, Security-Patches, Monitoring, TLS (staging-TLS lief uns schon einmal ab), Upgrades — permanent, nicht einmalig.
9. **DSGVO:** volle TOM-Verantwortung fuer Unfall-/Kundendaten + Dokumente auf einem Server, auf dem heute 13 Dienste als root laufen — waehrend das Repo public mit prod-Credentials ist. Sicherheitslage spricht klar dagegen.

Aufwandsschaetzung Voll-Migration: **1–2 Wochen fokussierte Arbeit** + ~2–4 h/Monat Betrieb + Cutover-Downtime.

## 5 · Rechnung und Empfehlung

| Szenario | Kosten/Monat | Ersparnis vs. Ist | Aufwand/Risiko |
|---|---|---|---|
| **Ist** | ~$85–95 | — | — |
| **A: Bleiben + optimieren** (Empfehlung) | **~$30** | **~$55–65/Mo ≈ 650–750 €/Jahr** | ~30–60 Min, kein Risiko |
| B: Voll-Selfhost auf neuem/hochgestuftem VPS | ~$20–25 (VPS-Anteil + Offsite-Backup) | ~$65–75/Mo brutto | 1–2 Wochen Migration, Dauerbetrieb, Ausfall-/DSGVO-Risiko, Workflow-Verluste (Branches, MCP-DDL, PITR) |

**Option A konkret (sofort umsetzbar):**
1. **Compute Medium → Small** ($60 → $15): 224-MB-DB, 133 MAU, 2 aktive Queries. Die 54 Connections sind fast komplett Supabase-INTERNE Dienste (PostgREST-Pool 27, Storage-API 12, Realtime ~12, Auth 3, pgbouncer 4) — die App verbindet ueber die APIs/Pooler, nicht direkt; diese Pools skalieren mit dem Tier mit. Small (2 GB RAM) reicht sehr wahrscheinlich locker. Vorher im Dashboard CPU-/RAM-/IO-Auslastung der letzten 4 Wochen ansehen. Downgrade = kurzer Restart (~1–2 Min Downtime, Randzeit waehlen). −$45/Mo. (Micro $10 waere grenzwertig: 26 cron-Jobs + interne Dienste auf 1 GB RAM — Small ist der sichere Schritt.)
2. **Preview-Branches aufraeumen:** `release-consolidate-r165` (seit 28.07.!) und PR-5784-Branch (MIGRATIONS_FAILED) loeschen; Praxis etablieren: Branch faellt mit PR-Merge/-Close. −$10–20/Mo.
3. **Cron-Historie deckeln:** `job_run_details` (59 MB) + `cron_jobs_audit` (14 MB) per Retention-Job kappen — fuer Kosten egal (weit unter 8 GB), fuer Hygiene gut.
4. **Projekt „Cmndo" loeschen** (INACTIVE, $0, reines Aufraeumen).
5. **Offsite-Backup einrichten** (pg_dump taeglich auf VPS/Storage-Box) — behebt das db-backups-Henne-Ei und liefert nebenbei die Datenhoheit, die hinter dem Selfhost-Wunsch steckt.

**Zu Option B:** Erst wieder bewerten, wenn die Supabase-Rechnung trotz Optimierung > $200/Mo laeuft oder Datenhoheit strategisch zwingend wird. Dann aber auf einem **dedizierten** DB-Server (nicht dem App-/Marketing-Zoo), mit Docker, getesteter Restore-Prozedur und ersetztem Auth-Mail-Versand.

---

## 6 · Voraussetzungen fuer eine SAUBERE Voll-Migration (Gate-Liste)

Aarons Folgefrage 03.09.: „Was waere die Voraussetzung, dass das sauber durchgeht?" — Antwort als 7 Gates. Cutover erst, wenn ALLE erfuellt sind. Gates 3–5 sind No-Regret: die braucht das Projekt auch ohne Migration.

**Gate 1 — Zieldesign: kompletter Supabase-Stack, nicht Postgres-only.**
Self-hosted Supabase per offiziellem Docker-Compose (Postgres + GoTrue + PostgREST + Realtime + Storage-API + Kong). Nur so bleiben supabase-js, 486 RLS-Policies, 437 `getUser()`-Calls und TOTP-MFA unveraendert — alles andere waere ein Rewrite, kein Umzug. **JWT-Secret aus dem Dashboard uebernehmen** (Sessions + MFA-Faktoren bleiben gueltig; anon/service_role werden neu ausgestellt → ALLE ENV-Stellen synchron: App, CI, VPS-Crontab-curls, Elementor-Webhook-URL extern!). `auth`-Schema per pg_dump komplett (users/identities/mfa_factors/refresh_tokens). SMTP fuer Auth-Mails konfigurieren (Resend-SMTP) — loest nebenbei den bekannten Passwort-Reset-Blocker.

**Gate 2 — Dedizierter, gehaerteter Server.**
NICHT der bestehende VPS (swappt heute schon; 13 root-Dienste = Blast-Radius). Eigener Host 4 vCPU / 8 GB / NVMe mit Docker, ~$15/Mo (IONOS VPS L o. Hetzner), DE-Region. Firewall: 5432/Kong nur fuer App-Server-IP, Postgres NIE public; SSH-Key-only; unattended-upgrades. Nebenbefund: Supabase-prod liegt in **eu-west-2 (London)** — die App in DE zahlt heute auf jede Query ~15–25 ms RTT. Ein DE-Self-Host wuerde Latenz VERBESSERN (einziges technisches Pro-Argument neben Kosten; alternativ erreichbar durch Supabase-Projekt-Umzug nach eu-central-1, was aber fast dieselbe Umzugsarbeit ist).

**Gate 3 — Zustandsluecken schliessen (No-Regret, VOR allem anderen).**
(a) Die **25 unversionierten pg_cron-Jobs** aus prod extrahieren (`cron.job` dumpen) und als geguardete Migration versionieren; (b) **Extension-Aktivierungen** versionieren — Achtung: `supabase_vault` und `wrappers` sind Supabase-Extensions (im Docker-Stack enthalten, in Vanilla-Postgres nicht); das EINE Vault-Secret identifizieren; (c) **Realtime-Publication** (22 Tabellen) versionieren; (d) die **2 fehlenden Buckets** anlegen oder Code fixen; (e) die **4 toten Realtime-Subscriptions** fixen/entfernen. Ohne (a)–(c) kommt jede neu aufgebaute DB ohne Scheduler und ohne Realtime hoch — die stillste Ausfallklasse (dsgvo_hard_delete, dunning, Provisionen).

**Gate 4 — Sicherheits-Vorbedingung: Repo-Public-Lage bereinigt.**
Selbstverwaltete Secrets (JWT-Secret, service_role, SMTP, DB-Passwoerter) duerfen nicht in eine Welt geboren werden, in der das Repo public mit 175 Credential-Dateien ist. Repo privat/bereinigt + Rotation ist hartes Vorab-Gate.

**Gate 5 — Backup-Kette + Monitoring VOR dem Cutover.**
Taeglicher pg_dump + WAL-Archiving (pgbackrest/wal-g) auf OFFSITE-Ziel (Storage-Box/S3), dazu Storage-Files-Sync. Das Gate ist der **getestete Restore**, nicht das Backup. Externes Uptime-/Disk-/RAM-/Cron-Erfolgs-Monitoring, Alerts in ein GELESENES Postfach (Lehre: MCP 19 Tage tot, tote Postfaecher). Ersetzt Supabase-PITR.

**Gate 6 — Neuer DDL- und CI-Workflow steht VORHER.**
Mit Supabase sterben `apply_migration` (AGENTS.md **Regel 2**!) und die Preview-Branches der CI. Ersatz muss vor dem Cutover definiert UND gelebt sein: getrackter Migrations-Runner (CI-Step gegen self-hosted DB) + PR-CI mit Wegwerf-Postgres und Migrations-Replay (setzt Gate 3 voraus, sonst repliziert CI eine falsche DB — vgl. cron.schedule-Preview-Guard-Klasse). Sonst Drift ab Tag 1.

**Gate 7 — Generalprobe, Cutover-Fenster, Rollback, Papierkram.**
Voll-Restore-Generalprobe mit Zeitmessung; Cutover im Wartungsfenster (bei 224 MB sind die Daten Minuten — das Fenster bestimmen Key-Switch + ENV-Rollout + pm2-Restarts: realistisch 30–60 Min nachts); danach prod-Smokes/Journey-Gate gegen den neuen Stack. **Supabase-Projekt 2–4 Wochen als Rollback behalten**, erst nach Bewaehrung pausieren/kuendigen. DSGVO: TOM/AVV aktualisieren (IONOS statt Supabase/AWS als Sub-Prozessor), at-rest-Verschluesselung, Zugriffskonzept. Benannter Betriebs-Owner fuer Patches/Upgrades — ohne Owner ist „sauber" nach 3 Monaten vorbei.

**Aufwand realistisch:** Gate 3+5 ≈ 2–3 Tage, Gate 6 ≈ 2–4 Tage, Stack-Aufbau + Generalprobe ≈ 3–5 Tage → bestaetigt die 1–2-Wochen-Schaetzung. **Empfohlene Reihenfolge:** Gates 3–5 sofort umsetzen (auch bei Verbleib noetig), Sparmassnahmen aus §5 ziehen — und die Migrations-Entscheidung danach mit 90 % weniger Risiko neu bewerten.

---

## 7 · Geprueft: Lokaler Server (eigene Hardware bei Aaron) — 03.09.2026

Aarons Folgefrage: „Koennten wir auch einen lokalen Server aufbauen?" — Ja, technisch. Fuer **prod** aber die falsche Wahl, aus drei Gruenden:

1. **Latenz-Rechnung:** Die App laeuft auf dem IONOS-VPS und muesste fuer JEDE Query ueber den Consumer-Anschluss nach Hause und zurueck (~20–40 ms). Eine SSR-Seite mit 10–30 sequentiellen Queries = 0,5–1 s NUR Netzwerk pro Request — die App wuerde LANGSAMER als heute mit London. (Nur loesbar, wenn die komplette App mit umzieht — dann haengt die gesamte Plattform am Heimanschluss.)
2. **Verfuegbarkeit:** Consumer-Anschluss ohne SLA (Zwangstrennung, CGNAT/DS-Lite oft ohne statisches IPv4 → Tunnel-Pflicht), Stromausfall, Router-Reboot, Urlaub. Ein Ausfall = Auth+DB+alles tot, Fernzugriff weg, physisch hinfahren. Ein einziger Ausfalltag kostet mehr Leads als Jahre VPS-Miete.
3. **DSGVO:** Unfall-Kundendaten in Privatraeumen → TOM-Anforderungen steigen (Zugangskontrolle, Vollverschluesselung, Diebstahl-/Brandszenario trifft Daten UND lokale Backups).

**Kosten ehrlich:** Hardware 300–500 € einmalig + ~5 €/Mo Strom vs. ~8–10 $/Mo VPS-Upgrade-Delta — es geht um 5–15 €/Monat Differenz. Dafuer prod ans Heimnetz zu haengen ist ein schlechter Tausch.

**Wo ein lokaler Server GLAENZT (empfohlen als Ergaenzung, nicht Ersatz):**
- **Offsite-Backup-Ziel** (Task-10-Variante): taeglicher Pull von pg_dump + Storage-Tar nach Hause statt Storage Box → spart deren ~4 €/Mo, geografisch getrennt, maximale Datenhoheit. Pull-Richtung (lokal holt ab) umgeht CGNAT komplett.
- **Staging/CI-Entlastung** (optional): staging-App + self-hosted GitHub-Runner + CI-Replay-Postgres lokal → entlastet den prod-VPS, Ausfall folgenlos.

**Entscheidung:** Plan bleibt (prod auf hochgestuftem VPS); lokaler Server optional als Task-10-Backup-Ziel, sobald Hardware vorhanden.

---

## Anhang: Supabase-Featurenutzung im Code (Explore-Scan 03.09.2026)

**Kernbild:** Postgres + Auth + Storage sind tief verdrahtet; Realtime breit aber flach; Edge Functions bedeutungslos; E-Mail haengt fast nicht an Supabase.

| Feature | Befund | Migrations-Schwere |
|---|---|---|
| **Auth** | 437 `auth.getUser()`-Calls in 290 Dateien; **486 RLS-Policies** an `auth.uid()`/`auth.jwt()`; TOTP-MFA aktiv (`src/lib/auth/twofa/mfa.ts`, AAL-Enforcement in der Middleware); `createAdminClient()` (`src/lib/supabase/admin.ts`) von **383 Dateien** referenziert | **schwer** — Ersatz muss identische JWT-Claims liefern |
| **Storage** | 90 Call-Sites in 52 Dateien; Nutzung konzentriert auf `fall-dokumente` (1.432 Objekte/70 MB) + `db-backups` (154 MB); 4 public Buckets (CDN-URLs); zentrale Abstraktion `src/lib/storage/url.ts` + `src/lib/supabase/storage.ts` | mittel |
| **Realtime** | 40 `.channel(`-Calls / 62 Listener in 34 Dateien — **ausschliesslich `postgres_changes`**, kein broadcast/presence; Publication traegt 22 Tabellen; 8 Tabellen mit `REPLICA IDENTITY FULL` | mittel (flach, ersetzbar durch Polling/Logical Replication) |
| **RPC** | 43 Call-Sites, 18 distinkte Funktionen (Top: `apply_gutachten_ocr`, `upsert_vehicle_by_fin`, `check_gfa_rate_limit`, `link_lead_data_to_fall`) | leicht (wandert mit Dump, braucht PostgREST-Ersatz) |
| **Edge Functions** | 3 invoke-Sites, alle auf `gutachten-ocr` — **die ist gar nicht deployed** (s. Diskrepanz 3); real existiert nur `elementor-lead-webhook` | leicht (eine Next-Route) |
| **E-Mail** | Eigene Kette: **Resend** primaer, Gmail-SMTP-Fallback (`src/lib/email/google/client.ts`), 38 react-email-Templates, `email_log`-Protokoll. An Supabase-SMTP haengt NUR der Passwort-Reset-Versand (`resetPasswordForEmail`, 1 Call-Site); `admin.generateLink` (5 Sites) erzeugt nur Links, versendet eigen | leicht |
| **Cron** | 55 eigene `/api/cron/*`-Routen, getriggert vom VPS-Crontab (bereits ausserhalb Supabase) + **26 pg_cron-Jobs in der DB** (25 unversioniert!) + pg_net-HTTP-Calls (Slack, EXIF-Worker, Salesforce-Sync) | mittel (wegen Rekonstruktion) |
| **Clients/ENV** | `@supabase/supabase-js` in 173 Dateien (95 src + 78 scripts), `@supabase/ssr` nur in 7; ENV: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | — |
| **Nicht genutzt** | PostGIS (0 `ST_`-Calls — Geo laeuft im App-Code), pgvector, pg_graphql, pgmq; Vault enthaelt genau 1 Secret (vor Umzug pruefen welches) | — |

### Vier Diskrepanzen (Beifang — gelten HEUTE, unabhaengig von jeder Migration)

1. **4 Realtime-Subscriptions zielen auf Tabellen ausserhalb der Publication** — sie feuern still nie: `sv_live_location` (`src/hooks/useGeoTracking.ts:126`), `gutachter_finder_anfragen` (`src/app/dispatch/_components/RealtimeLeadAlert.tsx:63,81` — **Dispatch-Lead-Alert ist tot**), `gutachter_mitteilungen` (`src/app/gutachter/GutachterShell.tsx:315`), `airdrop_invitations` (`src/components/claims/InvitationStatusBadge.tsx:46`).
2. **2 Bucket-Namen im Code existieren auf prod nicht** — Uploads schlagen fehl: `kanzlei-abrechnungen` (`src/lib/abrechnung/kanzlei/generate-pdf.tsx:226`), `onboarding-rechnungen` (`src/lib/pdf/onboarding-rechnung.tsx:262`).
3. **`gutachten-ocr` wird 3x invoked, ist aber nie deployed** — und der Repo-Code ist ein Skeleton, das `engine_not_implemented` setzt (AAR-846 nie gebaut). Toter Pfad.
4. **25 von 26 pg_cron-Jobs unversioniert** (u.a. `dsgvo_hard_delete`, `notification_worker_tick`, `netzwerk_abo_dunning`, `release_provisionen`, `verjaehrungs_warner`) + Extension-Aktivierungen ausserhalb der Migrationen — Rekonstruktions-/Disaster-Recovery-Risiko.

**Quellen der Messwerte:** Supabase Management-API (get_organization/get_project/list_branches/list_edge_functions/list_extensions), read-only `execute_sql` auf prod, SSH-Messung 212.132.119.110, `git ls-tree origin/staging`, supabase.com/pricing (03.09.2026), IONOS-Preisrecherche.
