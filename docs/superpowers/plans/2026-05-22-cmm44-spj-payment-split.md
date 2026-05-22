# CMM-44 SP-J — Zahlungs-/Abrechnungs-Spalten (3-Wege-Split) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). **Dieser Plan wird von einer FRISCHEN Session ausgeführt** — er ist self-contained; lies zuerst die Spec + die Vorbedingungen.

**Goal:** Die 12 zahlungs-/abrechnungsbezogenen `faelle`-Spalten gemäß 3-Wege-Split migrieren: 3 → `claim_payments` (Reroute), 8 → `claims` (ADD), 1 → Phase-6-DROP. **Rein additiv** auf faelle-Seite.

**Architecture:** Bucket A = Reader/Writer-Reroute auf bestehende `claim_payments` (1:N, mit Rename, create-or-update). Bucket B = SP-B-Klon (8× ADD auf claims). Bucket C = nicht migrieren. Muster-Referenzen: SP-B (`docs/20.05.2026/handoff-cmm44-spb-abschluss.md`), SP-H (`docs/22.05.2026/handoff-cmm44-sph-abschluss.md`, peel/1:N), SP-C1 (no-ADD-Reroute).

**Tech Stack:** Next.js 15, TS, supabase-js, Supabase CLI, Postgres, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-22-cmm44-spj-payment-split-design.md` (LIES SIE ZUERST — enthält die Korrektur-Historie + Bucket-Begründung).

---

## Vorbedingungen (frische Session)

- **Worktree:** Neuen Worktree off `origin/staging` anlegen (`using-git-worktrees`). `.env.local` + `supabase/.temp/` reinkopieren (gitignored). `npm install` (root node_modules ist unvollständig — eigenes install, KEINE junction; SP-H-Lesson). Branch pro PR off `origin/staging`, PRs `--base staging`.
- **Harte Regeln (AGENTS.md):** nie auf main pushen; DDL nur via `db query --linked` + `migration repair` (kein `db push`); kein unbegleiteter Stash.
- **Apply-Muster:** `BEGIN/COMMIT`, Dry-Run `sed 's/^COMMIT;/ROLLBACK;/'`, apply, `migration repair --status applied <ts>`.
- **PR-Hygiene:** push → 2-Stufen-Review (Spec+Quality) → `gh pr create`. Aaron mergt feature→staging.
- **db query Multi-Statement:** nur letztes Resultset → Measure als ein SELECT mit Subqueries; Output roh lesen (`> file 2>&1; grep`), nicht auf stdout-Pipe verlassen.
- **Coordination:** `COORDINATION-active-spj.md` im Memory-Dir hat den Live-Stand. Finance-Domain — vor PR2 Drift-Recheck.

## Referenz: Die 12 Spalten, 3 Buckets

**Bucket A → `claim_payments` (Reroute + Rename, KEIN ADD, 1:N pro Claim):**
| `faelle` | `claim_payments` (existiert) |
|---|---|
| `zahlung_eingegangen_am` | `zahlungseingang_am` |
| `zahlungsweg` | `zahlungsweg` |
| `zahlung_betrag` | `erhaltener_betrag` |

`claim_payments`-Schema: `id, claim_id, status, forderungsbetrag, erhaltener_betrag, differenz_betrag, zahlungseingang_am, zahlungsweg, zahlungsreferenz, notiz, created_at, updated_at, created_by_user_id`. 1:N, kein UNIQUE auf claim_id → „aktuelle Zahlung" = `created_at DESC LIMIT 1`. Pre-launch 0 Rows.

**Bucket B → `claims` (ADD, 1:1, namensgleich):** `guthaben_verrechnet_netto`, `schlussabrechnung_am`, `auszahlung_gutachter_betrag`, `auszahlung_gutachter_eingegangen_am`, `auszahlung_zahlungsweg`, `sv_nachzahlung_netto`, `abrechnung_id` (FK→abrechnungen), `kanzlei_abrechnung_id` (FK→abrechnungen). claims hat aktuell keine davon.

**Bucket C → nicht migrieren:** `zahlung_erwartet_am` (0-cov, kein claim_payments-Pendant). Phase-6-DROP-Marker.

## Transform-Regelwerk (PR2)

| Muster | Bucket | Transform |
|---|---|---|
| **A-Read** | A | `from('faelle').select('zahlung_betrag'…)` → `from('claim_payments').select('erhaltener_betrag, zahlungseingang_am, zahlungsweg').eq('claim_id', claimId).order('created_at',{ascending:false}).limit(1).maybeSingle()`. Property-Rename am Consumer. |
| **A-Write** | A | SP-J-Wert aus faelle-Write raus; **create-or-update** aktuelle claim_payments-Row (s. Task 4 Code). NICHT in CLAIM_OWNED_DUPLICATE_COLUMNS. |
| **B-Read** | B | gemischt → `claims:claim_id(<col>)`-Embed + Array-Normalisierung; nur-SP-J → `from('claims').select(<col>).eq('id',claimId)`. |
| **B-Write** | B | via `splitOrKeepFaelleUpdate` (8 in CLAIM_OWNED_DUPLICATE_COLUMNS → auto claims) ODER direkt `from('claims').update`. |
| **E-View** | A+B | PR1 repointed → kein Code-Change. |
| **F-Typ/JSX** | A+B | Name-gleich (B) → kein Change; A-Rename → Property anpassen. |
| **C** | C | `zahlung_erwartet_am`-Reader auf `null`/Entfernung; Kommentar „CMM-44 SP-J Bucket C — Phase-6-DROP". |

**Verify-Endzustand PR2:** Re-Grep 0 live `from('faelle')` der 11 (A+B); `zahlung_erwartet_am` dokumentierte Ausnahme. Build grün.

## File Structure
**Neu:** `scripts/cmm44-spj-views-audit.sql`, `scripts/cmm44-spj-verify.sql`, `scripts/cmm44-spj-grep.mjs`, `scripts/smoke-cmm44-spj.mjs`, `supabase/migrations/<ts>_cmm44_spj_add_claims_columns.sql`, `supabase/migrations/<ts>_cmm44_spj_catchup_backfill.sql`, `docs/22.05.2026/cmm44-spj-{views-audit,inventory,smoke-pr2}.md`. (`scripts/cmm44-spj-measure.sql` existiert bereits auf staging.)
**Modifiziert:** `src/lib/faelle/claim-duplicate-columns.ts` (+8 Bucket-B in Set, PR2), `…claim-duplicate-columns.test.ts` (+Cases, PR2), `src/lib/faelle/state-machine.ts` (Bucket-A-Write-Reroute, PR2), Sweep-Files, `src/lib/supabase/database.types.ts` (PR1).

---

## Task 0: Drift-Recheck + claim_payments-Detail

**Files:** nutzt `scripts/cmm44-spj-measure.sql` (existiert auf staging).

- [ ] **Step 1:** `npx supabase db query --linked --file scripts/cmm44-spj-measure.sql 2>&1 | tail -40` — bestätigt faelle-Defs der 12. Plus claims/claim_payments-Check:
```bash
cat > /tmp/spj-t0.sql <<'SQL'
SELECT
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='claims'
   AND column_name IN ('guthaben_verrechnet_netto','schlussabrechnung_am','auszahlung_gutachter_betrag','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','sv_nachzahlung_netto','abrechnung_id','kanzlei_abrechnung_id')) AS bucketB_on_claims,
 (SELECT string_agg(column_name||':'||udt_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='claim_payments') AS cp_schema,
 (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.faelle'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE '%abrechnung%' LIMIT 1) AS faelle_abrechnung_fk,
 (SELECT string_agg(DISTINCT status, ',') FROM public.claim_payments) AS cp_status_values;
SQL
npx supabase db query --linked --file /tmp/spj-t0.sql > /tmp/spj-t0.out 2>&1; grep -vE "version of Supabase|recommend|Initialising" /tmp/spj-t0.out
```
Expected: `bucketB_on_claims=0`. Notiere: exakte faelle-Typen/Precision/Defaults der 8 Bucket-B (für ADD), die FK-Def (ON DELETE) für abrechnung_id/kanzlei_abrechnung_id, **claim_payments.status erlaubte Werte** (falls leer/null → Writer setzt `status` NICHT, nur erhaltener_betrag/zahlungseingang_am/zahlungsweg). Kein Commit.

---

## Task 1: PR1 (Bucket B) — View-Audit + ADD-Migration + Dry-Run

**Branch:** `kitta/cmm-44-spj-pr1-add-columns` off `kitta/cmm-44-spj`.

**Files:** Create `scripts/cmm44-spj-views-audit.sql`, `scripts/cmm44-spj-verify.sql`, `docs/22.05.2026/cmm44-spj-views-audit.md`, `supabase/migrations/<ts>_cmm44_spj_add_claims_columns.sql`.

- [ ] **Step 1: Branch** — `git fetch origin && git checkout -b kitta/cmm-44-spj-pr1-add-columns kitta/cmm-44-spj`

- [ ] **Step 2: verify-SQL** — `scripts/cmm44-spj-verify.sql`:
```sql
SELECT count(*) AS bucketB_neu_auf_claims FROM information_schema.columns
WHERE table_schema='public' AND table_name='claims'
  AND column_name IN ('guthaben_verrechnet_netto','schlussabrechnung_am','auszahlung_gutachter_betrag','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','sv_nachzahlung_netto','abrechnung_id','kanzlei_abrechnung_id');
```

- [ ] **Step 3: View-Audit** — `scripts/cmm44-spj-views-audit.sql` (welche Views exponieren eine der 11 A+B-Spalten):
```sql
SELECT c.table_name AS view_name, string_agg(c.column_name, ', ' ORDER BY c.column_name) AS cols
FROM information_schema.columns c JOIN information_schema.views v
  ON v.table_schema=c.table_schema AND v.table_name=c.table_name
WHERE c.table_schema='public' AND c.column_name IN
 ('zahlung_eingegangen_am','zahlungsweg','zahlung_betrag','guthaben_verrechnet_netto','schlussabrechnung_am','auszahlung_gutachter_betrag','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','sv_nachzahlung_netto','abrechnung_id','kanzlei_abrechnung_id')
GROUP BY c.table_name ORDER BY c.table_name;
```
Bekannt (2026-05-22): `v_faelle_mit_aktuellem_termin` (viele), `faelle_sv_view` (`auszahlung_gutachter_eingegangen_am`), `faelle_kunde_view` (`auszahlung_zahlungsweg`). Pro Treffer-View `pg_get_viewdef('public.<v>', true)` holen. **Repoint-Strategie pro Spalte** in views-audit.md:
 - Bucket-B-Spalten (8): `f.<col>` → `c.<col>` (claims-Alias `c` ist in v_faelle_mit_aktuellem_termin schon vorhanden; sonst claims-JOIN ergänzen).
 - Bucket-A-Spalten in v_faelle (`zahlung_eingegangen_am`/`zahlungsweg`/`zahlung_betrag`): pre-launch 0-cov. **Empfehlung:** im View als `NULL::<typ> AS <col>` belassen ODER per LATERAL aus claim_payments (aktuelle Row). Da 0-cov + Klärungsaufwand: `NULL::<typ>`-Platzhalter mit Kommentar (View-Reader sind dann Pattern E, kein Code-Change; echte claim_payments-Reads laufen über Bucket-A-Code, nicht den View). Im Audit-Doc dokumentieren.

- [ ] **Step 4: Migration** — `npx supabase migration new cmm44_spj_add_claims_columns`. Inhalt (Typen/Defaults/FK aus Task 0 ABGLEICHEN):
```sql
-- CMM-44 SP-J PR1 (Bucket B) — 8 ADD auf claims + Backfill + View-Repoints
BEGIN;
ALTER TABLE public.claims
  ADD COLUMN guthaben_verrechnet_netto numeric DEFAULT 0,   -- Default aus Task 0
  ADD COLUMN schlussabrechnung_am timestamptz,
  ADD COLUMN auszahlung_gutachter_betrag numeric,
  ADD COLUMN auszahlung_gutachter_eingegangen_am timestamptz,
  ADD COLUMN auszahlung_zahlungsweg text,
  ADD COLUMN sv_nachzahlung_netto numeric,
  ADD COLUMN abrechnung_id uuid REFERENCES public.abrechnungen(id),         -- ON DELETE aus Task 0
  ADD COLUMN kanzlei_abrechnung_id uuid REFERENCES public.abrechnungen(id); -- ON DELETE aus Task 0

UPDATE public.claims c SET
  guthaben_verrechnet_netto            = COALESCE(f.guthaben_verrechnet_netto, c.guthaben_verrechnet_netto),
  schlussabrechnung_am                 = f.schlussabrechnung_am,
  auszahlung_gutachter_betrag          = f.auszahlung_gutachter_betrag,
  auszahlung_gutachter_eingegangen_am  = f.auszahlung_gutachter_eingegangen_am,
  auszahlung_zahlungsweg               = f.auszahlung_zahlungsweg,
  sv_nachzahlung_netto                 = f.sv_nachzahlung_netto,
  abrechnung_id                        = f.abrechnung_id,
  kanzlei_abrechnung_id                = f.kanzlei_abrechnung_id
FROM public.faelle f WHERE f.claim_id = c.id;

-- Block 3: CREATE OR REPLACE VIEW je Treffer-View (Step 3). Bucket-B: f.<col>->c.<col>
-- mit Precision-Cast (42P16-Guard); Bucket-A: NULL::<typ>-Platzhalter (s. Audit).
-- Occurrence-Count-Assertion (==1) je ersetzter Stelle.
COMMIT;
```

- [ ] **Step 5: Trigger-Audit auf claims** (SP-G-Lesson) — `pg_trigger`/`prosrc` auf den 8 Spalten Notifications? Falls ja DISABLE/ENABLE-Wrapper um Backfill.

- [ ] **Step 6: Dry-Run** — `MIG=$(ls supabase/migrations/*_cmm44_spj_add_claims_columns.sql|tail -1); sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/dry.sql; npx supabase db query --linked --file /tmp/dry.sql 2>&1 | tail -10` → kein Fehler.

- [ ] **Step 7: Commit** — `git add scripts/cmm44-spj-views-audit.sql scripts/cmm44-spj-verify.sql docs/22.05.2026/cmm44-spj-views-audit.md supabase/migrations/*_cmm44_spj_add_claims_columns.sql && git commit -m "chore(CMM-44): SP-J PR1 Bucket B — ADD-Migration + View-Audit"`

---

## Task 2: PR1 — Apply + Verify + Types + Build + Push

**Branch:** Forts.

- [ ] **Step 1: Drift-Recheck** — Task 0 measure erneut, `bucketB_on_claims=0`.
- [ ] **Step 2: Apply + repair** — `npx supabase db query --linked --file "$MIG"`; `npx supabase migration repair --status applied <ts>`.
- [ ] **Step 3: Verify** — `scripts/cmm44-spj-verify.sql` → `bucketB_neu_auf_claims=8`.
- [ ] **Step 4: View-Verify** — 3 Views: Bucket-B aus `c.`, Bucket-A als NULL-Platzhalter (oder LATERAL). 0 residual `f.<bucketB_col>`.
- [ ] **Step 5: Types** — `powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }"`; grep 3 Bucket-B-Spalten im claims-Type.
- [ ] **Step 6: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10` → grün.
- [ ] **Step 7: Commit + Push** — `git commit -m "feat(CMM-44): SP-J PR1 Bucket B — 8 ADD auf claims + Backfill + View-Repoints"` (+7-Punkte-Audit) `&& git push -u origin kitta/cmm-44-spj-pr1-add-columns`. **KEIN PR.**
- [ ] **Step 8: PR nach 2-Stufen-Review** — `gh pr create --base staging --title "CMM-44 SP-J PR1 — 8 ADD auf claims (Bucket B)"`.

> **GATE:** Task 3 erst nach PR1-staging-Merge (regen. Types).

---

## Task 3: PR2 — Call-Site-Inventur

**Branch:** `kitta/cmm-44-spj-pr2-sweep` off `origin/staging` (nach PR1-Merge).

**Files:** Create `scripts/cmm44-spj-grep.mjs`, `docs/22.05.2026/cmm44-spj-inventory.md`.

- [ ] **Step 1: Branch** — `git fetch origin && git checkout -b kitta/cmm-44-spj-pr2-sweep origin/staging`
- [ ] **Step 2: Grep-Skript** — kopiere `scripts/cmm44-sph-grep.mjs`, setze `COLS` = die **11** A+B-Spalten (NICHT `zahlung_erwartet_am` — Bucket C separat). stripSubEmbeds: zusätzlich `claims(...)` + `claim_payments(...)` strippen.
- [ ] **Step 3: Inventur** — `node scripts/cmm44-spj-grep.mjs > /tmp/spj-hits.txt`; per-Spalte + per-File aggregieren. `docs/22.05.2026/cmm44-spj-inventory.md`: pro Site **Bucket (A/B/C) + Pattern**. Grep-Gaps: `grep -rn splitOrKeepFaelleUpdate src/` (Bucket-B-Helper-Consumer = nach Set-Update auto; Bucket-A-Werte die durch den Helper laufen — z.B. state-machine `zahlung_*` — explizit als A-Write markieren, NICHT über Set). Separat `grep -rn "zahlung_erwartet_am" src/` (Bucket C). Chunking <80 → 1 PR2.
- [ ] **Step 4: Commit** — `git add scripts/cmm44-spj-grep.mjs docs/22.05.2026/cmm44-spj-inventory.md && git commit -m "docs(CMM-44): SP-J PR2 — Call-Site-Inventur"`

---

## Task 4: PR2 — Sweep (A+B+C) + Set + vitest + Build + Push

**Files:** `claim-duplicate-columns.ts`, `claim-duplicate-columns.test.ts`, `state-machine.ts`, Sweep-Files.

- [ ] **Step 1: Bucket B — 8 in `CLAIM_OWNED_DUPLICATE_COLUMNS`**

In `src/lib/faelle/claim-duplicate-columns.ts` im Set ergänzen (NUR die 8 Bucket-B; **NICHT** die 3 Bucket-A):
```typescript
  // CMM-44 SP-J Bucket B — claims-native (1:1). NICHT die zahlung_*-Bucket-A
  // (die gehen auf claim_payments, nicht claims).
  'guthaben_verrechnet_netto', 'schlussabrechnung_am',
  'auszahlung_gutachter_betrag', 'auszahlung_gutachter_eingegangen_am',
  'auszahlung_zahlungsweg', 'sv_nachzahlung_netto',
  'abrechnung_id', 'kanzlei_abrechnung_id',
```

- [ ] **Step 2: vitest-Cases** — in `claim-duplicate-columns.test.ts`:
```typescript
describe('SP-J Bucket B routet auf claims', () => {
  it('splitOrKeepFaelleUpdate routet die 8 Bucket-B nach claims', () => {
    const u = { status: 'x', schlussabrechnung_am: 't', auszahlung_gutachter_betrag: 5, abrechnung_id: 'a1' }
    const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(u, 'claim-1')
    expect(claimsUpdate).toEqual({ schlussabrechnung_am: 't', auszahlung_gutachter_betrag: 5, abrechnung_id: 'a1' })
    expect(faelleUpdate).toEqual({ status: 'x' })
  })
  it('Bucket-A (zahlung_*) sind NICHT in CLAIM_OWNED_DUPLICATE_COLUMNS (gehen auf claim_payments)', () => {
    for (const c of ['zahlung_eingegangen_am','zahlungsweg','zahlung_betrag'])
      expect(CLAIM_OWNED_DUPLICATE_COLUMNS.has(c)).toBe(false)
  })
})
```
Run `npx vitest run src/lib/faelle/claim-duplicate-columns.test.ts` → grün (inkl. AUFTRAEGE-Disjunktheit).

- [ ] **Step 3: Bucket A — state-machine Write-Reroute**

In `src/lib/faelle/state-machine.ts` `transitionFallStatus`: die `update.zahlung_eingegangen_am`/`update.zahlung_betrag`-Zeilen (bei `status==='zahlung-eingegangen'`) ENTFERNEN. Nach den faelle/claims-Writes, vor Timeline:
```typescript
// CMM-44 SP-J Bucket A: Zahlungseingang -> claim_payments (1:N, aktuelle Row create-or-update).
if (newStatus === 'zahlung-eingegangen' && claimId && metadata?.betrag != null) {
  const now2 = new Date().toISOString()
  const { data: cp } = await db.from('claim_payments').select('id')
    .eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const payload = { erhaltener_betrag: metadata.betrag, zahlungseingang_am: now2 } // status NUR setzen wenn Enum aus Task 0 bekannt
  if (cp?.id) {
    const { error } = await db.from('claim_payments').update(payload).eq('id', cp.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await db.from('claim_payments').insert({ claim_id: claimId, ...payload, created_by_user_id: metadata?.user_id ?? null })
    if (error) throw new Error(error.message)
  }
}
```
(`zahlungsweg` setzt state-machine nicht — andere Writer-Sites aus der Inventur analog.)

- [ ] **Step 4: Bucket A Reads + andere A-Writes** (Inventur) — A-Read-Pattern (claim_payments aktuelle Row + Property-Rename); A-Write-Pattern (create-or-update). Bucket-A NIE über das Set.

- [ ] **Step 5: Bucket B Reads/Writes** (Inventur) — B-Read `claims:claim_id(<col>)`-Embed + Normalisierung; B-Write via Set (Helper-Consumer, kein Site-Change) oder direkt `from('claims').update`.

- [ ] **Step 6: Bucket C** — `zahlung_erwartet_am`-Reader (falls vorhanden) auf `null`/Entfernung mit Kommentar „CMM-44 SP-J Bucket C — Phase-6-DROP, kein Reroute".

- [ ] **Step 7: Typecheck + Re-Grep + Build** — `npx tsc --noEmit` 0 Fehler; `node scripts/cmm44-spj-grep.mjs` → 0 echte A+B faelle-Zugriffe (Helper-Consumer-Writes von Bucket B = FP via Set; dokumentieren); `NODE_OPTIONS=--max-old-space-size=8192 npm run build` grün.

- [ ] **Step 8: Commit + Push + PR nach Review** — `git add -A && git commit` (Subject `refactor(CMM-44): SP-J PR2 — A->claim_payments, B->claims, C-drop-marker` +Audit) `&& git push -u origin kitta/cmm-44-spj-pr2-sweep`; PR nach 2-Stufen-Review.

> **GATE:** Task 5 nach PR2-staging-Merge.

---

## Task 5: PR2 — Portal-Smoke

- [ ] **Step 1:** `scripts/smoke-cmm44-spj.mjs` (kopiere `scripts/smoke-cmm44-sph.mjs`). Routes: **Admin** `/admin/finance` + `/faelle/[id]` (Regulierung/Zahlung-Tab); **SV** `/gutachter/abrechnung`; **Fallakte** Zahlungseingang-Flow. DB-Sanity: claims hat 8 Bucket-B; claim_payments erreichbar. Detekt 5xx/pageerror/`undefined`.
- [ ] **Step 2:** `node --env-file=.env.local scripts/smoke-cmm44-spj.mjs` gegen `app.staging.claimondo.de`; Screenshots in-turn auswerten (`feedback_smoke_screenshot_pflicht`); Protokoll `docs/22.05.2026/cmm44-spj-smoke-pr2.md`. Pre-existing #418/#310/ChunkLoadError ≠ SP-J-Regression.
- [ ] **Step 3:** Commit + push.

> **GATE:** Task 6 nach PR2-main-Release (Inhaltscheck `git diff origin/main origin/staging -- src/ supabase/migrations/`).

---

## Task 6: PR3 — Catch-up (Bucket B)

**Branch:** `kitta/cmm-44-spj-pr3-catchup` off `origin/staging`.

- [ ] **Step 1-4:** Migration `cmm44_spj_catchup_backfill` — idempotenter COALESCE der **8 Bucket-B** claims<-faelle (`UPDATE claims c SET col=COALESCE(c.col,f.col) FROM faelle f WHERE f.claim_id=c.id`). Bucket A (claim_payments) catch-up nur falls Daten (pre-launch 0 → weglassen). Dry-Run → Apply → repair → Verify `bucketB_neu_auf_claims=8`.
- [ ] **Step 5-6:** Commit + push + PR nach Review.
- [ ] **Step 7:** Finaler Smoke.

---

## Task 7: Abschluss

- [ ] **Step 1: Phase-1-Mapping** — `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` Update-Block: „SP-J erledigt — **Verdikt-Korrektur** Abrechnung-Cluster: 3→claim_payments (Reroute), 8→claims (ADD), 1 (zahlung_erwartet_am)→Phase-6-DROP. PR1 #/PR2 #/PR3 #." + Hinweis dass „MOVE→abrechnungen" im Original falsch war.
- [ ] **Step 2: Handoff** — `docs/22.05.2026/handoff-cmm44-spj-abschluss.md` (Lessons: claim_payments-Reroute-Pattern, Verdikt-Korrektur, Bucket-A-create-or-update).
- [ ] **Step 3: Memory** — `project_cmm44_spj_status.md` + MEMORY.md-Pointer. `COORDINATION-active-spj.md` löschen.
- [ ] **Step 4: Commit + PR + Session-Abschluss-Checkliste.**

---

## Definition of Done
- [ ] Bucket B: 8 auf claims (Typen/FK gespiegelt), Backfill ok; 3 Views repointed; 8 in Set; vitest grün (inkl. Bucket-A-NICHT-im-Set).
- [ ] Bucket A: 3 Reads/Writes auf claim_payments (Rename, create-or-update); state-machine zahlung-Write → claim_payments.
- [ ] Bucket C: zahlung_erwartet_am unangetastet, Phase-6-DROP-Marker dokumentiert.
- [ ] Re-Grep 0 live faelle der 11 (A+B); Build grün.
- [ ] PR3 (B) appliziert; 5-Portal-Smoke 0 Regression.
- [ ] Phase-1-Mapping (Verdikt-Korrektur) + Handoff + Memory.

## Selbst-Review (Plan vs. Spec)
- **Spec §1 3-Wege-Split** — Task 1 (B-ADD), Task 4 (A-Reroute Step 3-4, B Step 1+5, C Step 6). ✅
- **Spec §3a Bucket A (Rename+1:N+create-or-update+state-machine)** — Task 4 Step 3 (state-machine Code) + Step 4 (Reads/andere Writes). ✅
- **Spec §3b Bucket B (SP-B)** — Task 1 ADD + Task 4 Step 1/5. ✅
- **Spec §3c View-Repoint (3 Views, Bucket-A als NULL-Platzhalter)** — Task 1 Step 3. ✅
- **Spec §4 Migrations (B braucht Migration, A nicht)** — Task 1 (B-Migration), Task 4 (A code-only). ✅
- **Spec §5 PR-Struktur** — Task 1-2 (PR1 B), 3-5 (PR2 A+B+C), 6 (PR3 B). ✅
- **Spec §7 Testing** — Task 4 Step 2 (vitest: B-Routing + A-nicht-im-Set) + Task 5 (Smoke). ✅
- **Spec §8 (Bucket A heikel, Finance-Drift, zahlung_erwartet_am)** — Task 0 (Drift+status-Enum), Task 3 (Drift), Task 4 Step 6 (C). ✅
- **Platzhalter-Scan:** ADD-Typen/FK + claim_payments.status-Enum explizit „in Task 0 messen" (Mess-Anweisung mit Befehl, kein Raten). View-Bucket-A-Strategie konkret (NULL-Platzhalter). ✅
- **Typ-Konsistenz:** Bucket-A-Rename-Mapping konsistent (zahlung_betrag→erhaltener_betrag etc.); die 8 Bucket-B-Namen identisch über Tasks; `splitOrKeepFaelleUpdate`/`CLAIM_OWNED_DUPLICATE_COLUMNS` exakt. ✅

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
