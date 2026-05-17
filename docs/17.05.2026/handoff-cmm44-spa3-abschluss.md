# Handoff — CMM-44 SP-A3 abgeschlossen (Stand 2026-05-18)

**Master:** CMM-44 (`faelle`-Tabelle wird abgeschafft, `claims` ist SSoT)
**Memory:** [[project_cmm44_spa3_status]], [[project_cmm44_faelle_dekomposition]],
[[project_cmm44_spa2_status]]

---

## 1 · Was SP-A3 erledigt hat

`faelle.fall_nummer` ist abgeschafft. `claims.claim_nummer` (DB-Trigger
`set_claim_nummer` + Sequence) ist die alleinige Aktennummer im gesamten Code.

| PR | Inhalt | Stand |
|---|---|---|
| **#1432** PR1 | `claim_nummer` additiv zu 3 Views (`faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin`); `v_claim_full`/`v_claim_listing` hatten es schon. Migration `20260517171144`. | gemergt staging→main (#1433) |
| **#1435** PR2 | Reader-Sweep ~200 Files `fall_nummer`→`claim_nummer` (4 Cluster) + 3 Generatoren entfernt + Smoke-Lifecycle-Marker auf `claims.fall_typ` + Types-Regen. Reiner Code. | gemergt staging→main (#1436) |
| **#1438** PR3 | 5 Views ohne `f.fall_nummer` neu gebaut, `DROP COLUMN faelle.fall_nummer`, `DROP TRIGGER set_fall_nummer` + `DROP FUNCTION generate_fall_nummer`. Migration `20260517221326`. | gemergt auf staging |

Migrationen via `db query --linked` + `migration repair` appliziert. Verify:
`fall_nummer` weg von `faelle`, `claim_nummer` in allen 5 Views, toter Trigger +
Funktion weg, `git grep fall_nummer src/` = 0.

## 2 · Verifikation

- **CI-Build** grün für PR1, PR2, PR3.
- **Portal-Smoke** (`scripts/smoke-cmm44-spa3.mjs`) nach PR2 **und** nach dem Drop:
  je 13 OK / 5 WARN / 0 HARD-FAIL. Alle WARNs = leere Test-User-Listen, keine
  Regression. Details: `docs/17.05.2026/cmm44-spa3-smoke-postdrop.md`.
- Reihenfolge-Lesson: Trigger `set_fall_nummer` trug `WHEN (new.fall_nummer IS NULL)`
  → column-dependent → muss VOR dem `DROP COLUMN` weg. Vom Dry-Run aufgedeckt.

## 3 · Lose Enden

- **React #418** auf der Admin-Fallakte — vorbestehend (in allen 3 Smoke-Läufen,
  auch Alt-Code), **nicht** SP-A3. Eigenes Ticket wert.
- **PR3 staging→main-Release** noch offen — PR3 ist Migration + Types, kein
  riskanter Code; prod nutzt `fall_nummer` schon nicht mehr (PR2 ist auf main).
- `mandatsnummer` (`filmcheck.ts`-Generator) bleibt — eigene Spalte, war nie
  SP-A3-Scope.

## 4 · Nächster CMM-44-Schritt: SP-B

Aus `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md §4`:
- **SP-B** — 64 CLAIMS-Spalten (claim-globale Eigenschaften, ADD auf `claims`).
- **SP-C** — 33 Parteien-Snapshots → `claim_parties`.
- **SP-G/G2** — Gutachten-Rest → `gutachten` + `gutachter_termine.claim_id`-FK.
- **SP-H/J** — Auftrag-LC + Abrechnungs-Spalten.

Bewährtes Vorgehen (SP-A2 + SP-A3): Live-DB messen → `pg_depend`/`pg_trigger`-Audit
→ Migration in `BEGIN/COMMIT` mit Dry-Run → `db query --linked` + `migration repair`
→ Types-Regen → Portal-Smoke. Reader-Sweep nach Transform-Regelwerk A–F (Spec
`docs/superpowers/specs/2026-05-17-cmm44-spa3-fall-nummer-design.md`).

## 5 · Worktree

`kitta/cmm-44-spa3-fall-nummer` (Spec/Plan-Branch) + die 3 PR-Branches
(`pr1-views`, `pr2-reader-sweep`, `pr3-drop`). Worktree
`.claude/worktrees/cmm-44-spa3-fall-nummer` kann nach PR3-Merge mit
`git worktree remove` aufgeräumt werden.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
