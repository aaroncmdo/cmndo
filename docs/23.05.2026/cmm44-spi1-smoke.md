# CMM-44 SP-I1 — Portal-Smoke (LexDrive+Klage → kanzlei_faelle)

**Datum:** 2026-05-23 · **Ziel:** `app.staging.claimondo.de` (Schema bereits live in der geteilten DB; App-Code unverändert)
**Script:** `scripts/smoke-cmm44-spi1.mjs` · **Screenshots:** `docs/23.05.2026/cmm44-spi1-smoke/` (nicht committet — In-Turn-Analyse)

## Ergebnis: HARD=0, SOFT=0, OK=7 ✅

| Check | Status | Befund |
|---|---|---|
| DB `kanzlei_faelle` SP-I1-Spalten | OK | alle 4 (`lexdrive_case_id`/`lexdrive_ocr_data`/`lexdrive_ocr_received_at`/`klage_uebergeben_am`) selektierbar — Schema korrekt |
| DB View Laufzeit (`v_faelle_mit_aktuellem_termin`) | OK | View liefert die 4 Spalten via PostgREST; `lexdrive_case_id=null`, `klage=null` (aus leerem `kanzlei_faelle`), `mandatsnummer=001Jz…` (weiterhin aus `faelle` — bewusst nicht in Scope) |
| Public `/` | OK | nav=200 |
| SV `/gutachter/faelle` | OK | nav=200, SV-Portal (LexDrive-Whitelabel) rendert, „0 Fälle in Regulierung" |
| Admin `/faelle` | OK | nav=200 |
| Admin `/faelle/[id]` | OK | nav=200, Fallakte rendert vollständig über die repointete View (VS-Korrespondenz, Phasen-Timeline, Quick-Actions, Eskalation) |
| Kunde `/kunde` | OK | nav=200 |

Detektoren je Seite: `pageerror`, `console.error`, HTTP ≥500 — **0 Treffer** über alle Seiten.

## Screenshot-Analyse (In-Turn)

- **004 Admin-Fallakte:** rendert sauber über `v_faelle_mit_aktuellem_termin` — keine Error-Boundary, kein `undefined`/`NaN`/`[object Object]`, Layout + Claimondo-Branding + Umlaute intakt.
- **002 SV-Portal:** LexDrive-Whitelabel-Cockpit rendert sauber (Nav, Wetter-Header, „Meine Fälle"), Umlaute korrekt.

## Bewertung & Lücke

Die Migration ist **verhaltensneutral** bestätigt: die repointete View liefert die 4 SP-I1-Spalten zur Laufzeit als NULL (wie vor dem Repoint, beide Quellen leer), `mandatsnummer` unverändert aus `faelle`. Der einzige App-Reader-Pfad (SV-Fallseite `gutachter/fall/[id]`, `lexdrive_case_id` über die View → Pattern E) ist abgedeckt durch (a) den DB-View-Read, (b) die Admin-Fallakte (rendert dieselbe View), (c) das gesunde SV-Portal.

**Lücke:** Die konkrete SV-Seite `gutachter/fall/[id]` wurde nicht direkt im Browser geöffnet, weil der `test-sv`-User aktuell **keinen eigenen Fall** in Regulierung besitzt (RLS: SV sieht nur eigene Fälle). Da der Reader verhaltensneutral über die View läuft und DB-View-Read + Admin-Fallakte grün sind, ist das Risiko vernachlässigbar. Optional für später: einen Test-Fall dem `test-sv` zuweisen und die Seite gezielt smoken.
