# Handoff — Claim-SSoT-Migration, Stand 2026-05-16 (abends)

**Vorige Session:** CMM-48 Writer-Migration abgeschlossen (soweit ohne INSERT-/Phase-6-Frage möglich) + komplette Phase-0-Vorarbeiten. CMM-60 Schritt 1 vorbereitet.

**Master:** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`

---

## 1 · Was diese Session erledigt hat

### CMM-48 — Phase-3-Writer-Migration (9 PRs in `staging`)

| PR | Inhalt |
|---|---|
| #1377 PR-C | Status-Timestamp-Writer (`state-machine`, `lexdrive/process-event`) → `claims`. Shared-Helper `src/lib/faelle/claim-duplicate-columns.ts`. |
| #1378 | Datenverlust-Bugfix — `convertLeadToClaim.claimsInsert` setzte 10 Duplikat-Spalten nie → `claims` ab Konversion `null`. |
| #1380 PR-E | `brn` + `polizei_aktenzeichen` → `claims` (#9 + #1 der PR-E-Stellen). |
| #1381 PR-D | `updateFallField` + `saveKanzleiAnsprechpartner` → `claims` (Admin-Client, + neuer Rollen-Guard). |
| #1382 | `seed-testdata` entkaputtet — faelle-INSERT schrieb 4 von #1322 gedroppte Spalten. |

**PR-A** war vorab gelöst (#1320).

### Phase-0-Vorarbeiten (4 PRs in `staging`)

| PR | Ticket | Inhalt |
|---|---|---|
| #1385 | CMM-58 | `gutachter_termine.claim_id` — FK + Backfill + Sync-Trigger |
| #1386 | CMM-59 | 2 latente Bugs: `auftraege` status `geplant`→`termin` (CHECK-Verstoß); `termine/actions.ts` `sv_notizen`→`notizen_vor_ort` |
| #1387 | CMM-56 | `apply_gutachten_ocr` Fresh-Insert-robust (COALESCE auf `manuell`-Flag) |
| #1388 | CMM-57 | `restwert`/`wiederbeschaffungswert` Inline-Edit → `gutachten` geroutet |

Alle: Build/tsc grün, Behavior-Smokes grün, DB-Migrationen appliziert, Linear auf Done.

### Drei vom Audit übersehene Bugs gefunden + gefixt
- claimsInsert-Datenverlust (#1378), seed-testdata kaputt (#1382), `restwert`/`wbw` stiller Edit-Fehlschlag (CMM-57). Alle entstanden durch dynamische/getrennt-gebaute Writes, die statische Greps nicht erfassen.

---

## 2 · CMM-60 — `claims.sv_id` (VORBEREITET, nicht appliziert)

**Entscheidung (Aaron):** Die SV-Zuweisung ist eine Claim-Eigenschaft → `sv_id` wird native `claims`-Spalte. `auftraege.sv_id` / `gutachter_termine.sv_id` bleiben per-Lifecycle-Detail; `claims.sv_id` ist die primäre/kanonische Zuweisung.

**Schritt 1 vorbereitet** — Branch `kitta/cmm-60-claims-sv-id`, Migration `supabase/migrations/20260516174112_cmm60_claims_sv_id.sql`:
- `ADD COLUMN claims.sv_id` (nullable, FK → `sachverstaendige`, ON DELETE SET NULL)
- Index `idx_claims_sv_id`
- Backfill aus `faelle.sv_id` (21 von 30 faelle haben sv_id)
- Übergangs-Trigger `sync_faelle_sv_id_to_claims` (faelle.sv_id → claims.sv_id)

**⚠️ Migration ist NOCH NICHT appliziert.** Nächste Session:
1. **Schritt 1 anwenden:** `db query --file` + `migration repair --status applied 20260516174112` (Targeted-Apply wegen Drift, siehe §4). Danach `database.types.ts` regenerieren + Smoke (faelle.sv_id-Update → claims.sv_id gespiegelt).
2. **Schritt 2 — RLS-Umstellung:** `is_sv_for_claim` + abhängige Policies von `faelle.sv_id` auf `claims.sv_id` umstellen. **Heikel** — Memory `feedback_rls_function_grants`: SECURITY-DEFINER-Grants gehen bei `CREATE OR REPLACE` verloren (Inzident AAR-894: SV-Plan leer). Jede Policy einzeln + `GRANT EXECUTE` idempotent. **Mit Aaron durchgehen.**
3. **Schritt 3 — Writer-Migration:** `sv_id`-Writer (heute faelle, vom CMM-48-Audit als WORKFLOW klassifiziert) auf `claims` umstellen + Reverse-Sync-Trigger (claims→faelle) ergänzen.

---

## 3 · Was noch offen ist

### Phase-6-Vorbereitungs-Bucket (claim-lose faelle-INSERT-Klasse)
Diese drei sind dieselbe Klasse — faelle-INSERTs, bei denen der `AFTER UPDATE`-Sync-Trigger nicht greift bzw. kein Claim existiert. Können nicht als Writer-Split migriert werden:
- **PR-B** — `buildFallInsertFromLead` (Komplett-Rewrite, ~100 Spalten)
- **PR-E #10** — `admin/faelle/anlegen` (faelle-INSERT)
- **PR-F-Rest** — `create-test-fall` + `seed-testdata` claim-fähig machen

### Separate Baustellen
- **PR-E #8** `OcrAutoFillModal` — Client-Component mit Browser-DB-Write; braucht claims-RLS-Klärung oder Server-Action-Umbau.
- **UI-Bugs AAR-934** (GutachterShell-Nav) + **AAR-935** (Admin-Hub-Drift) — Frontend, nicht migrations-blockierend.

### Danach: Phase 2 proper
`gutachter_termine`-Reader/Writer auf `claim_id` umstellen + View `v_faelle_mit_aktuellem_termin` claim-keyen (CMM-58 hat die Grundlage gelegt). Dann Phase 4 (Reader-Migration), Phase 5 (Sync-Trigger droppen), Phase 6 (`faelle` DROP).

---

## 4 · Watch-outs

- **DB-Drift:** Eine Fremd-Migration `20260515020338_aar_fix_isochrone_polygon_format.sql` hängt lokal-only. Solange sie nicht repariert ist, braucht jeder Migrations-Push den **Targeted-Apply** statt `db push`:
  ```
  npx supabase db query --linked --agent yes --file <migration.sql>
  npx supabase migration repair --status applied <version>
  ```
  Ein blankes `db push` würde `--include-all` verlangen und die isochrone-Migration mitfahren — unklar ob deren SQL noch idempotent ist. Wer Zeit hat: Drift sauber `migration repair`en.
- **Worktree-Supabase-Link:** Frische Worktrees sind nicht ge-`link`t. Vor `db query --linked`: `supabase/.temp/` aus dem Haupt-Repo in den Worktree kopieren (`cp -r .../claimondo-v2/supabase/.temp/. <worktree>/supabase/.temp/`).
- **Umlaut-Hook auf staging:** Der Pre-Commit-Hook `.claude/hooks/check-umlauts.mjs` ist auf `staging` noch aktiv und blockt ASCII-Ersatz (`fuer`, `zurueck`, …) in Commit-Messages — echte Umlaute nutzen. (Worktree-`AGENTS.md` sagt, der Hook sei deaktiviert — Drift; die staging-Version ist die alte aktive.)
- **`migration repair` nach Targeted-Apply** nicht vergessen, sonst zeigt `migration list` die Migration ewig als pending.
- **Worktree-Builds:** `NODE_OPTIONS=--max-old-space-size=8192` gegen OOM.
- **Andere Sessions** auf `kitta/aar-leads-audit-session` aktiv — eigener Worktree + eigener Branch (war diese Session durchgehend so).

## 5 · Git-/Linear-Stand

- `origin/staging` HEAD = `6c26a011` (CMM-57 #1388).
- Branch `kitta/cmm-60-claims-sv-id` enthält die vorbereitete Migration + dieses Handoff — **gepusht, kein PR** (Schritt 1 wartet auf Apply).
- Linear: CMM-56/57/58/59 = Done. CMM-60 = Backlog (Spec im Ticket). Master CMM-44.
- `staging→main` macht Aaron / die Release-Session.

## 6 · Empfohlene Reihenfolge nächste Session

1. CMM-60 Schritt 1 anwenden (Migration + Backfill-Verify + Types + Smoke) — bounded, sicher.
2. CMM-60 Schritt 2 (RLS) **mit Aaron** — heikelster Punkt.
3. CMM-60 Schritt 3 (Writer + Reverse-Sync).
4. Phase 2 proper: `gutachter_termine` Reader/Writer + View.
5. Phase-6-Bucket (PR-B / #10 / PR-F-Rest) — sobald die Reader-Migration durch ist.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
