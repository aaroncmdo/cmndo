# SP5b — outlookProvider (OUT) — Implementierungsplan

> **For agentic workers:** superpowers:executing-plans (inline).

**Goal:** `outlookProvider` (Graph OUT-Sync) für `gutachter_termine`, in DEFAULT_PROVIDERS + SV/KB verdrahtet. Dormant bis Azure.

## Global Constraints
- Branch `kitta/outlook-provider-out` (stacked auf SP5a). PR gegen SP5a-Branch. Regel 2 (apply_migration).
- Env-gated (Provider skippt ohne MS-Token). Google/CalDAV unverändert. 7-Punkte-Audit.
- Graph: `toBerlinWallClock` + `GOOGLE_CALENDAR_TIMEZONE` ('Europe/Berlin') reuse.

### Task 1: Migration `gutachter_termine.ms_event_id`
```sql
alter table gutachter_termine add column if not exists ms_event_id text;
```
apply_migration `gutachter_termine_ms_event_id` → File==Version → READ-Verify. Commit.

### Task 2: `outlookProvider` + DEFAULT_PROVIDERS + Row/Select
**Modify** `src/lib/termine/engine/kalender-sync.ts`:
- Import `getMicrosoftAccessTokenForUser`, `toBerlinWallClock`/`GOOGLE_CALENDAR_TIMEZONE` (schon da).
- `TerminSyncRow` += `ms_event_id: string | null`; `SYNC_SELECT` += `ms_event_id`.
- `outlookProvider` (Mirror googleProvider, raw fetch `/me/events` POST/PATCH/DELETE; upsert speichert `ms_event_id`, remove nullt es; 404 bei delete = ok).
- `DEFAULT_PROVIDERS = [googleProvider, caldavProvider, outlookProvider]`.
- tsc. Commit.

### Task 3: kb-termin-sync Meet-Fix
**Modify** `src/lib/termine/kb-termin-sync.ts`: `import { outlookProvider }`; im Meet-Zweig `{ providers: [caldavProvider, outlookProvider] }` (statt nur caldav). tsc + betroffene vitest. Commit.

### Task 4: SV-Outlook-Wrapper + Wiring
**Create** `src/lib/microsoft/sv-termin-sync.ts` (`syncSvTerminToOutlook`/`deleteSvTerminFromOutlook`, mirror google/caldav-Wrapper).
**Wire:** `grep -rn "syncSvTerminToCalDav\|deleteSvTerminFromCalDav" src/app` → an jeder Site die Outlook-Variante ins Promise.all/Import ergänzen (sync neben CalDAV, delete neben CalDAV-delete). tsc + Full-Build. Commit.

### Task 5: Verifikation + PR
tsc0 · Full-Build0 · vitest (Domain, kein Regress) · 3 Ratchets 0-neu · READ (ms_event_id-Spalte live). KEIN funktionaler Smoke (dormant). Push + PR gegen `kitta/outlook-connect-foundation`. Marker + MEMORY.md.

## Self-Review
Faithful Mirror von googleProvider + der CalDAV-SV-Verdrahtung; additiv + env-gated; ms_event_id-Idempotenz wie google_event_id.
