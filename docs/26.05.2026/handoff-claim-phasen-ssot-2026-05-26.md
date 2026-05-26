# Handoff — Claim-Phasen-SSoT (2026-05-26)

**Für die nächste Session: lies dieses Doc + Spec + Plan, dann steig bei „Nächster Schritt" ein.**

## Kernmodell (in einem Absatz)
Die Claim-**Phase** ist eine **reine Aggregation** dreier Sub-Entity-Lifecycles (Lead · Auftrag ·
Kanzleifall) via `getClaimLifecycle` (`src/lib/claims/lifecycle.ts`, CMM-32) → 4 Kunde-Phasen
(erfassung→begutachtung→regulierung→abschluss). Der **Gutachter-Termin** ist eine **orthogonale
Dispatch-Achse** (reserviert→bestätigt[durch SA, nicht SV]→durchgeführt + Verlegung), am Auftrag via
`auftrag_id`, Sync bei „durchgeführt". **Ownership-Schnitt:** Dispatcher hält die zentrale Termine-Quelle
bis der Erst-Termin durchgeführt ist → dann KB (Nachbesichtigung = KB). **Admin** überwacht alles. Es
gibt **keinen zentralen Status-Motor** — `faelle.status`/`transitionFallStatus`/`calc_claims_phase`/
`resolveSubphase` werden darauf zurückgebaut bzw. retired. Die Lifecycle-Dynamik = der promotete
Produkt-Mehrwert.

## Artefakte
- **Spec:** `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md`
- **Plan (P0–P6 + Inventar Drops/Reads/Writes):** `docs/26.05.2026/cmm44-claim-phasen-plan-2026-05-26.md`
- beide auf Branch `kitta/cmm44-status-sp-strategy` → **PR #1805** (docs)
- **Memory:** `project_claim_phasen_ssot_architektur.md` (im Index)
- **P0-Code:** Branch `kitta/cmm44-claim-phase-p0` → **PR #1809**

## Status
- **P0 (Foundation) FERTIG + appliziert:** `getClaimLifecycleForClaim`-Loader (eine Quelle) + Kunde-Page
  darauf umgestellt + `v_claim_phase`-SQL-View (Migration `20260526202512`, prod-appliziert + verifiziert:
  59 Zeilen, Verteilung konsistent). tsc-grün. PR #1809.
- P1–P6 noch offen.

## Nächster Schritt
1. **P0 Task 4 — Parity-Probe** schreiben (vitest, importiert `getClaimLifecycle`; vergleicht pro Claim
   gegen `v_claim_phase`; 0 Divergenzen). Wird in **P6** zum CI-Gate.
2. Dann **P1** (System A `calc_claims_phase` zurückbauen) → **P2** (System B `resolveSubphase` auf
   Sub-Entities re-basen) → **P2b** (Stepper Kunde+Admin vereinheitlichen, granularity-Prop) → **P3**
   (Dispatch-Board + Ownership-Handoff bei durchgeführt + Admin-Monitoring) → **P4** (Reader-Sweep
   faelle.status, portal-weise) → **P5** (faelle.status/transitionFallStatus/calc_claims_phase retire)
   → **P6** (Drift-Bremse CI-Gate).

## Offene Entscheidung (vor P1)
**D1** (Phase rein abgeleitet, eine Quelle — empfohlen) vs **D2** (materialisiert via Trigger). P0 ist
für beide identisch.

## Gotchas (aus dieser Session gelernt)
- **`db push` (Pooler, Port 5432) funktioniert** auch wenn MCP-Reads (Port 443) timeouten — die
  „Pool-Blockade" betrifft nur die MCP-Verifikation, nicht die Migration. Erst `--dry-run`, dann push.
- **Frischer Worktree** (`git worktree add`) braucht: node_modules-Junction (`New-Item -ItemType
  Junction`) + Kopie `supabase/.temp/` aus dem Haupt-Repo (Link-State) für tsc + db push.
- **Nur `db push`** für DDL (Regel 2), nie MCP apply_migration. PR `--base staging`, **nicht selbst
  mergen** (sync-watcher merged build-grün). numeric-Spalten: Präzision der Quelle matchen (42P16-Falle).
- View `v_claim_phase` ist faelle-basiert (spiegelt den Loader = Parity); Phase 6 migriert Loader+View
  gemeinsam auf `claims.lead_id` wenn faelle stirbt.
