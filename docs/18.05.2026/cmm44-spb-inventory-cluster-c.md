# CMM-44 SP-B PR2c — Call-Site-Inventur Cluster c (Mietwagen/Unfall-Rest)

**Datum:** 18.05.2026
**Branch:** kitta/cmm-44-spb-pr2c-mietwagen-rest
**Spalten:** 24 (Mietwagen, Unfall-Rest, Fahrzeug-Schaden, Abrechnungsart, Reminder, Einzel)

---

## Legende

- **A** = `from('faelle').select(only SP-B cols)` → Source-Switch auf `claims`
- **B** = `from('faelle').select(SP-B + non-SP-B cols)` → SP-B-Spalte in `claims`-Embed
- **C** = `from('faelle').update/insert({SP-B col})` → MOVE auf `claims`, entfernen aus faelle
- **D** = Nested `faelle(...)` aus anderer Tabelle → SP-B-Spalte in `claims`-Embed
- **E** = View-Read (`v_claim_full` / `v_claim_listing` / `v_faelle_mit_aktuellem_termin`) → kein Change
- **F** = TS-Type / JSX / Property-Access (kein DB-Aufruf) → kein Change

---

## Inventur pro Spalte

### mietwagen_seit_datum

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_tabs/UebersichtTab.tsx:265,280 | mietwagen_seit_datum | E (liest aus FallContext → v_faelle_mit_aktuellem_termin) |
| src/app/kunde/faelle/[id]/FallDetailSections.tsx:145 | mietwagen_seit_datum | E (fall-Objekt aus Seiten-Loader, view-basiert) |
| src/app/kunde/faelle/[id]/page.tsx:341,353 | mietwagen_seit_datum | B (from faelle, mixed cols) |
| src/components/admin/fallakte/mietwagen/MietwagenEditCard.tsx:18,37,45,52,71,182,183 | mietwagen_seit_datum | F (TS-Type + JSX-Props) |
| src/components/shared/mietwagen/MietwagenStatusCard.tsx:14,48,90,94 | mietwagen_seit_datum | F (TS-Prop + JSX-Render) |
| src/lib/mietwagen/actions.ts:13,41,46,49 | mietwagen_seit_datum | C (write) + B (check-read from faelle) |
| src/lib/mietwagen/cron.ts:16,49,69,71 | mietwagen_seit_datum | B (faelle select, mixed) |

### mietwagen_limit_tage

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_tabs/UebersichtTab.tsx:266,281 | mietwagen_limit_tage | E (view) |
| src/app/kunde/faelle/[id]/FallDetailSections.tsx:146 | mietwagen_limit_tage | E |
| src/app/kunde/faelle/[id]/page.tsx:341,355 | mietwagen_limit_tage | B |
| src/components/admin/fallakte/mietwagen/MietwagenEditCard.tsx:19,38,40,53,72,195,197 | mietwagen_limit_tage | F |
| src/components/shared/mietwagen/MietwagenStatusCard.tsx:15,49 | mietwagen_limit_tage | F |
| src/lib/mietwagen/actions.ts:14 | mietwagen_limit_tage | C (write via faellePatch) |
| src/lib/mietwagen/cron.ts:17,49,73 | mietwagen_limit_tage | B |

### mietwagen_limit_grund

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_tabs/UebersichtTab.tsx:267,282 | mietwagen_limit_grund | E |
| src/app/kunde/faelle/[id]/FallDetailSections.tsx:147 | mietwagen_limit_grund | E |
| src/components/admin/fallakte/mietwagen/MietwagenEditCard.tsx:20,39,54,73,223,224 | mietwagen_limit_grund | F |
| src/components/shared/mietwagen/MietwagenStatusCard.tsx:16,113,115 | mietwagen_limit_grund | F |
| src/lib/mietwagen/actions.ts:15 | mietwagen_limit_grund | C (write via faellePatch) |

### mietwagen_rechnung_vorhanden

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_tabs/UebersichtTab.tsx:268-269,283-284 | mietwagen_rechnung_vorhanden | E |
| src/app/kunde/faelle/[id]/FallDetailSections.tsx:148 | mietwagen_rechnung_vorhanden | E |
| src/app/kunde/faelle/[id]/page.tsx:341,356 | mietwagen_rechnung_vorhanden | B |
| src/components/admin/fallakte/mietwagen/MietwagenEditCard.tsx:21 | mietwagen_rechnung_vorhanden | F |
| src/components/shared/mietwagen/MietwagenStatusCard.tsx:17,141,146,150,156 | mietwagen_rechnung_vorhanden | F |
| src/lib/beleg-review/actions.ts:140 | mietwagen_rechnung_vorhanden | C (write to faelle → MOVE to claims) |
| src/lib/mietwagen/cron.ts:19,49,110 | mietwagen_rechnung_vorhanden | B |

### mietwagen_rechnung_url

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/lib/supabase/database.types.ts | mietwagen_rechnung_url | F (nur Typen, kein DB-Aufruf) |
| — | — | Kein aktiver faelle-Read/Write gefunden |

### mietwagen_argumentations_puffer

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_tabs/UebersichtTab.tsx:270-271,285-286 | mietwagen_argumentations_puffer | E |
| src/app/kunde/faelle/[id]/FallDetailSections.tsx:149 | mietwagen_argumentations_puffer | E |
| src/components/admin/fallakte/mietwagen/MietwagenEditCard.tsx:22,41,56,75,208,212 | mietwagen_argumentations_puffer | F |
| src/components/shared/mietwagen/MietwagenStatusCard.tsx:18,51 | mietwagen_argumentations_puffer | F |
| src/lib/mietwagen/actions.ts:17 | mietwagen_argumentations_puffer | C (write via faellePatch) |
| src/lib/mietwagen/cron.ts:18,49,74 | mietwagen_argumentations_puffer | B |

### mietwagen_vermieter

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_tabs/UebersichtTab.tsx:272,287 | mietwagen_vermieter | E |
| src/app/kunde/faelle/[id]/FallDetailSections.tsx:150 | mietwagen_vermieter | E |
| src/app/kunde/faelle/[id]/page.tsx:341,354 | mietwagen_vermieter | B |
| src/components/admin/fallakte/mietwagen/MietwagenEditCard.tsx:23,40,55,74,239,240 | mietwagen_vermieter | F |
| src/components/shared/mietwagen/MietwagenStatusCard.tsx:19,121,125 | mietwagen_vermieter | F |
| src/lib/mietwagen/actions.ts:16 | mietwagen_vermieter | C (write via faellePatch) |

### schadens_hoehe_netto

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/admin/finance/(hub)/offene-faelle/page.tsx:47 | schadens_hoehe_netto | B (faelle select, mixed) |
| src/app/api/cron/abrechnung-erstellen/route.ts:88 | schadens_hoehe_netto | B (faelle select, mixed) |
| src/app/api/cron/monatsabrechnung/route.ts:47 | schadens_hoehe_netto | E (from v_faelle_mit_aktuellem_termin) |
| src/app/api/ocr-gutachten/route.ts:148 | schadens_hoehe_netto | C (write to faelle → MOVE to claims) |
| src/app/api/seed-testdata/route.ts:424,443,460,477,517 | schadens_hoehe_netto | Out-of-scope (seed-testdata) |
| src/app/faelle/[id]/_actions/stammdaten.ts:103 | schadens_hoehe_netto | C (via splitOrKeepFaelleUpdate → add to CLAIM_OWNED) |
| src/app/faelle/[id]/_stammdaten/Sections.tsx:328 | schadens_hoehe_netto | F (Kommentar) |
| src/app/kunde/faelle/[id]/page.tsx:822 | schadens_hoehe_netto | E (fall von getFallForKunde via view) |
| src/components/kunde/SaeuleMeinGeld.tsx:15,38,43,44 | schadens_hoehe_netto | F (Props) |
| src/components/makler/akte-detail/MaklerAkteDetail.tsx:128 | schadens_hoehe_netto | F (fall-Prop) |
| src/components/makler/MaklerAktenList.tsx:205,242 | schadens_hoehe_netto | F (akte-Prop) |
| src/lib/abrechnung/process-case-billing.ts:28,37 | schadens_hoehe_netto | B (faelle select, mixed) |
| src/lib/abrechnung/reissue-abrechnung.ts:28,56 | schadens_hoehe_netto | B (faelle select, mixed) |

### schadens_ursache

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/admin/faelle/(hub)/FaelleKanban.tsx:20 | schadens_ursache | F (TS-Type) |
| src/app/admin/faelle/(hub)/page.tsx:248-249 | schadens_ursache | F (null-Literal in Mapping) |
| src/app/admin/faelle/anlegen/actions.ts:104 | schadens_ursache | C (faelle.insert — faelle behält Spalte für den Insert; claims bekommt via createClaimForFall) |
| src/app/admin/sachverstaendige/[id]/page.tsx:68 | schadens_ursache | E (v_faelle_mit_aktuellem_termin) |
| src/app/admin/statistiken/page.tsx:156 | schadens_ursache | E (v_claim_full) |
| src/app/api/admin/create-test-fall/route.ts:132 | schadens_ursache | Out-of-scope (create-test-fall) |
| src/app/api/email/send/route.ts:30,51 | schadens_ursache | B (faelle select, mixed) |
| src/app/api/pdf/kanzlei-paket/[id]/route.tsx:114 | schadens_ursache | B (faelle select('*') → add to claims embed) |
| src/app/api/sv-zuweisung/route.ts:301,336,346,391 | schadens_ursache | B (faelle select, mixed) |
| src/app/dispatch/sachverstaendige/[id]/page.tsx:44 | schadens_ursache | E (v_faelle_mit_aktuellem_termin) |
| src/app/faelle/[id]/_actions/stammdaten.ts:72 | schadens_ursache | C (via FALL_EDITABLE_FIELDS → splitOrKeepFaelleUpdate → add to CLAIM_OWNED) |
| src/app/flow/[token]/actions.ts:160 | schadens_ursache | A (faelle select, only SP-B + claim_id) |
| src/app/flow/[token]/actions.ts:168 | schadens_ursache | F (Property-Zugriff auf Ergebnis) |
| src/app/gutachter/auftraege/AuftragCard.tsx:32 | schadens_ursache | F (TS-Type) |
| src/app/gutachter/auftraege/export-action.ts:133,182 | schadens_ursache | B (faelle select, mixed) |
| src/app/gutachter/auftraege/page.tsx:80,197,219 | schadens_ursache | B (faelle select, mixed) |
| src/app/gutachter/faelle/page.tsx:105,191 | schadens_ursache | B (faelle select, only SP-B + not-SP-B) |
| src/components/fall/StammdatenDetail.tsx:336 | schadens_ursache | F (Property-Zugriff) |
| src/lib/claims/create-for-fall.ts:100-102 | schadens_ursache | C (claims.insert: Kommentar sagt faelle-only, aber SP-B → hinzufügen) |
| src/lib/lead-fall-mapping.ts:131 | schadens_ursache | F (Mapping-Array) |

### zeugen_vorhanden

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_actions/dokumente.ts:105 | zeugen_vorhanden | B (faelle select, mixed) |
| src/app/kunde/onboarding/actions.ts:208 | zeugen_vorhanden | B (faelle select, mixed) |
| src/app/kunde/onboarding/actions.ts:220 | zeugen_vorhanden | leads-Read — nicht SP-B |
| src/lib/ai/briefing-fallback.ts:63 | zeugen_vorhanden | F (Property-Zugriff) |
| src/lib/ai/briefing-prompt.ts:49,121 | zeugen_vorhanden | F (TS-Type + Property-Zugriff) |
| src/lib/dokumente/erwartung.ts:36,127,133 | zeugen_vorhanden | F (TS-Type + Property-Zugriff) |
| src/lib/dokumente/erwartung.ts:241 | zeugen_vorhanden | B (faelle select, mixed) |
| src/lib/dokumente/erwartung.ts:280 | zeugen_vorhanden | leads-Read — nicht SP-B |
| src/lib/lead-fall-mapping.ts:150,152,154 | zeugen_vorhanden | F (Mapping + Kommentar) |

### bkat_unfallart

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/api/admin/test/cmm48-smoke/route.ts:90 | bkat_unfallart | F (Literal in Smoke-Test-Payload) |
| src/app/dispatch/leads/[id]/_actions/bkat-inference.ts:19,95 | bkat_unfallart | leads-Write — nicht SP-B |
| src/app/dispatch/leads/[id]/_phases/BkatAnalysePanel.tsx:64 | bkat_unfallart | F (Kommentar) |
| src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:125 | bkat_unfallart | leads-Prop — nicht SP-B |
| src/app/gutachter/termine/[id]/actions.ts:395 | bkat_unfallart | F (Kommentar) |
| src/lib/ai/models.ts:91 | bkat_unfallart | F (Kommentar) |
| src/lib/bkat/auto-trigger.ts:48,58 | bkat_unfallart | leads-Write — nicht SP-B |
| src/lib/bkat/inference.ts:13,145,169 | bkat_unfallart | F/leads-Kontext — nicht SP-B |
| src/lib/bkat/lookup.ts:10,85 | bkat_unfallart | F (Enum-Typ + Mapping) |
| src/lib/claims/create-for-fall.ts:100-102 | bkat_unfallart | F (Kommentar: claims.bkat_unfallart gedroppt, kein aktiver Write) |
| src/lib/claims/get-claim-for-role.ts:103-105 | bkat_unfallart | F (Kommentar: gedroppt) |
| src/lib/lead-fall-mapping.ts:131 | bkat_unfallart | F (Mapping-Array) |
| **KEIN aktiver faelle-Read/Write** | | Nur leads.bkat_unfallart ist aktiv; claims.bkat_unfallart war gedroppt; kein Change nötig |

### werkstatt_seit_datum

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/dispatch/leads/[id]/_actions/stammdaten.ts:44 | werkstatt_seit_datum | leads-Allowlist — nicht SP-B |
| src/app/faelle/[id]/_actions/stammdaten.ts:136 | werkstatt_seit_datum | C (via FALL_EDITABLE_FIELDS → splitOrKeepFaelleUpdate → add to CLAIM_OWNED) |
| src/app/flow/[token]/onboarding-extra-actions.ts:22 | werkstatt_seit_datum | C (write → check ob faelle oder claims) |
| src/lib/lead-fall-mapping.ts:94 | werkstatt_seit_datum | F (Mapping-Array) |
| src/lib/stammdaten/schema.ts:162,164 | werkstatt_seit_datum | F (Schema-Definition, Property-Zugriff) |

### fahrzeug_fahrbereit

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/dispatch/leads/[id]/_actions/hard-gate.ts:73 | fahrzeug_fahrbereit | leads-Write — nicht SP-B |
| src/app/dispatch/leads/[id]/_actions/types.ts:41 | fahrzeug_fahrbereit | F (TS-Type) |
| src/app/dispatch/leads/[id]/_lib/qualification-engine.ts:41,130 | fahrzeug_fahrbereit | F (leads-basiert) |
| src/app/dispatch/leads/[id]/_phases/Phase1Qualifizierung.tsx:82,200,310,355,562,563,565 | fahrzeug_fahrbereit | F (leads-Prop) |
| src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:79 | fahrzeug_fahrbereit | F (leads-Prop) |
| src/app/dispatch/leads/[id]/_phases/Phase5Zusammenfassung.tsx:38,162,209,287 | fahrzeug_fahrbereit | F (leads-Prop) |
| src/app/faelle/[id]/_actions/stammdaten.ts:113 | fahrzeug_fahrbereit | C (via FALL_EDITABLE_FIELDS → splitOrKeepFaelleUpdate → add to CLAIM_OWNED) |
| src/app/faelle/[id]/_stammdaten/Sections.tsx:233,235,273 | fahrzeug_fahrbereit | E (FallContext → view) |
| src/app/flow/[token]/FlowWizardKfz.tsx:60 | fahrzeug_fahrbereit | F (TS-Type) |
| src/app/flow/[token]/page.tsx:269 | fahrzeug_fahrbereit | F (Property-Zugriff auf lead) |
| src/components/fall/StammdatenAccordion.tsx:87,89 | fahrzeug_fahrbereit | F (Property-Zugriff) |
| src/components/fall/StammdatenDetail.tsx:147,390 | fahrzeug_fahrbereit | F (Property-Zugriff) |

### fahrzeugschaden_beschreibung

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/dispatch/leads/[id]/_actions/dokumente-anfordern.ts:23 | fahrzeugschaden_beschreibung | F (Kommentar) |
| src/app/dispatch/leads/[id]/_actions/stammdaten.ts:78 | fahrzeugschaden_beschreibung | leads-Allowlist — nicht SP-B |
| src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:85,675,676 | fahrzeugschaden_beschreibung | F (leads-Prop) |
| src/app/faelle/[id]/_actions/stammdaten.ts:79 | fahrzeugschaden_beschreibung | C (via FALL_EDITABLE_FIELDS → splitOrKeepFaelleUpdate → add to CLAIM_OWNED) |
| src/components/fall/StammdatenDetail.tsx:389 | fahrzeugschaden_beschreibung | F (Property-Zugriff) |
| src/lib/ai/vision/analyze-unfallfotos.ts:42,69 | fahrzeugschaden_beschreibung | B/C (leads-Read/Write — nicht SP-B) |
| src/lib/claims/create-for-fall.ts:33,97 | fahrzeugschaden_beschreibung | C (claims.insert: wird als hergang_kunde_text gemappt — kein eigenständiger Write von fahrzeugschaden_beschreibung auf claims) |
| src/lib/flow/fehlende-felder.ts:43 | fahrzeugschaden_beschreibung | F (TS-Type) |
| src/lib/lead-fall-mapping.ts:132 | fahrzeugschaden_beschreibung | F (Mapping-Array) |
| src/lib/leads/convert-lead-to-claim.ts:181 | fahrzeugschaden_beschreibung | F (Lese-Zugriff auf lead-Daten) |
| src/lib/stammdaten/schema.ts:226 | fahrzeugschaden_beschreibung | F (Schema-Definition) |

### abrechnungsart_besprochen

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/gutachter/fall/[id]/abrechnungsart-actions.ts:48,49,50 | abrechnungsart_besprochen + _notiz + _am | C (write to faelle → MOVE to claims) |
| src/app/gutachter/fall/[id]/_components/AbrechnungsartCard.tsx:37,39,49,50,52 | abrechnungsart_besprochen | E (fall-Prop aus getFallForSv → view) |

### abrechnungsart_notiz

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/gutachter/fall/[id]/abrechnungsart-actions.ts:49 | abrechnungsart_notiz | C (write → MOVE to claims) |
| src/app/gutachter/fall/[id]/_components/AbrechnungsartCard.tsx:38,50,71 | abrechnungsart_notiz | E |

### abrechnungsart_besprochen_am

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/gutachter/fall/[id]/abrechnungsart-actions.ts:50 | abrechnungsart_besprochen_am | C (write → MOVE to claims) |
| src/app/gutachter/fall/[id]/_components/AbrechnungsartCard.tsx:39,52 | abrechnungsart_besprochen_am | E |

### unfallmitteilung_status

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/lib/supabase/database.types.ts | unfallmitteilung_status | F (nur Typen) |
| **Kein aktiver faelle-Read/Write in src/** | | — |

### dokumente_vollstaendig_fuer_phase

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/api/cron/pflichtdokumente-reminder/route.ts:33 | dokumente_vollstaendig_fuer_phase | E (from v_claim_full) |
| src/app/api/cron/pflichtdokumente-reminder/route.ts:132,136 | dokumente_vollstaendig_fuer_phase | C (write to faelle → MOVE to claims) |

### dokumente_vollstaendig_am_phase

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/api/cron/pflichtdokumente-reminder/route.ts:137 | dokumente_vollstaendig_am_phase | C (write to faelle → MOVE to claims) |

### dokumente_reminder_whatsapp_letzte_sendung

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/api/cron/pflichtdokumente-reminder/route.ts:33 | dokumente_reminder_whatsapp_letzte_sendung | E (from v_claim_full) |
| src/app/api/cron/pflichtdokumente-reminder/route.ts:96,124 | dokumente_reminder_whatsapp_letzte_sendung | C (write to faelle.update → MOVE to claims) |
| src/lib/fall/subphase-resolver.ts:95,363,364 | dokumente_reminder_whatsapp_letzte_sendung | E/F (Property-Zugriff auf fall aus view) |

### zb1_status

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/api/webhooks/twilio/inbound/route.ts:209,216,235,395,420,427 | zb1_status | leads-Read/Write — nicht SP-B |
| src/app/dispatch/leads/[id]/_actions/dokumente-anfordern.ts:132 | zb1_status | leads-Write — nicht SP-B |
| src/app/dispatch/leads/[id]/_actions/stammdaten.ts:55 | zb1_status | leads-Allowlist — nicht SP-B |
| src/app/dispatch/leads/[id]/_phases/DokumenteAnfordernCard.tsx:80,239,248,347,419 | zb1_status | leads-Prop — nicht SP-B |
| src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:88 | zb1_status | F (TS-Type auf leads-Prop) |
| src/app/faelle/[id]/page.tsx:235 | zb1_status | leads-Read — nicht SP-B |
| src/app/faelle/[id]/_actions/stammdaten.ts:148 | zb1_status | C (via FALL_EDITABLE_FIELDS → splitOrKeepFaelleUpdate → add to CLAIM_OWNED) |
| src/app/flow/[token]/actions.ts:429 | zb1_status | leads-Read (nested via leads!) — nicht SP-B |
| src/app/gutachter/fall/[id]/page.tsx:116 | zb1_status | leads-Read — nicht SP-B |
| src/app/kunde/onboarding/actions.ts:220 | zb1_status | leads-Read — nicht SP-B |
| src/app/kunde/onboarding-details/zb1-actions.ts:92 | zb1_status | leads-Write — nicht SP-B |
| src/app/upload/dokumente/[token]/actions.ts:338,370,384,395 | zb1_status | leads-Write — nicht SP-B |

**Befund:** Alle `zb1_status`-Writes gehen auf `leads`, nicht `faelle`. Das einzige aktive faelle-zb1_status-Write ist via `updateFallField` (allowlist) → add to CLAIM_OWNED.

### kanzlei_ansprechpartner_position

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/app/faelle/[id]/_actions/kanzlei-paket.ts:289 | kanzlei_ansprechpartner_position | C (write via splitOrKeepFaelleUpdate, aber Position war als faelle-only kommentiert — jetzt SP-B → add to CLAIM_OWNED) |

### leasinggeber_informiert

| Datei:Zeile | Spalte | Muster |
|---|---|---|
| src/lib/supabase/database.types.ts | leasinggeber_informiert | F (nur Typen) |
| **Kein aktiver faelle-Read/Write in src/** | | — |

---

## Zusammenfassung

**Aktive Änderungen (A/B/C/D):**
- Pattern A: 1 Call-Site (`flow/[token]/actions.ts:160`)
- Pattern B: 14 Call-Sites in 10 Dateien
- Pattern C: 12 Call-Sites in 8 Dateien
- Pattern D: 0

**Keine Änderung (E/F):**
- Pattern E: ~20 View-basierte Reads (keine Änderung)
- Pattern F: ~80 TS-Type/JSX/Property-Access (keine Änderung)

**Dateien mit Änderungen:**
1. `src/lib/faelle/claim-duplicate-columns.ts` — CLAIM_OWNED_DUPLICATE_COLUMNS erweitern (für C-Pfade via splitOrKeepFaelleUpdate)
2. `src/lib/mietwagen/actions.ts` — mietwagen_* writes MOVE auf claims
3. `src/lib/mietwagen/cron.ts` — mietwagen_* reads in claims-Embed
4. `src/app/kunde/faelle/[id]/page.tsx` — mietwagen_* + schadens_hoehe_netto reads in claims-Embed
5. `src/app/admin/finance/(hub)/offene-faelle/page.tsx` — schadens_hoehe_netto in claims-Embed
6. `src/app/api/cron/abrechnung-erstellen/route.ts` — schadens_hoehe_netto in claims-Embed
7. `src/lib/abrechnung/process-case-billing.ts` — schadens_hoehe_netto in claims-Embed
8. `src/lib/abrechnung/reissue-abrechnung.ts` — schadens_hoehe_netto in claims-Embed
9. `src/app/api/ocr-gutachten/route.ts` — schadens_hoehe_netto write MOVE auf claims
10. `src/lib/beleg-review/actions.ts` — mietwagen_rechnung_vorhanden write MOVE auf claims
11. `src/app/gutachter/fall/[id]/abrechnungsart-actions.ts` — abrechnungsart_* writes MOVE auf claims
12. `src/app/api/cron/pflichtdokumente-reminder/route.ts` — dokumente_vollstaendig_* + dokumente_reminder_* writes MOVE auf claims
13. `src/app/api/email/send/route.ts` — schadens_ursache in claims-Embed
14. `src/app/api/sv-zuweisung/route.ts` — schadens_ursache in claims-Embed
15. `src/app/api/pdf/kanzlei-paket/[id]/route.tsx` — schadens_ursache in claims-Embed
16. `src/app/gutachter/auftraege/export-action.ts` — schadens_ursache in claims-Embed
17. `src/app/gutachter/auftraege/page.tsx` — schadens_ursache in claims-Embed
18. `src/app/gutachter/faelle/page.tsx` — schadens_ursache in claims-Embed
19. `src/app/flow/[token]/actions.ts` — schadens_ursache: A→ claims direct
20. `src/lib/claims/create-for-fall.ts` — schadens_ursache: claims.insert hinzufügen
21. `src/app/faelle/[id]/_actions/dokumente.ts` — zeugen_vorhanden in claims-Embed
22. `src/app/kunde/onboarding/actions.ts` — zeugen_vorhanden in claims-Embed
23. `src/lib/dokumente/erwartung.ts` — zeugen_vorhanden MOVE auf claims-Read
24. `src/app/flow/[token]/onboarding-extra-actions.ts` — werkstatt_seit_datum: check if faelle write
