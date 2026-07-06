# Finder-Booking-E2E — Kompletter Plan (verifiziert 06.07.)

**Kontext:** Golden-Path-E2E (#3686) deckt Entry via `/schaden-melden` + alle Rollensichten + den manuellen Abschluss (`golden-path-completion-prod.spec.ts`) ab. Der **zweite Entry — der Gutachter-Finder-Buchungspfad** (Adresse → Engine-Match → Slot → Buchung) — ist noch nicht E2E-getestet. Dieser Plan macht ihn testbar. **Partner-sicher, gegen Prod, ohne Live-Pollution.**

> **Wichtig:** Die ursprüngliche 3-Baustein-Skizze (RLS-Härtung + Secret-Token-Read + Fixture) war überdimensioniert. Nach Verifikation gegen Prod-Code + DB kollabiert der Plan auf **eine reversible Test-SV-Fixture + eine E2E-Spec — voraussichtlich ohne jede Produktions-Code-Änderung.** Die Investigation, die das belegt, steht unter „Verifizierte Fakten".

## Ziel
Eine interne Test-Identität (`@claimondo.de`) bucht im echten Finder-iframe einen Test-SV bis zum reservierten Termin (gfa → Lead → Claim), optional weiter bis `fall_geschlossen` (Kette zur completion-Spec). Kein echter Kunde/Partner wird berührt.

## Verifizierte Fakten (06.07., gegen Prod-Code + DB)

1. **Prod-Read-Modell bestätigt.** `git diff origin/main`/`origin/staging` für `gutachter-finder-actions.ts` = leer → mein Working-Tree == Prod. `ladeAktiveSVs` Read-1 läuft anon-RLS; der Service-Role-Rewrite `5b68b134d` liegt nur auf dem **unmergten** Branch `kitta/finder-gesamt-abdeckung` (#3677).

2. **Anon-Map-Policy filtert `ist_testaccount` bereits.** `sachverstaendige_anon_select_map_ready` USING = `verifiziert AND ist_aktiv AND portal_zugang_freigeschaltet AND ist_testaccount=false AND geloescht_am IS NULL AND gesperrt_seit IS NULL AND standort_lat/lng NOT NULL AND isochrone_polygon NOT NULL`. → **Keine RLS-Migration nötig.** Test-SVs sind auf der Karte unsichtbar.

3. **#3677 reöffnet das Leck NICHT.** Der Service-Role-Rewrite repliziert den Filter im Code inkl. `.eq('ist_testaccount', false)` (Z.151) → kein Prod-Leak nach Merge. Aber #3677 ist eine **Kollision** auf `ladeAktiveSVs` (nur relevant, falls Part 3 gebraucht wird).

4. **🔑 Buchungspfad ≠ Karten-Read.** Der Wizard-Slot-Step ist token-los: `ladeEmbedMatching` (`embed/gutachter-finder/actions.ts:94`) → `planeTerminMitFallback` → `planeTerminOeffentlich` → `findBestSV` → `findeBestePerson` → **`applyDispatchableFilter`** (`lib/sv/queries.ts:45`). Der filtert `verifiziert + ist_aktiv + portal_zugang_freigeschaltet + gesperrt_seit IS NULL` — **NICHT `ist_testaccount`.** Ein aktiver, erreichbarer Test-SV ist also **direkt buchbar — ohne Token, ohne Code-Change.** Die Karte (`ladeAktiveSVs`, test-gefiltert) zeichnet nur die Pins.

5. **🔑 Guard ist symmetrisch = der Backstop.** `entscheideTestSvGuard(leadIstIntern, svIstTest)` (`testdaten/test-sv-guard.ts`), erzwungen an `reserviere()` (`engine/writes.ts:48`): `intern-Lead↔echt-SV → BLOCK`; **`echt-Kunde↔Test-SV → BLOCK`**; sonst erlaubt. → Ein echter Kunde kann den Test-SV **nie** buchen, selbst wenn er live im Pool ist. Die interne E2E-Identität (`@claimondo.de` → `istInterneIdentitaet=true`) darf.

6. **Slots-Quelle:** `freieSlots` (`engine/slots.ts`) über `v_belegung` (Buchungen ∪ externe Kalender-Busy ∪ Ausnahmen, Reachability + now-Floor, 14-Tage-Fenster). **Q2 aufgelöst:** bei `arbeitszeiten=null` greift `DEFAULT_SV_ARBEITSZEITEN` (slots.ts:80) → **keine Verfügbarkeits-Seeds nötig**, Default-Geschäftszeiten liefern Slots, sobald SV aktiv + erreichbar.

8. **Q-client aufgelöst:** `FinderWizard.tsx:457-467` rendert den Slot-Step **direkt aus dem Engine-Result** (`<SvSlotAuswahl svs={matching.svs}>`), bucht `auswahl.sv.svId` — **keine** Referenz auf `ladeAktiveSVs`/Karten-Pins. → **Part 3 entfällt komplett; kein Produktions-Code-Change, kein Anfassen des #3677-umkämpften `ladeAktiveSVs`.**

7. **Test-SV `1da11741` „Schmidt Sachverständige Köln"** aktuell: `ist_testaccount=true, ist_aktiv=false, gesperrt_seit=2026-06-30, verifiziert=true, portal_zugang=true, isochrone=set, standort=Köln Mediapark (50.9527,6.9474), paket_umkreis_km=25`. Also aktuell **nicht** im Dispatchable-Pool (ist_aktiv=false + gesperrt) → nicht buchbar. Der Firmenname „Schmidt Sachverständige Köln" triggert die `isTestAccount`-Heuristik NICHT — die Sichtbarkeits-Absicherung ist ausschließlich `ist_testaccount` (Fakt 2/3), nie der Name.

## Architektur

### Part 1 — Reversible Test-SV-Fixture (Kern; DB-only, kein Code)
Konfiguriert `1da11741` als buchbar an einem kontrollierten Low-Exposure-Ort, dann Revert. Als E2E-Setup (service-role, `beforeAll`) — Vorwerte für Revert festhalten:
- `ist_aktiv=true`, `gesperrt_seit=null` → tritt in den Dispatchable-Pool (nötig für die Engine).
- **`ist_testaccount=true` BELASSEN** → (a) bleibt von der Karte weg (Fakt 2/3), (b) Guard blockt echte Kunden (Fakt 5). Doppelte Absicherung.
- Auf **obskure, dünn besiedelte Koordinate** relocaten + **kleine Isochrone** (paket_umkreis_km minimal, z.B. 1–2 km) neu erzeugen → minimiert die Menge realer Adressen, die matchen könnten. `standort_lat/lng`, `standort_adresse`, `isochrone_polygon`, `paket_umkreis_km` für Revert sichern.
- Verfügbarkeit sicherstellen, damit `freieSlots` Slots liefert (Q2 — s.u.).

Teardown (`afterAll`): Vorwerte restaurieren (`ist_aktiv=false`, `gesperrt_seit` zurück, Ort/Isochrone/Umkreis original). **Exposure-Fenster = nur der Testlauf.**

### Part 2 — E2E-Spec `golden-path-finder-prod.spec.ts` (opt-in, Prod)
- Gated `RUN_GOLDEN_PATH_PROD` + `SUPABASE_SERVICE_ROLE_KEY` (Fixture).
- `goto claimondo.de/gutachter-finden` → `frameLocator('iframe[src*="embed/gutachter-finder"]')` (Durchbruch 06.07.).
- Obskuren Besichtigungsort (Fixture-Koordinate) eingeben → Wizard ruft `ladeEmbedMatching` → Test-SV erscheint als einziger `kind:'partner'` mit Slots → Slot wählen → Kontakt mit `@claimondo.de` (istInterneIdentitaet → Guard erlaubt test↔test) → absenden (`reserviereEmbedTermin` → `bucheTerminFlow` → `reserviere`).
- Verify (service-role): gfa angelegt, Lead angelegt, `zugeordneter_sv_id=1da11741`, Termin reserviert. Optional: Kette in `golden-path-completion-prod.spec.ts` → der Claim bis `fall_geschlossen` = der komplette Finder→Abschluss-Bogen.

### Part 3 — ENTFÄLLT (verifiziert)
Q-client aufgelöst (Fakt 8): der Wizard rendert self-contained aus dem Engine-Result. **Kein Token, kein `ladeAktiveSVs`-Change.** Damit auch keine #3677-Kollision.

### Fixture-Lifecycle — transient + idempotent (statt permanent)
Der Test-SV wird **nicht permanent** aktiv gelassen (permanent-aktiv = Dauer-Clutter in internen Admin-/Dispatch-SV-Listen/-Counts, falls die intern `ist_testaccount` nicht filtern). Stattdessen **transient mit idempotentem Setup**: `beforeAll` setzt den SV IMMER erst auf einen bekannten Zustand zurück (heilt einen abgestürzten Vorlauf selbst), aktiviert dann; `afterAll` deaktiviert. Zusätzlich ein Standalone-Reset-Command für den Crash-Fall. Während des aktiven Fensters ist die Exposure durch Guard (Hard-Block) + Karten-Unsichtbarkeit + obskur-winzige Isochrone neutralisiert.

## Partner-Safety (vier unabhängige Ebenen, stärkste zuerst)
1. **Guard (reserviere-Chokepoint):** echter Kunde ↔ Test-SV = unbedingt BLOCK. Macht es allein sicher. [verifiziert symmetrisch]
2. **Karten-Unsichtbarkeit:** `ist_testaccount` hält den SV von `ladeAktiveSVs` fern (RLS heute, Code-Filter post-#3677).
3. **Obskur + winzige Isochrone:** nahezu keine reale Adresse matcht ihn in der Engine.
4. **Kurzlebige Aktivierung:** live nur während des Testlaufs; Teardown revertet.

## Sequenzierung
1. **Q2 + Q-client klären** (reine Reads): `engine/slots.ts` (welche Verfügbarkeit braucht `freieSlots`, um Slots zu emittieren?) + FinderWizard-Client (Render-Quelle des Slot-Steps). Entscheiden Fixture-Details + ob Part 3 nötig ist.
2. Fixture-Setup/Teardown + E2E-Spec schreiben.
3. Opt-in gegen Prod laufen lassen (Low-Traffic-Fenster).

## Risiken
- **#3677-Kollision** auf `ladeAktiveSVs` — nur relevant, falls Part 3 gebraucht wird; mit `kitta/finder-gesamt-abdeckung` koordinieren. Part 1+2 fassen keinen Code an → keine Kollision.
- **Live-Pool-Exposure** während der Aktivierung — durch die 4 Ebenen gedeckt; Guard ist der harte Backstop.
- **Isochrone-Neuerzeugung** für den obskuren Ort (`calculateIsochrone`/Mapbox) oder ein handgemachtes winziges Polygon. Reversibel.
- **Slot-Verfügbarkeit** — falls die Engine explizite Arbeitszeiten/Verfügbarkeits-Rows braucht, seeden (Q2).

## Alternativen (verworfen)
- **Playwright-Network-Mock der SV-Daten:** die echte `reserviere` hört auf die DB → Mock-Display ≠ echte Buchung → kein echter Abschluss.
- **Staging-Finder:** Marketing/Finder nicht auf Staging deployt.
- **`ist_testaccount` auch in `applyDispatchableFilter` filtern:** würde die Test-Buchung selbst verhindern (Engine würde den Test-SV nicht mehr matchen). Der symmetrische Guard löst dasselbe Sicherheitsziel, ohne die Testbarkeit zu brechen.

## Aufwand vs. Wert (ehrlich)
- `/schaden-melden`-Entry ist bereits E2E bewiesen (#3686). Finder-Booking ist ein ZWEITER Entry — aber der einzige, der die **SV-Matching-Engine + Isochrone-Zuständigkeit + Slot-Generierung + Embed-Buchung** durchläuft. Echt zusätzliche Abdeckung.
- Kosten jetzt NIEDRIG: kein Produkt-Code (Part 1+2), eine reversible DB-Fixture + eine Spec. Die ursprünglich befürchtete RLS-/Token-Arbeit ist größtenteils unnötig.
- **Empfehlung:** machen — billig geworden, deckt den Engine-Pfad.

## Offene Fragen — beide aufgelöst (06.07.)
- ~~**Q2**~~ ✅ Default-Geschäftszeiten (slots.ts:80) → keine Seeds. (Fakt 6)
- ~~**Q-client**~~ ✅ Wizard self-contained aus Engine-Result → Part 3 entfällt. (Fakt 8)
- Verbleibender Build-Check (billig, nicht blockierend): filtern interne Admin-/Dispatch-SV-Listen `ist_testaccount`? Entscheidet nur, ob der obskure Test-SV in internen Views auftaucht — der transiente Lifecycle umgeht das Thema ohnehin.
