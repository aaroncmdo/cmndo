# VPS-Crontab — app.claimondo.de (212.132.119.110)

**Voll-Re-Sync 2026-08-05** per `crontab -l` (root; Erstabzug war 2026-06-20). Diese Datei versioniert
die bislang **nur auf dem VPS** gepflegte Crontab (Audit-Befund: war nirgends im Repo → Single Point
of Failure beim Neuaufsetzen). Quelle der Wahrheit bleibt der VPS; diese Datei ist der versionierte
Abzug + Audit-Annotation.

Alle App-Crons laufen über den Wrapper `/usr/local/bin/cron-call.sh <pfad>` (setzt `Authorization:
Bearer $CRON_SECRET` + trifft die lokale App auf `127.0.0.1:3000`). `pg_cron` (18 DB-Jobs) und die
GitHub-Action `backup.yml` sind **separate** Scheduler und hier NICHT enthalten.

> **⚠️ Zeitzone: der VPS läuft auf `Etc/UTC`** (verifiziert 2026-07-20 per `timedatectl`). Alle
> Uhrzeiten in dieser Datei sind UTC, **nicht** deutsche Zeit: `0 7 * * *` feuert um **09:00 MESZ**
> (Sommer) bzw. 08:00 MEZ (Winter). Wer eine Uhrzeit hier als „morgens um 7" liest, sucht einen
> vermeintlich ausbleibenden Lauf zwei Stunden zu früh.

> **Re-Sync 2026-08-05:** der Abzug unten ist der vollständige Live-Stand vom 05.08. (114 Zeilen,
> 1:1 inkl. Live-Kommentare). Der frühere 2026-06-20-Abzug driftete massiv (Messung 20.07.:
> 19 live-aktive Routen fehlten). Delta-Zusammenfassung: Sektion „Stand 2026-08-05 — Voll-Re-Sync"
> unten. **Quelle der Wahrheit bleibt der VPS** — nach jeder Crontab-Änderung diese Datei nachziehen.

## Live-Crontab (Voll-Abzug 2026-08-05)

```cron
# FAKE-BACKUP DISABLED 2026-06-20 (Claude): sicherte /var/www/claimondo/data/claimondo.db (existiert NICHT; App=/var/www/claimondo-v2 + Supabase) -> 4KB-Leerarchiv. Echtes Netz=Supabase-PITR. 0 2 * * *   /root/backup-daily.sh >> /var/log/claimondo-backup.log 2>&1
# FAKE-BACKUP DISABLED 2026-06-20 (Claude): sicherte /var/www/claimondo/data/claimondo.db (existiert NICHT; App=/var/www/claimondo-v2 + Supabase) -> 4KB-Leerarchiv. Echtes Netz=Supabase-PITR. 0 3 * * 0   /root/backup-weekly.sh >> /var/log/claimondo-backup.log 2>&1
# FAKE-BACKUP DISABLED 2026-06-20 (Claude): sicherte /var/www/claimondo/data/claimondo.db (existiert NICHT; App=/var/www/claimondo-v2 + Supabase) -> 4KB-Leerarchiv. Echtes Netz=Supabase-PITR. 0 4 1 * *   /root/backup-monthly.sh >> /var/log/claimondo-backup.log 2>&1

# ─── KRITISCH ─────────────────────────────────────
*/5  * * * *  /usr/local/bin/cron-call.sh /api/cron/dispatch-lead-alert
*/5  * * * *  /usr/local/bin/cron-call.sh /api/cron/send-reminders
*/5  * * * *  /usr/local/bin/cron-call.sh /api/cron/gutachter-erinnerungen
*/10 * * * *  /usr/local/bin/cron-call.sh /api/notifications/process
*/15 * * * *  /usr/local/bin/cron-call.sh /api/cron/caldav-healthcheck
*/15 * * * *  /usr/local/bin/cron-call.sh /api/cron/sla-check
*/15 * * * *  /usr/local/bin/cron-call.sh /api/cron/kb-termin-reminder-1h
*/30 * * * *  /usr/local/bin/cron-call.sh /api/cron/verlegung-eskalation
# DISABLED 2026-06-20 (Claude): Duplikat von termin-erinnerungen (24h/2h), inkompatibles Dedup -> Kunden-Doppel-WA. */30 * * * *  /usr/local/bin/cron-call.sh /api/cron/whatsapp-erinnerungen
0    * * * *  /usr/local/bin/cron-call.sh /api/cron/termin-erinnerungen
0    * * * *  /usr/local/bin/cron-call.sh /api/cron/re-termin-eskalation
0    8 * * *  /usr/local/bin/cron-call.sh /api/cron/vs-timer
0    */6 * * * /usr/local/bin/cron-call.sh /api/cron/fall-abschluss
0    */6 * * * /usr/local/bin/cron-call.sh /api/cron/task-eskalation
15   17 * * * /usr/local/bin/cron-call.sh /api/cron/no-show-timeout

# ─── WICHTIG ──────────────────────────────────────
30   */4 * * * /usr/local/bin/cron-call.sh /api/cron/pflichtdokumente-reminder
15   *  * * *  /usr/local/bin/cron-call.sh /api/cron/task-erinnerungen
30   *  * * *  /usr/local/bin/cron-call.sh /api/cron/kb-termin-reminder
45   *  * * *  /usr/local/bin/cron-call.sh /api/cron/send-lead-reminders
0    7  * * *  /usr/local/bin/cron-call.sh /api/cron/abrechnung-reminder
0    7  * * *  /usr/local/bin/cron-call.sh /api/cron/sv-termin-dokument-reminder
# DISABLED 2026-08-23 (Claude): Route existiert NICHT mehr in origin/main (mit Positiv-Kontrolle geprueft) -> lieferte taeglich HTTP 404 und verrauschte das Cron-Log. Bewusst entfernt in PR #3604 (obsolete, dead data source); nur der crontab-Eintrag blieb stehen. 10   8  * * *  /usr/local/bin/cron-call.sh /api/cron/zahlungspruefung
20   8  * * *  /usr/local/bin/cron-call.sh /api/cron/abrechnung-einzug
5    10 * * *  /usr/local/bin/cron-call.sh /api/cron/sa-reminder
0    10 * * *  /usr/local/bin/cron-call.sh /api/cron/vollmacht-reminder
0    10 * * *  /usr/local/bin/cron-call.sh /api/cron/gast-conversion-reminder
0    13 * * *  /usr/local/bin/cron-call.sh /api/cron/abrechnungen-faellig-check
10   14 * * *  /usr/local/bin/cron-call.sh /api/cron/abrechnung-kanzlei-reminder
30   14 * * *  /usr/local/bin/cron-call.sh /api/cron/kanzlei-sla-check
0    16 * * *  /usr/local/bin/cron-call.sh /api/cron/reklamation-frist-check
30   16 * * *  /usr/local/bin/cron-call.sh /api/cron/sv-payment-reminders
40   15 * * *  /usr/local/bin/cron-call.sh /api/cron/haftpflicht-ablauf
20   11 * * *  /usr/local/bin/cron-call.sh /api/cron/verifizierung-reminder
0    9  * * *  /usr/local/bin/cron-call.sh /api/cron/mietwagen-tracking
0    9  * * 1  /usr/local/bin/cron-call.sh /api/cron/vs-korrespondenz-review
0    3  * * *  /usr/local/bin/cron-call.sh /api/cron/db-backup
0    3  * * *  /usr/local/bin/cron-call.sh /api/cron/kb-reassign-inactive

# ─── MONATLICH ────────────────────────────────────
30   18 28-31 * * /usr/local/bin/cron-call.sh /api/cron/abrechnung-erstellen
0    18 28-31 * * /usr/local/bin/cron-call.sh /api/cron/monats-abrechnungen
0    9  1 * *  /usr/local/bin/cron-call.sh /api/cron/abrechnung-kanzlei-erstellen
0    9  1 * *  /usr/local/bin/cron-call.sh /api/cron/maik-monatsabrechnung

# ─── LOW ──────────────────────────────────────────
*/30 * * * *  /usr/local/bin/cron-call.sh /api/cron/flowlink-inaktiv
0    4  * * *  /usr/local/bin/cron-call.sh /api/cron/community-leaderboard-update
0    3  * * *  /usr/local/bin/cron-call.sh /api/cron/google-bewertungen
0    4  * * *  /usr/local/bin/cron-call.sh /api/cron/isochrone-backfill
*/5  * * * *  /usr/local/bin/cron-call.sh /api/cron/sync-external-calendars
25 5 * * * /usr/local/bin/cron-call.sh /api/indexnow
0    18 28-31 * * /usr/local/bin/cron-call.sh /api/cron/embed-abrechnung-erstellen
17 * * * * /usr/local/bin/cron-call.sh /api/cron/embed-b-termin-resolution

# --- NACHGETRAGEN 2026-06-29 (Claude Cron-Audit): slot-ttl-cleanup war 47d dormant; recovery-monitor=Dead-Letter-Eskalation ---
*/5 * * * * /usr/local/bin/cron-call.sh /api/cron/slot-ttl-cleanup
0,15,30,45 * * * * /usr/local/bin/cron-call.sh /api/cron/recovery-monitor

# --- NACHGETRAGEN 2026-06-29 #2 (Cron-Audit Routen-Empfehlungen) ---
0 17 * * * /usr/local/bin/cron-call.sh /api/cron/case-billing-batch
0 6 * * * /usr/local/bin/cron-call.sh /api/cron/stripe-reconcile
0 8 * * * /usr/local/bin/cron-call.sh /api/cron/sv-mahnung-saeumnis
*/10 * * * * /usr/local/bin/cron-call.sh /api/cron/kb-beratung-anlage-notify
0 6 * * * /usr/local/bin/cron-call.sh /api/cron/refresh-feeds

# --- NACHGETRAGEN 2026-07-01 (Claude): lead-kalt-cleanup -- taeglich stallende Leads -> kalt; aktiv nach Deploy von PR3329 (vorher harmloser 404) ---
30 4 * * * /usr/local/bin/cron-call.sh /api/cron/lead-kalt-cleanup

# --- NACHGETRAGEN 2026-07-02 (Claude): Golden-Path E2E-Sentinel + Test-Daten-Janitor (PR #3443); aktiv nach Deploy (vorher harmloser 404 via curl -f) ---
# DISABLED 2026-08-23 (Claude): Route existiert NICHT mehr in origin/main (mit Positiv-Kontrolle geprueft) -> lieferte taeglich HTTP 404 und verrauschte das Cron-Log. Lebt heute nur noch als E2E-Spec (tests/e2e/flows/golden-path-*.spec.ts), nicht als Route. 45 3 * * * /usr/local/bin/cron-call.sh /api/cron/golden-path
# DISABLED 2026-08-23 (Claude): Route existiert NICHT mehr in origin/main (mit Positiv-Kontrolle geprueft) -> lieferte taeglich HTTP 404 und verrauschte das Cron-Log. 15 5 * * * /usr/local/bin/cron-call.sh '/api/cron/purge-test-data?confirm=DELETE-TESTDATA'
0    *  * * *  cron-call.sh /api/cron/pipeline-health  # Pipeline-Observability #3327 (health_check_runs -> /admin/health)

# --- B2B Content-Pipeline (taeglich 04:00, AI-Artikel; cron-call.sh setzt Bearer) ---
0 4 * * *  cron-call.sh /api/cron/wissen-pipeline-b2b

# Makler-Wochenreport (PR #3608, gesetzt 2026-07-05 Merge-Session): Mo 07:00 Digest an Opt-in-Makler, One-Click-Opt-out
0 7 * * 1  /usr/local/bin/cron-call.sh /api/cron/makler-wochenreport

# --- NACHGETRAGEN 2026-07-06 (Claude): AI-Claim-Orchestrator PoC (PR #3687); taeglich 06:00 stagnierende Faelle -> Shadow-Vorschlaege; aktiv nach Deploy (vorher harmloser 404) ---
0 6 * * * /usr/local/bin/cron-call.sh /api/cron/claim-orchestrator

# --- NACHGETRAGEN 2026-07-07 (Claude): Trusted-Device-Token-Purge (PR #3819); loescht abgelaufene + >30d alt-widerrufene auth_remember_tokens; aktiv nach Deploy (vorher harmloser 404) ---
20 3 * * * /usr/local/bin/cron-call.sh /api/cron/purge-remember-tokens
# --- NACHGETRAGEN 2026-07-08 (Claude): partner-rang compute (Phase 0 partner-tier-badge); nach google-bewertungen ---
40 3 * * * /usr/local/bin/cron-call.sh /api/cron/compute-partner-rang

# KI-Aufsicht SLA-Rollen-Aufsicht (Ink.1) - taeglich 08:00
0 8 * * * /usr/local/bin/cron-call.sh /api/cron/ki-aufsicht-sla
0 * * * * /usr/local/bin/cron-call.sh /api/cron/repair-reminders
0    2  * * *  /usr/local/bin/cron-call.sh /api/cron/release-provisionen

# --- NACHGETRAGEN 2026-07-14 (Claude b0e963b6): Slice-2c Gegner-Invite-Nachfassen; 48h unbestaetigter Invite -> Dispatch-Task. Ohne diese Zeile eskaliert kein Invite. ---
0 7 * * * /usr/local/bin/cron-call.sh /api/cron/gegner-invite-nachfassen

# --- NACHGETRAGEN 2026-07-14 (Claude marketing-content-studio): Render-Worker-Queue Slice 3 (#4309); holt render_queued-Jobs, rendert 1/Lauf RAM-gegated; aktiv nach Deploy (vorher harmloser 404). ---
*/3 * * * * /usr/local/bin/cron-call.sh /api/cron/marketing-render
# Cold-Mailer-Sequenzen (14.07.): rueckt faellige Enrollments vor + sendet.
# Geschaeftszeiten statt 24/7 - eine Cold-Mail um 03:47 schadet der Domain-Reputation.
# Sendet NICHTS, solange keine aktive Sequenz mit Enrollments existiert.
50   8-17 * * 1-5  /usr/local/bin/cron-call.sh /api/cron/cold-mailer-advance

# --- NACHGETRAGEN 2026-07-20 (Claude): Partner-Aktivierungs-Nudge (PR #4627) -- taeglich 07:00, ein Anruf-Task je Partner-Account ohne Erst-Login; aktiv nach Deploy (vorher harmloser 404 via curl -sf) ---
0 7 * * * /usr/local/bin/cron-call.sh /api/cron/partner-aktivierung-nachfassen
0 8 * * 1 /usr/local/bin/cron-call.sh /api/cron/zustandsaufnahme-faellig  # 3-Monats-Zustandsaufnahme-Reminder #4728 (Mo 08:00 UTC, dedup 30d)
0 6 * * * /usr/local/bin/cron-call.sh /api/cron/werkstatt-onboarding-drip  # Werkstatt-Onboarding-Drip (6 Mails, Stop bei erstem Fall)

# --- NACHGETRAGEN 2026-08-13 13:11 UTC: Haenger-Detektor (PR #5223, Ops-Test I1) ---
# Findet Claims, die >5 Tage im SELBEN Status stehen UND keinen aktiven Termin haben, und
# legt je Fall EINEN Dispatch-Task an. Dedup ueber task_code -> idempotent; deshalb ist
# 4-stuendlich unbedenklich (wiederholte Laeufe erzeugen keine Duplikate, nur ~5 Queries).
# Der SLA-Tracker faengt diese Faelle NICHT: er ist rein reaktiv ueber sla_tracking-Zeilen,
# und 9 der 15 Erst-Funde hatten gar keine.
0 */4 * * *  /usr/local/bin/cron-call.sh /api/cron/haenger-detektor
```

## Audit-Anmerkungen (2026-06-20)

1. **Triple-Reminder-Duplikat (aktiv!):** `send-reminders` (*/5), `whatsapp-erinnerungen` (*/30) und
   `termin-erinnerungen` (stündlich) erzeugen ALLE 24h/2h-Kunden-Reminder mit unterschiedlichem Dedup
   (Flag-Spalten vs. `nachrichten`-LIKE-Textmatch vs. keins) → Risiko doppelter/dreifacher WA an
   Kunden. **Konsolidieren auf einen.**
2. **`monatsabrechnung` (deprecated) läuft noch** (1. d. Monats, 02:00) — schreibt ins Legacy-Schema
   `gutachter_monatsabrechnungen` und doppelt `abrechnung-erstellen`. **Aus der Crontab entfernen +
   Route löschen.**
3. **Keine Observability:** KEINE dieser App-Cron-Routen loggt in `cron_jobs_audit` (das deckt nur
   die 18 pg_cron-Jobs). Kein „last run", kein Fehler-Alert. Ein nach `CRON_SECRET`-Rotation
   401-werfender Cron bliebe wochenlang unbemerkt. **`cron-call.sh` sollte Ergebnis/Exit in eine
   Audit-Tabelle schreiben.**
4. **Stale-URL-Risiko:** `.claude/vps-crons.md` + `vollmacht-reminder.ts` referenzieren noch
   `cmndo.vercel.app`. `cron-call.sh` selbst trifft 127.0.0.1:3000 (korrekt) — aber Doku/Fallbacks
   bereinigen.
5. **`vercel.json` existiert NICHT** — die „Schedule (vercel.json)"-Kommentare in ~15 Route-Files
   sind irreführend; der einzige Trigger ist DIESE Crontab. Kommentare korrigieren.

## Wartung
Crontab ändern: `ssh root@212.132.119.110` → `crontab -e`. Nach jeder Änderung **diese Datei
nachziehen** (sonst driftet der versionierte Abzug). `cron-call.sh` liegt unter
`/usr/local/bin/cron-call.sh` (nicht im Repo — sollte ebenfalls versioniert werden).

## Audit-Addendum 2026-06-29 (Cron-Route ↔ Crontab-Diff)

Diff der **58** existierenden `src/app/api/cron/*/route.ts` gegen den 2026-06-20-Snapshot oben,
ergänzt um DB-Evidenz. Der Snapshot driftet — Punkte unten auf dem **Live-VPS** gegenprüfen.

### A) Route existiert, steht NICHT im Snapshot → potenziell dormant
- **`slot-ttl-cleanup` — BESTÄTIGT DORMANT (DB-Evidenz).** 58 `gutachter_finder_anfragen` haben
  ein gesetztes `reservierter_slot_von` älter als 30 Min (älteste **2026-05-12**, 47 Tage). Der
  Cleanup setzt dieses Feld nach Freigabe auf `null` (`route.ts:64`) — wäre er gelaufen, wären sie
  geräumt. Der File-Kommentar sagt „alle 5 Minuten". Aktueller Slot-Impact gering (0
  `gutachter_termine` in `reserviert` — die Termine wurden über andere Pfade aufgelöst, es bleibt
  Anfrage-Residue), **aber unter Buchungs-Last blockiert ausbleibendes Cleanup Slots.**
  → **`*/5 * * * *` nachtragen.** Optional: die 58 Residue-Anfragen einmalig `reservierter_slot_*=null`.
- **`recovery-monitor`** — neu (Dead-Letter-Framework, PR #3273). Braucht `0,15,30,45 * * * *`,
  sonst eskaliert der Dead-Letter-Monitor nie. (Schon in der #3273-Übergabe vermerkt.)
- **`stripe-reconcile`, `sv-mahnung-saeumnis`, `case-billing-batch`, `kb-beratung-anlage-notify`,
  `refresh-feeds`, `termin-morgen-erinnerung`** — nicht im Snapshot. Prüfen ob (a) seit 2026-06-20
  ergänzt, (b) bewusst aus, (c) vergessen. Hinweise: `sv-mahnung-saeumnis` moot solange 0
  SV-Abrechnungen; `termin-morgen-erinnerung` evtl. redundant zu `send-reminders` (24h);
  `stripe-reconcile` unkritisch (`stripe_events` 0 stranded).

### B) Crontab referenziert eine NICHT existierende Route → toter 404
- **`whatsapp-erinnerungen`** (Crontab oben, `*/30`) — es gibt **kein**
  `src/app/api/cron/whatsapp-erinnerungen/route.ts` (repo-verifiziert). Der `*/30`-Call trifft 404
  und tut nichts. → **Zeile aus der Crontab entfernen.** Folge für **Audit-Note #1**: das
  „Triple-Reminder-Duplikat" ist real nur ein **Double** — `send-reminders` (claim-native
  Telefon-Fix PR #3277) + `termin-erinnerungen`. Das Double-Send-Risiko bleibt; Konsolidierung auf
  einen Reminder-Cron bleibt offen (eigene Task, kein Quick-Fix — die Dedup-Semantik divergiert).

### Konsequenz
Beleg für **Audit-Note #3** (keine Cron-Observability): `slot-ttl-cleanup` ist 47 Tage unbemerkt
nicht gelaufen. Ein Run-Logging in `cron-call.sh` (Exit/Result → Audit-Tabelle, oder die neue
`failed_async_operations`-Infra aus #3273) ist der eigentliche Hebel gegen diese Klasse.

## Stand 2026-06-29 — Audit umgesetzt (Live-VPS)

> Überholt teilweise den 2026-06-20-Abzug oben + das Addendum. Per `paramiko` (Aaron-autorisiert,
> kein SSH-Key vorhanden) auf den Live-VPS angewendet + verifiziert. Backup:
> `/root/crontab-backup-2026-06-29-104801.txt` (Rollback: `crontab <backup>`).

### Umgesetzt
- **`slot-ttl-cleanup`** → `*/5 * * * *` nachgetragen. HTTP 2xx verifiziert; **räumte die 58 hängenden
  Slot-Reservierungen (älteste 47 d) sofort: 58 → 0**.
- **`recovery-monitor`** (Dead-Letter #3273) → `0,15,30,45 * * * *` nachgetragen. HTTP 2xx; clean No-op
  (`failed_async_operations` leer).
- **KORREKTUR `whatsapp-erinnerungen`:** war auf dem Live-VPS **bereits auskommentiert** (Disable
  2026-06-20, Grund „Doppel-WA") — NICHT der oben/im Addendum angenommene aktive `*/30`-404-Call.
  Der 2026-06-20-Abzug oben zeigt die Zeile noch aktiv (Snapshot wurde kurz vor dem Disable gezogen).
  Zeile bleibt als dokumentierter Disabled-Kommentar stehen. Der reale Double-Send läuft über
  `send-reminders` + `termin-erinnerungen` (s. Reminder-Double-Send-Analyse), nicht über diesen.
- Crontab jetzt **67 Zeilen**.

### Empfehlung für die 6 ungeplanten Routen (Aaron-Entscheid — alle live NICHT eingeplant)
Zweck (Header) + DB-Evidenz geprüft:

| Route | Empfehlung | Begründung |
|---|---|---|
| `case-billing-batch` | **schedulen** `0 17 * * *` | Billing-Backstop (AAR-924). DB: **1 Fall billable mit `lead_preis_netto=NULL`** = verpasstes Billing → Revenue-Gap. `processCaseBilling` idempotent. |
| `stripe-reconcile` | **schedulen** `0 6 * * *` | Read-only Payment-Drift-Report (AAR-929 Ph1), Anti-Spam (still bei 0 Drift). Risikolos. |
| `sv-mahnung-saeumnis` | **schedulen** `0 8 * * *` | SV-Mahnstufen 14/21/28 d (AAR-927). DB: 0 SV-Abrechnungen → jetzt No-op, korrekt sobald SV-Billing live. |
| `kb-beratung-anlage-notify` | schedulen `*/10 * * * *` (niedrige Prio) | Vormerk-Email für `kb_beratung`-Termine (AAR-956). DB: 0 pending → No-op jetzt. ⚠ aar-956-Zone, abstimmen. |
| `refresh-feeds` | optional `0 6 * * *` | GEO-Feed-Warming + IndexNow. Low-Impact (No-op solange `/feed*`-Routen fehlen). |
| `termin-morgen-erinnerung` | **GELÖSCHT 2026-07-03** | War der 3. Morgen-Sender (redundant zu `send-reminders` `kunde_morgen`). Nie geschedult (`erinnerung_morgen_gesendet`=0) → Footgun. Im Rahmen der Reminder-Konsolidierung entfernt (s.u.). |

## Stand 2026-07-03 — Reminder-Konsolidierung umgesetzt (Code, kein Schedule-Change)

> Löst **Audit-Note #1** (Reminder-Double-Send) auf. Branch `kitta/reminder-consolidation`, PR gegen `staging`.

**Problem (prod-belegt):** `send-reminders` (`*/5`, Queue `termin_reminders`) und `termin-erinnerungen`
(stündlich, Flag-Scan) sendeten BEIDE die `reminder_24h`- + `reminder_2h`-Kunden-WhatsApps für denselben
Termin mit divergentem Dedup (`termin_reminders.status` vs. `gutachter_termine.erinnerung_*_gesendet`)
→ doppelte WA. DB-Evidenz: 5× `kunde_1h`→`reminder_2h` (Queue) + 8× `erinnerung_2h_gesendet` (Scan) überlappend.

**Fix (Option „Queue als Single-Source", Aaron-Entscheid):**
- `send-reminders` ist jetzt **alleiniger Sender** aller Kunden-/SV-Termin-Reminder. Neuer Reminder-Typ
  **`kunde_24h`** (24h vor Termin, event-driven aus der Queue) ergänzt `kunde_morgen` (07:00) + `kunde_1h`
  (1h) + `sv_route`. Migration `20260703212349` (CHECK um `kunde_24h` erweitert).
- `termin-erinnerungen` macht **nur noch den 48h-Pflichtdokumente-Check** (24h/2h-Kunden-Sends entfernt).
- `termin-morgen-erinnerung` **gelöscht** (Footgun beseitigt).

**Kein Crontab-Schedule-Change nötig:** `send-reminders` (`*/5`) + `termin-erinnerungen` (stündlich) bleiben
beide geplant — nur ihr Verhalten ändert sich per Deploy. `whatsapp-erinnerungen` war bereits 2026-06-20 disabled.
**Nach Deploy verifizieren:** 1 Termin buchen → genau 1× je Reminder-Touchpoint (24h / morgens / 1h), keine Doppel-WA.

## Stand 2026-07-03 — `pipeline-health` nachgetragen (Live-VPS)

> Per `paramiko` (Aaron-autorisiert, root) auf den Live-VPS angewendet + verifiziert. Backup:
> `/root/crontab-backup-pipeline-health-2026-07-03-174753.txt` (Rollback: `crontab <backup>`).

**Befund** (Silent-Dead-Feature-Audit): `health_check_runs = 0` — die Pipeline-Observability (#3327,
gebaut + gemergt, Konsument-Dashboard `/admin/health` vorhanden) lief **NIE**, weil **kein Crontab-Eintrag
existierte**. → die App-weite Silent-Failure-Wache war AUS (jeder stille Pipeline-Ausfall blieb unbemerkt).

**Umgesetzt:** nachgetragen —
```cron
0    *  * * *  cron-call.sh /api/cron/pipeline-health  # Pipeline-Observability #3327
```
Crontab **81 → 82 Zeilen**. Deps vorab verifiziert: `log_cron_job_run`-RPC existiert, `health_check_runs`-
Spalten passen zu `persistAndAlert`, `cron-call.sh`-Wrapper durch 60+ andere Crons bewiesen, Endpoint
code-korrekt (Bearer `CRON_SECRET`).

**Erstlauf-Hinweis:** beim ersten Lauf (kein ok-Vorlauf) alarmiert JEDER nicht-ok-Check die Admins
(Email + In-App). Read-only-Replikat vorab: `webhook-inbound-silent` = **crit (50 Tage LexDrive-Inbound-
Stille)** → der Cron surfaced ab Lauf 1 echte, bislang unsichtbare Probleme an die 3 realen Admins (gewollt —
das ist der Zweck der Observability).

## Stand 2026-07-07 — `purge-remember-tokens` NACHGETRAGEN (Live-VPS)

> Neuer Cron aus dem Trusted-Device-Audit (2FA-Härtung, PR #3819). Per `paramiko`
> (Aaron-autorisiert, root) auf den Live-VPS angewendet + verifiziert. Backup:
> `/root/crontab-backup-20260707-163851-pre-purge.txt` (Rollback: `crontab <backup>`).

**Umgesetzt:** nachgetragen —
```cron
20 3 * * * /usr/local/bin/cron-call.sh /api/cron/purge-remember-tokens
```
Crontab **91 → 94 Zeilen**. Löscht abgelaufene + >30 Tage alt-widerrufene `auth_remember_tokens`
(widerrufene bleiben 30 d als Audit-Spur); idempotent, No-op wenn nichts fällig.

**Aktivierung nach Deploy:** die Route existiert erst nach dem #3819-Deploy (staging→main). Vorher
liefert der Endpoint sauber **404** (verifiziert: `curl` → HTTP 404; `cron-call.sh` nutzt `curl -sf`
→ exit 22 ohne Output/Side-Effect; Kontroll-Route `pipeline-health` = HTTP 200 → App/Secret/Wrapper
ok). Nach dem Deploy schaltet der Cron automatisch scharf (HTTP 200 → `{ ok, geloescht }`). Kein
Security-, sondern ein Hygiene-Cron: der Validator (`validate-remember-token.ts`) lehnt abgelaufene
Tokens ohnehin ab.

## Stand 2026-07-08 — `ki-aufsicht-sla` NACHGETRAGEN (Live-VPS)

> Neuer Cron: KI-Aufsicht SLA-Rollen-Aufsicht (Ink.1, PR #3897 live). Per `paramiko`
> (Aaron-autorisiert, root) auf den Live-VPS angewendet + verifiziert. Backup:
> `/root/crontab-backup-preki-20260708-144147.txt` (Rollback: `crontab <backup>`).

**Umgesetzt:** nachgetragen —
```cron
0 8 * * * /usr/local/bin/cron-call.sh /api/cron/ki-aufsicht-sla  # KI-Aufsicht SLA-Rollen-Aufsicht (Ink.1)
```
Crontab **96 → 99 Zeilen** (Kommentar + Leerzeile + Eintrag).

**Verifiziert:** Test-Trigger `cron-call.sh /api/cron/ki-aufsicht-sla` → exit 0 (HTTP 2xx),
**5 valide `quelle='aufsicht'`-Vorschlaege** generiert (5 Claims, Rollen kundenbetreuer+admin) →
der Live-Cron laeuft E2E (Bearer CRON_SECRET → deployte Route → Generierungs-Fix #3935 → Persist).
Deps: Route auf main deployt, `log_cron_job_run`-RPC + der `cron-call.sh`-Wrapper (60+ Crons) bewaehrt.

**Reif-Fix (im selben PR):** die Aufsicht nutzt jetzt eine **Replace-Strategie** — un-actioned
(`status='offen'`) Vorschlaege werden je Lauf ERSETZT (nicht akkumuliert; `buildDedupeKey` hat einen
randomUUID-Anteil → der partielle Unique-Index dedupliziert Laeufe nicht). Actioned bleiben. E2E belegt
(2 Laeufe → offen-Count 4 dann 6, nicht 9/10).

## Stand 2026-07-11 — `repair-reminders` NACHGETRAGEN (Live-VPS)

> WS6 Slice 2: Nudge-Cron für unbetreute Selbstzahler-Reparatur-Claims (fertig gebaut, war dormant → 404).
> Per paramiko (Aaron-autorisiert, root, kein SSH-Key) auf den Live-VPS angewendet + verifiziert. Backup:
> `/root/crontab-backup-pre-repair-reminders-<ts>.txt` (Rollback: `crontab <backup>`).

**Umgesetzt:** nachgetragen —
```cron
0 * * * * /usr/local/bin/cron-call.sh /api/cron/repair-reminders
```
Crontab **99 → 100 Zeilen**.

**Verifiziert:** Route ist auf prod deployt — unauth-Probe `https://app.claimondo.de/api/cron/repair-reminders`
→ **HTTP 401** (fail-closed vor jeder Logik, kein Trigger). Cron ist „armed", feuert beim nächsten
`0 * * * *`-Tick. **Bewusst NICHT manuell test-getriggert:** der Endpoint sendet kunde-gerichtete In-App-Nudges
(3 Kohorten — keine-Werkstatt/Termin-unbestätigt/Termin-überfällig, idempotent via `mitteilungen`-Marker,
filtert `kundenbetreuer_id IS NULL`); die Erst-Aktivierung läuft über den natürlichen Schedule statt einer
hand-ausgelösten Batch. Auth: inline `Bearer CRON_SECRET` (kompatibel mit `cron-call.sh`, fail-open nur falls
`CRON_SECRET` unset — auf prod gesetzt, per 60+ Crons bewiesen; Härtung auf `assertCronAuth` = optionaler Follow-up).

## Stand 2026-07-24 — `zustandsaufnahme-faellig` NACHGETRAGEN (Live-VPS)

> 3-Monats-Zustandsaufnahme-Reminder-Cron (Flotte, PR #4728, auf prod deployt). Per key-basiertem
> SSH (`~/.ssh/claimondo_vps`, Aaron-autorisiert, root) auf den Live-VPS angewendet + verifiziert.
> Backup: `/root/crontab-backup-20260724-135440-pre-zustandsaufnahme.txt` (Rollback: `crontab <backup>`).

**Umgesetzt:** nachgetragen —
```cron
0 8 * * 1 /usr/local/bin/cron-call.sh /api/cron/zustandsaufnahme-faellig  # 3-Monats-Zustandsaufnahme-Reminder #4728 (Mo 08:00 UTC, dedup 30d)
```
Crontab **112 -> 113 Zeilen**. Der Cron findet Flotten-Fahrzeuge, deren letzter *abgeschlossener*
`vehicle_scans` > 3 Monate zurueckliegt, und erinnert alle aktiven Flottenmanager (in-App-Mitteilung +
best-effort WhatsApp, fail-soft). Dedup ohne DDL: max. 1 Reminder je Fahrzeug / 30 Tage (Anker =
`mitteilungen`-Zeile mit `kontext_typ='fahrzeug'`). Nur bereits-gescannte Fahrzeuge (>= 1 abgeschl. Scan).

**Verifiziert (E2E, sicher):** Test-Trigger via `cron-call.sh /api/cron/zustandsaufnahme-faellig` -> **exit 0**
(HTTP 2xx: Wrapper -> 127.0.0.1:3000 -> Bearer `CRON_SECRET` -> deployte Route). **Sicher weil real-faellige = 0**
(MCP-verifiziert unmittelbar vor dem Trigger): der Endpoint erzeugte **0** Mitteilungen (Live-Count
`titel='Zustandsaufnahme fällig'` = 0, kein realer FM benachrichtigt). Feuert ab jetzt jeden **Montag
08:00 UTC** (= 10:00 MESZ / 09:00 MEZ). Der separate Regel-4-Prod-Smoke (Throwaway-faelliges-Fahrzeug +
FM ohne `whatsapp_nummer` + Dedup-Assert + 0-Leftover-Cleanup) lief gruen (10/10) — Marker
`coordination-zustandsaufnahme-3monats-cron`.

## Stand 2026-07-29 — `werkstatt-onboarding-drip` GEBAUT, NOCH NICHT im Live-Crontab

> Werkstatt-Onboarding-Drip (6-Mail-Aktivierungs-Sequenz, Branch `kitta/werkstatt-onboarding-drip`,
> Tasks 12+13). **Noch NICHT per SSH auf den VPS angewendet** — dieser Eintrag ist die vorbereitete
> Doku fuer den Deploy-Schritt (Muster wie die Eintraege oben, aber ohne Live-Anwendung aus diesem
> Worktree heraus). Vor dem Nachtragen: Prod-Deploy des PRs abwarten (Task 15/16 des Plans:
> Regel-4-Smoke + einmaliger Backfill bestehender Werkstaetten).

**Vorzutragen nach Deploy** (Muster `send-lead-reminders`, taeglich frueh):
```cron
0 6 * * * /usr/local/bin/cron-call.sh /api/cron/werkstatt-onboarding-drip  # Werkstatt-Onboarding-Drip (6 Mails, Stop bei erstem Fall)
```
Arbeitet faellige `werkstatt_onboarding_enrollments` ab (Batch-Cap 100, aelteste `next_send_at`
zuerst): ueberspringt gesperrte Werkstaetten (`werkstaetten.status!='aktiv'`, kein Status-Wechsel),
stoppt bei erstem Fall (`status='aktiviert'`) oder `cold_mail_suppression`-Opt-out/fehlender Email
(`status='gestoppt'`), sonst sendet sie den naechsten aktiven Step und rechnet `next_send_at` gegen
den Enrollment-Anker (`erstellt_am`, nicht `werkstaetten.aktiviert_am` — sonst wuerde ein spaeterer
Backfill alle Offsets auf einmal abfeuern). Ein echter Sende-Fehlschlag (SMTP down etc.) haelt den
Cursor (kein Advance, `next_send_at` bleibt unangetastet) statt den Step permanent zu verlieren —
Retry am naechsten Tick. Jedes Enrollment laeuft isoliert in einem eigenen try/catch (ein Throw killt
nur dieses eine, nicht den Batch). Auth wie alle anderen Crons: `assertCronAuth` (Bearer
`CRON_SECRET`, fail-closed).

**Nach dem Nachtragen verifizieren:** `cron-call.sh /api/cron/werkstatt-onboarding-drip` manuell
triggern -> erwartet `{ ok:true, gesendet, aktiviert, gestoppt, fehler, faellig }`; vorher per MCP
`faellig`-Kandidaten zaehlen (nur Test-Werkstaetten mit Test-Email im ersten Lauf, s. Regel 4 — nie
an echte Empfaenger).

**Update 2026-08-05 (Re-Sync):** der Eintrag `0 6 * * * … werkstatt-onboarding-drip` steht inzwischen
in der Live-Crontab (siehe Voll-Abzug oben) — diese „Vorzutragen"-Sektion ist damit erledigt.

## Stand 2026-08-05 — Voll-Re-Sync des Abzugs (Live-VPS, read-only)

> Im Zuge des AAR-929-Reconcile-Smokes (SSH-Key `~/.ssh/claimondo_vps`, root) wurde `crontab -l`
> frisch gezogen und der Kern-Abzug oben **1:1 ersetzt** (vorher Stand 2026-06-20; Messung 20.07.:
> 19 live-aktive Routen fehlten). **KEINE Änderung an der Live-Crontab selbst** — reiner Doku-Sync.
> Damit ist der „vollständige Re-Sync" aus der früheren Drift-Warnung erledigt.

Delta gegenüber dem alten 2026-06-20-Abzug:

- **Backups:** die 3 `/root/backup-*.sh`-Zeilen sind seit 2026-06-20 als **FAKE-BACKUP DISABLED**
  auskommentiert (sicherten eine nicht-existente SQLite-DB → 4-KB-Leerarchiv; echtes Netz =
  Supabase-PITR + `db-backup`-Route, die weiterhin täglich 03:00 läuft). Der alte Abzug zeigte sie aktiv.
- **`release-provisionen` (0 2)** ersetzt `release-makler-provisionen` + `release-werkstatt-provisionen`.
- **`zahlungspruefung` (10 8 * * *)** war bislang **nirgends** dokumentiert (weder Abzug noch Addendum).
- **Seit 20.06. neu geschedult** (Details in den Addenda-Sektionen bzw. Live-Kommentaren):
  `slot-ttl-cleanup` (*/5) · `recovery-monitor` (0,15,30,45) · `case-billing-batch` (0 17) ·
  `stripe-reconcile` (0 6) · `sv-mahnung-saeumnis` (0 8) · `kb-beratung-anlage-notify` (*/10) ·
  `refresh-feeds` (0 6) · `lead-kalt-cleanup` (30 4) · `golden-path` (45 3) ·
  `purge-test-data` (15 5) · `pipeline-health` (0 *) · `wissen-pipeline-b2b` (0 4) ·
  `makler-wochenreport` (0 7 Mo) · `claim-orchestrator` (0 6) · `purge-remember-tokens` (20 3) ·
  `compute-partner-rang` (40 3) · `ki-aufsicht-sla` (0 8) · `repair-reminders` (0 *) ·
  `marketing-render` (*/3) · `cold-mailer-advance` (50 8-17 Mo–Fr) ·
  `zustandsaufnahme-faellig` (0 8 Mo) · `werkstatt-onboarding-drip` (0 6).
- **Nichts ist ersatzlos entfallen** — jede Route des alten Abzugs ist live noch da, disabled-mit-
  Kommentar (Backups, `whatsapp-erinnerungen`) oder durch einen Nachfolger ersetzt (Provisions-Releases).
- **Audit-Note #2 bleibt offen:** das @deprecated `monatsabrechnung` (0 2 am 1.) läuft live weiterhin.
  *(Erledigt 2026-08-08 — Zeile vom VPS entfernt, s. Sektion unten.)*

## Stand 2026-08-08 — `monatsabrechnung`-Crontab-Zeile ENTFERNT (Live-VPS)

> Aaron-Go 08.08. Per key-basiertem SSH (root) die tote Zeile `0 2 1 * * … /api/cron/monatsabrechnung`
> entfernt (Crontab 114 → 113 Zeilen). Backup:
> `/root/crontab-backup-20260808-121932-pre-monatsabrechnung-remove.txt` (Rollback: `crontab <backup>`).
> Damit ist **Audit-Anmerkung #2 (2026-06-20) vollständig erledigt** — beide Hälften:
>
> - **Route:** war bereits seit der System-A/B-Konsolidierung (Spec 2026-07-01) aus dem Code gelöscht;
>   der Guard-Test `src/app/api/cron/no-monatsabrechnung.test.ts` sichert das ab. Die Crontab-Zeile
>   traf seit dem 01.07. nur noch einen harmlosen 404 (`cron-call.sh` nutzt `curl -sf` → exit 22, no-op).
>   Verifiziert 08.08.: unauth-Probe `/api/cron/monatsabrechnung` → **HTTP 404** (Kontrolle
>   `/api/cron/stripe-reconcile` → 401 = existiert/auth-gated).
> - **Daten:** `gutachter_monatsabrechnungen` enthält **0 Rows** (DB-verifiziert 08.08.) — kein
>   Datenverlust moeglich, nichts konsumiert neue Legacy-Rows. Der Drop der leeren Tabelle selbst
>   ist NICHT Teil dieser Aenderung (separater Entscheid, DDL via MCP-Migration).
>
> Entfernung mit Differenz-Guard (Abbruch wenn ≠ 1 Zeile rausfaellt); `maik-monatsabrechnung` und
> `monats-abrechnungen` unberuehrt (verifiziert per `crontab -l`-Grep nach der Aenderung).


## 2026-08-23 — drei Eintraege liefen ins Leere (404), auf DISABLED gesetzt

Bei einer Inventur des Cron-Bestands (81 Routen im Code · 79 crontab-Zeilen · 25 pg_cron-Jobs)
fielen drei Eintraege auf, die **taeglich HTTP 404** lieferten:

```
03:45  /api/cron/golden-path                             FEHLER http=404
05:15  /api/cron/purge-test-data?confirm=DELETE-TESTDATA FEHLER http=404
08:10  /api/cron/zahlungspruefung                        FEHLER http=404
```

Alle drei existieren **nicht** in `origin/main` — geprueft mit `git ls-tree` **und einer
Positiv-Kontrolle** (`storage-referenz-check` liefert dort 1 Datei, das Instrument lebt also).

* `zahlungspruefung` wurde in **PR #3604** ausdruecklich entfernt („obsolete, dead data
  source") — nur der crontab-Eintrag blieb stehen.
* `golden-path` lebt heute als **E2E-Spec** (`tests/e2e/flows/golden-path-*.spec.ts`), nicht
  als Route.
* `purge-test-data` hat keinen Nachfolger im Baum.

**Auskommentiert statt geloescht** (Hausregel dieses crontabs, wie bei den FAKE-BACKUP-Zeilen):
der Eintrag bleibt als Spur lesbar und ist mit einem Handgriff reaktivierbar.
Sicherung vorher unter `/root/crontab-backup-2026-08-23.txt`.

Verifikation: aktive `cron-call.sh`-Zeilen **79 → 76**, danach **0** aktive Treffer auf die
drei Namen.

⭐ Sichtbar wurden sie ueberhaupt erst, weil `cron-call.sh` seit dem 18.08. den HTTP-Code
protokolliert. Vorher verschluckte `curl -sf … >/dev/null 2>&1` jeden Fehlschlag — ein Cron,
der seit Monaten ins Leere lief, sah aus wie einer, der laeuft.
