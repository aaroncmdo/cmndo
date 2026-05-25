# CMM-65 Part A (Timestamp-Sweep) — Session-3 Handoff (2026-05-25)

**Teil von:** CMM-44 (Claim-as-SSoT). **Vorgaenger:** `handoff-cmm65-partA-continuation-2026-05-25.md` (#1706).
**Kanonischer Live-Status:** Memory `project_cmm65_timestamp_sweep.md` (Pattern + Lessons + Restflaeche).
**Worktree dieser Session:** `.claude/worktrees/cmm65-impl` (eigene, NICHT `cmm65-ts`). Pro Domain ein frischer Branch off `origin/staging`.

---

## 1 · Diese Session geliefert — 4 Reader-Slices als 3 PRs (alle gegen staging, Pattern 1, voll gruen)

| PR | Domain | Inhalt |
|---|---|---|
| [#1708](https://github.com/aaroncmdo/cmndo/pull/1708) | **gutachter** | `abrechnung`/`posteingang`/`reklamationen`/`team` — `!inner`+flatten/client-sort; `.order+.limit(50)`→client sort+slice(50) (reklamationen/team); posteingang erhaelt Leer-Thread-Reihenfolge |
| [#1711](https://github.com/aaroncmdo/cmndo/pull/1711) | **analytics + branding** | conversion/sv-performance fallQuery `.gte/.lte('claims.created_at')` (finance-Pattern); kunden-theme/token-theme `resolveBrandingFromLeadId`/`resolveKundenTheme` flatten+pick-newest |
| [#1713](https://github.com/aaroncmdo/cmndo/pull/1713) | **inbound** | `match-fall.ts` (matchInboundToFall) + `baileys/inbound` + `twilio/inbound-kb-whatsapp` ×2 — `!inner`+client-pick-newest |

Gates je: `tsc --noEmit` gruen + voller `next build` (Compile + TypeScript-Route-Validator + SSG; #1711/#1713 SSG 331/331). Empirisch re-geprobt: `faelle`=53 == `faelle !inner claims`=53, `faelle.claim_id IS NULL`=0, `claims.created_at IS NULL`=0 → `!inner` verlustfrei.

> Nicht die Merge-Session — `sync-watcher` merged die offenen non-draft staging-PRs bei gruenem `build`.

---

## 2 · ⛔ BLOCKING FINDING — `kanzlei` deferred: `claims.updated_at` ist NICHT order-tauglich

`kanzlei/kanban/page.tsx` + `kanzlei/mandate/page.tsx` ordnen `faelle` nach **`updated_at`** (nicht created_at) + zeigen `updated_at ?? created_at` an. Migration nach `claims.updated_at` waere eine **Regression**:

**Empirisch (live prod, 28 komplett-Faelle):**
- `claims.updated_at` = **1 distinkter Wert** (`2026-05-22T13:44:40` — Bulk-`UPDATE claims SET ...` einer CMM-44-SP-Backfill-Migration, via moddatetime-Trigger `trg_claims_updated_at`).
- `faelle.updated_at` = 6 distinkte Werte (echtes per-Fall-Recency-Signal).

D.h. `claims.updated_at` traegt **0 Ordering-Signal** und wird von **jeder weiteren SP-Additiv-Backfill-Migration neu geclobbert**, solange CMM-44 laeuft. Ein `.order('claims.updated_at')` collabiert die kanban/mandate-Sortierung auf Migrations-Timestamp-Ties. Der created_at-Teil laesst sich nicht sauber halb-migrieren (eine Query selektiert+ordnet beides).

**LESSON (breiter als CMM-65):** `claims.updated_at` ist waehrend der Migration **nicht vertrauenswuerdig fuer Ordering/Recency** — betrifft jede updated_at-basierte Logik.

**Design-Entscheidung noetig (Aaron):**
1. dedizierter, backfill-resistenter Aktivitaets-Timestamp auf `claims` (z.B. `letzte_aktivitaet_am`, nur von echten Aktivitaets-Writes gebumpt), **oder**
2. kanzlei nach `claims.created_at` ordnen (Semantik „neueste Faelle" statt „zuletzt bearbeitet"), **oder**
3. kanzlei erst nach Abschluss aller CMM-44-Backfills migrieren.

---

## 3 · REMAINING SURFACE (READS) — alle Pattern-1, re-grep pro Slice Pflicht

- **kunde** (CMM-63-entangled — `kunde_id`-Reads liefen via CMM-63 auf `claim_parties`, genau pruefen): `app/kunde/chat/page.tsx:46` · `app/kunde/onboarding/actions.ts:540` · `components/kunde/OffeneDatenBanner.tsx:31` · `lib/claims/get-kunde-faelle.ts:438`. NB `onboarding/page` liest created_at aus der View `v_faelle_mit_aktuellem_termin` → CMM-66 (View-Repoint), kein Code.
- **sonstige (zentrale/sensible Stellen — einzeln pruefen):** `app/faelle/[id]/page.tsx:526` (`.order`, geteilte Fallakte) · `lib/fall/communication-timeline.ts:52` (`select('created_at, lead_id')`, **Timeline-Anker** — Order/Anchor-Semantik genau verstehen) · `lib/faelle/kb-assignment.ts:195` (`.order`).

## 4 · REMAINING SURFACE (WRITERS, faelle.updated_at-Sweep, ~12-18 sites)

Mechanik = prozess-PR #1697: der Sync-Trigger `trg_sync_faelle_to_claims` **exkludiert** `updated_at` → ein reiner `faelle.update({updated_at})` propagiert nichts. Pro Site: **MOVE** (expliziter `claims.update({updated_at}).eq('id',claimId)`) wenn kein anderer claims-Write in derselben Action `claims.updated_at` bumpt, sonst **drop**. **Pro Site verifizieren: `faelle` vs `gutachter_termine`** (`lib/actions/termin-actions.ts` ×4 ist wahrscheinlich gutachter_termine, NICHT faelle). Bekannte Sites u.a.: `app/kunde/faelle/[id]/{actions ×2, besichtigungsort}` · `app/faelle/[id]/_actions/{core ×2, dokumente}` · `app/gutachter/fall/[id]/actions.ts:574` · `app/flow/[token]/actions.ts` · `lib/faelle/kb-assignment.ts` · `lib/kanzlei/push-mandat.ts` · `lib/ai/briefing(+structured)` · `app/api/termin/ablehnen` · `app/api/twilio/inbound-kb-whatsapp:125` · `lib/actions/termin-verlegung-actions`. `faelle/[id]/_actions/briefing` LIEST faelle.updated_at.

> **Achtung beim Writer-Sweep:** Das updated_at-Clobber-Finding (§2) heisst NICHT, dass die Writer-MOVEs falsch sind — im Gegenteil, jeder echte `claims.update({updated_at})` fuegt Signal hinzu. Es heisst nur, dass updated_at-basiertes **Ordering** (kanzlei) erst sinnvoll wird, wenn die Backfills durch sind und genug echte Writes laufen.

## 5 · DANACH: Part B (DDL) + CMM-61 — separate Risikoklasse, nur auf explizites Go

Part B: `claims` ADD `marketing_provision`/`marketing_quelle` (+Backfill) + `zahlungsweg` (all-null) + Top-Level-Finanz-Reads. CMM-61: `kanzlei_faelle` provision/honorar + Vollmacht-Uebergabe. DDL nur via supabase-CLI (Regel 2), `information_schema` live davor.

---

## 6 · Verified mechanics (recap fuer die naechste Session)

- **Reads-Filter (`.gte/.lte`):** `from('faelle')` bleibt, Embed → `claims:claim_id!inner(...)`, Filter → `.gte/.lte('claims.created_at', …)`. Verlustfrei weil `faelle.claim_id` NOT NULL.
- **Reads-Order (`.order('created_at')`):** supabase-js kann den Parent NICHT nach eingebetteter to-one-Spalte ordnen (`.order(col,{referencedTable})` = No-op). → `claims.created_at` flachziehen + **clientseitig** sortieren; `.order`/`.limit` raus, client `.sort().slice(N)` (Mengen gebounded).
- **Select-für-Anzeige:** claim created_at via `.map` auf Top-Level flachziehen (z.B. `{ ...f, created_at: claim?.created_at ?? null }`), Display-Code unveraendert.
- **Probe-Tooling:** node `fetch`/supabase-js **haengt** auf Supabase → `curl -4` + service-role. 522/Timeout = DB-Pool durch Parallel-Sessions erschoepft (transient). `/gutachter-partner` SSG kann lokal >60s timeouten (build-time `sv_leads`-Query) → CI-`build` (sauberer Pool) ist das Gate.
