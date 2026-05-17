# CMM-44 SP-A2 PR1c — Call-Site-Inventur Cluster 3

Reiner Code-Sweep, kein DB-Schema-Change. Letzte 6 Semantik-Duplikat-Spalten von `faelle` auf
die `claims`-Spalte mit dem neuen Namen umgestellt.

## Rename-Mapping (Cluster 3)

| `faelle` (alt) | `claims` (neu) | Notiz |
|---|---|---|
| `gegner_schadennummer` | `gegner_aktenzeichen` | |
| `no_show_count` | `kunde_no_show_count` | siehe No-Show-Zielentscheidung unten |
| `aktuelle_phase` | `phase` | |
| `konvertiert_von_lead` | `lead_id` (auf claims) | claims.lead_id ist SSoT der Lead-Konversions-Verknuepfung |
| `regulierung_betrag` | `regulierungs_betrag` | |
| `vs_ablehnungsgrund` | `vs_ablehnungs_grund` | |

Alle 6 claims-Zielspalten in `database.types.ts` verifiziert (Zeilen 1974/1998/2004/2009/2036
fuer claims.Row).

## No-Show-Zielentscheidung

`claims` hat ZWEI deckungsgleiche Zaehler: `kunde_no_show_count` und `sv_no_show_count`.
Beide Cluster-3-Call-Sites haben **Kunde-No-Show-Kontext**:

- `lib/actions/storno-actions.ts:meldeNoShow` — Funktions-Kommentar "KFZ-150: SV meldet
  **Kunde** No-Show". Der SV meldet, dass der **Kunde** nicht zum Termin erschienen ist.
  → `kunde_no_show_count`.
- `app/gutachter/fall/[id]/page.tsx:417` — Reader fuer den rose-Banner "Termin(e) verpasst".
  Zaehlt verpasste Kunden-Termine. → `kunde_no_show_count`.

Da kein Caller einen SV-No-Show schreibt und beide Sites eindeutig Kunde-Kontext haben:
`CLUSTER3_RENAMED_TO_CLAIMS` mappt `no_show_count → kunde_no_show_count` (Default + einzige
benoetigte Variante). Kein Caller-Override noetig.

## Call-Sites pro Spalte

### gegner_schadennummer

| Datei:Zeile | Klassifikation | Aktion |
|---|---|---|
| `i18n/messages/*.json:259` | type-only (i18n-Label-Key) | keine |
| `components/makler/akte-detail/MaklerAkteDetail.tsx:428` | jsx-display (view-fed via getMaklerFallDetail) | keine |
| `lib/lexdrive/email-sender.ts:38,144` | read-faelle | claims-Embed `gegner_aktenzeichen` |
| `lib/leads/convert-lead-to-claim.ts:220,221,343` | read-leads (lead.gegner_schadennummer) | keine — leads-Spalte bleibt |
| `lib/claims/create-for-fall.ts:47,109` | type-only/read-source (source-Param) | keine — Param-Name = leads-Wording |
| `lib/supabase/database.types.ts` | type-only (generiert) | keine |
| `lib/stammdaten/schema.ts:250-254` | jsx-display getValue (view-fed `f`) | claims-Fallback `c?.gegner_aktenzeichen` zur Primaerquelle machen |
| `lib/stammdaten/leadSchema.ts:121` | leads-Schema | keine — leads-Spalte |
| `app/faelle/[id]/_actions/stammdaten.ts:86` | write-faelle (FALL_EDITABLE_FIELDS-Allowlist) | via CLUSTER3-Map → claims |
| `app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:112,1357` | read-leads (Lead-Phase) | keine |
| `app/dispatch/leads/[id]/_phases/Phase5Zusammenfassung.tsx:44,269` | read-leads | keine |
| `app/dispatch/leads/[id]/_actions/stammdaten.ts:31` | write-leads (leads-Allowlist) | keine |
| `lib/makler/queries.ts:261,312` | read-view (`v_faelle_mit_aktuellem_termin`) | keine — View in PR2 repointet |

### no_show_count

| Datei:Zeile | Klassifikation | Aktion |
|---|---|---|
| `lib/supabase/database.types.ts` | type-only (generiert) | keine |
| `app/gutachter/fall/[id]/page.tsx:417,421,422,577` | read-faelle (Kunde-No-Show-Banner) | claims-Embed `kunde_no_show_count` |
| `lib/actions/storno-actions.ts:61,66,73,77` | read-faelle + write-faelle (Kunde-No-Show) | claims `kunde_no_show_count` |

### aktuelle_phase

| Datei:Zeile | Klassifikation | Aktion |
|---|---|---|
| `app/kunde/faelle/[id]/page.tsx:373,868` | read (Loader-Output-Property von getKundeFallDetailRecord) | keine — Loader gefixt, Property-Name bleibt |
| `app/kanzlei/mandate/page.tsx:35,90` | read-faelle + jsx-display | claims-Embed `phase` |
| `app/kanzlei/kanban/page.tsx:9,10,60,75` | read-faelle | claims-Embed `phase` |
| `app/api/cron/pflichtdokumente-reminder/route.ts:33,34,46` | read-view (`v_claim_full`) | keine — View in PR2 |
| `app/admin/faelle/(hub)/page.tsx:14,47,112,228,257` | read-faelle (Zeile 112) + jsx-display | claims-Embed `phase` (Zeile 112/257) |
| `app/admin/faelle/(hub)/FaelleKanban.tsx:*` | type-only/jsx-display (Props) | keine — Property bleibt Vertrag |
| `app/dev/phases/page.tsx:102` | jsx-display (Mock `null`) | keine |
| `app/faelle/[id]/FallakteShell.tsx:153,156` | read (Loader-Output `fall` von v_faelle View) | keine — view-fed |
| `app/faelle/[id]/_actions/manual-phase-override.ts:4,63,71,76,80` | read-faelle + write-faelle | read+write → `claims.phase` |
| `lib/fall/subphase-visibility.ts:*` + `.test.ts` | type-only (Interface) / Test-Fixture | keine |
| `lib/fall/subphase-resolver.ts:45` | type-only (Interface) | keine |
| `lib/fall/queries.ts:39` | read-view (FALL_SELECT_KUNDE auf v_faelle View) | keine — view-fed |
| `lib/claims/get-kunde-faelle.ts:376,465` | read-faelle (Detail-Loader) | faelle-Select→claims-Select `phase` |
| `lib/makler/queries.ts:243,307,468,536,549,569` | read-view (`v_faelle_mit_aktuellem_termin`) | keine — View in PR2 |
| `lib/makler/copilot-prompt.ts:199` | jsx-display (view-fed `fall`) | keine |
| `lib/statusLabels.ts:77` | comment | keine |
| `components/shared/fall-phases/types.ts:45` | type-only (Interface) | keine |
| `components/shared/fall-phases/FallPhasenPanel.tsx:56` | jsx-display (Prop-Durchreichung) | keine |
| `components/makler/MaklerAktenList.tsx:282` | jsx-display (view-fed) | keine |
| `components/makler/akte-detail/MaklerAkteDetail.tsx:159` | jsx-display (view-fed) | keine |
| `components/admin/fallakte/ManualPhaseOverrideModal.tsx:*` | comment | keine |
| `components/admin/fallakte/FallActionBar.tsx:58` | jsx-display (view-fed `fall`) | keine |
| `app/gutachter/fall/[id]/FallDetailClient.tsx:20,238` | jsx-display (view-fed) | keine |
| `components/kunde/FallStatusCard.tsx:12,13,115,131` | type-only/jsx-display (Prop) | keine — Property bleibt Vertrag |

### konvertiert_von_lead

| Datei:Zeile | Klassifikation | Aktion |
|---|---|---|
| `lib/tasks/entity-loader.ts:23` | comment (FK-Disambiguierung) | keine |
| `lib/lead-fall-mapping.ts:230` | write-faelle (faelle-Insert via fallComputedFields) | Eintrag entfernen — claims.lead_id ist SSoT (convertLeadToClaim:143) |
| `lib/supabase/database.types.ts` | type-only (generiert) | keine |
| `app/api/seed-testdata/route.ts:409,524` | write-faelle (claimloser Test-Seed-Insert) | aus faelle-Insert entfernen (PR1a/b-Praezedenz) |
| `app/admin/faelle/anlegen/actions.ts:112` | write-faelle (faelle-Insert) | entfernen + `lead_id` an createClaimForFall durchreichen |
| `app/flow/[token]/actions.ts:423` | comment (FK-Disambiguierung) | keine |

### regulierung_betrag

| Datei:Zeile | Klassifikation | Aktion |
|---|---|---|
| `app/admin/_components/WichtigeUpdatesWidget.tsx:189,196` | read-faelle | claims-Embed `regulierungs_betrag` |
| `app/admin/_components/MonatsUmsatzForecast.tsx:30,34,37` | read-faelle (+ Null-Filter) | claims-Embed `!inner` + Embed-Filter |
| `app/admin/_components/DashboardStats.tsx:38,61` | read-faelle | claims-Embed `regulierungs_betrag` |
| `lib/whatsapp.ts:263,332,333` | read-faelle | claims-Embed `regulierungs_betrag` |
| `lib/supabase/database.types.ts` | type-only (generiert) | keine |
| `app/gutachter/fall/[id]/page.tsx:162` | comment | keine |
| `lib/lexdrive/process-event.ts:162,170,197` | write-faelle (computeFieldUpdates → claims) | Schluessel `regulierungs_betrag` (claims-Name) |
| `app/api/email/send/route.ts:28` | read-faelle | claims-Embed `regulierungs_betrag` |
| `app/faelle/[id]/_stammdaten/Sections.tsx:474` | jsx-display InlineEditField (fieldName) | keine — Server-Map routet |
| `app/faelle/[id]/_prozess/Sections.tsx:241,242,646` | jsx-display (view-fed read) + InlineEditField | keine — view-fed read, Server-Map routet Write |
| `app/faelle/[id]/_actions/stammdaten.ts:108` | write-faelle (FALL_EDITABLE_FIELDS-Allowlist) | via CLUSTER3-Map → claims |
| `components/kunde/SaeuleMeinGeld.tsx:4` | comment | keine |
| `app/faelle/[id]/_actions/kanzlei-paket.ts:208,338` | write-faelle (recordZahlung + erfasseZahlungseingang) | claims `regulierungs_betrag` |
| `components/kunde/FallStatusCard.tsx:3` | comment | keine |
| `components/kunde/AuszahlungCard.tsx:3` | comment | keine |
| `components/gutachter/SvHonorarCard.tsx:4` | comment | keine |
| `lib/communications/send-fall.ts:30,107,109` | read-faelle | claims-Embed `regulierungs_betrag` |
| `app/flow/[token]/actions.ts:1032` | comment | keine |
| `lib/finance/fall-finanzen.ts:45` | read-faelle | claims-Embed `regulierungs_betrag` |
| `lib/finance/abrechnungen-generator.ts:168,185` | read-faelle (`!inner`-Embed schon da) | `regulierungs_betrag` in Embed |
| `lib/faq-bot/ask.ts:206` | read-view (`v_faelle_mit_aktuellem_termin`) | keine — view-fed |
| `lib/analytics/finance.ts:108,114,117,120` | read-faelle (x2) | claims-Embed `regulierungs_betrag` |
| `app/admin/finance/(hub)/page.tsx:516,520,525,527,543,545,556,563,591,656` | read-faelle (x4 Queries) | claims-Embed `!inner` + Embed-Filter |
| `lib/actions/dispatch-fall-actions.ts:575` | read-faelle | claims-Embed `regulierungs_betrag` |
| `lib/fall/subphase-resolver.ts:58,199,200` | type-only (Interface) / Trigger-Compute | keine — view-fed Caller |
| `lib/fall/subphase-resolver.test.ts:*` | Test-Fixture | keine |
| `app/admin/statistiken/StatistikenClient.tsx:207` | jsx-display (view-fed `v_claim_full`) | keine |
| `app/admin/statistiken/page.tsx:26,156` | read-view (`v_claim_full`) + type-only | keine — View in PR2 |
| `app/api/sv-zuweisung/route.ts:283,395,396` | read-faelle | claims-Embed `regulierungs_betrag` |
| `app/api/seed-testdata/route.ts:460,477,509` | write-faelle (claimloser Test-Seed-Insert) | aus faelle-Insert entfernen (PR1a/b-Praezedenz) |
| `lib/fall/stepper-state.ts:79,178,179` | read-view (`v_faelle_mit_aktuellem_termin`) | keine — view-fed |
| `lib/format/currency.ts:39` | comment | keine |

### vs_ablehnungsgrund

| Datei:Zeile | Klassifikation | Aktion |
|---|---|---|
| `lib/claims/get-kunde-faelle.ts:511` | read-faelle (Detail-Loader) | faelle-Select→claims-Select `vs_ablehnungs_grund` |
| `components/kunde/FallStatusCard.tsx:17,77,80` | type-only/jsx-display (Prop) | keine — Property bleibt Vertrag |
| `lib/fall/subphase-resolver.ts:52,274` | type-only (Interface) / Trigger-Compute | keine — view-fed Caller |
| `lib/fall/queries.ts:51` | read-view (FALL_SELECT_KUNDE) | keine — view-fed |
| `lib/fall/kanzlei-paket-config.ts:184` | comment (UI-Hilfetext) | keine |
| `lib/faelle/state-machine.ts:108` | write-faelle (transitionFallStatus-Update) | claims `vs_ablehnungs_grund` |
| `lib/lexdrive/process-event.ts:175` | write-faelle (computeFieldUpdates → claims) | Schluessel `vs_ablehnungs_grund` |
| `lib/supabase/database.types.ts` | type-only (generiert) | keine |

## Konventions-Hinweise

- **Konvention 3:** Reader von `v_faelle_mit_aktuellem_termin` UND `v_claim_full` bleiben
  unveraendert — beide Views werden in PR2 repointet. Die Fallakte-Loader (getFallById/
  getFallForAdmin/Sv/Kunde) lesen aus v_faelle → alle JSX-Display-Komponenten downstream
  sind view-fed.
- **Konvention 5:** Output-Property-Namen (`aktuelle_phase`, `vs_ablehnungsgrund`,
  `regulierung_betrag`) bleiben als API-Vertrag — nur die Datenquelle wechselt faelle→claims.
- **Konvention 6:** `konvertiert_von_lead` — claims.lead_id ist SSoT. convertLeadToClaim
  setzt claims.lead_id bereits. Fuer den admin-anlegen-Pfad (createClaimForFall) wird ein
  `leadId`-Parameter ergaenzt, damit kein Write verloren geht.
- **Writer-Pattern:** Cluster-3-Felder mit anderem claims-Namen werden NICHT ueber
  `splitOrKeepFaelleUpdate` geroutet (Helper kann nur gleichnamige Spalten). Stattdessen
  direkt mit dem neuen Namen auf `claims` schreiben — analog Cluster 1/2 in
  `updateFallField`.
- **state-machine + process-event:** Schreiben Cluster-3-Felder direkt mit dem claims-Namen
  (`regulierungs_betrag`, `vs_ablehnungs_grund`) ins claims-Update-Objekt. Da `splitOrKeep-
  FaelleUpdate` diese Schluessel nicht kennt, landen sie sonst faelschlich im faelle-Teil —
  daher separater claims-Write fuer diese Felder, mit `{ success:false }`-Abfang bei
  fehlendem claim_id (kein throw).
