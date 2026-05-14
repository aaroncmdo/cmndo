# CalDAV-FreeBusy-Smoke gegen Staging — 2026-05-14

## Setup

- **URL:** `https://app.staging.claimondo.de`
- **Basic-Auth:** `aaroncmdo / ClaimondoSuperuser123789!!`
- **SV-Login:** `aaron.sprafke@claimondo.de / Test1234!` (Display-Name „Test-Aaron Test-Sprafke")
- **iPhone-Setup:** Aaron hat heute auf seinem iPhone einen Termin in dem Kalender angelegt, der mit dem Test-Aaron-Account auf staging via CalDAV synchronisiert.
- **Branch / PR:** [`kitta/caldav-freebusy-restore`](https://github.com/aaroncmdo/cmndo/pull/1147) (noch **nicht** auf staging deployed).

## Was getestet

1. Login als Test-Aaron auf staging-Slot
2. `/gutachter/kalender` (Kalender-View) — sollte den iPhone-Termin als „Gebucht"-Pill auf Donnerstag (14.05.) zeigen
3. `/gutachter/kalender?view=liste` (Listen-View)

## Ergebnis (vor Fix)

**Bug bestätigt** — auf dem Kalender-View ist Donnerstag 14.05. komplett leer; kein einziger externer Termin wird angezeigt.

Sichtbar in `03-sv-kalender-kalender-view.png`:
- Eingeloggt als „Test-Aaron T... Sachverständiger"
- Wochenansicht 11.–17. Mai 2026, heutiger Tag (DO 14) ist farblich hervorgehoben
- Donnerstags-Spalte: **leer** (kein FreeBusy-Pill, kein Apple-Event)
- Top-Right zeigt zusätzlich „Google Calendar verbinden"-Button → Test-Aaron hat keine Google-Verbindung. Der aktuelle Code-Pfad ist `if (gcalConnected) { … getSvBusySlots() }` → wenn Google fehlt, wird gar nichts gefetched. Das ist exakt die Read-Lücke, die PR #1147 schließt: nach dem Fix wird stattdessen aus `sv_kalender_events_cache` gelesen, was der Cron-Job aus Google **und** CalDAV befüllt.

Liste-View (`04-sv-kalender-liste-view.png`): „Noch keine Termine" — bestätigt dass Test-Aaron keine internen Auftrags-Termine hat. Erwartetes Verhalten, externalBusy-Pills kommen aus dem Cache, nicht aus dieser Liste.

## Aussage

Der Bug-Zustand auf staging ist visuell reproduziert. Damit der Fix verifiziert werden kann, muss PR #1147 nach `staging` gemerged und der VPS-PM2-Slot reloaded werden. Ein zweiter Smoke-Run nach Deploy sollte den iPhone-Event als Pill auf Donnerstag zeigen.

## Offene Verifikation

Ein dritter Punkt der Diagnose ist visuell nicht prüfbar gewesen (Session-Loss auf der Einstellungen-Page nach erstem Run): ob die CalDAV-Verbindung von Test-Aaron auf staging tatsächlich aktiv ist (`sv_kalender_verbindungen.provider='caldav' AND last_error IS NULL`). Wenn die Verbindung fehlt, würde auch der gefixte Code keinen Event zeigen — die Verbindung muss in dem Fall zuerst über `/gutachter/einstellungen/kalender` hergestellt werden.

Schnellcheck via SQL gegen die staging-DB:

```sql
SELECT v.id, v.sv_id, v.username, v.last_error, v.last_synced_at,
       COUNT(c.id) FILTER (WHERE c.source='caldav') AS cached_caldav_events
  FROM sv_kalender_verbindungen v
  LEFT JOIN sv_kalender_events_cache c ON c.sv_id = v.sv_id
 WHERE v.provider = 'caldav'
   AND v.sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id IN
                    (SELECT id FROM profiles WHERE email = 'aaron.sprafke@claimondo.de'))
 GROUP BY v.id;
```

## Files

| File | Zweck |
|---|---|
| `01-login.png` | Login-Page |
| `02-after-login.png` | SV-Heute nach Login |
| `03-sv-kalender-kalender-view.png` | **Bug:** Donnerstag 14.05. leer |
| `04-sv-kalender-liste-view.png` | Liste-View „Noch keine Termine" |
| `kalender.html` | DOM-Snapshot Kalender-View |
| `tests/e2e/flows/smoke-caldav-freebusy.spec.ts` | Smoke-Spec |
