# CMM-44 SP-B PR2b — Call-Site-Inventur Cluster b (Dokumente/SA/Vollmacht)

**Datum:** 2026-05-18  
**Branch:** kitta/cmm-44-spb-pr2b-dokumente  
**Spalten (13):** abtretung_pdf, vollmacht_pdf, abtretung_signiert_am, vollmacht_signiert_am,
sa_unterschrieben, sa_unterschrieben_am, sa_pdf_url, sa_unterschrift_url,
vollmacht_status, vollmacht_geprueft_am, vollmacht_geprueft_von,
vollmacht_pruefung_status, vollmacht_pruefung_begruendung

## Muster-Legende
- **A** — Direkt-Select aus `faelle`-Tabelle, nur SP-B-Spalten → source auf `claims` umstellen
- **B** — Direkt-Select aus `faelle`-Tabelle, gemischt → SP-B-Cols in `claims:claim_id(...)`-Embed ziehen
- **C** — Write auf `faelle` → SP-B-Spalte aus dem `faelle`-Write **entfernen** und nach
  `claims` **verschieben** (MOVE, kein Dual-Write — `claims` ist SSoT, kein Sync-Trigger,
  faelle-SP-B-Spalten werden in Phase 6 gedroppt). Nicht-SP-B-Spalten bleiben im faelle-Write.
- **D** — Nested `faelle(...)`-Select aus anderer Tabelle → SP-B in `claims(...)`-Block
- **E** — View-Read (`v_claim_*` / `v_faelle_*`) → PR1 hat die Views auf `claims` repointed
  (auch `v_faelle_mit_aktuellem_termin` liefert die 13 Cluster-b-Spalten aus `claims`) →
  kein Code-Change, flacher View-Read
- **F** — Reines TS-Typ-/JSX-/Property-Access, kein DB-Call → kein Change

---

## Muster A — Direkt-Select nur SP-B-Spalten

_Keine Treffer — alle direkten faelle-Selects enthalten gemischte Spalten (Muster B)._

---

## Muster B — Direkt-Select aus `faelle`-Tabelle, gemischt (SP-B + non-SP-B)

| Datei:Zeile | Spalte(n) | Tabelle | Notiz |
|---|---|---|---|
| src/lib/google-calendar/sv-event-sync.ts:69-73 | sa_unterschrieben, vollmacht_signiert_am | faelle | gemischt mit nicht-SP-B (service_typ via claims-Embed bereits) |
| src/lib/sla/blocker-detection.ts:31-37 | sa_unterschrieben, vollmacht_signiert_am | faelle | gemischt mit gutachten_eingegangen_am etc. |
| src/lib/sa-tool/generate-gutachter-sa.ts:94-98 | sa_unterschrift_url, abtretung_pdf | faelle | gemischt mit claim_id, claims-embed |
| src/lib/abrechnung/kanzlei/erstelle-abrechnung.ts:94-102 | vollmacht_signiert_am, vollmacht_status | faelle | gemischt mit fall_nr, kanzlei_honorar |
| src/app/gutachter/auftraege/page.tsx:77-79 | sa_unterschrieben | faelle | gemischt mit status, kennzeichen, claims-embed |
| src/lib/claims/get-kunde-faelle.ts:142-143 | sa_unterschrieben, vollmacht_status, vollmacht_signiert_am | faelle (FALL_SELECT) | gemischt mit vielen anderen Feldern |
| src/lib/claims/get-kunde-faelle.ts:381-387 | sa_unterschrieben, vollmacht_signiert_am, vollmacht_status | faelle (getKundeFallDetailRecord) | gemischt mit vielen anderen Feldern |
| src/lib/kanzlei-wunsch/actions.ts:441-447 | vollmacht_signiert_am | faelle | gemischt mit id, kunde_id, claim_id |
| src/app/api/admin/test/cmm48-smoke/route.ts:134-140 | sa_unterschrieben, sa_unterschrieben_am, abtretung_signiert_am, abtretung_pdf | faelle | gemischt mit besichtigungsort_adresse, claims-embed |

---

## Muster C — Write auf `faelle` (SP-B-Spalte aus dem faelle-Write **entfernen**, nach `claims` **verschieben** — MOVE)

| Datei:Zeile | Spalte(n) | Kontext | MOVE-Ergebnis |
|---|---|---|---|
| src/app/flow/[token]/actions.ts:134 | abtretung_pdf | generateAndStoreSA() — Upload SA-Dokument | faelle-Write komplett entfernt, claims-only |
| src/app/flow/[token]/actions.ts:770-773 | sa_unterschrieben, sa_unterschrieben_am | signSAandCreateFall() — SA-Unterschrift | reiner SP-B-faelle-Write komplett entfernt, claims-only |
| src/app/flow/[token]/actions.ts:1386-1388 | vollmacht_signiert_am | confirmVollmacht() — Vollmacht bestätigen | Split: vollmacht_signiert_am raus, vollmacht_datum (kein SP-B) bleibt auf faelle |
| src/app/flow/signatur/[token]/SignaturPage.tsx:64-73 | abtretung_pdf, vollmacht_pdf, abtretung_signiert_am, vollmacht_signiert_am | Client-Component Signatur-Upload | faelle-Write der 4 Spalten komplett entfernt; nutzt signaturClaimsWrite (claims-only Server-Action) |
| src/app/api/lexdrive/vollmacht-confirm/route.ts:53-58 | vollmacht_geprueft_am, vollmacht_geprueft_von, vollmacht_pruefung_status, vollmacht_pruefung_begruendung | LexDrive Webhook | faelle-Write der 4 Spalten komplett entfernt, claims-only (fehlergeguarded) |
| src/lib/kanzlei-wunsch/actions.ts:462-466 | vollmacht_signiert_am | bestaetigeVollmachtKunde() — direkt schreiben | faelle-Write entfernt, claims-only (claim_id-Guard) |
| src/lib/kanzlei-wunsch/actions.ts:543-546 | vollmacht_signiert_am: null | smokeResetAufKanzleiWunsch() — Smoke-Reset | Split: vollmacht_signiert_am raus, status bleibt auf faelle; null im claims-Write |
| src/lib/kanzlei-wunsch/actions.ts:615-621 | vollmacht_signiert_am: nowIso | smokeResetAufLexDriveVollmachtSigniert() | Split: vollmacht_signiert_am raus, kennzeichen/hersteller/modell/status bleiben auf faelle |
| src/lib/leads/convert-lead-to-fall.ts:93-101 | sa_unterschrieben: false, sa_unterschrieben_am: null, abtretung_signiert_am: null, abtretung_pdf: null | Dispatch-Convert Reset | reiner SP-B-faelle-Write komplett entfernt, claims-only Reset |
| src/lib/lead-fall-mapping.ts:235-240 | abtretung_pdf, abtretung_signiert_am, sa_unterschrieben, sa_unterschrieben_am | faelle-INSERT via fallComputedFields | aus fallComputedFields entfernt — convert-lead-to-claim.ts setzt sie im claimsInsert (claims-seitig) |

---

## Muster D — Nested faelle(...)-Select

_Keine Treffer für SP-B-Spalten in nested faelle(...) embeds._

---

## Muster E — View-Reads (kein Code-Change)

**Wichtig:** PR1 hat **alle** Cluster-b-View-Quellen auf `claims` repointed — auch
`v_faelle_mit_aktuellem_termin` liefert die 13 SP-B-Spalten aus `claims` (live verifiziert).
View-Reads brauchen daher **keinen** `claims:claim_id(...)`-Embed; die Spalten kommen flach
aus der View. (Die erste PR2b-Fassung hatte hier irrtümlich Embeds gesetzt — der
Code-Review-Nachzug hat sie entfernt.)

| Datei:Zeile | Spalte(n) | View | PR1-Status |
|---|---|---|---|
| src/app/api/cron/vollmacht-reminder/route.ts:33 | vollmacht_signiert_am | v_claim_full | PR1 repointed ✓ |
| src/app/api/cron/sa-reminder/route.ts:40 | sa_unterschrieben_am | v_claim_full | PR1 repointed ✓ |
| src/app/mitarbeiter/faelle/page.tsx:18 | sa_unterschrieben | v_claim_full | PR1 repointed ✓ |
| src/app/gutachter/kalender/page.tsx:63-68 | sa_unterschrieben | v_faelle_mit_aktuellem_termin | PR1 repointed ✓ — flacher View-Read, `.eq('sa_unterschrieben', true)`-Pushdown auf der View-Spalte |
| src/app/faelle/[id]/ai-actions.ts:27 | abtretung_signiert_am, vollmacht_signiert_am | v_faelle_mit_aktuellem_termin (select *) | PR1 repointed ✓ — flacher View-Read, kein Embed/Extra-Query |
| src/lib/makler/queries.ts:321-341 | abtretung_signiert_am | v_faelle_mit_aktuellem_termin | PR1 repointed ✓ — flacher View-Read |
| src/lib/fall/stepper-state.ts:79 | abtretung_signiert_am | v_faelle_mit_aktuellem_termin | PR1 repointed ✓ — flacher View-Read |
| src/lib/fall/queries.ts:49 | sa_unterschrieben, vollmacht_signiert_am, vollmacht_status | v_faelle_mit_aktuellem_termin | PR1 repointed ✓ — FALL_SELECT_KUNDE-String, Loader getFallForKunde/getFallById/getFallForAdmin lesen die Werte flach aus der View (= aus claims). Kunde-Portal-Detail läuft separat über getKundeFallDetailRecord (Muster B). |
| src/app/faelle/[id]/page.tsx:487-489 | sa_pdf_url, sa_unterschrift_url, vollmacht_pdf | v_faelle_mit_aktuellem_termin (via getFallById) | PR1 repointed ✓ — Admin liest die Dokument-URLs flach aus der View (= aus claims). |
| src/app/gutachter/fall/[id]/page.tsx:54 | sa_unterschrieben | v_faelle_mit_aktuellem_termin (via getFallForSv) | PR1 repointed ✓ — Gatekeeping-Check, flacher View-Read. |
| src/app/faelle/[id]/_sidebar/SlaAlerts.tsx:25-26 | abtretung_signiert_am, vollmacht_signiert_am | FallContext (prop passed from page) | Pattern F — Werte stammen aus dem View-Read der Page (= aus claims). |

---

## Muster F — Reines TS-Typ/Property-Access (kein Change)

| Datei | Spalte(n) | Kontext |
|---|---|---|
| src/lib/claims/lifecycle.ts:48-49 | sa_unterschrieben, vollmacht_signiert_am | ClaimLifecycleInput.lead Interface |
| src/lib/fall/subphase-resolver.ts:89-91 | sa_unterschrieben_am, vollmacht_status, vollmacht_geprueft_am | FallRow-Typ |
| src/lib/fall/stepper-state.ts:79 | abtretung_signiert_am | select-String für v_faelle_mit_aktuellem_termin (view E) |
| src/lib/kunde/jetzt-zu-tun.ts:50-52 | sa_unterschrieben, vollmacht_status, vollmacht_signiert_am | KundeFallContext-Typ |
| src/lib/kunde/jetzt-zu-tun.test.ts:14-15,124-127,164-165 | sa_unterschrieben, vollmacht_signiert_am, vollmacht_status | Test-Fixtures |
| src/lib/kunde/fall-karte-loader.ts:22-24,146-148 | sa_unterschrieben, vollmacht_status, vollmacht_signiert_am | FallKarteMetaInput-Typ + Property-Zugriff |
| src/components/admin/fallakte/dokumente/SystemDokumenteBox.tsx:15-17 | sa_pdf_url, sa_unterschrift_url, vollmacht_pdf | Props-Typ |
| src/components/kunde/FallKarte.tsx:41,45,68,166 | sa_unterschrieben, vollmacht_signiert_am | Props-Typ + Property-Zugriff |
| src/app/dispatch/leads/[id]/DispatchShell.tsx:45-48 | sa_unterschrieben, vollmacht_signiert_am | Props-Typ |
| src/app/dispatch/leads/[id]/page.tsx:62-65 | sa_unterschrieben, vollmacht_signiert_am | liest aus leads (eigene Spalten) |
| src/app/dispatch/leads/[id]/PhaseContent.tsx:29-31 | sa_unterschrieben, vollmacht_signiert_am | Props-Typ |
| src/app/dispatch/leads/[id]/_phases/Phase6StatusTracking.tsx:39-143 | sa_unterschrieben, vollmacht_signiert_am | Props-Typ + Property-Zugriff |
| src/app/admin/finance/(hub)/page.tsx:681-693 | vollmacht_signiert_am | liest aus leads (eigene Spalten) |
| src/app/dispatch/leads/[id]/_actions/stammdaten.ts:96 | sa_unterschrieben | liest aus leads (eigene Spalten) |
| src/lib/autoPhase.ts:24 | sa_unterschrieben, vollmacht_signiert_am | liest aus leads (eigene Spalten) |
| src/lib/analytics/conversion.ts:26-32 | sa_unterschrieben | liest aus leads (eigene Spalten) |
| src/lib/finance/abrechnungen-generator.ts:84 | vollmacht_signiert_am | liest aus leads (eigene Spalten) |
| src/lib/actions/konvertiere-anfrage-zu-fall.ts:196-197 | sa_unterschrieben, sa_unterschrieben_am | schreibt auf leads (eigene Spalten) |
| src/lib/kanzlei-wunsch/actions.ts:534-538,609-611 | sa_unterschrieben, vollmacht_signiert_am | schreibt auf leads (eigene Spalten) |
| src/lib/smoke/lifecycle-seed.ts:122-130 | sa_unterschrieben, vollmacht_signiert_am | schreibt auf leads (eigene Spalten) |
| src/app/kunde/page.tsx:120-122 | sa_unterschrieben, vollmacht_status, vollmacht_signiert_am | liest aus getKundeFaelle-Ergebnis (fix kommt via getKundeFaelle) |
| src/app/kunde/faelle/page.tsx:56-58 | sa_unterschrieben, vollmacht_status, vollmacht_signiert_am | liest aus getKundeFaelle-Ergebnis (fix kommt via getKundeFaelle) |
| src/app/kunde/layout.tsx:267 | vollmacht_signiert_am | liest aus getKundeFaelle-Ergebnis (fix kommt via getKundeFaelle) |

---

## Zusammenfassung

- **Muster A:** 0 Treffer
- **Muster B:** 9 Call-Sites (9 Dateien) → Code-Change nötig (Direkt-Select aus `faelle`-Tabelle → claims-Embed)
- **Muster C:** 10 Call-Sites (6 Dateien) → Code-Change nötig (MOVE: faelle-Write entfernen, claims-Write)
- **Muster D:** 0 Treffer
- **Muster E:** 11 View-Reads → kein Code-Change (PR1 hat alle Cluster-b-View-Quellen
  inkl. `v_faelle_mit_aktuellem_termin` auf `claims` repointed; flacher View-Read)
- **Muster F:** 21 Pure-Type/Property-Refs → kein Code-Change

**Hinweis:** Die erste PR2b-Fassung hatte 3 View-Reads (`gutachter/kalender`, `ai-actions`,
`makler/queries`) irrtümlich als Muster B mit `claims:claim_id(...)`-Embed behandelt — der
Code-Review-Nachzug hat sie korrekt als Muster E (flacher View-Read) eingestuft.

**Aktive Code-Changes:** 15 Dateien (9 Muster B + 6 Muster C; `lead-fall-mapping.ts` zählt
zu C, `convert-lead-to-claim.ts` setzt die SP-B-Spalten claims-seitig im claimsInsert).
