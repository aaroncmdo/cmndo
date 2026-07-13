# SP5c — Outlook IN-Sync — Plan

> superpowers:executing-plans (inline).

**Goal:** `syncAllExternalCalendars` cached Outlook-Belegung (Graph calendarView) → `sv_kalender_events_cache` (source='outlook') → `v_belegung` blockt Slots. Dormant bis Azure.

## Constraints
Branch `kitta/outlook-in-sync` (stacked SP5b). PR gegen SP5b-Branch. Regel 2. Env-gated (skip ohne MS-Token). Google/CalDAV unverändert.

### Task 1: Migration — source-Constraint += 'outlook'
```sql
alter table sv_kalender_events_cache drop constraint if exists sv_kalender_events_cache_source_check;
alter table sv_kalender_events_cache add constraint sv_kalender_events_cache_source_check
  check (source = any (array['google'::text, 'caldav'::text, 'outlook'::text]));
```
apply_migration `cache_source_outlook` → File==Version → READ-Verify. Commit.

### Task 2: `sync-to-cache.ts` + normalizeGraphUtc-Test (TDD)
- Test (`__tests__/sync-to-cache.test.ts` oder eigenes): `normalizeGraphUtc('2026-07-10T08:00:00.0000000')` → endet 'Z'/valides ISO; mit 'Z' unverändert; '' → ''.
- Implement: `normalizeGraphUtc` (pure export), Typen `'google'|'caldav'` → `+'outlook'` (CacheRow/prune/diffAndApply/SyncResult), `syncOutlook(profileId, db)` (Graph calendarView, Prefer UTC, fail-soft), Import `getMicrosoftAccessTokenForUser`, MS-Iteration in `syncAllExternalCalendars`.
- tsc + vitest. Commit.

### Task 3: route.ts Log (optional) + Verifikation + PR
- `sync-external-calendars/route.ts`: Log-Text „+Outlook" (optional/minor).
- tsc0 · Full-Build0 · vitest (kein Regress) · 3 Ratchets 0-neu · READ (Constraint erlaubt 'outlook'). KEIN funktionaler Smoke. Push + PR gegen `kitta/outlook-provider-out`. Marker + MEMORY.md.

## Self-Review
Mirror der Google/CalDAV-Branches; normalizeGraphUtc pure+getestet; additiv + env-gated.
