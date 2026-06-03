# CMM-44 MP-8b — Claims-zentrischer Phasen-Read-Path — Implementierungs-Plan

> **For agentic workers:** SUB-SKILL `superpowers:subagent-driven-development` oder inline. Checkbox-Tracking.
> **Spec:** `cmm44-mp8b-claims-centric-phase-readpath-spec.md` (Design + View-SQL + Datenbefund dort).

**Goal:** Phasen-Read-Path auf `claims.id` (SSoT) re-gründen — `v_claim_phase` claims-zentrisch (`FROM claims`), alle Reader/Caller konsistent. Schließt MP-8 korrekt ab + entkoppelt die Phasen-View vom faelle-Drop (Phase-4-Stück).

**Architecture:** Phase bleibt reine Ableitung (`getClaimLifecycle`/`v_claim_phase`). Geändert wird NUR die **Key-/Join-Basis** (faelle.id → claims.id) + die Input-Beschaffung der Loader. Parity zur Bestands-Phase ist verifiziert (74/74). Branch `kitta/cmm44-mp8b-claims-centric-phase` (off staging).

**Tech Stack:** Next.js 15, Supabase (PG 17), DDL via Plugin `apply_migration` (Regel 2), vitest, node-Parity-Probe.

**Gating:** View-Migration ist additiv (0 Phasen-Shift verifiziert) → vor Code safe. Makler-Caller + Loader deployen mit dem Code → **alles in EINEM PR `--base staging`** (View-Re-Key + Caller müssen zusammenpassen). Nicht Merge-Session → PR, kein self-merge.

---

### Task 1 — `v_claim_phase` claims-zentrisch (DB)

**Files:** Migration via Plugin → commit `supabase/migrations/<V>_cmm44_mp8b_v_claim_phase_claims_centric.sql`

- [ ] **Step 1:** Live-Stand ziehen (READ): `pg_get_viewdef('public.v_claim_phase')` + `reloptions` (security_invoker) + Bestätigung `kanzlei_faelle.claim_id`/`auftraege.claim_id`/`claims.lead_id` (information_schema, [[feedback_information_schema_check]]).
- [ ] **Step 2:** `apply_migration({name:'cmm44_mp8b_v_claim_phase_claims_centric', query: <Spec §3.1 CREATE OR REPLACE VIEW, FROM claims>})`. security_invoker-Reloption erhalten (CREATE OR REPLACE bewahrt sie; falls DROP nötig → Option + Grants explizit neu setzen).
- [ ] **Step 3:** `list_migrations` → recorded `<V>` ablesen; Migration-File exakt so benennen. **Auch** den vorherigen Zwischen-Fix `cmm44_mp8b_v_claim_phase_join_on_claim_id` (recorded, File fehlt) als File nachziehen → kein Twin-Drift.
- [ ] **Step 4: Verify (execute_sql READ):**
  - `phase_dist` == {erfassung/vollmacht_offen:61, begutachtung/kanzlei_uebergabe:12, erfassung/sa_offen:1} **+ 1 zusätzliche Row** (fall-loser Claim, total 75).
  - `SELECT count(*) FROM v_claim_phase WHERE main_phase IS NULL OR sub_phase IS NULL` = 0.
  - Spot: der fall-lose Claim erscheint jetzt (`SELECT * FROM v_claim_phase WHERE claim_id NOT IN (SELECT claim_id FROM faelle WHERE claim_id IS NOT NULL)`).

### Task 2 — `getClaimLifecycleForClaim` claims-zentrisch (Loader = Parity-Partner der View)

**Files:** `src/lib/claims/get-claim-lifecycle-for-claim.ts` (+ ggf. `get-claim-lifecycle-for-claim.test.ts`)

- [ ] **Step 1:** Datei lesen — aktuelle Input-Beschaffung (woher `lead`, `auftraege`, `kanzleiFall`, `claimStatus`; per faelle.id oder claim_id?).
- [ ] **Step 2:** Sub-Entity-Loads auf **claim-Basis**: `kanzlei_faelle` via `claim_id`, `auftraege` via `claim_id`, `leads` via `claims.lead_id`, `claimStatus` aus `claims` (claims.id). Aggregations-Logik (`getClaimLifecycle` in `lifecycle.ts`) UNVERÄNDERT.
- [ ] **Step 3:** Loader-Vertrag: nimmt `claimId` (= claims.id). Aufrufer-Audit (s. Task 3) zieht den richtigen Wert rein.
- [ ] **Step 4:** vitest `get-claim-lifecycle-for-claim.test.ts` grün (Assembly-Branches); falls Input-Shape sich ändert, Tests nachziehen.

### Task 3 — Caller-Audit + Alignment auf `claims.id`

**Files:** `src/app/faelle/[id]/page.tsx`, `src/lib/kanzlei/queries.ts`, `src/lib/kanzlei/actions.ts`, `src/lib/makler/copilot-prompt.ts`, `src/lib/makler/queries.ts`, `src/lib/claims/claim-phase-map.ts`

- [ ] **Step 1:** `claim-phase-map.ts` Kommentar „claim_ids == faelle.id" → „== claims.id".
- [ ] **Step 2: Fallakte** `page.tsx:133` (`getClaimPhaseMap([claimId])`, claimId=fall.claim_id) — **bestätigen korrekt** (claims.id), kein Change. Prüfen ob `getClaimLifecycleForClaim`-Aufruf (MP-4b) `id` (faelle.id, Route) statt claimId übergibt → auf `claimId` (claims.id) umstellen, konsistent mit Task 2.
- [ ] **Step 3: kanzlei/queries+actions** (`getClaimPhaseMap([claimId])`, claims.id) — **bestätigen korrekt**, kein Change.
- [ ] **Step 4: makler** (3 Sites passen faelle.id) → auf claims.id:
  - `copilot-prompt.ts:142` + `queries.ts:395` (Detail): `faelle.claim_id` mitselektieren, `getClaimPhaseMap([claimId]).get(claimId)`.
  - `queries.ts:587` (Liste): faelle-Rows um `claim_id` erweitern, `getClaimPhaseMap(claimIds)`, Row→Phase via `row.claim_id`. fallId→claimId-Bridge wo die Row per fallId gekeyt bleibt.
  - Kommentare „claim_id == faelle.id" in makler entfernen.

### Task 4 — Build + Gates

- [ ] **Step 1:** Worktree-`node_modules` echt (`unlink node_modules && npm ci` falls Junction degradiert, [[feedback_worktree_build_gate]]).
- [ ] **Step 2:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` exit 0; `npx tsc --noEmit` 0.
- [ ] **Step 3:** `npx vitest run src/lib/claims src/lib/fall` grün.
- [ ] **Step 4:** `npm run check:token-audit` + `npm run check:component-set -- --ratchet` grün.

### Task 5 — Parity-Probe (Loader ↔ View, Vorbote MP-9)

**Files:** `scripts/probe-claim-phase-parity.mjs` (existiert; claims-zentrisch mitziehen)

- [ ] **Step 1:** Probe auf claims.id-Basis: lädt Inputs wie der claims-zentrische Loader, vergleicht gegen `v_claim_phase` per claim_id.
- [ ] **Step 2:** Run → **0 Divergenzen / 75 Claims** (inkl. fall-loser). Bei Divergenz: View vs Loader angleichen (müssen bit-gleich sein).

### Task 6 — Commit + PR

- [ ] **Step 1:** Stagen: 2 Migration-Files + get-claim-lifecycle-for-claim + page.tsx + kanzlei/* (nur falls Change) + makler/* + claim-phase-map.ts + Probe. NICHT die Smoke-Screenshots/-Artefakte.
- [ ] **Step 2:** Commit mit 7-Punkt-Audit (Build grün, Regression: Parity 75/75, Inkonsistenz: claims.id-Key konsistent, …).
- [ ] **Step 3:** `gh pr create --base staging` mit Spec/Plan-Link + „supersedet faelle.id-Phasen-Key; Phase-4-Stück".

### Task 7 — Smoke + terminale e2e (nach staging-Deploy / Merge)

- [ ] **Step 1:** Aus Worktree (hat @playwright/test) mit kopierter `.env.local` (danach löschen): Portal-Smoke (`smoke-cmm44-mp4-staging.mjs`) + Endzustand-UI-Smoke (`smoke-mp8-endzustand.mjs`) → 4-Phasen + Dropdown korrekt, Screenshots auswerten ([[feedback_smoke_screenshot_pflicht]]).
- [ ] **Step 2: Makler-Smoke** (war bisher pattern-bewiesen, jetzt mit claims.id-Caller realer Test wenn Makler-Konto/Consent vorhanden) — sonst dokumentieren.
- [ ] **Step 3: Terminale e2e:** Test-Claim (claims.id, non-terminal) → UI „Verjährt" (notify off) → Fallakte+Kanban+Kunde zeigen **Abschluss/verjaehrt** → DB-verify `v_claim_phase` → revert (UPDATE status + endzustand-Felder null; test-cleanup).

### Task 8 — Follow-up-Ticket

- [ ] lead→claim Field-Sync als Phase-3-Slice anlegen (claims.{sa_unterschrieben,vollmacht_signiert_am,onboarding_complete} aus leads backfillen+syncen → View kann `leads`-Join droppen). Notieren, nicht hier umsetzen.

---

## Self-Review
- **Spec-Coverage:** View (T1) + Loader (T2) + Caller (T3) + Gates (T4) + Parity (T5) + PR (T6) + Smoke/e2e (T7) + Follow-up (T8) decken Spec §3/§5. ✓
- **Reihenfolge:** View additiv zuerst (DB), dann Code, EIN PR (View+Caller zusammen). ✓
- **Key-Konsistenz:** überall `claims.id`; einzige `leads`-Abhängigkeit via `claims.lead_id` (dokumentiert, Phase-3-Exit). ✓
- **Drift:** beide recorded Migrationen als Files (T1.S3). ✓

## Execution Handoff
Inline ausführbar (eine Person, enges Slice). DB-Tasks (T1) + Code (T2-4) jetzt; T7 nach Merge+Deploy. Nicht Merge-Session.
