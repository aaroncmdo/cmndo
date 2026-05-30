# CMM-50 (SP-E) — vehicles-Migration — Implementation Plan (FINAL, adversarial-verifiziert)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkboxes (`- [ ]`).
> **DDL-Regel (AGENTS.md Regel 2):** Schema-Änderungen NUR via `apply_migration`, dann `list_migrations` → File == recorded version.
> **Status:** Spec FINALISIERT + verifiziert (`docs/superpowers/specs/2026-05-30-cmm50-vehicles-migration.md`) — 4 Aaron-Entscheidungen + 10 Verify-Korrekturen (`wf_093f7c2e-763`). 4 Sub-Phasen = 4 PR-Stränge. **Reihenfolge ist bindend** (50.0 vor 50.3). Diese Session = Scoping; Code in Folge-Sessions.

**Goal:** `faelle`-Fahrzeug-Domäne nach `vehicles` (+ business→claims) migrieren — aber **zuerst den fehlenden vehicles-Write-Path bauen** (50.0, als eigenständiges Produkt-Feature vorgezogen), damit die SSoT befüllt wird. Entsperrt den Fahrzeug-Anteil von Phase 4.2 (4 schwere Views) und ist harter blockedBy für CMM-49 (faelle DROP). **Halter-Domäne an SP-C/CMM-63 delegiert** (nicht in diesem Plan).

**Tech Stack:** Next.js RSC · Supabase-js · `upsert_vehicle_by_fin`-RPC (existiert, 0 Caller, schreibt nur 8 Felder) · DDL via Plugin.

---

## Entscheidungen (Aaron 30.05., bindend — Detail im Spec §0)
1. **Halter** → **SP-C/CMM-63 delegiert**, raus aus CMM-50. Ziel-Spalten `claim_parties.ist_halter`/`firma`/`ust_id` existieren + werden bei Konversion bereits teilbefüllt. **Caveat:** CMM-63 `Done`, SP-C3-Halter offen → Aaron klärt reopen vs neues Issue.
2. **`lackfarbe_code`** → **`vehicles.farbcode`** (bestehend, kein ADD) → fällt aus 50.1. Live von 1 Reader gelesen (email/flows).
3. **50.0** = eigenständiges, sofort shippbares Produkt-Feature (rein additiv, null Regressionsrisiko).
4. business (`leasinggeber_name`/`bank_name`) bleibt in 50.2 → **neue claims-Spalten** (Ziele live FEHLEND, CMM-65 ≠ Abdeckung).

---

## Task 0 — Pre-Flight (vor JEDER Implementierung)

- [ ] **0.1** Live-Re-Probe (`scripts/probe-cmm50-vehicles.mjs`): `vehicles`=0, `claims.vehicle_id`-NULL-Count, `leads.vehicle_id` (uuid), `leads.fin` (text). *(Stand 30.05. unten — parallele Sessions migrieren; vor Implementierung erneut prüfen.)*
- [x] **0.2** RPC-Signatur gelesen (`20260425120400`): `upsert_vehicle_by_fin(p_fin, p_kennzeichen, p_hsn, p_tsn, p_hersteller, p_modell, p_owner_id, p_quelle, p_kilometerstand) RETURNS UUID`, SECURITY DEFINER, ON CONFLICT(fin) DO UPDATE, **`p_owner_id` triggert `vehicle_ownership_history`**. **Schreibt nur 8 Felder** — keine Farbe/Bauart/Baujahr/Erstzulassung (Spec §2).
- [ ] **0.3** **Vehicle-Link-Konvention (korrigiert nach Verify — convert-lead schreibt 3 Surfaces, nicht either/or):**
  - **Geschädigten-Fahrzeug** → `claims.vehicle_id` **+** `claim_parties(geschaedigter).vehicle_id` **+** `claim_vehicle_involvements(rolle='geschaedigt')` — **alle drei synchron** (so macht es convert-lead-to-claim heute schon, Z.206/357/419).
  - **Gegner/weitere** → `claim_parties(rolle).vehicle_id` **+** `claim_vehicle_involvements(other rolle)`.
  - `claim_parties.vehicle_id` (uuid) existiert. Helper `ensureVehicleFromFin` hält für Geschädigt alle drei synchron. In Helper-JSDoc dokumentieren.

**Grounding-Snapshot 30.05.** (für Folge-Session): vehicles 0 Zeilen / 45 Spalten (farbcode+farbe_klartext+ist_metallic) · claims.vehicle_id 75/75 NULL · cvi 0 · faelle.vehicle_id gedroppt · leads.vehicle_id uuid ✓ · leads.fin text ✓ (kein fin_vin) · RPC 0 Caller in src/ · claim_parties hat ist_halter/firma/ust_id/ist_gewerbe/vehicle_id ✓ · claims.{leasinggeber_name,finanzierung_bank,bank_name} FEHLEN · vehicles.erstzulassung=date vs faelle.erstzulassung=text · vehicles.baujahr_monat=date vs faelle.fahrzeug_baujahr=int.

---

## CMM-50.0 — Write-Path verdrahten (PR 1, eigenständiges Feature, code-heavy, ~1 Backfill-Migration)

**Architektur:** Zentraler Helper `ensureVehicleFromFin({ fin, snapshot, ownerId?, db })` (neu, `src/lib/vehicles/ensure-vehicle.ts`) ruft `upsert_vehicle_by_fin` + gibt vehicle-UUID zurück. Alle Call-Sites nutzen ihn. Non-critical try/catch (darf Konversion/OCR nicht brechen). **Rein additiv — kein Reader/View berührt → keine Regression, unabhängig vom faelle-Drop shippbar.**

- [ ] **1.1 Helper** `src/lib/vehicles/ensure-vehicle.ts` — `ensureVehicleFromFin` wraps RPC, Result-Object `{ ok, vehicleId?, error? }`. JSDoc: 3-Surface-Konvention (0.3). **RPC deckt nur 8 Felder** → Snapshot-Restfelder erst 50.1. **Owner-Auflösung pro Call-Site:** ZB1/OCR/Lead = `ownerId=undefined` (kein Account); convert-lead = Kunde-user_id; saveFinVin/enrich(Fall) = Geschädigter-user_id. (Owner triggert ownership_history — falscher Owner = Ghost-Rows.)
- [ ] **1.2 ZB1-OCR** `app/upload/zb1/[token]/actions.ts` (~:163-182): nach FIN-Gewinnung → `ensureVehicleFromFin` (ownerId=undefined) → `leads.update({ vehicle_id })`.
- [ ] **1.3 Cardentity** `lib/cardentity/enrich-fahrzeug.ts` (table-parametrisiert, :28-38/:82): **Lead-Zweig** → `leads.vehicle_id`; **Fall-Zweig** → erst `faelle.claim_id` auflösen (kein faelle.vehicle_id), dann `claims.vehicle_id`. ⚠ Per-Zweig-Asymmetrie. ⚠ Datei nutzt Legacy-`{success}`-Shape (:40/:83) — Helper-`{ok}` an der Call-Boundary adaptieren (oder Datei-Shape mitmigrieren, AGENTS.md „konsistent pro File").
- [ ] **1.4 Manuelle FIN** `app/faelle/[id]/_actions/stammdaten.ts:saveFinVin` (:341-377): nach `fin_vin`-Write → **`faelle.claim_id` auflösen** (Pattern aus `updateFallField` :189-194 — saveFinVin macht den Hop heute NICHT) → `ensureVehicleFromFin` → `claims.vehicle_id`.
- [ ] **1.5 Lead-Konversion** `lib/leads/convert-lead-to-claim.ts` (:206/:357/:419): wenn `lead.vehicle_id` leer aber `lead.fin` da → `ensureVehicleFromFin` (ownerId=Kunde-user_id); dann **alle drei Surfaces** füttern (claims/claim_parties/cvi — Pfade existieren, werden jetzt gefüttert). **`leads.fin` (nicht fin_vin).**
- [ ] **1.6 Backfill-Migration** (`apply_migration`): bestehende leads/claims mit fin aber ohne vehicle_id → vehicles-Row + vehicle_id (IS-NULL-guarded). Live ~1 Datensatz. File == recorded version.
- [ ] **1.7 Verify:** Lead mit FIN anlegen → konvertieren → `vehicles`-Row + `claims.vehicle_id` + `claim_parties.vehicle_id` + `cvi`-Row. Smoke + DB-Read. Build grün.
- [ ] **1.8** PR gegen staging. **Kein Reader/View berührt** → keine Regression, rein additiv. *(Eigenständig als Produkt-Feature mergebar, unabhängig von 50.1–50.3.)*

## CMM-50.1 — vehicles Schema-Lücke (PR 2, DDL) — nur 4 Spalten (lackfarbe raus)

- [ ] **2.1** `ALTER TABLE vehicles ADD COLUMN`: `kennzeichen_buchstaben text` (oder aus `kennzeichen_aktuell` ableiten), `fahrzeug_ausstattung jsonb`, `fin_quelle text`, `fin_extrahiert_am timestamptz`. **`lackfarbe_code` → `vehicles.farbcode` (KEIN ADD).**
- [ ] **2.2 Casts:** `fahrzeug_baujahr` (int) → `baujahr_monat` (date) **UND** `erstzulassung` (text) → `vehicles.erstzulassung` (date) — Parse/Cast + COALESCE-Fallback bei nicht-parsebarem Freitext (faelle.erstzulassung ist bewusst text).
- [ ] **2.3 Snapshot-Verdrahtung:** RPC um farbcode/farbe_klartext/bauart/baujahr_monat/erstzulassung erweitern **ODER** Helper macht Secondary-`UPDATE vehicles SET …`. Achtung: `aktueller_kilometerstand_at` setzt die RPC — Secondary-UPDATE nicht clobbern. Helper ausbauen.
- [ ] **2.4** Migration-File == recorded version. Verify Spalten live.

## CMM-50.2 — Business-Split (PR 3, DDL: 2 neue claims-Spalten) — Halter delegiert

- [ ] **3.1** `claims.leasinggeber_name` (1:1 aus faelle.leasinggeber_name) + `claims.finanzierung_bank` (**aus faelle.bank_name — bewusste Umbenennung; KEIN `claims.bank_name`!**) **ADD** + Backfill. *(Beide live FEHLEND — NICHT via CMM-65, das ist Done und deckte nur honorar/provision/zahlungsweg/timestamps ab.)*
- [ ] **3.2** Writer `leasinggeber_name`/`bank_name` (lead-fall-mapping, stammdaten) → claims statt faelle. revalidatePath nachziehen.
- [ ] **3.3 (DELEGIERT — nicht in CMM-50)** Halter → `claim_parties.ist_halter`/`firma`/`ust_id` = **SP-C/CMM-63-Folge (SP-C3)**. claim_parties wird bei Konversion bereits teilbefüllt (convert-lead :350-352) → SP-C3 = Relocate der **faelle-Edit-Pfad**-Snapshot-Spalten, nicht der Konversions-Write. Mapping s. Spec §4. **Aaron-Klärung:** CMM-63 reopen vs neues SP-C3-Issue.

## CMM-50.3 — Reader-Relocate + View-Repoint (PR 4 = Phase 4.2 Fahrzeug-Anteil)

**Gate: CMM-50.0 live + vehicles wird befüllt.**
- [ ] **4.1 Views** `v_claim_full` / `v_faelle_mit_aktuellem_termin` / `faelle_kunde_view` / `faelle_sv_view`: Fahrzeug-Spalten aus `vehicles` via `LEFT JOIN vehicles ON vehicles.id = c.vehicle_id` (COALESCE-Fallback auf `f.fahrzeug_*` bis faelle-Drop). **Verify-Befunde:** alle 4 sourcen heute `f.fahrzeug_*`, 0 referenzieren vehicles. **`v_faelle_mit_aktuellem_termin` = voller 10-Spalten-Snapshot** (inkl. fahrzeug_farbe/erstzulassung/kilometerstand/fahrzeug_ausstattung/lackfarbe_code) — alle 10 repointen inkl. `lackfarbe_code`→`farbcode`. Template: `v_claim_listing` (macht den Join bereits). Join-Richtung: `v_claim_full`=`FROM claims c LEFT JOIN faelle f`, andere 3 umgekehrt; `c.vehicle_id` in allen 4 als Passthrough da. **CREATE OR REPLACE auf AKTUELLER Shape** (Migration `20260528192402` baute Views auf `v_claim_phase`/main_phase/sub_phase um — Phase-Tail nicht regredieren). `security_invoker=false` + Grants (Phase-4.1-Template).
- [ ] **4.2 direkte Reader (4, nicht 3 — Verify-Korrektur):** `get-kunde-faelle.ts`, `email/google/flows.ts`, `kanzlei/push-mandat.ts`, **`makler/copilot-prompt.ts`** (`from('faelle').select('*')` :86, fahrzeug_* :167/:202) auf vehicles via vehicle_id. **Re-grep** (Inventar kuratiert: 89 fahrzeug-Refs / 222 from('faelle')). `lib/stammdaten/schema.ts` braucht KEINE eigene Änderung (kein DB-Reader, reine Field-Schema — nur Caller-Selects zählen).
- [ ] **4.3** Pre/Post-Parity (View-Output) + Portal-Smoke (SV-Besichtigung, Kunde „mein Auto", Admin, Makler) — Fahrzeug-Anzeige byte-gleich.
- [ ] **4.4** PR gegen staging. Danach: `faelle.fahrzeug_*` haben 0 Reader → in Phase 6 (CMM-49) droppbar — an CMM-49 melden.

---

## Reihenfolge / Abhängigkeiten

```
50.0 (Write-Path, Feature) ──┬──> 50.1 (Schema-Lücke 4 Spalten + Casts + Snapshot-Verdrahtung) ──┐
                             │                                                                    ├──> 50.3 (Reader+View) ──> entsperrt Phase 4.2 Fahrzeug ──> CMM-49
                             └──> 50.2 (business→claims ADD)
                                  Halter (50.2.3) ⟶ SP-C/CMM-63 (parallel, eigenes Issue)
```

50.0 ist hartes Gate für 50.3 (vehicles muss befüllt sein). 50.1/50.2 nach 50.0 parallel. Halter delegiert. CMM-50 als Ganzes = blockedBy-Voraussetzung für CMM-49 (faelle DROP).

## Self-Review
- Re-Sequenzierung verhindert die Daten-Regression. 50.0 rein additiv + als eigenständiges Feature vorgezogen (Entscheidung 4).
- lackfarbe→farbcode (E2) + Halter-Delegation (E1) reduzieren 50.1/50.2 (50.1: 5→4 ADDs; 50.2: Halter raus).
- RPC-Minimalität (8 Felder) + 2 Casts (baujahr int→date, erstzulassung text→date) explizit in 50.0/50.1.
- 3-Surface-vehicle_id-Konvention an den Live-Code (convert-lead) angeglichen (Verify-Korrektur — war fälschlich either/or).
- Fall-side Writer (enrich/saveFinVin) brauchen `faelle.claim_id`-Hop (kein faelle.vehicle_id) — Verify-Korrektur, im Plan markiert.
- business-Ziele live FEHLEND → 50.2 ADD real; Rename-Falle bank_name→finanzierung_bank markiert.
- 4. direkter Reader (`makler/copilot-prompt.ts`) ergänzt; `stammdaten/schema.ts` als Nicht-Reader entlarvt; View-Attribution korrigiert.
- Phase-4.1-Template (DEFINER-Restore + Parity-Verify) direkt in 50.3.
- **Offen für Aaron:** (a) Halter-Issue (CMM-63 reopen vs neu), (b) ob 50.0 ein eigenes Produkt-Feature-Ticket bekommt (Entscheidung 4 legt es nahe; Issue noch nicht angelegt).
</content>
