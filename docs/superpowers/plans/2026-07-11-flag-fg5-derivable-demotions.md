# Derivable-Duplicate Demotions Implementation Plan
> # ✅ UEBERHOLT (verifiziert 2026-08-12) — NICHT MEHR AUSFUEHREN
>
> Die geplanten „Demotions" ableitbarer Duplikat-Spalten sind durch spaetere Konsolidierungen
> **radikaler geloest**: die Ziel-Spalten existieren auf `claims` schlicht nicht mehr.
>
> **DB-Beleg (12.08., information_schema):** `status`, `work_state`, `sla_breached`, `sla_blocker`
> sind auf `claims` **alle gedroppt**; vorhanden ist nur noch `operative_status` als SSoT.
> Eine Demotion „Spalte bleibt, wird aber nicht mehr geschrieben" ist damit gegenstandslos —
> es gibt keine Spalte mehr zu demoten.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax.
> **Isolation:** implement in a dedicated worktree (`node scripts/new-session-worktree.mjs flag-fg5-derivable-demotions`). Each demotion is an INDEPENDENT task — safe to ship one at a time (boy-scout).
**Goal:** Retire derivable-duplicate state columns/predicates from Fix-Group FG5 of the interaction-flags audit — deriving closed-ness, gutachten-presence, termin-completion, upload-presence, and reminder-recency from their authoritative sources instead of stored duplicates.
**Architecture:** The codebase already has a derived state layer (`getClaimLifecycle`⟷`v_claim_phase`, `v_claim_base` LATERAL joins). FG5 finishes the migration for a handful of leftover duplicates: migrate READERS off the stored duplicate onto the derived source FIRST (deploy), then — only in a later task — DROP the now-orphan column or DEAD predicate. Timestamp-valued columns that carry a real value (duration KPIs) stay; only their boolean/status *reads* are simplified.
**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- Never push to `main`. Feature branch `kitta/aar-<nr>-<slug>` (or `flag-fg5-*`), PR against `staging`, review before merge.
- DDL ONLY via `mcp__plugin_supabase_supabase__apply_migration` → `list_migrations` (read the plugin-assigned version `<V>`) → commit `supabase/migrations/<V>_<name>.sql` (filename == tracked version) → verify via `execute_sql` READ. NEVER raw `execute_sql` with DDL, NEVER `supabase db push`.
- **CRITICAL anti-landmine sequencing:** migrate ALL readers off a column FIRST and deploy; DROP the column only in a strictly later task. This repo had a `vollmacht_unterschrieben` dropped-column runtime incident (AAR-599) — a live `main` referencing a dropped column throws at runtime.
- Server-Actions return `{ ok: boolean; error?: string }`, never `throw` (except auth-guards). `revalidatePath` every mutating write.
- Frontend user-visible strings: real umlauts (`ä/ö/ü/ß`). Backend/comments/logs: ASCII fine.
- 7-point post-task audit before every commit; Audit-block in commit body + Co-Authored-By line.
- Umlaut/token/component-set/knip ratchets: don't add new violations; boy-scout existing where a touched file allows.
- Design tokens: `bg-success`/`text-success-strong` etc., `rounded-ios-*`, `text-body*`/`text-heading-*`. No raw Tailwind status/accent scales, no bracket-hex.
- **Verify every file:line against live code before editing — citations are Stand 2026-07-11 on branch `aar-956` and DRIFT.** Verify column existence in `src/lib/supabase/database.types.ts` + migrations + `information_schema` before each DDL task.

---

## Findings that CORRECT the spec (read before starting)

The audit spec (`docs/superpowers/specs/2026-07-11-interaction-flags-db-driven-audit-design.md` §7 FG5) cited stale file:line and one misattribution. Verified against the live DB (project `paizkjajbuxxksdoycev`) on 2026-07-11:

1. **`claims.abgeschlossen_am` is NOT a simple boolean-duplicate that can be dropped.** It is a real `timestamptz` (SSoT on `claims`; the `faelle` twin was dropped in CMM-44 SP-A). It is written ONLY by `state-machine.ts:121` when the operative flow reaches `abgeschlossen`. **Three readers consume it as an actual timestamp VALUE** (duration KPIs + monthly windowing), so the column must stay: `mitarbeiter/performance/page.tsx:27,52`, `admin/team/[id]/page.tsx:40,50-52` + `admin/team/page.tsx:30` + `admin/team/leaderboard/page.tsx:28-29,56-58`, `api/cron/community-leaderboard-update/route.ts:63,74-86`. Only the *boolean* closed-check readers (`FallKarte.tsx:76`, `KundeAktivStatusHero.tsx:37`, `kunde/jetzt-zu-tun.ts:147`, `subphase-resolver.ts:214`) are candidates to derive from terminal `status` / `main_phase`. → **DROP is NOT viable; scope = read-side consistency only** (Cluster 1).

2. **`faelle.gutachten_vorhanden` DOES NOT EXIST.** `information_schema` shows a physical `gutachten_vorhanden` column ONLY on `qc_checkliste` (a legit manual QC checklist bool, class F). `faelle` has no `gutachten_vorhanden` (and no `abgeschlossen_am`/`status` either — all moved to `claims`). The spec's `seed-testdata:796` citation is a **misattribution**: line 796 is inside the `qc_checkliste` seed block (`13. QC_CHECKLISTE`), writing `qc_checkliste.gutachten_vorhanden`, NOT `faelle`. And `v_faelle_mit_aktuellem_termin.gutachten_vorhanden` already derives as `g.id IS NOT NULL` from the `gutachten` LATERAL join in `v_claim_base`. → **Cluster 2 is a no-op / verification-only.**

3. **`gutachter_termine.status` CHECK does NOT contain `durchgefuehrt`** (confirmed via `pg_get_constraintdef`). The enum is `reserviert, bestaetigt, abgelehnt, abgesagt, storniert, abgeschlossen, sv_gesucht, gegenvorschlag, verschoben, verlegt, verlegung_pending, dispatch_pending`. So every predicate `gt.status = 'durchgefuehrt'` matches 0 rows (DEAD). Two objects carry it: `get_aktueller_gt_termin_id` (SQL function) and `v_embed_billing_faellig` (view). `v_claim_phase` also matched `durchgefuehrt` but that is `WHEN c.status = 'termin_durchgefuehrt'` (a DIFFERENT enum — `claims.status`, legit — leave it). **Note the spec's premise that `durchgefuehrt_am IS NOT NULL` is the completion anchor holds, but `durchgefuehrt_am` is NOT a column on `gutachter_termine` in a way exposed by these two objects** — RE-VERIFY the anchor column before rewriting (see Cluster 3, Task 3a).

4. **Upload triads `leads.{polizeibericht,zeugenaussage}_status/_url/_hochgeladen_am` are the riskiest cluster and are ENTANGLED with active AAR-956 feature code.** `uploadPolizeiberichtFlow`/`uploadZeugenaussageFlow` (`self-service-actions.ts:420,491`) are AAR-956 16.06 features on THIS branch's lane. The `polizeibericht_*` triad has a deep legacy pipeline (Twilio webhook `route.ts:457-483`, `process-inbound-media.ts:168-178`, Pflicht-check `create-pflicht.ts:87`, BKat, dispatch form, flow page, `create-for-fall.ts`, `convert-lead-to-claim.ts:337`, and it is ALSO a physical `claims.polizeibericht_status` column in `CLAIM_OWNED_DUPLICATE_COLUMNS`). **Crucially, lead-stage writes (flow + Twilio) happen BEFORE any `fall_dokumente` row exists (no `fall_id` yet)** — so presence CANNOT be derived from `fall_dokumente` at lead-stage. → **Cluster 4 is scoped down to the safe, self-contained part only** (see Task 4).

5. **`abrechnungen.reminder_gesendet_am` is a clean admitted duplicate** of `abrechnung_reminders` (comment at `abrechnung-reminder/route.ts:22-24`). Sole reader = admin listing (`admin/abrechnungen/page.tsx:27,51` → `AbrechnungenListClient.tsx:33,299`, an Info-row "Reminder gesendet"). Sole writer = the reminder cron `route.ts:129-131`. → **Cluster 5 is the one genuinely clean DROP** (reader-first, then drop).

**Net:** of 5 nominal clusters, only **2 involve real work**: Cluster 3 (DDL — drop 2 DEAD predicates) and Cluster 5 (code + DDL — migrate 1 reader, drop 1 column). Cluster 1 is a small read-side consistency polish (no DDL). Cluster 2 is verification-only. Cluster 4 is deliberately deferred/minimized.

---

## File Structure

```
docs/superpowers/plans/2026-07-11-flag-fg5-derivable-demotions.md   (this plan)

# Cluster 1 (code-only, read-side consistency — no DDL)
src/components/kunde/FallKarte.tsx                                  (edit: derivePhase)
src/components/kunde/KundeAktivStatusHero.tsx                       (edit: deriveStep — optional/no-op check)
src/lib/kunde/jetzt-zu-tun.ts                                       (edit: abschluss gate — already OR-guarded)
src/lib/fall/subphase-resolver.ts                                  (leave; see Task 1c rationale)

# Cluster 3 (DDL — remove DEAD durchgefuehrt predicate)
supabase/migrations/<V>_fg5_drop_dead_durchgefuehrt_predicate.sql  (new)
  → recreates get_aktueller_gt_termin_id (drop 'durchgefuehrt' from status array)
  → recreates v_embed_billing_faellig   (drop 'durchgefuehrt' from status array)

# Cluster 5 (code-then-DDL — reminder_gesendet_am)
src/app/admin/abrechnungen/page.tsx                                (edit: source recency from abrechnung_reminders)
src/app/admin/abrechnungen/AbrechnungenListClient.tsx              (unchanged if field kept; else edit)
src/app/api/cron/abrechnung-reminder/route.ts                      (edit: stop writing reminder_gesendet_am)
supabase/migrations/<V>_fg5_drop_abrechnungen_reminder_gesendet_am.sql (new — LATER task, after readers/writer deployed)

# Tests (vitest — `npm run test`)
src/lib/kunde/jetzt-zu-tun.test.ts                                 (existing — extend)
src/components/kunde/__tests__/fall-karte-phase.test.ts            (new — derivePhase unit)
src/app/admin/abrechnungen/__tests__/reminder-recency.test.ts     (new — recency helper unit)
src/lib/abrechnungen/reminder-recency.ts                          (new — extracted pure helper)
```

---

## Cluster 1 — `claims.abgeschlossen_am` read-side consistency (code-only, NO DDL)

**Why no drop:** the column carries a real timestamp consumed by KPI/window readers (see Finding 1). We only align the boolean closed-check readers to the terminal-status truth, closing the spec's inconsistency (§5.7: `storniert`/`verjaehrt` set via `endzustand-actions` never set `abgeschlossen_am`, so a claim can be "closed by status but open by `abgeschlossen_am`"). The fix makes the boolean readers treat *any* terminal status as closed, so they no longer depend on `abgeschlossen_am` presence.

**Truth source:** `lifecycle.ts:133` `ABSCHLUSS_SUBSTATE` = terminal `claims.status` set = `{ reguliert_vollstaendig, storniert, klage_rechtsstreit, verjaehrt, abgelehnt_final, an_externe_kanzlei_uebergeben, termin_durchgefuehrt }`. Note: the readers below receive `status` = **operative_status** (the kunde loaders expose `operative_status` as `status`), whose closed values are `{ abgeschlossen, storniert }` — verify which axis each reader sees before editing.

### Task 1a — Extract shared terminal-status helper + failing test
- [ ] RE-VERIFY: `src/lib/claims/lifecycle.ts:133` `ABSCHLUSS_SUBSTATE` keys; and confirm what `status` value `FallKarte`/`KundeAktivStatusHero`/`jetzt-zu-tun` actually receive (grep the loaders `get-kunde-faelle.ts` + `kunde/page.tsx:140,216` — is it `operative_status` or terminal `claims.status`?).
- [ ] **Files:** new `src/lib/claims/terminal-status.ts`.
- [ ] **Interface:**
  ```ts
  // Pure, no imports from 'use server' files. Exported const + fn (safe: not a server file).
  export const TERMINAL_CLAIM_STATUS: ReadonlySet<string>   // ABSCHLUSS_SUBSTATE keys
  export const CLOSED_OPERATIVE_STATUS: ReadonlySet<string> // { 'abgeschlossen', 'storniert' }
  /** True if the claim is in a closed/terminal state by status alone (either axis). */
  export function istClaimGeschlossen(args: { status?: string | null; operativeStatus?: string | null; abgeschlossenAm?: string | null }): boolean
  ```
- [ ] **Failing test** `src/lib/claims/__tests__/terminal-status.test.ts` (REAL): assert `istClaimGeschlossen({ status:'storniert' })===true`, `istClaimGeschlossen({ operativeStatus:'abgeschlossen' })===true`, `istClaimGeschlossen({ abgeschlossenAm:'2026-01-01T00:00:00Z' })===true`, `istClaimGeschlossen({ status:'in_bearbeitung' })===false`, `istClaimGeschlossen({})===false`.
- [ ] Run `npm run test -- terminal-status` → **fails** (module missing).
- [ ] Minimal impl (REAL): derive `TERMINAL_CLAIM_STATUS` from the same literal list as `ABSCHLUSS_SUBSTATE` (keep the two in sync via a shared const if `lifecycle.ts` can import it without a cycle; else duplicate with a `// keep in sync with lifecycle.ts ABSCHLUSS_SUBSTATE` comment).
- [ ] Run `npm run test -- terminal-status` → **passes**.
- [ ] Commit `refactor(FG5): istClaimGeschlossen terminal-status helper` + Audit block.

### Task 1b — `FallKarte.derivePhase` uses the helper
- [ ] RE-VERIFY `src/components/kunde/FallKarte.tsx:75-80` `derivePhase` still reads `fall.abgeschlossen_am || fall.status === 'abgeschlossen'`.
- [ ] **Failing test** `src/components/kunde/__tests__/fall-karte-phase.test.ts` (REAL): export `derivePhase` (or test via a tiny re-export) and assert a `status:'storniert'` fall with `abgeschlossen_am:null` returns `'abschluss'` (today it returns `'erfassung'` — the bug). Also assert `abgeschlossen_am` set → `'abschluss'` (regression). Run → **fails** on the storniert case.
- [ ] Minimal impl: replace the inline check with `if (istClaimGeschlossen({ status: fall.status, abgeschlossenAm: fall.abgeschlossen_am })) return 'abschluss'`. Export `derivePhase` for the test (named export; keep default component export). Run → **passes**.
- [ ] Audit: UI unchanged for the happy path; only terminal-via-endzustand claims now correctly show `abschluss`. Commit + Audit block.

### Task 1c — `kunde/jetzt-zu-tun.ts` abschluss gate + verify subphase-resolver
- [ ] RE-VERIFY `src/lib/kunde/jetzt-zu-tun.ts:147`. It already reads `fall.status === 'abgeschlossen' || fall.abgeschlossen_am` — extend to terminal set via the helper so `storniert` claims minimalize correctly.
- [ ] Extend existing `src/lib/kunde/jetzt-zu-tun.test.ts` (add a `status:'storniert', abgeschlossen_am:null` → `state:'fall-abgeschlossen'` case). Run `npm run test -- jetzt-zu-tun` → **fails**.
- [ ] Minimal impl: `if (istClaimGeschlossen({ status: fall.status, abgeschlossenAm: fall.abgeschlossen_am })) { ... }`. Keep the 30-day minimalize branch; when `abgeschlossen_am` is null use `now` (already the code's fallback). Run → **passes**.
- [ ] **subphase-resolver.ts:214** — LEAVE UNCHANGED. Its abschluss gate (`if (claim?.abgeschlossen_am)`) is redundant with `lifecycle.ts:171` (which derives abschluss from terminal `claims.status`), but changing the resolver risks the `v_claim_phase` bit-parity gate (Migration `…083708`). Document in the commit body: "subphase-resolver abschluss-gate left as-is — `getClaimLifecycle` already derives abschluss from terminal status; resolver is a parallel path guarded by the v_claim_phase parity test." (This is a spec §5.7 note, not an FG5 blocker.)
- [ ] Commit + Audit block.

### Task 1d — `KundeAktivStatusHero.deriveStep` (verify only)
- [ ] RE-VERIFY `KundeAktivStatusHero.tsx:37`: `if (f.regulierung_am || f.abgeschlossen_am) return 4`. This maps closed→step 4 (=Reguliert). A `storniert` claim has no `regulierung_am`/`abgeschlossen_am` → would show step 0. Decide with the owner whether a stornierter Fall should show step 4 in this 5-step happy-path hero (it may be intentional that storno isn't a "success" step). If a change is wanted, mirror Task 1b using the helper; otherwise NO-OP and note the decision in the Self-Review. **Default: NO-OP** (the hero is a happy-path visualizer; storno is surfaced elsewhere).

---

## Cluster 2 — `faelle.gutachten_vorhanden` (VERIFICATION-ONLY, no work)

Per Finding 2 there is nothing to demote. This cluster is a documentation/verification task so a future reader doesn't re-chase it.

### Task 2 — Verify + document that the presence-bool is already derived
- [ ] RE-VERIFY via `execute_sql` READ (no DDL): `SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='gutachten_vorhanden' AND table_name NOT LIKE 'v\_%'` → expect ONLY `qc_checkliste`.
- [ ] RE-VERIFY `pg_get_viewdef('public.v_claim_base')` still contains `g.id IS NOT NULL AS gutachten_vorhanden` (derived) and `g.pdf_uploaded_at AS gutachten_hochgeladen_am`.
- [ ] Confirm `src/app/api/seed-testdata/route.ts:~796` writes `qc_checkliste.gutachten_vorhanden` (inside the `13. QC_CHECKLISTE` block), not `faelle`.
- [ ] No code/DDL change. Add a one-line note to the Self-Review section of this plan file (the ONLY allowed edit) — actually: record the finding in the PR description instead (no plan edit needed at execution time). `qc_checkliste.gutachten_vorhanden` is class F (manual checklist) — **do not touch it.**

---

## Cluster 3 — Remove DEAD `durchgefuehrt` predicate from views/function (DDL)

Per Finding 3, `get_aktueller_gt_termin_id` and `v_embed_billing_faellig` both list `'durchgefuehrt'` in a `gutachter_termine.status` array; the CHECK forbids that value ⇒ the predicate matches 0 rows and is pure dead weight (and misleading). This is a pure clean-up: removing a value that can never match cannot change result sets. **No reader migration needed** (nothing reads a `durchgefuehrt` termin — there are none), so no reader-first landmine here; but we still verify empirically that 0 rows carry that status before AND after.

### Task 3a — Verify the anchor + zero-row invariant (READ only)
- [ ] `execute_sql` READ: `SELECT count(*) FROM gutachter_termine WHERE status='durchgefuehrt'` → expect **0** (proves the predicate is dead). If >0, STOP — the CHECK/enum assumptions are wrong; re-open design.
- [ ] RE-VERIFY the completion anchor the spec assumes: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='gutachter_termine' AND column_name IN ('durchgefuehrt_am')`. If `durchgefuehrt_am` exists, note that `get_aktueller_gt_termin_id` may WANT to include recently-completed termine — but it currently keys off `status`, and the completed state is `status='abgeschlossen'` (valid enum value), which the function ALREADY lists. So dropping `'durchgefuehrt'` (the invalid one) is safe and `'abgeschlossen'` stays. **Do NOT add new status values** — only remove the dead `'durchgefuehrt'`.
- [ ] Capture the CURRENT definitions verbatim (`pg_get_functiondef('public.get_aktueller_gt_termin_id')`, `pg_get_viewdef('public.v_embed_billing_faellig', true)`) — the migration must reproduce them minus `'durchgefuehrt'`, byte-for-byte otherwise.

### Task 3b — Apply migration (drop the dead predicate)
- [ ] Write DDL that `CREATE OR REPLACE FUNCTION public.get_aktueller_gt_termin_id(...)` with the status array `array['bestaetigt','verlegung_pending','reserviert','durchgefuehrt','gegenvorschlag']` → `array['bestaetigt','verlegung_pending','reserviert','gegenvorschlag']` AND the ORDER BY `case` losing its `when 'durchgefuehrt' then 5` arm (renumber `else 6` → keep gaps or renumber to `else 5`; gaps are harmless, prefer minimal diff = just delete the `durchgefuehrt` arm). Keep `STABLE`, `LANGUAGE sql`, signature identical.
- [ ] Same migration: `CREATE OR REPLACE VIEW public.v_embed_billing_faellig AS <captured def with status array ARRAY['bestaetigt'::text, 'durchgefuehrt'::text] → ARRAY['bestaetigt'::text]>`. Everything else byte-identical (it is a `SELECT DISTINCT ON`, `SECURITY`-default view). **Grant check:** after replace, RE-VERIFY grants are intact (`check:rls-grants` if applicable) — `CREATE OR REPLACE VIEW` preserves grants, but confirm.
- [ ] `apply_migration({ name: 'fg5_drop_dead_durchgefuehrt_predicate', query: <DDL> })`.
- [ ] `list_migrations` → read plugin-assigned `<V>`.
- [ ] Commit `supabase/migrations/<V>_fg5_drop_dead_durchgefuehrt_predicate.sql` (filename == `<V>`).
- [ ] `execute_sql` READ verify: `pg_get_functiondef` + `pg_get_viewdef` no longer contain `durchgefuehrt`; `SELECT count(*) FROM v_embed_billing_faellig` returns same count as a pre-change snapshot (capture before). Also re-run the count in Task 3a → still 0-affected.
- [ ] `npm run check:migration-utf8`. Commit + Audit block (`Build: n/a DDL-only; Regression: 0-row predicate, result sets identical, grants preserved`).

**Downstream note:** the migration-drift memory already tracks `20260530234811_...v_embed_billing_faellig` as a prod-orphan (COORDINATION-migration-drift-2-orphans). This `CREATE OR REPLACE VIEW` supersedes that shape — coordinate with the release/drift lane (session 35660476) so the recreate lands cleanly and the orphan marker is resolved, not re-created.

---

## Cluster 4 — Upload presence triads (SCOPED-DOWN / mostly deferred)

Per Finding 4 this is the riskiest cluster and overlaps active AAR-956 feature code + a lead-stage flow where `fall_dokumente` does not yet exist. **Do NOT drop `leads.{polizeibericht,zeugenaussage}_{status,url,hochgeladen_am}` in this plan.** The URL fields are load-bearing (BKat reads `polizeibericht_url`, Pflicht-sync reads it, flow page renders it). The `_status` presence-bool at lead-stage has no `fall_dokumente` fallback.

The only safe, self-contained improvement is to stop **re-deriving presence into `_status`** where a `fall_dokumente` row is ALSO written in the same code path, and to read presence from that row. That applies to exactly ONE call-site pair (`upload/dokumente/[token]/actions.ts:184-192,222-227`), which already writes both. Even there, the `leads._status` write is an intentional legacy compat-mirror ("damit alte Queries (Pflicht-Check) weiter funktionieren", comment `:186`) — so removing it would break `create-pflicht.ts:87` and the Twilio dedup readers. **Therefore Cluster 4 = document + defer.**

### Task 4 — Document the entanglement, add a targeted ratchet note, defer the demotion
- [ ] RE-VERIFY the consumer set (grep `polizeibericht_status`, `zeugenaussage_status`, `polizeibericht_url` under `src/`): the current readers are Twilio webhook (`api/webhooks/twilio/inbound/route.ts:366,384`), `lib/inbound/process-inbound-media.ts:113,128`, Pflicht-check `lib/dokumente/create-pflicht.ts:87`, Pflicht-sync `lib/dokumente/sync-lead-zu-pflicht.ts:39-44`, BKat `bkat/auto-trigger.ts` + `bkat/inference.ts:232`, dispatch form `DispatchLeadForm.tsx:248` + `DokumenteAnfordernCard.tsx:82`, flow page `flow/[token]/page.tsx:255`, `flow/[token]/actions.ts:982`, `create-for-fall.ts:116`, `convert-lead-to-claim.ts:337`, `stammdaten` allowlists. Confirm `zeugenaussage_*` has NO consumer beyond the flow display (`FlowFeststellungStep.tsx:226` + `page.tsx`).
- [ ] Confirm lead-stage writes precede `fall_dokumente` (flow `self-service-actions.ts:446-455,517-526` + Twilio have no `fall_id` → cannot key `fall_dokumente`). This is the reason presence can't be derived at lead-stage.
- [ ] **No code change.** Record in the PR body: "Cluster 4 deferred — `leads.{polizeibericht,zeugenaussage}_*` are lead-stage presence markers with no `fall_dokumente` fallback and load-bearing URL fields; a demotion needs a lead→`fall_dokumente` bridge that doesn't exist yet. Follow-up ticket recommended." (`zeugenaussage_*` is the smaller future win: fewer consumers, but still no lead-stage doc row.)

---

## Cluster 5 — `abrechnungen.reminder_gesendet_am` (code-then-DDL, the clean DROP)

Per Finding 5: sole reader = admin listing Info-row; sole writer = reminder cron; the tiered history lives in `abrechnung_reminders` (`versendet_am` per `reminder_typ`). Reader-first: migrate the listing to source recency from `abrechnung_reminders`, stop the cron writing the duplicate, deploy — THEN drop the column in a later task.

### Task 5a — Extract + test a recency helper (pure)
- [ ] RE-VERIFY: `abrechnung_reminders` has `abrechnung_id`, `reminder_typ`, `versendet_am` (from the cron insert `route.ts:123-128`). Confirm the admin page query `admin/abrechnungen/page.tsx:27` selects per-row and maps `reminder_gesendet_am` at `:51`.
- [ ] **Files:** new `src/lib/abrechnungen/reminder-recency.ts`.
- [ ] **Interface:** `export function letzterReminderAm(reminders: Array<{ versendet_am: string | null }>): string | null` → max `versendet_am` (ISO) or null.
- [ ] **Failing test** `src/app/admin/abrechnungen/__tests__/reminder-recency.test.ts` (REAL): empty → null; two rows → the later ISO; nulls skipped. Run `npm run test -- reminder-recency` → **fails**.
- [ ] Minimal impl. Run → **passes**. Commit + Audit block.

### Task 5b — Admin listing reads recency from `abrechnung_reminders` (reader migration)
- [ ] RE-VERIFY `admin/abrechnungen/page.tsx` query + the `.map` at `:51`. Change the select to embed the reminders (`abrechnung_reminders(versendet_am)`) OR do a second batched query keyed by `abrechnung_id`, then set the mapped `reminder_gesendet_am` field from `letzterReminderAm(...)` instead of the column. **Keep the client prop name `reminder_gesendet_am`** (or rename to `letzter_reminder_am` and update `AbrechnungenListClient.tsx:33,299` + the "Reminder gesendet" `Info` label — prefer keeping the shape to minimize blast radius). Do NOT drop the column from the select yet only if you keep reading it as fallback; better: stop selecting the column entirely so the migration in 5d can't break a live reader.
- [ ] Verify with a quick READ (`execute_sql`) that at least one abrechnung with reminders yields the expected max via the new query shape.
- [ ] Manual/`webapp-testing` smoke of the admin abrechnungen detail drawer is optional; the value is display-only. Commit + Audit block (`Regression: sole reader repointed; column no longer selected`).

### Task 5c — Cron stops writing the duplicate (writer migration)
- [ ] RE-VERIFY `api/cron/abrechnung-reminder/route.ts:121-131`: it inserts `abrechnung_reminders` (keep) AND updates `abrechnungen.reminder_gesendet_am` (remove). Delete the `.from('abrechnungen').update({ reminder_gesendet_am })` block (`:129-131`) and the now-stale header comment lines `:22-24`. Keep the `abrechnung_reminders` insert.
- [ ] Existing tests for this route: `src/app/api/cron/send-lead-reminders/route.test.ts` is a DIFFERENT route (already modified on this branch per git status) — this cron has no test; if adding one is cheap, assert the insert still happens and no `abrechnungen` update is issued (mock the supabase client). Otherwise rely on the reader test + manual reasoning. Commit + Audit block.
- [ ] **DEPLOY 5b+5c to staging and confirm** before 5d. This is the reader-first checkpoint: no code reads `abrechnungen.reminder_gesendet_am` anymore, and nothing writes it.

### Task 5d — DROP the column (DDL — strictly AFTER 5b+5c deployed)
- [ ] RE-VERIFY no residual reference: grep `reminder_gesendet_am` under `src/` → only `sv_termin_dokument_reminder_gesendet_am` (a DIFFERENT column on gutachter_termine — must NOT match; ensure your grep is exact-word) and `database.types.ts` (regenerate later). Confirm `admin/abrechnungen/page.tsx` no longer selects it.
- [ ] DDL: `ALTER TABLE public.abrechnungen DROP COLUMN reminder_gesendet_am;`
- [ ] `apply_migration({ name: 'fg5_drop_abrechnungen_reminder_gesendet_am', query: <DDL> })` → `list_migrations` → read `<V>` → commit `supabase/migrations/<V>_fg5_drop_abrechnungen_reminder_gesendet_am.sql`.
- [ ] `execute_sql` READ verify: column gone (`information_schema` empty for it on `abrechnungen`).
- [ ] Regenerate types for the touched table only if a consumer references it: `generate_typescript_types` → update `src/lib/supabase/database.types.ts` (or defer per AGENTS Regel-2 step 6, since no code references the dropped column). Commit + Audit block (`Build: tsc green after types regen; Dead-Code: column dropped, 0 readers`).

---

## Sequencing summary (enforced)

1. **Cluster 3** (DDL, self-contained, 0-row-affected) — safe anytime; coordinate with drift lane.
2. **Cluster 1** (code-only read consistency) — independent; ship per-file (boy-scout).
3. **Cluster 5** — 5a→5b→5c (deploy) → **checkpoint** → 5d (drop). NEVER 5d before 5b+5c are live.
4. **Cluster 2** — verification-only, fold into any PR.
5. **Cluster 4** — deferred; document in PR + open follow-up ticket.

Each cluster is an independent PR against `staging`. Do not batch Cluster 5d with 5b/5c in the same deploy.

---

## Self-Review

- [ ] **Reader-first honored:** the only DROP (Cluster 5d) is gated behind a deploy of 5b+5c; the only other DDL (Cluster 3) removes a value that matches 0 rows (verified count=0) and migrates no readers because none exist for `durchgefuehrt`.
- [ ] **No column referenced-then-dropped:** grep `reminder_gesendet_am` (exact word) returns 0 `src/` hits before 5d. `claims.abgeschlossen_am` is NOT dropped (timestamp readers remain).
- [ ] **Spec corrections captured:** Cluster 2 (`faelle.gutachten_vorhanden`) is a non-existent column → no-op; `abgeschlossen_am` is not droppable → read-side only; `v_claim_phase`'s `durchgefuehrt` is `claims.status='termin_durchgefuehrt'` (left intact).
- [ ] **Parity gates respected:** `subphase-resolver.ts` abschluss-gate left unchanged (v_claim_phase parity test); `lifecycle.ts` already derives abschluss from terminal status.
- [ ] **DDL discipline:** every migration via `apply_migration` → `list_migrations` → filename==`<V>` → `execute_sql` READ verify; `CREATE OR REPLACE` reproduces captured defs byte-for-byte minus the dead value; grants re-checked.
- [ ] **Tests:** each code change has a failing-first vitest (`npm run test`); the FallKarte storno case is a genuine bug-repro (today returns `erfassung`).
- [ ] **Ratchets:** touched TSX uses existing tokens (no new status/accent scales); no new handrolled components; knip unaffected (new helper files have consumers).
- [ ] **Boundaries:** Cluster 4 explicitly deferred to avoid trampling active AAR-956 flow-upload feature + lead-stage-no-`fall_dokumente` reality; Cluster 3 coordinated with the migration-drift/release lane.
- [ ] **Follow-up (out of FG5 scope, note in PR):** `abrechnungen.status` full demotion (entangled with Stripe reconcile — EXCLUDED per plan brief); the `check:flag-drift` ratchet from spec §8 (defensive-`OR` reads, new presence-bools) is a cross-FG deliverable, not FG5.
