# Handoff — Nächste Session (CMM-44 Claim-as-SSoT, Stand 2026-05-17 Ende)

**Master:** CMM-44 (`faelle`-Tabelle wird abgeschafft, `claims` ist SSoT)
**Memory zuerst lesen:** [[project_cmm44_spa2_status]], [[project_cmm44_faelle_dekomposition]], [[feedback_information_schema_check]]

---

## 1 · Was diese Session erledigt hat

**SP-A2 PR1-Strecke komplett** — 28 semantik-gleiche Duplikat-Spalten von `faelle`-Reads/Writes
auf die `claims`-Spalte umgestellt (Reader-Rename, kein DB-Schema-Change):

| PR | Cluster | Spalten | Merge-Commit |
|---|---|---|---|
| #1417 | 1 — Schadenort + Datum | 11 | `88103233` |
| #1418 | 2 — Hergang/Art/Typ + Flags | 11 | `a4979970` |
| #1419 | 3 — Rest | 6 | `046fade9` |
| #1421 | SP-A2 PR2-Handoff (Doku) | — | gemergt |

Alle auf `staging`. Beide Portal-Smokes (PR1a / PR1b+c) gegen `app.staging.claimondo.de`: **PASS**.
Jeder PR lief: Implementer-Subagent → Spec-Review → Code-Quality-Review → CI-`build` grün → Squash-Merge.

Spec: `docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md`
Plan: `docs/superpowers/plans/2026-05-17-cmm44-spa2-semantik-duplikate.md`

---

## 2 · Direkt-Anschluss: SP-A2 PR2

**PR2 = eine Migration** (Gap-Backfill + Dependency-Audit + `DROP COLUMN` ×28). Vollständig
spezifiziert im Plan oben, Abschnitt „PR2" (Tasks 2.1–2.5, inkl. fertigem Backfill-SQL).
Detail-Handoff: `docs/17.05.2026/handoff-2026-05-17-cmm44-spa2-pr2.md`.

**⚠ GATE:** PR2 darf erst starten, wenn **PR1a/b/c auf `main`/prod** sind (staging→main-Release).
prod+staging teilen eine DB → `DROP COLUMN` vor dem Code-Release = Prod-Breaker (AAR-599-Muster).
Inhaltsbasiert prüfen (Squash-Release → kein `merge-base`):
`git diff origin/main origin/staging -- src/lib/faelle/claim-duplicate-columns.ts` → leer = auf main.

PR2-Watch-outs:
- `claims.phase`-CHECK-Constraint vor `DROP COLUMN aktuelle_phase` prüfen (52-Werte-Constraint lag auf `faelle`).
- `v_faelle_mit_aktuellem_termin` in PR2 auf `claims` repointen, Alias-Namen behalten (Plan PR2 Block 2).
- Vor der Migration `information_schema` live nachmessen (Fremd-Drift, `scripts/probe-cmm44-spa2-divergenz.sql`).

---

## 3 · Danach: die restliche CMM-44-Strecke

Aus `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` §4 — abhängigkeitsarme Kandidaten:

- **SP-A3 (neu)** — `fall_nummer` → `claims.claim_nummer`. In dieser Session aus SP-A2
  ausgegliedert: 198 Files + Nummern-Generator (`admin/faelle/anlegen/actions.ts` baut
  `CLM-${datum}-${seq}`) + teilmigriert. Eigener Brainstorm→Spec→Plan-Zyklus — es ist
  „Legacy-Fallnummern-Schema abschaffen", nicht ein Reader-Rename.
- **SP-B** — 64 CLAIMS-Spalten (claim-globale Eigenschaften, ADD auf claims).
- **SP-C** — 33 Parteien-Snapshots → `claim_parties`. Enthält auch
  `gegner_anzahl_beteiligte` (in dieser Session als kein echtes DUP erkannt → Count über
  `claim_parties`, voraussichtlich ersatzlos droppen).
- **SP-G** — 19 Gutachten-Rest-Spalten → `gutachten`.
- **SP-G2** — `gutachter_termine.claim_id`-FK (entsperrt SP-D).
- **SP-H** — 18 Auftrag-LC-Spalten → `auftraege`. **SP-J** — 12 Abrechnungs-Spalten.

Bewährter Workflow (SP-A2 lief sauber damit): Live-DB messen → brainstorming-Skill →
writing-plans-Skill → subagent-driven-development (Implementer + 2-stufiges Review je Task).

---

## 4 · Lose Enden (klein, kein CMM-44-Scope)

- **Admin-Stammdaten-Schadensdatum-Feld leer** — `claimStammdatenFallback` in
  `src/app/faelle/[id]/page.tsx:86` selektiert kein `schadentag`. Vorbestehender Bug
  (Commit `269f73d8`, vor SP-A2). Mini-Fix: `schadentag` in Select + Fallback-Objekt.

---

## 5 · Worktrees / Branches dieser Session

Branches `kitta/cmm-44-sp-a2-semantik-duplikate`, `kitta/cmm-44-spa2-pr1b-hergang-flags`,
`kitta/cmm-44-spa2-pr1c-rest` sind gemergt — Worktrees unter `.claude/worktrees/` können mit
`git worktree remove` aufgeräumt werden. Smoke-Artefakte: `scripts/smoke-cmm44-spa2-*.mjs`,
`docs/17.05.2026/cmm44-spa2-smoke-*`.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
