# Handoff — Claim-Phasen-SSoT P1+P2 (verschmolzen) (2026-05-27)

**Für die nächste Session: lies dieses Doc + Spec + Plan, dann steig bei „Nächster Schritt" ein.**

## Kernmodell (in einem Absatz)
Die Claim-**Phase** ist eine **reine Aggregation** dreier Sub-Entity-Lifecycles (Lead · Auftrag ·
Kanzleifall) via `getClaimLifecycle` (`src/lib/claims/lifecycle.ts`) → 4 Kunde-Phasen
(erfassung→begutachtung→regulierung→abschluss) + Subphase. Der **Gutachter-Termin** ist eine
**orthogonale** Dispatch-Achse (am Auftrag via `auftrag_id`, Sync bei „durchgeführt"; Termin-Detail
unterwegs/vor Ort ist Overlay, **nicht** Phase). Entscheidung **D1** (gelöst): Phase rein **abgeleitet**
— `v_claim_phase` (SQL-Spiegel) für Listen/RLS, `claims.phase`-Spalte + `calc_claims_phase` werden
gedroppt. Es gibt **keinen** zentralen Status-Motor. Die Lifecycle-Dynamik = der promotete
Produkt-Mehrwert (sichtbar im — auch gebrandeten — Kunde-Stepper).

## Artefakte
- **Spec:** `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md` (approved)
- **Plan (verschmolzen P1+P2, MP-0..MP-9 + Inventar):** `docs/27.05.2026/cmm44-claim-phasen-p1p2-merged-plan-2026-05-27.md` ← **DIES ist der aktuelle Plan** (ersetzt die getrennten P1/P2/P2b im 26.05.-Plan)
- **Ur-Plan (Kontext):** `docs/26.05.2026/cmm44-claim-phasen-plan-2026-05-26.md`
- **Memory:** `project_claim_phasen_ssot_architektur` (Index) — enthält den SP-D-Befund
- **P0-Code:** Branch `kitta/cmm44-claim-phase-p0` → **PR #1809** (Loader + `v_claim_phase` + Parity-Probe + Vitests)
- **Override-Stopgap:** Branch `kitta/cmm44-phase-override-stopgap` → **PR #1818**

## Status
- **P0 (Foundation) FERTIG:** `getClaimLifecycleForClaim` + `v_claim_phase` (Migration `20260526202512`,
  prod-appliziert) + **Parity-Probe 0 Divergenzen/59 Claims** + 22 Vitests. PR #1809 (build-rot war nur
  der transiente `check:rls-grants`-Pooler-Abort, kein Code).
- **Override-Bug Stopgap-behoben:** `manualPhaseOverride` warf seit SP-A2 `23514` (schrieb 52-Subphasen
  in die 11-Code-Spalte) → deaktiviert. PR #1818. Echter Re-Build = Plan MP-8.
- **D1 gelöst** (Aaron 2026-05-26: „was ist logisch" → D1, weil D2 = `calc_claims_phase` neu bauen).
- **MP-1..MP-9 offen.**

## Nächster Schritt
1. **PR #1809 + #1818 auf staging gemergt?** (sync-watcher) — `v_claim_phase` muss auf staging sein, bevor MP-2+ startet.
2. **MP-1 (Analyse, kein Code):** System-B-Inventur — die 52 `SUBPHASE_VISIBILITY`-Keys klassifizieren
   (→9 Haupt-Subphasen / Termin-Overlay / re-based Ops-Subphase / retire) + `resolveSubphase`-Input-
   Inventur + System-B-Consumer-Karte. Dann **DE-1/DE-2/DE-3 mit Aaron bestätigen** (siehe Plan).
3. Dann **MP-2** (`resolveSubphase` auf Sub-Entities re-basen) → **MP-3+MP-4 gekoppelt** (View-Repoint +
   Reader-Rewrite portal-weise) → **MP-5** (Visibility re-base, Whitelabel-kritisch) → **MP-6** (System A
   droppen) → **MP-7** (faelle.status retiren) → **MP-8** (Dispatch-Board + Ownership + Override-Redesign)
   → **MP-9** (Drift-Gate CI).

## Offene Entscheidungen (vor MP-2)
- **DE-1** Subphasen-Vokabular (9 abgeleitete vs 52 System-B): pro Key klassifizieren. MP-1 liefert die Tabelle.
- **DE-2** Visibility-Matrix re-base — bestimmt was (Whitelabel-)Kunden sehen.
- **DE-3** `aktuelle_phase`-Alias entkoppeln/umbenennen (3 Views).

## Gotchas (gelernt diese + letzte Session)
- **SP-D hat `aktuelle_phase` bereits an `claims.phase` gekoppelt** → P1 (System A) und P2 (System B) sind
  **verschmolzen**; getrennt geht nicht. `aktuelle_phase` ist ein **überladener Alias** — nie per
  String-Grep trennen, immer die `.from()`/View-Quelle prüfen.
- **System B ist halb-abgebaut:** `faelle.aktuelle_phase` gedroppt (SP-A2), Consumer kriegen 11-Code →
  `SUBPHASE_VISIBILITY`-Lookups schlagen fehl → `status`-Fallback. Die „reichen" Kanban/Pipeline-Consumer
  sind also schon jetzt nicht voll funktional.
- **`db push` (Pooler, 5432) funktioniert** auch wenn MCP/REST-Reads (443) timeouten — Pool-Blockade
  betrifft nur die Verifikation. Erst `--dry-run`, dann push. Migrationen im ruhigen Slot.
- **Frischer Worktree:** node_modules-Junction (`New-Item -ItemType Junction`) + `supabase/.temp`-Kopie
  für tsc/`db push`; `.env.local` (gitignored) für Probes kopieren. **Lokales `tsc` zeigt 11
  Junction-Artefakte** (`sharp`/`@react-pdf`/`pdf-parse`) — das sind KEINE echten Fehler (CI-Typecheck ist
  grün); nur Delta gegen Baseline zählt.
- **PR `--base staging`, NICHT selbst mergen** (sync-watcher merged build-grün). MCP-Token läuft ab →
  `curl -4` gegen PostgREST + `npx supabase db query --linked --file` sind die robusten Fallbacks
  (node `fetch` hängt gegen Supabase, IPv6).
- **MP-3+MP-4 müssen pro Portal zusammen mergen** — sonst brechen die System-B-Consumer weiter.
