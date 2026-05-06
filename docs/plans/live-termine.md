# Live-Termine ohne Refresh — Implementierungsplan

Status: **Planung**. Empfohlen nach Design-Polish + Baileys-Integration.

## Status quo (Stand 2026-05-06)

- `getSvBusySlots()` macht bei **jedem Page-Load** Live-API-Call zu Google + CalDAV
- Kein Caching, kein Realtime
- Konsequenz: 4-8s Wait beim Öffnen von `/gutachter/kalender`, neue Termine in Apple-Calendar erscheinen erst beim Refresh
- Bei vielen SVs explodieren API-Call-Volumes → 429-Risiko, besonders bei Google's Free-Busy-Quota

## Ziel

- Page-Load **unter 1s** (statt 4-8s)
- Neue Termine erscheinen **innerhalb 1-5 Minuten** ohne Refresh
- Cron-Polling für CalDAV (Apple — keine Push-API verfügbar), Optional Push für Google

## Architektur (Empfehlung: Option B Cache + Cron + Realtime)

```
┌──────────────────────────────────────────────────────────────┐
│                      Cron (alle 5 Min)                        │
│              /api/cron/sync-external-calendars                │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ├──► Google FreeBusy API ──┐
                       │                          │
                       └──► CalDAV listEvents ────┤
                                                  │
                       ┌──────────────────────────┘
                       ▼
              ┌──────────────────────────────┐
              │  sv_kalender_events_cache    │
              │  (Supabase Realtime aktiv)   │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  /gutachter/kalender         │
              │  - SSR liest aus Cache       │
              │  - Realtime-Sub auf INSERT/  │
              │    UPDATE/DELETE             │
              └──────────────────────────────┘
```

## Komponenten

### 1. Cache-Tabelle `sv_kalender_events_cache`

```sql
CREATE TABLE sv_kalender_events_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sv_profile_id UUID NOT NULL REFERENCES profiles(id),
  source TEXT NOT NULL CHECK (source IN ('google', 'caldav')),
  external_event_id TEXT,  -- Stable ID aus Google/CalDAV für Diffs
  start_zeit TIMESTAMPTZ NOT NULL,
  end_zeit TIMESTAMPTZ NOT NULL,
  titel TEXT,  -- optional, FreeBusy gibt nichts; CalDAV-Events haben SUMMARY
  last_synced_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (sv_profile_id, source, external_event_id)
);

CREATE INDEX idx_sv_kalender_events_sv_zeit ON sv_kalender_events_cache (sv_profile_id, start_zeit);

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE sv_kalender_events_cache;
ALTER TABLE sv_kalender_events_cache REPLICA IDENTITY FULL;
```

### 2. Sync-Cron `/api/cron/sync-external-calendars/route.ts`

Schedule: `*/5 * * * *` (alle 5 Min)

Pro SV mit Google- oder CalDAV-Verbindung:
1. Lade Events der nächsten 35 Tage via `getBusyWindows()` (oder direkter Helper)
2. Diff gegen Cache:
   - Neue Events → INSERT
   - Geänderte Events → UPDATE
   - Verschwundene Events → DELETE
3. `last_synced_at` updaten

Performance-Faustregel: 100 SVs × 2-3s je Provider = ~5min. Falls zu langsam → Worker-Pool oder pro-Provider parallelisieren.

### 3. SSR-Read aus Cache statt Live

`gutachter/kalender/page.tsx`:
```ts
// Statt: const externalBusy = await getSvBusySlots(user.id, fromIso, toIso)
const { data: events } = await supabase
  .from('sv_kalender_events_cache')
  .select('start_zeit, end_zeit, titel, source')
  .eq('sv_profile_id', user.id)
  .gte('start_zeit', fromIso)
  .lte('start_zeit', toIso)
  .order('start_zeit')

const externalBusy = (events ?? []).map(e => ({
  start: e.start_zeit,
  end: e.end_zeit,
}))
```

→ Page-Load von 4-8s auf <1s.

### 4. Realtime-Component `KalenderRealtimeRefresh`

Analog zu `FallRealtimeRefresh` (PR #511 Pattern):

```tsx
'use client'
import { useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function KalenderRealtimeRefresh({ svProfileId }: { svProfileId: string }) {
  const router = useRouter()
  const channelId = useId()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`kalender-rt-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sv_kalender_events_cache',
          filter: `sv_profile_id=eq.${svProfileId}`,
        },
        () => router.refresh()  // Debounced router.refresh
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [svProfileId, channelId, router])

  return null
}
```

### 5. Manueller Refresh-Trigger (optional)

Im Settings-Bereich oder neben Status-Pill: „Jetzt synchronisieren"-Button der den Cron für den eigenen SV ad-hoc triggert. Nice-to-have.

## Phasen

### Phase 1 — DB-Schema (1-2h)
- [ ] Migration: `sv_kalender_events_cache` + Index + Realtime-Publication
- [ ] Test mit manuellen Inserts

### Phase 2 — Sync-Cron (3-4h)
- [ ] `/api/cron/sync-external-calendars/route.ts` mit Diff-Logic
- [ ] Vercel-Cron-Schedule
- [ ] Logging + Error-Handling pro SV (ein Fehler bricht nicht den ganzen Run)

### Phase 3 — UI-Migration (1-2h)
- [ ] `gutachter/kalender/page.tsx` auf Cache-Read umstellen
- [ ] `KalenderRealtimeRefresh` einbinden
- [ ] `getSvBusySlots()` als Fallback behalten (für Pages die Cron-Lag nicht tolerieren)

### Phase 4 — Cleanup
- [ ] Stale-Cache-Entries löschen (älter als now+35d)
- [ ] Disconnect-Handler: wenn SV Verbindung trennt → eigene Cache-Entries clearen

## Risiken

- **5-Minuten-Lag**: Apple-Termin den Kelvin gerade einträgt erscheint erst nach max 5min. Wenn das stört → Cron auf 2min, oder manueller Refresh-Button
- **Cron-Failures**: wenn Cron mehrfach hintereinander failt → Daten werden stale. Healthcheck-Cron sollte das überwachen
- **Initial-Load** für neue SVs: erster Cron-Run nach Verbindungsaufbau dauert paar Minuten → bis dahin leerer Kalender. Lösung: bei Connect-Action sofort einmaligen Sync auslösen

## Aufwand-Gesamt

~7-9h für die ersten 3 Phasen, eigene PR. Cleanup separat.

## Referenzen

- Aktueller Live-Fetch: `src/lib/google-calendar/busy-slots.ts`
- CalDAV-Helper: `src/lib/kalender/caldav/client.ts`
- Realtime-Pattern: `src/components/fall/FallRealtimeRefresh.tsx`
- Realtime-Migration-Template: `supabase/migrations/20260505200531_cmm37_realtime_faelle.sql`
