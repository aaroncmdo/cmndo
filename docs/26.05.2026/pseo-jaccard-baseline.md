# autounfall.io PSEO — Jaccard Duplicate-Content-Baseline

**Stand:** 2026-05-26 · Script: `autounfall-io/scripts/check-pseo-similarity.mjs`
**Methode:** sichtbarer `<article>`-Text (nach Strip von `<script>`/`<style>`), 3-Wort-Shingles, paarweiser Jaccard über alle 100 PSEO-Seiten (20 Städte × 5 Typen), klassifiziert nach Paar-Typ.

## Gate-Definition (Aaron-Entscheidung 2026-05-26)

Gegated wird **CROSS-City same-type max < 0,40** — das skalierte Near-Duplicate-/Doorway-Muster
(„Auffahrunfall in Stadt X" 20× fast identisch), das das ursprüngliche `noindex` verursacht hat.

- **WITHIN-city** (gleiche Stadt, andere Unfalltypen) wird nur reportet, **nicht** geblockt: verschiedene
  Unfalltypen = legitim unterschiedliche Themen/Rechtslagen; sie teilen naturgemäß den Stadt-Block.
  Ein globaler `max < 0,40` ist mit der gewählten pro-Stadt-Strategie strukturell unmöglich
  (Within-City-Floor ~0,68, weil der Stadt-Block über die 5 Typ-Seiten geteilt wird).

## Baseline VORHER (nur Düsseldorf hat einen Lokal-Block)

| Paar-Typ | max | mean | n |
|---|---|---|---|
| WITHIN-city (Report) | 0,730 | 0,684 | 200 |
| **CROSS-city SAME-type (GATE)** | **0,728** | 0,684 | 950 |
| CROSS-city DIFF-type (Report) | 0,524 | 0,488 | 3800 |

→ **GATE ROT** (0,728 ≥ 0,40). Beweist, dass das Gate Duplikate erkennt.

Top-Kollisionen: identisch-templatisierte Städte ohne Block (z.B. `bonn/* ~ wuppertal/*`,
`bielefeld/* ~ muenster/*`) bei ~0,72.

## Ziel NACHHER (nach Task 8: belegte Lokal-Blöcke für alle 20 Städte)

CROSS-city same-type max < 0,40. Wird nach dem Content in `## NACHHER` ergänzt (Task 9).

<!-- NACHHER (Task 9):
| Paar-Typ | max | mean |
|---|---|---|
| WITHIN-city (Report) | … | … |
| CROSS-city SAME-type (GATE) | … | … |
| CROSS-city DIFF-type (Report) | … | … |
-->
