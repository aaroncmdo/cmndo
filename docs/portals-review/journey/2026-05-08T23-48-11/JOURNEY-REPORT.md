# Journey-Smoke 2026-05-08T23-48-11

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
- ✅ **PASS:** Lead in DB angelegt: 3a99160b-e294-41b0-84d3-8b02206c7fda (status=quali-offen) _(db-lead)_
- ⚠️ **SOFT:** NICHT sichtbar: Lead "Mueller" in /dispatch/leads sichtbar _(cross-dispatch-list)_
- ✅ **PASS:** verborgen wie erwartet: Lead "Mueller" darf bei SV NICHT sichtbar sein (kein Auftrag) _(cross-sv-hidden)_
- ✅ **PASS:** verborgen wie erwartet: Kunde sieht keine Fallakte für den noch nicht konvertierten Lead _(cross-kunde-hidden)_

## Phase 2 — PASS:1 SOFT:5 HARD:0

- ✅ **PASS:** Lead-Detail geöffnet: http://localhost:3000/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda _(navigation)_
- ⚠️ **SOFT:** NICHT sichtbar: Phase-Header in Dispatch-Shell _(phase-header)_
- ⚠️ **SOFT:** Pop-Over hat sich nicht geöffnet: Phase-Wechsel-Pop-Over _(popover)_
- ⚠️ **SOFT:** NICHT sichtbar: SV-Termin-reservieren Panel _(sv-panel)_
- ⚠️ **SOFT:** Weder "Gutachter suchen"-Button noch SV-Liste sichtbar — hardGate ggf. nicht erfüllt _(sv-suche-btn)_
- ⚠️ **SOFT:** Keine Slot-Kacheln gefunden — SvCard-Layout veränert? _(slot-list)_

## Phase 3 — PASS:156 SOFT:4 HARD:0

- ℹ️ **INFO:** Button-Audit "admin/admin": 27 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Dispatch" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Fälle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Aufgaben" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Sachverständige" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Partner" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Finanzen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Team" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Vertragseditor" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Einstellungen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Aktive SVs6Portal-Zugang freigeschaltet" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Ausstehende Zahlungen1.500 €Anzahlungen + ueberfaellige Rechnungen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Neue Faelle heute1seit 0:00 Uhr" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Umsatz aktueller Monat1.250 €bezahlte Rechnungen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Gutachten → QC0warten auf Filmcheck" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "02:01SV-Termin: 2026-0001SV" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kelvin Tyron Gallinfo@kfz-gutachter-gall.deAnzahlung offenseit 1 Tag1.500 €" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Alle anzeigen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Neuer Fall 2026-0001vor 5 Min" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Neuer Fall CLM-20260507-001vor 1 Tag" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kelvin Tyron Gall hat den Vertrag unterzeichnetvor 1 Tag" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "admin/admin" Summary: NAV=0 MODAL=0 NOOP=24 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "admin/admin/faelle": 51 klickbare Elemente gefunden (max 25) _(audit-inventory)_
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
- ✅ **PASS:** Button "SLA" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Statistiken" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kanzlei-Board" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Reklamationen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Aktive" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Deaktiv." → NAV — → /admin/faelle/reklamationen _(btn-nav)_
- ✅ **PASS:** Button "Alle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Karte verschieben" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "2026-0001" → NAV — → /faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d _(btn-nav)_
- ✅ **PASS:** Button "button#24" → MODAL — Pop-Over/Modal geöffnet _(btn-modal)_
- ✅ **PASS:** Button "Lisa Mueller" → NAV — → /faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d _(btn-nav)_
- ✅ **PASS:** Button "Karte verschieben" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 26 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "admin/admin/faelle" Summary: NAV=12 MODAL=1 NOOP=11 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "dispatch/dispatch/dashboard": 30 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Leads" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Rückrufe" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Karte" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Sachverständige" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Isochrone" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "3Neue Leads heute" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "0Offene Rückrufe" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ⚠️ **SOFT:** Button "3FlowLinks versendet" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('a _(btn-click-fail)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 5 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "dispatch/dispatch/dashboard" Summary: NAV=1 MODAL=0 NOOP=8 ERROR=1 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "dispatch/dispatch/leads": 118 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NAV — → /dispatch/dashboard _(btn-nav)_
- ✅ **PASS:** Button "Leads" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Rückrufe" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Kalender" → NAV — → /dispatch/kalender _(btn-nav)_
- ✅ **PASS:** Button "Karte" → NAV — → /dispatch/karte _(btn-nav)_
- ✅ **PASS:** Button "Sachverständige" → NAV — → /dispatch/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Isochrone" → NAV — → /dispatch/isochrone _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Alle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Rückruf" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "In Qualifizierung" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Flow gesendet" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "SA ausstehend" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Nicht erreicht" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Kalt" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Disqualifiziert" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Konvertiert" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Liste" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kanban" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ⚠️ **SOFT:** Button "a#24" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('a _(btn-click-fail)_
- ✅ **PASS:** Button "Lisa Mueller" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ⚠️ **SOFT:** Button "a#27" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('a _(btn-click-fail)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 93 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "dispatch/dispatch/leads" Summary: NAV=13 MODAL=0 NOOP=6 ERROR=2 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/heute": 30 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter _(btn-nav)_
- ✅ **PASS:** Button "32 offene Tasks" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Heute" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Aufträge1" → NAV — → /gutachter/auftraege _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender1" → NAV — → /gutachter/kalender _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/statistiken _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (headless-incompatible): "Aufnahme starten" _(audit-skip-headless)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NAV — → /gutachter/profil _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ⚠️ **SOFT:** Button "Erlauben" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "sv/gutachter/heute" Summary: NAV=6 MODAL=0 NOOP=7 ERROR=1 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/auftraege": 30 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "32 offene Tasks" → NAV — → /gutachter/tasks _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /gutachter/faelle _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NAV — → /gutachter/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (headless-incompatible): "Aufnahme starten" _(audit-skip-headless)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NAV — → /gutachter/profil _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /gutachter/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Erlauben" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Tagesvorbereitung CSV" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Alle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Neue" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "In Bearbeitung" → NAV — → /gutachter/auftraege _(btn-nav)_
- ✅ **PASS:** Button "Komfort" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kompakt" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Fall 2026-0001 öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Fall CLM-20260506-001 öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "sv/gutachter/auftraege" Summary: NAV=10 MODAL=0 NOOP=10 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/posteingang": 24 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
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
- ℹ️ **INFO:** Audit "sv/gutachter/posteingang" Summary: NAV=7 MODAL=0 NOOP=7 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/profil": 71 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter _(btn-nav)_
- ✅ **PASS:** Button "32 offene Tasks" → NAV — → /gutachter/tasks _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
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
- ✅ **PASS:** Button "Kalender: Nicht verbundenVerwalten unter Einstellungen → KalenderÖffnen →" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Karosseriebaumeister" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kfz-Meister" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "B.Eng." → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "M.Eng." → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Dipl.-Ing." → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "BVSK-Mitglied" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "IHK-zertifiziert" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Öffentlich bestellt und vereidigt" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 46 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "sv/gutachter/profil" Summary: NAV=9 MODAL=0 NOOP=12 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Route kunde:/kunde redirected → /kunde/onboarding _(redirect-kunde)_
- ℹ️ **INFO:** Button-Audit "kunde/kunde": 8 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Mein Fall" → NAV — → /kunde/faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d _(btn-nav)_
- ✅ **PASS:** Button "Termine" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Nachbesichtigung" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "LMLisa MuellerProfil ansehen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Los geht's" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "kunde/kunde" Summary: NAV=2 MODAL=0 NOOP=4 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Route kunde:/kunde/faelle redirected → /kunde/onboarding _(redirect-kunde)_
- ℹ️ **INFO:** Button-Audit "kunde/kunde/faelle": 8 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Mein Fall" → NAV — → /kunde/faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d _(btn-nav)_
- ✅ **PASS:** Button "Termine" → NAV — → /kunde/termine _(btn-nav)_
- ✅ **PASS:** Button "Nachbesichtigung" → NAV — → /kunde/nachbesichtigung _(btn-nav)_
- ✅ **PASS:** Button "LMLisa MuellerProfil ansehen" → NAV — → /kunde/profil _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Los geht's" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "kunde/kunde/faelle" Summary: NAV=5 MODAL=0 NOOP=1 ERROR=0 _(audit-summary)_

## Phase 4 — PASS:12 SOFT:3 HARD:0

- ℹ️ **INFO:** Kein FlowLink für Lead — lege via Service-Role an (nicht Teil des UI-Tests) _(flowlink-create)_
- ✅ **PASS:** FlowLink verfügbar: token=journey-moxk… status=versendet _(flowlink-ready)_
- ✅ **PASS:** FlowLink-Page geladen ohne Fehler _(flowlink-loaded)_
- ✅ **PASS:** Schritt 1: Datenschutz-Checkbox aktiviert _(step-zusammenfassung-datenschutz)_
- ✅ **PASS:** Signature-Canvas erreicht nach 2 Weiter-Klicks _(wizard-canvas-reached)_
- ✅ **PASS:** Signatur auf Canvas gezeichnet (Mouse + Pointer-Fallback) _(canvas-drawn)_
- ✅ **PASS:** SA-Akzeptanz-Checkbox angehakt _(sa-checkbox)_
- ✅ **PASS:** SA-Volltext-Modal akzeptiert _(sa-volltext)_
- ⚠️ **SOFT:** SA-Submit-Button disabled — Voraussetzungen unerfüllt (Canvas leer? Checkbox?) _(sa-submit-disabled)_
- ⚠️ **SOFT:** UI-SA-Submit hängt headless (signature_pad isEmpty bleibt true) — Claim+Fall via Service-Role-Fallback _(sa-fallback)_
- ✅ **PASS:** Claim entstanden: d5022eae-e5fa-4a4b-a27f-60f8ec7bdde7 (status=dispatch_done) _(db-claim)_
- ✅ **PASS:** Fall entstanden: ef1340e8-9b75-4735-bd56-4eaf0107ec1d (status=sv-zugewiesen sa_unterschrieben=true) _(db-fall)_
- ✅ **PASS:** Auftrag entstanden: a7f0d5c1-bf02-47c4-8b79-c15a39fffd34 typ=erstgutachten status=termin _(db-auftrag)_
- ⚠️ **SOFT:** NICHT sichtbar: SV: Auftrag-Card "Mueller" in /gutachter/auftraege _(cross-sv-auftrag-sichtbar)_
- ✅ **PASS:** sichtbar: Kunde: Fallakte-Eintrag sichtbar in /kunde/faelle _(cross-kunde-fall-sichtbar)_
- ✅ **PASS:** sichtbar: Admin: Fall in /admin/faelle sichtbar _(cross-admin-fall-sichtbar)_
- ℹ️ **INFO:** Hygiene-Check: Lead nach Convert nur noch in "umgewandelt"-Filter (manuelle Verifikation in Screenshot) _(hygiene-dispatch)_

## Phase 5 — PASS:3 SOFT:3 HARD:0

- ℹ️ **INFO:** Kein gültiger Kunden-Response-Token — lege via Service-Role an _(token-create)_
- ✅ **PASS:** Termin-Token bereit: journey-term… Termin-Status: bestaetigt _(token-ready)_
- ✅ **PASS:** Termin-Bestätigungs-Page geladen _(page-loaded)_
- ✅ **PASS:** sichtbar: Termin-Info (SV/Termin-Datum) sichtbar _(termin-info-visible)_
- ⚠️ **SOFT:** Bestätigen-Button nicht sichtbar und Termin nicht bereits bestätigt _(btn-fehlt)_
- ⚠️ **SOFT:** Termin-Status NICHT bestätigt: null _(db-termin-status)_
- ℹ️ **INFO:** Termin-Status via Service-Role auf bestaetigt gesetzt (Fallback) _(db-fallback)_
- ⚠️ **SOFT:** NICHT sichtbar: SV: Termin-Card in /gutachter/heute sichtbar _(cross-sv-heute)_

## Phase 6 — PASS:3 SOFT:1 HARD:0

- ✅ **PASS:** sv_tages_session auf en_route gesetzt (sv=7f79e570-776b-4525-82ce-c35654ed6ecc datum=2026-05-08) _(session-ready)_
- ✅ **PASS:** Termin auf heute verschoben: bd65cacc-dce2-4e42-8c6c-5a4138d082f7 _(termin-heute)_
- ✅ **PASS:** "Tagesmodus starten" geklickt _(start-btn-click)_
- ⚠️ **SOFT:** Feldmodus-Page nicht erreicht — aktueller Pfad: /gutachter/heute _(feldmodus-nav)_

## Phase 7 — PASS:12 SOFT:19 HARD:0

- ℹ️ **INFO:** Pop-Over-Audit "admin/admin": 4 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "admin/admin" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Feature durchden _(pop-opens)_
- ℹ️ **INFO:** "admin/admin" → "Posteingang öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin" Zusammenfassung: 3 geprüft, 1 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "admin/admin/faelle": 21 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "admin/admin/faelle" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Feature durchden _(pop-opens)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Aktive" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Deaktiv." → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Alle" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Karte verschieben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Karte verschieben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Karte verschieben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Karte verschieben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Karte verschieben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Karte verschieben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Karte verschieben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" → "Posteingang öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "admin/admin/faelle" Zusammenfassung: 13 geprüft, 1 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "dispatch/dispatch/dashboard": 3 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "dispatch/dispatch/dashboard" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Feature durchden _(pop-opens)_
- ℹ️ **INFO:** "dispatch/dispatch/dashboard" Zusammenfassung: 2 geprüft, 1 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "dispatch/dispatch/leads": 8 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "dispatch/dispatch/leads" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Feature durchden _(pop-opens)_
- ℹ️ **INFO:** "dispatch/dispatch/leads" → "Liste" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads" → "Kanban" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads" → "Neuer Lead" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads" Zusammenfassung: 7 geprüft, 1 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda": 19 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Feature durchden _(pop-opens)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Qualifizierung" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Termin" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Typ" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Daten" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Abschluss" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "6Status" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Aktualisieren" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "WhatsApp" → NOOP _(pop-noop)_
- ⚠️ **SOFT:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "SMS" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Email" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Gespräch starten" → NOOP _(pop-noop)_
- ✅ **PASS:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Anders zuordnen" → OPENS: Bestehende Kunden (1)Wähle den Kunden, mit dem dieser Lead verknüpft werden soll _(pop-opens)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Verknüpfung lösen" → NOOP _(pop-noop)_
- ✅ **PASS:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Disqualifizieren" → OPENS: Lead disqualifizierenPflichtangabe: Warum wird der Lead disqualifiziert? Wird im _(pop-opens)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Termin speichern" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" → "Rückruf erledigt" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "dispatch/dispatch/leads/3a99160b-e294-41b0-84d3-8b02206c7fda" Zusammenfassung: 18 geprüft, 3 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "sv/gutachter/heute": 17 klickbare Elemente _(page-inventory)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "neu" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "entfernen" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "sv/gutachter/heute" → "Hilfe und Support öffnen" → NOOP _(pop-noop)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "Erlauben" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "Standort-Hinweis 7 Tage ausblenden" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "Zoom in" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "Zoom out" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "Reset bearing to north" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "sv/gutachter/heute" → "Tagesvorbereitung CSV" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/heute" → "Privat" → NOOP _(pop-noop)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "—102:01– 03:01in 9 MinBestätigt——" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/heute" → "Tagesmodus fortsetzen" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "sv/gutachter/heute" → "Posteingang öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/heute" Zusammenfassung: 14 geprüft, 0 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "sv/gutachter/auftraege": 13 klickbare Elemente _(page-inventory)_
- ⚠️ **SOFT:** "sv/gutachter/auftraege" → "neu" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/auftraege" → "entfernen" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "sv/gutachter/auftraege" → "Hilfe und Support öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/auftraege" → "Erlauben" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/auftraege" → "Tagesvorbereitung CSV" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/auftraege" → "Komfort" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/auftraege" → "Kompakt" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/auftraege" → "Posteingang öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/auftraege" Zusammenfassung: 10 geprüft, 0 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "sv/gutachter/posteingang": 12 klickbare Elemente _(page-inventory)_
- ⚠️ **SOFT:** "sv/gutachter/posteingang" → "neu" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/posteingang" → "entfernen" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "sv/gutachter/posteingang" → "Hilfe und Support öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/posteingang" → "Nicolastester TesterInvalid Date#CLM-20260506-001 · —" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/posteingang" → "WhatsApp" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/posteingang" → "Gruppen-Chat" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/posteingang" → "Kunde / Gutachter" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/posteingang" → "Posteingang öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/posteingang" Zusammenfassung: 9 geprüft, 0 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "sv/gutachter/profil": 57 klickbare Elemente _(page-inventory)_
- ⚠️ **SOFT:** "sv/gutachter/profil" → "neu" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/profil" → "entfernen" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Hilfe und Support öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Bearbeiten" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Hochladen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Karosseriebaumeister" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Kfz-Meister" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "B.Eng." → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "M.Eng." → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Dipl.-Ing." → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "BVSK-Mitglied" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "IHK-zertifiziert" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Öffentlich bestellt und vereidigt" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Gerichtsgutachten" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Oldtimer-Bewertung" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "Unfallrekonstruktion" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "PKW" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/profil" → "LKW" → NOOP _(pop-noop)_
- ℹ️ **INFO:** Cap 20 erreicht auf sv/gutachter/profil _(cap)_
- ℹ️ **INFO:** "sv/gutachter/profil" Zusammenfassung: 20 geprüft, 0 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** Pop-Over-Audit "sv/gutachter/kalender": 12 klickbare Elemente _(page-inventory)_
- ⚠️ **SOFT:** "sv/gutachter/kalender" → "neu" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ⚠️ **SOFT:** "sv/gutachter/kalender" → "entfernen" → CLICK-ERR: locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - wa _(pop-click-err)_
- ℹ️ **INFO:** "sv/gutachter/kalender" → "Hilfe und Support öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/kalender" → "← Zurück" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/kalender" → "Weiter →" → NOOP _(pop-noop)_
- ✅ **PASS:** "sv/gutachter/kalender" → "Termin setzen" → OPENS: Termin setzenFall CLM-20260506-001DatumUhrzeitAbbrechenSpeichern _(pop-opens)_
- ℹ️ **INFO:** "sv/gutachter/kalender" → "Posteingang öffnen" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "sv/gutachter/kalender" Zusammenfassung: 8 geprüft, 1 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** kunde:/kunde redirected → /kunde/onboarding _(redirect)_
- ℹ️ **INFO:** Pop-Over-Audit "kunde/kunde": 3 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "kunde/kunde" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Hi Lisa — was ka _(pop-opens)_
- ℹ️ **INFO:** "kunde/kunde" → "Los geht's" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "kunde/kunde" Zusammenfassung: 2 geprüft, 1 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** kunde:/kunde/faelle redirected → /kunde/onboarding _(redirect)_
- ℹ️ **INFO:** Pop-Over-Audit "kunde/kunde/faelle": 3 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "kunde/kunde/faelle" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Hi Lisa — was ka _(pop-opens)_
- ℹ️ **INFO:** "kunde/kunde/faelle" → "Los geht's" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "kunde/kunde/faelle" Zusammenfassung: 2 geprüft, 1 Overlays geöffnet _(page-summary)_
- ℹ️ **INFO:** kunde:/kunde/faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d redirected → /kunde/onboarding _(redirect)_
- ℹ️ **INFO:** Pop-Over-Audit "kunde/kunde/faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d": 3 klickbare Elemente _(page-inventory)_
- ✅ **PASS:** "kunde/kunde/faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d" → "Hilfe und Support öffnen" → OPENS: Hilfe & SupportKI-Assistenz — legt bei Bedarf Linear-Tickets an.Hi Lisa — was ka _(pop-opens)_
- ℹ️ **INFO:** "kunde/kunde/faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d" → "Los geht's" → NOOP _(pop-noop)_
- ℹ️ **INFO:** "kunde/kunde/faelle/ef1340e8-9b75-4735-bd56-4eaf0107ec1d" Zusammenfassung: 2 geprüft, 1 Overlays geöffnet _(page-summary)_
- ⚠️ **SOFT:** kunde:/kunde/chat Fehler: page.goto: Timeout 25000ms exceeded.
Call log:
[2m  - navigating to "http://localhost:3000/kunde/ch _(route-error)_
- ✅ **PASS:** Phase 7 Pop-Over-Audit abgeschlossen — alle Seiten, alle Rollen _(phase-done)_
