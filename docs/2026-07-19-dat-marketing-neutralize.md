# DAT-Marken-Referenzen aus Marketing entfernen

**Datum:** 2026-07-19
**Branch:** `kitta/dat-marketing-neutralize` (PR gegen `staging`)
**Trigger:** Aaron — DAT moechte nicht (mehr), dass Claimondo mit dem Bezug zu ihnen
wirbt: nicht "wir disponieren aus dem DAT-Netzwerk" und nicht "wir sind DAT-zertifiziert".
Entscheidung Aaron: **DAT komplett neutralisieren** (nicht nur das Zert-Wording).

## Verhaeltnis zum 22.05.-Fix

`docs/22.05.2026/dat-zertifiziert-claim-fix.md` hat damals nur die *falsche
Zertifizierungs-Behauptung* ("DAT-zertifiziert") entfernt und die
**Netzwerk-/Partner-Framing** (Hero-Badge "DAT-Sachverstaendigen-Netzwerk",
`dat_badge: "DAT Expert Partner"`, ueber-uns-Titel "DAT Expert Partner-Netzwerk",
KPI-Stat "DAT", "Exklusiver Zugang zum DAT Experts-Netzwerk") **bewusst behalten**.
Genau das ist jetzt umzukehren — diese Referenzen sind entfernt.

## Umfang

111 Files, 7 Marketing-Builds, 6 Sprachen (de/en/ar/pl/ru/tr):
- `claimondo-marketing/` (Hauptseite) — 38
- `autounfall-io/` (Cluster-LP) — 4
- `kfz-gutachter-{aachen,bonn,duesseldorf,koeln,wuppertal}/` — je 12
- `src/` (marketing-nahe Teile: i18n, seo/jsonld, brand/service-pitch, onboarding-Fallback) — 9

## Was entfernt/neutralisiert wurde

- **Netzwerk/Partner/Zert-Framing:** `dat_badge`, `trust_badge`, Titel "DAT Expert
  Partner Netzwerk", jsonld `memberOf`(+dat.de-URL), TrustBlock-Pillar, KPI-Werte "DAT",
  "aus dem oeffentlichen DAT-Verzeichnis", alle `dat.de`-URLs, Cluster-Trust-Pills/Titel-Suffix.
- **Gattungsbegriff:** "DAT-Sachverstaendiger/-Gutachter" (+ Uebersetzungen
  "DAT-эксперт", "DAT bilirkişi", "rzeczoznawca DAT", "خبير DAT") -> "Kfz-Sachverstaendiger" /
  lokales Wort.
- **Tool-Nennung:** "DAT-Kalkulationssystem"/"DAT/Audatex"/"SilverDAT"/"DAT-API"/"DAT-Daten"
  -> "Audatex" bzw. "anerkannte/marktuebliche Kalkulationssysteme"; "DAT-Standard"/"DAT-/BVSK-Standard"
  -> "BVSK-Standard"; "(DEKRA, KUES, TUEV, DAT)" -> "(DEKRA, KUES, TUEV)".
- **FAQ** "Was ist DAT-Expert und warum ist das wichtig?" -> neutral
  ("Nach welchem Standard wird mein Schaden kalkuliert?") in allen 6 Sprachen.

## Carve-outs — BEHALTEN (Aaron-Entscheidung)

1. **Rechtstexte** (keine Werbung, gesetzliche/vertragliche Faktenangabe):
   - `src/content/legal/datenschutz.md` + Marketing-Datenschutz-Seite: DAT als
     Auftragsverarbeiter (AVV) fuer die KI-Schadenvorabkalkulation.
   - `src/content/legal/agb.md`: "KI-gestuetzte Schadenvorabkalkulation auf Basis des
     DAT Expert Systems" (Leistungsbeschreibung). **-> ggf. mit Legal abklaeren, ob auch
     das weichen soll; als Faktenangabe im Rechtstext vorerst behalten.**
2. **SV-Onboarding/Recruiting** (DAT-Expert ist eine echte SV-Qualifikation neben BVSK/IHK/oebuv;
   das Feld verifiziert die Qualifikation des sich BEWERBENDEN SV — keine Claimondo-DAT-Werbung):
   Feld `dat_expert_nummer` / Label "DAT-Expert-Nr.", "DAT-Expert-Nachweis hochladen",
   Qualifikations-Listen "DAT-Expert · BVSK · IHK · oebuv", "DAT-Experten … willkommen",
   Register-Verifizierungstext.
3. **Internes Backend** (nicht nutzersichtbare Marketing-Copy): `partner-rang`-System
   ("DAT bevorzugt" im Finder), `sv-leads`-Import ("DAT-Lead"), `csv-import` ("DAT-Nr"),
   `stammdaten`-Feld-Hints ("DAT-API"), `relevance.ts`-Keyword, Code-Kommentare,
   Enum-Wert `quelle='dat_expert'`, `next.config.ts`-301-Redirect `/gutachter-dat-expert`
   (Link-Equity-Erhalt fuer den entfernten Artikel).

## Methode

Deterministische Codemods (konsistentes Wording, format-/CRLF-sicher) fuer die
mechanischen Faelle + 4 parallele Subagenten fuer die prosa-/mehrsprachig-lastigen
Bloecke (autounfall-Artikel, content-.md/llms, Seiten+gutachter-partner-chirurgisch,
i18n-Framing). Der i18n-Agent brach transient (Netzwerk) nach 11/12 Files ab; die 12.
Datei (`src/i18n/pl.json`) wurde deterministisch aus dem fertigen Zwilling
`claimondo-marketing/i18n/pl.json` **pfad-genau gespiegelt** (gleiche polnische Werte).

## Verifikation

- Alle 12 i18n-JSON per `JSON.parse` valide; jede exakt auf 6 KEEP-Referenzen reduziert.
- Residual-Grep ueber alle Builds: verbleibende DAT = ausschliesslich die o.g. Carve-outs
  (Legal + SV-Onboarding + internes Backend) + benigne FP ("LOKALDATEN"/"Datenbank").
- Doubling-Artefakte aus den Codemods gefixt ("Standard-Standard-Kalkulationsschema",
  "BVSK-Standard · BVSK"-Redundanz, verwaister Trust-Separator).
- **`tsc`/`build` lokal NICHT lauffaehig** — Haupt-`node_modules` ist unvollstaendig
  (kein `next`/`lucide-react` aufloesbar); dokumentierter Praezedenzfall (22.05-Fix).
  Aenderungen sind reine Content-/String-Edits (keine Keys/Signaturen/Imports geaendert).
  **-> CI-Build auf dem PR gatet alle 7 Builds.**

## Offen / Follow-up

- **Regel 4 (Prod-Playwright-Smoke)** nach Deploy: Marketing-Render-Smoke der
  betroffenen Seiten (Hauptseite/Cluster-LPs/gutachter-finden/gutachter-partner) — deploy-blockiert.
- Nicht-DE-Locales (ar/pl/ru/tr) sind sinnwahrend neutralisiert; ein muttersprachlicher
  Review ist nice-to-have.
- AGB-Nennung "DAT Expert System" (s. Carve-out 1) — Legal-Entscheid ob raus.
