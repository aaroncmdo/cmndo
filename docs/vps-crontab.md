# VPS-Crontab — app.claimondo.de (212.132.119.110)

**Gezogen 2026-06-20** per `crontab -l` (root). Diese Datei versioniert die bislang **nur auf dem VPS**
gepflegte Crontab (Audit-Befund: war nirgends im Repo → Single Point of Failure beim Neuaufsetzen).
Quelle der Wahrheit bleibt der VPS; diese Datei ist der versionierte Abzug + Audit-Annotation.

Alle App-Crons laufen über den Wrapper `/usr/local/bin/cron-call.sh <pfad>` (setzt `Authorization:
Bearer $CRON_SECRET` + trifft die lokale App auf `127.0.0.1:3000`). `pg_cron` (18 DB-Jobs) und die
GitHub-Action `backup.yml` sind **separate** Scheduler und hier NICHT enthalten.

## Live-Crontab (Abzug 2026-06-20)

```cron
# Backups (Shell-Skripte, nicht App-Routen)
0 2 * * *   /root/backup-daily.sh   >> /var/log/claimondo-backup.log 2>&1
0 3 * * 0   /root/backup-weekly.sh  >> /var/log/claimondo-backup.log 2>&1
0 4 1 * *   /root/backup-monthly.sh >> /var/log/claimondo-backup.log 2>&1

# ─── KRITISCH ───
*/5  * * * *  cron-call.sh /api/cron/dispatch-lead-alert
*/5  * * * *  cron-call.sh /api/cron/send-reminders            # ⚠ Reminder-Dup #1 (s.u.)
*/5  * * * *  cron-call.sh /api/cron/gutachter-erinnerungen
*/10 * * * *  cron-call.sh /api/notifications/process          # Notification-Worker (Pipeline)
*/15 * * * *  cron-call.sh /api/cron/caldav-healthcheck
*/15 * * * *  cron-call.sh /api/cron/sla-check
*/15 * * * *  cron-call.sh /api/cron/kb-termin-reminder-1h
*/30 * * * *  cron-call.sh /api/cron/verlegung-eskalation      # einzige emitEvent-Cron
*/30 * * * *  cron-call.sh /api/cron/whatsapp-erinnerungen     # ⚠ Reminder-Dup #2
0    * * * *  cron-call.sh /api/cron/termin-erinnerungen       # ⚠ Reminder-Dup #3
0    * * * *  cron-call.sh /api/cron/re-termin-eskalation
0    8 * * *  cron-call.sh /api/cron/vs-timer
0  */6 * * *  cron-call.sh /api/cron/fall-abschluss
0  */6 * * *  cron-call.sh /api/cron/task-eskalation
15  17 * * *  cron-call.sh /api/cron/no-show-timeout

# ─── WICHTIG ───
30 */4 * * *  cron-call.sh /api/cron/pflichtdokumente-reminder
15  *  * * *  cron-call.sh /api/cron/task-erinnerungen
30  *  * * *  cron-call.sh /api/cron/kb-termin-reminder
45  *  * * *  cron-call.sh /api/cron/send-lead-reminders
0   7  * * *  cron-call.sh /api/cron/abrechnung-reminder
0   7  * * *  cron-call.sh /api/cron/sv-termin-dokument-reminder
10  8  * * *  cron-call.sh /api/cron/zahlungspruefung
20  8  * * *  cron-call.sh /api/cron/abrechnung-einzug
5   10 * * *  cron-call.sh /api/cron/sa-reminder
0   10 * * *  cron-call.sh /api/cron/vollmacht-reminder
0   10 * * *  cron-call.sh /api/cron/gast-conversion-reminder  # emittiert notification_events
0   13 * * *  cron-call.sh /api/cron/abrechnungen-faellig-check
10  14 * * *  cron-call.sh /api/cron/abrechnung-kanzlei-reminder
30  14 * * *  cron-call.sh /api/cron/kanzlei-sla-check
0   16 * * *  cron-call.sh /api/cron/reklamation-frist-check
30  16 * * *  cron-call.sh /api/cron/sv-payment-reminders
40  15 * * *  cron-call.sh /api/cron/haftpflicht-ablauf
20  11 * * *  cron-call.sh /api/cron/verifizierung-reminder
0   9  * * *  cron-call.sh /api/cron/mietwagen-tracking
0   2  * * *  cron-call.sh /api/cron/release-makler-provisionen
0   9  * * 1  cron-call.sh /api/cron/vs-korrespondenz-review
0   3  * * *  cron-call.sh /api/cron/db-backup
0   3  * * *  cron-call.sh /api/cron/kb-reassign-inactive

# ─── MONATLICH ───
30 18 28-31 * *  cron-call.sh /api/cron/abrechnung-erstellen
0  18 28-31 * *  cron-call.sh /api/cron/monats-abrechnungen
0  2  1 * *      cron-call.sh /api/cron/monatsabrechnung          # ⚠ @deprecated (Legacy System A)
0  9  1 * *      cron-call.sh /api/cron/abrechnung-kanzlei-erstellen
0  9  1 * *      cron-call.sh /api/cron/maik-monatsabrechnung
0  18 28-31 * *  cron-call.sh /api/cron/embed-abrechnung-erstellen

# ─── LOW ───
*/30 * * * *  cron-call.sh /api/cron/flowlink-inaktiv
0    4 * * *  cron-call.sh /api/cron/community-leaderboard-update
0    3 * * *  cron-call.sh /api/cron/google-bewertungen
0    4 * * *  cron-call.sh /api/cron/isochrone-backfill
0    6 * * *  cron-call.sh /api/cron/cardentity-recheck
*/5  * * * *  cron-call.sh /api/cron/sync-external-calendars
25   5 * * *  cron-call.sh /api/indexnow
17   * * * *  cron-call.sh /api/cron/embed-b-termin-resolution
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
