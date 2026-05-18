# CMM-44 SP-A3 — Post-Drop Portal-Smoke

**Datum:** 2026-05-18
**Ziel:** `https://app.staging.claimondo.de` (staging, PR2-Code deployt, DB nach `DROP COLUMN faelle.fall_nummer`)
**Script:** `scripts/smoke-cmm44-spa3.mjs`
**Screenshots:** `docs/17.05.2026/cmm44-spa3-smoke/`

## Kontext

SP-A3 schafft `faelle.fall_nummer` ab; `claims.claim_nummer` ist die kanonische
Aktennummer. Dieser Smoke lief **nach** dem `DROP COLUMN` (PR3, Migration
`20260517221326`) — die Spalte ist DB-seitig weg, die 5 Views sind ohne
`f.fall_nummer` neu gebaut. Verifiziert, dass alle Portale weiter eine Aktennummer
anzeigen und kein 5xx/leerer Screen auftritt.

## Ergebnis

**13 OK · 5 WARN · 0 HARD-FAIL**

| Portal | Befund |
|---|---|
| Public | `/` + `/gutachter-finden` — OK, kein 5xx |
| Admin | `/faelle`-Liste **und** `/faelle/[id]`-Detail zeigen Aktennummer im `claim_nummer`-Format `CLM-2026-00167`. Fallakte rendert vollständig (Phasen, Briefings, Quick-Actions). |
| Dispatch | `/dispatch` + `/dispatch/leads` + Lead-Detail OK. WARN: keine Aktennummer in Leads-Liste — erwartbar, Leads haben noch keine Akte. |
| SV | `/gutachter` + `/gutachter/auftraege` OK. WARN: keine Aktennummer in der SV-Liste — Test-User hat **0 Aufträge** (Empty-State „Keine Aufträge gefunden", per Screenshot bestätigt), kein Reader-Defekt. |
| Kunde | `/kunde` + `/kunde/faelle` OK. WARN: keine Aktennummer — Test-User hat **keinen Schadensfall** (Empty-State „Noch kein Schadensfall", per Screenshot bestätigt). |

## WARN-Analyse

Alle 5 WARNs sind **leere Test-User-Listen / Leads-ohne-Akte**, keine Regression:
- Die WARNs traten in allen drei Smoke-Läufen identisch auf (Pre-PR2 Alt-Code,
  Post-PR2, Post-Drop) — d.h. sie sind unabhängig von SP-A3.
- SV-/Kunde-Listen per Screenshot als Empty-State verifiziert (keine Daten für die
  Test-User), nicht als „Daten ohne Nummer".
- Der `claim_nummer`-Reader ist dort verifiziert, wo echte Daten liegen: Admin-Liste
  (`v_claim_listing`) + Admin-Fallakte (`v_faelle_mit_aktuellem_termin`).

## Nebenbefund (nicht SP-A3)

Admin-Fallakte-Detail wirft 1× `Minified React error #418`. Trat in **allen drei**
Smoke-Läufen auf (auch im Pre-PR2-Alt-Code) → vorbestehendes staging-Issue, **nicht**
durch SP-A3 verursacht. Eigenes Ticket wert (Hydration-Mismatch-Familie, vgl.
`a335539d` gutachter/heute #418-Fix).

## Fazit

Der `DROP COLUMN faelle.fall_nummer` + View-Rebuild hat **nichts gebrochen**.
Aktennummer wird überall korrekt als `claim_nummer` angezeigt. SP-A3 ist
DB- und code-seitig komplett.
