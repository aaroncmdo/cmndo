# Handoff — CMM-44 SP-A2, verbleibend: PR2 (Backfill + `DROP COLUMN` ×28)

**Datum:** 2026-05-17 · **Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Spec:** `docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md`
**Plan:** `docs/superpowers/plans/2026-05-17-cmm44-spa2-semantik-duplikate.md`

---

## 1 · Stand

SP-A2 droppt 28 semantik-gleiche Duplikat-Spalten von `faelle` (Gegenstück existiert auf
`claims` unter anderem Namen). Die drei Reader-Rename-PRs sind **fertig + auf `staging`**:

| PR | Cluster | Spalten | Merge-Commit | Smoke |
|---|---|---|---|---|
| #1417 | 1 — Schadenort + Datum | 11 | `88103233` | PASS (5 Portale) |
| #1418 | 2 — Hergang/Art/Typ + Flags | 11 | `a4979970` | PASS (zusammen mit #1419) |
| #1419 | 3 — Rest | 6 | `046fade9` | PASS |

Jeder PR: Implementierung → Spec-Compliance-Review → Code-Quality-Review → CI-`build` grün
→ Squash-Merge nach `staging`. Kein DB-Schema-Change in PR1a/b/c — reiner Code-Sweep, alle
`faelle`-seitigen Reads/Writes der 28 Spalten zeigen jetzt auf die `claims`-Spalte.

**`fall_nummer`** (ursprünglich als 29. Spalte geplant) wurde in der Plan-Inventur als
eigenständiges Vorhaben erkannt (198 Files + Nummern-Generator + teilmigriert) → eigenes
Sub-Projekt **SP-A3**. **`gegner_anzahl_beteiligte`** ist kein echtes Duplikat (≠
`anzahl_beteiligte_total`) → **SP-C** (claim_parties-Count). Beides im Spec §1 dokumentiert.

---

## 2 · Was als nächstes zu tun ist — PR2

PR2 = **eine Migration**: Gap-Backfill + Dependency-Audit + `DROP COLUMN` ×28. Vollständig
spezifiziert in `docs/superpowers/plans/2026-05-17-cmm44-spa2-semantik-duplikate.md`
Abschnitt „PR2" (Tasks 2.1–2.5) — inkl. fertigem Backfill-SQL für alle 28 Paare.

### ⚠ GATE — zwingend vor PR2

PR2 darf erst starten, wenn **PR1a + PR1b + PR1c auf `main`/prod** sind (staging→main-
Release). prod + staging teilen sich eine DB — eine `DROP COLUMN`-Migration, bevor der
Code auf prod liegt, ist ein Prod-Breaker (AAR-599-Muster). Prüfen inhaltsbasiert (Squash-
Release → kein `merge-base`):
```
git diff origin/main origin/staging -- src/lib/faelle/claim-duplicate-columns.ts
```
enthält keine SP-A2-Diffs mehr → PR1a/b/c sind auf main.

### Reihenfolge PR2

1. **Drift-Recheck** — `npx supabase db query --linked --file scripts/probe-cmm44-spa2-divergenz.sql`; alle 28 Paare müssen noch existieren.
2. **Dependency-Audit** — Plan Task 2.1: `pg_depend` (Views/Trigger/Policies) **plus**
   `pg_proc.prosrc`-Text-Sweep. Bekannt: `v_faelle_mit_aktuellem_termin` führt die 11
   Cluster-1-Spalten faelle-basiert → View-Def repointen (Plan PR2 Block 2: aus `claims`
   ziehen, **bestehende Alias-Namen behalten**, damit die ~10 View-Reader unverändert
   bleiben). Weitere Views/Funktionen live ermitteln.
3. **Migration** — Plan Task 2.2: Gap-Backfill (claims gewinnt, nur NULL-Lücken; SQL im
   Plan fertig) → Block 2 View-Repoints → `DROP COLUMN` ×28.
4. **Targeted-Apply** — `db query --linked --file` + `migration repair --status applied`,
   **kein** `db push`.
5. **types regen + Build + Portal-Smoke** — Plan Task 2.4/2.5.

### Offene Punkte für PR2

- **`claims.phase`-CHECK-Constraint** — PR1c stellte `manual-phase-override.ts` auf
  `claims.phase` um. Der 52-Werte-CHECK-Constraint lag bisher auf `faelle.aktuelle_phase`.
  Vor dem `DROP COLUMN aktuelle_phase` prüfen, dass `claims.phase` einen gleichwertigen
  Constraint trägt — sonst beim faelle-Drop nachziehen.
- **Vorbestehender Bug (kein SP-A2-Scope, eigener Mini-Fix):** Das Admin-Stammdaten-
  **Schadensdatum**-Feld ist leer, weil `claimStammdatenFallback` in
  `src/app/faelle/[id]/page.tsx:86` `schadentag` nicht mitselektiert (`page.tsx` wurde von
  PR1a nicht angefasst — der Gap stammt aus Commit `269f73d8` vor SP-A2). Fix: `schadentag`
  in den Select + das Fallback-Objekt aufnehmen.

---

## 3 · Smoke-Artefakte

- PR1a-Smoke: `scripts/smoke-cmm44-spa2-pr1a.mjs` + `docs/17.05.2026/cmm44-spa2-smoke-pr1a.md`
  (Commit `69a63db6` auf Branch `kitta/cmm-44-sp-a2-semantik-duplikate`).
- PR1b+c-Smoke: `scripts/smoke-cmm44-spa2-pr1bc.mjs` + `docs/17.05.2026/cmm44-spa2-smoke-pr1bc.md`
  (Commit `4cbd225f` auf Branch `kitta/cmm-44-spa2-pr1c-rest`).
- Divergenz-Probe: `scripts/probe-cmm44-spa2-divergenz.sql` (auf staging via #1417).

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
