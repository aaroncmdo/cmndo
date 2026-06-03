# SV-Verfügbarkeit: Live-FreeBusy → sv_kalender_events_cache (01.06.2026)

## Auslöser
Frage Aaron: „Werden CalDAV-Termine in die DB gestreamt, damit Dispatch sauber SV-planen kann?" — und „wird der Termin in der Kalender-UI angezeigt?"

## Befund (vor dem Fix)
Der Cron `/api/cron/sync-external-calendars` streamt Google-FreeBusy **+** CalDAV alle 5 Min in `sv_kalender_events_cache`. **Aber dieser Cache wurde nur von der SV-Kalender-UI gelesen — NICHT von der Dispatch-/Slot-Logik.** Die machte stattdessen **Live-API-Calls pro Request**, in drei Pfaden:

| Pfad | Nutzer | CalDAV vorher? |
|---|---|---|
| `checkSvFreeBusy` (freebusy.ts) | Dispatch-Matcher `findBestSV` + Buchungs-Check (termin-actions) | ✅ Google-first + CalDAV-Fallback (live) |
| `getBusyWindows` (freebusy.ts) | Slot-Finder | ✅ Google + CalDAV (live, gemerged) |
| `getSvBusySlots` (busy-slots.ts) | **GFA-Self-Service** (`ladeFreieSlots`) + KB-Slots | ❌ **nur Google** (Kommentar log „Google + CalDAV") |

### Zwei echte Probleme
1. **Self-Service-Bug:** `getSvBusySlots` war Google-only → alle 3 Kalender-SVs sind iCloud → deren private Termine blockten in der Self-Service-Strecke **keine** Slots → Kunde konnte einen iCloud-belegten Slot buchen.
2. **Live = fail-open + 2s-Timeout:** Antwortet iCloud/Google nicht in 2 s, galt der SV als „frei" → **Doppelbuchungs-Risiko**; bei N Kandidaten × Live-Call zudem langsam.

## Fix
Neue **eine Quelle**: `src/lib/kalender/cache-busy.ts` — `getCachedBusyWindows(svId, from, to)` (Overlap: `start<to AND end>from`) + `getCachedBusyWindowsByProfile`. Alle drei Pfade lesen jetzt den Cache statt Live-API:
- `getSvBusySlots` → Cache (**fixt Self-Service-CalDAV-Bug**).
- `getBusyWindows` → Cache.
- `checkSvFreeBusy` → Cache (Overlap im Puffer-Fenster → belegt/frei; `unbekannt` nur noch wenn kein sachverstaendige-Record).

Signaturen + Export-Namen identisch → keine Caller-Änderung (findBestSV, termin-actions, slots, kb-slots).

**Trade-off:** Staleness ≤ Cron-Intervall (5 Min). Für Slot-Planung (Stunden/Tage voraus) unkritisch — und deterministischer als Live-fail-open.

## UI-Frage (Q1) — KEIN Bug
Die SV-Kalender-UI (`SVKalenderClient:286`) rendert externalBusy **korrekt** (verifiziert: zukünftiges Test-Event → `busyBlockCount: 1`, Block „Externer Google-Termin / 10:00–11:00"). Die vorher leere Anzeige war ein **Timing-Artefakt**: der Cron pruned vergangene Events (`start_zeit < now`), und der getestete Termin (heute 14:00) war beim Smoke schon Vergangenheit. (Kosmetisch: das −7-Tage-UI-Fenster zeigt extern keine Vergangenheit.)

## Verifikation
- `npx tsc --noEmit` grün.
- Reader-Overlap-Logik gegen Live-DB verifiziert (liefert gall's 3 Zukunfts-Events korrekt).
- Logik-Kette bestätigt: getSvBusySlots → externBusy → belegte → Slot-Block (slots.ts).
- **Post-Deploy:** volles Self-Service-Slot-Blocking + Matcher-„belegt" re-testen (wie 2FA-Loop 18→1).

## Follow-ups
- `checkFreeBusy` + `listCalendarEvents` (caldav/client.ts) sind jetzt tote Exports (Live-CalDAV-Fetch, nur noch der Cron via `listCalendarEventsFull` lebt) → in einem Folge-PR entfernen.
