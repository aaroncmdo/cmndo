# HANDOFF — CMM Entity-Model (claim=SSoT, globale Entitäten, Rolle-pro-Claim)

**Stand 2026-06-03 ~16:00. Autor: Entity-Model-Session. Für: die nächste (Wiring-)Session.**
Dieses Dokument ist der **Einstiegspunkt**. Spec im Detail: `docs/03.06.2026/cmm-entity-model-target-spec.md` (PR #2348). Memory: `project_cmm_entity_model.md`, `project_cmm49_drop_runway.md`, `feedback_drop_verification_grep.md`.

DB-Projekt: **`paizkjajbuxxksdoycev`** (Claimondo-v2; **prod+staging teilen die DB**). DDL **nur via Supabase-Plugin `apply_migration`** (Regel 2), File 1:1 nach getrackter Version benennen.

---

## 🌟 NORTH STAR
**Der Claim ist das Rückgrat (SSoT). Alle „Dinge der Welt" sind globale, eindeutige, claim-übergreifend wiederverwendbare Entitäten. Der Claim ordnet pro Fall nur die ROLLE zu. Keine semantische Dopplung — flache Spalten sterben.**

Konkret:
- **Personen** (`personen`, NEU) — eine Zeile pro realer Mensch. Der Schädiger heute kann morgen unser Kunde sein → **dieselbe Person über Claims**. Rolle pro Claim via `claim_parties` (Person↔Claim-Rolle-Link).
- **Fahrzeuge** (`vehicles`, Identität = FIN) — ein Auto in mehreren Claims; Rolle pro Claim via `claim_vehicle_involvements.rolle` (geschaedigter/verursacher/mietwagen).
- **Versicherer** (`versicherungen`), **Sachverständige** (`sachverstaendige`), **Werkstätten** (`werkstaetten`), **Mietwagenunternehmen** (`mietwagenunternehmen`, NEU), **Personal** (`profiles`) — alle global, verlinkt per typisierter FK + Rolle.
- **Produzierte Werte** (Schadenhöhe) leben in ihrer Entität (`gutachten`); `claims` hält nur dünne **Rollups** (`schadens_hoehe_netto`).
- **`claims`** behält nur denormalisierte Schnell-Pointer (`geschaedigter_user_id`, `vehicle_id`, `sv_id`, `kundenbetreuer_id`).

---

## 🗺️ MASTER PLAN (Phasen)

| Phase | Inhalt | Status |
|---|---|---|
| **0** | Dedup-Decision (278 faelle-Spalten→Heimat), Bridge, CMM-63-Reconcile | ✅ done (#2343/#2344/#2346) |
| **1** | **Additive** Entity-Foundation (Tabellen + Links + Rollen) | ✅ **done** (#2353) |
| **2a** | Backfill `personen` aus `claim_parties` + `person_id`-Link | ✅ **done** (#2353) |
| **2b** | Backfill restliche Entitäten (Fahrzeuge, Gegner-Parteien, Versicherer-Links, Werkstatt/Mietwagen) aus den flachen faelle/claims-Daten | 🔜 **NEXT** (Daten, weitgehend safe) |
| **3** | **Writer-Rewiring** — `convert-lead-to-claim` & Co. befüllen Entitäten *vorwärts* | 🔴 SUPERVISED (Hotpath) |
| **4** | **Reader-Repoint** auf die Entitäten/Views | 🔴 SUPERVISED |
| **5** | **Flat-Drop** (claim_parties-Personfelder, `parteien`-Tabelle, faelle-Personen/Fahrzeug/VS-Spalten) | 🔴 SUPERVISED (Pre-Drop-Verify!) |

**Parallel-Strecken (eigene Owner, koordinieren):**
- **CMM-49 `DROP TABLE faelle`** — eigene Strecke (`project_cmm49_drop_runway.md`); Entity-Wiring liefert die Heimaten, blockt sich aber nicht gegenseitig.
- **Termin-Engine-Konsolidierung (#8)** — `termine` wird aktiv von anderer Strecke gebaut (assignee/belegung). EINE Engine + Lifecycle (Verlegung) = Aaron-Entscheid, aber **koordinierter Track**, nicht solo.

---

## ✅ DONE in dieser Session (verifiziert)

**Migrationen (alle live appliziert, project paizkjajbuxxksdoycev):**
| Version | Name | Effekt |
|---|---|---|
| 20260603134850 | cmm49_p2_drop_legacy_faelle_views | ⚠️ Drop (→ **reverted**, s. Incident) |
| 20260603140559 | cmm49_faelle_claim_bridge_table | `faelle_claim_bridge` (fall_id→claim_id, 75/75) |
| 20260603140629 | cmm49_v_claim_listing_via_bridge | v_claim_listing faelle-frei |
| 20260603141829 | cmm49_hotfix_restore_faelle_kunde_sv_views | **Incident-Restore** |
| 20260603143947 | cmm63_reconcile_geschaedigter_mismatch | 1 Mismatch behoben → kunde_id==geschaedigter_user_id (75/75) |
| 20260603152823 | cmm_entity_personen_registry | **`personen`** (24 Sp., RLS) |
| 20260603153554 | cmm_entity_mietwagenunternehmen | **`mietwagenunternehmen`** (13 Sp.) |
| 20260603153612 | cmm_entity_foundation_links_and_roles | werkstaetten+geo/iso/AP; repairs+vehicle_id; claim_mietwagen+vehicle_id/+unternehmen; claim_parties+person_id; involvements.rolle+=mietwagen |
| 20260603154118 | cmm_entity_personen_backfill_from_claim_parties | personen=73, claim_parties 73/73 gelinkt |

**Offene PRs (gegen staging):** #2353 (Foundation+Backfill, **zuerst mergen**) · #2348 (Spec) · #2346 (CMM-63) · #2344 (Bridge) · #2343 (Dedup+Incident-Revert).
**Branches:** kitta/cmm-entity-personen (#2353) · kitta/cmm-entity-model-spec (#2348) · kitta/cmm63-reconcile-geschaedigter (#2346) · kitta/cmm49-bridge-listing (#2344) · kitta/cmm49-p2-faelle-dedup (#2343).

---

## 💡 ERKENNTNISSE (wichtig für die nächste Session)

1. **Rollen-Vokabular ist schon reich** (nicht 'gegner'!): `claim_parties.rolle` ∈ {`geschaedigter`, **`verursacher`** (=Schädiger), `fahrer_nicht_halter`, `beifahrer`, `zeuge`, `gegner_airdrop`, `gutachter_gegen`, `versicherungssachbearbeiter`}. `claim_vehicle_involvements.rolle` ∈ {geschaedigter, **verursacher**, beteiligter, unbekannt, **mietwagen**(neu)}. → **Gegner-Normalisierung nutzt `verursacher`/`gegner_airdrop`.** Airdrop-CHECK koppelt `airdrop_token` an `rolle='gegner_airdrop'`.
2. **Entity-Tabellen existieren, sind aber Skelett** — der Build = **befüllen + verdrahten**, nicht erstellen. vehicles=1 row, versicherungen=95 (0 verlinkt), gutachten alle Beträge + claims-Rollup. `werkstaetten`/`repairs`/`claim_mietwagen` existieren (repairs=claim×werkstatt×kosten; brauchten vehicle_id).
3. **`parteien` (legacy flach: name/adresse/versicherung_name, fall_id+claim_id) = Doppeltabelle neben `claim_parties`** → muss sterben (Daten nach personen+claim_parties).
4. **Person-Dedup (Aaron-Entscheid):** Account = `user_id` (zuverlässig); **ohne Account KEIN Auto-Merge** (DSGVO/Falsch-Merge) — Wiedererkennung via Account-Link (Airdrop) + optional späteres Admin-Merge-Tool.
5. **CMM-63 = EINE Kunden-Spalte:** `claims.geschaedigter_user_id` (== faelle.kunde_id, 75/75 nach Reconcile). faelle.kunde_id stirbt.
6. **`faelle_claim_bridge`** (fall_id→claim_id) entkoppelt den Route-Key vom faelle-Drop.
7. **LIVE-INCIDENT-LEHRE** ([[feedback_drop_verification_grep]]): Drop-Verifikation **NIE per abgeschnittenem Content-Grep** — `database.types.ts`-Metadata überflutete den Grep, 4 echte `.from()`-Consumer übersehen → faelle_kunde/sv_view fälschlich gedroppt → Prod-Incident. Recovery: exakte View-Def via `pg_get_viewdef` aus einem **Preview-Branch ohne die Drop-Mig** geholt. **Vor JEDEM Drop:** `from\(['"]<obj>['"]\)` ungekappt + types.ts excl. + DB-Dependency-Check.
8. **Supabase-Preview-Trigger:** frischer Branch mit Migration im **ersten** Commit → Preview läuft; docs-first-Commit + Migration nachgeschoben → Preview „skipping". Für gegatete Migs: eigener Branch, Migration zuerst.

---

## 🔜 NÄCHSTE TODOs (in Reihenfolge)

**Sofort (safe):**
1. **#2353 reviewen/mergen** (rein additiv + Backfill, risikolos) — entsperrt den Rest.

**Phase 2b — Entity-Backfills (Daten, weitgehend safe, kein Consumer):**
2. **Fahrzeuge:** `vehicles` aus `faelle.fahrzeug_*`/`kennzeichen*`/`fin_vin`/`hsn`/`tsn`/`erstzulassung`/`cardentity_report` befüllen (FIN-Upsert via `upsert_vehicle_by_fin`-RPC), `claim_vehicle_involvements(rolle='geschaedigter')` + `claims.vehicle_id` setzen. (Daten dünn/Test — wenig zu migrieren, Mechanik zählt.)
3. **Gegner:** aus `faelle.gegner_*` → `personen` + `claim_parties(rolle='verursacher')` + (Gegner-Fahrzeug) `vehicles`+`involvement(rolle='verursacher')` + `versicherungen`-Link via `claim_parties.versicherung_id` (+ versicherungsnummer/aktenzeichen als Partei-Attribut).
4. **Werkstatt/Mietwagen:** `werkstaetten`-Geo/ISO/AP befüllen (für Termin-Engine); `claim_mietwagen.vehicle_id` + `mietwagenunternehmen` befüllen wo Daten da.

**Phase 3 — Writer-Rewiring (🔴 SUPERVISED, Hotpath, aar-939 abstimmen):**
5. `convert-lead-to-claim.ts` & Konversions-/Embed-Writer: bei jeder neuen Konversion **Entitäten** schreiben (personen+claim_parties.person_id; vehicles+involvement; gegner; versicherung). OCR-Writer (`ocr-fahrzeugschein`/`ocr-trigger`) → vehicles/personen statt flach.
6. `parteien`-Schreiber (falls noch welche) → `claim_parties`/`personen`.

**Phase 4 — Reader-Repoint (🔴 SUPERVISED):**
7. Personen-/Fahrzeug-/Gegner-/VS-Reader auf Entitäten/Views. Views (`v_claim_full` etc.) Parteien/Fahrzeuge als jsonb_agg exposen (Muster `parties`/`vehicle_involvements` existiert).

**Phase 5 — Flat-Drop (🔴 SUPERVISED, Pre-Drop-Verify Pflicht):**
8. Drop: `claim_parties`-Personfelder (nachdem person_id-Reads stehen), `parteien`-Tabelle, faelle-Personen/Fahrzeug/VS-Spalten. **Jeder Drop: ungekappter `.from()`-Consumer-Check + DB-Dependency + Post-Drop-Smoke.**

**Offene Entscheidungen (Aaron):**
- Ansprechpartner-Verdrahtung (KB/Dispatcher/Makler/SV als Rolle; Kanzlei-AP rein; VS-Kontaktperson **später**).
- Person-Dedup Admin-Merge-Tool (später).
- #8 Termin-Engine-Konsolidierung (koordiniert mit der `termine`-Strecke).
- `repairs.claim_id` nullable machen („nur normale Reparatur" ohne Claim).

---

## 🧷 REGELN / CONSTRAINTS (nicht brechen)
- **DDL nur via `apply_migration`** (Regel 2); File == getrackte Version (Anti-Twin-Drift). `execute_sql` nur READ.
- **Nie auf main pushen; PR gegen staging.**
- **Additiv (neue Tabellen/Spalten/CHECK-Superset) = safe/autonom. CODE-Wiring + Drops = supervised + koordiniert** (aar-939-Konversions-Hotpath).
- **Pre-Drop-Verifikation** ungekappt (Incident-Lehre §7).
- **Migrationen: grüner Supabase-Preview (fresh-branch-first-commit) vor Merge.**
- **`faelle.id ≠ claims.id`** — Route-Key via `faelle_claim_bridge`.
- Daten sind dünn/Test (≈73 Parteien, 75 Claims) → Backfills klein, **Wiring + Tests sind der Aufwand**.

---

## ⚡ QUICK-START für die nächste Session
1. Lies diese Datei + `cmm-entity-model-target-spec.md` §6b (Beschlüsse) + Memory `project_cmm_entity_model.md`.
2. Prüfe ob #2353 gemergt ist (`gh pr view 2353`). Wenn ja → Phase 2b; wenn nein → erst review/merge anstoßen.
3. Phase 2b Backfills sind das nächste **safe** Stück (Daten, kein Consumer). Phase 3+ braucht ein **ruhiges Fenster + aar-939-Abstimmung**.
4. Classifier zum Re-Messen: `node scripts/cmm49-classify-faelle-reads.mjs`.
