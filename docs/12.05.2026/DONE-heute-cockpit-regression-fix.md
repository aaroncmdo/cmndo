# Regression-Fix: `/gutachter/heute` Mapbox-Cockpit (12.05.2026)

## Symptom

`/gutachter/heute` zeigt nur noch eine Tageskalender-Rail + zwei KPI-Kästchen + den
Tagesvorbereitungs-Button. **Weg sind:** die Mapbox-Tagesroute (Background-Map mit
Stops, Active-Route gold-solid + Verlegt-Stubs dashed), das Isochrone-Polygon
(„Mein Gebiet"-Overlay, LocalStorage-Toggle), die Glass-Card-Sidebar mit den
`TerminCard`s + Pflichtdoku-Stats, der Pitch-Tween-Übergang in den Feldmodus, und
das „Stop hinzufügen"-Sheet (AAR-872 — private GCal/CalDAV-Termine als Tagesroute-Anker).

## Root Cause

Die Komponenten existieren alle noch, intakt (Stand 11./12.05.):
`TagesrouteMap.tsx` (22,6 KB), `TagesrouteSidebar.tsx` (23,6 KB), `TerminCard.tsx`,
`TagesrouteStartCard.tsx`, `PrivatStopAddSheet.tsx`, `private-stops-actions.ts`,
`GlassPanel` (`@/components/shared/GlassPanel`).

**Aber `src/app/gutachter/heute/HeuteClient.tsx`s `return`-Block wurde überschrieben**
— Commit `8f088031 "merge: staging in kitta/design-system-ios-glass-polish integriert"`
hat den Konflikt in `HeuteClient.tsx` falsch aufgelöst: die *alte* `staging`-Version
des Renders (`8f088031^2` — nur `<TageskalenderRail>` + KPIs) hat das Side-by-Side-Cockpit
aus `8f088031^1` (= `d984e847`, inkl. #559/#561/#568/#617/#624) überschrieben.
`TagesrouteMap`/`TagesrouteSidebar`/`PrivatStopAddSheet` sind in der heutigen Datei
noch *importiert* und die ganze Verkabelung (`stops`-useMemo, `mapHandleRef`,
`privatStops`-State, Handler, Mapbox-Warmup-`useEffect`) ist noch da — aber im JSX
kommt nichts davon mehr vor → tote Imports/Handler, keine TS-Fehler, keine Anzeige.
Der Folge-Commit `693f97f8 "fix(ts-cleanup): TS-Errors nach iOS-Glass-Polish-Sweep"`
hat's nicht bemerkt. `8f088031` ist auf `main` → Production hat die Regression.

## Fix

Den `return`-Block (und die paar dafür nötigen Handler/States, die jetzt „tot"
herumliegen) aus `8f088031^1` wiederherstellen. **Kein Adapter nötig** — die
Component-Props der heutigen `TagesrouteMap`/`TagesrouteSidebar`/`TagesrouteStartCard`/
`PrivatStopAddSheet` matchen 1:1 mit dem, was die gute `HeuteClient.tsx`-Version
übergibt (geprüft: alle Prop-Interfaces + Type-Exports stimmen überein). Praktisch =
`HeuteClient.tsx` durch die `8f088031^1`-Version ersetzen.

Konsequenz: der Import von `./TageskalenderRail` fällt weg → `TageskalenderRail.tsx`
wird verwaist (kein anderer Consumer). Bleibt als Datei liegen (separater knip-Cleanup);
das alte Side-by-Side-Design hatte bewusst keine Rail (Map = Background, Cards floaten).

## Risiko / Koordination

- Parallel arbeitet ein anderer CC an der Frontend-Konsolidierung (`primitives/*` ·
  `shared/*` · `ui/*` · Shells · Layouts · Status-Maps · FilterChip/StatCard/SectionCard/
  forms). **`gutachter/heute/*` ist in keinem Konsolidierungs-Plan und in keinem
  gemergten/offenen Konsolidierungs-Branch angefasst** — kein Overlap.
- Dieser Fix berührt **eine Datei** (`HeuteClient.tsx`), auf einem eigenen Branch off
  `origin/main`. Kein gemeinsamer Working-Tree (der andere CC ist in `claimondo-v2`).
- Eher Argument *für* jetzt: wenn der Konsolidierungs-Sweep den „dead code" in
  `HeuteClient.tsx` aufräumt (knip/lint-Task), fliegen die ungenutzten Imports raus →
  Restore mühsamer. Fixen wir's jetzt, sind sie wieder in Benutzung.

## Schritte

1. Worktree `wt-heute-fix` off `origin/main`, Branch `kitta/aar-fix-heute-cockpit-regression`. ✅
2. `git show 8f088031^1:src/app/gutachter/heute/HeuteClient.tsx` → nach
   `src/app/gutachter/heute/HeuteClient.tsx` schreiben (Cockpit-Render restaurieren).
3. `npm run build` (Route `/gutachter/heute` betroffen → voller Build, nicht nur tsc).
4. Sichtprüfung des Diffs: nur `HeuteClient.tsx`, Imports sinnvoll, kein toter Rest.
5. PR off `main`, 1-File-Diff, Titel macht die Regression klar. Merge auf Aaron-OK.
6. Dieses MD nach `docs/12.05.2026/done/` wenn durch.

## Post-Task-Audit (vor Commit)

- **Build:** `npm run build` grün.
- **UI-Erreichbarkeit:** `/gutachter/heute` rendert wieder das Cockpit; Nav-Eintrag
  „Heute" in `GutachterShell` ist da (unverändert).
- **Redundanz:** keine — Restore einer bestehenden Datei, keine neuen Komponenten.
- **Dead-Code:** `TageskalenderRail.tsx` wird verwaist (notiert, separater Cleanup).
  In `HeuteClient.tsx` selbst sind nach dem Restore alle Imports/Handler wieder benutzt.
- **Spec-Treue:** stellt den Stand vor `8f088031` wieder her (Aaron-Original-Design).
- **Inkonsistenz:** Umlaute ok; `GlassPanel` aus `@/components/shared/GlassPanel`
  (Composite-Layer — Komponenten-Set-Policy-konform).
- **Regression:** `gutachter/heute/page.tsx` übergibt bereits exakt die Props, die
  `HeuteClientProps` erwartet (unverändert seit der guten Version); Feldmodus-Flow
  redirectet nach `/gutachter/heute` — funktioniert weiter; keine anderen Consumer
  von `HeuteClient`.
