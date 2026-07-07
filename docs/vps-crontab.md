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
*/5  * * * *  cron-call.sh /api/cron/send-reminders            # Kunden-/SV-Termin-Reminder — ALLEINIGER Sender ab 2026-07-03 (s.u.)
*/5  * * * *  cron-call.sh /api/cron/gutachter-erinnerungen
*/10 * * * *  cron-call.sh /api/notifications/process          # Notification-Worker (Pipeline)
*/15 * * * *  cron-call.sh /api/cron/caldav-healthcheck
*/15 * * * *  cron-call.sh /api/cron/sla-check
*/15 * * * *  cron-call.sh /api/cron/kb-termin-reminder-1h
*/30 * * * *  cron-call.sh /api/cron/verlegung-eskalation      # einzige emitEvent-Cron
*/30 * * * *  cron-call.sh /api/cron/whatsapp-erinnerungen     # ⚠ Reminder-Dup #2
0    * * * *  cron-call.sh /api/cron/termin-erinnerungen       # nur noch 48h-Pflichtdokumente-Check ab 2026-07-03 (s.u.)
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
0   2  * * *  cron-call.sh /api/cron/release-werkstatt-provisionen
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

## Stand 2026-07-07 — `purge-remember-tokens` (PR #3819, PENDING VPS-Application)

> Neuer Cron aus dem Trusted-Device-Audit (2FA-Härtung, [[coordination-2fa-auth-hardening]]).
> Route gebaut (`src/app/api/cron/purge-remember-tokens/route.ts`, `CRON_SECRET`-gated), aber
> **noch NICHT auf dem Live-VPS geschedult** — diese Zeile muss per `crontab -e` ergänzt werden
> (Aaron/ops), sonst wächst `auth_remember_tokens` unbegrenzt. Kein Security-, sondern ein
> Hygiene-Problem: der Validator (`validate-remember-token.ts`) lehnt abgelaufene Tokens ohnehin ab.

```cron
20 3 * * *  cron-call.sh /api/cron/purge-remember-tokens  # Trusted-Device-Token-Purge (PR #3819)
```

Löscht abgelaufene + >30 Tage alt-widerrufene Tokens (widerrufene bleiben 30 d als Audit-Spur).
Idempotent, No-op wenn nichts fällig. Nach Anwendung: Zeile in den Live-Crontab-Block oben
(Sektion „LOW") hochziehen + Zeilenzahl nachziehen.

