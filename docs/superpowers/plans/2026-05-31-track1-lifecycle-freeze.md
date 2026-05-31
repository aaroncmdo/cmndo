# Track 1 — Lifecycle-Freeze Implementierungs-Plan (der Keystone)

> **Referenz:** North-Star `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` §6. **Master:** entsperrt Track 2 (faelle-Drop #2118). **Entscheidungen gelockt:** D1 (operative Zustände re-beheimaten), D2 (work_state-Split), D3 (qualifizierungs_phase einzige Lead-Quelle).
> **Für Worker/Sessions:** jede PR-Zeile = 1 PR vs `staging`. Reihenfolge bindend (Abhängigkeiten markiert). Live-Re-Messung vor jeder Migration (geteilte DB). **Single-Toucher-Regel:** `state-machine.ts` fasst nur EINE Session gleichzeitig an — markiert ⚠️SM.

**Ziel:** Lifecycle auf EINE gespeicherte Status-Ebene je Entity + abgeleitete Phase kollabieren; faelle.status + Label-Akkretion + Dual-Engine eliminieren; die operative Granularität auf Sub-Entities retten. Danach kann Track 2 §A7/§D3 fahren.

**Tech:** Supabase-Plugin-Migrationen (additiv, CHECK statt Enum) · `lifecycle.ts`/`v_claim_phase` (Bit-Parity) · `state-machine.ts` (operative Engine) · Next 16.

---

## PR-Sequenz

### T1.0 — Dead-Weight entfernen (zuerst, Null-Risiko, **assignbar**) — kein ⚠️SM
**Was:** tote Lifecycle-Vokabulare löschen. **Files:** `statusLabels.ts` (`AKTUELLE_PHASE_LABELS`, 16 Codes, 0 Code-Consumer), `subphase-visibility.ts` (`SUBPHASE_VISIBILITY` 52-Matrix + `PHASE_META`, nur vom eigenen Test importiert) + `subphase-visibility.test.ts` (die Assertions darauf). **Behalten:** `buildClaimPhasePipeline`/`substateLabelForRolle`/`KUNDE_SUBSTATE_LABEL` (live, 3 Consumer).
**Steps:** grep jeden Identifier projektweit → 0 Prod-Consumer bestätigen → löschen → `npx tsc --noEmit` grün → commit.
**Verify:** tsc grün; `grep -r AKTUELLE_PHASE_LABELS|SUBPHASE_VISIBILITY|PHASE_META src` = 0.

### T1.1 — `claims.work_state` rausspalten (D2) — kein ⚠️SM (Writer sind endzustand/dispatch, nicht SM)
**Was:** Dispatch-Achse (`dispatch_done`/`in_bearbeitung`) aus `claims.status` in neue Spalte `claims.work_state` (text+CHECK). `claims.status` behält nur Lifecycle/Terminal.
**Steps:**
1. Live-Check: alle `claims.status`-Werte (12 CHECK) + Verteilung; bestätigen dispatch_done/in_bearbeitung = die 2 Dispatch-Werte.
2. Plugin-Migration: `ADD COLUMN work_state text` + CHECK(work_state ∈ {dispatch_offen, dispatch_done, in_bearbeitung} — final mit Aaron) + Backfill `work_state = status WHERE status IN ('dispatch_done','in_bearbeitung')` + `status` für diese Rows auf den neutralen Lifecycle-Default setzen (z.B. `in_bearbeitung`→ Lifecycle-„offen", **mit Aaron klären welcher Terminal-Default**) — ODER status NULL-able lassen bis Terminal gesetzt.
3. `claims_status_check` auf reine Lifecycle/Terminal-Werte reduzieren (dispatch raus).
4. Writer: `dispatch`-Actions schreiben `work_state`; `endzustand-actions`/kanzlei-wunsch schreiben `status` (Lifecycle).
5. Reader: `lifecycle.ts` + Dashboards lesen work_state für „dispatch-Ansicht", status für Terminal.
**Verify:** EXCEPT-0/0 auf `v_claim_phase` (Phase darf sich nicht ändern — sie las status eh nicht für die 2 Werte); build grün; Dispatch-Portal-Smoke.
**⚠️ Aaron-Input:** der status-Default für die 75 Live-Rows nach dem Split (sie sind alle dispatch — welcher Lifecycle-Wert wird ihr `status`?).

### T1.2 — 5 operative Zustände re-beheimaten (D1, HARD-GATE) — ⚠️SM
**Was:** die Granularität, die heute in `faelle.status` lebt, auf Sub-Entities ziehen + `v_claim_phase` erweitern. **Heimaten:** `vs-kuerzt`+Kürzungs-SLA → `kanzlei_faelle` (status/Flag) · `filmcheck`/`qc-pruefung` → `auftraege` (filmcheck_ok/_am existieren) · `nachbesichtigung-laeuft` → `auftraege.typ='nachbesichtigung'`/gutachter_termine · `anschlussschreiben` → `kanzlei_faelle.anschlussschreiben_am` (existiert).
**Steps:**
1. Pro Zustand: Sub-Entity-Spalte/Status-Wert sicherstellen (CHECK erweitern) + Backfill aus faelle wo nötig.
2. `v_claim_phase` (+ `lifecycle.ts` Spiegel) um die neuen subPhase-Codes erweitern (Bit-Parity halten) — die Sub-Entity-Status als Ableitungs-Input.
3. **Webhook-Writer** (LexDrive/VS schreiben `vs-kuerzt` direkt, state-machine.ts:33-35) auf die neue Heimat umstellen.
4. `enumsortorder`-Reihenfolge (fraktional 1.5/8.625…) → subPhase-Sortmap; `grep "ORDER BY status"` auf faelle prüfen.
**Verify:** v_claim_phase-Parity-Test grün; Kürzungs-SLA feuert weiter (state-machine.ts:322); Smoke QC/nachbesichtigung-Sichtbarkeit.

### T1.3 — `PHASE_VISIBLE_SECTIONS` → abgeleitete Phase (L2, entsperrt Track-2 §E) — kein ⚠️SM
**Was:** `getVisibleSections` (`phase-config.ts`) von `fall.status` (19-Enum) auf `ClaimMainPhase/SubPhase` aus `getClaimLifecycle()` umstellen. Sole Consumer `FallContext.tsx:87`. **= der letzte Live-UI-Consumer von fall.status.**
**Verify:** Fallakte-Sektionen rendern identisch (Smoke admin/SV/kunde); build grün.

### T1.4 — Dual-Engine → eine (L5) — ⚠️SM
**Was:** `checkFallAutoPhase` retiren (nur 2 fire-and-forget Caller: `filmcheck.ts:107`, `kanzlei-paket.ts:400`); Task-Trigger (`triggerQcTask`/`triggerKanzleiPaketTask`) auf die Sub-Entity-Writer umhängen. `transitionFallStatus` schreibt künftig claims.status/work_state + Sub-Entity-Status statt faelle.status (die operative Engine + SLA/Billing/Notification-Hooks bleiben, nur das Ziel ändert sich). Vereint mit der endzustand/kanzlei-Welt.
**Verify:** SLA/Billing/Notification-Hooks feuern unverändert (Baseline vorher); build grün; Status-Transition-Smoke.
**Hinweis:** größter PR; nach T1.1+T1.2 (braucht work_state + die Sub-Entity-Heimaten als Ziel).

### T1.5 — Lead-Doppel → eine (D3, L7) — **assignbar**, kein ⚠️SM
**Was:** `qualifizierungs_phase` (text) = einzige Quelle; `leads.status` (`lead_status`-Enum) deprecaten. Achtung: Enum-Drop = mehr DDL (Typ retiren). Dispatch-UI-Filter zuerst auditieren.
**Verify:** Lead-/Dispatch-Listen unverändert; build grün.

### T1.6 — v_claim_phase-Parity härten (L6) — kein ⚠️SM
**Was:** CHECK/Test: jeder `auftraege.status`-Wert ∈ `ClaimSubPhase` (Schutz gegen stille Divergenz bei Sub-Entity-Enum-Wachstum).
**Verify:** Parity-Test in CI.

---

## Abhängigkeiten + Parallelisierung
```
T1.0 (assignbar) ─┐
T1.5 (assignbar) ─┤  parallel, unabhängig
T1.6             ─┘
T1.1 work_state ──► T1.2 re-home ──► T1.4 Engine     (⚠️SM-Kette, EINE Session)
T1.3 sections ───────────────────────► (entsperrt Track-2 §E)
```
- **⚠️SM-Kette (T1.2→T1.4 + T1.1-Writer):** EINE Session (ich/CMM). Niemand sonst fasst `state-machine.ts` an.
- **Assignbar an 98ff5349 (aar-939-a7-lifecycle-spec):** T1.0 (Dead-Weight), T1.5 (Lead-Doppel), T1.6 (Parity-Test) — berühren state-machine.ts nicht.

## Verifikation (global)
Pro PR: `npx tsc --noEmit` (worktree: `npm ci` einmalig, sonst false TS2307) · Portal-Smoke + Screenshot bei UI/Writer · v_claim_phase-Parity + EXCEPT-0/0 bei Lifecycle-Reads · SLA/Notification-Baseline vor T1.4.

## Danach
Track 1 grün → Track 2 (#2118) §A7/§D3 entsperrt (fall_status-Reader-Repoint + faelle.status-Tod). Track 0 (Security) läuft parallel. Track 3 post-Launch.
