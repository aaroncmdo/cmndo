# J5 — Kasko + Selbstzahler: die Abrechnungsweg-Weiche

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> Die Weiche, die bestimmt, welchen Weg ein Schaden nimmt. Kern-Logik verifiziert: `src/lib/werkstatt/abrechnungsweg.ts`
> (`resolveAbrechnungsweg` / `routeForAbrechnungsweg` / `istWerkstattReparaturWeg`).

**Rollen:** Kunde (beantwortet die Qualifikation) · System (leitet den Weg ab) · SV (nur haftpflicht/kasko-gebunden) · Werkstatt (kasko-frei/selbstzahler) · KB/Admin.
**Vorbedingungen:** ein Lead/Flow mit der Schadens-Qualifikation (Schuldfrage + eigene Versicherung).
**Startpunkt(e):** Flow-Qualifikation (`resolveAbrechnungsweg`) · Schaden-Finder-Weiche (SP-B).

## Ablauf (Soll)

Die **Schuldfrage** + die **Versicherungsfrage** bestimmen den Abrechnungsweg — und der Weg bestimmt, ob die volle
SV-/Regulierungs-Kette läuft (Haftpflicht → J1) oder der reduzierte Reparatur-Stepper (→ J4).

1. **Qualifikation** — Kunde beantwortet: **Schuldfrage** (`gegner` / `eigenverantwortung`) und, bei Eigenverantwortung, ob **über die eigene Versicherung** abgerechnet wird. **Screen:** Quali-Fragen im Flow.
2. **Ableitung** (`resolveAbrechnungsweg`) — deterministisch:
   - `schuldfrage='gegner'` → **haftpflicht** (Gegner-VS reguliert, §249; die VS-Frage ist irrelevant — Gegner dominiert).
   - `eigenverantwortung` + eigene VS → **kasko**.
   - `eigenverantwortung` ohne eigene VS → **selbstzahler**.
   - sonst → `null` → der Flow fragt nach.
3. **Routing** (`routeForAbrechnungsweg`) → setzt `claims.abrechnungsweg` + steuert den weiteren Flow:
   - **haftpflicht** → `kanonisch`: volle Kette (SA-Abtretung, SV/Gutachten/QC, Kanzlei, Regulierung) = **J1**.
   - **kasko** → `kasko_hinweis`: eigene Kasko-VS; bei **freier Werkstattwahl** → Reparatur-Strecke (**J4**), bei gebundener Wahl im Quali disqualifiziert.
   - **selbstzahler** → `selbstzahler_reparatur`: reduzierter Stepper (**J4**), SV/Gutachten/Regulierung/Kanzlei **entfallen**.
4. **Partieller Claim** mit gesetztem `abrechnungsweg` — die Grundlage für alle wegabhängigen Views (`v_claim_*`, `v_werkstatt_auftrag`).

## Varianten / Abzweige

- **Gegner dominiert:** auch mit eigener Vollkasko ist es Haftpflicht, wenn der Gegner schuld ist (§249 — der Kunde soll nicht die eigene VS belasten).
- **Kasko mit freier Werkstattwahl** (`freieWerkstattwahl !== false`) → Werkstatt-Reparatur-Weg (J4). **Kasko-gebunden** (`===false`) → im Quali disqualifiziert, keine Werkstatt-Vermittlung.
- **Selbstzahler** = Reparatur-only (`istReparaturOnly`): kein SV, kein Gutachten, keine Regulierung.
- **Weg offen** → der Flow stellt die fehlende Frage nach, statt zu raten.

## Fehlerfälle und ihr Soll-Verhalten

- **Schuldfrage/VS-Frage offen** → `null`; der Flow fragt nach, **kein** stiller Default auf einen Weg.
- **Weg nachträglich falsch** (z.B. Gegner doch schuld) → der Weg muss korrigierbar sein, ohne den Claim neu anzulegen (Backfill-Präzedenz: Mig `20260708183747` gegner→haftpflicht).
- **Kasko-gebunden ohne freie Wahl** → keine Werkstatt-Strecke; der Kunde wird zur gebundenen VS-Werkstatt geführt (kein Claimondo-Reparaturauftrag).

## ⚠ IST weicht ab (mit Fundort)

1. **Doppelte Ableitungslogik:** `resolveAbrechnungsweg` (Client, `abrechnungsweg.ts`) **und** eine DB-Funktion `derive_abrechnungsweg` (Mig `20260711160327`, gelesen in `v_claim_*`-Views). Zwei Quellen für denselben Wert → Drift-Risiko, wenn nur eine geändert wird. Soll: eine kanonische Quelle (C-Kandidat).
2. **`kasko_hinweis`-Weg unscharf:** die Route heißt „Hinweis" — ob Kasko den **vollen** Claimondo-Service bekommt (SV-Gutachten für die eigene Kasko-VS) oder nur einen Hinweis + Werkstatt-Vermittlung, ist im Flow zu verifizieren (→ Offene Frage 1, überschneidet J4).
3. **`abrechnungsweg` teils gespeichert, teils abgeleitet:** Spalte `claims.abrechnungsweg` (Mig `20260704134805`) **und** derived-Expose in mehreren Views — welche Sicht welche Quelle nutzt, ist heterogen (Views-Historie 0708–0713).

## Offene Fragen an Aaron (max. 5)

1. **Kasko-Umfang:** Bekommt ein Kasko-Claim den vollen SV-Gutachten-Service (für die eigene Kasko-VS) oder nur Werkstatt-Vermittlung + Hinweis?
2. **Weg-Korrektur:** Soll ein einmal gesetzter Abrechnungsweg im Portal/Dispatch korrigierbar sein (mit Neuberechnung der Kette), oder ist er nach Konversion fix?
3. **Doppel-Ableitung:** Client (`abrechnungsweg.ts`) vs. DB (`derive_abrechnungsweg`) auf eine Quelle konsolidieren?
