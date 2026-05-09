# Journey-Smoke 2026-05-08T21-43-23

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
