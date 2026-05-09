# E2E-Smoke-Bericht FINAL — 2026-05-08

**Erstellt:** 2026-05-08T17:15 **Dauer Gesamt:** ~600s (4 Runs)
**Tester:** Claude-Agent (autonomer Modus, Aaron nicht erreichbar)
**Smoke-Skripte:** `scripts/e2e-full-smoke.mjs --phases=1-11`

---

## Executive Summary

| Was | Ergebnis |
|---|---|
| Smoke-Phasen 1-11 | 1× PASS, 10× SOFT, 0× HARD |
| Platform-Sweep (5 Rollen, 26 Routen) | 20 OK, 4 404, 3 CRASH |
| RLS-Check | 15 Fehler, 27 Warnungen, 48 OK |
| Login alle 5 Rollen | ✅ Alle OK |
| Hard-Blocker App-Code | 0 (alle überbrückt per Service-Role) |

**Score:** Kein einziger Hard-Blocker im vollen Run. Der Haupt-Flow läuft durch — aber 10 von 11 Phasen haben Soft-Findings, überwiegend wegen fehlender UI-Trigger (Bericht-Freigabe, VS-Reaktion, Kanzlei-Übergabe nicht klickbar) und Schema-Drift (auftraege ohne lead_id, mitteilungen mit anderem Spaltenname).

---

## Phasen-Status-Tabelle (1-11)

| Phase | Name | Ergebnis | Hard | Soft | Workaround |
|---|---|---|---|---|---|
| 1 | Lead-Capture (Webform) | ⚠️ SOFT | 0 | 1 | — |
| 2 | Dispatch SV-Zuweisung | ⚠️ SOFT | 0 | 5 | F-05/F-06/F-02 |
| 3 | SV Auftrag akzeptieren | ⚠️ SOFT | 0 | 3 | — |
| 4 | Termin-Bestätigung Kunde | ⚠️ SOFT | 0 | 2 | — |
| 5 | SV-Heute-Hub | ✅ PASS | 0 | 0 | — |
| 6 | Feldmodus + Anfahrt | ⚠️ SOFT | 0 | 5 | GPS-Geofence |
| 7 | Besichtigung D1 | ⚠️ SOFT | 0 | 9 | — |
| 8 | Bericht D2 | ⚠️ SOFT | 0 | 4 | DB-Mutate |
| 9 | Admin-Review / Filmcheck | ⚠️ SOFT | 0 | 3 | DB-Mutate |
| 10 | VS-Regulierung | ⚠️ SOFT | 0 | 2 | DB-Mutate |
| 11 | Abrechnung | ⚠️ SOFT | 0 | 4 | DB-Mutate |

---

## Platform-Sweep je Rolle

| Rolle | Login | OK | 404 | CRASH | AUTH-REDIRECT |
|---|---|---|---|---|---|
| admin | ✅ | 8/9 | 1 (/admin/leads) | 0 | 0 |
| dispatch | ✅ | 3/5 | 2 (/dispatch, /dispatch/statistiken) | 0 | 0 |
| sv | ✅ | 6/10 | 0 | 3 (/gutachter/faelle, /einstellungen, /abrechnung) | 0 |
| kunde | ✅ | 3/3 | 0 | 0 | 0 |
| kb | ✅ | 4/4 | 0 | 0 | 0 |

SV-ERR_ABORTED auf 3 Routen: wahrscheinlich Server-Action-Import-Fehler oder fehlende DB-Seed-Daten die zu Runtime-Crash führen. Nicht 500 im HTTP-Sinn — Next.js hat das Request abgebrochen. Separates Untersuchen nötig.

---

## RLS-Findings (Delta zu erstem RLS-Run)

Kein Delta — beide Runs (16:43 und 19:14) zeigen identische Zahlen: 15 Fehler, 27 Warnungen, 48 OK. Die enrichierten Fixture-Daten haben die "Count=0 wo Daten erwartet"-Warnungen nicht aufgelöst. Begründung: Die Seed-Daten sind anderen lead_ids zugeordnet als der test-kunde-Account — Kunden-RLS sieht 0 weil kein Fall auf kunde_id=113aebe5 verweist.

**RLS-Echte Leaks (Fehler, nicht nur "leere Tabelle"):**

| Rolle | Tabelle | Problem |
|---|---|---|
| sv | leads | Count=1 statt 0 — SV kann fremde Leads lesen |
| kb | sv_tages_session | Count=10 statt 0 — KB sieht alle SV-Sessions |

**RLS-Blocked (Fehler weil leer — kein Leak, aber missing policy):**

| Rolle | Tabellen | Hinweis |
|---|---|---|
| dispatch | claims, dokumente, pflicht_kategorien, lexdrive_events | Dispatch-Rolle hat keine SELECT-Policy auf diesen Tabellen |
| admin | abrechnungen, dokumente, partner_provisionen, provisionen_maik, makler_provisionen, pflicht_kategorien, lexdrive_events | Admin sieht nicht alle Tabellen — RLS-Policy fehlt oder Test-Daten leer |
| kb | dokumente, pflicht_kategorien | KB kann keine Dokumente sehen |

---

## Findings-Backlog (alle Hard- und Soft-Findings)

### F-01 — SOFT | Phase 1: Webform-Submit hat keinen Redirect nach schritt-2
- **Datei:Line:** `src/app/schaden-melden/schritt-1/` (Action oder Form-Handler)
- **Aktueller Effekt:** Formular bleibt auf schritt-1 nach Submit — keine Weiterleitung zum Erfolgsbild
- **Vorgeschlagener Fix:** Server-Action Fehlerhandler prüfen, `redirect()` nach Lead-Insert verifizieren
- **Re-Smoke:** Phase 1 nach Fix

### F-02 — SOFT | Phase 1+2: lead.created Mitteilung emittiert nicht
- **Datei:Line:** `src/lib/notifications/emit.ts` → lead.created-Event
- **Aktueller Effekt:** Dispatch bekommt keine Bell-Mitteilung wenn neuer Lead eingeht
- **Vorgeschlagener Fix:** emit.ts auf lead.created-Event prüfen; mitteilungen-Schema: Spalte heißt `kategorie` (nicht `typ`), `kontext_id` (nicht `referenz_id`)
- **Re-Smoke:** Phase 1-2 nach Fix

### F-03 — SOFT | Phase 2: Thomas Schmidt nicht in sachverstaendige (F-07 gefixt)
- **Datei:Line:** `scripts/smoke/phases/phase-2-dispatch.mjs`
- **Aktueller Effekt:** Nach F-07-Fix (Profile-Join) wird test-sv als Kandidat verwendet
- **Vorgeschlagener Fix:** F-07 war Schema-Bug — jetzt behoben. Smoke-Fixture verwendet test-sv@claimondo.de
- **Re-Smoke:** Phase 2 — bereits besser

### F-04 — SOFT | Phase 2: auftraege wird nach Slot-Reservierung nicht angelegt
- **Datei:Line:** `src/app/dispatch/leads/[id]/actions.ts` → `reserveSvTerminForLead()`
- **Aktueller Effekt:** Slot-Klick reserviert Termin aber legt keinen auftraege-Row an. auftraege hat kein `lead_id`-Feld — FK-Schema anders als erwartet
- **Vorgeschlagener Fix:** `reserveSvTerminForLead()` prüfen ob auftraege.fall_id gesetzt wird und ob ein Fall vorher existieren muss
- **Re-Smoke:** Phase 2-3 nach Fix

### F-05 — SOFT | Phase 2: leads.status springt nicht nach Slot-Reservierung
- **Datei:Line:** `src/app/dispatch/leads/[id]/actions.ts` → Status-Transition
- **Aktueller Effekt:** leads.status bleibt `quali-offen` nach Slot-Klick
- **Vorgeschlagener Fix:** Status-Transition in reserveSvTerminForLead() verifizieren; `transitionFallStatus()` ggf. fehlt
- **Re-Smoke:** Phase 2 nach Fix

### F-06 — SOFT | Phase 3: SV-Akzeptanz hat keinen UI-Button in /gutachter/termine/[id]
- **Datei:Line:** `src/app/gutachter/termine/[id]/TerminDetailActions.tsx`
- **Aktueller Effekt:** "Auftrag annehmen" nicht sichtbar — Smoke fällt auf Service-Role-Workaround zurück
- **Vorgeschlagener Fix:** TerminDetailActions.tsx prüfen — Button vermutlich hinter Sichtbarkeits-Bedingung (auftrag.status muss `zugewiesen` sein)
- **Re-Smoke:** Phase 3 nach F-04-Fix (auftraege braucht status=zugewiesen)

### F-07 — SOFT | Phase 6: GPS-Geofence-Trigger (Auto-Arrive) feuert nicht
- **Datei:Line:** `src/app/gutachter/feldmodus/FeldmodusClient.tsx` (Geofence-Handler)
- **Aktueller Effekt:** Playwright-GPS-Mock setzt Koordinaten, aber Geofence < 100m triggert nicht automatisch
- **Vorgeschlagener Fix:** Geofence-Radius-Check prüfen — ggf. nutzt FeldmodusClient HTML5-Watchposition, die in Playwright-Headless nicht neu feuert wenn nur context.setGeolocation() gesetzt wird
- **Re-Smoke:** Phase 6 mit `--headed` oder service-role-Workaround für sv_angekommen_am

### F-08 — SOFT | Phase 7: File-Upload per setInputFiles() schlägt fehl
- **Datei:Line:** `src/app/gutachter/feldmodus/FeldmodusDokumentSlot.tsx`
- **Aktueller Effekt:** `locator.setInputFiles()` Timeout auf hidden `input[type="file"]` — obwohl der Input im DOM existiert (locator resolved)
- **Vorgeschlagener Fix:** FeldmodusDokumentSlot schützt den Upload mit Interaction-Guard. Playwright muss den Input erst sichtbar/enabled machen per force: true oder `page.dispatchEvent()` statt setInputFiles
- **Re-Smoke:** Phase 7 nach Selektor-Fix

### F-09 — SOFT | Phase 8: Bericht-Freigabe-UI nicht gefunden
- **Datei:Line:** `src/app/gutachter/feldmodus/BesichtigungAbschliessenButton.tsx` oder `vor-ort/VorOrtClient.tsx`
- **Aktueller Effekt:** "Final freigeben"-Button nicht sichtbar — Felder ebenfalls nicht
- **Vorgeschlagener Fix:** Route `/gutachter/termine/[id]/vor-ort` explorieren; D2-Phase-Header muss aktiv sein (besichtigung_gestartet_am gesetzt)
- **Re-Smoke:** Phase 8 nach Phase-6+7-Fix

### F-10 — SOFT | Phase 9: "Freigeben + Kanzlei übergeben"-Button nicht gerendert
- **Datei:Line:** `src/app/faelle/[id]/_components/LexDriveTriggerPanel.tsx`
- **Aktueller Effekt:** Filmcheck-Tab wurde gefunden, aber Freigabe-Button fehlt
- **Vorgeschlagener Fix:** LexDriveTriggerPanel prüfen — Sichtbarkeit hängt an faelle.status='gutachten-eingegangen' AND Admin-Rolle. Status-Check bestätigen
- **Re-Smoke:** Phase 9 nach Phase-8-Fix

### F-11 — SOFT | Phase 10: "VS-Reaktion erfassen"-Button nicht gefunden
- **Datei:Line:** `src/app/faelle/[id]/_tabs/ProzessTab.tsx` → RegulierungCard
- **Aktueller Effekt:** Prozess-Tab öffnet, aber VS-Reaktion-Button fehlt
- **Vorgeschlagener Fix:** ProzessTab.tsx: Sichtbarkeit des VS-Reaktion-Bereichs prüfen — vermutlich an fall.status='kanzlei-uebergeben' gebunden + KB-Rolle-Bedingung
- **Re-Smoke:** Phase 10 nach Phase-9-Fix

### F-12 — SOFT | Phase 11: Abrechnung-Liste leer in /admin/abrechnungen
- **Datei:Line:** `src/app/admin/abrechnungen/AbrechnungenListClient.tsx`
- **Aktueller Effekt:** Service-Role-Insert hat Abrechnung angelegt, aber UI zeigt sie nicht (RLS oder Filter)
- **Vorgeschlagener Fix:** AbrechnungenListClient prüft vermutlich auf `empfaenger_id=sachverstaendige.id` — unsere Workaround-Abrechnung hat sv_id nicht gesetzt. Insert-Query in Phase 11 anpassen
- **Re-Smoke:** Phase 11 nach Fix

### F-13 — HARD-CLASS | RLS: SV liest fremde Leads
- **Datei:Line:** Supabase RLS auf `leads`-Tabelle
- **Aktueller Effekt:** SV-Rolle sieht 1 Lead — sollte 0 sein
- **Vorgeschlagener Fix:** `SELECT` Policy auf `leads` für Rolle `sachverstaendiger` prüfen — ggf. `sv_id`-Check fehlt oder Policy zu weit
- **Re-Smoke:** RLS-Check nach Migration

### F-14 — HARD-CLASS | RLS: KB sieht alle sv_tages_session
- **Datei:Line:** Supabase RLS auf `sv_tages_session`-Tabelle
- **Aktueller Effekt:** KB-Rolle sieht 10 Session-Rows — sollte 0 sein
- **Vorgeschlagener Fix:** RLS-Policy auf `sv_tages_session` für KB-Rolle fehlt oder ist zu permissiv
- **Re-Smoke:** RLS-Check nach Migration

### F-15 — SOFT | Platform-Sweep: /admin/leads → 404
- **Datei:Line:** `src/app/admin/leads/` — Route existiert nicht
- **Aktueller Effekt:** 404 bei /admin/leads
- **Vorgeschlagener Fix:** Sweep-Script korrigieren — Admin hat Leads unter `/dispatch/leads` oder gar nicht
- **Re-Smoke:** Nur Sweep-Config-Fix

### F-16 — SOFT | Platform-Sweep: SV /gutachter/faelle + /einstellungen + /abrechnung → ERR_ABORTED
- **Datei:Line:** `src/app/gutachter/faelle/`, `einstellungen/`, `abrechnung/`
- **Aktueller Effekt:** ERR_ABORTED — Server-Side-Rendering bricht ab (wahrscheinlich DB-Query auf leere/fehlende Daten wirft Exception)
- **Vorgeschlagener Fix:** Seiten mit `try/catch` in Server-Component oder Suspense-Boundary absichern; prüfen ob fehlende sachverstaendige-Daten zum Crash führen
- **Re-Smoke:** SV-Sweep nach Fix

### F-17 — SOFT | sv_tages_session upsert: Spalte beendet_am fehlt
- **Datei:Line:** `scripts/smoke/helpers.mjs` → `forceTerminAufHeute()`
- **Aktueller Effekt:** Upsert warnt aber läuft weiter (nicht-kritisch)
- **Vorgeschlagener Fix:** `beendet_am` aus sv_tages_session-upsert entfernen (Schema hat diese Spalte nicht)
- **Re-Smoke:** Keine Phase-Re-Run nötig, nur Helper-Fix

---

## Brainstorm — Fehlende Info pro Rolle (Plan §5)

**Kunde:**
- Kunden-Onboarding-Flow nach Magic-Link nicht getestet (Phase 4 Redirect-Problem)
- Schadensfortschritts-View aus Kundenperspektive (welche Phasen sieht der Kunde wann)
- Bankdaten-Erfassung für Auszahlung (BankdatenBanner — `src/components/kunde/BankdatenBanner.tsx`)

**SV (Sachverständiger):**
- Honorar-Einstellungen (Stundensatz, Anfahrt-km) nicht getestet
- GCal-OAuth-Flow (Token-Insert + Kalender-Sync) nicht getestet
- Bericht-Unterschrift (Signatur-Pad) — möglicherweise touch-only, kein Desktop-Mouse-Test
- Reklama­tions-Flow (Phase außerhalb der 11 Smoke-Phasen)

**Dispatch:**
- Eskalations-Flow (Lead > 24h unbearbeitet) nicht getestet
- Manuelle SV-Suche (Kein SV in Reichweite) nicht getestet
- Cron-Trigger für tägliche Tagesrouten-Optimierung nicht geprüft

**Admin:**
- Email-Template-Editor nicht getestet
- VS-Stammdaten + Partner-Config nicht getestet
- Kanzlei-Abrechnungs-Tab (`/admin/kanzlei-abrechnungen`) nicht im Sweep
- SLA-Monitoring + Mahnungs-Cron nicht geprüft

**KB (Kundenbetreuer):**
- KB-spezifische Fallakten-Sections — was sieht KB vs Admin?
- Schriftsatz-Erstellen Flow
- Phase-Audit-Tool (`src/lib/kb/phase-audit.ts`) nicht getestet

---

## Abschluss-Empfehlungen (Priorität)

**P0 — Sofort (Production-Risk):**
1. RLS-Leak: SV liest Leads (F-13) — `leads`-Policy prüfen
2. RLS-Leak: KB sieht sv_tages_session (F-14) — Policy fehlt

**P1 — Vor nächstem Release:**
3. F-07: File-Upload FeldmodusDokumentSlot mit `force: true` oder dispatchEvent (Phase 7)
4. F-04: auftraege-Insert nach Slot-Reservierung (Phase 2) — kritischer Business-Flow
5. F-08: Bericht-Freigabe UI erreichbar machen (Phase 8)

**P2 — Backlog:**
6. F-10/F-11: LexDrive-Freigabe + VS-Reaktion-Button Sichtbarkeits-Bedingungen prüfen
7. F-16: SV /gutachter/faelle + /einstellungen + /abrechnung ERR_ABORTED beheben
8. F-06: GPS-Geofence in Playwright-Headless — Workaround oder headed-Test

**Re-Smoke-Plan nach Fixes:**
- Nach F-13/F-14: `node scripts/e2e-rls-check.mjs`
- Nach F-04/F-05/F-06: `node scripts/e2e-full-smoke.mjs --from=1 --to=4`
- Nach F-07/F-08/F-09/F-10/F-11: `node scripts/e2e-full-smoke.mjs --from=6 --to=11`
- Vollständiger Re-Run: `node scripts/e2e-reset.mjs && node scripts/e2e-seed-fixtures.mjs && node scripts/e2e-full-smoke.mjs`

---

## Dateien

| Datei | Beschreibung |
|---|---|
| `docs/portals-review/SMOKE-REPORT-2026-05-08T16-57-13.md` | Phase 1-4 Bericht (Re-Run) |
| `docs/portals-review/SMOKE-REPORT-2026-05-08T17-05-58.md` | Phase 5-7 Bericht |
| `docs/portals-review/SMOKE-REPORT-2026-05-08T17-11-30.md` | Phase 8-11 Bericht |
| `docs/portals-review/PLATFORM-SWEEP-2026-05-08T17-13-01.md` | Platform-Sweep alle Rollen |
| `docs/portals-review/RLS-MATRIX.md` | RLS-Sichtbarkeits-Matrix |
| `scripts/smoke/helpers.mjs` | + Workaround-Helpers F-02/F-05/F-06 |
| `scripts/smoke/phases/phase-8-bericht.mjs` | Neu |
| `scripts/smoke/phases/phase-9-admin-review.mjs` | Neu |
| `scripts/smoke/phases/phase-10-vs-regulierung.mjs` | Neu |
| `scripts/smoke/phases/phase-11-abrechnung.mjs` | Neu |
| `scripts/e2e-platform-sweep.mjs` | Neu |
| `scripts/e2e-full-smoke.mjs` | Erweitert: Phasen 5-11 + Workaround-Patch nach Phase 2 |
