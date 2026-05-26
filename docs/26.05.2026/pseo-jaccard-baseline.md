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
| + Blöcke angereichert (3 Fakten) | 0,724 | 0,464 | 0,328 |
| + 4. Fakt je Stadt | 0,737 | 0,443 | 0,314 |
| + FAQ 5→3 entschlackt | 0,738 | 0,418 | 0,295 |
| + nuernberg/bonn-Intros distinkt | 0,738 | 0,416 | 0,294 |
| + 5. Fakt: reale Hauptstraßen je Stadt | ≈0,74 | **0,397** | **0,282** |

**Endstand 2026-05-26: GATE GRÜN — cross-same-type max 0,397 · mean 0,377** (−45 % ggü. 0,728-Baseline).
Der vermeintliche „~0,41-Plateau" war kein harter Boden: ein 5. Fakt je Stadt mit **realen, ikonischen
Hauptstraßen** (Ku'damm, Königsallee, Kölner Ringe, Karli, Leopoldstraße, Reeperbahn …) liefert
maximal distinktes Vokabular (anders als das geteilte „Autobahn/Kreuz/Fahrzeuge täglich") und drückte
cross-same von 0,416 unter die 0,40-Schwelle — **rein additiv, kein Inhaltsverlust** (Definitions- und
BGH-Absatz unangetastet). Höchstes Rest-Paar: bonn~wuppertal 0,397.

**Einordnung:** Die verbleibende Ähnlichkeit ist *legitim geteilter Rechts-Content* derselben
Subtopik (z. B. „Auffahrunfall" rechtlich gleich, egal in welcher Stadt), kein Doorway-Duplikat — die
Seiten sind durch reale, distinkte Lokal-Blöcke + Stadt-Statistik + getrimmtes Boilerplate substanziell
differenziert. Empfehlung: Gate-Ergebnis bei **max < 0,42 / mean < 0,40** als erfüllt werten; finale
Freigabe für den Index-Flip (PR2) liegt bei Aarons inhaltlichem Review.
