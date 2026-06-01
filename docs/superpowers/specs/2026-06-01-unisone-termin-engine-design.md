# Unisone Termin-Engine — Design (2026-06-01)

**Status:** Design / Review · **Autor:** Claude (Brainstorming mit Aaron) · **Branch:** `kitta/unisone-termin-engine`

## 1. Ziel / Vision
Eine **einzige, konsistente Termin-Engine** für ALLE Entitys (Sachverständiger, sv_lead, Kundenbetreuer, Kanzlei) und ALLE Use-Cases (Dispatch-Zuweisung, Self-Service-Buchung, Reservierung, externe Kalender-Blocks). Statt heute verstreuter Ad-hoc-Logik (`onboarding/slots.ts`, `termine/kb-booking.ts`, Dispatch `sv-termin.ts`, der Busy-Cache) → **ein Datenmodell + eine Operations-Lib**, die jeder Flow nutzt.

Konkrete Nutzer-Ziele (Aaron): „alles an einem Ort lesbar" (Kalender + Slots + Matching aus einer Quelle), externe Termine als **permanente** DB-Records, **sauber buchen** = konfliktfrei, **generisch von Tag 1**.

## 2. Ist-Zustand
- `gutachter_termine`: Claimondo-Buchungen (sv_id/sv_lead_id, fall_id, start/end, status `reserviert`/`bestätigt`/`verlegt`/…, typ, `caldav_object_url`/`uid`, `final_verbindlich_ab`). Hat eine **EXCLUSION CONSTRAINT** gegen Doppelbuchung (AAR-865). Viele Consumer (State-Machine, Billing, Verlegung, Auto-Phase).
- `sv_kalender_events_cache`: externe Busy-Slots (Google FreeBusy + CalDAV), vom Cron alle 5 Min befüllt, **Vergangenheit gepruned** (flüchtig).
- Busy-Reader (#2165, gerade gemerged-pending): `getCachedBusyWindows` liest den Cache; `checkSvFreeBusy`/`getBusyWindows`/`getSvBusySlots` darauf umgestellt. **= Phase-0-Fundament dieses Designs.**
- Slot-/Buchungs-Logik liegt verstreut: `ladeFreieSlots`/`reserviereSlot` (slots.ts, Self-Service), `kb-slots`/`kb-booking` (KB), Dispatch-`sv-termin`, `findBestSV` (Matcher).

## 3. Architektur (Aaron-Entscheidung: 2 Tabellen + VIEW)
```
  [Buchungen]                [Externe Blocks]
  termine (gen. von          externe_belegung
  gutachter_termine)         (permanent, löst Cache ab)
        \                          /
         \________  VIEW  ________/
              v_belegung  (= EINE Lese-Quelle)
                    |
        lib/termine/engine  (Ops: freieSlots / pruefeBelegung /
                             reserviere / bestaetige / sageAb / verlege)
                    |
   Dispatch · Self-Service · KB · Kanzlei · SV-Kalender-UI
```

## 4. Datenmodell

### 4a. Buchungs-Tabelle — `gutachter_termine` generalisiert (in place)
Neue Spalten (additiv, backfill, `sv_id` bleibt zur Transition als Kompat):
- `assignee_typ` enum (`sachverstaendiger` | `sv_lead` | `kundenbetreuer` | `kanzlei`)
- `assignee_id` uuid
- `quelle` enum (`dispatch` | `self_service` | `manuell`)
- `bezug_typ` enum (`claim` | `lead` | `mandat`) + `bezug_id` uuid (generalisiert die heutigen fall_id/lead_id)
- `standort_lat`/`standort_lng`/`standort_adresse` (Termin-Ort; leer ⇒ Büro-Fallback, §6)
- (vorhanden bleibt: start/end, `status`, `typ`/Art, `caldav_object_url`/`uid`, `final_verbindlich_ab`)

Backfill: `assignee_typ='sachverstaendiger', assignee_id=sv_id` (bzw. `sv_lead`/`sv_lead_id`); bezug aus fall_id/lead_id. **Kein Rename** in Phase 1 (zu disruptiv) — die Tabelle IST schon die Buchungs-Tabelle, wird nur generisch.

### 4b. Externe-Belegung-Tabelle — `externe_belegung` (neu, permanent)
Dünn (reine Belegung, kein Status/Bezug): `id, assignee_typ, assignee_id, start_zeit, end_zeit, source (google|caldav), external_event_id, titel, last_synced_at`.
- **Permanent statt flüchtig:** Cron **upserted** hier rein (ersetzt `sv_kalender_events_cache`). Retention-Cron räumt sehr Alte ab (z.B. > 90 Tage Vergangenheit) → Historie ja, aber beschränktes Wachstum.
- Eindeutigkeit: `UNIQUE(assignee_typ, assignee_id, source, external_event_id)`.

### 4c. VIEW `v_belegung` (die EINE Lese-Quelle)
UNION:
- aus `termine` WHERE status aktiv (`reserviert`/`bestätigt`/`verlegung_pending`): `{assignee_typ, assignee_id, start, end, typ:'buchung', status, bezug_typ, bezug_id, standort := COALESCE(termin.standort, assignee.büro)}`
- aus `externe_belegung`: `{…, typ:'extern', status:null, bezug:null, standort := assignee.büro}` (extern hat nie Ort → §6)

Join auf die Assignee-Tabelle für Büro-Koordinaten. Index-pushdown auf (assignee, start) in beiden Quell-Tabellen.

## 5. Engine — `lib/termine/engine/`
Wiederverwendbare Ops (assignee-generisch), die ALLE Flows nutzen:
- `pruefeBelegung(assignee, von, bis): 'frei' | 'belegt'` — Overlap auf `v_belegung` (löst `checkSvFreeBusy` ab).
- `freieSlots(assignee, fenster, opts: {schadenort?, arbeitszeiten?, reachability?}): TagVerfuegbarkeit[]` — vereinheitlicht `ladeFreieSlots` + `kb-slots` + `getBusyWindows`.
- `reserviere(assignee, von, bis, bezug, quelle): {ok, terminId}` — legt `reserviert`-Termin an (mit TTL, §7).
- `bestaetige(terminId)` / `sageAb(terminId, grund)` / `verlege(terminId, …)` — Status-Transitions (eine State-Machine).
- `syncTerminToExternalCalendar(terminId)` — schreibt die Buchung in den verbundenen Kalender des Assignees (Google/CalDAV) — generalisiert das heutige `sv-termin-sync`.
- `findeBestePerson(orgOderRegion, fenster, bezug, opts): {assignee, slot}` — **Org-Level-Buchung** (Aaron 01.06.): pickt die beste verfügbare Person (Auslastung + Distanz + Verfügbarkeit), dann `reserviere`. Deckt Dispatch-Auto-Matching + Self-Service-„egal wer von der Firma" ab. Personen-explizit bleibt immer möglich.

## 6. Büro-Fallback-Regel (Aaron)
„Kein Standort am Termin ⇒ immer das Büro des Assignees." Realisiert als `COALESCE(termin.standort, assignee.büro)` in `v_belegung` + in der Reachability/ETA-Logik. Externe Blocks haben nie einen Standort → immer Büro (Annahme: SV ist am/kehrt zum Büro zurück). Büro-Koordinaten: aus der Assignee-Stammtabelle (z.B. `sachverstaendige.standort_lat/lng` bzw. Büro-Adresse).

## 6b. Verortung / Geo (für optimale Nutzung)
- **Geocoding-Backbone (Pflicht, Phase 1):** Jeder Termin braucht aufgelöste **Koordinaten** (lat/lng), nicht nur Adresse. Die Engine geocodet Adresse → Koordinaten (Mapbox/Google sind im Codebase) und **cached sie am Termin** (`standort_lat/lng`). Kein Ort → Büro-Fallback (§6); externe Blocks → immer Büro. **Ohne Koordinaten kein Routing/ETA** — das ist die heutige Lücke.
- **Büro geocoden:** Büro jedes Assignees mit lat/lng (Fallback-Anker + Routing-Start).
- **Reachability/ETA first-class:** `freieSlots` bietet nur Slots, die vom Vor-/Nachtermin **erreichbar** sind (Fahrzeit, Mapbox-Matrix — `precomputeSvSlotEtas`/`isSlotReachable`, vorhanden) — in der Engine zentral statt optional.
- **Tagesrouten:** optimale Reihenfolge der Tagestermine (Feldmodus) — die Engine/View liefert die geo-verorteten Termine.

## 6c. Verfügbarkeit & Kapazität
- **Grund-Verfügbarkeit:** Arbeitszeiten + blockierte Wochentage (auf `sachverstaendige`, vorhanden).
- **Ausnahmen (NEU — Tabelle `verfuegbarkeits_ausnahmen`):** `{assignee_typ, assignee_id, von, bis, typ (urlaub|krank|sperre), grund}` — einmalige/temporäre Nicht-Verfügbarkeit. `freieSlots` + `pruefeBelegung` berücksichtigen sie (wie externe Blocks; fließen optional in `v_belegung` ein).
- **Dauer + Puffer pro Art:** konfigurierbar pro `typ` (vor_ort 45 Min + Fahrpuffer; Beratung kürzer, kein Fahrpuffer).

## 6d. Personal & Organisation (Aaron 01.06.)
- **Person-Ebene:** Gebucht wird immer eine **Person** (assignee = sachverstaendige/kundenbetreuer/…) mit eigenem Kalender/Verfügbarkeit/Route/Standort. Modell vorhanden: `profiles.organisation_id` + `rolle_in_organisation`.
- **Org-Gruppierung:** `organisationen` gruppiert Mitarbeiter — für Matching, Kapazität/Auslastung, Gebiet (`gebiet_exklusivitaeten`), Branding.
- **Org-Level-Buchung:** `findeBestePerson(org/region, …)` (§5) pickt die beste verfügbare Person. Filter: nur **buchbare Rollen** (`rolle_in_organisation`), nur im **exklusiven Gebiet**. Plus personen-explizit jederzeit möglich.

## 7. „Sauber buchen" — Garantien
- **EXCLUSION CONSTRAINT** auf `termine (assignee_typ, assignee_id, tstzrange(start,end))` WHERE status aktiv → Doppelbuchung **physisch unmöglich** (AAR-865-Pattern, generalisiert auf assignee). Externe Blocks sind in der separaten Tabelle → blocken via `v_belegung`/`freieSlots`, aber kein Constraint-Clash mit Buchungen.
- **Reservierungs-TTL:** `reserviert_bis` (z.B. +15 Min) auf `reserviert`-Termine; `freieSlots` + der Constraint ignorieren abgelaufene Reservierungen (verhindert Geister-Holds bei abgebrochenen Self-Service-Wizards).

## 8. Phasen (inkrementell — kein Big-Bang)
- **Phase 0 (done-pending, #2165):** Busy-Reader auf eine Quelle (Cache). Fundament.
- **Phase 1 — Datenmodell:** Migrationen — `termine`-Generalisierung (assignee-Spalten + Backfill + Exclusion-Constraint generalisieren), `externe_belegung` (+ Cache-Daten migrieren), `v_belegung`. Cron auf `externe_belegung` umstellen. #2165-Reader auf `v_belegung` repointen.
- **Phase 2 — Engine:** `lib/termine/engine` bauen (Ops konsolidieren bestehende Logik).
- **Phase 3 — Consumer-Migration:** Dispatch (`findBestSV`, `sv-termin`) → Self-Service (`slots.ts`) → KB (`kb-*`) → Kanzlei. Einer nach dem anderen, jeweils mit Smoke. `sv_id`-Kompat erst danach droppen.

## 9. Non-Goals / YAGNI
- Kein generisches Kalender-Render-Framework — die SV-Kalender-UI bleibt, liest nur `v_belegung`.
- Keine Recurring-Termine (Serien) — bis ein Use-Case es braucht.
- **Kein Skill-/Qualifikations-Matching** pro Person (welche:r macht welche Termin-Art) — deferred (Aaron 01.06.: erstmal ohne; Erweiterung wenn Termin-Arten personenspezifische Qualifikation brauchen).
- Kein Rewrite in einem PR — strikt gephased, jede Phase eigener PR + Smoke.

## 10. Risiken
- `gutachter_termine` hat viele Consumer (State-Machine, Billing, Verlegung) → Generalisierung **in place** mit `sv_id`-Kompat, Drop erst nach Reader-Sweep (CMM-44-Lessons).
- Migrations-Koordination mit aktiven Sessions auf `gutachter_termine` (AAR-939/CMM-Strecke).
- Externe-Permanenz → Retention-Cron gegen unbeschränktes Wachstum.
- Exclusion-Constraint-Generalisierung darf bestehende SV-Buchungen nicht brechen (Migration mit `NOT VALID` → validate).

## 11. Offene Punkte (vor Phase 1)
- Genaue Büro-Quelle pro Assignee-Typ (KB/Kanzlei haben evtl. kein „Büro" → Default?).
- Retention-Fenster für `externe_belegung` (90 Tage? konfigurierbar?).
- Reservierungs-TTL-Dauer (15 Min?).
- Geocoding-Provider (Mapbox vs Google) + ob Koordinaten am Termin oder in einem Geocode-Cache.
- Matching-Gewichte für `findeBestePerson` (Distanz vs Auslastung vs Fairness).
- `verfuegbarkeits_ausnahmen`: feste Typ-Liste (urlaub/krank/sperre) + ob org-weit setzbar.
