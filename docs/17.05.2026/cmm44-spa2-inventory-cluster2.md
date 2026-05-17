# CMM-44 SP-A2 PR1b — Call-Site-Inventur Cluster 2

Reiner Code-Sweep, kein DB-Schema-Change. 11 Hergang-/Art-/Typ-/Flag-Spalten.
Gegenstueck existiert auf `claims`, heisst aber anders.

## Rename-Mapping (Cluster 2)

| `faelle` (alt)                 | `claims` (neu)            | Notiz        |
|--------------------------------|---------------------------|--------------|
| `schadens_beschreibung`        | `hergang_kunde_text`      | Kollision A  |
| `unfallhergang`                | `hergang_kunde_text`      | Kollision A  |
| `schadens_hergang`             | `hergang_kunde_text`      | Kollision A  |
| `schadens_art`                 | `schadenart`              |              |
| `schadens_fall_typ`            | `fall_typ`                |              |
| `personenschaden_flag`         | `hat_personenschaden`     |              |
| `halter_ungleich_fahrer_flag`  | `halter_ungleich_fahrer`  |              |
| `sachschaden_flag`             | `hat_sachschaden`         |              |
| `mietwagen_flag`               | `hat_mietwagen`           | Kollision D  |
| `mietwagen_hat`                | `hat_mietwagen`           | Kollision D  |
| `nutzungsausfall`              | `hat_nutzungsausfall`     |              |

## Zentrale Erkenntnis — View-Reader bleiben unveraendert

Die gesamte Fallakte (`faelle/[id]`, `gutachter/fall/[id]`, `kunde/faelle/[id]`)
laedt ihr `fall`-Objekt ueber `getFallById` / `getFallForAdmin` / `getFallForSv`
/ `getFallForKunde` aus `src/lib/fall/queries.ts`. Alle vier Loader lesen aus der
**View `v_faelle_mit_aktuellem_termin`** — NICHT direkt aus `faelle`. Konvention 3
der PR1b-Aufgabe: View-Reader bleiben unveraendert, PR2 repointet die View.

Damit sind **alle JSX-Display-Komponenten** der Fallakte, die `fall.<spalte>`
lesen, `read-view` → kein Change. Betroffene Komponenten:
`UebersichtTab.tsx`, `Sections.tsx` (`NutzungsausfallSection`), `StammdatenDetail.tsx`,
`MaklerAkteDetail.tsx`, `FaelleKanban.tsx`, `briefing.ts`/`briefing-prompt.ts`/
`briefing-fallback.ts`, `ai-actions.ts`, `copilot/briefing.ts`.

Change noetig nur bei **direkten `.from('faelle')`-Selects/Updates/Inserts** der
11 Spalten + dem Allowlist-Writer `updateFallField` + dem Lead→Fall-Insert-Mapper.

## Per-Spalten-Inventur

### `schadens_beschreibung` → `hergang_kunde_text`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `api/admin/create-test-fall/route.ts:130` | write-faelle (Insert) | JA — aus claimlosem Test-Fall-Insert entfernen |
| `api/pdf/kanzlei-paket/[id]/route.tsx:112` | read-faelle (`select('*')`) | JA — aus claims `hergang_kunde_text` lesen |
| `faelle/[id]/_actions/stammdaten.ts:71` | write-faelle (Allowlist) | JA — via CLUSTER2-Map auf claims routen |
| `kunde/faelle/[id]/FallDetailSections.tsx:154,157` | jsx-display (read-view) | NEIN — `fall` aus View |
| `components/fall/StammdatenDetail.tsx:329,389` | jsx-display (read-view) | NEIN — `fall` aus View |
| `components/kunde/ClaimSummary.tsx:76,364,370` | type-only / jsx-display | NEIN — `data`-Prop, Quelle (`get-kunde-faelle.ts`) wird gefixt; Property-Name = API-Vertrag |
| `lib/ai/briefing-fallback.ts:32` | type-only (`BriefingInput`) | NEIN |
| `lib/ai/briefing-prompt.ts:17,92` | type-only / read-view (`pick`) | NEIN — `fall` aus View |
| `lib/claims/get-kunde-faelle.ts:374,472` | read-faelle | JA — faelle-Read raus, nur `c.hergang_kunde_text` |
| `lib/fall/queries.ts:41` | read-view (`FALL_SELECT_KUNDE`) | NEIN — View-Select, PR2 |
| `lib/stammdaten/schema.ts:235` | type-only (Schema-Feld-Key) | NEIN — Stammdaten-Schema, View-getrieben |
| `lib/supabase/database.types.ts` (mehrere) | type-only (generiert) | NEIN |
| `api/admin/create-test-fall/route.ts` lead-Insert | leads-Write | n/a |

### `unfallhergang` → `hergang_kunde_text`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `api/admin/create-test-fall/route.ts:131` | write-faelle (Insert) | JA — aus Insert entfernen |
| `api/admin/create-test-fall/route.ts:74` | leads-Write | NEIN |
| `api/admin/test/cmm48-smoke/route.ts:94` | leads-Write (`leadInsert`) | NEIN |
| `dispatch/leads/**` (bkat-inference, hard-gate, types, unfallskizze, qualification-engine, Phase1/4/5, UnfallskizzeCard, BkatAnalysePanel) | leads-Reads/Writes/Types | NEIN — Dispatch arbeitet auf `leads` |
| `faelle/[id]/ai-actions.ts:100` | jsx/llm-context (read-view) | NEIN — `fall` aus View |
| `flow/[token]/FlowWizardKfz.tsx:57`, `flow/[token]/page.tsx:267` | leads-Read/Type | NEIN |
| `components/fall/StammdatenDetail.tsx:329` | jsx-display (read-view) | NEIN |
| `components/makler/akte-detail/MaklerAkteDetail.tsx:383,387` | jsx-display (makler-View) | NEIN |
| `lib/ai/briefing-fallback.ts:31`, `briefing-prompt.ts:13,88` | type-only / read-view | NEIN |
| `lib/bkat/inference.ts` (mehrere) | type-only / Param-Name | NEIN — `unfallhergang`-Param ist Funktions-Argument |
| `lib/claims/create-for-fall.ts:31,93` | read-claims (Dual-Write-Helper) | NEIN — `source`-Property = Input-Vertrag, schreibt `hergang_kunde_text` |
| `lib/faq-bot/ask.ts:143` | read-leads (Embed) | NEIN |
| `lib/lead-fall-mapping.ts:64` | write-faelle (`LEAD_TO_FALL_DIRECT_FIELDS`) | JA — aus DIRECT-Liste entfernen (claims-Write via convertLeadToClaim existiert) |
| `lib/leads/convert-lead-to-claim.ts:180` | read-leads → claims-Write | NEIN — schreibt schon `hergang_kunde_text` |
| `lib/makler/copilot-prompt.ts:180,181`, `lib/makler/queries.ts:250,309` | makler-View-Read / Type | NEIN — `makler/queries.ts:305` liest aus `v_faelle_mit_aktuellem_termin` |
| `lib/unfallskizze/generate.ts` | type-only / Param-Name | NEIN |
| `database.types.ts` | type-only | NEIN |

### `schadens_hergang` → `hergang_kunde_text`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `dispatch/leads/[id]/_actions/bkat-inference.ts:30,40` | read-leads | NEIN |
| `dispatch/leads/[id]/_actions/stammdaten.ts:73` | leads-Allowlist-Write | NEIN — Dispatch schreibt `leads` |
| `dispatch/leads/[id]/_lib/qualification-engine.ts`, `_phases/Phase4/Phase5` | leads-Reads/Types | NEIN |
| `faelle/[id]/_actions/stammdaten.ts:72` | write-faelle (Allowlist) | JA — via CLUSTER2-Map auf claims routen |
| `lib/actions/konvertiere-anfrage-zu-fall.ts:172` | leads-Write (anfrage→lead-Insert) | NEIN |
| `lib/ai/briefing-fallback.ts:30`, `briefing-prompt.ts:12,87` | type-only / read-view | NEIN |
| `lib/ai/vision/analyze-unfallfotos.ts:13` | comment | NEIN |
| `lib/claims/create-for-fall.ts:32,93` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/lead-fall-mapping.ts:78` | write-faelle (`LEAD_TO_FALL_DIRECT_FIELDS`) | JA — aus DIRECT-Liste entfernen |
| `lib/leads/convert-lead-to-claim.ts:181` | read-leads → claims-Write | NEIN |
| `lib/stammdaten/schema.ts:222` | type-only (Schema-Key) | NEIN |
| `database.types.ts` | type-only | NEIN |

### `schadens_art` → `schadenart`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `admin/faelle/anlegen/actions.ts:71` | leads-Write (`createLead`-Extra) | NEIN |
| `admin/faelle/anlegen/actions.ts:108` | write-faelle (Insert) | JA — entfernen (createClaimForFall schreibt `schadenart`) |
| `admin/faelle/anlegen/actions.ts:132`, `AnlegenFallClient.tsx` | claims-Helper-Input / Form-State | NEIN |
| `api/admin/test/cmm48-smoke/route.ts:77` | leads-Write | NEIN |
| `api/sv-zuweisung/route.ts:54,165` | read-faelle (`.from('faelle').select`) | JA — in claims-Embed verschieben |
| `api/sv-zuweisung/route.ts:48-50,118,191` | comment | Kommentar aktualisieren |
| `faelle/[id]/_actions/stammdaten.ts:78` | write-faelle (Allowlist) | JA — via CLUSTER2-Map auf claims routen |
| `gutachter/team/page.tsx:95,113` | read-faelle (`.from('faelle').select`) | JA — in claims-Embed verschieben |
| `gutachter/team/TeamClient.tsx:36,162,163` | jsx-display / Type | NEIN — `schadens_art`-Prop kommt aus page.tsx (gefixt), Property-Name = Vertrag |
| `components/makler/akte-detail/MaklerAkteDetail.tsx:381` | jsx-display (makler-View) | NEIN |
| `lib/actions/dispatch-fall-actions.ts:257,281` | leads-Write (`createLead`) | NEIN |
| `lib/ai/briefing-prompt.ts:14,89` | type-only / read-view | NEIN |
| `lib/claims/create-for-fall.ts:34,77` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/faq-bot/ask.ts:202` | read-view (`fall.schadens_art`) | NEIN — `fall` aus `getFallById`-aehnlicher Quelle / View |
| `lib/lead-fall-mapping.ts:40` | write-faelle (`LEAD_TO_FALL_DIRECT_FIELDS`) | JA — aus DIRECT-Liste entfernen |
| `lib/leads/convert-lead-to-claim.ts:134` | read-leads → claims-Write | NEIN |
| `lib/makler/copilot-prompt.ts:183`, `lib/makler/queries.ts:249,308` | makler-View / Type | NEIN |
| `lib/stammdaten/schema.ts:172` | type-only (Schema-Key) | NEIN |
| `database.types.ts` | type-only | NEIN |

### `schadens_fall_typ` → `fall_typ`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `admin/faelle/(hub)/FaelleKanban.tsx:25,362` | jsx-display / Type | NEIN — Prop kommt aus page.tsx (gefixt) |
| `admin/faelle/(hub)/page.tsx:41,243` | read-faelle (`.from('faelle').select`, `supp`-Lookup) | JA — in claims-Embed verschieben |
| `admin/faelle/(hub)/page.tsx:105` | read-faelle (Select-String) | JA — `fall_typ` in claims-Embed |
| `admin/faelle/anlegen/actions.ts:69` | write-faelle (`schadens_fall_typ: null`) | JA — entfernen (claimless? — Fall hat claims via createClaimForFall, fall_typ wird dort nicht gesetzt da source kein schadens_fall_typ hat → reiner null-Write, entfernen) |
| `api/admin/create-test-fall/route.ts:124` | write-faelle (Insert) | JA — entfernen |
| `api/admin/create-test-fall/route.ts:67` | leads-Write | NEIN |
| `api/admin/test/cmm48-smoke/route.ts:75` | leads-Write | NEIN |
| `api/cron/gutachter-erinnerungen/route.ts:63` | read-leads | NEIN |
| `api/search/route.ts:28,82` | read-leads | NEIN |
| `api/seed-testdata/route.ts` (mehrere 251-327) | leads-Write (`leadDefs`) | NEIN |
| `api/seed-testdata/route.ts:498` | write-faelle (claimloser Seed-Insert) | JA — entfernen |
| `api/seed-testdata/route.ts:499` | read (`f.schadens_fall_typ` aus fallDefs) | n/a — Insert-Wert |
| `dispatch/dashboard/page.tsx`, `dispatch/leads/page.tsx`, `LeadsViewToggle.tsx` | read-leads / Type | NEIN |
| `flow/[token]/FlowWizardKfz.tsx:41`, `flow/[token]/page.tsx:251` | leads-Read/Type | NEIN |
| `gutachter/heute/page.tsx:184,404` | read-leads | NEIN |
| `lib/actions/dispatch-fall-actions.ts:252,279,294` | leads-Write (`createLead`) | NEIN |
| `lib/ai/briefing-prompt.ts:15,90` | type-only / read-view | NEIN |
| `lib/autoPhase.ts:16` | read-leads | NEIN |
| `lib/claims/create-for-fall.ts:35,95` | read-claims (Dual-Write-Helper, schreibt `fall_typ`) | NEIN |
| `lib/copilot/briefing.ts:89` | read-leads | NEIN |
| `lib/lead-fall-mapping.ts:37` | write-faelle (`LEAD_TO_FALL_DIRECT_FIELDS`) | JA — aus DIRECT-Liste entfernen |
| `lib/leads/convert-lead-to-claim.ts:154` | read-leads → claims-Write (`fall_typ`) | NEIN |
| `database.types.ts` | type-only | NEIN |

### `personenschaden_flag` → `hat_personenschaden`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `api/seed-testdata/route.ts:274,407` | leads-Write (`leadDefs`) | NEIN |
| `api/seed-testdata/route.ts:333,502` | write-faelle (Seed-Insert, Z.503) | JA — aus claimlosem Seed-faelle-Insert entfernen |
| `dispatch/leads/**` (hard-gate, personen, types, qualification-engine, Phase1*, Phase4/5, SidebarStubs) | leads-Reads/Writes/Types | NEIN — Dispatch = `leads` |
| `faelle/[id]/ai-actions.ts:104` | jsx/llm-context (read-view) | NEIN — `fall` aus View |
| `flow/[token]/actions.ts:425` | read-leads (Embed) | NEIN |
| `flow/[token]/FlowWizardKfz.tsx:45`, `flow/[token]/page.tsx:255` | leads-Read/Type | NEIN |
| `kunde/onboarding/actions.ts:220`, `kunde/onboarding/page.tsx:85,95` | read-leads | NEIN |
| `lib/ai/briefing-fallback.ts:90,99`, `briefing-prompt.ts:36,107` | type-only / read-view | NEIN |
| `lib/claims/create-for-fall.ts:50,112` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/dokumente/create-pflicht.ts`, `erwartung.ts` (mehrere), `katalog.test.ts`, `pflicht-evaluator.test.ts`, `ruleEvaluator.test.ts` | rule-context / Tests | NEIN — `lead.personenschaden_flag` ist `leads`-Spalte |
| `lib/dokumente/erwartung.ts:236` | read-faelle (`.from('faelle').select`) | JA — in claims-Embed verschieben + auf `hat_personenschaden` umbenennen |
| `lib/flow/fehlende-felder.ts:20,158` | read-leads / Type | NEIN |
| `lib/lead-fall-mapping.ts:137` | write-faelle (`LEAD_TO_FALL_DEFAULT_FIELDS`) | JA — aus DEFAULT-Map entfernen |
| `lib/leads/convert-lead-to-claim.ts:196,321` | read-leads → claims-Write | NEIN |
| `database.types.ts` | type-only | NEIN |

### `halter_ungleich_fahrer_flag` → `halter_ungleich_fahrer`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `components/shared/stammdaten/StammdatenReadSection.tsx:113` | jsx-display | NEIN — `fall` aus View (Fallakte) |
| `lib/ai/briefing-fallback.ts:75`, `briefing-prompt.ts:40,113` | type-only / read-view | NEIN |
| `lib/claims/create-for-fall.ts:56,117` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/dokumente/create-pflicht.ts:74` | read-leads (`lead?.halter_…`) | NEIN |
| `lib/dokumente/erwartung.ts:41,157` | type-only (`LeadDaten`) / rule-context | NEIN — Property-Name = Vertrag |
| `lib/dokumente/erwartung.ts:236` | read-faelle (`.from('faelle').select`) | JA — in claims-Embed verschieben + auf `halter_ungleich_fahrer` umbenennen |
| `lib/dokumente/erwartung.ts:262` | read-leads (Select-String) | NEIN |
| `lib/lead-fall-mapping.ts:143` | write-faelle (`LEAD_TO_FALL_DEFAULT_FIELDS`) | JA — aus DEFAULT-Map entfernen |
| `lib/leads/convert-lead-to-claim.ts:316` | read-leads → claims-Write | NEIN |
| `database.types.ts` | type-only | NEIN |

### `sachschaden_flag` → `hat_sachschaden`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `dispatch/leads/**` (hard-gate, types, DokumenteAnfordernCard, Phase1*, Phase4) | leads-Reads/Writes/Types | NEIN |
| `lib/ai/vision/analyze-unfallfotos.ts:72` | comment | NEIN |
| `lib/claims/create-for-fall.ts:54,115` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/dokumente/erwartung.ts:33,109,115,122` | type-only / rule-context | NEIN |
| `lib/dokumente/erwartung.ts:236` | read-faelle (`.from('faelle').select`) | JA — in claims-Embed verschieben + auf `hat_sachschaden` umbenennen |
| `lib/dokumente/erwartung.ts:262` | read-leads | NEIN |
| `lib/lead-fall-mapping.ts:139` | write-faelle (`LEAD_TO_FALL_DEFAULT_FIELDS`) | JA — aus DEFAULT-Map entfernen |
| `lib/leads/convert-lead-to-claim.ts:199` | read-leads → claims-Write | NEIN |
| `database.types.ts` | type-only | NEIN |

### `mietwagen_flag` → `hat_mietwagen` (Kollision D)

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `api/seed-testdata/route.ts:259,331` | leads-Write (`leadDefs`) | NEIN |
| `dispatch/leads/**` (hard-gate, types, qualification-engine, Phase1*, SidebarStubs) | leads-Reads/Writes/Types | NEIN |
| `faelle/[id]/ai-actions.ts:105` | jsx/llm-context (read-view) | NEIN |
| `faelle/[id]/_actions/stammdaten.ts:112` | write-faelle (Allowlist) | JA — via CLUSTER2-Map auf claims routen |
| `faelle/[id]/_stammdaten/Sections.tsx:224,229` | jsx-display (read-view) | NEIN |
| `faelle/[id]/_tabs/UebersichtTab.tsx:29` | comment | NEIN |
| `flow/[token]/actions.ts:425` | read-leads (Embed) | NEIN |
| `flow/[token]/FlowWizardKfz.tsx:46`, `flow/[token]/page.tsx:256` | leads-Read/Type | NEIN |
| `kunde/onboarding/actions.ts:220`, `OnboardingWizard.tsx:40` | read-leads / comment | NEIN |
| `lib/ai/briefing-fallback.ts:102`, `briefing-prompt.ts:37,108` | type-only / read-view | NEIN |
| `lib/claims/create-for-fall.ts:52,113` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/dokumente/erwartung.ts:45` | type-only (`LeadDaten`) | NEIN |
| `lib/faelle/state-machine.ts:307,322` | read-faelle (`.from('faelle').select`) | JA — in claims-Embed verschieben |
| `lib/flow/fehlende-felder.ts:21,108,110` | read-leads / Type | NEIN |
| `lib/lead-fall-mapping.ts:140` | write-faelle (`LEAD_TO_FALL_DEFAULT_FIELDS`) | JA — aus DEFAULT-Map entfernen |
| `lib/leads/convert-lead-to-claim.ts:197` | read-leads → claims-Write | NEIN |
| `lib/stammdaten/schema.ts:300` | comment | NEIN |
| `database.types.ts` | type-only | NEIN |

### `mietwagen_hat` → `hat_mietwagen` (Kollision D)

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `faelle/[id]/_tabs/UebersichtTab.tsx:264,279` | jsx-display (read-view) | NEIN — `fall` aus View |
| `kunde/faelle/[id]/FallDetailSections.tsx:144` | jsx-display | NEIN — `fall` aus `fallExtra` (gefixt in page.tsx) bzw. Prop |
| `kunde/faelle/[id]/page.tsx:337,345` | read-faelle (`.from('faelle').select` — `fallExtra`) | JA — `mietwagen_hat` in claims-Embed |
| `components/admin/fallakte/mietwagen/MietwagenEditCard.tsx` (mehrere) | Form-State / Props | NEIN — `fall`-Prop kommt aus View (UebersichtTab) |
| `components/kunde/KundeAusfallEntschaedigungCard.tsx:9` | comment | NEIN |
| `components/shared/mietwagen/MietwagenStatusCard.tsx:13,46` | type-only / jsx-display | NEIN — `fall`-Prop aus View |
| `lib/claims/create-for-fall.ts:51,113` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/mietwagen/actions.ts:12,38,41,49,58` | write-faelle (`updateMietwagen`) | JA — `mietwagen_hat` aus `patch` splitten, auf claims; Pre-Check-Read Z.45 bleibt (`mietwagen_seit_datum` faelle-only) |
| `lib/mietwagen/cron.ts:16,46,48,50` | read-faelle + `.eq()`-Filter | JA — in claims-`!inner`-Embed verschieben + Filter `claims.hat_mietwagen` |
| `database.types.ts` | type-only | NEIN |

### `nutzungsausfall` → `hat_nutzungsausfall`

| Datei:Zeile | Klasse | Change |
|---|---|---|
| `api/admin/test/cmm48-smoke/route.ts:87` | leads-Write | NEIN |
| `api/ocr/anspruchsschreiben/route.ts:8` | OCR-Positionstyp-String (kein DB-Feld) | NEIN |
| `dispatch/leads/**` (hard-gate, types, qualification-engine, Phase1*) | leads-Reads/Writes/Types | NEIN |
| `faelle/[id]/_actions/stammdaten.ts:113` | write-faelle (Allowlist) | JA — via CLUSTER2-Map auf claims routen |
| `faelle/[id]/_stammdaten/Sections.tsx:224,230,231,247` | jsx-display (read-view) | NEIN |
| `faelle/[id]/_tabs/UebersichtTab.tsx:29` | comment | NEIN |
| `flow/[token]/actions.ts:425` | read-leads (Embed) | NEIN |
| `kunde/onboarding/actions.ts:220` | read-leads | NEIN |
| `lib/claims/create-for-fall.ts:53,114` | read-claims (Dual-Write-Helper) | NEIN |
| `lib/dokumente/erwartung.ts:46` | type-only (`LeadDaten`) | NEIN |
| `lib/faelle/state-machine.ts:307,322` | read-faelle (`.from('faelle').select`) | JA — in claims-Embed verschieben |
| `lib/lead-fall-mapping.ts:126,142` | write-faelle (DIRECT-Liste + DEFAULT-Map) | JA — beide Eintraege entfernen |
| `lib/leads/convert-lead-to-claim.ts:198` | read-leads → claims-Write | NEIN |
| `lib/makler/copilot-prompt.ts:158,165,212` | `nutzungsausfall_gesamt` (andere Spalte) | NEIN — `nutzungsausfall_gesamt` ist NICHT in der Mapping-Liste |
| `lib/stammdaten/schema.ts:9,298,300` | type-only (Schema-Block-Key) | NEIN |
| `database.types.ts` | type-only | NEIN |

## Change-noetige Dateien (Zusammenfassung)

1. `src/lib/faelle/claim-duplicate-columns.ts` — `CLUSTER2_RENAMED_TO_CLAIMS`-Map anlegen
2. `src/app/faelle/[id]/_actions/stammdaten.ts` — Allowlist-Writer via Cluster-2-Map auf claims routen
3. `src/lib/lead-fall-mapping.ts` — 5 DIRECT + 5 DEFAULT-Eintraege entfernen (claims-Write existiert)
4. `src/app/api/admin/create-test-fall/route.ts` — 3 Felder aus claimlosem faelle-Insert entfernen
5. `src/app/admin/faelle/anlegen/actions.ts` — `schadens_art` + `schadens_fall_typ: null` aus faelle-Insert entfernen
6. `src/app/api/seed-testdata/route.ts` — `schadens_fall_typ` + `personenschaden_flag` aus claimlosem faelle-Insert entfernen
7. `src/lib/claims/get-kunde-faelle.ts` — faelle-Read von `schadens_beschreibung` entfernen, `c.hergang_kunde_text` nutzen
8. `src/app/api/pdf/kanzlei-paket/[id]/route.tsx` — `schadensBeschreibung` aus claims `hergang_kunde_text` lesen
9. `src/app/api/sv-zuweisung/route.ts` — `schadens_art` in claims-Embed (`schadenart`)
10. `src/app/gutachter/team/page.tsx` — `schadens_art` in claims-Embed (`schadenart`)
11. `src/app/admin/faelle/(hub)/page.tsx` — `schadens_fall_typ` in claims-Embed (`fall_typ`)
12. `src/lib/dokumente/erwartung.ts` — 3 Flags aus faelle-Read in claims-Read (neue Namen) + Merge-Remap
13. `src/lib/faelle/state-machine.ts` — `mietwagen_flag`/`nutzungsausfall` in claims-Embed
14. `src/app/kunde/faelle/[id]/page.tsx` — `mietwagen_hat` in claims-Embed (`hat_mietwagen`)
15. `src/lib/mietwagen/actions.ts` — `mietwagen_hat` aus `patch` splitten, auf claims
16. `src/lib/mietwagen/cron.ts` — `mietwagen_hat` in claims-`!inner`-Embed + Filter

## Kollisionsgruppen

- **A** (`schadens_beschreibung`/`unfallhergang`/`schadens_hergang` → `hergang_kunde_text`):
  Kein Caller liest mehrere A-Spalten aus `faelle` und schreibt sie unterschiedlich.
  `updateFallField` schreibt feldweise → Map bildet alle 3 auf `hergang_kunde_text`
  ab. `StammdatenDetail.tsx:329` liest `unfallhergang ?? schadens_beschreibung` —
  aber read-view, kein Change. `create-test-fall` schreibt beide → beide entfernt.
- **D** (`mietwagen_flag`/`mietwagen_hat` → `hat_mietwagen`): `create-for-fall.ts`
  liest beide (`mietwagen_hat ?? mietwagen_flag`) — aber Dual-Write-Helper-Input,
  kein Change. Sonst kein Caller mit beiden gleichzeitig.
