# Journey-Smoke 2026-05-08T21-48-32

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
- ✅ **PASS:** Lead in DB angelegt: 0da75f14-077b-4bb2-a9ea-9ecee7ba3a31 (status=quali-offen) _(db-lead)_
- ⚠️ **SOFT:** NICHT sichtbar: Lead "Mueller" in /dispatch/leads sichtbar _(cross-dispatch-list)_
- ✅ **PASS:** verborgen wie erwartet: Lead "Mueller" darf bei SV NICHT sichtbar sein (kein Auftrag) _(cross-sv-hidden)_
- ✅ **PASS:** verborgen wie erwartet: Kunde sieht keine Fallakte für den noch nicht konvertierten Lead _(cross-kunde-hidden)_

## Phase 2 — PASS:1 SOFT:5 HARD:0

- ✅ **PASS:** Lead-Detail geöffnet: http://localhost:3000/dispatch/leads/0da75f14-077b-4bb2-a9ea-9ecee7ba3a31 _(navigation)_
- ⚠️ **SOFT:** NICHT sichtbar: Phase-Header in Dispatch-Shell _(phase-header)_
- ⚠️ **SOFT:** Pop-Over hat sich nicht geöffnet: Phase-Wechsel-Pop-Over _(popover)_
- ⚠️ **SOFT:** NICHT sichtbar: SV-Termin-reservieren Panel _(sv-panel)_
- ⚠️ **SOFT:** Weder "Gutachter suchen"-Button noch SV-Liste sichtbar — hardGate ggf. nicht erfüllt _(sv-suche-btn)_
- ⚠️ **SOFT:** Keine Slot-Kacheln gefunden — SvCard-Layout veränert? _(slot-list)_

## Phase 3 — PASS:156 SOFT:18 HARD:0

- ℹ️ **INFO:** Button-Audit "admin/admin": 31 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Dispatch" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Fälle" → NAV — → /admin/faelle _(btn-nav)_
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
- ✅ **PASS:** Button "Neue Faelle heute3seit 0:00 Uhr" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Umsatz aktueller Monat1.250 €bezahlte Rechnungen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Gutachten → QC0warten auf Filmcheck" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender" → NAV — → /admin/kalender _(btn-nav)_
- ✅ **PASS:** Button "11:09SV-Termin: CLM-20260507-001SV" → NAV — → /faelle/9419e854-ae71-4425-b71a-dcf67f454595 _(btn-nav)_
- ✅ **PASS:** Button "19:20SV-Termin: CLM-20260506-001SV" → NAV — → /faelle/d55caafd-0751-412a-b706-3ba4f8184585 _(btn-nav)_
- ✅ **PASS:** Button "21:39SV-Termin: 2026-0001SV" → NAV — → /faelle/c5a479d3-0f49-40f4-87de-5f6c4905cd3b _(btn-nav)_
- ✅ **PASS:** Button "Kelvin Tyron Gallinfo@kfz-gutachter-gall.deAnzahlung offenseit 1 Tag1.500 €" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Alle anzeigen" → NAV — → /admin/finance/abrechnungen _(btn-nav)_
- ✅ **PASS:** Button "Neuer Fall 2026-0002vor 36 Min" → NAV — → /faelle/3b543810-306f-4066-a059-a2311e1bc880 _(btn-nav)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 6 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "admin/admin" Summary: NAV=7 MODAL=0 NOOP=16 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "admin/admin/faelle": 59 klickbare Elemente gefunden (max 25) _(audit-inventory)_
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
- ✅ **PASS:** Button "Kanzlei-Board" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Reklamationen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "button#24" → MODAL — Pop-Over/Modal geöffnet _(btn-modal)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 34 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "admin/admin/faelle" Summary: NAV=10 MODAL=1 NOOP=6 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "dispatch/dispatch/dashboard": 30 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Leads" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Rückrufe" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Karte" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Sachverständige" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Isochrone" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "35Neue Leads heute" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "0Offene Rückrufe" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "0FlowLinks versendet" → NAV — → /dispatch/leads _(btn-nav)_
- ✅ **PASS:** Button "Alle anzeigen" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Alle anzeigen" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung29m" → NAV — → /dispatch/leads/a2f29757-d6eb-4648-b9eb-1f8d2c986fb2 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung38m" → NAV — → /dispatch/leads/0d0e3239-00f4-4bf2-9f53-6139c6169871 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung51m" → NAV — → /dispatch/leads/7934bfd2-0371-4f39-9c7e-5a41f76c11de _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung57m" → NAV — → /dispatch/leads/d33a7b59-773b-4ca7-8c84-cbdb0e3174b8 _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/526cbe12-1599-4d0f-a2e4-edf548835d9c _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/526cbe12-1599-4d0f-a2e4-edf548835d9c _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/526cbe12-1599-4d0f-a2e4-edf548835d9c _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990001 In Qualifizierung1h" → NAV — → /dispatch/leads/526cbe12-1599-4d0f-a2e4-edf548835d9c _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990099 erstkontakt2h" → NAV — → /dispatch/leads/ec27ce4d-a16a-4982-b201-c10cb6c84b0e _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990099 erstkontakt2h" → NAV — → /dispatch/leads/ec27ce4d-a16a-4982-b201-c10cb6c84b0e _(btn-nav)_
- ✅ **PASS:** Button "Lisa Mueller+4915199990099 erstkontakt2h" → NAV — → /dispatch/leads/ec27ce4d-a16a-4982-b201-c10cb6c84b0e _(btn-nav)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 5 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "dispatch/dispatch/dashboard" Summary: NAV=17 MODAL=0 NOOP=6 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "dispatch/dispatch/leads": 153 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Dashboard" → NAV — → /dispatch/dashboard _(btn-nav)_
- ✅ **PASS:** Button "Leads" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Rückrufe" → NAV — → /dispatch/rueckrufe _(btn-nav)_
- ✅ **PASS:** Button "Kalender" → NAV — → /dispatch/kalender _(btn-nav)_
- ✅ **PASS:** Button "Karte" → NAV — → /dispatch/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Sachverständige" → NAV — → /dispatch/sachverstaendige _(btn-nav)_
- ✅ **PASS:** Button "Isochrone" → NAV — → /dispatch/isochrone _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Alle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Neu" → NAV — → /dispatch/leads _(btn-nav)_
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
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 128 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "dispatch/dispatch/leads" Summary: NAV=16 MODAL=0 NOOP=4 ERROR=1 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/heute": 34 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter _(btn-nav)_
- ✅ **PASS:** Button "32 offene Tasks" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Heute" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Aufträge" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Meine Fälle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kalender10" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Vertrag" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Abrechnung" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "StatistikenBeta" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Reklamationen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ⚠️ **SOFT:** Button "Zurück zur Navigation" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ⚠️ **SOFT:** Button "neu" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "entfernen" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Aufnahme starten" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Einstellungen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 9 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "sv/gutachter/heute" Summary: NAV=1 MODAL=0 NOOP=11 ERROR=4 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/auftraege": 29 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Aufträge" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /gutachter/faelle _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NAV — → /gutachter/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ⚠️ **SOFT:** Button "Zurück zur Navigation" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ⚠️ **SOFT:** Button "neu" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "entfernen" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Aufnahme starten" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NAV — → /gutachter/profil _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /gutachter/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Erlauben" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Tagesvorbereitung CSV" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Alle" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Neue" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ⚠️ **SOFT:** Button "In Bearbeitung" → ERROR — Console-Errors: %c%s%c Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported.%s background: #e6e6e6;background: light-dark(rgba(0,0,0,0. _(btn-error)_
- ✅ **PASS:** Button "Komfort" → NAV — → /gutachter/auftraege _(btn-nav)_
- ✅ **PASS:** Button "Kompakt" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 4 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "sv/gutachter/auftraege" Summary: NAV=10 MODAL=0 NOOP=6 ERROR=5 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/posteingang": 24 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "32 offene Tasks" → NAV — → /gutachter/tasks _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Aufträge" → NAV — → /gutachter/auftraege _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /gutachter/faelle _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NAV — → /gutachter/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ⚠️ **SOFT:** Button "Zurück zur Navigation" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ⚠️ **SOFT:** Button "neu" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "entfernen" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Aufnahme starten" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ✅ **PASS:** Button "TSThomas SchmidtSachverständiger" → NAV — → /gutachter/profil _(btn-nav)_
- ✅ **PASS:** Button "Einstellungen" → NAV — → /gutachter/einstellungen _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Nicolastester TesterInvalid Date#CLM-20260506-001 · —" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "WhatsApp" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Gruppen-Chat" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Kunde / Gutachter" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Posteingang öffnen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "sv/gutachter/posteingang" Summary: NAV=11 MODAL=0 NOOP=5 ERROR=4 _(audit-summary)_
- ℹ️ **INFO:** Button-Audit "sv/gutachter/profil": 71 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Heute" → NAV — → /gutachter/heute _(btn-nav)_
- ✅ **PASS:** Button "Aufträge" → NAV — → /gutachter/auftraege _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /gutachter/faelle _(btn-nav)_
- ✅ **PASS:** Button "Vertrag" → NAV — → /gutachter/vertrag _(btn-nav)_
- ✅ **PASS:** Button "Abrechnung" → NAV — → /gutachter/abrechnung _(btn-nav)_
- ✅ **PASS:** Button "StatistikenBeta" → NAV — → /gutachter/statistiken _(btn-nav)_
- ✅ **PASS:** Button "Reklamationen" → NAV — → /gutachter/reklamationen _(btn-nav)_
- ⚠️ **SOFT:** Button "Zurück zur Navigation" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
- ⚠️ **SOFT:** Button "neu" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "entfernen" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('b _(btn-click-fail)_
- ⚠️ **SOFT:** Button "Aufnahme starten" → CLICK-FAIL — locator.click: Timeout 2500ms exceeded.
Call log:
[2m  - waiting for locator('[ _(btn-click-fail)_
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
- ℹ️ **INFO:** Audit-Cap erreicht (25) — 46 Elemente nicht getestet _(audit-cap)_
- ℹ️ **INFO:** Audit "sv/gutachter/profil" Summary: NAV=9 MODAL=0 NOOP=8 ERROR=4 _(audit-summary)_
- ℹ️ **INFO:** Route kunde:/kunde redirected → /kunde/onboarding _(redirect-kunde)_
- ℹ️ **INFO:** Button-Audit "kunde/kunde": 8 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Termine" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "Nachbesichtigung" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ✅ **PASS:** Button "LMLisa MuellerProfil ansehen" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Los geht's" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "kunde/kunde" Summary: NAV=2 MODAL=0 NOOP=4 ERROR=0 _(audit-summary)_
- ℹ️ **INFO:** Route kunde:/kunde/faelle redirected → /kunde/onboarding _(redirect-kunde)_
- ℹ️ **INFO:** Button-Audit "kunde/kunde/faelle": 8 klickbare Elemente gefunden (max 25) _(audit-inventory)_
- ✅ **PASS:** Button "Claimondo" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Meine Fälle" → NAV — → /kunde _(btn-nav)_
- ✅ **PASS:** Button "Termine" → NAV — → /kunde/termine _(btn-nav)_
- ✅ **PASS:** Button "Nachbesichtigung" → NAV — → /kunde/nachbesichtigung _(btn-nav)_
- ✅ **PASS:** Button "LMLisa MuellerProfil ansehen" → NAV — → /kunde/profil _(btn-nav)_
- ℹ️ **INFO:** Audit übersprungen (destruktiv): "Abmelden" _(audit-skip-danger)_
- ✅ **PASS:** Button "Los geht's" → NOOP — kein sichtbarer State-Wechsel _(btn-noop)_
- ℹ️ **INFO:** Audit "kunde/kunde/faelle" Summary: NAV=5 MODAL=0 NOOP=1 ERROR=0 _(audit-summary)_
