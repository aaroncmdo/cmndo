# SP5d — admin_termine-Outlook (Rückrufe) — Outlook-Zweig-Abschluss

**Datum:** 2026-07-04
**Kontext:** SP5d = letztes Stück des Outlook-Zweigs (nach SP5a Connect, SP5b OUT, SP5c IN). Rückrufe (`admin_termine`) syncen heute nach Google (`admin-event-sync`) + CalDAV (SP2d). SP5d ergänzt **Outlook** (Graph) — Mirror des SP2d-CalDAV-Admin-Zweigs. Stacked auf SP5c. Dormant (kein MS-Token → skip).

## Ziel
Rückrufe erscheinen/aktualisieren/verschwinden auch im **Outlook**-Kalender des `zugewiesen_an`-Mitarbeiters, zusätzlich zu Google + CalDAV, mit demselben Owner-Gate + Lifecycle.

## Architektur (Mirror `src/lib/kalender/caldav/admin-event-sync.ts` aus SP2d)

### 1. Migration (Regel 2)
`admin_termine.ms_event_id text` (Idempotenz-Anker, wie `caldav_object_url` für CalDAV / `google_event_id` für Google). Default-Kalender → kein ms_calendar_id.

### 2. Neu `src/lib/microsoft/admin-event-sync.ts` → `syncAdminTerminToOutlook(terminId)`
Liest `admin_termine` (inkl. `ms_event_id`), owner-gated (`zugewiesen_an` → `getMicrosoftAccessTokenForUser`; kein Token → return); `shouldDelete` (`erledigt`/`abgesagt`/`storniert`) / `shouldUpsert` (`offen`) wie Google/CalDAV. Content aus geteiltem `buildAdminEventContent` (SP2d). Graph `/me/events`: `ms_event_id` → PATCH (update) sonst POST (create → `ms_event_id` speichern); Delete → `ms_event_id` nullen. Event-Body wie `outlookProvider` (subject/body/start+end mit `toBerlinWallClock` + `timeZone`). Fail-soft.

### 3. Hook
Im bestehenden `syncAdminTerminCalendarEvent` (Google-Entry, `google-calendar/admin-event-sync.ts`) eine Zeile analog zum SP2d-CalDAV-Hook: `syncAdminTerminToOutlook(terminId)` fail-soft → jede Rückruf-Call-Site (SP2d-verdrahtet) bekommt Outlook mit.

## Testing
- **Build/tsc/Ratchets** grün. **KEIN funktionaler Smoke** (dormant). READ: `admin_termine.ms_event_id`-Spalte live. (Keine neue pure Logik — Event-Body/Owner-Gate sind I/O; buildAdminEventContent ist schon getestet.)

## Nicht-Ziele / Risiko
Additiv (1 Spalte, 1 Modul, 1 Hook-Zeile). Google/CalDAV/OUT/IN unverändert. Dormant → No-Op ohne MS-Token. Rollback = Code-Revert.

## Abschluss
Nach SP5d ist der **Outlook-Zweig vollständig**: Connect (SP5a) + OUT gutachter_termine (SP5b) + IN free/busy (SP5c) + admin_termine/Rückrufe (SP5d). Damit deckt Outlook dieselbe Fläche wie Google/CalDAV — dormant bis Azure-App.
