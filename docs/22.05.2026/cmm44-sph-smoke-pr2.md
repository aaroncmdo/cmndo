# CMM-44 SP-H PR2 — Portal-Smoke (nach staging-Merge)

**Datum:** 2026-05-22
**PR:** #1537 (gemergt staging, squash `f9381d23`)
**Script:** `scripts/smoke-cmm44-sph.mjs` · **Screenshots:** `docs/22.05.2026/cmm44-sph-smoke/`
**Ziel:** app.staging.claimondo.de (Basic-Auth + Test-User je Rolle, `Test1234!`)

## Ergebnis: **0 SP-H-Regressionen.** (HARD=3, SOFT=1, OK=10 — alle HARD/SOFT non-SP-H, siehe Triage.)

DB-Sanity: `auftraege` traegt die 18 SP-H-Spalten (Read grün). Test-Auftrag `bbbb3333…034`:
ts_status=`nicht-angefordert`, filmcheck_ok=false, storniert_am=null, sv_briefing=null.

## Verifizierte SP-H-Oberflaechen (rendern korrekt)
| Surface | Portal | SP-H-Bezug | Ergebnis |
|---|---|---|---|
| `/gutachter/abrechnung` | SV | TS-Sektion = View-Switch `v_faelle_mit_aktuellem_termin` | ✓ rendert (KPIs, Paket-Auslastung, Abgerechnete Fälle) — kein Crash |
| `/faelle/[id]` | Admin | SV-Briefing-Sektion + „Phase ohne Fortschritt"-Blocker (`blocker-detection` liest technische_stellungnahme_status via auftraege-Embed) | ✓ rendert vollstaendig (SV-Briefing + TS-Blocker sichtbar) |
| `/faelle/[id]` | KB | dito | ✓ sauber (200, kein Fehler) |
| `/faelle/[id]` | Dispatch | SV-Briefing-Sektion | ✓ rendert vollstaendig (Retry nach transientem Chunk-Fehler) |
| `/gutachter/auftraege`, `/gutachter/heute` | SV | sv_briefing-Batch-Reads | ✓ rendern |
| `/`, `/dispatch`, `/kunde` | Public/Dispatch/Kunde | Sanity | ✓ 200 |

## Triage der HARD/SOFT-Flags — alle NICHT SP-H
1. **SOFT — `/gutachter/auftraege/[id]` 404:** Diese Route **existiert nicht** (`src/app/gutachter/auftraege/` hat nur `page.tsx`, kein `[id]/`). Test-Pfad-Fehler im Smoke-Script, kein SP-H-Problem. Auftrag-Detail laeuft ueber die Fallakte.
2. **HARD — `/gutachter/feldmodus` React #310:** Server-Redirect auf `/gutachter/heute?info=Keine+aktive+Tages-Session` (Test-SV hat keine aktive Tages-Session). #310 = bekanntes Redirect-Stub-Artefakt (`feedback_rsc_redirect_stubs`). Seite rendert (Karte sichtbar). SP-H-Edits an feldmodus waren server-seitige Fetches, keine React-Hooks → nicht ursaechlich.
3. **HARD — admin `/faelle/[id]` React #418:** Pre-existing benigne Hydration-Recovery (`handoff-2026-05-21` §4 Punkt 6, auch in SP-D/SP-G2-Baseline). Seite rendert **vollstaendig** inkl. SV-Briefing + TS-Blocker. Auf jedem Fallakte-Smoke vorhanden.
4. **HARD — dispatch `/faelle/[id]` HTTP 500:** ChunkLoadError (`Failed to load chunk …0yf-6td6-v4r0.js`) — App-Root-Error-Boundary faengt einen stale JS-Chunk waehrend des staging-Redeploys nach #1537-Merge. **Retry = nav 200, kein 500**, Seite rendert vollstaendig (nur das benigne #418). Transientes Deploy-Timing-Artefakt. Beleg: KB traf direkt danach dieselbe `/faelle/[id]`-Route sauber (200 OK).
5. **`/gutachter/fall/[id]` „Seite nicht gefunden":** Test-SV kann diesen Fall nicht ueber die Gutachter-Fall-Route sehen (Test-Daten-/Sichtbarkeits-Luecke, keine Zuweisung). Saubere Empty-State, kein Crash. Der SV-Briefing-Reader dieser Route wurde stattdessen via Admin/KB/Dispatch-Fallakte abgedeckt (gleiche Sektion).

## Fazit
Keine SP-H-bedingte Regression. Die zentralen SP-H-Reader (TS-View-Switch in der SV-Abrechnung, SV-Briefing + technische_stellungnahme_status-Embed in der Fallakte über alle internen Portale) rendern korrekt. Pre-existing #418 + Redirect-#310 + transienter ChunkLoadError sind Baseline/Umfeld, nicht dieser PR.

**Naechste Schritte:** Task 6 (PR3 idempotenter COALESCE-Catch-up) nach #1537-main-Release; Task 7 Abschluss (Phase-1-Mapping + Handoff).
