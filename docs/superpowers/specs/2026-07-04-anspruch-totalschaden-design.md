# Design-Spec: Anspruch-Tool — Wirtschaftlicher Totalschaden (Phase 1)

**Datum:** 2026-07-04
**Branch:** `kitta/anspruch-totalschaden` (off staging)
**Verwandt:** #3413 (Foto-Tool), #3536 (Verkettung), Memory `coordination-anspruch-pruefen-tool`

## Problem (live belegt)

Das Anspruch-Foto-Tool (`/embed/anspruch-pruefen`, prod-live) schätzt aktuell **nur Reparaturkosten** und kennt keinen Wiederbeschaffungswert (WBW). Der Live-Prod-Durchlauf (Session `21bde4fe`, 04.07.) mit einem schweren Frontschaden (Airbag-Auslösung, Längsträger, Vorderachse) zeigte **Reparaturkosten 18.000–32.000 €** ohne jeden Totalschaden-Hinweis — obwohl das bei einem Mittelklasse-Wagen EZ 2021 (WBW ~20–30 k) ein klarer **wirtschaftlicher Totalschaden** ist. Das Tool informiert den Kunden damit falsch (er kann keine 32 k Reparatur bekommen, wenn das Auto 25 k wert ist).

## Ziel

Ab Reparatur > 90 % WBW schaltet das Tool in einen Totalschaden-Modus, der **beide Wege transparent** zeigt und großzügig zugunsten des Geschädigten rechnet.

## Aaron-Entscheidungen (Brainstorming 04.07.)

- **WBW-Quelle:** Vision schätzt WBW + Restwert; eine Heuristik (Segment × Alter) plausibilisiert/klemmt Ausreißer (Fallback wenn Vision unsicher).
- **Schwelle:** ab **90 % WBW** in den Totalschaden-Modus (früh warnen).
- **Darstellung:** beide Wege — „Reparieren & behalten" (bis 130 % WBW) UND „Totalschaden abrechnen" (WBW − Restwert), günstigerer markiert.
- **Kalibrierung:** großzügig zugunsten Geschädigter — **Phase 2**.
- **Neue Positionen** (Anwaltskosten, Mietwagen, An-/Abmeldung, Verbringung/UPE) — **Phase 2**.
- **Wertminderung** kommt im **Reparatur-Weg** dazu (bei jungem/neuem Auto — bestehende Regel „jung + Substanz"); im Totalschaden-Weg entfällt sie (Auto wird ersetzt).

## Phasen

**Phase 1 (dieser Spec) — Totalschaden-Kern:**
1. Vision liefert `wiederbeschaffungswert_min/max` + `restwert_min/max`.
2. WBW-Plausibilisierung (`lib/anspruch/wbw.ts`, pure + TDD): Vision-WBW ∩ Heuristik-Korridor.
3. Totalschaden-Logik in `berechneAnspruchsSpanne` (3 Zonen).
4. Darstellung beider Wege im Summary.
5. DB-Config: WBW-Heuristik-Tabelle + Schwellen-Keys.

**Phase 2 (späterer Spec) — Vollständigkeit + Kalibrierung:** Anwaltskosten, Mietwagen, An-/Abmeldung, Verbringung/UPE, großzügiger Vision-Prompt.

## Fachliche Zonen (Reparatur-Mitte vs. WBW-Mitte)

| Zone | Verhältnis | Anzeige |
|---|---|---|
| **A** Reparaturfall | Reparatur < **90 %** WBW | wie heute: Reparaturkosten + Nutzungsausfall + Wertminderung + … |
| **B** Grenzbereich | **90 %–130 %** WBW | **beide Wege**: (1) Reparieren & behalten = Reparaturkosten (bis 130 % WBW gedeckt) + Nutzungsausfall + **Wertminderung** + Auslagen; (2) Totalschaden = WBW − Restwert + Nutzungsausfall (Wiederbeschaffungsdauer) + Auslagen |
| **C** Totalschaden | Reparatur > **130 %** WBW | nur Totalschaden-Weg: WBW − Restwert + Nutzungsausfall + Auslagen (Reparatur-Weg entfällt / nur als Hinweis) |

„Günstiger für den Kunden" wird pro Fall markiert (max der beiden Wege-Summen).

## Architektur / Bausteine

- **`src/app/embed/anspruch-pruefen/actions.ts`** — `VISION_SYSTEM` um zwei Felder erweitern (`wiederbeschaffungswert_min/max`, `restwert_min/max`); `parseVision` validiert sie (fehlen → `null`, dann Heuristik greift). Kalibrierungs-Wortlaut bleibt Phase 1 unverändert (Phase 2).
- **`src/lib/anspruch/types.ts`** — `VisionResult` + WBW/Restwert (optional); `SchaetzInput` + `wbwMin/Max`, `restwertMin/Max`; `AnspruchSpanne` + optionaler `totalschaden`-Block (beide Wege: je `positionen[]` + `summeMin/Max` + `bis130Moeglich`); neue Config-Felder.
- **`src/lib/anspruch/wbw.ts`** (NEU, pure, TDD) — `plausibilisiereWbw(visionWbw, segment, alterJahre, heuristik): { wbwMin, wbwMax, restwertMin, restwertMax, quelle }`. Vision gewinnt im Korridor; Ausreißer geklemmt; kein Vision-WBW → Heuristik.
- **`src/lib/anspruch/positionen.ts`** — `berechneAnspruchsSpanne` erweitern: WBW-Zonen-Weiche; im Grenz-/Totalschaden-Fall den `totalschaden`-Block mit beiden Wegen füllen (Reparatur-Weg inkl. Wertminderung, Totalschaden-Weg = WBW − Restwert + Wiederbeschaffungs-Nutzungsausfall). Zone A bleibt exakt wie heute (keine Regression).
- **`src/app/embed/anspruch-pruefen/_components/AnspruchSummaryStep.tsx`** + **`src/components/shared/AnspruchPositionsListe.tsx`** — im Totalschaden-Fall Hinweis-Block + zwei getrennte Wege-Sektionen, günstigerer markiert. Zone A rendert unverändert.
- **Migration (Regel 2 via Plugin)** — `anspruch_config`-Keys (`totalschaden_schwelle_prozent`=90, `reparatur_grenze_prozent`=130, `wiederbeschaffungsdauer_min/max_tage`); neue Tabelle `wbw_segment_alter` (Segment × Alter-Band → wbw_min/max, restwert-Faktor).

## Datenfluss

Foto → Vision (Reparatur + **WBW + Restwert**) → `plausibilisiereWbw` (Vision ∩ Heuristik) → `berechneAnspruchsSpanne` (Zonen-Weiche) → Summary (1 oder 2 Wege) → Handoff Finder (unverändert).

## Testing (TDD)

- `wbw.ts`: Vision im Korridor → Vision; Ausreißer → geklemmt; kein Vision → Heuristik.
- `positionen.ts`: Zone A unverändert (Regressions-Fixture aus dem Live-Fall ohne WBW); Zone B beide Wege + Wertminderung im Reparatur-Weg; Zone C nur Totalschaden-Weg; Schwellen-Grenzfälle (exakt 90 %, 130 %).

## Offene Implementierungs-Details (im Bau)

- Heuristik-Bänder `wbw_segment_alter` sind illustrativ (wie die bestehenden Rate-Bänder) — vor Live fachlich/legal prüfen.
- Restwert-Schätzung der Vision ist unsicher → Heuristik-Restwert-Faktor (% vom WBW) als Fallback/Klemme.
- Wiederbeschaffungsdauer (Nutzungsausfall im Totalschaden) ≠ Reparaturdauer — eigener Config-Wert (~10–14 Tage).

## Nicht-Ziele (Phase 1)

Keine neuen Positionen (Phase 2), keine Prompt-Kalibrierung (Phase 2), keine Änderung am Verkettungs-CTA (#3536, live).
