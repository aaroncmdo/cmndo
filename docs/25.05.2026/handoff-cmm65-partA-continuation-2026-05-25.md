# CMM-65 Part A (Timestamp-Sweep) — Handoff Fortsetzung (2026-05-25, Session 2)

**Teil von:** CMM-44 (Claim-as-SSoT).
**Vorgänger-Handoffs:** Master-Session #1681 (`docs/25.05.2026/handoff-session-cmm44-2026-05-25.md`) · Part-A-Finance #1691 (`docs/25.05.2026/handoff-cmm65-partA-finance-2026-05-25.md`).
**Slice-Plan:** `docs/25.05.2026/cmm65-timestamps-slice-plan.md` (nur auf Branch `kitta/cmm65-timestamps`, **nicht** auf staging).
**Probe-Tool:** `scripts/probe-cmm65-ts.mjs` (#1694, curl-basiert).
**Memory (kanonischer Live-Status):** `memory/project_cmm65_timestamp_sweep.md` — enthält Pattern, Lessons UND die vollständige Restflächen-Liste. **Diese Datei ist der ausführliche Begleiter dazu.**

---

## 1 · TL;DR

CMM-65 verschiebt die ~91 `faelle.created_at`/`updated_at`-Reader/Writer auf `claims` (SSoT), damit sie den Phase-6 `DROP TABLE faelle CASCADE` (CMM-49/SP-L) überleben. **Part A = behavior-preserving Reader/Writer-Sweep, kein DDL.** Part B (Finanz-ADDs, DDL) kommt danach.

**Diese Session geliefert (3 PRs, alle gegen staging, Pattern-1):**

| PR | Slice | Status |
|---|---|---|
| [#1697](https://github.com/aaroncmdo/cmndo/pull/1697) | prozess-**Writer** (`updated_at` ×4 → claims) | ✅ MERGED |
| [#1702](https://github.com/aaroncmdo/cmndo/pull/1702) | admin/dispatch-**Reads** (`created_at`, 8 Sites/7 Files) | ✅ MERGED |
| [#1705](https://github.com/aaroncmdo/cmndo/pull/1705) | cron `community-leaderboard-update` | 🟡 OPEN (sync-watcher merged bei grünem Build) |

**Vor dieser Session bereits gemerged (Finance):** [#1686](https://github.com/aaroncmdo/cmndo/pull/1686) (`lib/analytics/finance.ts`) · [#1688](https://github.com/aaroncmdo/cmndo/pull/1688) (`admin/finance/(hub)/page.tsx`) · [#1690](https://github.com/aaroncmdo/cmndo/pull/1690) (`lib/abrechnung/*`).

**Wichtigster Befund (Revalidierung):** Die Restfläche ist **deutlich größer als „nur kunde"** — siehe §5. Es ist ein **Fan-out-Job** (homogene Mechanik über alle Portale + Writer-Klasse).

---

## 2 · Die verifizierte Mechanik (das Rezept für ALLE restlichen Slices)

### Reads (`faelle.created_at`)
- **Pattern 1 (IMMER):** `from('faelle')` bleibt Basis, `created_at` kommt via `claims:claim_id!inner(created_at)`-Embed, Filter auf `.gte/.lte/.lt('claims.created_at', …)`.
  - Verlustfrei: `faelle.claim_id` ist NOT NULL (live **0** NULLs) → `!inner` droppt keine Zeile.
  - `claims.created_at ≈ faelle.created_at` (~150 ms Differenz, gleiche Boundaries — empirisch).
  - Funktioniert mit `{ count: 'exact', head: true }` (Head-Count) — verifiziert.
- **Pattern 2 (base-switch `from('faelle')`→`from('claims')`) ist VERBOTEN** für faelle-Row-Set-Queries: **`faelle ⊊ claims`** (live 54 claims vs 53 faelle) → base-switch zählt die claim-only-Row mit = nicht value-neutral. `from('claims')` nur wenn die Query **ohnehin** claim-scoped ist (`.in('id', claimIds)`) UND man die orphan-claim bewusst akzeptiert.
- **ORDER-BY-`created_at` (wichtige Falle):** `supabase-js` kann **NICHT** den Parent nach einer eingebetteten to-one-Spalte ordnen. `.order('created_at', { referencedTable: 'claims' })` ordnet die *eingebettete* Zeile = No-op für to-one. PostgREST `order=claims(created_at)` ordnet zwar den Parent (verifiziert: identische id-Sequenz wie `order=faelle.created_at`), ist via supabase-js aber **nicht ausdrückbar**. → **Lösung: `claims.created_at` flachziehen + clientseitig sortieren** (DB-`.order`/`.limit` raus, client `.sort().slice(N)`; die Mengen sind gebounded). Precedent: WichtigeUpdatesWidget / offene-faelle / sv-termin in #1702.

### Writer (`faelle.updated_at`)
- Der faelle→claims-Sync-Trigger `trg_sync_faelle_to_claims` (Migration `supabase/migrations/20260505134954_cmm_phase_1_5a_claims_faelle_sync_triggers.sql`) ist `AFTER UPDATE OF <40 Daten-Spalten>` und **schließt `updated_at` explizit aus**. Ein reiner `faelle.update({updated_at})` propagiert also **nichts** auf claims.
- `claims` hat moddatetime `trg_claims_updated_at` (BEFORE UPDATE all-cols, Migration `20260425150100_aar810a1_create_claims.sql`) → **jeder** claims-Write bumpt `claims.updated_at`.
- **Entscheidungsregel:** Pflegt ein anderer claims-Write in derselben Action `claims.updated_at` ohnehin? → faelle-Write **droppen**. Sonst → **expliziter `claims.update({ updated_at: now }).eq('id', claimId)`** (Wert ist Fallback + Intent; Trigger überschreibt auf server-now). Beispiel prozess #1697: #1/#2/#3 expliziter claims-Bump, #4 (`uebergebeFallKlage`) Drop (der `geschlossen_grund`-Write bumpt schon).
- **VORSICHT:** Pro Writer-Site **verifizieren, ob das Update auf `faelle` oder `gutachter_termine` geht** — `lib/actions/termin-actions.ts` ist vermutlich `gutachter_termine` (eigene `updated_at`, NICHT CMM-65-Scope).

### Views
- Reads aus `v_faelle_mit_aktuellem_termin` (z.B. `api/cron/abrechnung-erstellen`, `admin/_components/DashboardStats` regulierung_am-Query) sind **KEIN Code-Change** → die View wird in **CMM-66** auf `claims.created_at` repointed.

---

## 3 · Empirische Verifikation (live prod, `curl -4` + service-role)

- `faelle.claim_id IS NULL` = **0** · `faelle.created_at IS NULL` = 0 · `claims.created_at IS NULL` = 0 (NOT NULL).
- Reader-Counts old(`faelle.created_at`) == new(`claims.created_at !inner`) an allen getesteten Sites: finance 53/53,37/37,4/4 · KritischeUpdates 9=9 · DashboardStats 53=53 · KpiCards 4=4 · community-leaderboard Monatsbereich (gte+lt) 53=53.
- `order=claims(created_at).desc` == `order=faelle.created_at.desc` (identische id-Sequenz, 6 Stichproben).

---

## 4 · Revalidierungs-Stand (2026-05-25, empirisch gegen origin/staging)

- #1686/#1688/#1690/#1697/#1702 = **MERGED**, Code auf staging verifiziert (`prozess.ts`: 0 Rest-`faelle.update({updated_at`, 3× `claims.update`; admin/dispatch-Files tragen `!inner`-Embed).
- #1705 (cron) = **OPEN** (noch nicht auf staging; Auto-Merge via sync-watcher bei grünem `build`-Check).
- **Lektion bestätigt:** „PR-Status ≠ Production-Stand" — immer `git grep origin/staging` + PR-State prüfen, nicht nur das Merged-Label.

---

## 5 · REMAINING SURFACE (Work-Breakdown für die nächste Session / Parallel-Agenten)

> Alles dieselbe Pattern-1-Mechanik. Pro Domain = 1 isolierter Worktree + 1 PR gegen staging. **Re-Grep pro Slice ist Pflicht** (diese Liste ist ein Snapshot vom 25.05.).

### Reads (`faelle.created_at`, ~20 Sites)
- **kunde:** `app/kunde/chat/page.tsx:46` · `app/kunde/onboarding/actions.ts:540` · `components/kunde/OffeneDatenBanner.tsx:31` · `lib/claims/get-kunde-faelle.ts:438` (teils via CMM-63 schon angefasst → genau prüfen). **Kleinste Slice, guter Einstieg.**
- **gutachter:** `app/gutachter/abrechnung/page.tsx:81/84` · `posteingang/page.tsx:38` · `reklamationen/page.tsx:34` · `team/page.tsx:96/99`.
- **kanzlei:** `app/kanzlei/kanban/page.tsx:63/66` · `mandate/page.tsx:38/41` (beide: `created_at` im Select + `order('updated_at')` — auch updated_at-Read!).
- **inbound:** `app/api/baileys/inbound/route.ts:76` · `app/api/twilio/inbound-kb-whatsapp/route.ts:86,99` · `lib/inbound/match-fall.ts:76/78`.
- **analytics:** `lib/analytics/conversion.ts:39/40` · `lib/analytics/sv-performance.ts:56/57` (fallQuery `.gte/.lte('created_at')`).
- **branding:** `lib/branding/kunden-theme.ts:44` · `lib/branding/token-theme.ts:55` (`order('created_at')`).
- **sonstige:** `app/faelle/[id]/page.tsx:526` (`order`) · `lib/fall/communication-timeline.ts:52` (`select('created_at, lead_id')`, Timeline-Anker) · `lib/faelle/kb-assignment.ts:195` (`order`).

### Writer (`faelle.updated_at`, ~12-18 Sites — drop-vs-MOVE-Analyse je Site + faelle-vs-gutachter_termine prüfen)
- `app/kunde/faelle/[id]/actions.ts:214,219` · `app/kunde/faelle/[id]/_actions/besichtigungsort.ts:73`
- `app/faelle/[id]/_actions/core.ts:76,112` · `…/_actions/dokumente.ts:311` · `…/_actions/briefing.ts:84` (**READ** von faelle.updated_at)
- `app/gutachter/fall/[id]/actions.ts:575` · `app/flow/[token]/actions.ts:1201`
- `lib/faelle/kb-assignment.ts:72` · `lib/kanzlei/push-mandat.ts:229` · `lib/ai/briefing.ts:144` + `lib/ai/briefing-structured.ts:141`
- `app/api/termin/ablehnen/route.ts:53` · `app/api/twilio/inbound-kb-whatsapp/route.ts:126`
- `lib/actions/termin-verlegung-actions.ts:330` · ⚠️ `lib/actions/termin-actions.ts:209/378/676/851` → **wahrscheinlich `gutachter_termine`, NICHT faelle** (verifizieren, dann ggf. streichen)

### Empfohlene Reihenfolge
`kunde` → `gutachter` → `kanzlei` → `inbound` → `analytics`+`branding` → `updated_at-writer-sweep`. **DANN Part B (DDL) + CMM-61.**

---

## 6 · Part B (DDL) + CMM-61 — NICHT in den Read-Fan-out mischen

- **Part B:** `claims` ADD `marketing_provision`/`marketing_quelle` (+Backfill) + `zahlungsweg` (all-null) + Reader-Sweep der Top-Level-faelle-Finanz-Reads. **DDL → nur via supabase-CLI (Regel 2), `information_schema` live davor.**
- **CMM-61:** `kanzlei_faelle` `kanzlei_provision_*`/`kanzlei_honorar` + Vollmacht-Übergabe (`vollmacht_uebergeben_am` + Doc-Ref). `stripe/webhook:338` latent buggy → `upsertKanzleiFall`.
- Andere Risikoklasse als die reinen Reader-Swaps → erst auf explizites Go.

---

## 7 · Tooling / Env-Lessons (dieser Env)

- **Worktree:** `.claude/worktrees/cmm65-ts` off `origin/staging`; `node_modules` Junction → main, `.env.local` kopiert, `.next` lokal. **Pro PR frischer Branch off `origin/staging`** (Squash-Merges → alte Branch nicht mehr Ancestor).
- **DB-Probe:** node `fetch`/undici **hängt** auf Supabase (IPv6?), supabase-js auch → **`curl -4`** + service-role. `scripts/probe-cmm65-ts.mjs` zeigt das Muster. HTTP **522/Timeout = DB-Pool erschöpft** durch parallele Sessions (transient; einmal retry, dann ist er meist frei).
- **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; `rm -rf .next` davor (EBUSY); Output in eine Log-Datei (KEIN Tail-Pipe / `; echo` → maskiert Exit-Code). **`/gutachter-partner` SSG kann lokal >60s-timeouten** (build-time `sv_leads`-Query am erschöpften Pool) → **unabhängig vom Change**; der CI-`build`-Check (sauberer Pool) ist das echte Gate.
- **Merge:** NICHT die Merge-Session — PR gegen `staging` + berichten. Offener **nicht-Draft** staging-PR mit grünem `build` WIRD vom `sync-watcher` gemergt (e2e-Check bleibt pending = erwartet, gated nur `build`). → erst `gh pr create` wenn fertig.

---

## 8 · Start-Rezept für die nächste Session

```bash
# 1. In den (eingerichteten) Worktree, frischer Branch off staging
cd .claude/worktrees/cmm65-ts
git fetch origin staging --quiet
git checkout -b kitta/cmm65-ts-kunde origin/staging   # Beispiel: kunde-Slice

# 2. Re-Grep der Domain (PFLICHT — diese Liste ist ein Snapshot)
#    Reads:  from('faelle') … created_at  (migriert = claims.created_at)
#    Writer: from('faelle').update({ … updated_at … })

# 3. Pattern 1 anwenden (siehe §2), tsc + voller Build, curl-Count-Probe old==new

# 4. Commit (Audit-Block!) + push + gh pr create --base staging
```

**Verweise:** Memory `project_cmm65_timestamp_sweep.md` (Live-Status) · dieser Doc (§2 Rezept, §5 Breakdown) · Pattern-Precedents in den gemergten PRs #1697/#1702 (+ #1705 cron, sobald merged).
