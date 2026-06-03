# CMM-44 Phase 4.1 — Verify-Smoke (Staging)

**Datum:** 2026-05-30 · **Target:** app.staging.claimondo.de (liest geteilte DB paizkjajbuxxksdoycev, Views live)
**Migration:** 20260530133959 · **PR:** #2053 · **User:** test-admin@claimondo.de
**Gewaehlter Fall:** claim `5b2757e1-…`, fall `65a7640b-…` (9 Events: 1× phase.geaendert, 3× manuell.notiz, 2× gutachten, + lead/termin)

## Ergebnis — PASS

| Surface | View | Befund | Verdict |
|---|---|---|---|
| `/admin/faelle` Kanban | `v_claim_listing` | 4 Spalten (Erfassung/Begutachtung/Regulierung/Abschluss), Karten verteilt über Erfassung+Begutachtung, Claim-Nummern + Namen + Badges rendern; Phase-Filter-Dropdown da | ✅ sv_id-Switch unsichtbar, fall_id-Karten navigierbar |
| Fallakte `verlauf`-Tab | `v_claim_timeline` | „Bisheriger Verlauf" rendert: **Phase: — → gutachten_erstellt** (phase.geaendert-Branch, claims-nativ), **Briefing generiert / NOTIZ** (manuell.notiz-Branch, claims-nativ), Gutachten final/beauftragt, Termin, Lead-Events | ✅ beide faelle→nativ umgebauten Branches surface korrekt |
| detail_url_path | `v_claim_timeline` | `"Details ansehen"` NICHT vorhanden (report: `detailLinkPresent:false`) — gutachten-Events ohne Link | ✅ gewollte Aenderung (Spec §5), null-guarded, kein Crash |
| pageerror | beide | keine | ✅ |

## Cross-Check zur DB-Parity
UI bestaetigt das autoritative DB-Gate (234 Zeilen / event_typ identisch pre==post): die 2 via JOIN-faelle→native-claim_id umgebauten Branches (phase.geaendert + manuell.notiz) rendern unveraendert; einzige sichtbare Delta = fehlender „Details ansehen"-Link (detail_url_path→NULL, kommt mit CMM-28 zurueck).

## Artefakte
- `01-admin-faelle-kanban.png` · `02-fallakte-verlauf.png` · `report.json`
- Smoke-Script war Wegwerf (Haupt-Repo `scripts/smoke-phase41-verify.mjs`, nach Lauf geloescht; PostgREST-Fall-Auswahl + Playwright).
