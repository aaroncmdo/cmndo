# Kunde-Fallakte: Werkstatt-Finder auch bei fiktiver Abrechnung (Gate-Drift-Fix)

**Datum:** 2026-07-08 · **Branch:** `kitta/kunde-werkstatt-finder-fiktiv-gate` (off staging) · **Status:** Design approved (Aaron 08.07.), Impl folgt.

## Problem
Aaron 08.07.: „Der Kunde kann keine Werkstatt auswählen (falls keine hinterlegt). Wenn eine hinterlegt ist → Profil anzeigen. Bei fiktiver Abrechnung trotzdem Werkstatt anzeigen bzw. wenn keine → vermitteln."

Die gesamte Kunde↔Werkstatt-Vermittlung ist bereits gebaut + prod-live (4 SP von cec48090/1069c2a2: `FlowWerkstattStep`, `WerkstattCard`, `WerkstattFinderCard`, `FiktiveAbrechnungCard`, `brauchtWerkstattVermittlung`). **Einzige Lücke = Gate-Drift:** `src/app/kunde/faelle/[id]/page.tsx:961` rendert den `WerkstattFinderCard` (Auswahl/Vermittlung) mit einem LOKALEN Check `claimExtra?.reparaturwunsch === 'reparatur'` — der `'fiktiv'` (+ `'unentschieden'`/`null`) ausblendet. Das ist ein Duplikat des kanonischen Gates `brauchtWerkstattVermittlung` (aus `src/lib/werkstatt/vermittlung-core.ts`), das SP4d (#3605) längst für `'fiktiv'` erweitert hat. Der lokale Check zog SP4d nie nach → bei fiktiver Abrechnung ohne Werkstatt sieht der Kunde keinen Finder.

Die Profil-Anzeige (`WerkstattCard`, Zeile 952 `{werkstattData && …}`) ist NICHT vom `reparaturwunsch` abhängig und läuft schon für alle Intents mit Werkstatt.

## Fix
Den lokalen Check durch den kanonischen `brauchtWerkstattVermittlung(row)` ersetzen. Der prüft `(reparaturwunsch ∈ {reparatur,fiktiv}) && reparatur_werkstatt_id==null && werkstatt_id==null && (reparatur_vermittlung_status ?? 'offen')==='offen'` — also stärker + korrekter als der lokale Check (deckt auch Inbound-QR + Status ab), inkl. fiktiv.

## Implementierung (`src/app/kunde/faelle/[id]/page.tsx`, nur dieses File)
1. Import: `import { brauchtWerkstattVermittlung } from '@/lib/werkstatt/vermittlung-core'` (pure, client-safe).
2. `claimExtra`-Typ: `werkstatt_id: string | null` + `reparatur_vermittlung_status: string | null` ergänzen.
3. claims-`.select(...)`: `werkstatt_id, reparatur_vermittlung_status` mitfetchen.
4. `claimExtra`-Population: die 2 Felder mappen.
5. Render-Gate (Zeile 961): `{!reparaturWerkstattId && claimExtra?.reparaturwunsch === 'reparatur' && (` → `{claimExtra && brauchtWerkstattVermittlung(claimExtra) && (` (der Gate subsumiert die `reparatur_werkstatt_id`-Prüfung → `!reparaturWerkstattId` entfällt; ungenutzte `reparaturWerkstattId`-Variable ggf. bereinigen).

Kein DDL. `vermittlung-core.ts` nur importiert (nicht editiert).

## Anforderungs-Mapping
| Aaron | Abdeckung |
|---|---|
| (1) keine Werkstatt → auswählen | Gate-Fix (fiktiv/etc.) ✓ |
| (2) hinterlegt → Profil | `WerkstattCard` läuft schon (intent-agnostisch) ✓ |
| (3) fiktiv → trotzdem Werkstatt | mit WS: `WerkstattCard`; ohne: Finder (Fix) ✓ |
| (4) keine → vermitteln | `WerkstattFinderCard` → `assignReparaturWerkstatt` ✓ |

## Test/Verify
`brauchtWerkstattVermittlung` ist bereits unit-getestet (`vermittlung-core.test.ts`, inkl. fiktiv-Case, SP4d). Der Page-Render ist Server-Component → kein neuer Unit-Test; Absicherung via CI-`build` + **Prod-Smoke**: Kunde-Fallakte eines `reparaturwunsch='fiktiv'`-Claims OHNE Werkstatt → `WerkstattFinderCard` sichtbar; mit Werkstatt → `WerkstattCard`.

## Koordination
`page.tsx` = SP4a-Fläche (cec48090, inaktiv). Aktive WS-Sessions (`kva-erstellen`/`rollen-zeilen`/`filter-ui`) fassen das Werkstatt-PORTAL an, nicht die Kunde-Fallakte → kein Overlap. Nur additiver Import + Gate-Swap, kein Kern-File-Touch.
