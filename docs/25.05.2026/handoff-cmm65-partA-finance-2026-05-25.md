# CMM-65 Part A (Timestamp-Sweep) — Finance-Cluster Handoff (2026-05-25)

**Teil von:** CMM-44 (Claim-as-SSoT) · **Slice-Plan:** `docs/25.05.2026/cmm65-timestamps-slice-plan.md` · **Master-Handoff:** `docs/25.05.2026/handoff-session-cmm44-2026-05-25.md` (#1681).

CMM-65 verschiebt die ~91 `faelle.created_at`/`updated_at`-Reader/Writer auf `claims`, damit sie den Phase-6 `DROP TABLE faelle CASCADE` (CMM-49/SP-L) überleben. **Part A** = behavior-preserving Reader/Writer-Sweep (kein DDL). **Part B** = Finanz-ADDs (DDL).

---

## 1 · Diese Session geliefert (3 PRs, Finance+Abrechnung-Cluster)

| PR | Datei | Sites | Status |
|---|---|---|---|
| **#1686** | `src/lib/analytics/finance.ts` | 4 Reader (getUmsatz, getKosten ×2, getCashFlow) | gegen staging, alle Gates grün |
| **#1688** | `src/app/admin/finance/(hub)/page.tsx` | 3 (Q2 head-count, Q5 Chart, monatFaelle) | gegen staging, alle Gates grün |
| **(PR pending)** | `src/lib/abrechnung/{calculate-lead-price,process-case-billing}.ts` | 2 (SV-Kontingent/Lead-Preis) | Branch `kitta/cmm65-ts-abrechnung` (72ae6fe2), build+smoke grün |

Alle drei: behavior-preserving, kein DDL, gegen `staging` (Merge-Watcher `sync-watcher` merged bei grünem Build).

---

## 2 · Das verifizierte Mechanik-Pattern (für die Reststrecke)

**Pattern 1 (IMMER für faelle-Row-Set-Queries):** `from('faelle')` bleibt Basis, `created_at` kommt via `claims:claim_id!inner(created_at)`-Embed, Filter auf `.gte/.lte/.lt('claims.created_at', …)`.
- Precedent im Code: `admin/finance/(hub)/page.tsx:529` (`claims:claim_id!inner(regulierungs_betrag)`), `twilio/inbound-kb-whatsapp:83`.
- **Funktioniert auch mit `{ count:'exact', head:true }`** (head-count) — verifiziert.
- Bei Select+Client-Use: Embed wieder flachziehen, z.B. `.map(f => ({ created_at: (Array.isArray(f.claims)?f.claims[0]:f.claims)?.created_at }))`.

**Pattern 2 (base-switch `from('faelle')`→`from('claims')`) ist VERBOTEN für faelle-Row-Set-Queries.** Per Smoke gefunden: **faelle ⊊ claims** (live: 53 faelle vs **54** claims — ≥1 Claim ohne faelle). Ein base-switch ZÄHLT die claim-only-Row mit (53→54) = nicht value-neutral. `from('claims')` nur, wenn die Query ohnehin claim-scoped ist (`.in('id', claimIds)`).

**Empirisch bewiesen (live prod, curl):** `faelle.claim_id IS NULL`=0 (auch NOT NULL in types ⇒ `!inner` verlustfrei); `faelle.created_at IS NULL`=0; `claims.created_at IS NULL`=0; alle 53 faelle + 54 claims liegen im Mai 2026. Data-Layer-Smoke old(`faelle.created_at`) vs new(`claims.created_at !inner`) identisch an allen Boundaries.

---

## 3 · Reststrecke CMM-65 (priorisiert)

1. **prozess (`app/faelle/_actions/prozess.ts`, `updated_at` ×4)** = **WRITER-Fall, KEIN Reader-Swap.** Prüfen: pflegt ein faelle↔claims-Sync-Trigger `claims.updated_at` ohnehin? → wenn ja, den `faelle.updated_at`-Write droppen; sonst auf den korrespondierenden claims-Write ziehen. (faelle.updated_at-Writes sterben mit dem DROP.)
2. **admin/dispatch-Reads** + **cron** (`created_at` order/filter) — Pattern 1.
3. **kunde** — teils schon via CMM-63.
4. **Re-grep pro PR Pflicht** (§V.TS ist eine stale ~30er-Stichprobe). `lib/abrechnung/reissue-abrechnung.ts` liest die View `v_faelle_mit_aktuellem_termin` → CMM-66, KEIN Code-Change.
5. **Danach Part B (DDL):** `claims` ADD `marketing_provision`/`marketing_quelle` (+Backfill) + `zahlungsweg` (all-null) + Reader-Sweep der Top-Level-faelle-Finanz-Reads. (Migration nur via supabase-CLI, Regel 2; `information_schema` live davor.)
6. **CMM-61** (kanzlei_faelle): `kanzlei_provision_*`/`kanzlei_honorar` + Vollmacht-Übergabe (`vollmacht_uebergeben_am`+Doc-Ref). `stripe/webhook:338` latent buggy → `upsertKanzleiFall`.

---

## 4 · Aufsetz-Rezept / Tooling-Lessons (dieser Env)

- **Worktree** `.claude/worktrees/cmm65-ts` off `origin/staging`; `node_modules` als **Junction** → main, `.env.local` kopiert, `.next` lokal. Pro PR frischer Branch off `origin/staging` (Squash-Merges → alte Branch nicht mehr Ancestor).
- **DB-Probe:** node `fetch`/undici **hängt** auf Supabase (IPv6?), supabase-js auch → **`curl -4` + service-role**. `scripts/probe-cmm65-ts.mjs` (untracked) zeigt das Muster. **HTTP 522 = DB-Pool erschöpft** durch parallele Sessions (Aaron-Projekt-Restart hat's geräumt).
- **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; `rm -rf .next` davor gegen EBUSY; kein `; echo`/Tail-Pipe (maskiert Exit-Code).
- **Merge:** NICHT Merge-Session — PR gegen `staging` + berichten; offener nicht-Draft staging-PR WIRD gemergt → erst öffnen wenn grün.
- **Worktree-Write-Misroute:** Write mit MAIN-Absolutpfad landet im Main-Repo statt Worktree — IMMER Worktree-Pfad nutzen.

**Memory:** `project_cmm65_timestamp_sweep.md` (Voll-Status + Pattern + Lessons).
