# CMM-Entity — faelle-WRITE-Retirement Landmine-Map

**Erstellt 2026-06-11 (Entity-Lane).** Komplement zur Read-Readiness-Map (`2026-06-11-cmm-entity-plan5-faelle-drop-readiness.md`).
Quelle = erschoepfende Audit aller faelle-WRITES (`from('faelle').update/insert/upsert/delete`, ~40 Sites) +
Live-Coverage-Probes. Adressat: CMM-49 (Write-Retirement-Lane vor `DROP TABLE faelle`).

## TL;DR

**Die Write-Retirement ist bereits ~80% gebaut** via `lib/faelle/claim-duplicate-columns.ts`:
`CLAIM_OWNED_DUPLICATE_COLUMNS` (~75 Spalten -> claims), `AUFTRAEGE_OWNED_COLUMNS` (17 -> auftraege),
`CLUSTER1/2/3_RENAMED_TO_CLAIMS` (~25 Semantik-Dups -> claims). 14 split-aware Writer routen SSoT
automatisch weg von faelle. **Die echten Landminen = die NON-split Direct-Flat-Writer** (v.a. OCR +
cardentity + manuelle FIN-Eingabe), die Entity-SSoT-Spalten (vehicles/vehicle_vorschaeden/Party) flach
auf faelle schreiben. **Coverage ~0 (greenfield) -> kein aktueller Datenverlust; reine Forward-Correctness.**

## W1 — Split-aware Writer (LOW RISK, mechanisch)
14 Files nutzen `splitOrKeepFaelleUpdate`/`peelAuftraegeColumns` -> SSoT-Spalten gehen schon auf
claims/auftraege, nur Workflow-Rest bleibt auf faelle. **Retire = faelle.update-Zeile entfernen, claims-Write bleibt.**
Files: `state-machine`, `lexdrive/process-event`, `abrechnung/{revert,reissue,process}-case-billing` +
`admin/abrechnungen/actions` + `cron/monatsabrechnung`, `_sidebar/eskalation-actions`, `_actions/stammdaten`,
`_actions/kanzlei-paket`, `_actions/core`, `components/faelle/OcrAutoFillModal`.

## W2 — Assignment/Bridge-Writes (transitional, stoppen beim Drop)
- **sv_id:** `_karte/actions`, `gutachter/team/actions`, `sv-zuweisung/route`, `sv-lead-ablehn-actions`, `termin-actions:211` -> **CMM-49s sv_id-Retirement** (laeuft; gt.sv_id schon gedroppt, faelle.sv_id naechste).
- **kunde_id:** `kunde/auto-claim`, `flow/[token]/actions:391`.
- **claim_id:** `claims/create-for-fall:141` (Bridge-FK beim faelle-Create).
- **status:** `gutachter/team/actions`, `kanzlei-wunsch/actions:559`, `VorOrtPanel` (legacy operativ-Mirror).

## W3 — TRUE LANDMINES: Non-split Direct-Flat-Writer (MUSS repointen vor Drop)
Schreiben Entity-SSoT-Spalten flach auf faelle -> heute toter Write (View liest aus vehicles/Party/gutachter_termine),
post-Drop Datenverlust. Coverage aktuell ~0 -> Forward-Correctness, kein Daten-Notfall.

| Site | Schreibt | Ziel-Entity (repoint) |
|---|---|---|
| `api/ocr-fahrzeugschein/route:82` | fin_vin/fin_quelle/erstzulassung/fahrzeug_baujahr/hersteller/modell/farbe/hsn/tsn + halter_* | **vehicles** (ensureVehicleFromFin) + **halter-Party** |
| `gutachter/fall/[id]/actions:417` | fin_vin/fin_quelle/fin_extrahiert_am (manuell) | **vehicles** |
| `components/VorOrtPanel:65` | fin_vin, kilometerstand (+status) | **vehicles** |
| `api/ocr-gutachten/route:157` | fin_vin + faelle-only finance (s.u.) | **vehicles** (fin) |
| `cardentity/typ-b:189` + `api/cardentity/typ-a,typ-b/route` | vorschaden_typ_b_bericht/-geprueft/-anzahl/-letzter_datum, hat_vorschaeden, cardentity_abfrage_am | **vehicle_vorschaeden + vehicles.cardentity_report + claims.hat_vorschaeden** (CMM-64-Entities) |
| `api/ocr-trigger/route:138` | halter_geburtsdatum | **halter-Party** |
| `kunde/.../besichtigungsort:72` | besichtigungsort_adresse/lat/lng | **gutachter_termine** (View liest spd_termin) |

**faelle-only Finance/Gutachten (keine Entity-Heimat) — `ocr-gutachten:157`:** `nutzungsausfall_tagessatz`,
`reparaturdauer_tage`, `gutachter_honorar`, `ocr_extrahiert_am`, `ocr_rohdaten` -> claims-Heimat (Finance/Gutachten-Lane)
ODER bewusst-leer bestaetigen. Coverage 0-1 (inert).

## Bonus-Befund: 2 Writer auf BEREITS-GEDROPPTE faelle-Spalten (latente Bugs, drop-unabhaengig)
- `gutachter/termine/[id]/actions:388` schreibt `faelle.polizei_aktenzeichen` — **Spalte existiert nicht** (claims-SSoT). Write schlaegt heute fehl.
- `flow/[token]/actions:1420` schreibt `faelle.vollmacht_datum` — **Spalte existiert nicht**. Dito.
-> Unabhaengig vom Drop fixen (Write entfernen / auf claims-Spalte repointen). Owner = jeweilige Lane (termine/flow), nicht Entity.

## W4 — INSERTS
- `convert-lead-to-claim:460` (`buildFallInsertFromLead`) = **der Converter-Insert = Cutover-Target. GATED** auf claims->bridge-Trigger (synthetische fall_id; existiert noch nicht — heute nur faelle->bridge-Sync `trg_sync_faelle_claim_bridge`). Bis Trigger steht, MUSS der Converter faelle weiter inserten.
- `admin/faelle/anlegen/actions:103` = manueller Admin-Fall-Create (Cutover analog).
- `claims/create-for-fall` = Legacy-faelle-Create-Pfad.
- Seeds (`seed-test-data`, `seed-testdata/route`, `lifecycle-seed`, `create-test-fall`) = test-only, ignorieren.

## W5 — DELETES
`_actions/core:46`, `cmm48-smoke/route`, `seed-testdata/route:91` = Fall-Delete (Cascade/Cleanup). Harmlos, stoppen beim Drop.

## Empfohlene Write-Retirement-Sequenz
1. **W3-Repoints** (OCR/cardentity/FIN/besichtigungsort -> vehicles/vehicle_vorschaeden/Party/gutachter_termine). Groesster Block. = die „(b) Seed / (c) OCR read-before-write"-Gates aus der Read-Map.
2. **2 Bonus-Bugs** fixen (polizei_aktenzeichen/vollmacht_datum-Writes).
3. **claims->bridge-Trigger** (CMM-49) -> entsperrt Converter-Cutover.
4. **Converter-Cutover** (W4: faelle-Insert raus aus convert-lead-to-claim + create-for-fall + admin-anlegen) = **Entity-File, auf Trigger gegated**.
5. **W1-Writer**: faelle.update-Zeilen entfernen (claims-Write bleibt).
6. **W2-Assignment** + **W5-Deletes** stoppen mit dem Drop.
7. **DROP TABLE faelle** + FKs.

## Status
Read-Scope (Plan 4.1a-4.7) KOMPLETT + Write-Retirement ~80% gebaut. Verbleibend = W3-Repoints + Converter-Cutover
(Entity-File, trigger-gated) + die mechanische W1-Zeilenentfernung. Alles CMM-49-Lane-Execution; Entity supportet.
