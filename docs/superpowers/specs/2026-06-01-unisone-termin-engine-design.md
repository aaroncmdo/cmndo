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
- **`v_claim_phase` + `getClaimLifecycle`** (Lifecycle-View + TS-Zwilling) leiten die Begutachtungs-Phase **nur aus `auftraege.erstgutachten`** ab, **nicht** aus `gutachter_termine` → ein Claim mit aktivem SV-Termin ohne erstgutachten-Auftrag fällt auf `erfassung/vollmacht_offen` zurück (CMM-73, 1 Live-Fall, kosmetisch). Die Engine ist der natürliche Fixer (sie ownt die Termin-Anlage). `v_claim_phase` ist eine **geteilte Kern-View** (North-Star-Parity-Gate, CMM-50/69/72).
- **Zwei parallele, leere Org-Systeme** (Personal-Audit 01.06.): `organisationen` (39 Sp., `parent_user_id→profiles`) **vs.** `sv_organisation`(+`_memberships`/`_laeufer_reports`, `inhaber_sv_id→sachverstaendige`) — beide 0 Zeilen, modellieren dasselbe SV-Büro. **Payroll-Felder** auf `profiles` (`position/gehalt_brutto/...`) sind angelegt aber 0 befüllt — „Abrechnung" = Honorar/Provision, **kein Gehalt**.

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
Neue Spalten (additiv, backfill, **`sv_id` UND `lead_id` bleiben zur Transition als Kompat-Spalten** — bestehende Consumer wie der Self-Service-`bucheTermin` (P4, gutachter-finder) schreiben weiter darauf, bis Phase-3 sie migriert):
- `assignee_typ` enum (`sachverstaendiger` | `sv_lead` | `kundenbetreuer` | `kanzlei`)
- `assignee_id` uuid — Ziel-Tabelle **pro Typ** (Personal-Audit-verifiziert): `sachverstaendiger`→`sachverstaendige.id` (10 Z., sauber `profile_id`-verknüpft, 0 Waisen), `sv_lead`→`sv_leads.id`, `kundenbetreuer`→`profiles.id` (Rolle=kundenbetreuer, 2 Z.), `kanzlei`→`kanzleien.id`
- `quelle` enum (`dispatch` | `self_service` | `manuell`)
- `bezug_typ` enum (`claim` | `lead` | `mandat`) + `bezug_id` uuid (generalisiert die heutigen fall_id/lead_id)
- `standort_lat`/`standort_lng`/`standort_adresse` (Termin-Ort; leer ⇒ Büro-Fallback, §6)
- (vorhanden bleibt: start/end, `status`, `typ`/Art, `caldav_object_url`/`uid`, `final_verbindlich_ab`)

Backfill: `assignee_typ='sachverstaendiger', assignee_id=sv_id` (bzw. `sv_lead`/`sv_lead_id`); bezug aus fall_id/lead_id. **Kein Rename** in Phase 1 (zu disruptiv) — die Tabelle IST schon die Buchungs-Tabelle, wird nur generisch.

**Assignee-Integritäts-Guard (Lehre aus dem Personal-Audit):** `abrechnungen.empfaenger_typ/empfaenger_id` ist polymorph **ohne FK** → 2/3 Zeilen `empfaenger_id=NULL` (nicht abbuchbar). Mein `assignee_typ/assignee_id` ist dieselbe Konstruktion — also **nicht denselben Fehler bauen**: `assignee_id NOT NULL` + **Validierungs-Trigger** (assignee_id existiert in der typ-passenden Tabelle), da ein einzelner FK über vier Zieltabellen nicht geht. So bleibt die generische Spalte referenziell sauber.

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

## 6d. Personal & Organisation (Aaron 01.06. · Personal-Audit-revidiert)
- **Person-Ebene:** Gebucht wird immer eine **Person** (assignee = sachverstaendige/kundenbetreuer/…) mit eigenem Kalender/Verfügbarkeit/Route/Standort.
- **KEIN Payroll im Engine-Scope:** Der Personal-Audit zeigt `profiles.position/gehaltsstufe/gehalt_brutto/eingestellt_am` = 0 befüllt, `mitarbeiter_performance` = 0 Zeilen. „Personal-Abrechnung" existiert nicht als Lohn — nur Honorar/Provision (separate Billing-Strecke, **nicht** Teil der Termin-Engine). Die Engine kennt eine Person nur als **buchbare Kapazität** (Verfügbarkeit/Route/Standort), nicht als Gehaltsempfänger.
- **Org-Modell muss entdoppelt werden (Audit-Befund):** **zwei** leere, konkurrierende Org-Systeme — `organisationen` (generisch, `parent_user_id→profiles`, 39 Sp.) **vs.** `sv_organisation*` (SV-spezifisch, `inhaber_sv_id→sachverstaendige`, mit `_memberships`/`_laeufer_reports`). Für org-level-Buchung braucht die Engine **eine** Quelle. **Empfehlung: `organisationen` gewinnt** (generisch über `profiles` → passt zum assignee-generischen Ziel; `sv_organisation*` ist SV-only). `sv_organisation*` droppen — beide 0 Zeilen → jetzt **billig** (Audit-Empfehlung #3); Mitgliedschaft/Läufer-Struktur falls gebraucht additiv auf `organisationen`. **Entscheidung Aaron 01.06.: `organisationen` gewinnt** — `sv_organisation*` (leer) droppen.
- **Org-Gruppierung:** das gewählte Org-Modell gruppiert Mitarbeiter — für Matching, Kapazität/Auslastung, Gebiet (`gebiet_exklusivitaeten`), Branding.
- **Org-Level-Buchung:** `findeBestePerson(org/region, …)` (§5) pickt die beste verfügbare Person. Filter: nur **buchbare Rollen** (`rolle_in_organisation`), nur im **exklusiven Gebiet**. Plus personen-explizit jederzeit möglich. **Hängt an der Org-Entdopplung** → erst nach §11-Entscheidung (Phase 2/3, **kein** Phase-1-Blocker).

## 7. „Sauber buchen" — Garantien
- **EXCLUSION CONSTRAINT** auf `termine (assignee_typ, assignee_id, tstzrange(start,end))` WHERE status aktiv → Doppelbuchung **physisch unmöglich** (AAR-865-Pattern, generalisiert auf assignee). Externe Blocks sind in der separaten Tabelle → blocken via `v_belegung`/`freieSlots`, aber kein Constraint-Clash mit Buchungen.
- **Reservierungs-TTL:** `reserviert_bis` (z.B. +15 Min) auf `reserviert`-Termine; `freieSlots` + der Constraint ignorieren abgelaufene Reservierungen (verhindert Geister-Holds bei abgebrochenen Self-Service-Wizards). **Die Engine ownt dieses Cleanup zentral** — Consumer (Live-/anfrage, Self-Service-Wizard/P4) bauen KEINEN eigenen Interim-Guard (kein Doppelbau).

## 8. Phasen (inkrementell — kein Big-Bang)
- **Phase 0 (done-pending, #2165):** Busy-Reader auf eine Quelle (Cache). Fundament.
- **Phase 1 — Datenmodell:** Migrationen — `termine`-Generalisierung (assignee-Spalten + Backfill + Exclusion-Constraint generalisieren), `externe_belegung` (+ Cache-Daten migrieren), `v_belegung`. Cron auf `externe_belegung` umstellen. #2165-Reader auf `v_belegung` repointen.
- **Phase 2 — Engine:** `lib/termine/engine` bauen (Ops konsolidieren bestehende Logik).
- **Phase 3 — Consumer-Migration:** Dispatch (`findBestSV`, `sv-termin`) → Self-Service (`slots.ts` **+ beauftragung-Wizard-Booking, P4/gutachter-finder**) → KB (`kb-*`) → Kanzlei. Einer nach dem anderen, jeweils mit Smoke. `sv_id`/`lead_id`-Kompat erst danach droppen.
- **Phase 3b — Lifecycle-Korrektheit (CMM-73, Low):** Sobald die Engine die Termin-Anlage ownt (`reserviere`/`bestaetige`), schließt sie die `v_claim_phase`/`getClaimLifecycle`-Lücke (aktiver SV-Termin ohne erstgutachten-Auftrag → falsches `vollmacht_offen`-Badge, 1 Live-Fall). **Bevorzugt der Daten-Fix** (Handoff-Empfehlung): die Engine legt beim Termin-Bestätigen verlässlich den `erstgutachten`-Auftrag an → Phase derivt schon heute korrekt. Nur falls „Termin ohne Auftrag" gewollt ist, der **parity-gegatete Derivation-Fix** (getClaimLifecycle **+** v_claim_phase bit-gleich um einen gutachter_termine-Branch erweitern, North-Star-Test grün). **`v_claim_phase` = geteilte Kern-View → vorher mit CMM-50/69/72 abstimmen.**
- **Org-Entdopplung (vor Org-Level-Buchung):** sobald §11-Entscheidung steht — Verlierer-Org-Tabellen droppen (beide leer), Engine-`findeBestePerson` an die Sieger-Quelle binden.

## 9. Non-Goals / YAGNI
- Kein generisches Kalender-Render-Framework — die SV-Kalender-UI bleibt, liest nur `v_belegung`.
- Keine Recurring-Termine (Serien) — bis ein Use-Case es braucht.
- **Kein Skill-/Qualifikations-Matching** pro Person (welche:r macht welche Termin-Art) — deferred (Aaron 01.06.: erstmal ohne; Erweiterung wenn Termin-Arten personenspezifische Qualifikation brauchen).
- Kein Rewrite in einem PR — strikt gephased, jede Phase eigener PR + Smoke.

## 10. Risiken
- `gutachter_termine` hat viele Consumer (State-Machine, Billing, Verlegung) → Generalisierung **in place** mit `sv_id`-Kompat, Drop erst nach Reader-Sweep (CMM-44-Lessons).
- Migrations-Koordination mit aktiven Sessions auf `gutachter_termine` (AAR-939/CMM-Strecke).
- **`v_claim_phase` ist geteilte Kern-View** (CMM-73/CMM-50/CMM-69/72, North-Star-Parity-Gate) — jede Termine-/Phase-Berührung **vorher** abstimmen, nie solo. Phase-1-Generalisierung von `gutachter_termine` ist additiv (`claim_id`/`sv_id` bleiben) → bricht den heutigen Join **nicht**; `claim_id`-Kompat bis CMM-73/-44 die View migriert.
- Externe-Permanenz → Retention-Cron gegen unbeschränktes Wachstum.
- Exclusion-Constraint-Generalisierung darf bestehende SV-Buchungen nicht brechen (Migration mit `NOT VALID` → validate).

## 11. Offene Punkte (vor Phase 1)
- Genaue Büro-Quelle pro Assignee-Typ (KB/Kanzlei haben evtl. kein „Büro" → Default?).
- Retention-Fenster für `externe_belegung` (90 Tage? konfigurierbar?).
- Reservierungs-TTL-Dauer (15 Min?).
- Geocoding-Provider (Mapbox vs Google) + ob Koordinaten am Termin oder in einem Geocode-Cache.
- Matching-Gewichte für `findeBestePerson` (Distanz vs Auslastung vs Fairness).
- `verfuegbarkeits_ausnahmen`: feste Typ-Liste (urlaub/krank/sperre) + ob org-weit setzbar.
- ✅ **Org-Modell entschieden (Aaron 01.06.):** `organisationen` gewinnt; `sv_organisation*` (leer) droppen, Mitgliedschaft/Läufer additiv auf `organisationen`.
- **Geocoding-Garantie — HARTE Phase-2-Invariante (validiert 01.06., Aaron: „die Route muss sauber sein"):** Geo-Infra existiert bereits (`lib/mapbox/geocode|eta|route`, `lib/google-geocoding`, `dispatch/reachability`, `findBestSV` lesen `besichtigungsort_lat`); Booking-Flows schreiben es. ABER **keine erzwungene Garantie** — 9/12 aktive Termine hatten 01.06. nirgends ein Ziel (Test-Daten). Die Engine MUSS in `reserviere`/`bestaetige` das Vor-Ort-Ziel **resolven + geocoden** (Termin → sonst verknüpfter Lead/Fall: `besichtigungsort`/`fahrzeug_standort`/`kunde`/`schadenort`) und einen Vor-Ort-Termin **ohne geocodebares Ziel ablehnen/flaggen**. Erst damit sind Tagesroute + Kunden-ETA („SV ist X Min entfernt", Spalten `sv_eta_minuten`/`kunde_tracking_token` vorhanden) verlässlich. Büro-Fallback in `v_belegung` = **nur Verfügbarkeit**, NIE die Routing-Destination.
- **CMM-73 Wurzel:** Legt die heutige Termin-Anlage verlässlich einen `erstgutachten`-Auftrag an? Falls ja → CMM-73 ist nur ein Daten-Loch (kleiner Fix in der Engine), kein View-Umbau. Vor Bau live re-checken (Handoff-Query).
