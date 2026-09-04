> Repo-Kopie. Die Marketing-Skills lesen `.agents/product-marketing-context.md` (in `.gitignore`) – beide Dateien synchron halten; Quelle der Wahrheit ist diese Datei.

# Claimondo — Product Marketing Context (Stand 04.09.2026)

Grundlage für alle Marketing-Skills (copywriting, copy-editing, page-cro, seo, lead-magnets, form-cro, …). Wer Copy ändert, liest zuerst dieses Dokument — die Zahlen und die Rollentrennung gelten überall, in allen sechs Sprachen und in beiden KI-Feeds (`llms.txt`, `llms-full.txt`).

## Produkt

Claimondo (Claimondo GmbH, Köln, gegründet 2025) koordiniert die Regulierung von Kfz-Haftpflichtschäden für unverschuldet Geschädigte: unabhängiger Sachverständiger vor Ort (< 48 h), Partnerkanzlei für Verkehrsrecht (LexDrive) für die Kommunikation und Verhandlung mit dem gegnerischen Versicherer, Partner-Werkstatt, Live-Fallakte. Für Geschädigte 0 € (§ 249 BGB, vorbehaltlich Anerkenntnis, ab ca. 750 € Schaden; bei Teilschuld anteilig). Claimondo verdient an Vermittlungsgebühren der Sachverständigen und Partner, nie am Geschädigten.

## Rechtliche Rollentrennung (RDG) — verbindlich in jeder Formulierung

- Claimondo: koordiniert · organisiert · kommuniziert · disponiert · rechnet ab · leitet die Auszahlung weiter · zeigt den Status.
- Unsere Partnerkanzlei: verhandelt · setzt durch · holt zurück/ein · klagt · macht geltend · vertritt · schreibt der Versicherung zurück.
- Verboten: „wir verhandeln / setzen durch / holen zurück / klagen", „unser Anwalt", „Claimondo setzt … durch". Erlaubt: „unsere Partnerkanzlei", einmal je Seite „Partnerkanzlei LexDrive".
- Grauzone (Freigabe der Kanzlei einholen): „wir regulieren", „BGH-konforme Durchsetzung" ohne Subjekt.
- Maschinelle Prüfung: `scripts/lib/copy-lint-scan.mjs` (`scanRdg`).

## Zahlen-Register (eine Wahrheit — Änderung nur hier und dann überall)

| Größe | Wert | Quelle |
|---|---|---|
| Rückruf | 15 Minuten, 8–20 Uhr | gelebter Prozess (Audit E, 24.08.) |
| Termin Sachverständiger | < 48 h | Prozessziel |
| Auszahlung | Ø 32 Tage (Tag 30–60) | Startseiten-KPI (Aaron) |
| Nutzungsausfall | 23–219 €/Tag (Klassen A–L) | `lib/tools/nutzungsausfall.ts` |
| BVSK-Honorar | typisch 300–1.200 €, bis 2.500 € | `BVSK_STUFEN` (`kosten-kfz-gutachten`) |
| Bagatellgrenze | 750 € | BGH-Linie |
| Prüfdienst-Kürzung | 30–40 % | NDR 2022 · Verbraucherzentrale · BGH VI ZR 38/22 ff. |
| Google-Bewertung | 5,0 · 27 (ProvenExpert, live) | Widget |
| Nicht belegt — ohne Quelle nicht verwenden | 2.000+ Fälle · 8 Mio. € · „4–6 Monate Branchen-Durchschnitt" · „über 50 Partner-Gutachter" · „hunderte Sachverständige" · „bundesweit größte" · Cluster „2.500+ Schäden / 10+ Jahre / 60 Min" | offen (Aaron) |

## Zielgruppen und Sprache

- Geschädigte (B2C): gestresst, Kostenangst, Laien. Sie-Form, Frage als Überschrift, Antwort als erstes Wort, Fachwort in Klammern nach der Erklärung („der Aufschlag auf Original-Ersatzteile (UPE)"). Keine Ausrufezeichen, keine Superlative.
- Sachverständige, Werkstätten, Flotten, Makler (B2B): Sie-Form, Zahlen zu Provision, Bindung und Ablauf zuerst, „was passiert nach dem Absenden" an jedem Formular.
- Ton: klar, direkt, mutig („Kein Call-Center-Roulette"), nie großspurig („bundesweit größte").
- Anrede in allen Bodies: Sie. Umlaute echt (`ä ö ü ß`), auch in `llms*.txt`.

## Properties und Rollen

| Property | Rolle | Sprachen |
|---|---|---|
| claimondo.de (+ gutachter./werkstatt./flotte./makler.claimondo.de) | Conversion, Ansprüche (Cluster H3), Lokal (Stadtseiten), B2B-Partner | de, en, tr, ar, ru, pl |
| autounfall.io | Education/How-to, standalone (keine Claimondo-Marke außer in den Vergleichen), Plausible statt Google | de |
| kfz-unfallgutachter-{koeln,duesseldorf,bonn,aachen,wuppertal}.de | lokale Conversion-LPs, fünf Kopien ohne Code-Sharing | de |

Keyword-Trennung: Stadt- und Brand-Keywords → claimondo.de / Cluster; „Was tun / wie geht / Technik" → autounfall.io. Dasselbe Thema auf beiden Properties = Kannibalisierung.

## Referenzseiten (so soll es klingen)

`/kfz-gutachter/kosten` · `/versicherung-schickt-gutachter` · `/check` (Funnel) · Hero-Zeile der Partnerseiten („Kostenlos gelistet · Aufträge über den Finder · Provision nur auf Erfolg") · autounfall.io Quick-Answer-Struktur.

## Quellen

Copy-Audit 04.09.2026 (`docs/2026-09-04-copy-audit-marketingseiten.md`), Marketing-Audits A/B/E vom 23.08.2026, Rollentrennungs-Entscheid Aaron 31.05.2026 (Memory `project_marketing_rdg_rollentrennung`).
