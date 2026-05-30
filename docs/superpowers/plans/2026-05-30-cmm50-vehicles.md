# CMM-50 (SP-E) — vehicles-Migration — Implementation Plan (re-sequenziert)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkboxes (`- [ ]`).
> **DDL-Regel (AGENTS.md Regel 2):** Schema-Änderungen NUR via `apply_migration`, dann `list_migrations` → File == recorded version.
> **Status:** Spec gereviewt (`docs/superpowers/specs/2026-05-30-cmm50-vehicles-migration.md`). 4 Sub-Phasen = 4 PR-Stränge. **Reihenfolge ist bindend** (50.0 vor 50.3).

**Goal:** `faelle`-Fahrzeug-Domäne nach `vehicles` (+ business→claims, halter→SP-C) migrieren — aber zuerst den fehlenden vehicles-Write-Path bauen, damit die SSoT überhaupt befüllt wird. Entsperrt den Fahrzeug-Anteil von Phase 4.2 (4 schwere Views).

**Tech Stack:** Next.js RSC · Supabase-js · `upsert_vehicle_by_fin`-RPC (existiert, 0 Caller) · DDL via Plugin.

---

## Task 0 — Pre-Flight (vor JEDER Implementierung)

- [ ] **0.1** Live verifizieren (PostgREST-Probe `scripts/probe-cmm50-vehicles.mjs` re-run): `vehicles`=0, `claims.vehicle_id` NULL-Count, **`leads.vehicle_id` existiert?** (faelle.vehicle_id ist gedroppt — leads muss noch da sein, sonst ändert sich 50.0).
- [ ] **0.2** RPC-Signatur lesen: `supabase/migrations/20260425120400_aar773_upsert_vehicle_by_fin_rpc.sql` — Parameter (p_fin, p_hersteller, …), Rückgabe (vehicle-UUID?), Halterwechsel-Logik. Bestimmt die Call-Sites.
- [ ] **0.3** Konvention festlegen: Geschädigten-Fahrzeug → `claims.vehicle_id` (1:1); Gegner/weitere → `claim_vehicle_involvements` (1:N). Dokumentieren.

---

## CMM-50.0 — Write-Path verdrahten (PR 1, code-heavy, ~1 Backfill-Migration)

**Architektur:** Ein zentraler Helper `ensureVehicleFromFin({ fin, snapshot, db })` (neu, `src/lib/vehicles/ensure-vehicle.ts`) ruft `upsert_vehicle_by_fin` + gibt vehicle-UUID zurück. Alle 4 Call-Sites nutzen ihn (Redundanz-Check: ein Helper statt 4× inline). Non-critical try/catch (darf Konversion/OCR nicht brechen).

- [ ] **1.1 Helper** `src/lib/vehicles/ensure-vehicle.ts` — `ensureVehicleFromFin` wraps RPC, Result-Object `{ ok, vehicleId?, error? }`.
- [ ] **1.2 ZB1-OCR** `app/upload/zb1/[token]/actions.ts` (~Z.163-184, nach runZB1Ocr): bei FIN → `ensureVehicleFromFin` → `leads.update({ vehicle_id })`.
- [ ] **1.3 Cardentity** `lib/cardentity/enrich-fahrzeug.ts` (~Z.82): bei FIN-Enrichment → ensureVehicleFromFin → `leads.vehicle_id` (table='leads') bzw. `claims.vehicle_id` (Fall-Kontext).
- [ ] **1.4 Manuelle FIN** `app/faelle/[id]/_actions/stammdaten.ts:saveFinVin` (~Z.341-382): nach fin_vin-Write → ensureVehicleFromFin → `claims.vehicle_id`.
- [ ] **1.5 Lead-Konversion** `lib/leads/convert-lead-to-claim.ts` (vor claimsInsert ~Z.141): wenn `lead.vehicle_id` leer aber `lead.fin` da → ensureVehicleFromFin; dann claims.vehicle_id + claim_vehicle_involvements (Pfad Z.206/419 existiert, wird jetzt gefüttert).
- [ ] **1.6 Backfill-Migration** (`apply_migration`): bestehende leads/claims mit fin aber ohne vehicle_id → vehicles-Row + vehicle_id (re-run der AAR-773-Backfill-Logik, IS-NULL-guarded). Live ~1 Datensatz; Pattern für Prod.
- [ ] **1.7 Verify:** Lead mit FIN anlegen → konvertieren → `vehicles`-Row existiert + `claims.vehicle_id` gesetzt + `claim_vehicle_involvements`-Row. Smoke + DB-Read. Build grün.
- [ ] **1.8** PR gegen staging. **Kein Reader/View berührt** → keine Regression möglich, rein additiv.

## CMM-50.1 — vehicles Schema-Lücke (PR 2, DDL)

- [ ] **2.1** Pro lückenhafte Spalte entscheiden + `ALTER TABLE vehicles ADD COLUMN`: `lackfarbe_code` (vs Mapping auf bestehendes `farbcode`), `fahrzeug_ausstattung jsonb`, `fin_quelle text`, `fin_extrahiert_am timestamptz`, `kennzeichen_buchstaben text`. Begründung je Spalte im Migration-Header.
- [ ] **2.2** `baujahr_monat` (vehicles) vs `fahrzeug_baujahr` (int): Cast-Strategie + ggf. Helfer-Spalte.
- [ ] **2.3** Helper `ensureVehicleFromFin` (aus 50.0) um die neuen Felder erweitern (Snapshot → vehicles).
- [ ] **2.4** Migration-File == recorded version. Verify Spalten live.

## CMM-50.2 — Domänen-Split (PR 3, koordiniert mit CMM-63/SP-C)

- [ ] **3.1** Ziele live verifizieren: `claims.leasinggeber_name`? `claims.finanzierung_bank`? (ggf. via CMM-65 schon da). Falls fehlend: ADD.
- [ ] **3.2** Writer `leasinggeber_name`/`bank_name` (lead-fall-mapping, stammdaten) → claims statt faelle.
- [ ] **3.3** `ist_fahrzeughalter`/`firma_name`/`ust_id`: **Entscheidung mit Aaron/SP-C** — in CMM-50 nach claim_parties ziehen ODER an CMM-63 delegieren. Default-Empfehlung: an SP-C delegieren (Halter-Domäne gehört dorthin), in CMM-50 nur referenzieren.

## CMM-50.3 — Reader-Relocate + View-Repoint (PR 4 = Phase 4.2 Fahrzeug-Anteil)

**Gate: CMM-50.0 live + vehicles wird befüllt.**
- [ ] **4.1** Views `v_claim_full` / `v_faelle_mit_aktuellem_termin` / `faelle_kunde_view` / `faelle_sv_view`: Fahrzeug-Spalten aus `vehicles` via `LEFT JOIN vehicles ON vehicles.id = c.vehicle_id` (COALESCE-Fallback auf `f.fahrzeug_*`-Snapshot bis faelle-Drop). CREATE OR REPLACE, Shape unverändert, `security_invoker=false` explizit + Grants (Phase-4.1-Template).
- [ ] **4.2** 3 direkte Reader (`get-kunde-faelle.ts`, `email/google/flows.ts`, `kanzlei/push-mandat.ts`) auf vehicles via vehicle_id.
- [ ] **4.3** Pre/Post-Parity (View-Output) + Portal-Smoke (SV-Besichtigung, Kunde „mein Auto", Admin, Makler) — Fahrzeug-Anzeige byte-gleich.
- [ ] **4.4** PR gegen staging. Danach: `faelle.fahrzeug_*` haben 0 Reader → in Phase 6 droppbar (an CMM-49 melden).

---

## Reihenfolge / Abhängigkeiten

```
50.0 (Write-Path)  ──┬──> 50.1 (Schema-Lücke)  ──┐
                     │                            ├──> 50.3 (Reader+View) ──> entsperrt Phase 4.2 Fahrzeug
                     └──> 50.2 (Domain-Split, ∥ SP-C/CMM-63)
```

50.0 ist hartes Gate für 50.3. 50.1/50.2 können parallel nach 50.0. 50.2 ggf. ganz an SP-C.

## Offene Entscheidungen für Aaron (im Spec-Review zu klären)
1. **50.2 Halter-Spalten** (ist_fahrzeughalter/firma_name/ust_id): in CMM-50 oder an SP-C/CMM-63 delegieren?
2. **lackfarbe_code**: neue vehicles-Spalte oder auf bestehendes `farbcode` mappen?
3. **Write-Path-Priorität:** 50.0 ist auch ein Produkt-Gap-Fix (kein Fahrzeug in SSoT) — als eigenständiges Feature vorziehen, unabhängig vom faelle-Drop?

## Self-Review
- Re-Sequenzierung verhindert die Daten-Regression (Reader auf leere SSoT). 50.0 rein additiv.
- Reader-Count realistisch (~8, meist via View) — 50.3 ist klein, sobald Views repointet.
- Phase-4.1-Template (DEFINER-Restore + Parity-Verify) direkt in 50.3 wiederverwendet.
