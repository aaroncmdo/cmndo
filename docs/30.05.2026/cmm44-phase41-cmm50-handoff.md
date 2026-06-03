# Handoff — CMM-44 Phase 4.1 (DONE) + CMM-50 Scoping — 30.05.2026

**Session-Ergebnis:** Eine Strecke fertig+verifiziert (Phase 4.1), eine gescopt mit strategie-änderndem Befund (CMM-50). Beide Audit-first.
**Master:** CMM-44 (faelle-Drop / Claim-SSoT-Vollmigration)

---

## TL;DR

1. **CMM-44 Phase 4.1 — KOMPLETT.** `v_claim_timeline` vollständig faelle-frei (1 von 6 Phase-6-Blocker-Views eliminiert) + `v_claim_listing` cosmetic `sv_id`→`c.sv_id`. DDL-only, kein src/-Change. Migration `20260530133959` live, DB-Pre/Post-Parity + Staging-Smoke grün. **PR #2053 offen gegen staging** (wartet auf Review/Merge). Setzt das SECURITY-DEFINER-Restore + Pre/Post-Parity-Verify-Template für Phase 4.2.
2. **CMM-50 (SP-E vehicles) — gescopt, NICHT implementiert.** Audit deckte auf: die `vehicles`-SSoT ist **leer**, weil der Write-Path nie verdrahtet wurde (`upsert_vehicle_by_fin` = 0 Caller). CMM-50 darf **nicht** als simpler Reader-Relocate starten (Daten-Regression). Re-sequenziert in 50.0→50.3, Spec/Plan auf eigenem Branch, Befund in Linear CMM-50.

**Roter Faden:** Live-Consumer-Audit schlägt jede Vorab-Schätzung — bei 4.1 (Handoff sagte „listing trivial", real ist timeline der Pilot) und CMM-50 (Ticket sagte „55 Reader relocaten", real ist die SSoT leer + Write-Path fehlt). Audit-first hat beide Male einen falschen Implementierungs-Pfad verhindert.

---

## 1 · CMM-44 Phase 4.1 — Light-Views Re-Base (DONE)

### Was
- **`v_claim_timeline`** faelle-frei: `claim_id` additiv auf `phase_transitions` + `timeline` (Backfill + transitionaler `BEFORE INSERT`-Trigger `trg_fn_fill_claim_id_from_fall`), die 2 faelle-JOIN-Branches (`phase.geaendert`, `manuell.notiz`) nutzen jetzt natives `claim_id`. `fall_id`-Subqueries + `detail_url_path` → NULL.
- **`v_claim_listing`** cosmetic `f.sv_id` → `c.sv_id` (CMM-60). `fall_id` + `LEFT JOIN faelle` BLEIBEN (load-bearing fürs admin/faelle hub + faelle.id-gekeyte `/faelle/[id]`-Route) → bleibt formal Blocker, Voll-Abbau = **Phase 4.3**.

### Verifikation (live, autoritativ)
`v_claim_timeline` 0× faelle in pg_views · Pre/Post-Parity 234==234 + alle 8 event_typ-Counts identisch · sv_mismatch 0 · Backfill-Rest 0/0 · Trigger-Effekt per rolled-back Test-Insert (`match=t`) · `reloptions security_invoker=false` explizit · Staging-Smoke grün (Kanban 4 Spalten; verlauf-Tab: phase.geaendert + manuell.notiz rendern, „Details ansehen"-Link weg = gewollt).

### 1 bewusste UX-Änderung
`v_claim_timeline.detail_url_path` immer NULL → „Details ansehen →"-Link auf gutachten-Timeline-Events weg bis CMM-28 die Route auf claim_id umstellt. Null-guarded, kein Crash.

### Querverweise Phase 4.1
| Achse | Referenz |
|---|---|
| PR | [#2053](https://github.com/aaroncmdo/cmndo/pull/2053) (`kitta/cmm44-phase-41-light-views` → staging, OFFEN) |
| Migration | `supabase/migrations/20260530133959_cmm44_phase41_light_views_rebase.sql` (recorded version == File) |
| Spec | `docs/superpowers/specs/2026-05-30-cmm44-phase-41-light-views.md` |
| Plan | `docs/superpowers/plans/2026-05-30-cmm44-phase-41.md` |
| Audit-Doc | `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` § Phase-4.1-Done (neu) |
| Consumer-Audit | Workflow `wf_a84d8fde-5a6` (4 Finder, 400k tokens) |
| Smoke | `docs/30.05.2026/cmm44-phase41-verify/` (2 PNGs + report.json + smoke-bericht.md) |
| Live-Probe | `scripts/probe-phase41-schema.mjs` |
| Memory | `project_cmm44_phase41` |
| Worktree | `.claude/worktrees/cmm44-phase-41-light-views` (Branch `kitta/cmm44-phase-41-light-views`) |

### Neue Phase-5/6-Cleanup-Items (aus 4.1, in Audit-Doc + Linear CMM-49 verbucht)
1. Trigger `trg_fn_fill_claim_id_from_fall` = neuer faelle-Reader → **Phase-6-DROP**.
2. App-Writer claim_id-direkt (Phase 5): `state-machine.ts:225/235`, `endzustand-actions.ts` writeAudit ×7, `log-event.ts` logFallEvent (~80 Caller-Funnel) + `side-quest.ts:59` + `qc.ts:165/175`. Danach Trigger überflüssig.
3. `detail_url_path`-Restore mit CMM-28.
4. `phase_transitions.claim_id` + `timeline.claim_id` (neu, nullable, FK ON DELETE CASCADE) → Phase 6: `fall_id` droppen.

---

## 2 · CMM-50 (SP-E) — vehicles-Migration — GESCOPT

### Kernbefund (strategie-ändernd)
Die vehicles-Infrastruktur (AAR-773/AAR-810, 25.04.) ist gebaut, aber **nie an die Runtime verdrahtet**. Live: `vehicles`=0 Zeilen, `claims.vehicle_id` 75/75 NULL, `claim_vehicle_involvements`=0, `faelle.vehicle_id` gedroppt, `upsert_vehicle_by_fin`-RPC 0 Caller. Read-Seite fertig, Write-Seite fehlt. → **Reader können nicht auf leere SSoT umgelenkt werden** (Regression); Write-Path muss zuerst. Zugleich latenter **Produkt-Gap** (kein Fahrzeug landet je in der SSoT).

### Re-Sequenzierung (Spec/Plan)
**50.0** Write-Path verdrahten (`upsert_vehicle_by_fin` bei ZB1-OCR / cardentity-enrich / saveFinVin / Lead-Konversion + `vehicle_id` setzen; ~0 DDL, code-heavy) → **50.1** vehicles Schema-Lücke (5 ADD COLUMN: lackfarbe_code, fahrzeug_ausstattung, fin_quelle/_extrahiert_am, kennzeichen_buchstaben) → **50.2** Domain-Split (business→claims, halter→SP-C/CMM-63) → **50.3** Reader-Relocate + View-Repoint (= Phase-4.2-Fahrzeug-Anteil, Pre/Post-Parity + Portal-Smoke). 50.0 ist hartes Gate für 50.3.

### 3 offene Entscheidungen für Aaron (im Spec-Review)
1. Halter-Spalten (`ist_fahrzeughalter`/`firma_name`/`ust_id`) in CMM-50 oder an SP-C/CMM-63 delegieren? (Empfehlung: SP-C)
2. `lackfarbe_code` neue vehicles-Spalte oder auf bestehendes `farbcode` mappen?
3. 50.0 als eigenständiges Produkt-Gap-Feature vorziehen (unabhängig vom faelle-Drop)?

### Reader-/Writer-Inventar
- **Reader ~8 Files** (de-noised, nicht 55): get-kunde-faelle, fall/queries, stammdaten/schema, makler/queries, ai/briefing, ai-actions, email/google/flows, kanzlei/push-mandat — meist via Views.
- **Writer:** buildFallInsertFromLead (Lead-Konversion), updateFallField/saveFinVin (manuell), enrich-fahrzeug.ts (Cardentity), ZB1-Upload, dispatch saveStammdaten. Keiner berührt vehicles.
- **Mapping** faelle→vehicles: kennzeichen→kennzeichen_aktuell, fahrzeug_hersteller→hersteller, fahrzeug_modell→modell_haupttyp, fahrzeug_typ→bauart, fahrzeug_baujahr→baujahr_monat, fahrzeug_farbe→farbe_klartext, fin_vin→fin, hsn/tsn/erstzulassung 1:1, kilometerstand→aktueller_kilometerstand. (Details Spec §4.)

### Querverweise CMM-50
| Achse | Referenz |
|---|---|
| Linear | [CMM-50](https://linear.app/aaroncmndo/issue/CMM-50) (Audit-Kommentar 30.05. + Re-Sequenzierung) |
| Spec | [`docs/superpowers/specs/2026-05-30-cmm50-vehicles-migration.md`](https://github.com/aaroncmdo/cmndo/blob/kitta/cmm-50-vehicles-scoping/docs/superpowers/specs/2026-05-30-cmm50-vehicles-migration.md) |
| Plan | [`docs/superpowers/plans/2026-05-30-cmm50-vehicles.md`](https://github.com/aaroncmdo/cmndo/blob/kitta/cmm-50-vehicles-scoping/docs/superpowers/plans/2026-05-30-cmm50-vehicles.md) |
| Consumer-Audit | Workflow `wf_82364751-2a5` (3 Finder, 654k tokens) |
| Live-Probe | `scripts/probe-cmm50-vehicles.mjs` |
| Memory | `project_cmm50_vehicles_scoping` |
| Worktree | `.claude/worktrees/cmm-50-vehicles-scoping` (Branch `kitta/cmm-50-vehicles-scoping`) |
| Vorgänger-Migrationen | `20260425120000..120400` (AAR-773 vehicles) · `20260425150100/150200` (AAR-810 claims/cvi) |

---

## 3 · Lessons (Lesson-fest)

1. **Live-Consumer-Audit > Handoff/Ticket-Schätzung.** Beide Strecken: die Vorab-Annahme war falsch. Vor jeder View-Re-Base / Reader-Relocate: empirisch messen (Consumer pro Spalte + Live-Row-Counts + Spalten-Existenz). Statische Reader-Counts (417/55) sind massiv überzählt.
2. **Vor View-Re-Base: Basis-Tabellen auf claim_id prüfen.** `phase_transitions`/`timeline` hatten kein claim_id → „nur strukturell" hielt nicht; brauchte Foundation + transitionalen Trigger.
3. **„latest migration" ≠ live.** v_claim_listing-Definition war in MP-6b stale (claims.phase schon in MP-6c gedroppt) — immer pg_views/Live cross-checken, nicht das jüngste CREATE-VIEW-Grep nehmen.
4. **SSoT-Tabelle kann leer + tot sein.** vehicles existiert seit 25.04. mit 0 Runtime-Writes — eine gebaute Infrastruktur ohne Verdrahtung. Vor „Reader auf SSoT umlenken": prüfen ob die SSoT überhaupt befüllt wird.
5. **Pre/Post-Parity pro event_typ** ist das Korrektheits-Hard-Gate für verhaltens-erhaltende View-Rewrites (DDL-only) — stärker als ein Browser-Smoke, der bei unverändertem Consumer-Code nichts Neues zeigt.
6. **MCP-Auth in diesem Setup:** Auto-Callback greift sporadisch; `complete_authentication` verliert den Flow-State zwischen Tool-Calls (Server-Reconnect). READs gehen jederzeit via PostgREST + Service-Key (Probe-Pattern) — kein MCP nötig fürs Scoping.

---

## 4 · Offene Items / Nächste Schritte

- **Aaron:** PR #2053 reviewen/mergen · CMM-50-Spec reviewen + 3 Fragen (§2) beantworten.
- **Nach CMM-50-Freigabe:** 50.0 Write-Path in eigener Session bauen (sensibel — Lead-Konversion + OCR-Flows, eigener Worktree, mit Tests + Smoke).
- **Phase 4.2** (4 schwere Views) bleibt gated auf CMM-50 (vehicles) + CMM-63 (parties) + CMM-64 (vorschaeden).
- **Phase 5** (Trigger-Retirement aus 4.1) + **Phase 4.3** (v_claim_listing voll faelle-frei) sind unabhängige Alternativ-Strecken.

---

## 5 · Worktree/Branch-Stand (Session-Closure)

```
Branch kitta/cmm44-phase-41-light-views  → PR #2053 offen, working-tree clean, alles gepusht
  Worktree .claude/worktrees/cmm44-phase-41-light-views
  (untracked Scoping-Probes probe-phase41/cmm50 — harmlos, nicht in PR)
Branch kitta/cmm-50-vehicles-scoping     → gepusht (Spec/Plan/Probe/dieses Handoff), kein PR (Scoping-only)
  Worktree .claude/worktrees/cmm-50-vehicles-scoping
Stash: keiner aus dieser Session (stash@{0} ist fremd: kitta/aar-kunde-gutachten-werte, dokumentiert)
```
Worktrees nach Merge/Review via `git worktree remove` entfernbar.

---

## 6 · Quellen (komplett)
- PRs: #2053 (Phase 4.1) · #2046/#2038 (MP-8c Vorgänger)
- Specs/Plans: `docs/superpowers/specs|plans/2026-05-30-cmm44-phase-41*` + `…-cmm50-vehicles*`
- Audit-Doc: `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` (§R.1-§R.8 + § Phase-4.1-Done)
- Workflows: `wf_a84d8fde-5a6` (Phase-4.1-Consumer) · `wf_82364751-2a5` (CMM-50-Consumer)
- Migrationen: `20260530133959` (Phase 4.1) · `20260425120000..120400`+`150100/150200` (vehicles-Infra)
- Linear: CMM-49 (Phase-4.1-Done-Kommentar) · CMM-50 (Re-Sequenzierung-Kommentar)
- Memory: `project_cmm44_phase41` · `project_cmm50_vehicles_scoping` · `project_cmm44_mp8c_complete` · `feedback_information_schema_check`
- Probes: `scripts/probe-phase41-schema.mjs` · `scripts/probe-cmm50-vehicles.mjs`
