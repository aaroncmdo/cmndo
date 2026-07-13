# SP5b — outlookProvider (OUT-Sync für `gutachter_termine`)

**Datum:** 2026-07-04
**Kontext:** SP5b des Outlook-Zweigs (nach SP5a Connect-Fundament, #3626). Der `outlookProvider` schreibt Termine in den Outlook-Kalender des Assignees (Microsoft Graph). Faithful Mirror von `googleProvider` mit raw `fetch`. **Env-gated/dormant** (kein MS-Token ohne Azure → `skip`). Stacked auf SP5a.

## Ziel

`gutachter_termine`-Termine (SV-Begutachtung + KB-Beratung) syncen zusätzlich in den verbundenen **Outlook**-Kalender des Assignees — bidirektional-fähig (OUT hier; IN = SP5c), mit derselben assignee-generischen Engine.

## Architektur

### 1. Schema (additive Migration)
`gutachter_termine.ms_event_id text` (Idempotenz-Anker, wie `google_event_id`). Kein `ms_calendar_id` — Graph nutzt den Default-Kalender (`/me/events`).

### 2. `outlookProvider` (`kalender-sync.ts`, Mirror von `googleProvider`)
- `upsert`: `resolveAssigneeProfileId` → `getMicrosoftAccessTokenForUser(profileId)`; kein Token → `skip`. Graph-Event-Body (`subject`=kontext.summary, `body.content`=description, `start/end`={`dateTime: toBerlinWallClock(...)`, `timeZone: 'Europe/Berlin'`}, optional `location.displayName`). `ms_event_id` gesetzt → `PATCH /me/events/{id}` (`updated`), sonst `POST /me/events` → `ms_event_id` speichern (`created`). Non-OK → throw (Orchestrator fängt per-Provider).
- `remove`: kein `ms_event_id` → `skip`; `DELETE /me/events/{id}` (404 = ok); `ms_event_id` nullen.
- **`TerminSyncRow.ms_event_id`** + **`SYNC_SELECT`** ergänzen.
- **`DEFAULT_PROVIDERS = [googleProvider, caldavProvider, outlookProvider]`** → alles, was die Engine mit Default-Providern nutzt (KB via `syncKbTerminOut` non-Meet), bekommt Outlook automatisch.

### 3. Meet-Fix in `kb-termin-sync.ts`
Bei Meet-Video war der Provider-Satz `[caldavProvider]` (Google gehört dem Meet-Pfad). Outlook ist ein **anderer** Kalender als das Meet-auf-Google → muss mit: Meet-Video → `[caldavProvider, outlookProvider]`. Non-Meet bleibt Default (alle 3).

### 4. SV-Wiring
Neu `src/lib/microsoft/sv-termin-sync.ts` → `syncSvTerminToOutlook`/`deleteSvTerminFromOutlook` (delegiert an Engine mit `[outlookProvider]`, Signatur `(terminId, _fallId?)` wie die Google/CalDAV-Wrapper). An **jede** SV-Call-Site, die heute `syncSvTerminToCalDav`/`deleteSvTerminFromCalDav` aufruft (per Grep ermittelt), die Outlook-Variante ins bestehende `Promise.all` ergänzen. SV-Termine (`sv_begutachtung`) haben kein Meet → keine Sonderlogik.

## Testing

- **Unit (vitest):** die reine Graph-Event-Body-Konstruktion soweit ohne Netz testbar (Titel/Zeit/timeZone-Feld); Provider-Orchestrierung über die bestehenden Fake-Provider-Tests (der neue Provider ist ein weiterer `KalenderProvider`).
- **Build/tsc/Ratchets** grün.
- **KEIN funktionaler Smoke** (dormant bis Azure). READ: `gutachter_termine.ms_event_id`-Spalte live.

## Nicht-Ziele
IN-Sync (SP5c), admin_termine-Outlook (SP5d). Keine Google/CalDAV-Verhaltensänderung (rein additiver 3. Provider).

## Risiko & Rollback
Additiv (1 Spalte, 1 Provider, DEFAULT_PROVIDERS +1, SV-Wrapper + additive Promise.all-Einträge). Provider skippt ohne MS-Token → im dormanten Zustand No-Op. Rollback = Code-Revert.
