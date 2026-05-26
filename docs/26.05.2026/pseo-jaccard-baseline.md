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

## Progression (Task 8 + Boilerplate-Trim)

| Schritt | WITHIN max | CROSS-same max (GATE) | CROSS-diff max (Floor) |
|---|---|---|---|
| Baseline (nur Düsseldorf) | 0,730 | 0,728 | 0,407 |
| 20 Blöcke (erste Fassung) | 0,745 | 0,554 | 0,407 |
| + Boilerplate-Trim | 0,716 | 0,512 | 0,357 |
| + Blöcke angereichert (3 Fakten) | 0,724 | **0,464** | **0,328** |

**Stand 2026-05-26:** cross-same-type **0,464** (−36 % ggü. Baseline). Der Floor sank durch das
Boilerplate-Trimmen auf 0,328 — d.h. `< 0,40` ist jetzt strukturell erreichbar (lag bei der ersten
Messung noch UNTER dem 0,407-Floor). Der Rest über dem Floor (~0,14) ist der je Unfalltyp geteilte
Rechts-Content (Definition + BGH + 5 FAQ), gleich über alle Städte. Letzter Schritt zu `< 0,40`:
entweder weitere additive Block-Anreicherung (~+30 % Unique-Content, laut Modell ausreichend) oder
Reduktion des geteilten Typ-Contents (z.B. FAQ 5→3).
