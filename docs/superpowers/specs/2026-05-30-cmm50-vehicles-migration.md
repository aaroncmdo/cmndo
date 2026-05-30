# CMM-50 (SP-E) — vehicles-Migration — Spec (re-sequenziert)

**Master:** CMM-44 (faelle-Drop) · **Ticket:** [CMM-50](https://linear.app/aaroncmndo/issue/CMM-50) (High) · **Position:** Phase-4-Unblocker (entsperrt Phase 4.2 fuer die Fahrzeug-Spalten der 4 schweren Views)
**Audit:** Workflow `wf_82364751-2a5` (3 Finder, 654k tokens) + Live-Probe `scripts/probe-cmm50-vehicles.mjs` (30.05.)
**Status dieses Docs:** SCOPING — noch kein Code. Implementierung in eigenen PRs nach Aaron-Review.

---

## 1 · Der Befund, der CMM-50 umdeutet

CMM-50 war als „Reader von `faelle.fahrzeug_*` auf `vehicles` umlenken" gedacht. **Der Audit zeigt: das geht so nicht — die `vehicles`-SSoT ist leer, weil der Write-Path nie gebaut wurde.**

Live-Stand (30.05.):

| Fakt | Wert |
|---|---|
| `vehicles` Zeilen | **0** |
| `claims.vehicle_id` | **75/75 NULL** |
| `claim_vehicle_involvements` | **0** |
| `faelle.vehicle_id`-Spalte | **existiert nicht mehr** (gedroppt) |
| `faelle.fahrzeug_*` non-null | alle 0 (fin_vin: 1) |
| `upsert_vehicle_by_fin`-RPC Caller in `src/` | **0** |

**Ursache:** AAR-773/AAR-810 (25.04.) bauten die vehicles-Infrastruktur (Tabelle, `*.vehicle_id`-Spalten, `upsert_vehicle_by_fin`-RPC, `claim_vehicle_involvements`) + **eine einmalige Backfill-Migration** (`20260425120300`). Die **Application-Layer-Verdrahtung kam nie**: die RPC hat 0 Caller, kein Code schreibt je `leads.vehicle_id` oder eine `vehicles`-Row. `convert-lead-to-claim.ts` liest `claims.vehicle_id` aus `lead.vehicle_id` (das runtime nie gesetzt wird) → immer NULL.

**Read-Seite ist fertig** (`get-kunde-faelle.ts`, `load-needed-phases.ts` lesen `claim_vehicle_involvements`+`vehicles` mit `faelle`-Snapshot-Fallback). **Write-Seite fehlt komplett.**

**Konsequenz:** Die ~8 Reader auf eine leere SSoT umzulenken wäre eine **Daten-Regression** (Fahrzeug-Anzeige, die heute aus faelle/claims-Snapshots kommt, verschwände). **Der Write-Path muss zuerst.** Das ist zugleich ein latenter **Produkt-Gap**: aktuell landet kein einziges Fahrzeug in der vehicles-SSoT.

---

## 2 · Reader-Inventar (de-noised: ~8 Files, nicht 55)

Der „55 GENUINE"-Count war statisch überzählt (gleiches Muster wie Phase 4.1). Echte Reader von `faelle`-Fahrzeug-Spalten:

| File | Portal | Quelle | Spalten |
|---|---|---|---|
| `lib/claims/get-kunde-faelle.ts` | kunde | direkt faelle | kennzeichen, fahrzeug_hersteller/modell/baujahr |
| `lib/fall/queries.ts` | admin/sv/kunde | View | kennzeichen, fahrzeug_hersteller/modell/baujahr |
| `lib/stammdaten/schema.ts` | lib | View | 13 (alle Fahrzeug-Edit-Felder) |
| `lib/makler/queries.ts` | makler | View | fahrzeug_*, kennzeichen, fin_vin, kilometerstand, erstzulassung |
| `lib/ai/briefing.ts` | sv | View `select *` | fahrzeug_*, kilometerstand, erstzulassung, kennzeichen |
| `app/faelle/[id]/ai-actions.ts` | admin/kb | View `select *` | fahrzeug_hersteller/modell, kennzeichen |
| `lib/email/google/flows.ts` | lib/email | direkt+View | fahrzeug_hersteller/modell, kennzeichen, lackfarbe_code |
| `lib/kanzlei/push-mandat.ts` | kanzlei | direkt faelle | firma_name, kennzeichen |

Die meisten lesen **über die Views** (`v_claim_full` / `v_faelle_mit_aktuellem_termin` / `faelle_kunde_view` / `faelle_sv_view`) → würden mit dem Phase-4.2-View-Repoint automatisch mitgehen. Nur 3 direkte faelle-Reads (get-kunde-faelle, email/flows, push-mandat).

---

## 3 · Writer-Inventar

| File | Trigger | Ziel |
|---|---|---|
| `lib/lead-fall-mapping.ts:buildFallInsertFromLead` → `convert-lead-to-claim.ts:442` | Lead-Konversion | kopiert Lead-Fahrzeug-Snapshots in `faelle` |
| `app/faelle/[id]/_actions/stammdaten.ts` (`updateFallField`, `saveFinVin`) | manuelle Edit | `faelle`-Fahrzeug-Spalten; saveFinVin triggert cardentity, schreibt aber kein vehicles |
| `lib/cardentity/enrich-fahrzeug.ts:82` | OCR/Cardentity (FIN) | `faelle`/`leads`-Spalten; **kein** vehicles, **kein** vehicle_id |
| `app/upload/zb1/[token]/actions.ts` | ZB1-OCR | `leads`-Spalten; **kein** leads.vehicle_id |
| `app/dispatch/leads/[id]/_actions/stammdaten.ts` | manuelle Edit (Lead) | `leads`-Spalten |
| `convert-lead-to-claim.ts:206/357/419` | Lead-Konversion | setzt claims/claim_parties/claim_vehicle_involvements.vehicle_id — **aus `lead.vehicle_id` (immer NULL)** |

**Keiner berührt `vehicles` oder befüllt `*.vehicle_id` zur Laufzeit.**

---

## 4 · Spalten-Domänen-Mapping (21 faelle-Fahrzeug-Spalten)

| faelle-Spalte | Domäne | Ziel |
|---|---|---|
| kennzeichen | vehicle | `vehicles.kennzeichen_aktuell` |
| fahrzeug_hersteller | vehicle | `vehicles.hersteller` |
| fahrzeug_modell | vehicle | `vehicles.modell_haupttyp` |
| fahrzeug_typ | vehicle | `vehicles.bauart` |
| fahrzeug_baujahr | vehicle | `vehicles.baujahr_monat` (Cast int→date/text klären) |
| fahrzeug_farbe | vehicle | `vehicles.farbe_klartext` |
| fin_vin | vehicle | `vehicles.fin` |
| hsn / tsn / erstzulassung | vehicle | `vehicles.hsn` / `.tsn` / `.erstzulassung` (1:1) |
| kilometerstand | vehicle | `vehicles.aktueller_kilometerstand` |
| **kennzeichen_buchstaben** | vehicle | **kein Pendant** → vehicles ADD oder aus kennzeichen ableiten |
| **fahrzeug_ausstattung** (jsonb) | vehicle | **kein Pendant** → vehicles ADD |
| **fin_quelle / fin_extrahiert_am** | vehicle (Provenance) | **kein Pendant** → vehicles ADD oder claims-Metadaten |
| **lackfarbe_code** | vehicle | **kein Pendant** → vehicles ADD (zu `farbcode`?) |
| leasinggeber_name | business | `claims.leasinggeber_name` (NICHT vehicles) |
| bank_name | business | `claims.finanzierung_bank` (NICHT vehicles) |
| ist_fahrzeughalter | halter | `claim_parties`/SP-C (NICHT vehicles) |
| firma_name | business/halter | `claim_parties`/SP-C |
| ust_id | business/halter | `claim_parties`/SP-C |

→ **~11 echte vehicle-Spalten** (5 mit Schema-Lücke in vehicles), **2 business→claims**, **3 halter→SP-C**.

---

## 5 · Re-Sequenzierung — 4 Sub-Phasen

### CMM-50.0 — Write-Path verdrahten (VORAUSSETZUNG, code-heavy, ~0 DDL)
`upsert_vehicle_by_fin` an den FIN-Gewinnungs-Punkten rufen + `vehicle_id` propagieren. **Kein Reader/View wird angefasst.** Verhaltens-additiv (vehicles füllt sich, Reader nutzen weiter faelle-Snapshots).
- **AK 0.1:** ZB1-OCR (`upload/zb1/[token]/actions.ts`) ruft nach FIN-Gewinnung `upsert_vehicle_by_fin` + setzt `leads.vehicle_id`.
- **AK 0.2:** `enrich-fahrzeug.ts` ruft bei FIN-Enrichment `upsert_vehicle_by_fin` + setzt `leads.vehicle_id` (Lead-Kontext) bzw. `claims.vehicle_id` (Fall-Kontext).
- **AK 0.3:** `saveFinVin` (faelle Stammdaten) ruft `upsert_vehicle_by_fin` + setzt `claims.vehicle_id`.
- **AK 0.4:** `convert-lead-to-claim.ts` propagiert vorhandenes `lead.vehicle_id` → claims.vehicle_id + claim_vehicle_involvements (Pfad existiert, wird durch 0.1 endlich gefüttert); Fallback: wenn `lead.fin` da aber kein vehicle_id, dort upserten.
- **AK 0.5:** Einmal-Backfill (Migration): für bestehende leads/claims mit `fin`/`fin_vin` aber ohne vehicle_id → vehicles-Row + vehicle_id setzen (live ~1 Datensatz — trivial, aber Pattern für Prod).
- **AK 0.6:** Verify: nach 0.1-0.5 hat ein neuer FIN-Lead → konvertierter Claim eine `vehicles`-Row + `claims.vehicle_id` gesetzt (Smoke: Lead mit FIN anlegen/konvertieren, vehicles-Row prüfen).
- **Voraussetzung-Check:** `leads.vehicle_id` existiert noch (verifizieren — `faelle.vehicle_id` ist gedroppt). RPC-Signatur `upsert_vehicle_by_fin` live lesen.

### CMM-50.1 — vehicles Schema-Lücke schließen (DDL)
- **AK 1.1:** `ALTER TABLE vehicles ADD COLUMN` für die vehicle-Domänen-Spalten ohne Pendant: `lackfarbe_code` (oder Mapping auf `farbcode` entscheiden), `fahrzeug_ausstattung` (jsonb), `fin_quelle`, `fin_extrahiert_am`, `kennzeichen_buchstaben`. Pro Spalte: ADD oder bewusst „bleibt auf claims"-Entscheid dokumentiert.
- **AK 1.2:** `baujahr_monat`-Typ vs `fahrzeug_baujahr` (int) — Cast-Strategie festlegen.

### CMM-50.2 — Domänen-Split (koordiniert mit SP-C / CMM-63)
- **AK 2.1:** `leasinggeber_name` → claims, `bank_name` → `claims.finanzierung_bank` (Ziele live verifizieren; ggf. schon vorhanden via CMM-65).
- **AK 2.2:** `ist_fahrzeughalter`, `firma_name`, `ust_id` → `claim_parties` (Halter-Partei) — **mit CMM-63/SP-C abstimmen** (Überlappung Halter-Domäne). Evtl. ganz an SP-C übergeben statt in CMM-50.

### CMM-50.3 — Reader-Relocate + View-Repoint (= Phase 4.2 Fahrzeug-Anteil)
**Erst nachdem CMM-50.0 vehicles befüllt.**
- **AK 3.1:** 4 Views (`v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`) sourcen Fahrzeug-Spalten aus `vehicles` via `claims.vehicle_id` (LEFT JOIN vehicles) statt `f.fahrzeug_*`. COALESCE-Fallback auf faelle-Snapshot während Übergang (bis faelle-Drop) — oder hart, falls vehicles dann verlässlich befüllt.
- **AK 3.2:** 3 direkte Reader (`get-kunde-faelle.ts`, `email/google/flows.ts`, `kanzlei/push-mandat.ts`) auf vehicles via vehicle_id umstellen.
- **AK 3.3:** Pre/Post-Parity + Portal-Smoke (SV-Besichtigung, Kunde „mein Auto", Admin, Makler) — Fahrzeug-Anzeige unverändert.

---

## 6 · Risiken

| Risiko | Mitigation |
|---|---|
| Reader auf leere SSoT → Fahrzeugdaten weg | **CMM-50.0 zuerst** (Write-Path); 50.3 erst nach befüllter SSoT; COALESCE-Fallback auf faelle-Snapshot in Views |
| `upsert_vehicle_by_fin`-Signatur unbekannt | Migration `20260425120400` lesen + live `\df upsert_vehicle_by_fin` vor 50.0 |
| Halter-Domäne überlappt SP-C | 50.2 mit CMM-63 koordinieren ODER ganz an SP-C delegieren |
| `claims.vehicle_id` vs `claim_vehicle_involvements` (1:1 vs 1:N) | Geschädigten-Fahrzeug = claims.vehicle_id; Gegner/weitere = claim_vehicle_involvements. Konvention in 50.0 festlegen |
| Write-Path berührt sensible Flows (Lead-Konversion, OCR) | Jede Sub-Phase eigener PR + Smoke; non-critical try/catch um upsert (darf Konversion nicht brechen) |
| baujahr int→date Cast | in 50.1 entscheiden, Precision-Cast in View |

---

## 7 · Quellen
- Linear CMM-50 (Audit-Kommentar 30.05.) · Workflow `wf_82364751-2a5` · Probe `scripts/probe-cmm50-vehicles.mjs`
- AAR-773-Migrationen `supabase/migrations/20260425120000..120400` · AAR-810 claims/claim_vehicle_involvements
- Audit-Doc `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` §R.4/§R.5 · Memory `project_cmm50_vehicles_scoping`
