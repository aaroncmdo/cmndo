# SP5c — Outlook IN-Sync (Graph free/busy → Cache)

**Datum:** 2026-07-04
**Kontext:** SP5c des Outlook-Zweigs (nach SP5b outlookProvider #3628). Ein verbundener Outlook-Kalender soll — wie Google-FreeBusy + CalDAV — seine Belegung in `sv_kalender_events_cache` cachen, damit `v_belegung` sie surfaced und Slots blockt. Stacked auf SP5b. Dormant (kein MS-Token → skip).

## Ziel
Der Cron `syncAllExternalCalendars` (`sync-to-cache.ts`) cached zusätzlich die Outlook-Events (Microsoft Graph `calendarView`) aller Profile mit `ms_refresh_token`, profil-gekeyed mit `source='outlook'`. `v_belegung` liest den Cache quellen-agnostisch → Outlook-Belegung blockt automatisch SV- **und** KB-Slots (kb-slots liest `v_belegung`, SP2c).

## Architektur (Mirror der Google/CalDAV-Branches)

### 1. Migration (Regel 2)
`sv_kalender_events_cache.source`-CHECK (`sv_kalender_events_cache_source_check`) von `('google','caldav')` auf `('google','caldav','outlook')` erweitern (DROP + ADD).

### 2. `sync-to-cache.ts`
- `CacheRow.source` / `pruneStaleExternalEvents` / `diffAndApply` / `SyncResult.source` : `'google' | 'caldav'` → `+ 'outlook'`.
- **`normalizeGraphUtc(dt)` (pure, testbar):** Graph liefert mit `Prefer: outlook.timezone="UTC"` einen dateTime ohne `Z` und mit 7 Nachkommastellen → als UTC parsen (`Z` anhängen falls kein TZ-Marker) → Standard-ISO. Ungültig → `''`.
- **`syncOutlook(profileId, db)`:** `getMicrosoftAccessTokenForUser` → kein Token → `{0,0}`; `GET /me/calendarView?startDateTime&endDateTime&$select=id,subject,start,end&$top=100` (Header `Prefer: outlook.timezone="UTC"`) über die nächsten `SYNC_HORIZON_DAYS`; Events → Cache-Rows (`external_event_id=id`, start/end via `normalizeGraphUtc`, `titel=subject`) → `diffAndApply(db, profileId, 'outlook', …)`. Fail-soft.
- **`syncAllExternalCalendars`:** zusätzliche Iteration über `profiles` mit `ms_refresh_token is not null` → `syncOutlook`.
- Import `getMicrosoftAccessTokenForUser`.

### 3. Kein `v_belegung`-Change
`v_belegung` unioniert `sv_kalender_events_cache` quellen-agnostisch (kein `source`-Filter) → Outlook-Rows surfacen automatisch als `belegung_typ='extern'` beim korrekten Profil (SV/KB via SP1-Attribution).

## Testing
- **Unit (vitest):** `normalizeGraphUtc` (kein-Z → +Z; mit-Z unverändert; ungültig → '').
- **Build/tsc/Ratchets** grün. **KEIN funktionaler Smoke** (dormant). READ: source-Constraint erlaubt 'outlook'.

## Nicht-Ziele / Risiko
admin_termine-Outlook = SP5d. Additiv (Constraint-Erweiterung + neue Sync-Funktion). Dormant → keine Outlook-Rows bis Verbindung. Rollback = Code-Revert (Constraint-Rückbau nur falls 'outlook'-Rows existieren; im dormanten Zustand keine).
