# Journey-Smoke 2026-05-08T22-15-22

## Phase 1 — PASS:13 SOFT:5 HARD:0

- ✅ **PASS:** sichtbar: Submit-Button im Initial-Zustand _(submit-initial)_
- ✅ **PASS:** Unfallort-Feld ausgefüllt _(fill-unfallort)_
- ⚠️ **SOFT:** Google-Places-Dropdown ohne Vorschlag — manuelle Eingabe ohne Geo-Match _(autocomplete-unfallort)_
- ✅ **PASS:** Schadentyp gewählt: auffahrunfall _(fill-schadentyp)_
- ✅ **PASS:** Unfallhergang ausgefüllt _(fill-hergang)_
- ⚠️ **SOFT:** Schuldfrage-Radio nicht klickbar _(fill-schuld)_
- ✅ **PASS:** Fahrzeug-Modell ausgefüllt _(fill-modell)_
- ✅ **PASS:** fill-telefon ausgefüllt _(fill-telefon)_
- ✅ **PASS:** fill-vorname ausgefüllt _(fill-vorname)_
- ✅ **PASS:** fill-nachname ausgefüllt _(fill-nachname)_
- ✅ **PASS:** fill-email ausgefüllt _(fill-email)_
- ✅ **PASS:** DSGVO-Checkbox angeklickt _(dsgvo)_
- ⚠️ **SOFT:** Submit-Button ist disabled — Validation hat nicht durchgeschlagen (DSGVO/Pflichtfelder) _(submit-disabled)_
- ℹ️ **INFO:** Fallback form.requestSubmit() aufgerufen _(submit-force)_
- ℹ️ **INFO:** URL nach Submit: http://localhost:3000/schaden-melden/schritt-1 _(redirect)_
- ⚠️ **SOFT:** URL ist immer noch /schritt-1 — Form-Submit hat nicht durchgegriffen _(redirect-fail)_
- ✅ **PASS:** Lead in DB angelegt: bc7319b4-1501-40fa-9bf6-f500f7cbde3c (status=quali-offen) _(db-lead)_
- ⚠️ **SOFT:** NICHT sichtbar: Lead "Mueller" in /dispatch/leads sichtbar _(cross-dispatch-list)_
- ✅ **PASS:** verborgen wie erwartet: Lead "Mueller" darf bei SV NICHT sichtbar sein (kein Auftrag) _(cross-sv-hidden)_
- ✅ **PASS:** verborgen wie erwartet: Kunde sieht keine Fallakte für den noch nicht konvertierten Lead _(cross-kunde-hidden)_

## Phase 2 — PASS:1 SOFT:5 HARD:0

- ✅ **PASS:** Lead-Detail geöffnet: http://localhost:3000/dispatch/leads/bc7319b4-1501-40fa-9bf6-f500f7cbde3c _(navigation)_
- ⚠️ **SOFT:** NICHT sichtbar: Phase-Header in Dispatch-Shell _(phase-header)_
- ⚠️ **SOFT:** Pop-Over hat sich nicht geöffnet: Phase-Wechsel-Pop-Over _(popover)_
- ⚠️ **SOFT:** NICHT sichtbar: SV-Termin-reservieren Panel _(sv-panel)_
- ⚠️ **SOFT:** Weder "Gutachter suchen"-Button noch SV-Liste sichtbar — hardGate ggf. nicht erfüllt _(sv-suche-btn)_
- ⚠️ **SOFT:** Keine Slot-Kacheln gefunden — SvCard-Layout veränert? _(slot-list)_

## Phase 3 — PASS:159 SOFT:8 HARD:0

- ℹ️ **INFO:** Button-Audit "admin/admin": 25 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Dispatch" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Fälle" → NAV — → /admin/faelle _(btn-nav)_
- ✅ **PASS:** Button "Aufgaben" → NAV — → /admin/aufgaben _(btn-nav)_
- ✅ **PASS:** Button "Kalender" → NAV — → /admin/kalender _(btn-nav)_
- ✅ **PASS:** Button "Sachverständige" → NAV — → /admin/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Partner" → NAV — → /admin/partner _(btn-nav)_
- ✅ **PASS:** Button "Finanzen" → NAV — → /admin/finance _(btn-nav)_
- ✅ **PASS:** Button "Team" → NAV — → /admin/team _(btn-nav)_
- ✅ **PASS:** Button "Vertragseditor" → NAV — → /admin/vertraege _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /admin/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Aktive SVs6Portal-Zugang freigeschaltet" → NAV — → /admin/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Ausstehende Zahlungen1.500 €Anzahlungen + ueberfaellige Rechnungen" → NAV — → /admin/finance/abrechnungen _(btn-nav)_
- ✅ **PASS:** Button "Neue Faelle heute0seit 0:00 Uhr" → NAV — → /admin/faelle _(btn-nav)_
- ✅ **PASS:** Button "Umsatz aktueller Monat1.250 €bezahlte Rechnungen" → NAV — → /admin/finance _(btn-nav)_
- ✅ **PASS:** Button "Gutachten → QC0warten auf Filmcheck" → NAV — → /admin/faelle/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Kalender" → NAV — → /admin/kalender _(btn-nav)_
- ✅ **PASS:** Button "Kelvin Tyron Gallinfo@kfz-gutachter-gall.deAnzahlung offenseit 1 Tag1.500 €" → NAV — → /admin/sachverstaendige/eae70f94-980b-4ba4-a38d-c38af2f934da _(btn-nav)_
- ✅ **PASS:** Button "Alle anzeigen" → NAV — → /admin/finance/abrechnungen _(btn-nav)_
- ✅ **PASS:** Button "Neuer Fall CLM-20260507-001vor 1 Tag" → NAV — → /faelle/9419e854-ae71-4425-b71a-dcf67f454595 _(btn-nav)_
- ✅ **PASS:** Button "Kelvin Tyron Gall hat den Vertrag unterzeichnetvor 1 Tag" → NAV — → /admin/sachverstaendige/eae70f94-980b-4ba4-a38d-c38af2f934da _(btn-nav)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "admin/admin" Summary: NAV=19 MODAL=0 NOOP=3 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "admin/admin/faelle": 47 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NAV — → /admin _(btn-nav)_
- ✅ **PASS:** Button "Dispatch" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Fälle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Aufgaben" → NAV — → /admin/aufgaben _(btn-nav)_
- ✅ **PASS:** Button "Kalender" → NAV — → /admin/kalender _(btn-nav)_
- ✅ **PASS:** Button "Sachverständige" → NAV — → /admin/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Partner" → NAV — → /admin/partner _(btn-nav)_
- ✅ **PASS:** Button "Finanzen" → NAV — → /admin/finance _(btn-nav)_
- ✅ **PASS:** Button "Team" → NAV — → /admin/team _(btn-nav)_
- ✅ **PASS:** Button "Vertragseditor" → NAV — → /admin/vertraege _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /admin/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Liste" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "SLA" → NAV — → /admin/faelle/sla _(btn-nav)_
- ✅ **PASS:** Button "Statistiken" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kanzlei-Board" → NAV — → /admin/faelle/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /admin/faelle/reklamationen _(btn-nav)_
- ✅ **PASS:** Button "Aktive" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Deaktiv." → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Alle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Karte verschieben" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "CLM-20260507-001" → NAV — → /faelle/9419e854-ae71-4425-b71a-dcf67f454595 _(btn-nav)_
- ✅ **PASS:** Button "button#24" → MODAL — Pop-Over/Modal geöffnet _(btn-modal)_
- ✅ **PASS:** Button "Aaron Sprafke 114K-MB 1234EKB: Anna WeberSV: Test-Aaron Test-Sprafke" → NAV — → /faelle/9419e854-ae71-4425-b71a-dcf67f454595 _(btn-nav)_
- ✅ **PASS:** Button "Karte verschieben" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 22 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "admin/admin/faelle" Summary: NAV=14 MODAL=1 NOOP=9 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "dispatch/dispatch/dashboard": 30 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Leads" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Rückrufe" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Kalender" → NAV — → /dispatch/kalender _(btn-nav)_
- ✅ **PASS:** Button "Karte" → NAV — → /dispatch/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Sachverständige" → NAV — → /dispatch/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Isochrone" → NAV — → /dispatch/isochrone _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "3Neue Leads heute" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "0Offene Rückrufe" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "3FlowLinks versendet" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Alle anzeigen" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Alle anzeigen" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung17m" → NAV — → /dispatch/leads/47e842d2-d7c7-46af-b9ab-716502d2c911 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung57m" → NAV — → /dispatch/leads/a2f29757-d6eb-4648-b9eb-1f8d2c986fb2 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 5 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "dispatch/dispatch/dashboard" Summary: NAV=20 MODAL=0 NOOP=1 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "dispatch/dispatch/leads": 162 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NAV — → /dispatch/dashboard _(btn-nav)_
- ✅ **PASS:** Button "Leads" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Rückrufe" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Kalender" → NAV — → /dispatch/kalender _(btn-nav)_
- ✅ **PASS:** Button "Karte" → NAV — → /dispatch/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Sachverständige" → NAV — → /dispatch/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Isochrone" → NAV — → /dispatch/isochrone _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Alle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Rückruf" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "In Qualifizierung" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Flow gesendet" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "SA ausstehend" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Nicht erreicht" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Kalt" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Disqualifiziert" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Konvertiert" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Liste" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kanban" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Lisa Mueller" → NAV — → /dispatch/leads/c26e7aae-8f5f-42f3-9f49-4440a6e4dcdd _(btn-nav)_
- ⚠️ **SOFT:** Button "a#26" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('a _(btn-click-fail)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 137 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "dispatch/dispatch/leads" Summary: NAV=15 MODAL=0 NOOP=4 ERROR=1 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/heute": 28 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Aufträge" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /gutachter/faelle _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (headless-incompatible): "Aufnahme starten" _(audit-skip-headless)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /gutachter/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ⚠️ **SOFT:** Button "Erlauben" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Standort-Hinweis 7 Tage ausblenden" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Zoom in" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Zoom out" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Reset bearing to north" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ✅ **PASS:** Button "Mapbox homepage" → EXTERNAL — extern → https://www.mapbox.com/ _(btn-external)_
- ✅ **PASS:** Button "Tagesvorbereitung CSV" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Privat" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "sv/gutachter/heute" Summary: NAV=5 MODAL=0 NOOP=8 ERROR=5 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/auftraege": 29 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Aufträge" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /gutachter/faelle _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NAV — → /gutachter/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (headless-incompatible): "Aufnahme starten" _(audit-skip-headless)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NAV — → /gutachter/profil _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ⚠️ **SOFT:** Button "Erlauben" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "sv/gutachter/auftraege" Summary: NAV=8 MODAL=0 NOOP=3 ERROR=1 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/posteingang": 24 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "32 offene Tasks" → NAV — → /gutachter/tasks _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Aufträge" → NAV — → /gutachter/auftraege _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NAV — → /gutachter/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (headless-incompatible): "Aufnahme starten" _(audit-skip-headless)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NAV — → /gutachter/profil _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /gutachter/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Nicolastester TesterInvalid Date#CLM-20260506-001 · —" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "WhatsApp" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Gruppen-Chat" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kunde / Gutachter" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "sv/gutachter/posteingang" Summary: NAV=10 MODAL=0 NOOP=6 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/profil": 71 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Aufträge" → NAV — → /gutachter/auftraege _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /gutachter/faelle _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NAV — → /gutachter/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (headless-incompatible): "Aufnahme starten" _(audit-skip-headless)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /gutachter/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Bearbeiten" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Hochladen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender: Nicht verbundenVerwalten unter Einstellungen → KalenderÖffnen →" → NAV — → /gutachter/einstellungen/kalender _(btn-nav)_
- ✅ **PASS:** Button "Karosseriebaumeister" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kfz-Meister" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "B.Eng." → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "M.Eng." → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Dipl.-Ing." → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "BVSK-Mitglied" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "IHK-zertifiziert" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Öffentlich bestellt und vereidigt" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 46 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "sv/gutachter/profil" Summary: NAV=10 MODAL=0 NOOP=11 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "kunde/kunde": 8 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Meine Fälle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Termine" → NAV — → /kunde/termine _(btn-nav)_
- ✅ **PASS:** Button "Nachbesichtigung" → NAV — → /kunde/nachbesichtigung _(btn-nav)_
- ✅ **PASS:** Button "LMLisa MuellerProfil ansehen" → NAV — → /kunde/profil _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Schaden melden" → NAV — → /schaden-melden/schritt-1 _(btn-nav)_
- ℹ️ **INFO:** Audit "kunde/kunde" Summary: NAV=4 MODAL=0 NOOP=2 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "kunde/kunde/faelle": 8 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Termine" → NAV — → /kunde/termine _(btn-nav)_
- ✅ **PASS:** Button "Nachbesichtigung" → NAV — → /kunde/nachbesichtigung _(btn-nav)_
- ✅ **PASS:** Button "LMLisa MuellerProfil ansehen" → NAV — → /kunde/profil _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ⚠️ **SOFT:** Button "Erneut versuchen" → ERROR — Console-Errors: %o

%s Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
 | [CMM-14 KUNDE LAYOUT ERROR BOUNDARY] Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this fu _(btn-error)_
- ℹ️ **INFO:** Audit "kunde/kunde/faelle" Summary: NAV=5 MODAL=0 NOOP=0 ERROR=1 _(audit-summary)_

## Phase 4 — PASS:7 SOFT:3 HARD:0

- ℹ️ **INFO:** Kein FlowLink für Lead — lege via Service-Role an (nicht Teil des UI-Tests) _(flowlink-create)_
- ✅ **PASS:** FlowLink verfügbar: token=journey-moxh… status=versendet _(flowlink-ready)_
- ✅ **PASS:** FlowLink-Page geladen ohne Fehler _(flowlink-loaded)_
- ✅ **PASS:** Schritt 1: Datenschutz-Checkbox aktiviert _(step-zusammenfassung-datenschutz)_
- ✅ **PASS:** Signature-Canvas erreicht nach 2 Weiter-Klicks _(wizard-canvas-reached)_
- ✅ **PASS:** Signatur auf Canvas gezeichnet (Mouse + Pointer-Fallback) _(canvas-drawn)_
- ✅ **PASS:** SA-Akzeptanz-Checkbox angehakt _(sa-checkbox)_
- ✅ **PASS:** SA-Volltext-Modal akzeptiert _(sa-volltext)_
- ⚠️ **SOFT:** SA-Submit-Button disabled — Voraussetzungen unerfüllt (Canvas leer? Checkbox?) _(sa-submit-disabled)_
- ⚠️ **SOFT:** Kein Claim in DB nach SA-Submit — Convert-Punkt nicht erreicht _(db-claim-fehlt)_
- ⚠️ **SOFT:** Kein Fall in DB nach SA-Submit _(db-fall-fehlt)_
