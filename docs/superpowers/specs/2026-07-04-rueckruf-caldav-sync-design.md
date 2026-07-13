# SP2d — Rückruf-CalDAV-Sync (`admin_termine`)

**Datum:** 2026-07-04
**Kontext:** 5. + letztes Inkrement des universellen Kalender-Sync-Features. Stacked auf SP2c (#3554). Rückrufe liegen in `admin_termine` (NICHT `gutachter_termine`) und syncen heute schon nach **Google** (`syncAdminTerminCalendarEvent`, `src/lib/google-calendar/admin-event-sync.ts`, keyed auf `zugewiesen_an`). **CalDAV fehlt komplett** (Spalten + Zweig). SP2d ergänzt CalDAV + schließt Wiring-Lücken. Danach ist das Feature komplett (SP1–SP2d).

## Ziel

Rückrufe (`admin_termine`) erscheinen/aktualisieren/verschwinden auch im **CalDAV**-Kalender des bearbeitenden Mitarbeiters (`zugewiesen_an`), zusätzlich zum bestehenden Google-Sync — mit demselben Owner-Gate und derselben Lifecycle-Logik.

## Nicht-Ziele / Defer (dokumentiert)

- **Generische `admin-termine-actions`** (createAdminTermin/update/delete/setStatus — breiter als Rückruf, deckt kunde/intern-Termine) + **Lead-Intake ohne Owner** (`public-rueckruf`/`makler-fail`/`embed` — Pool-Rückrufe ohne `zugewiesen_an` → Sync no-op bis Zuweisung) = **Follow-up**.
- Kein fail-closed Write-Gate. Kein Google-Verhalten geändert (nur additiv CalDAV).

## Architektur

Der Google-Sync (`admin-event-sync.ts`) ist owner-gated (`!!zugewiesen_an`), fail-silent, mit `shouldDelete` (status `erledigt`/`abgesagt`/`storniert`) vs `shouldUpsert` (`offen` + Owner). SP2d spiegelt das für CalDAV.

### 1. Schema (additive Migration, Regel 2)

`admin_termine` + 3 CalDAV-Spalten (spiegelt die vorhandenen `google_event_id`/`google_calendar_id`/`google_event_synced_at`):
- `caldav_object_url text NULL`
- `caldav_event_uid text NULL`
- `caldav_synced_at timestamptz NULL`

### 2. Geteilter Content-Builder (`src/lib/kalender/admin-event-content.ts`, neu)

Extrahiert die heute in `syncAdminTerminCalendarEvent` inline gebaute Titel/Beschreibung/Zeit-Logik (Lead-Kontext, `Claimondo · {typLabel} · …`-Titel, Description mit Kunde/Telefon/Notiz/Links) in `buildAdminEventContent(t, db) → { title, description, startIso, endIso }`. Beide Provider nutzen ihn → konsistente Kalender + DRY (kein Duplikat). Der reine Formatter (`formatAdminEventContent(t, lead)`) ist ohne DB testbar.

### 3. Google-Modul refactoren (faithful) + CalDAV-Hook

`syncAdminTerminCalendarEvent` nutzt statt der Inline-Logik den `buildAdminEventContent`-Helper (identisches Payload, Google appliziert `toBerlinWallClock`). **Zusätzlich** oben eine fail-soft Zeile `syncAdminTerminToCalDav(terminId)` → jede Call-Site bekommt CalDAV, ohne die Call-Sites zu ändern. Die Google-Insert/Update/Delete-Logik bleibt inhaltlich unverändert.

### 4. CalDAV-Modul (`src/lib/kalender/caldav/admin-event-sync.ts`, neu)

`syncAdminTerminToCalDav(terminId)`: liest `admin_termine` (inkl. `caldav_*`), owner-gated; `shouldDelete`/`shouldUpsert` wie Google. Liest die CalDAV-Verbindung des Owners aus `kalender_verbindungen` (`profile_id=zugewiesen_an`, `provider='caldav'`), `decrypt` das Passwort, und ruft die CalDAV-Client-Primitiven (`createCalendarEvent`/`updateCalendarEvent`/`deleteCalendarEvent` aus `@/lib/kalender/caldav/client`) — wie der `caldavProvider`. Idempotenz via `caldav_object_url`/`caldav_event_uid`; speichert die Refs zurück auf `admin_termine`. Content aus `buildAdminEventContent` (startIso/endIso als rohe UTC-ISO — CalDAV-Client erwartet das). Fail-soft.

### 5. Wiring-Lücken (Rückruf-Staff-Flows, die heute NICHT syncen)

- **`closeOpenRueckrufTermin`** (`dispatch/leads/[id]/_actions/rueckruf.ts`) — **Bug:** der erledigt-Pfad (aus `markRueckrufErledigtMitErgebnis`) lässt heute ein verwaistes Event stehen → `syncAdminTerminCalendarEvent(terminId)` nachziehen.
- **Fallakte `rueckruf-actions.ts`** (`faelle/[id]/_sidebar/`, 4 Sites: insert/update/storno `saveFallRueckruf` + `markFallRueckrufErledigt`) — der KB legt/ändert Rückrufe im Fall an, ohne Sync → `syncAdminTerminCalendarEvent` nach jedem Write.

Alle fail-soft (`syncAdminTerminCalendarEvent` ist intern fail-silent; äußeres `.catch`/try als Konvention). Owner-Gate greift automatisch (Fallakte setzt `zugewiesen_an = kundenbetreuerId ?? user.id` → gesetzt).

## Testing

- **Unit (vitest):** `formatAdminEventContent(t, lead)` — Titel-Format (`Claimondo · Rückruf · {Kunde}`), Description-Zeilen (Kunde/Telefon/Notiz), end-Fallback (+15 min). Pure.
- **Build/tsc/Ratchets** grün.
- **Prod-Smoke (READ):** Migration live (3 Spalten); für einen Rückruf mit Owner die CalDAV-Verbindungs-Query beweisen (aktuell 0 KB-CalDAV-Verbindungen → Sync skippt sauber, kein Crash). Google-Sync unverändert (faithful Extract per Build verifiziert). Voller CalDAV-Smoke braucht eine echte Verbindung → Follow-up nach Deploy.

## Risiko & Rollback

Refactort den deployten Google-Admin-Sync (faithful Content-Extract) — Build + Prod-Smoke sichern ihn ab. CalDAV additiv + owner-gated + fail-soft. Rollback = Code-Revert (+ die 3 Spalten bleiben additiv, kein Drop).

## Reihenfolge

SP1 (✅) → SP2a (✅) → SP2b (✅) → SP2c (✅) → **SP2d** (dieses Dokument) = **Feature komplett**.
