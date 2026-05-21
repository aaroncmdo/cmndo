# CMM-44 SP-D — Portal-Smoke (nach Code-Sweep + View-Repoint), 2026-05-21

**Target:** `app.staging.claimondo.de` (Basic-Auth, Test-User). **Script:** `scripts/smoke-cmm44-spd.mjs`.
**Stand:** PR1 #1526 + View-Repoint #1528 + Code-Sweep #1529 alle auf staging gemergt.

## Ergebnis: 5 OK / 1 HARD (Befund: pre-existing, kein SP-D-Bezug)

| Surface | Status | Befund |
|---|---|---|
| DB `gutachter_termine` SP-D-Daten | OK | aktuelle Termine mit besichtigungsort=1, nachbesichtigung_status=6 (Backfill auf gt aktiv) |
| SV `/gutachter/kalender` | OK | rendert (Wochenansicht, OHNE-TERMIN-Liste) |
| SV `/gutachter/heute` | OK | rendert (Tagesvorbereitung, Tagesroute-Map); besichtigungsort-Batch-Read aus gt laeuft fehlerfrei (0 Termine heute → leere Route, kein Crash) |
| Dispatch `/dispatch` | OK | → /dispatch/dashboard |
| Dispatch Fallakte `/faelle/[id]` | **HARD→benign** | Seite rendert **vollstaendig + korrekt** (Phasen, SV-Briefing, Kundendaten, Termin vereinbart, Kommend/Vergangen). `React #418` = **pre-existing Hydration-Recovery**, identisch zu SP-G2-Baseline (die SP-D vorausging) → **nicht SP-D-verursacht**. Screenshot bestaetigt gesunde UI. |
| Kunde `/kunde` | OK | Dashboard rendert |

## Bewertung
Alle SP-D-relevanten Oberflaechen gesund nach Reader/Writer-Sweep + View-Repoint. Der besichtigungsort-Read (`/gutachter/heute` Batch aus gutachter_termine) + die Fallakte (nachbesichtigung/Timeline/besichtigungsort) rendern fehlerfrei. Das einzige HARD ist der bekannte, harmlose React-#418-Hydration-Hinweis auf der Fallakte (Seite rendert voll — per Screenshot bestaetigt, [[feedback_smoke_screenshot_pflicht]]), bereits auf der SP-G2-Baseline vorhanden, also pre-existing.
