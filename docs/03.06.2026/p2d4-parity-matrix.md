# P2d-4 — Legacy -> v2 Reachability-Parity-Matrix (Task 0)

**Stand:** 2026-06-03 · **Branch:** `kitta/dispatch-config-unify-p2d4-sidebar`
**Zweck:** Read-only Audit. Jede interaktive Dispatcher-Funktion der Legacy-Implementierung
(`DispatchShell` + `PhaseContent` + `_phases/*` + `_sidebar/*`) bekommt eine v2-Heimat
(Config-Feld / Field-Override / Section-Panel / Sidebar) oder ein dokumentiertes
"bewusst weggelassen". Lücken sollen VOR dem Build auffallen (wie ★4 Cardentity).

**Quellen (gelesen):**
Legacy — `DispatchShell.tsx`, `PhaseContent.tsx`, `PhaseHeader.tsx`, `ExitSkript.tsx`,
`GespraechsleitfadenTimer.tsx`, `RueckrufTerminPanel.tsx`, `RueckrufSection.tsx`,
`SchadentypPicker.tsx`, `SvDispatchPanel.tsx`, `_lib/phase-context.tsx`,
`_sidebar/SidebarStubs.tsx`, `_sidebar/KundenMatchCard.tsx`,
`_phases/{Phase1Qualifizierung,Phase2TerminServiceTyp,Phase3Schadentyp,Phase4Stammdaten,Phase5Zusammenfassung,Phase6StatusTracking,Phase1PersonenForm,BkatAnalysePanel,DokumenteAnfordernCard,UnfallskizzeCard,UnfallskizzeEditor,InlineField}.tsx`.
v2 — `DispatchLeadForm.tsx`, `DispatchGatesPanel.tsx`, `page.tsx`, alle `_v2/*`,
`_actions/{sv-termin,dispatch-lead-felder}.ts`, `_lib/derive-dispatch-felder.ts`,
`components/onboarding/FieldRenderer.tsx`.
Config — `supabase/migrations/20260601194200_seed_lead_erfassung_phasen.sql`,
`20260601194358_seed_lead_erfassung_felder.sql` (+ `20260601210356`, `20260602072035`).

**Status-Legende:** ✓ vorhanden · ➕ dieser Plan (P2d-4) · ⊘ bewusst weggelassen · ⚠️ NEUE LÜCKE · ❓ unsicher

---

## A · Phase 1 — Qualifizierung (`_phases/Phase1Qualifizierung.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| Kundendaten edit (Vorname/Nachname/Telefon/E-Mail/Straße/PLZ/Stadt/Notiz), onBlur-Save | Phase1Qualifizierung.tsx:108-176 (`KundendatenEditBlock`) | Config-Felder Sektion `kontakt` (vorname/nachname/telefon/email/kunde_strasse/kunde_plz/kunde_stadt/notiz) — Seed 194358:10-20 | ✓ vorhanden |
| Sprache des Kunden (7 Pills, Auto-Save) | Phase1Qualifizierung.tsx:410-452 | Config-Feld `sprache` (segmented) — Seed 194358:19 | ✓ vorhanden |
| Unfallhergang Freitext + 5 Baustein-Chips | Phase1Qualifizierung.tsx:466-493 | Config-Feld `unfallhergang` (textarea, Sektion schaden) — Seed 194358:24. (Baustein-Chips = Eingabe-Komfort, kein eigenes Datum.) | ✓ vorhanden (Chips ⊘ Komfort) |
| Schuldfrage (gegner/unklar/eigenverantwortung) | Phase1Qualifizierung.tsx:497-514 | Config-Feld `schuldfrage` (segmented, Sektion schuld) — Seed 194358:62 | ✓ vorhanden |
| Teilschuld-Aufklärung-Checkbox (bei unklar) | Phase1Qualifizierung.tsx:515-532 | Config-Feld `aufklaerung_teilschuld_bestaetigt` (conditional schuldfrage=unklar) — Seed 194358:63 | ✓ vorhanden |
| ExitSkript inline bei Eigenverantwortung | Phase1Qualifizierung.tsx:533-541 | Gesprächshilfe-Sektion "Disqualifikation" (DISQUALIFIKATIONS_HILFE) | ➕ dieser Plan (★3) |
| Schaden sichtbar (Ja/Nein) | Phase1Qualifizierung.tsx:550-553 | Config-Feld `schaden_sichtbar` (segmented) — Seed 194358:23 | ✓ vorhanden |
| Fahrzeug fahrbereit (Ja/Nein) | Phase1Qualifizierung.tsx:562-565 | Config-Feld `fahrzeug_fahrbereit` (segmented, Sektion fahrzeug) — Seed 194358:54 | ✓ vorhanden |
| Mietwagen-Flag | Phase1Qualifizierung.tsx:570-573, 641-643 | Config-Feld `mietwagen_flag` (segmented) — Seed 194358:29 | ✓ vorhanden |
| Besichtigungsort (Place-Autocomplete) + Treffpunkt-Notiz (bei nicht-fahrbereit) | Phase1Qualifizierung.tsx:588-607 | Field-Override `besichtigungsort_adresse` (DispatchPlaceField) — overrides.tsx:50-52; Config-Feld `besichtigungsort_notiz` (textarea) — Seed 194358:67 | ✓ vorhanden |
| Personenschaden-Flag | Phase1Qualifizierung.tsx:611-618, 636-638 | Config-Feld `personenschaden_flag` (segmented) — Seed 194358:26 | ✓ vorhanden |
| Personen-Detail-Editor (Phase1PersonenForm bei personenschaden_flag) | Phase1Qualifizierung.tsx:657-669 -> Phase1PersonenForm.tsx:55 | Section-Panel `schaden` (conditional personenschaden_flag), reuse Phase1PersonenForm | ➕ dieser Plan (★1) |
| Nutzungsausfall-Flag | Phase1Qualifizierung.tsx:644-646 | Config-Feld `nutzungsausfall` (segmented) — Seed 194358:30 | ✓ vorhanden |
| Sachschaden-Flag (Ja/Nein) | Phase1Qualifizierung.tsx:685-714 | Config-Feld `sachschaden_flag` (segmented) — Seed 194358:27 | ✓ vorhanden |
| Sachschaden-Beschreibung (bei Flag) | Phase1Qualifizierung.tsx:715-730 | Config-Feld `sachschaden_beschreibung` (conditional) — Seed 194358:28 | ✓ vorhanden |
| Unfallort (Place-Autocomplete) | Phase1Qualifizierung.tsx:742-754 | Field-Override `unfallort` (DispatchPlaceField) — overrides.tsx:53-55 | ✓ vorhanden |
| Unfalldatum (date) | Phase1Qualifizierung.tsx:771-776 | Config-Feld `unfalldatum` (text JJJJ-MM-TT) — Seed 194358:35 | ✓ vorhanden |
| Unfall-Uhrzeit (Freitext) | Phase1Qualifizierung.tsx:782-788 | Config-Feld `unfall_uhrzeit` (text) — Seed 194358:36 | ✓ vorhanden |
| Polizei vor Ort (Ja/Nein) | Phase1Qualifizierung.tsx:805-828 | Config-Feld `polizei_vor_ort` (segmented) — Seed 194358:37 | ✓ vorhanden |
| Polizeibericht vorhanden -> polizeibericht_pflicht ableiten | Phase1Qualifizierung.tsx:830-865, 269-275 (saveHardGate-Logik) | Derive-Hook: `polizeibericht_pflicht` aus `polizei_vor_ort` — derive-dispatch-felder.ts:42-44 | ✓ vorhanden |
| Polizei-Aktenzeichen (Freitext) | Phase1Qualifizierung.tsx:866-873 | Config-Feld `polizei_aktenzeichen` (conditional polizei_vor_ort=true) — Seed 194358:38 | ✓ vorhanden |
| Auto-Disqualifikation (eigenverantwortung/kein_schaden) via saveHardGate | Phase1Qualifizierung.tsx:282-284; actions->hard-gate.ts | Manuelles `disqualifiziert`-Flag + Warn-Badges (DispatchGatesPanel.tsx:59-69) | ⊘ bewusst weggelassen (P2c) |
| Phase-Complete-Badge + "Weiter zu Phase 2" | Phase1Qualifizierung.tsx:394-402, 906-917 | Vollständigkeits-Indikator (DispatchGatesPanel.tsx:90-103); kein Phasen-Sprung (flacher Form) | ⊘ bewusst weggelassen (Stepper) |

---

## B · Phase 2 — Termin + Service-Typ (`_phases/Phase2TerminServiceTyp.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| Wunschtag-Wochentage-Pills (Multiselect) | Phase2TerminServiceTyp.tsx:186-190 -> WunschterminWochentagePills | Section-Panel `termin_sv` -> DispatchWunschterminPanel — dispatch-section-panels.tsx:56-66 | ✓ vorhanden |
| Wunschtermin (datetime-local, Auto-Save) | Phase2TerminServiceTyp.tsx:199-205 | Config-Feld `wunschtermin` (text, Sektion termin_sv) — Seed 194358:68 | ✓ vorhanden |
| Besichtigungsadresse (Place-Autocomplete) | Phase2TerminServiceTyp.tsx:235-243 | Field-Override `besichtigungsort_adresse` (DispatchPlaceField) — overrides.tsx:50-52 | ✓ vorhanden |
| SV-Vorschläge + Slot-Picker + Termin reservieren | Phase2TerminServiceTyp.tsx:252-259 -> SvDispatchPanel | Field-Override `termin` -> SvDispatchPanel — overrides.tsx:35-44 | ✓ vorhanden |
| Service-Typ Pfad A/B (Toggle-Cards) | Phase2TerminServiceTyp.tsx:269-302 | Config-Feld `service_typ` (toggle-cards, Sektion service_kanzlei) — Seed 194358:64 | ✓ vorhanden |
| Zurück/Weiter Phasen-Navigation | Phase2TerminServiceTyp.tsx:312-330 | ⊘ flacher Form (kein Stepper) | ⊘ bewusst weggelassen |

---

## C · Phase 3 — Schadentyp (`_phases/Phase3Schadentyp.tsx` + `SchadentypPicker.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| Schadentyp-Picker (5 Typen) | SchadentypPicker.tsx:204-219; Phase3Schadentyp.tsx:34-44 | Config-Feld `schadentyp` (toggle-cards) — Seed 194358:21 | ✓ vorhanden |
| Schadentyp-Freitext (bei sonstiges) | SchadentypPicker.tsx:238-246 | Config-Feld `schadentyp_freitext` (conditional schadentyp=sonstiges) — Seed 194358:22 | ✓ vorhanden |
| unfallort_kategorie aus schadentyp ableiten | SchadentypPicker/actions saveSchadentyp | Derive-Hook: `unfallort_kategorie` aus `schadentyp` (nur wenn leer) — derive-dispatch-felder.ts:46-50 | ✓ vorhanden |
| Dispatch-Hinweise je Typ (MA-Text/Kundenbeispiel) | SchadentypPicker.tsx:221-236 | ⊘ statisches Begleit-Label (kein interaktives Control / kein Datum) | ⊘ bewusst weggelassen (statisch) |
| Schadentyp Clear-Button | SchadentypPicker.tsx:191-201 | Config-Feld kann auf "" gesetzt/leer gespeichert werden (Autosave coerced "" -> null, dispatch-lead-felder.ts:47) | ✓ vorhanden (gleichwertig) |
| **Parkplatz-Kamera-Check (Ja/Nein -> `parkplatz_kamera`)** | SchadentypPicker.tsx:249-262 (handleKameraClick:174-179); Phase4Stammdaten.tsx:1121-1147 (saveParkplatzKamera:407-419) | **KEIN Config-Feld, KEIN Panel, KEIN Override, NICHT im Derive-Hook** (Derive nur polizeibericht_pflicht + unfallort_kategorie — derive-dispatch-felder.ts:38-52). `parkplatz_kamera` wird von qualification-engine.ts (q6) + convert-lead-to-claim.ts gelesen (load-bearing) | ⚠️ NEUE LÜCKE |

> Hinweis: Die *Auto-Disqualifikation* bei Parkplatz-ohne-Kamera ist laut Derive-Hook
> `derive-dispatch-felder.ts:13-15` BEWUSST nicht repliziert (-> manuelles Flag). Das **Erfassen**
> des `parkplatz_kamera`-Werts selbst (den Kanzlei/SV zum Anschreiben des Kamera-Betreibers braucht,
> SchadentypPicker.tsx:259) ist dadurch NICHT abgedeckt — der Dispatcher kann den Wert in v2 nirgends setzen.

---

## D · Phase 4 — Stammdaten (`_phases/Phase4Stammdaten.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| BKAT-KI-Klassifikation-Panel | Phase4Stammdaten.tsx:468-472 -> BkatAnalysePanel.tsx:48 | Section-Panel `schaden`, reuse BkatAnalysePanel | ➕ dieser Plan (★2) |
| Schadenbeschreibung Fahrzeug + "Kunde hat Unfallfotos"-Scroll | Phase4Stammdaten.tsx:477-524 | Config-Feld `fahrzeugschaden_beschreibung` (textarea) — Seed 194358:25; Unfallfoto-Anforderung via DokumenteAnfordernCard (DispatchLeadForm.tsx:202-214) | ✓ vorhanden |
| Kundenadresse (Place-Autocomplete, kunde_lat/lng) | Phase4Stammdaten.tsx:531-568 | Config-Felder kunde_strasse/plz/stadt (Sektion kontakt, Seed 194358:16-18). ⚠ Geocoding (kunde_lat/lng) — siehe ❓ unten | ✓ teilweise (siehe ❓) |
| Baujahr (Inline, transform) | Phase4Stammdaten.tsx:578-588 | Config-Feld `fahrzeug_baujahr` (number) — Seed 194358:49 | ✓ vorhanden |
| Kennzeichen (Parts-Editor) | Phase4Stammdaten.tsx:277-323, 591 | Field-Override `kennzeichen` -> DispatchKennzeichenField (KennzeichenPartsInput) — overrides.tsx:57-59 | ✓ vorhanden |
| Marke (CarQuery-Datalist + Freitext) | Phase4Stammdaten.tsx:596-635 | Config-Feld `fahrzeug_hersteller` (text) — Seed 194358:47. (CarQuery-Datalist = Komfort, kein Datum) | ✓ vorhanden (Datalist ⊘ Komfort) |
| Modell (CarQuery-Datalist) | Phase4Stammdaten.tsx:638-663 | Config-Feld `fahrzeug_modell` (text) — Seed 194358:48 | ✓ vorhanden |
| **Lackfarbe (Dropdown LACKFARBE_OPTIONS) + Live-Fahrzeug-Render-Preview** | Phase4Stammdaten.tsx:665-705 (FahrzeugRenderImage:697) | `fahrzeug_farbe` (Lack-Detail-Freitext) ist Config-Feld (Seed 194358:53); **`lackfarbe_code`-Dropdown + FahrzeugRenderImage-Preview haben KEIN v2-Pendant** (kein Config-Feld, kein Panel; grep `_v2` für LACKFARBE_OPTIONS/FahrzeugRenderImage = 0) | ❓ unsicher (Preview kosmetisch; `lackfarbe_code` als Datenfeld fehlt) |
| Lack-Detail (Freitext) | Phase4Stammdaten.tsx:685-691 | Config-Feld `fahrzeug_farbe` (text) — Seed 194358:53 | ✓ vorhanden |
| FIN / HSN / TSN (Inline, transform) | Phase4Stammdaten.tsx:714-746 | Config-Felder `fin`/`hsn`/`tsn` (text) — Seed 194358:50-52 | ✓ vorhanden |
| **Eigentümer-Typ (Privat / Leasing / Gewerblich -> `finanzierung_leasing` + `vorsteuerabzugsberechtigt`) + Kontext-Hilfeboxen** | Phase4Stammdaten.tsx:753-865 | **KEIN Config-Feld, KEIN Panel, KEIN Override** (Seed 194358 enthält weder `finanzierung_leasing` noch `vorsteuerabzugsberechtigt`; grep beide = 0 in v2). Beide werden von convert-lead-to-claim.ts / lead-fall-mapping.ts / kanzlei/push-mandat.ts gelesen (load-bearing: Brutto/Netto-Regulierung + Leasing-Vollmacht) | ⚠️ NEUE LÜCKE |
| Vorschäden bekannt (Ja/Nein) | Phase4Stammdaten.tsx:868-889 | Config-Feld `hat_vorschaeden` (segmented) — Seed 194358:32 | ✓ vorhanden |
| Vorschäden-Beschreibung (LeadSchemaFields, conditional) | Phase4Stammdaten.tsx:892-896 | Config-Feld `vorschaeden_beschreibung` (conditional hat_vorschaeden=true) — Seed 194358:33 | ✓ vorhanden |
| Halter-Block: "Gleich wie Kunde"-Toggle (`ist_fahrzeughalter`) | Phase4Stammdaten.tsx:941-971 | Config-Feld `ist_fahrzeughalter` (segmented) — Seed 194358:55 | ✓ vorhanden (siehe ❓ Auto-Fill) |
| Halter-Felder (Vorname/Nachname/Geburtsdatum/Straße/PLZ/Stadt) | Phase4Stammdaten.tsx:978-984 (LeadSchemaFields block halter) | Config-Felder halter_* (conditional ist_fahrzeughalter=false) — Seed 194358:56-61 | ✓ vorhanden |
| Halter≠Anrufer Warn-Badges / Abweichungs-Hinweis | Phase4Stammdaten.tsx:913-939, 991-1000 | ⊘ informativer Hinweis (Daten via halter_*-Felder vorhanden) | ⊘ bewusst weggelassen (Hinweis) |
| Cardentity-Abruf (Button + Kosten-Bestätigung) | Phase4Stammdaten.tsx:1003-1019 (CardentityButton:1009) | Section-Panel `fahrzeug`, reuse CardentityButton | ➕ dieser Plan (★4) |
| Gegner-Kennzeichen (Freitext) | Phase4Stammdaten.tsx:1028-1035 | Config-Feld `gegner_kennzeichen` (text, Sektion unfall) — Seed 194358:39 | ✓ vorhanden (Wert) |
| **Gegner-KZ Live-Flags: Fahrerflucht-/Auslandskennzeichen-Warnung + Schritt-Listen** | Phase4Stammdaten.tsx:1036-1120 (checkKZFlags:375) | ⊘ informative Hinweis-Boxen (gegner_kennzeichen-Wert wird via Config-Feld erfasst; fahrerflucht/auslandskennzeichen sind abgeleitete Flags). grep `_v2` checkKZFlags = 0 | ⊘ bewusst weggelassen (Hinweis) — ABER siehe Grüne-Karte-Zeile |
| **Grüne-Karte-Reminder bei Auslandskennzeichen (`setGrueneKarteAngefragt` -> 10-Tage-Task)** | Phase4Stammdaten.tsx:1091-1103 | **KEIN v2-Pendant** (kein Config-Feld, kein Panel; grep `_v2` setGrueneKarteAngefragt/gegner_versicherung_anfrage_datum = 0). Echte Aktion (legt KB-Reminder-Task an), kein bloßer Hinweis | ❓ unsicher (Funktion, aber Nische/Auslandskennzeichen) |
| Parkplatz-Kamera-Check (Dup aus Phase 3) | Phase4Stammdaten.tsx:1121-1147 | siehe Phase-3-Zeile | ⚠️ NEUE LÜCKE (siehe C) |
| Gegner-Versicherung (Autocomplete VS-Stammdaten) | Phase4Stammdaten.tsx:1150-1154 (VersicherungField:200) | Field-Override `gegner_versicherung` -> DispatchVersichererField — overrides.tsx:46-48 | ✓ vorhanden |
| Gegner-Schadennummer (LeadSchemaFields block gegner) | Phase4Stammdaten.tsx:1156-1160 | Config-Feld `gegner_schadennummer` (text) — Seed 194358:41 | ✓ vorhanden |
| Zeugen vorhanden (Ja/Nein) | Phase4Stammdaten.tsx:1174-1193 | Config-Feld `zeugen` (segmented) — Seed 194358:44 | ✓ vorhanden |
| Zeugen-Kontakte-Editor (bei zeugen=true) | Phase4Stammdaten.tsx:1195-1200 (ZeugenKontakteEditor) | Section-Panel `unfall` (conditional zeugen=true) — dispatch-section-panels.tsx:44-52 | ✓ vorhanden |
| Pflichtfeld-Warnungen q6/q7 | Phase4Stammdaten.tsx:1203-1217 | Vollständigkeits-Indikator (DispatchGatesPanel.tsx:71-103, Q_LABELS q6/q7) | ✓ vorhanden (gleichwertig) |

> Hinweis Gegner-Versicherungsnummer: `gegner_versicherungsnummer` ist in Phase4 nur als
> Typ deklariert (Phase4Stammdaten.tsx:116), aber NICHT als Eingabe-Control gerendert -> keine
> Legacy-Funktion, kein Gap.

---

## E · Phase 5 — Zusammenfassung + FlowLink-Versand (`_phases/Phase5Zusammenfassung.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| Summary-Zeilen mit ✏️-Sprung-zu-Phase | Phase5Zusammenfassung.tsx:225-360 | Erfassungs-Checkliste (DispatchChecklistPanel.tsx) + Vollständigkeit (GatesPanel); kein Phasen-Sprung | ✓/⊘ Inhalt vorhanden, Phasen-Sprung weggelassen |
| WA-Nummer inline edit vor Versand | Phase5Zusammenfassung.tsx:375-386 | Config-Feld `telefon` (Sektion kontakt) — Seed 194358:12 | ✓ vorhanden |
| E-Mail inline edit + SV-Email-Warnung | Phase5Zusammenfassung.tsx:388-411 (checkEmailIsSv) | Config-Feld `email` — Seed 194358:13. ❓ SV-Email-Kollisions-Warnung (checkEmailIsSv) hat kein v2-Pendant | ✓ Feld vorhanden (SV-Warnung siehe ❓) |
| Unfallskizze (KI-Bild) generieren/freigeben/bearbeiten | Phase5Zusammenfassung.tsx:434-440 -> UnfallskizzeCard.tsx:18 | Section-Panel `unfall` -> UnfallskizzeCard — dispatch-section-panels.tsx:33-41 | ✓ vorhanden |
| FlowLink-Versand 3 Kanäle (WA/SMS/Email) | Phase5Zusammenfassung.tsx:451-496 (sendFlowLinkMultiChannel) | DispatchFlowlinkPanel.tsx:35-171 (sendFlowLinkMultiChannel) — DispatchLeadForm.tsx:218 | ✓ vorhanden (P2g) |
| Versand-blockiert-Toast (fehlende Felder) | Phase5Zusammenfassung.tsx:152-167 | Server-Action validiert + meldet; GatesPanel zeigt Offene. Nicht-blockierend per Design | ✓ vorhanden (nicht-blockierend) |
| Kasko-Soft-Gate-Hinweis (schuldfrage=unklar) | Phase5Zusammenfassung.tsx:310-324 | Warn-Badge im GatesPanel (eigenverschulden/kein-schaden) — DispatchGatesPanel.tsx:59-67. (unklar-spezifischer Hinweis nicht 1:1) | ✓ weitgehend (siehe ❓ unten optional) |

---

## F · Phase 6 — Status-Tracking (`_phases/Phase6StatusTracking.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| FlowLink-Stepper (gesendet/angekommen/geöffnet/SA/Vollmacht) | Phase6StatusTracking.tsx:89-148, 239-278 | DispatchStatusPanel.tsx:69-187 — DispatchLeadForm.tsx:222 | ✓ vorhanden (P2h) |
| Inaktiv-Alarm (>2h) + Anruf-Buttons | Phase6StatusTracking.tsx:76-82, 200-217 | DispatchStatusPanel.tsx:53-60, 111-127 (PhoneButton) | ✓ vorhanden |
| Auto-Refresh 30s + manueller Refresh | Phase6StatusTracking.tsx:155-162, 226-234 | DispatchStatusPanel.tsx:62-67, 133-141 | ✓ vorhanden |
| FlowLink erneut senden (3 Kanäle) | Phase6StatusTracking.tsx:280-337 | DispatchFlowlinkPanel (sendet auch erneut) — Status-Panel verweist bewusst dorthin (DispatchStatusPanel.tsx:5-7) | ✓ vorhanden (entdoppelt) |

---

## G · Sidebar (`_sidebar/SidebarStubs.tsx` + `KundenMatchCard.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| Gesprächsleitfaden-Timer (Start/Beenden/Zusammenfassung) | SidebarStubs.tsx:26-41 (TimerWidget) -> GespraechsleitfadenTimer.tsx | DispatchSidebar -> GespraechsleitfadenTimer (reuse) | ➕ dieser Plan |
| Disqualifizieren-Modal (strukturierter Grund + Timeline) | SidebarStubs.tsx:54-153 (disqualifiziereLead) | Manuelles `disqualifiziert`-Flag + Grund (GatesPanel + Config-Felder disqualifiziert/disqualifiziert_grund Seed 194358:71-72) | ⊘ bewusst weggelassen (Modal -> Flag) |
| KundenMatch-Card (bestehender Kunde verknüpfen/lösen) | SidebarStubs.tsx:153 ref + KundenMatchCard.tsx:22 | DispatchSidebar -> KundenMatchCard (reuse) | ➕ dieser Plan |
| Rückruftermin-Panel (Termin/erledigen/Historie) | SidebarStubs.tsx:155-174 (RueckrufButton) -> RueckrufTerminPanel.tsx | DispatchSidebar -> RueckrufTerminPanel (reuse) | ➕ dieser Plan |
| Termin-Liste zum Lead (TerminListeClient) | SidebarStubs.tsx:180-210 (TerminListeSidebar) | DispatchSidebar -> TerminListeClient (reuse) | ➕ dieser Plan |
| Gesprächshilfe (Opener/Folge/Closing pro Phase) | SidebarStubs.tsx:278-348 (GespraechshilfePanel) | DispatchGespraechshilfe (de-phase-context, alle Sektionen, flag-Closings) | ➕ dieser Plan |
| Einwand-Karten (phasen-gefiltert) | SidebarStubs.tsx:405-440 (EinwandKarten) | DispatchEinwandKarten (alle Karten) | ➕ dieser Plan |

---

## H · Phasen-Maschinerie / Provider (`PhaseHeader.tsx`, `PhaseContent.tsx`, `phase-context.tsx`)

| Funktion | Legacy-Ort (file:line) | v2-Heimat | Status |
|---|---|---|---|
| Phasen-Stepper (6 Steps, klickbar, Bottom-Sheet mobil) | PhaseHeader.tsx:60-181 | ⊘ flacher all-sections-Form | ⊘ bewusst weggelassen |
| initialPhase-Ableitung | page.tsx:217-223 | ⊘ kein Phasen-Konzept in v2 | ⊘ bewusst weggelassen |
| Disqualifiziert-Overlay (ExitSkript statt Phase) | PhaseContent.tsx:34-51 | ⊘ ExitSkript-Inhalt in Gesprächshilfe-Sektion (★3); Disq = Flag | ⊘ bewusst weggelassen |
| SA-Konversions-Banner | DispatchShell.tsx:123-140 | DispatchSaBanner.tsx (DispatchLeadForm.tsx:137) | ✓ vorhanden (3a) |
| Phasen-Realtime-Provider (leads-Row-Sync, patchLead) | phase-context.tsx:50-144 | v2 Autosave + router.refresh in Panels; keine optimistic phase-context-Schicht (Felder self-saven) | ⊘ bewusst weggelassen (Architektur) |

---

## Confirm-Items (Plan §2 "bereits in v2 — zu verifizieren")

### 1) Unfallskizze (KI-Bild) — sichtbar + bedienbar als `unfall`-Section-Panel
**Bestätigt ✓.** `dispatch-section-panels.tsx:32-54` rendert für phase_key `unfall` **unbedingt** eine
`<UnfallskizzeCard>` (key="unfallskizze") mit `unfallhergang`/`unfallskizze_svg`/`unfallskizze_bestaetigt`/
`unfallskizze_generiert_am` aus dem Lead. `unfall` ist als Panel-Sektion registriert
(`dispatch-section-panel-keys.ts:9`), und `DispatchLeadForm.tsx:189-190` ruft
`renderDispatchSectionPanels(phase.phase_key, …)` nach den Feldern jeder Sektion auf. Die Card selbst
(`UnfallskizzeCard.tsx:41-203`) bietet generieren / freigeben / bearbeiten (Editor) / neu generieren /
verwerfen — voll bedienbar, kein Phasen-Kontext nötig.

### 2) Termin-Buchung — `SvDispatchPanel` schreibt `gutachter_termine` via shared sv-termin-Actions
**Bestätigt ✓.** v2 rendert `SvDispatchPanel` über den `termin`-Field-Override
(`dispatch-field-overrides.tsx:35-44`, key `termin` in `dispatch-field-override-keys.ts:7`).
`SvDispatchPanel` (importiert via overrides.tsx:11) nutzt die geteilten Actions in
`_actions/sv-termin.ts`: `reserveSvTerminForLead` INSERT auf `gutachter_termine`
(sv-termin.ts:217-228), `cancelSvTerminForLead` UPDATE status=storniert (sv-termin.ts:345-349),
`acceptGegenvorschlag` UPDATE status=bestaetigt (sv-termin.ts:421-429). Identische Actions wie der
Legacy-Pfad (Phase2TerminServiceTyp.tsx:252 rendert dasselbe SvDispatchPanel) -> erbt automatisch die
aktuelle Termin-Engine. `page.tsx:39-76` lädt den `aktiverSvTermin` EINMAL (vor dem ?v2-Branch) und
reicht ihn an beide Pfade (DRY). **Hinweis:** Doppel-Edits an `_actions/sv-termin.ts` mit den
parallelen Termin-Engine-Sessions vermeiden (Plan §Task 10) — reine Koordinationsnotiz, kein Gap.

### 3) Flowlink-Versand — `DispatchFlowlinkPanel` lädt jüngste Links / sendet / zeigt Status
**Bestätigt ✓.** `page.tsx:90-106` lädt im ?v2-Zweig die jüngsten 5 `flow_links`
(`erstellt_am`->`created_at`-Alias) via Admin-Client und reicht sie an `DispatchLeadForm`
(page.tsx:130). `DispatchFlowlinkPanel.tsx:35-171` sendet via `sendFlowLinkMultiChannel(leadId, kanal)`
(Zeile 16, 53), zeigt Telefon-/Email-fehlt-Warnungen (94-107), den letzten Link + Portal-Öffnen-Link +
"zu Fall konvertiert" (155-168), und den Latest-Status-Badge (76-87). Nicht-blockierend per Design
(Server-Action validiert kanal-spezifische Pflichtdaten). Sauber, kein toter Pfad.

---

## Gate-Verdikt

### ⚠️ NEUE LÜCKEN (interaktive Dispatcher-Funktion ohne v2-Heimat, NICHT auf der "bewusst-weggelassen"-Liste)

1. **Eigentümer-Typ / Steuer-Status (`finanzierung_leasing` + `vorsteuerabzugsberechtigt`)**
   - Legacy: `Phase4Stammdaten.tsx:753-865` (3-Button-Toggle Privat/Leasing/Gewerblich + Kontext-Hilfeboxen).
   - v2: keine — beide Spalten fehlen im Seed (`20260601194358`), kein Panel/Override (grep beide Keys in `_v2/` = 0).
   - Load-bearing: gelesen von `lib/leads/convert-lead-to-claim.ts`, `lib/lead-fall-mapping.ts`, `lib/kanzlei/push-mandat.ts`, `lib/kanzlei/email-fallback.ts` (Brutto/Netto-Regulierung + Leasing-Vollmacht-Pflicht).
   - Nicht auf der ⊘-Liste (Spec §7 / Plan Task-0 Step-2: nur Disq-Modal, Stepper, initialPhase, ExitSkript-Overlay).

2. **Parkplatz-Kamera-Erfassung (`parkplatz_kamera` setzen)**
   - Legacy: `SchadentypPicker.tsx:249-262` + `Phase4Stammdaten.tsx:1121-1147` (Ja/Nein-Buttons -> `saveParkplatzKamera`).
   - v2: keine — kein Config-Feld, kein Panel/Override, NICHT im Derive-Hook (`derive-dispatch-felder.ts:38-52` macht nur polizeibericht_pflicht + unfallort_kategorie).
   - Load-bearing: gelesen von `_lib/qualification-engine.ts` (q6) + `lib/leads/convert-lead-to-claim.ts`.
   - Abgrenzung: nur die *Auto-Disqualifikation* bei Parkplatz-ohne-Kamera ist bewusst weg (`derive-dispatch-felder.ts:13-15`); das *Erfassen* des Werts (für Kamera-Betreiber-Anschreiben durch Kanzlei/SV) ist es nicht.

### ❓ Unsichere Punkte (markiert, brauchen Adjudikation)

3. **Grüne-Karte-Reminder bei Auslandskennzeichen (`setGrueneKarteAngefragt`)** — Phase4Stammdaten.tsx:1091-1103.
   Echte Aktion (legt 10-Tage-KB-Reminder-Task an + setzt `gegner_versicherung_anfrage_datum`), kein bloßer Hinweis.
   Kein v2-Pendant (grep `_v2` = 0). Nische (nur Auslandskennzeichen-Fälle). Gap ODER akzeptierte Auslassung? -> Aaron.

4. **`lackfarbe_code`-Dropdown + Live-Fahrzeug-Render-Preview (FahrzeugRenderImage)** — Phase4Stammdaten.tsx:665-705.
   `fahrzeug_farbe` (Lack-Detail-Freitext) IST ein Config-Feld; aber das strukturierte `lackfarbe_code`
   (LACKFARBE_OPTIONS, von FahrzeugRenderImage zum imagin-Rendering genutzt) fehlt in v2. Preview ist
   kosmetisch; `lackfarbe_code` als Datenfeld könnte relevant sein wenn ein Consumer es liest. -> Aaron.

5. **SV-Email-Kollisions-Warnung (`checkEmailIsSv`)** — Phase5Zusammenfassung.tsx:125-141, 403-410.
   Warnt wenn die Kunden-Email bereits einem SV-Account gehört (FlowLink würde Zweit-Account anlegen).
   Kein v2-Pendant. Sicherheits-/Daten-Hygiene-Hinweis, kein Pflichtfeld. -> Aaron (vermutlich Minor).

6. **Kundenadresse-Geocoding (`kunde_lat`/`kunde_lng`)** — Phase4Stammdaten.tsx:536-559 (GooglePlaceAutocomplete
   schreibt kunde_lat/lng als letzter SV-Matching-Fallback). v2 hat `kunde_strasse/plz/stadt` als reine
   Text-Config-Felder (kein Place-Override für die Kundenadresse -> keine Koordinaten). SV-Matching nutzt
   primär Besichtigungsort/Fahrzeug-Standort/Unfallort (sv-termin.ts:128-129), Kunde ist nur Notnagel -> Impact
   wahrscheinlich gering. -> Aaron (Minor / evtl. bewusst).

### ⊘ Bewusst weggelassen (bestätigt, keine Lücke)
Phasen-Stepper/PhaseHeader · initialPhase · ExitSkript-als-Overlay (Inhalt -> Gesprächshilfe-Sektion ★3) ·
Disqualifizieren-Modal (-> GatesPanel-Flag) · Phasen-Sprung-Buttons · phase-context-Realtime-Provider ·
statische Dispatch-Hinweise (SchadentypPicker) · Gegner-KZ-Warn-Boxen (Hinweise; Wert via Feld) ·
Halter≠Anrufer-Hinweis.

---

## Gate-Resolution (Aaron, 2026-06-03 — Option 1)

Aaron-Entscheid nach dem Task-0-Stopp: **beide bestätigten Lücken jetzt in P2d-4 schließen**
(Cutover-Prinzip „keine Funktion verlieren"; beide Spalten existieren bereits -> reines Frontend,
keine Migration). Die 4 ❓ werden bewusst nach P3b verschoben.

| Lücke | Entscheid | Umsetzung |
|---|---|---|
| Eigentümer-Typ (`finanzierung_leasing` + `vorsteuerabzugsberechtigt`) | ➕ P2d-4 NEU (Task 6b) — **inkl. VAT** | 3-Wege-Panel Privat/Leasing/Gewerblich im `fahrzeug`-Section-Panel, `saveStammdaten` (allowlisted). VAT bewusst MIT: der 3-Wege-Selector koppelt beide Booleans, Netto/Brutto + Leasing-Vollmacht früh (vor FlowLink) gebraucht. |
| Parkplatz-Kamera (`parkplatz_kamera`) | ➕ P2d-4 NEU (Task 5b) | Bedingter Ja/Nein-Toggle im `schaden`-Section-Panel (wenn schadentyp=Parkplatz), bestehende schadentyp-Action. |
| ❓3 Grüne-Karte-Reminder | ⊘ -> P3b | Reminder/Notification, kein Form-Feld. „vor P3b-Cutover schließen-oder-bewusst-droppen". |
| ❓4 `lackfarbe_code` + imagin-Preview | ⊘ -> P3b | imagin gated bis Freischaltung; `fahrzeug_farbe`-Freitext deckt das Nötigste. |
| ❓5 `checkEmailIsSv`-Warnung | ⊘ -> P3b | Edge/Polish (Daten-Hygiene-Hinweis). |
| ❓6 Kundenadresse-Geocoding `kunde_lat/lng` | ⊘ -> P3b | Edge/Polish; SV-Match nutzt es nur als Fallback. |

## Fazit

**NEUE LÜCKEN: 2 bestätigt -> beide in P2d-4 aufgenommen (Task 5b + 6b, Aaron Option 1, 6b inkl. VAT).**
4 ❓ -> bewusst nach P3b verschoben (oben dokumentiert). Gate aufgelöst -> Doku committet.
