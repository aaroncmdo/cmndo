# CMM-44 MP-8c — id-Assumption-Fixes (claims.id ≠ faelle.id)

**Datum:** 2026-05-30
**Status:** Spec — zur Abstimmung
**Folge-Ticket aus:** MP-8b (PR #2020, gemerged 29.05.) + Audit-Doc `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` §2
**Branch:** `kitta/cmm44-mp8c-id-assumption-fixes` (Worktree, von staging)
**Erwartete Größe:** 1 PR, 1-2 Tage, **5 Files** (3 Code-Fixes + 2 Kommentar-Korrekturen)

---

## 1 · Goal

Drei stille Prod-Korrektheits-Bugs schließen, die MP-8b in der View-Definition (`v_claim_phase`) gefixt hat, aber in den Callern hinterlassen wurden. Plus zwei stale Kommentare entfernen, die künftige Sessions in dieselbe Falle locken.

**Symptom:** Admin-Hub-Kanban + Kanzlei-Mandate + Kanzlei-Kanban gruppieren seit MP-6c (28.05.) **stumm falsch**. Für ~73 von 74 Karten ist `main_phase = null` → Render-Guards werfen alles in den `erfassung`-Fallback. Niemand merkt es, weil "irgendwas" angezeigt wird.

**Root Cause:** Die View `v_claim_phase` ist seit MP-8b claims-zentrisch (key = `claims.id`). Die 3 Caller übergeben aber weiter `faelle.id` an `.in('claim_id', …)`. Da `claims.id ≠ faelle.id` für alle existierenden Fälle, matcht der Lookup nie.

## 2 · Invariante (verbindlich, MP-8b-Lesson)

```
claims.id ≠ faelle.id   (hart, für alle existierenden Fälle bewiesen 29.05.)
faelle.claim_id → claims.id   (echter Link, 1:1, aber NICHT id-gleich)
```

Jeder Code-Pfad, der annimmt "claim_id == fall_id" oder "faelle.id als claims.id verwendet", ist ein Bug — auch wenn er nicht crasht.

## 3 · Konkrete Befunde (aus Audit-Doc §2, im Worktree verifiziert)

### Fix 1 — `src/app/admin/faelle/(hub)/page.tsx` (CRITICAL)

**Verifizierte Bug-Stellen (Stand staging-Tip):**

| Zeile | Code | Problem |
|---|---|---|
| 86 | `const fallIds = rows.map((r) => r.fall_id).filter(Boolean) as string[]` | sammelt `faelle.id` |
| 150-155 | `.from('v_claim_phase').select('claim_id, main_phase, sub_phase').in('claim_id', fallIds)` | übergibt `faelle.id` an claims-keyed View |
| 161 | `// CMM-44 MP-4c: v_claim_phase → main_phase/sub_phase pro Claim (claim_id == fall_id).` | stale Annahme |
| 163 | `phaseMap = new Map(((phaseRows ?? []) as PhaseRow[]).map((p) => [p.claim_id, p]))` | Map mit claims.id als Key |
| 283 | `// CMM-44 MP-4c: abgeleitete 4-Phase + Substate (v_claim_phase, claim_id == fall_id).` | stale Annahme |
| 284-285 | `phaseMap.get(fid)?.main_phase ?? null` (fid = `r.fall_id`) | Lookup mit falschem Key → immer null |

**Fix-Strategie (Empfehlung A — Reduce):** `v_claim_listing` (`r.claims`-Embed bzw. die Listing-Row selber) liefert `main_phase` und `sub_phase` **bereits in der ListingRow mit** (siehe `src/lib/claims/types.ts:49-50`). Den separaten `v_claim_phase`-Read komplett streichen — 1 Round-Trip weniger + sofort claim-keyed via View-Definition.

**Strategie B — Migrate (Fallback wenn A nicht greift):** `claim_id` aus den Listing-Rows sammeln statt `fall_id`, dann `phaseMap.get(r.claim_id)`.

**Entscheidung:** im Plan-Schritt anhand der `listingQuery`-Select-Definition (Zeile 1-70).

### Fix 2 — `src/app/kanzlei/mandate/page.tsx` (CRITICAL)

| Zeile | Code | Problem |
|---|---|---|
| 41-46 | `from('faelle').select('id, status, ..., claims:claim_id!inner(claim_nummer, ...)')` | lädt faelle-Rows mit claims-Embed |
| 58 | `const mandatIds = faelle.map((f) => f.id as string)` | sammelt `faelle.id` |
| 60-62 | `.from('v_claim_phase').select(...).in('claim_id', mandatIds)` | übergibt `faelle.id` → 0 matches |
| 63 | `phaseMap = new Map((phaseRows ?? []).map((p) => [p.claim_id, p]))` | claims.id-keyed |
| (späterer Render) | `phaseMap.get(f.id as string)?.main_phase` | Lookup mit falschem Key |

**Fix:** `claim_id` aus dem `claims:claim_id`-Embed sammeln (es ist eh schon `!inner`-joined da). Pattern:

```ts
const mandatClaimIds = faelle
  .map((f) => (Array.isArray(f.claims) ? f.claims[0] : f.claims)?.claim_id)
  .filter(Boolean) as string[]
// dann .in('claim_id', mandatClaimIds) und im Render phaseMap.get(claimId)
```

**Wiederverwendung:** Audit nennt `getClaimPhaseMap(claimIds)` aus `lib/makler/queries.ts` als bereits etabliertes Pattern → falls die Helper-Schicht passt, nutzen. Sonst inline (analog Fix 1).

### Fix 3 — `src/app/kanzlei/kanban/page.tsx` (CRITICAL)

Strukturell identisch zu Fix 2 (`from('faelle').select(...)` → `mandatIds = faelle.map(f.id)` → `.in('claim_id', mandatIds)` → `phaseMap.get(f.id)`). Selbe Fix-Strategie wie #2. Die Pages teilen sich die `faelle`-Query weitgehend (Diff ~3 Zeilen), Fix ist im Plan parallelisierbar.

**Stale Header-Kommentar Zeile 10:** `// Phasen-Zuordnung: main_phase/sub_phase kommen aus v_claim_phase (abgeleitet, claim_id == faelle.id).` — die ID-Gleichheits-Behauptung am Ende muss raus.

### Fix 4 — `src/lib/claims/get-claim-for-role.ts:184-187` (LOW, stale Kommentar)

```ts
// Übergangs-Helper: nimmt entweder eine `claims.id` oder eine `faelle.id`
// und liefert die zugehörige `claims.id` zurück. Wird benötigt, solange
// alte Routen `/faelle/[id]` mit `faelle.id` operieren. Nach Phase 6 ist
// `faelle.id = claims.id` (1:1 nach Cleanup) und dieser Helper kann weg.
```

**Problem:** Die Behauptung "Nach Phase 6 ist `faelle.id = claims.id`" ist faktisch falsch (Invariante §2). Der Helper bleibt notwendig, solange `/faelle/[id]`-Routen mit `faelle.id` operieren; nach Phase 6 entfällt nur der zweite `faelle.id → claim_id`-Fallback-Zweig, nicht die Aufgabe der Helper-Funktion. Code-Logik selbst ist korrekt.

**Fix:** Kommentar umformulieren — keine ID-Gleichheits-Behauptung, sondern beschreiben was nach Phase 6 entfällt (der faelle-Fallback-Branch).

### Fix 5 — `src/lib/claims/types.ts:30-31` (LOW, stale Kommentar)

```ts
export type ClaimFull = Claim & {
  // Assignment-Felder aus faelle (parallele Row, gleiche id)
```

**Problem:** "parallele Row, gleiche id" — selbe stale Annahme. Felder kommen via View `v_claim_full` aus dem claim-zentrischen Aggregat (JOIN über `f.claim_id = c.id`), nicht aus einer ID-gleichen faelle-Row.

**Fix:** Kommentar umformulieren — "Assignment-Felder, die v_claim_full per JOIN auf faelle.claim_id mitliefert" (oder analog). Type-Definition selbst bleibt.

## 4 · Out of Scope

Diese Spec adressiert NUR die 3 still kaputten Caller + 2 stale Kommentare. Explizit NICHT enthalten:

- **View-Repointing** (`v_claim_full`, `v_claim_listing`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`, `v_claim_timeline`) → Phase 4
- **Andere `.from('faelle')` Reader/Writer** (~414 verbleibende) → Phase 4 / 5
- **Writer-Migration** (insert-Inversion, splitOrKeepFaelleUpdate retire) → Phase 5
- **DB-Live-Cross-Check** (`pg_views`/`pg_trigger`/`pg_constraint`) → Phase-0-Verify, sobald DB wieder oben (siehe Task #6)
- **CMM-44 Re-Scaling-Doc** → explizit von Aaron verworfen (30.05.)

## 5 · Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| `v_claim_listing` liefert `main_phase`/`sub_phase` doch nicht direkt mit (Strategie A für Fix 1 nicht greifbar) | Plan-Schritt prüft Listing-Query (Zeile 1-70). Strategie B (claim_id sammeln) ist Fallback und immer möglich. |
| Andere stille Bugs derselben Klasse nicht in dieser Spec erfasst | Audit-Doc §3 + grep `.in('claim_id', .*fall.*Id` in Plan-Schritt 1 als Safety-Net. Wenn weitere → in dieselbe MP-8c oder eigenes Folge-Ticket entscheiden. |
| Smoke nicht möglich (Staging-DB down) | Visuelle Verifikation post-Merge wenn DB wieder oben; Tests laufen lokal (Vitest mit Mocks). Gate auf Aaron-Smoke nach Deploy. |
| `getClaimPhaseMap(claimIds)`-Helper hat Constraints, die hier nicht passen | Plan prüft Signature; Inline-Read als Fallback (analog admin-Hub). |

## 6 · Test Plan

**Pro Fix einen Test:**

- `src/app/admin/faelle/(hub)/page.test.tsx` (neu, falls nicht existent): Listing-Row mit fall_id ≠ claim_id, phaseMap-Lookup → main_phase muss aus Strategie A (View-Direkt) oder B (claim_id-Map) korrekt geliefert werden. Test fängt: ohne Fix → `main_phase === null`, mit Fix → erwarteter Wert.
- `src/app/kanzlei/mandate/page.test.tsx` (neu): identisches Pattern.
- `src/app/kanzlei/kanban/page.test.tsx` (neu): identisches Pattern.
- Kommentar-Fixes: kein automatisierter Test, manuelle Review.

**Build-Gate (AGENTS.md §7-Point-Audit):** voller `npm run build` (nicht nur `tsc --noEmit`) wegen RSC-Routen.

**Post-Deploy-Smoke (gated):** sobald DB up + Staging-Deploy nach Merge —
1. /admin/faelle: Kanban-Karten zeigen tatsächliche Phasen (nicht alle in `erfassung`)
2. /kanzlei/mandate: Phase-Spalte gefüllt
3. /kanzlei/kanban: Karten in den 4 Spalten verteilt entsprechend Lifecycle

## 7 · Akzeptanzkriterien

1. ✅ Fix 1: admin/faelle hub liefert main_phase/sub_phase via claims.id (nicht faelle.id). Stale Kommentare Z.161 + Z.283 weg.
2. ✅ Fix 2: kanzlei/mandate Phase-Lookup über `f.claims.claim_id`.
3. ✅ Fix 3: kanzlei/kanban Phase-Lookup über `f.claims.claim_id`. Header-Kommentar Z.10 korrigiert.
4. ✅ Fix 4: `get-claim-for-role.ts:184-187` Kommentar ohne ID-Gleichheits-Behauptung.
5. ✅ Fix 5: `claims/types.ts:31` Kommentar ohne ID-Gleichheits-Behauptung.
6. ✅ `npm run build` grün.
7. ✅ Pro Code-Fix ein Vitest-Test, der den Bug reproduziert (rot ohne Fix, grün mit Fix).
8. ✅ Keine weitere `.from('v_claim_phase').in('claim_id', <faelle.id>)`-Stelle im Code (grep-Safety-Net).
9. ✅ PR gegen `staging`, Audit-Block in Commit-Message gemäß AGENTS.md 7-Punkte.

## 8 · Quellen

- Audit-Doc: `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` §2 (id-assumption-Befunde)
- MP-8b Migration: `supabase/migrations/20260529155953_cmm44_mp8b_v_claim_phase_claims_centric.sql` (View claims-zentrisch)
- MP-8b PR: #2020 (`4946cb847`, gemerged 29.05. 19:38Z)
- Etabliertes Pattern: `lib/makler/queries.ts:getClaimPhaseMap` (bereits korrekt claim_id-keyed)
- Invariante (live empirisch verifiziert 29.05.): claims.id ≠ faelle.id, faelle.claim_id → claims.id
