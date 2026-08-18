# SV-LevelUp — Quelldateien der Übergabe

Ablageort nach `WELLEN_PLAN.md`. Diese Dateien sind die **Übergabe vom 16.08.2026**; sie lagen
bis zum 18.08. nur in einem Downloads-Ordner und sind hier gesichert, weil die Design-Spec sie
durchgehend referenziert.

## ⚠ Nicht direkt umsetzen — erst den Beschluss-Layer lesen

**Maßgeblich ist `docs/superpowers/specs/2026-08-18-sv-levelup-design.md`.** Diese Spec legt
über die Dateien hier und **gewinnt bei jedem Widerspruch**. Sie hält die Entscheidungen vom
18.08. fest und korrigiert sechs Stellen, die beim Bauen in die Irre führen würden.

Die drei teuersten davon:

| Datei | Stelle | Korrektur |
|---|---|---|
| `CONTEXT.md` | §7 („Registry aus dem Mockup übernehmen") | **`mockup-levelup-v2.html` ist veraltet** — nur 11 Module (`kwg`/`kwm` fehlen), eigenes Punktesystem. Maßgeblich: `GESAMTSPEC` §5 + `mockup-levelup-auswertung.html`, erweitert auf **17 Module / 150 Punkte**. |
| `CONTEXT.md` | §9 („anon kann alle 62 Zeilen vollständig lesen") | **Falsch.** Mit dem anon-Key gemessen: nur `id`/`lat`/`lng`/`ist_aktiv` sind lesbar, Kontaktdaten geben `permission denied`. Die Anreicherung ist **nicht** blockiert. |
| `CONTEXT.md`, `WELLEN_PLAN.md`, `CHECKLIST.md` | `leads` = 75 bzw. 165, `partner_leads` = 125 | Tatsächlich **78** und **126**. Regressionstests auf „vorher == nachher" umstellen, nie auf absolute Werte. |

Dazu: zwei Rechenfehler in `TESTDATA.json` (T-01, T-28), die unvollständige Massenlauf-Tabelle
in `CONTRACT.md` F-17, und der überholte Stack-Abschnitt der `GESAMTSPEC` (§3 nennt Express und
Vanilla-JS — es gilt Next.js).

## Inhalt

| Datei | Rolle |
|---|---|
| `CONTEXT.md` | Architektur, Datenmodell, eiserne Regeln, Anreicherung, Cold-Mail |
| `CONTRACT.md` | F-01 bis F-23 als INPUT → AKTION → ERGEBNIS |
| `TESTDATA.json` | T-01 bis T-36 plus der Münsterland-Beispielbefund |
| `CHECKLIST.md` | Abnahme je Welle, Abbruchkriterien |
| `WELLEN_PLAN.md` | die zehn Wellen als Prompts |
| `DURCHSPRACHE.md` | Pflichttermin vor dem ersten Mailversand (§ 7 Abs. 2 UWG) |
| `GESAMTSPEC-Sichtbarkeitscheck-v2.md` | Modul-Definitionen, Scoring, Regeln R-A bis R-L |
| `mockup-levelup-v2.html` | öffentlicher Check, sieben Zustände — **Registry veraltet**, Sperrlogik und Design-Tokens gültig |
| `mockup-levelup-auswertung.html` | Vertriebsansichten — **die maßgebliche Registry** plus die Maßnahmen-Beispieldaten |
| `SV-LevelUp-Specs.zip` | das Original-Archiv, unangetastet |

Die Messvorschrift je Modul (Punktvergabe, Schwellen, Formulierungsbausteine) steht **nicht**
hier, sondern im Skill `gutachter-sichtbarkeits-check` — dort in `references/scoring-modell.md`
und den Nachbardateien. Sie ist die einzige ausformulierte Fassung im gesamten Material und wird
unverändert übernommen.
