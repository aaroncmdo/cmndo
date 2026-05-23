# CMM-44 SP-I1 — Anschlussschreiben/Mandat/LexDrive/Klage → `kanzlei_faelle` · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). **Frische Session ausführbar** — self-contained; lies zuerst die Spec.

**Goal:** Die 15 Kanzleifall-LC-Spalten der I1-Subdomäne (AS/Mandat/LexDrive/Klage) von `faelle` auf `kanzlei_faelle` (1:1 pro Claim) migrieren — additiv (faelle behält sie bis Phase 6) — und den **wiederverwendbaren `kanzlei_faelle`-Upsert-Helper** etablieren, den SP-I2/I3/I4 nutzen.

**Architecture:** SP-G-Muster (1:1-Sub-Tabelle via `UNIQUE(claim_id)`, create-or-update). PR1 = ADD 15 Spalten + Backfill-Upsert + View-Repoint + Helper. PR2 = Reader/Writer-Sweep (überwiegend INTERN — lexdrive/admin/kanzlei/state-machine; Kunde-Portal schirmt die Kanzlei-Phase ab). PR3 = Catch-up. Muster-Referenzen: SP-G (`docs/22.05.2026/handoff-cmm44-spg2-status`-Linie + `docs/superpowers/plans/2026-05-20-cmm44-spg-gutachten-rest.md`), SP-J (`docs/superpowers/plans/2026-05-22-cmm44-spj-payment-split.md` + Handoff/Abschluss — Helper-Muster, Re-Grep-3-Quellen, Round-Trip-Probe).

**Tech Stack:** Next.js 16, TS, supabase-js, Supabase CLI, Postgres, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-22-cmm44-spi-kanzleifall-decomposition-design.md` (LIES ZUERST — Decomposition + UI-Abstraktion + kanzlei_faelle-Fakten).

---

## Vorbedingungen (frische Session)
- Worktree off `origin/staging` (`using-git-worktrees`). `.env.local` + `supabase/.temp/` reinkopieren (gitignored). Eigenes `npm install` (KEINE junction — SP-H/J-Lesson). Branch pro PR off `origin/staging`, PRs `--base staging`.
- Harte Regeln (AGENTS.md): nie auf main; DDL nur via `db query --linked` + `migration repair` (kein `db push`); kein unbegleiteter Stash.
- Apply-Muster: `BEGIN/COMMIT`, Dry-Run `sed 's/^COMMIT;/ROLLBACK;/'`, apply, `migration repair --status applied <ts>`.
- read-only DB-Checks via Supabase-MCP `execute_sql` (Pooler-544 bei Parallel-Sessions — SP-J-Lesson).
- Coordination: `COORDINATION-active-spi.md` im Memory-Dir. Vor PR2 Drift-Recheck.

## Die 15 I1-Spalten (alle MOVE)
`anschlussschreiben_am`, `anschlussschreiben_url`, `anschlussschreiben_sendedatum`, `anschlussschreiben_unterschrift`, `anschlussschreiben_ocr_am`, `mandatsnummer`, `lexdrive_case_id`, `lexdrive_ocr_data`, `lexdrive_ocr_received_at`, `klage_uebergeben_am`, `as_geforderte_summe`, `as_frist`, `as_vs_reaktion_text`, `as_salesforce_id`, `as_zuletzt_synced_am`.

---

## Task 0: Drift + kanzlei_faelle-Fakten + Live-Typen (MESSEN, kein Commit)

- [ ] **Step 1:** Via MCP `execute_sql` (project `paizkjajbuxxksdoycev`) messen:
```sql
SELECT
 -- exakte faelle-Typen/Precision/Defaults der 15 (für ADD)
 (SELECT string_agg(column_name||' '||udt_name||COALESCE('('||character_maximum_length||')','')||' nullable='||is_nullable||' def='||COALESCE(column_default,'-'), E'\n' ORDER BY column_name)
  FROM information_schema.columns WHERE table_schema='public' AND table_name='faelle'
  AND column_name IN ('anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum','anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','mandatsnummer','lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am','as_geforderte_summe','as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am')) AS faelle_types,
 -- kanzlei_faelle: fall_id NOT NULL? status-Kollision?
 (SELECT string_agg(column_name||':'||is_nullable, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='kanzlei_faelle') AS kf_cols,
 -- existieren die 15 schon auf kanzlei_faelle? (erwartet 0)
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='kanzlei_faelle' AND column_name IN ('anschlussschreiben_am','mandatsnummer','lexdrive_case_id','klage_uebergeben_am','as_salesforce_id')) AS i1_already_on_kf,
 (SELECT count(*) FROM public.kanzlei_faelle) AS kf_rows;
```
Notiere: exakte Typen (für ADD), ob `fall_id` NOT NULL (→ Upsert muss fall_id mitziehen), kf_rows (erwartet 0). **`status` existiert auf beiden — NICHT anfassen** (kanzlei_faelle.status ist eigener Workflow-Status, ≠ faelle.status; KEINE I1-Spalte).
- [ ] **Step 2:** View-Audit — welche Views exponieren eine der 15:
```sql
SELECT c.table_name AS view, string_agg(c.column_name, ', ') AS cols
FROM information_schema.columns c JOIN information_schema.views v ON v.table_schema=c.table_schema AND v.table_name=c.table_name
WHERE c.table_schema='public' AND c.column_name IN ('anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum','anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','mandatsnummer','lexdrive_case_id','lexdrive_ocr_data','lexdrive_ocr_received_at','klage_uebergeben_am','as_geforderte_summe','as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am')
GROUP BY c.table_name ORDER BY c.table_name;
```
Pro Treffer-View `pg_get_viewdef('public.<v>', true)`. Repoint-Strategie: I1-Spalte → aus `kanzlei_faelle` via LATERAL/JOIN auf `kf.claim_id=c.id` (1:1) ODER `NULL::<typ>`-Platzhalter falls 0-cov + Klärungsaufwand (SP-J-Bucket-A-Präzedenz). Dokumentieren in `docs/<DD.MM.YYYY>/cmm44-spi1-views-audit.md`.

---

## Task 1: PR1 — ADD + Backfill-Upsert + View-Repoint + Helper

**Branch:** `kitta/cmm-44-spi1-add` off origin/staging. **Files:** Create `supabase/migrations/<ts>_cmm44_spi1_add_kanzlei_faelle.sql`, `src/lib/faelle/kanzlei-fall.ts`, `scripts/cmm44-spi1-verify.sql`, `docs/<DD.MM.YYYY>/cmm44-spi1-views-audit.md`.

- [ ] **Step 1: Migration** `npx supabase migration new cmm44_spi1_add_kanzlei_faelle`. Inhalt (Typen aus Task 0 ABGLEICHEN):
```sql
BEGIN;
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN anschlussschreiben_am timestamptz,
  ADD COLUMN anschlussschreiben_url text,
  ADD COLUMN anschlussschreiben_sendedatum date,
  ADD COLUMN anschlussschreiben_unterschrift boolean,
  ADD COLUMN anschlussschreiben_ocr_am timestamptz,
  ADD COLUMN mandatsnummer text,
  ADD COLUMN lexdrive_case_id text,
  ADD COLUMN lexdrive_ocr_data jsonb,
  ADD COLUMN lexdrive_ocr_received_at timestamptz,
  ADD COLUMN klage_uebergeben_am timestamptz,
  ADD COLUMN as_geforderte_summe numeric,
  ADD COLUMN as_frist date,
  ADD COLUMN as_vs_reaktion_text text,
  ADD COLUMN as_salesforce_id text,
  ADD COLUMN as_zuletzt_synced_am timestamptz;

-- Backfill: pro Claim mit I1-Daten eine kanzlei_faelle-Row upserten (1:1).
-- fall_id mitziehen (Task 0: ist NOT NULL). status/erstellt_am via Default.
INSERT INTO public.kanzlei_faelle (claim_id, fall_id, anschlussschreiben_am, anschlussschreiben_url, anschlussschreiben_sendedatum, anschlussschreiben_unterschrift, anschlussschreiben_ocr_am, mandatsnummer, lexdrive_case_id, lexdrive_ocr_data, lexdrive_ocr_received_at, klage_uebergeben_am, as_geforderte_summe, as_frist, as_vs_reaktion_text, as_salesforce_id, as_zuletzt_synced_am)
SELECT f.claim_id, f.id, f.anschlussschreiben_am, f.anschlussschreiben_url, f.anschlussschreiben_sendedatum, f.anschlussschreiben_unterschrift, f.anschlussschreiben_ocr_am, f.mandatsnummer, f.lexdrive_case_id, f.lexdrive_ocr_data, f.lexdrive_ocr_received_at, f.klage_uebergeben_am, f.as_geforderte_summe, f.as_frist, f.as_vs_reaktion_text, f.as_salesforce_id, f.as_zuletzt_synced_am
FROM public.faelle f
WHERE f.claim_id IS NOT NULL
ON CONFLICT (claim_id) DO UPDATE SET
  anschlussschreiben_am = COALESCE(kanzlei_faelle.anschlussschreiben_am, EXCLUDED.anschlussschreiben_am),
  anschlussschreiben_url = COALESCE(kanzlei_faelle.anschlussschreiben_url, EXCLUDED.anschlussschreiben_url),
  anschlussschreiben_sendedatum = COALESCE(kanzlei_faelle.anschlussschreiben_sendedatum, EXCLUDED.anschlussschreiben_sendedatum),
  anschlussschreiben_unterschrift = COALESCE(kanzlei_faelle.anschlussschreiben_unterschrift, EXCLUDED.anschlussschreiben_unterschrift),
  anschlussschreiben_ocr_am = COALESCE(kanzlei_faelle.anschlussschreiben_ocr_am, EXCLUDED.anschlussschreiben_ocr_am),
  mandatsnummer = COALESCE(kanzlei_faelle.mandatsnummer, EXCLUDED.mandatsnummer),
  lexdrive_case_id = COALESCE(kanzlei_faelle.lexdrive_case_id, EXCLUDED.lexdrive_case_id),
  lexdrive_ocr_data = COALESCE(kanzlei_faelle.lexdrive_ocr_data, EXCLUDED.lexdrive_ocr_data),
  lexdrive_ocr_received_at = COALESCE(kanzlei_faelle.lexdrive_ocr_received_at, EXCLUDED.lexdrive_ocr_received_at),
  klage_uebergeben_am = COALESCE(kanzlei_faelle.klage_uebergeben_am, EXCLUDED.klage_uebergeben_am),
  as_geforderte_summe = COALESCE(kanzlei_faelle.as_geforderte_summe, EXCLUDED.as_geforderte_summe),
  as_frist = COALESCE(kanzlei_faelle.as_frist, EXCLUDED.as_frist),
  as_vs_reaktion_text = COALESCE(kanzlei_faelle.as_vs_reaktion_text, EXCLUDED.as_vs_reaktion_text),
  as_salesforce_id = COALESCE(kanzlei_faelle.as_salesforce_id, EXCLUDED.as_salesforce_id),
  as_zuletzt_synced_am = COALESCE(kanzlei_faelle.as_zuletzt_synced_am, EXCLUDED.as_zuletzt_synced_am);

-- Block 3: CREATE OR REPLACE VIEW je Treffer-View (Task 0 Step 2). I1-Spalte aus
-- kanzlei_faelle (LATERAL/JOIN kf.claim_id=c.id) bzw. NULL::typ-Platzhalter.
-- Precision-Casts Pflicht (42P16-Guard). Occurrence-Count-Assertion (==1) je ersetzter Stelle.
COMMIT;
```
- [ ] **Step 2: Trigger-Audit** auf kanzlei_faelle (`pg_trigger`/`prosrc`) — Notification/Validierungs-Trigger auf den neuen Spalten? Falls ja DISABLE/ENABLE-Wrapper um Backfill (SP-G-Lesson).
- [ ] **Step 3: Helper** `src/lib/faelle/kanzlei-fall.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
type DbClient = SupabaseClient<Database>

// CMM-44 SP-I: kanzlei_faelle ist 1:1 pro Claim (UNIQUE claim_id), pre-launch 0 Rows.
// Writer der Kanzlei-LC-Spalten upserten die Row by claim_id. fall_id ist NOT NULL
// (Task 0) -> beim INSERT mitgeben.
export async function upsertKanzleiFall(
  db: DbClient, claimId: string, fallId: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (Object.keys(fields).length === 0) return { ok: true }
  const { data: existing, error: selErr } = await db.from('kanzlei_faelle').select('id').eq('claim_id', claimId).maybeSingle()
  if (selErr) return { ok: false, error: selErr.message }
  if (existing?.id) {
    const { error } = await db.from('kanzlei_faelle').update(fields).eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await db.from('kanzlei_faelle').insert({ claim_id: claimId, fall_id: fallId, ...fields })
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function getKanzleiFall<T extends string>(
  db: DbClient, claimId: string, cols: T,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from('kanzlei_faelle').select(cols).eq('claim_id', claimId).maybeSingle()
  if (error) { console.error('[CMM-44 SP-I] getKanzleiFall:', error.message); return null }
  return (data as Record<string, unknown> | null) ?? null
}
```
- [ ] **Step 4: verify-SQL** `scripts/cmm44-spi1-verify.sql`: `SELECT count(*) FROM information_schema.columns WHERE table_name='kanzlei_faelle' AND column_name IN (<15>)` → erwartet 15.
- [ ] **Step 5: Dry-Run** `MIG=$(ls supabase/migrations/*cmm44_spi1_add*.sql|tail -1); sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/dry.sql; npx supabase db query --linked --file /tmp/dry.sql` → kein Fehler.
- [ ] **Step 6: Commit** (scripts + migration + helper + views-audit-doc).

## Task 2: PR1 — Apply + Verify + Types + Build + Push + PR
- [ ] **Step 1: Drift-Recheck** (Task 0 Step 1 erneut, `i1_already_on_kf=0`).
- [ ] **Step 2: Apply + repair** — `npx supabase db query --linked --file "$MIG"`; `npx supabase migration repair --status applied <ts>`.
- [ ] **Step 3: Verify** — verify-SQL = 15; Backfill-Count = `claims mit faelle-I1-Daten`; 0 View-Residual `f.<i1col>`.
- [ ] **Step 4: Types** — `powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }"`; grep 3 I1-Spalten im kanzlei_faelle-Type.
- [ ] **Step 5: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün (voller Build, NICHT nur tsc — SP-J never-Narrowing-Lesson). EBUSY im standalone-copy = Worktree-Artefakt (rm -rf .next + retry).
- [ ] **Step 6: Commit + Push** (+7-Punkte-Audit) `git push -u origin kitta/cmm-44-spi1-add`. **KEIN PR bis Review.**
- [ ] **Step 7: PR nach 2-Stufen-Review** — `gh pr create --base staging`.

> **GATE:** Task 3 erst nach PR1-staging-Merge (regen. Types).

## Task 3: PR2 — Call-Site-Inventur (intern-fokussiert)
**Branch:** `kitta/cmm-44-spi1-sweep` off origin/staging (nach PR1-Merge).
- [ ] **Step 1: Grep-Skript** `scripts/cmm44-spi1-grep.mjs` aus `scripts/cmm44-spj-grep.mjs` ableiten (Kommentar- + Helper-Strip übernehmen), `COLS` = die 15. stripSubEmbeds zusätzlich `kanzlei_faelle(...)`.
- [ ] **Step 2: 3-Quellen-Inventur** (SP-J-Lesson): (a) `node scripts/cmm44-spi1-grep.mjs` (from('faelle')-Window), (b) Assignment-Grep `\b(<15>)\s*[:=]` (Object-Build-Writes — z.B. lexdrive `updates.mandatsnummer`), (c) Property-Read-Grep `\.(<distinktive cols>)\b` (View-/Prop-gespeiste Reader — autoPhase/section-visibility-Klasse). Pro Site Portal klassifizieren — **kunde-facing explizit markieren** (Spec §4: meist intern). `docs/<DD.MM.YYYY>/cmm44-spi1-inventory.md`.
- [ ] **Step 3: Commit.**

## Task 4: PR2 — Sweep + vitest + Build + Push
**Files:** `kanzlei-fall.ts` (falls Helper-Erweiterung), Sweep-Files (lexdrive/process-event, state-machine, email-sender, AS-Sync-Cron, admin/kanzlei-Fallakte-Reader).
- [ ] **Step 1: Writer-Reroute** — bekannte Writer (Spec §5): lexdrive `mandatsnummer`/`as_salesforce_id`/`anschlussschreiben_am`, state-machine `anschlussschreiben_am`. **Muster:** I1-Keys aus dem `update`/`updates`-Objekt peelen (SP-J/SP-D-Muster, NACH splitOrKeepFaelleUpdate, VOR faelle-Write), via `upsertKanzleiFall(db, claimId, fallId, i1Fields)` schreiben. Throw-Caller werfen bei `!ok`; lexdrive loggt. **`anschlussschreiben_am`/`regulierung_am`-Konflikt (Spec §5): nur `anschlussschreiben_am` peelen (I1), `regulierung_am` bleibt faelle bis I2.**
- [ ] **Step 2: Reader-Reroute** — `getKanzleiFall(db, claimId, '<cols>')` bzw. `claims:claim_id(kanzlei_faelle(<col>))`-Embed (1:1 → Array-Normalisierung `Array.isArray(x)?x[0]:x`); Filter-Reader auf repointete View. Property-Namen am Consumer beibehalten (API-Vertrag).
- [ ] **Step 3: vitest** — falls Helper-Logik testbar (Upsert-Routing): `kanzlei-fall.test.ts` (create-or-update, leere fields = no-op, fall_id beim INSERT). `npx vitest run` grün.
- [ ] **Step 4: tsc + Re-Grep + Build** — `npx tsc --noEmit` 0; `node scripts/cmm44-spi1-grep.mjs` → 0 echte from('faelle') der 15 (FPs dokumentieren); `npm run build` grün.
- [ ] **Step 5: Commit + Push + PR** nach 2-Stufen-Review.

> **GATE:** Task 5 nach PR2-staging-Merge.

## Task 5: PR2 — Portal-Smoke (intern-fokussiert)
- [ ] **Step 1:** `scripts/smoke-cmm44-spi1.mjs` (kopiere `scripts/smoke-cmm44-spj.mjs`). Routes: **Admin** `/faelle/[id]` (Kanzlei-/AS-Tab), `/admin/*`-Kanzlei-Views; **Kanzlei-Portal** (falls vorhanden); LexDrive-Trigger-Panel. DB-Sanity: kanzlei_faelle hat 15; Embed `faelle->claims->kanzlei_faelle` resolvt. Round-Trip (write→read→delete) für 2-3 I1-Spalten via `upsertKanzleiFall`. Kunde-Portal: nur Sanity (schirmt ab).
- [ ] **Step 2:** `node --env-file=.env.local scripts/smoke-cmm44-spi1.mjs` gegen `app.staging.claimondo.de`; Screenshots in-turn (`feedback_smoke_screenshot_pflicht`); `docs/<DD.MM.YYYY>/cmm44-spi1-smoke.md`. #418/#310 = pre-existing.
- [ ] **Step 3: Commit + push.**

> **GATE:** Task 6 nach PR2-main-Release.

## Task 6: PR3 — Catch-up
**Branch:** `kitta/cmm-44-spi1-catchup` off origin/staging.
- [ ] Idempotenter Upsert `kanzlei_faelle ← faelle` der 15 (wie SP-J PR3: `INSERT … ON CONFLICT (claim_id) DO UPDATE SET col=COALESCE(kf.col, EXCLUDED.col)`, nur claim-verknüpfte faelle). Vor Apply Divergenz messen (erwartet 0 pre-launch). Dry-Run → Apply → repair → Verify.

## Task 7: Abschluss
- [ ] Phase-1-Mapping (`docs/16.05.2026/...`): I1-Block „erledigt" + Verdikt (15 → kanzlei_faelle). Handoff `docs/<DD.MM.YYYY>/handoff-cmm44-spi1.md` (Lessons + Helper-Doku für I2-I4). Memory `project_cmm44_spi_status.md` + MEMORY.md-Pointer. COORDINATION-Marker NUR bei SP-I-GESAMT-Abschluss löschen (nicht nach I1 — I2/I3/I4 folgen).

---

## Definition of Done (I1)
- [ ] 15 Spalten auf kanzlei_faelle (Typen gespiegelt), Backfill-Upsert ok; Treffer-Views repointed; `kanzlei_faelle`-Upsert-Helper etabliert (von I2-I4 nutzbar).
- [ ] Writer rerouten via `upsertKanzleiFall`; Reader via Embed/View; Re-Grep 0 live faelle der 15.
- [ ] vitest + Build grün; Portal-Smoke (intern) 0 Regression.
- [ ] PR3 Catch-up appliziert; Phase-1-Mapping + Handoff + Memory.

## Selbst-Review (Plan vs Spec)
- Spec §3 (Muster pro Sub-Cluster) → Task 1 (ADD+Backfill+View+Helper), Task 4 (Sweep). ✓
- Spec §3 Shared-Helper → Task 1 Step 3 (`upsertKanzleiFall`/`getKanzleiFall` konkret). ✓
- Spec §4 UI-Abstraktion → Task 3 Step 2 (Portal-Klassifikation, kunde-facing markieren) + Task 5 (intern-fokussiert). ✓
- Spec §5 anschlussschreiben_am/regulierung_am-Konflikt → Task 4 Step 1 (nur anschlussschreiben_am peelen). ✓
- Spec §7 Risiken (status-Kollision, fall_id-NOT-NULL) → Task 0 Step 1 (live messen, status NICHT anfassen, fall_id im Upsert). ✓
- Platzhalter-Scan: ADD-Typen „aus Task 0 abgleichen" (Mess-Befehl konkret); Sweep-Sites „aus Inventur" (3-Quellen-Befehl konkret) — kein TODO. ✓
- Typ-Konsistenz: `upsertKanzleiFall(db, claimId, fallId, fields)` / `getKanzleiFall(db, claimId, cols)` über alle Tasks identisch. ✓

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
