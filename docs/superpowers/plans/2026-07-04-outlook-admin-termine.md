# SP5d — admin_termine-Outlook — Plan

> superpowers:executing-plans (inline).

**Goal:** Rückrufe (`admin_termine`) syncen zusätzlich nach Outlook (Graph). Mirror SP2d-CalDAV-Admin. Dormant.

## Constraints
Branch `kitta/outlook-admin-termine` (stacked SP5c). PR gegen SP5c-Branch. Regel 2. Env-gated. Google/CalDAV unverändert.

### Task 1: Migration `admin_termine.ms_event_id`
```sql
alter table admin_termine add column if not exists ms_event_id text;
```
apply_migration `admin_termine_ms_event_id` → File==Version → READ-Verify. Commit.

### Task 2: `src/lib/microsoft/admin-event-sync.ts` + Hook
- Neu `syncAdminTerminToOutlook(terminId)`: mirror `caldav/admin-event-sync.ts` (owner-gated via getMicrosoftAccessTokenForUser; shouldDelete/shouldUpsert; buildAdminEventContent; Graph /me/events POST/PATCH/DELETE; ms_event_id; fail-soft; Event-Body wie outlookProvider mit toBerlinWallClock+timeZone).
- Hook in `google-calendar/admin-event-sync.ts` (`syncAdminTerminCalendarEvent`): `await import('@/lib/microsoft/admin-event-sync').then(m => m.syncAdminTerminToOutlook(terminId)).catch(() => {})` analog zum SP2d-CalDAV-Hook.
- tsc + Full-Build. Commit.

### Task 3: Verifikation + PR
tsc0 · Full-Build0 · vitest (kein Regress) · 3 Ratchets 0-neu · READ (ms_event_id-Spalte live). KEIN funktionaler Smoke. Push + PR gegen `kitta/outlook-in-sync`. Marker + MEMORY.md (Outlook-Zweig komplett).

## Self-Review
Mirror des SP2d-CalDAV-Admin-Zweigs (owner-gated, fail-soft, buildAdminEventContent geteilt); additiv + env-gated.
