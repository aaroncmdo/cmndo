# Performance — indexes, bloat, RLS query shape

Both code citations confirmed: `get-claim-for-role.ts:170` reads `v_claim_full`, and 26 files consume it (6 cron routes confirmed in the file list, plus `mitarbeiter/performance/page.tsx`). I have all evidence needed. Writing the corrected report.

## Performance — indexes, bloat, RLS query shape
**Summary:** The finder's structural thesis is sound and most findings hold, but several numbers were wrong and one real finding was missed entirely. The over-indexing story is confirmed and actually *worse* than stated: `gutachter_termine` is 8192 bytes of data under 216 kB of indexes (~27x, not 13x), and `leads` carries 424 kB of indexes over a 208 kB table (not 344 kB). The 5 initplan policies and 5 unindexed FKs are exactly confirmed. The 3 duplicate indexes are confirmed. The dead-tuple "no bloat" claim is confirmed (max dead tuple anywhere = 39). The biggest miss: the finder named `cron_jobs_audit_pkey 1104 kB` as the biggest index — it is wrong on both the table and the value. `cron_jobs_audit` is a 24,491-row audit log (2.8 MB table + 3.2 MB indexes, incl. `idx_cron_audit_job_started` at 2112 kB) — by far the largest object in the entire DB and a genuine net-new cleanup target the finder skipped. The most important correction is the permissive-stack finding: the finder dramatically undercounted because it never expanded `ALL`-command policies — there are **5 tables with 4-deep SELECT stacks** (not "two x3"), because the `staff_fall_scoped` / `*_staff_all` ALL-policies OR onto every command on top of the named SELECT policies.

### Findings

- **[HIGH] `v_claim_full` is a 12-aggregate mega-view on the single-claim read path**  ·  category: performance  ·  effort: m  ·  coveredByCMM49: partial  ·  **[CONFIRMED]**
  - Evidence: Re-ran live (#7): `v_claim_full` def = 6036 chars, exactly **12 `jsonb_agg`**, 8 joins, 3 LATERAL, 12 COALESCE, `touches_faelle=1`. Re-read `src/lib/claims/get-claim-for-role.ts:169-173` — confirmed `.from('v_claim_full').select(COLUMN_PROFILES[rolle]).eq('id', claimId).maybeSingle()` is the only read. Grep confirms **26 consumer files** incl. all 6 cited cron routes (`api/cron/{vs-timer,vollmacht-reminder,vs-korrespondenz-review,sa-reminder,pflichtdokumente-reminder,re-termin-eskalation}/route.ts`) and `mitarbeiter/performance/page.tsx`. The column-whitelist (`COLUMN_PROFILES`, lines 155-161) prunes output columns but cannot prune in-view aggregates — confirmed correct.
  - Recommendation: As finder. Split into a scalar core view + on-demand sub-entity fetches, or give scalar-only cron/KPI callers a thin view. Fold the view-split into CMM-49 §B re-base rather than a bare faelle→claims column swap.
  - Info-loss risk: none.

- **[HIGH] 5 unindexed FKs — two on the faelle-DROP-CASCADE / re-key path**  ·  category: performance  ·  effort: s  ·  coveredByCMM49: partial  ·  **[CONFIRMED]**
  - Evidence: Re-ran (#2), exact match to finder's 5: `embed_abrechnung_positionen.termin_id`→`gutachter_termine`, `claims.kanzlei_abrechnung_id`→`kanzlei_abrechnungen`, `anfragen.disqualifiziert_durch`→`auth.users`, `gutachter_finder_anfragen.abrechnung_storno_durch_user_id`→`profiles`, `gutachter_finder_anfragen.abrechnung_sv_id`→`sachverstaendige`. `gutachter_finder_anfragen` row count re-confirmed = 2342 (#9).
  - Recommendation: As finder — add 5 covering b-tree indexes; prioritize the two on the CMM-49 §E/§G cascade path.
  - Info-loss risk: none.
  - Note: coveredByCMM49 is genuinely "partial" — CMM-49 §E re-keys 37 tables but does not enumerate adding *covering indexes* for cascade performance; that's net-new within the planned work.

- **[HIGH · was MEDIUM] Permissive-policy stacking is deeper than reported: 5 tables carry 4-deep SELECT stacks; the finder undercounted by ignoring ALL-policies**  ·  category: performance  ·  effort: m  ·  coveredByCMM49: no  ·  **[ADJUSTED: not "two x3" — it is five x4 + nine x3; severity raised HIGH]**
  - Evidence: The finder's query did not expand `cmd='ALL'` into its four commands, so it missed that `staff_fall_scoped` (ALL), `*_staff_all` (ALL), and `Admins full access` (ALL) OR onto *every* command. Re-ran with LATERAL expansion (#4-fixed): **x4 SELECT stacks on `fall_dokumente`, `gutachter_termine`, `leads`, `pflichtdokumente`, `timeline`**; x3 SELECT on `gutachter_finder_anfragen` (`gfa_admin_select | gfa_anon_select_recent_window | gfa_select_sv_own`), `profiles`, `qc_checkliste`, `sachverstaendige`, `vertragsvorlagen`, plus x3 INSERT/SELECT on `nachrichten`, x3 SELECT on `faelle`, x3 UPDATE on `pflichtdokumente`. `leads` SELECT is x4 (not x3 — finder missed `leads_staff_all_consolidated` which is an ALL policy). Each row is tested against the OR of all stacked predicates, several containing `EXISTS(... profiles ...)` sub-selects.
  - Recommendation: As finder (collapse each stack into one OR-ed policy with `(SELECT auth.uid())`-cached subject), but the *priority list changes*: the worst real cost is now the x4 SELECT tables `gutachter_termine`/`fall_dokumente`/`timeline`/`pflichtdokumente` (all `staff_fall_scoped`-driven, each predicate joins back to the fall) plus `gutachter_finder_anfragen` x3 on the 2342-row table. Note `staff_fall_scoped` is a single shared ALL-policy duplicated across these tables — consolidating *it* (or making the staff branch part of each table's single consolidated policy) collapses the +1 depth on all five at once.
  - Info-loss risk: none if the OR-ed predicate is the exact union; regression-test each role's visible row set per table.

- **[MEDIUM] 5 RLS policies still call bare `auth.*()` (initplan re-eval per row)**  ·  category: performance  ·  effort: xs  ·  coveredByCMM49: no  ·  **[CONFIRMED]**
  - Evidence: My first regex over-matched (negative-lookbehind unreliable in Postgres regex), so I re-ran a count-based check (#3b) that flags policies containing an `auth.*()` call with **zero** `(select auth.*` wrappers: exactly 5, identical to finder: `anfragen.anfragen_select_admin_dispatch` (SELECT), `anfragen.anfragen_update_admin_dispatch` (UPDATE), `embed_abrechnung_positionen.embed_pos_sv_select` (SELECT), `embed_sites.embed_sites_owner_select` (SELECT), `matelso_calls.matelso_calls_staff` (ALL). Matches `auth_rls_initplan=5` advisor.
  - Recommendation: As finder — wrap each as `(SELECT auth.uid())`/`(SELECT auth.role())`. Mechanical 5-line migration finishing an incomplete sweep.
  - Info-loss risk: none.

- **[MEDIUM] 78% of indexes unused (534/682); index footprint exceeds table footprint on hot write-targets**  ·  category: performance  ·  effort: m  ·  coveredByCMM49: partial  ·  **[ADJUSTED: table-size numbers wrong; ratios are worse than stated]**
  - Evidence: Re-ran (#1): 534 unused / 682 total — confirmed. But the per-table footprint numbers (#6) differ materially from the finder's prose:
    - `leads`: **208 kB table** / 424 kB index (finder said 344 kB table — wrong; index-to-table is ~2x, not 1.2x), 21 idx / 16 unused, 331 rows.
    - `gutachter_termine`: **8192 bytes table** / 216 kB index = **~27x** (finder said "16 kB / ~13x" — wrong on both; only 18 rows), 15 idx / 9 unused.
    - `gutachter_finder_anfragen`: 328 kB / 648 kB, 16 idx / 10 unused, 2342 rows.
    - `claim_parties`: 32 kB / 216 kB (finder said 72 kB — wrong), 14 idx / 9 unused, 72 rows.
    - `gutachten`: 8192 bytes / 160 kB, 11 idx / 9 unused, **2 rows**.
    - `fall_dokumente`: 8192 bytes / 152 kB, 10 idx / all 10 unused.
  - Recommendation: As finder — treat as candidate list, not auto-drop; prune the write-hot over-indexed tables (`leads`, `gutachter_finder_anfragen`) deliberately; defer faelle's 19 indexes (die with the table). The corrected ratios *strengthen* the finder's write-amplification argument.
  - Info-loss risk: as finder — keep unique/constraint indexes; grep each non-unique candidate before dropping.

- **[LOW] 3 genuine duplicate indexes (same column set)**  ·  category: redundancy  ·  effort: xs  ·  coveredByCMM49: no  ·  **[CONFIRMED]**
  - Evidence: Re-ran (#5), exact match: `content_translations_lookup_idx` dup of unique `content_translations_unique` (cols 2,3); `idx_fall_read_state_user` dup of PK `fall_read_state_pkey` (cols 1,2); `idx_ocr_runs_gutachten` dup of unique `ocr_runs_gutachten_id_run_nummer_key` (cols 2,3). In each pair the non-constraint twin is droppable.
  - Recommendation: As finder — drop `content_translations_lookup_idx`, `idx_fall_read_state_user`, `idx_ocr_runs_gutachten`.
  - Info-loss risk: none.

- **[INFO] No dead-tuple bloat; no tables without PK**  ·  category: hygiene  ·  effort: xs  ·  coveredByCMM49: no  ·  **[CONFIRMED]**
  - Evidence: Re-ran (#11): **max(n_dead_tup) across all public tables = 39**, tables with >50 dead tuples = 0. `tables_no_pk=0` (#1). Finder's "zero tables > 50 dead tuples" is exactly right.
  - Recommendation: No action now. Re-check after volume grows.
  - Info-loss risk: none.

- **[LOW · CHALLENGE] The whole advisor surface is premature optimization for ~75 claims / ~331 leads**  ·  category: challenge  ·  effort: l  ·  coveredByCMM49: no  ·  **[CONFIRMED — with one caveat]**
  - Evidence: Row counts re-confirmed (#9): claims=75, leads=331, faelle=74, claim_parties=72, gutachten=**2**, gutachter_termine=**18**, gutachter_finder_anfragen=2342, email_log=481. 682 indexes / 12-aggregate views for single-row reads is real over-engineering. The sequencing recommendation (cheap structural wins now, bulk index prune after faelle drop) is sound.
  - Caveat: the "negligible absolute cost today" framing is slightly too sweeping — see the Missed section. `cron_jobs_audit` at 24,491 rows is *not* negligible and is growing unbounded; and the `staff_fall_scoped`-driven x4 RLS stacks are a real per-query cost on the hottest fall-scoped tables, not just clutter.
  - Info-loss risk: none (sequencing advice).

### Missed in this dimension

- **[MEDIUM · net-new] `cron_jobs_audit` is the largest object in the DB (24,491 rows, 2.8 MB table + 3.2 MB indexes) and grows unbounded — the finder cited it but with wrong numbers and as a throwaway**  ·  category: hygiene/performance  ·  effort: s  ·  coveredByCMM49: no
  - Evidence: #10 — the two biggest indexes in the entire public schema are `idx_cron_audit_job_started` (2112 kB) and `cron_jobs_audit_pkey` (1104 kB); #11 — `cron_jobs_audit` = 24,491 rows, table 2824 kB, indexes 3224 kB. The finder's "biggest single index: `cron_jobs_audit_pkey` 1104 kB" is wrong (the started-at index at 2112 kB is bigger) and it framed it as incidental rather than as the dominant data object. By contrast the largest *claim-domain* table is only ~80-208 kB. This is a cron execution log accumulating ~unbounded with two indexes >1 MB each.
  - Recommendation: Add a retention policy (e.g. a daily `DELETE FROM cron_jobs_audit WHERE started_at < now() - interval '30 days'` cron, or partition by month + drop old partitions). This single table holds more bytes than the entire claims+faelle+leads core combined. Independent of CMM-49.
  - Info-loss risk: losing old cron-run audit history beyond the retention window — mitigate by archiving to cold storage if compliance needs it (likely not; it's operational telemetry).

- **[LOW · net-new] `plz_geo` carries 856 kB of indexes (`plz_geo_lat_lng_idx` 480 kB + `plz_geo_pkey` 376 kB) — second-largest index footprint, a static reference table**  ·  category: hygiene  ·  effort: xs  ·  coveredByCMM49: no
  - Evidence: #10 — `plz_geo_lat_lng_idx` 480 kB, `plz_geo_pkey` 376 kB rank #3/#4 among all indexes. `plz_geo` appears in the shared facts as a x2-permissive-policy table; it is a static German postal-geo lookup. The lat/lng index is justified only if there are active radius/geo queries against it.
  - Recommendation: Verify `plz_geo_lat_lng_idx` is actually scanned by a live geo query (it was in the unused-index set candidate space — confirm via `idx_scan` and a code grep for `plz_geo` distance queries). If unused, it's the single biggest droppable non-cron index in the DB.
  - Info-loss risk: none if confirmed unused; if a finder/isochrone path uses it, keep.

- **[LOW · net-new] `idx_benachrichtigungen_user_unread` (240 kB) is the largest index on a notification table — worth confirming it's a partial index on unread, not a full duplicate**  ·  category: performance  ·  effort: xs  ·  coveredByCMM49: no
  - Evidence: #10 — ranks #5 among all indexes at 240 kB. `benachrichtigungen` also appears with x2 stacked SELECT/UPDATE policies (#4). At 240 kB it is larger than most core tables.
  - Recommendation: Confirm it is `WHERE gelesen=false` (partial) and actually serves the unread-badge query; if it is a full index duplicating a user_id index, prune. Quick check, low stakes.
  - Info-loss risk: none if duplicate; keep if it's the partial index backing the live unread count.

### Open questions
- (Carried from finder, still open) For the `leads`/`gutachter_finder_anfragen` consolidation: `gfa_anon_select_recent_window` and `Flow anon select leads` grant *anon* access on time/token windows. Collapsing them into the authenticated stack changes the role boundary and intersects the live-RLS-audit HIGH backlog. Keep anon as a separate single policy (auditable in isolation), or accept one OR-ed policy? My data confirms this matters for 5 tables now (the x4 stacks), not 2.
- `staff_fall_scoped` is one shared ALL-policy replicated across `fall_dokumente`, `gutachter_termine`, `timeline`, `pflichtdokumente`, `qc_checkliste`, `nachrichten`, `calls`, `call_*`, `ki_gespraeche`. Is there an owner for consolidating it, given CMM-49 §F will "claim-ify functions/RLS" anyway? If §F rewrites these predicates from `fall_id` to `claim_id`, the consolidation should happen in the same pass — otherwise it's rework.
- CMM-49 §B: does the view re-base commit to **splitting** `v_claim_full` (scalar core vs aggregates), or only swap `faelle.*`→`claims.*`? If only the latter, the 12-aggregate read-path cost survives the faelle drop. (Carried from finder; my evidence confirms the view is still `touches_faelle=1` today.)
- `cron_jobs_audit` retention: is there a compliance reason to keep >30 days of cron-run telemetry, or is unbounded growth simply an oversight? This is the single largest space win available and is independent of the faelle drop.