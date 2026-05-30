# Handoff — CMM-50 Spec FINALISIERT (Scoping abgeschlossen) — 30.05.2026 (Abend)

**Session-Auftrag (Aaron):** „CMM-50 nur final scopen" — Spec/Plan mit 4 Entscheidungen finalisieren + Linear updaten, **nicht** implementieren.
**Vorgänger-Handoff:** `docs/30.05.2026/cmm44-phase41-cmm50-handoff.md` (Phase 4.1 DONE + CMM-50 gescopt). **Update dazu:** dessen Punkt 1 (PR #2053 Phase 4.1) ist inzwischen **MERGED**; Punkt 2 (CMM-50 Entscheidungen) ist mit dieser Session erledigt.

---

## TL;DR

CMM-50 (SP-E vehicles) ist **scoping-fertig**. Aaron hat 4 Entscheidungen getroffen, alle live gegen DB/Code/Linear gegroundet und in Spec+Plan eingearbeitet. Ein 5-Agenten-Verify-Workflow (`wf_093f7c2e-763`) hat die Befunde bestätigt + 10 Korrekturen geliefert, die alle eingearbeitet sind. **PR offen gegen staging.** Kein Code — Implementierung ist die nächste Stufe (Start: 50.0).

---

## 1 · Die 4 Entscheidungen (Aaron 30.05.) + Grounding

| # | Entscheidung | Live-Grounding |
|---|---|---|
| 1 | **Halter → SP-C/CMM-63 delegiert** (raus aus CMM-50) | `claim_parties` hat `ist_halter`/`firma`/`ust_id`/`ist_gewerbe` bereits; wird bei Konversion teilbefüllt (convert-lead :350). **Caveat:** CMM-63 ist `Done`, SP-C3-Halter offen → Aaron: reopen vs neues Issue |
| 2 | **`lackfarbe_code` → `vehicles.farbcode`** (bestehend, kein ADD) | vehicles hat farbcode UND farbe_klartext; lackfarbe wird von 1 Reader gelesen (email/flows) |
| 3 | **50.0 Write-Path vorziehen** als eigenständiges Produkt-Gap-Feature | RPC `upsert_vehicle_by_fin` = 0 Caller; vehicles 0 Zeilen; claims.vehicle_id 75/75 NULL → SSoT leer, rein additiv shippbar |
| 4 | business bleibt in 50.2 → **neue claims-Spalten** | `claims.leasinggeber_name`/`finanzierung_bank`/`bank_name` ALLE live FEHLEND; CMM-65 (Done) deckte sie NICHT ab |

## 2 · Der Kern-Befund (warum CMM-50 umgedeutet ist)

Die `vehicles`-SSoT ist **leer**, weil der **Write-Path nie verdrahtet** wurde (AAR-773/810 baute Tabelle+RPC+Backfill, aber 0 Application-Caller). → Reader auf leere SSoT umlenken = **Daten-Regression**. **Write-Path zuerst (50.0), dann Reader-Relocate (50.3).** Zugleich Produkt-Gap: kein Fahrzeug landet je in der SSoT.

## 3 · Re-Sequenzierung (4 PR-Stränge, Reihenfolge bindend)

- **50.0** Write-Path verdrahten (Helper `ensureVehicleFromFin`, 5 Call-Sites, Backfill) — **eigenständiges Feature, rein additiv, kein Reader/View, sofort shippbar.**
- **50.1** vehicles Schema-Lücke: 4 ADDs (`kennzeichen_buchstaben`, `fahrzeug_ausstattung`, `fin_quelle`, `fin_extrahiert_am`) + 2 Casts (baujahr int→date, erstzulassung text→date) + Snapshot-Verdrahtung.
- **50.2** business→claims: ADD `leasinggeber_name` (1:1) + `finanzierung_bank` (aus bank_name, **bewusste Umbenennung**). Halter delegiert (SP-C3).
- **50.3** Reader-Relocate + 4-View-Repoint (= Phase 4.2 Fahrzeug-Anteil). **Gate: 50.0 live + vehicles befüllt.**

## 4 · Verify-Workflow `wf_093f7c2e-763` — 10 Korrekturen (alle eingearbeitet)

Bestätigt: DB-Facts (6/6), alle 4 Ziel-Views existieren + sourcen heute `f.fahrzeug_*` (Repoint pending, live pg_views), Write-Path 0 Caller, 4 Entscheidungen korrekt drin.
Korrigiert: **4. direkter Reader** `makler/copilot-prompt.ts` (war fehlend, „3 direkt"→„4 direkt") · `stammdaten/schema.ts` ist **kein DB-Reader** (reine Field-Schema) · View-Attribution (nur `v_faelle_mit_aktuellem_termin` real von Readern genutzt) · **erstzulassung text→date** Cast (war unflagged) · **3-Surface vehicle_id**-Konvention (claims + claim_parties + cvi, nicht either/or) · **faelle.claim_id-Hop** für Fall-side Writer (kein faelle.vehicle_id) · owner-Auflösung pro Call-Site (ownership_history-Nebenwirkung) · `{success}`-vs-`{ok}`-Shape in enrich-fahrzeug · Halter kein Greenfield (Konversion füttert bereits) · bank_name→finanzierung_bank Rename-Falle.

## 5 · Querverweise

| Achse | Referenz |
|---|---|
| Spec (FINAL) | `docs/superpowers/specs/2026-05-30-cmm50-vehicles-migration.md` |
| Plan (FINAL) | `docs/superpowers/plans/2026-05-30-cmm50-vehicles.md` |
| Linear | [CMM-50](https://linear.app/aaroncmndo/issue/CMM-50) (Kommentar 30.05. + Description aktualisiert) · blockedBy für [CMM-49](https://linear.app/aaroncmndo/issue/CMM-49) |
| Verwandt | [CMM-63](https://linear.app/aaroncmndo/issue/CMM-63) (SP-C, Done — SP-C3 Halter offen) · [CMM-65](https://linear.app/aaroncmndo/issue/CMM-65) (Done, business NICHT abgedeckt) |
| Verify-Workflow | `wf_093f7c2e-763` (5 Agenten, 586k) · Audit-Workflow `wf_82364751-2a5` |
| Probe | `scripts/probe-cmm50-vehicles.mjs` (re-run 30.05.) |
| RPC | `supabase/migrations/20260425120400_aar773_upsert_vehicle_by_fin_rpc.sql` (8 Felder) |
| Aktuelle View-Shape | `supabase/migrations/20260528192402_cmm44_mp6c_drop_claims_phase.sql` |
| Memory | `project_cmm50_vehicles_scoping` |
| Worktree/Branch | `.claude/worktrees/cmm-50-vehicles-scoping` / `kitta/cmm-50-vehicles-scoping` |

## 6 · Was auf die nächste Session wartet

1. **2 Entscheidungen für Aaron im Spec-Review:** (a) Halter-Issue — CMM-63 SP-C3 reopen vs neues Issue? (b) Bekommt 50.0 ein eigenes Produkt-Feature-Ticket (Entscheidung 4 legt es nahe)?
2. **Implementierung 50.0** (Write-Path) — der Plan-Strang Task 0 + 50.0 ist implementierungsreif (Call-Sites file:line, Helper-Architektur, Owner-Auflösung, 3-Surface-Konvention, claim_id-Hop alle spezifiziert). Eigener Branch/Worktree, PR gegen staging.
3. Danach 50.1/50.2 parallel, 50.3 nach befüllter SSoT.

## 7 · Lessons

1. **Adversarial-Verify auf den finalisierten Draft lohnt:** der Workflow fand einen fehlenden 4. Reader + einen Nicht-Reader + einen Type-Cast + eine falsche Konvention — alles, woran ein Implementierer gestolpert wäre, bevor das Doc autoritativ wurde.
2. **Live-Grounding schlägt Doc-Schätzung (wieder):** „lackfarbe ADD" → real `farbcode` existiert; „business via CMM-65 da" → real FEHLEND; „3 Reader" → real 4.
3. **„Done"-Ticket ≠ fertige Domäne:** CMM-63 ist Done, aber SP-C3 (Halter) offen — Delegation muss das adressieren.
</content>
