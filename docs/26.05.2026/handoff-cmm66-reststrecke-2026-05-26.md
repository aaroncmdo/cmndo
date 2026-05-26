# CMM-66 / Claims-as-SSoT — Reststrecke-Handoff (2026-05-26, abends)

**Für die nächste Session.** Einstiegspunkt nach Abschluss von **CMM-66 (View-Recency) + SV-Realtime-Fix**. Teil der CMM-44-Vollmigration (Claim-as-SSoT, `faelle` → Phase-6-DROP).

**Kanonischer Live-Status (immer zuerst lesen):** Memory `project_cmm65_timestamp_sweep.md`.
**Vorgänger-Handoff:** `docs/26.05.2026/handoff-cmm65-reststrecke-2026-05-26.md` (PR #1747).

---

## 0 · TL;DR — was JETZT fertig ist

**`claim_recency` ist die neue Recency-SSoT** und bedient **zwei** Bedarfe mit **einem** leak-freien Mechanismus:
1. **CMM-66-View-Recency** (`v_claim_full.fall_updated_at`, `v_faelle_mit_aktuellem_termin.updated_at`).
2. **Realtime-Live-Refresh** der Fall-Seiten — inkl. **SV** (der `claims` nicht lesen darf, CMM-60 Phase 4).

| Slice | PR | Stand |
|---|---|---|
| §0 Kunde-Realtime-Smoke (Verify aus #1741) | **#1754** | grün, gemerged |
| **PR1** — `claim_recency`-Tabelle + RLS + RPC + Publication + Backfill + `touchClaimRecency`-Dual-Write + Types | **#1758** | **merged → staging**, Migration appliziert |
| **PR2** — additiver `claim_recency`-Realtime-Leg + `transitionFallStatus`-Bump | **#1760** | **merged + deployed + re-smoked grün** (SV ✅, Kunde ✅) |
| **PR2b** — View-Repoint (`v_claim_full`/`v_faelle_mit_aktuellem_termin` → `claim_recency`/`claims.created_at`) | **#1765** | **appliziert + DB-verifiziert, ready** (sync-watcher merged) |

**CMM-66 = DONE.** Offen ist nur noch die DDL-Finanz-Strecke (Part B), CMM-61 und dann Phase 6.

---

## 1 · Das mentale Modell: `claim_recency` (UNBEDINGT verstehen)

```
claim_recency(claim_id uuid PK -> claims, last_activity_at timestamptz NOT NULL)
```
- **Leak-frei** (keine sensiblen Spalten) → RLS-SELECT für Kunde/SV/Admin/Dispatch (`claim_recency_select`-Policy via is_admin/is_sv_for_claim/is_claim_user_party/geschaedigter/dispatcher). Realtime-tauglich für ALLE Rollen, ohne das CMM-60-Spalten-Leck zu öffnen.
- **Backfill-resistent:** KEIN moddatetime-Trigger. Geschrieben NUR von `touch_claim_recency(uuid)` (SECURITY DEFINER UPSERT) — aufgerufen von `lib/claims/touch-recency.ts` (`touchClaimRecency`, 11 Sites, **Dual-Write** zu `claims.updated_at`) + `transitionFallStatus` (jeder Statuswechsel). SP-Backfills clobbern es NICHT.
- **In `supabase_realtime`-Publication** (REPLICA IDENTITY DEFAULT, PK-Filter `claim_id=eq.X`).

**Realtime-Architektur (WICHTIG — additiv, nicht Replace):**
- `FallRealtimeRefresh` + `SvFallakteView` haben jetzt **zwei** Recency-Legs nebeneinander:
  - **`claims`-Leg** (unverändert) — für **Kunde/Admin**, die `claims` lesen dürfen; fängt via moddatetime JEDE `claims`-Änderung (status, sv_id, …).
  - **`claim_recency`-Leg** (NEU) — für den **SV** (dessen `claims`-Leg RLS-tot ist); feuert auf `touch_claim_recency`/`transition`-Bumps.
- **Warum additiv statt Replace:** ein Replace hätte Kunde/Admin den Live-Refresh auf `claims`-Writes *außerhalb* von `touch_claim_recency` gekostet (z. B. `setSvIdForFall`). Deshalb: `claims`-Leg BLEIBT, `claims.updated_at`-Dual-Write bleibt **permanent** (kein „PR3-Removal").

**Views (PR2b, appliziert):** `fall_updated_at`/`updated_at` = `COALESCE((SELECT cr.last_activity_at FROM claim_recency cr WHERE cr.claim_id=c.id), c.created_at)`; `v_faelle…created_at` = `c.created_at`. Spalten-Namen/-Typen unverändert → `database.types.ts` unberührt.

---

## 2 · Reststrecke — was als NÄCHSTES ansteht

### Part B — claims-Finanz-ADDs (DDL, additiv)
- `claims` ADD `marketing_provision` + `marketing_quelle` (+ Backfill aus leads/faelle) + `zahlungsweg` (all-null).
- Top-Level-Finanz-Reads von `faelle` auf `claims` umstellen.
- Quelle/Detail: Memory `project_cmm65_timestamp_sweep.md` + Vorgänger-Handoff #1747 §3.

### CMM-61 — kanzlei_faelle
- `provision`/`honorar` + Vollmacht-Übergabe auf `kanzlei_faelle`.

### Phase 6 — `DROP TABLE faelle CASCADE` (CMM-49 / SP-L)
- **Erst nach** Part B + CMM-66 (= jetzt erfüllt) + CMM-61.
- **Post-Drop-Smoke aller Portale Pflicht** (Public + Admin + Kunde + SV) mit Screenshots — siehe Memory `feedback_post_drop_smoke`.
- Vor dem Drop: alle verbliebenen `faelle`-Reader/Writer sweepen (Master-Strategie: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`).

---

## 3 · Querverweise

**PRs:** #1754 (§0-Smoke) · #1758 (PR1, merged) · #1760 (PR2, merged) · #1765 (PR2b, ready) · #1747 (Vorgänger-Handoff) · #1741 (Writer-Sweep + Realtime, merged).

**Migrationen (appliziert):**
- `supabase/migrations/20260526095957_cmm66_claim_recency_table.sql` (PR1 — Tabelle/RLS/RPC/Publication/Backfill).
- `supabase/migrations/20260526110131_cmm66_view_repoint_claim_recency.sql` (PR2b — View-Repoint, server-seitig pg_get_viewdef+replace).

**Code (Schlüsselstellen):**
- `src/lib/claims/touch-recency.ts` — `touchClaimRecency`/`touchClaimRecencyByFall` (Dual-Write claims.updated_at + `touch_claim_recency`-RPC).
- `src/components/fall/FallRealtimeRefresh.tsx` — claims-Leg + NEU claim_recency-Leg (Kunde/SV/Admin).
- `src/app/gutachter/feldmodus/SvFallakteView.tsx` — analog (Feldmodus).
- `src/lib/faelle/state-machine.ts` (`transitionFallStatus`, ~Z.168) — `touch_claim_recency`-Bump nach dem claims-Write.

**Docs/Specs:**
- Design: `docs/26.05.2026/cmm66-claim-recency-design.md` (im PR1-Branch `kitta/cmm66-claim-recency`).
- §0-Smoke-Audit: `docs/26.05.2026/cmm65-realtime-smoke/smoke-cmm65-kunde-realtime-2026-05-26.md` (#1754).
- Master-Strategie CMM-44: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`.

**Smoke-Specs** (opt-in via `RUN_CMM65_SMOKE=1`, gegen deployte staging):
- Committed (#1754): `tests/e2e/kunde-auth-setup.spec.ts` + `tests/e2e/flows/smoke-cmm65-kunde-realtime.spec.ts`.
- **NOCH UNCOMMITTED** (lokal im Worktree `.claude/worktrees/cmm65-realtime-smoke`): `tests/e2e/sv-cmm66-auth-setup.spec.ts` + `tests/e2e/flows/smoke-cmm66-sv-realtime.spec.ts` — **für Phase-6-Post-Drop-Smoke wiederverwerten** (sonst gehen sie beim Worktree-Cleanup verloren → ggf. committen).

**Memory:** `project_cmm65_timestamp_sweep.md` (kanonisch) · `feedback_post_drop_smoke` · `feedback_supabase_connections` · `feedback_migration_repair_twin_drift` · `feedback_information_schema_check` · `project_cmm60_claims_sv_id` · `project_cmm44_*`.

---

## 4 · Lessons / Gotchas (diese Session)

1. **SV darf `claims` nicht lesen** (CMM-60 Phase 4, Migration `20260516193332` — entzog `is_sv_for_claim` aus der claims-SELECT-Policy, weil die ganze Zeile inkl. `kanzlei_*`/`regulierungs_betrag`/`kunde_email` exponiert war). Ein RLS-Re-Add hätte das Leck über den REPLICA-FULL-Realtime-Payload wieder geöffnet. → leak-freie `claim_recency`-Surface statt RLS-Re-Add.
2. **`db push` ging diese Session NICHT** (Port 5432 vom Hotspot-Netz geblockt; danach gecachtes `supabase/.temp/pooler-url`-Passwort stale → `28P01`). → DDL via **Supabase-Plugin `apply_migration`** appliziert (Aaron-Anweisung „you have the supabase plugin" = Regel-2-Override). **WICHTIG:** apply_migration vergibt eine **eigene** Version → lokale Migrations-Datei MUSS darauf umbenannt werden (sonst `db push`-Re-Run/Drift). Hier: 20260526095957 + 20260526110131.
3. **Pool-Saturation** (viele Parallel-Sessions + staging-Deploys): `execute_sql`/`apply_migration` timeouten zeitweise schon beim Connect („Failed to initialise history table") — **transient, kein Partial-Apply** (Fehler vor Ausführung) → einfach retrien bis Pool frei.
4. **View-Repoint an Riesen-Views (90/200 Spalten) ohne Risiko:** korrelierte **Scalar-Subquery** als Spalten-Expression (kein JOIN-Surgery am FROM); server-seitig `pg_get_viewdef` + gezieltes `replace()` (Substring-Position vorher verifizieren) + `RAISE`-no-op-Guard + **`security_invoker`-Preserve** (`pg_options_to_table` → `ALTER VIEW SET`, weil `CREATE OR REPLACE VIEW` Optionen sonst auf Default zurücksetzt); `COALESCE(…, c.created_at)` gegen NULL-Regression.
5. **Stacked-Squash:** nach `sync-watcher`-Squash-Merge eines Vorgänger-PRs + Branch-Löschung doppelt ein Re-Push desselben Branches alle Commits im Diff → Fix: `git reset --hard origin/staging` + `git cherry-pick <eigener-commit>` + `push --force-with-lease`.
6. **Kunde-Smoke braucht Fixture:** test-kunde@claimondo.de (Claim CLM-2026-00115, fall `65a7640b…`, claim `5b2757e1…`) hat `geschaedigter_user_id`=kunde, aber die Kunde-Fall-Seite (CMM-63) gated auf `claim_parties`/`faelle.kunde_id` + `onboarding_complete`. Für den Smoke temporär `faelle.kunde_id=kunde` + `claims.onboarding_complete=true` setzen, **danach zurücksetzen** (`80ff9fe2-6dbb-47a2-957a-59f8c1c6db02`/`false`). test-sv@claimondo.de (5 Claims, z. B. CLM-2026-00196 fall `edd77242…` claim `48f3dced…`) braucht keine Fixture.
7. **staging 504/`goto`-Timeout unter Parallel-Last:** Browser-Smoke direkt die **claim_id-URL** ansteuern (`/kunde/faelle/<claim_id>`), umgeht den `fall_id→claim_id`-Redirect-Pfad.

---

## 5 · Verify-Rezept + Env

- **Live-State empirisch prüfen** (Snapshots veralten, Parallel-Sessions): `to_regclass`/`pg_get_viewdef`/`pg_get_triggerdef`/`information_schema.columns` via Supabase-MCP `execute_sql`. Bei Pool-Timeout retrien.
- **DDL:** Regel 2 = supabase-CLI (`db push`). Wenn 5432 blockiert/Passwort stale → Plugin `apply_migration` (Aaron-OK) + Datei auf die `list_migrations`-Version umbenennen.
- **Browser-Smoke:** Worktree `.claude/worktrees/cmm65-realtime-smoke`; Runner-Pattern lädt `.env.local` + setzt `CI=1` (skip local webServer) + `RUN_CMM65_SMOKE=1` + `KUNDE_STORAGE`/`SV_STORAGE`; `npx playwright test <filter> --project=chromium`. staging-App = `app.staging.claimondo.de` (nginx-Basic-Auth `STAGING_BASIC_AUTH_USER/PASS` in `.env.local`).
- **Trigger im Smoke:** Kunde-Leg = service-role `PATCH /rest/v1/claims`; SV/claim_recency-Leg = service-role `POST /rest/v1/rpc/touch_claim_recency {p_claim_id}`.
- **Projekt-ID Supabase:** `paizkjajbuxxksdoycev`. Worktree pro Slice off `origin/staging`: `node scripts/new-session-worktree.mjs <slug> staging`.
- **Merge:** NICHT die Merge-Session — PR `--base staging`; `sync-watcher` merged non-draft staging-PRs bei grünem build.
