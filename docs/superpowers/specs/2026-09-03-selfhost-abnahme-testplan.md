# Selfhost-Migration — Abnahme-Testplan (vollstaendige Funktionalitaet)

Aaron-Auftrag 03.09.2026: „Tests, mit denen wir die vollstaendige Funktionalitaet sicherstellen." Gehoert zu `docs/superpowers/plans/2026-09-03-supabase-selfhost-migration.md` (Task 8 Step 4, Task 9, Task 13 Step 4 verweisen hierher).

**Beweisstrategie in einem Satz:** Daten-Paritaet beweist, dass ALLES angekommen ist (P1); Subsystem-Tests beweisen, dass jede Supabase-Ersatzkomponente funktioniert (P2); die bestehenden Journey-Smokes beweisen die Geschaeftsfluesse Ende-zu-Ende (P3); Performance-Paritaet beweist, dass es nicht schleichend schlechter wurde (P4); der Rollback-Test beweist, dass der Notausgang offen ist (P5). Einzeltests aller 227 Tabellen/222 Funktionen waeren Scheinpraezision — P1 deckt Daten, der CI-Migrations-Replay (Plan-Task 12) deckt Schema, P3 deckt Fluesse.

**Pass-Kriterium Cutover:** P1–P5 komplett gruen im Generalproben-Lauf UND im Cutover-Lauf. Jede Abweichung = benannter Befund; rote P1/P2 = Abbruch (Rollback-Kriterien Task 13 Step 0).

---

## P1 · Daten-Paritaet ALT vs NEU (automatisiert, SQL)

**Script:** `scripts/selfhost/parity-full.sql` — laeuft gegen BEIDE Instanzen, Ausgaben werden gedifft (`diff <(psql ALT -f …) <(psql NEU -f …)`).

- [ ] **P1.1 Zeilenzahl JEDER Tabelle** (nicht nur Stichprobe):
```sql
select schemaname||'.'||relname as t, n_live_tup
from pg_stat_user_tables
where schemaname in ('public','auth','storage','monitoring')
order by 1;
```
⚠ n_live_tup ist Naeherung — fuer die 20 groessten + alle geschaeftskritischen Tabellen (claims, faelle, leads, auth.users, storage.objects, nachrichten, mitteilungen, tasks, sv_leads, werkstaetten, sachverstaendige, abrechnungen) zusaetzlich exakte `count(*)`-Paare.
- [ ] **P1.2 Inhalts-Checksummen** der kritischen Tabellen (faengt abgeschnittene/verstuemmelte Restores, die Counts nicht sehen):
```sql
select 'claims' t, md5(string_agg(id::text, ',' order by id)) from public.claims
union all select 'auth.users', md5(string_agg(id::text||coalesce(encrypted_password,''), ',' order by id)) from auth.users
union all select 'storage.objects', md5(string_agg(id::text||name, ',' order by id)) from storage.objects;
```
(auth.users MIT Passwort-Hash im Digest — beweist, dass die Hashes 1:1 angekommen sind, ohne sie anzuzeigen.)
- [ ] **P1.3 Struktur-Zaehler:** Tabellen (227), Views (32), Funktionen public (222), **RLS-Policies (~486)**, Trigger, Indexe, Publication-Tabellen, cron-Jobs (26), Extensions (10) — Query aus Plan-Task 8 Step 4, erweitert um Trigger/Indexe.
- [ ] **P1.4 Sequenzen-Staende** (klassischer Restore-Killer — falsche Staende = `duplicate key` beim ERSTEN Insert nach Cutover):
```sql
select sequencename, last_value from pg_sequences where schemaname='public' order by 1;
```
- [ ] **P1.5 Storage-Datei-Paritaet:** Objektzahl+Bytes je Bucket ALT vs NEU (`select bucket_id, count(*), sum((metadata->>'size')::bigint) from storage.objects group by 1`) PLUS 3 Stichproben-Downloads (aeltestes, neuestes, groesstes File aus `fall-dokumente`) mit Byte-Vergleich.
- [ ] **P1.6 Vault:** `select name from vault.secrets` → `cron_secret` vorhanden; Job `release_provisionen` einmal manuell ausfuehren → `/api/cron/*`-Call authentifiziert (beweist, dass der WERT korrekt geseedet wurde).

## P2 · Subsystem-Funktionstests gegen NEU (scriptbar, `scripts/selfhost/accept-*.mjs`)

**Konten:** die 9 rotierten Test-Accounts (Memory `reference-internal-test-account-logins.md`; ⚠ `seed-test-2fa.mjs` NIE starten). Passwoerter aus ENV, nie aus dem Repo.

### P2-AUTH (der kritischste Block — 207 echte Logins haengen dran)
- [ ] Passwort-Login **je Rolle** (admin, dispatch, sv, kunde, kanzlei, werkstatt …): `signInWithPassword` → 200 + access_token dekodieren → `role=authenticated`, `sub` = bekannte User-Id (beweist JWT-Secret-Uebernahme).
- [ ] **Bestehende Session wandert:** VOR dem Cutover ausgestelltes access_token gegen NEU verwenden → PostgREST akzeptiert es (DER Beweis fuer nahtlose Uebernahme).
- [ ] **Refresh-Rotation:** refresh_token gegen NEU einloesen → neues Tokenpaar; altes refresh_token danach ungueltig.
- [ ] **MFA/TOTP:** Konto mit Faktor: challenge → verify mit korrektem Code → AAL2; Middleware (`getAuthenticatorAssuranceLevel`) laesst durch; FALSCHER Code → abgelehnt.
- [ ] **Passwort-Reset-Kette:** `resetPasswordForEmail` → Mail via Resend-SMTP kommt an (Resend-Dashboard) → Link oeffnet `SITE_URL` → neues Passwort setzen → Login mit neuem Passwort.
- [ ] `admin.generateLink` (`recovery` + `magiclink`) → Links funktionieren (Konsumenten: `sv-basic/claim-actions`, `/flow/[token]/actions`).
- [ ] `admin.createUser` + `admin.deleteUser` mit Wegwerf-Konto (Dispatch legt Kunden-Accounts so an!).
- [ ] Logout → Session in `auth.sessions` beendet.

### P2-RLS (Paritaets-Ansatz — faengt Policy-/Grant-Drift)
- [ ] Script meldet sich je Rolle an und zaehlt definierte Sichten auf ALT und NEU — Zahlen muessen exakt matchen: kunde→eigene `claims`/`faelle`/`nachrichten`; sv→zugewiesene Faelle; dispatch→leads; kanzlei→kanzlei_faelle (⚠ bekannter 28/81-Befund — Soll ist der ALT-Wert, nicht „alles"); admin→alles; **anon→0 Zeilen auf allen Kern-Tabellen** (Negativ-Beweis!).
- [ ] Schreib-Paritaet: kunde darf eigenes Feld updaten, FREMDES `claims`-Update liefert 0 rows (RLS-UPDATE-Falle — silently 0, nicht Error: genau DAS pruefen).

### P2-STORAGE
- [ ] Je Bucket-Klasse: Upload → signed URL erzeugen → Download → Delete (private: `fall-dokumente`; public: `avatare` via `getPublicUrl` OHNE Auth abrufbar).
- [ ] **Upsert-Fall** (`upload(..., { upsert: true })` auf existierenden Pfad) — braucht INSERT+SELECT+UPDATE-Policies; scheitert bei Policy-Luecken STILL (Supabase-Skill-Falle).
- [ ] 50-MB-Grenzfall: 45-MB-Testfile durch nginx (`client_max_body_size`-Beweis).

### P2-REALTIME
- [ ] Fuer die heissen Kanaele (`gutachter_termine`, `nachrichten`, `leads`, `mitteilungen`, `claims`): subscribe via `https://api.claimondo.de` (WSS!) → SQL-Insert → Event < 3 s. Ein UPDATE-Event zusaetzlich auf `claims` (beweist REPLICA-IDENTITY-Konfiguration nach Optimierungs-Task 4b — falls Code `payload.old` liest, hier festnageln).
- [ ] Dispatch-`RealtimeLeadAlert` im Browser (nach Fix aus Task 4): Test-Lead → Alert feuert.

### P2-RPC (alle 18 aufgerufenen Funktionen)
- [ ] Read-only direkt: `get_aktueller_gt_termin_id`, `count_unread_updates`, `check_gfa_rate_limit`, `admin_person_dupe_candidates`, `match_person_candidates`, `next_rechnungs_nr` (⚠ zaehlt hoch — gegen Wegwerf-Restore, nicht im Cutover-Lauf), `audit_rls_function_grants`.
- [ ] Schreibende mit SMOKE-Daten: `upsert_vehicle_by_fin`, `link_lead_data_to_fall`, `touch_claim_recency`, `increment_offene_faelle`, `decrement_guthaben`, `mark_expired_leads`, `apply_gutachten_ocr`, `delete_fall_komplett` + `delete_gutachter_komplett` (SMOKE-Fall/-SV anlegen→loeschen), `dsgvo_anonymize_user_data` (Wegwerf-User). `exec_sql` NUR Existenz pruefen (Seed-Tool).
- [ ] Erwartung je Call: kein SQL-Error, plausibler Rueckgabewert; bei den delete_*: hinterher 0 Reste (Kaskaden-Beweis).

### P2-CRON + pg_net
- [ ] Alle 24 `cron_*`-Funktionen einmal DIREKT ausfuehren (`select public.cron_dsgvo_hard_delete();` usw. — nicht auf Timer warten): kein Error. ⚠ Vorher Wirkung pro Funktion lesen — `dsgvo_hard_delete` etc. nur gegen die Generalproben-Kopie, NIE doppelt im Cutover.
- [ ] `cron.job_run_details` nach 1 h Stack-Laufzeit: geplante Jobs (Minutentakt-Jobs) haben Eintraege mit `succeeded`.
- [ ] pg_net-Outcall: `konsistenz_check` → Slack-Nachricht kommt an (URL aus `public.settings` — auf NEU verifizieren, dass settings mitkamen).
- [ ] `/api/cron/*`-Strecke: 3 Stichproben-Routen mit `Authorization: Bearer $CRON_SECRET` → 200 (VPS-Crontab-Pfad bleibt funktionsfaehig).

### P2-MAIL + WEBHOOK
- [ ] App-Mail via Resend (1 Template aus `src/lib/email/google/templates/`) → `email_log`-Eintrag `provider=resend`.
- [ ] GoTrue-Mail (Reset, s. P2-AUTH) — der EINZIGE Mailpfad, der den Provider wechselt.
- [ ] Elementor-Webhook: Beispiel-Payload gegen `https://app.claimondo.de/api/webhooks/elementor-lead` → Lead in DB + Team-Benachrichtigung (soweit Quelle nicht zu den 9 stummen gehoert — Sollwert = ALT-Verhalten).

## P3 · End-to-End-Journeys (bestehende Smoke-Infrastruktur, ENVs auf NEU)

⚠ Pflichtlektuere vor dem Umschalten: Memory `BROADCAST-prod-playwright-smoke-drei-fallen` (`PLAYWRIGHT_BASE_URL` ist wirkungslos — die Smokes haben eigene ENV-Konventionen) + `FEEDBACK-operatives-soll-vor-smoke` (erst operatives Soll, alles per UI).

- [ ] **Journey-Gate-Lauf** komplett gegen NEU (J-Suiten inkl. J8-Enroll — Secret-Durchreichung beachten, Memory `COORDINATION-j8-enroll-secret-uebergabe`).
- [ ] **Kundenfluss-Smoke** (der 3×-prod-bewaehrte Lauf aus `AUDIT-kundenfluss-laeuft-durch-16-befunde`): Schadenmeldung → Quali → Termin → Dokumente → Geldstrecke.
- [ ] **Beide Kunden-Eintrittswege** (Weg 1 + Weg 6 „Schaden melden", Memory `AUDIT-entrypoint-weg6-kunde-schaden-melden`).
- [ ] **Token-Strecken** (Middleware+publicPaths bleiben, aber Auth-Backend wechselt): `/flow/[token]` Phase-2-Save, `/upload/zb1/[token]`, `/upload/dokumente/[token]` — je 1 Durchlauf inkl. Upload.
- [ ] **Dispatch:** Lead → SV-Zuweisung → SV nimmt an → Termin (Realtime-Alert live).
- [ ] **SV-Portal:** Akte, Kalender, Zustandsaufnahme-Upload. **Kanzlei:** Fall-Sicht + Dokument. **Admin:** Faelle-Liste, Finance-Aktion (`markiere als bezahlt`-Klasse), Stammdaten-Edit.
- [ ] **Whitelabel:** 1 gebrandeter SV → Kunde-Portal + FlowLink zeigen Brand-Theme (Resolver lesen aus DB — muss nach Restore identisch ziehen).
- [ ] SMOKE-Restdaten nach Lauf aufraeumen (Memory: Task-Listen-Flutung).

## P4 · Performance-Paritaet (Zahlen, nicht Gefuehl)

- [ ] 8 Referenz-Requests je 5× gegen ALT und NEU, `curl -w '%{time_total}'`: `/` (Marketing bleibt eh), `app.claimondo.de/login`, Dispatch-Liste, Claim-Detail, Admin-Faelle, 1 signed-URL-Download, 1 REST-Query (`/rest/v1/claims?select=id&limit=100`), Auth-Token-Refresh. **Kriterium: Median NEU ≤ Median ALT** (Erwartung: BESSER — London-RTT faellt weg).
- [ ] `docker stats` + `free -h` unter P3-Last: kein Container am mem_limit, `available` > 1,5 GB, Load < 3 (2 vCPU + Docker!). Ueberschreitung = Task-2-Upgrade war zu klein dimensioniert → eskalieren statt cutten.
- [ ] `pg_stat_statements` auf NEU nach P3: Top-Query-Profil grob wie ALT (die Realtime-WAL-Poll-Last MUSS nach Optimierungs-Task 4b deutlich unter ALT-Niveau liegen — Vorher/Nachher notieren).

## P5 · Rollback-Beweis (vor dem echten Cutover, einmal)

- [ ] In der Generalprobe: ENVs auf NEU → P2-AUTH-Kurzlauf → ENVs zurueck auf ALT → Login + Kundenfluss-Kurzsmoke gegen ALT gruen. Beweist: Der Notausgang funktioniert und ist in < 15 Min begehbar. Delta-Verfahren (Daten, die waehrend NEU-Betrieb entstanden) als Doku-Abschnitt im Cutover-Runbook.

---

**Automatisierungsgrad:** P1 komplett scriptbar (SQL-Diff), P2 als `accept-*.mjs`-Suite (einmal geschrieben, laeuft in Generalprobe UND Cutover identisch), P3 existiert groesstenteils (Journey-Gate/Smokes — nur ENV-Schaltung), P4 ein curl-Script, P5 manuell. Neue Artefakte: `scripts/selfhost/parity-full.sql`, `scripts/selfhost/accept-auth.mjs`, `accept-rls.mjs`, `accept-storage.mjs`, `accept-realtime.mjs`, `accept-rpc-cron.mjs`, `accept-perf.sh`.
