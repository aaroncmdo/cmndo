# Text-Audit Cluster G — kfz-gutachter/* + haftpflicht/[slug]
Stand: 27.05.2026 | Prüfer: Claude Sonnet 4.6

---

## /kfz-gutachter (Hub)
`src/app/kfz-gutachter/page.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/Cross-Page | Zeile 228: `lead: 'Schritt für Schritt vom Unfall bis zur Auszahlung — durchschnittlich 6–8 Wochen.'` | Verwendet "6–8 Wochen" als Wording für die Ablauf-Seite. Konsistent mit ablauf/page.tsx. Aber bekannte Inkonsistenz gegenüber "Ø 32 Tage" der Stadt-Seiten (in /kfz-gutachter/[stadt]). Hub-Text paart sich mit ablauf — Variante "6–8 Wochen". | Variante dokumentieren; koordinieren mit Stadt-Seiten. |
| [Minor] | Fakten | Zeile 66: Wertminderungs-FAQ — Faustregel nennt "4. Jahr 10%" aber nicht "nicht altersbegrenzt (BGH VI ZR 357/03)". Tabelle bricht ab, ohne darauf hinzuweisen, dass ab 5. Jahr Einzelfall entscheidet. | Tabelle endet bei "4. Jahr 10 %" ohne Hinweis auf ältere Fahrzeuge. Kanon sagt "nicht altersbegrenzt". Der Benutzer liest implizit "ab 5 Jahren kein Anspruch", was falsch wäre. | Hinweis nach Zeile 66 ergänzen: "Ab 5. Jahr: Einzelfall (BGH VI ZR 357/03 — keine starre Grenze)." |

---

## /kfz-gutachter/ablauf
`src/app/kfz-gutachter/ablauf/page.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/Cross-Page | Zeile 62: `dauer: 'Ø 6–8 Wochen ab Gutachten'` | **Inkonsistenz-Variante:** Diese Seite verwendet durchgängig "6–8 Wochen". Kanon-Note: bekannte Projektvariante "6–8 Wochen" (diese Seiten) vs. "Ø 32 Tage" (Stadt-Seiten). Exakt: "Ø 6–8 Wochen" = 42–56 Tage, "Ø 32 Tage" = rund 4,5 Wochen — beide unter dem gleichen Marken-Dach. | Variante: "6–8 Wochen" (durchgängig auf dieser Seite, Zeilen 16, 32, 62, 72, 140, 147, 148). Klärung der Kanalwahl empfohlen. |
| [Important] | Fakten | Zeile 92: `Nutzungsausfall-Pauschale nach Sanden/Danner-Tabelle (23–175 €/Tag je nach Fahrzeugklasse)` | "Sanden/Danner-Tabelle" ist im fachlichen Kontext die Berechnungsmethode für **merkantile Wertminderung** — nicht für die Nutzungsausfall-Pauschale. Die Nutzungsausfall-Tabelle stammt von **Sanden/Danner** in einem anderen Werk, die Grenze ist nicht trennscharf, aber die Bezeichnung "Sanden/Danner-Tabelle" für Nutzungsausfall kann verwirren, da Sanden/Danner primär für Wertminderung bekannt ist. Die korrektere Quelle für Nutzungsausfall-Pauschalen ist Halbgewachs/Böhm (oder schlicht "Nutzungsausfall-Tabelle"). | Formulierung prüfen: "Nutzungsausfall-Tabelle (23–175 €/Tag je nach Fahrzeugklasse)" ohne Sanden/Danner-Zuweisung, um keine Verwechslung mit Wertminderungsformel zu erzeugen. |
| [Important] | Fakten/Cross-Page | Zeile 48: `dauer: '5 Min, Antwort <15 Min'` und Zeile 229: `In 5 Minuten gemeldet — Antwort unter 15 Minuten.` | **Inkonsistenz-Variante Rückruf:** Ablauf-Seite nutzt "Antwort <15 Min" / "unter 15 Minuten" (nicht "5 Min Rückruf"). Vermittlungsportale-Vergleich Zeile 107 zeigt Claimondo "Reaktion unter 15 Minuten". Konsistent in diesem Cluster. Stadt-Seite nutzt "Rückruf in unter 15 Minuten". Inkonsistenz existiert gegenüber kfz-gutachter/[stadt]/StadtLeadFormClient "Schaden melden — in 30 Sekunden" (das ist eine Formular-Dauer, nicht Antwort-Zeit — sachlich kein Widerspruch, aber Verwechslungspotenzial). | Variante: Ablauf-Seite = "5 Minuten melden, Antwort unter 15 Minuten". |
| [Minor] | Fakten | Zeile 64: `Bei Verzögerung oder Kürzung schreibt der Anwalt nach. Bei Streit: Klage. Auch Klage-Kosten trägt bei Erfolg die Gegenseite.` | "Klage-Kosten trägt bei Erfolg die Gegenseite" ist inhaltlich korrekt (Kostenerstattung nach ZPO §91), aber die Formulierung "bei Erfolg" setzt voraus, dass der Leser versteht, dass das nicht 100% garantiert ist. Kein Fehler, aber im ToV könnten präzisere Einschränkungen helfen. | Evtl. ergänzen: "...bei vollem Obsiegen". |

---

## /kfz-gutachter/kosten
`src/app/kfz-gutachter/kosten/page.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten | Zeile 43: `'Die Honorare richten sich nach der BVSK-Honorartabelle und skalieren mit dem Wiederbeschaffungswert des Fahrzeugs. Spannen je nach Region: 550–2.600 €. [...] Die Berechnung folgt der HB-V-Befragung des BVSK aus 2025.'` | **BVSK-Jahresangabe widersprüchlich:** Kanon nennt "BVSK-Honorartabelle 2026". Diese FAQ-Antwort nennt "HB-V-Befragung des BVSK aus 2025". Die BVSK-Befragung erscheint typischerweise im Vorjahr und gilt dann für das Folgejahr, so dass "2025-Befragung" für "2026-Tabelle" formal korrekt sein kann — aber die direkte Nennung "aus 2025" in einem 2026-Kontext kann beim Nutzer den Eindruck veralteter Daten erwecken. | Präzisieren: "Die Berechnung folgt der BVSK-Honorartabelle 2026 (Befragung 2025/2026)." oder schlicht "BVSK-Honorartabelle (aktuell 2026)". |
| [Important] | Fakten | Zeile 34: OG-Description: `'Honorar nach BVSK 600–2.600 €, bei Fremdverschulden 0 € für Sie.'` vs. Fließtext Zeile 102/115: `550–2.600 €` | **Inkonsistente Honorarspanne:** OG-Description nennt "600–2.600 €", Fließtext und AnswerCapsule nennen "550–2.600 €". Auch Hub-Seite (kfz-gutachter/page.tsx Zeile 46) nennt "600–2.400 €". Drei verschiedene Unterkanten (550 / 600) und Obergrenzen (2.400 / 2.600) für nominell dasselbe. | Spanne vereinheitlichen, z.B. "ca. 600–2.400 €" als Brot-und-Butter-Angabe mit Hinweis auf Ausreißer, oder einmal klarstellen welche Spannenreferenz gilt. |
| [Minor] | Fakten | Zeile 63: FAQ-Antwort "Versicherer-Taktik: Honorar-Kürzung mit Hinweis auf 'ortsüblich'. Der BGH hat dem in mehreren Urteilen widersprochen (VI ZR 50/15, VI ZR 76/16)" | BGH VI ZR 50/15 und VI ZR 76/16 sind nicht die Haupt-Leitentscheidungen zur BVSK-Tabelle. Das Haupt-Az. ist VI ZR 357/13 (BVSK als Schätzgrundlage, § 287 ZPO) — auch in anderen Cluster-Seiten konsistent genutzt. VI ZR 50/15 / VI ZR 76/16 sind zwar reale BGH-Entscheidungen, aber ihre Verwendung hier ohne Prüfung birgt das Risiko der Fehleinstufung. | Prüfen und ggf. durch VI ZR 357/13 ersetzen oder ergänzen ("BGH VI ZR 357/13, VI ZR 50/15"). |

---

## /kfz-gutachter/online-kfz-gutachten
`src/app/kfz-gutachter/online-kfz-gutachten/page.tsx`

Keine Findings. Faktenlage (LG Bremen 9 O 1720/24, 16.01.2026, noch nicht rechtskräftig), Umlaute, ToV (Sie-Ansprache), Zitatmarkierung ("sinngemäße Kernaussage") — alles korrekt. Quellenangaben vollständig und nachvollziehbar. Haftungsausschluss am Ende vorhanden.

---

## /kfz-gutachter/vermittlungsportale-vergleich
`src/app/kfz-gutachter/vermittlungsportale-vergleich/page.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/ToV | Zeile 68: FAQ-Antwort: `'Die gesamte Schadensregulierung bis zur Auszahlung dauert erfahrungsgemäß sechs bis acht Wochen.'` | **Inkonsistenz:** Auf dieser Seite "sechs bis acht Wochen" (ausgeschrieben, kein Ø-Symbol). Ablauf-Seite "6–8 Wochen" (Zahl mit Ø). Stadt-Seiten "Ø 32 Tage". Kein Sachfehler, aber Style-Inkonsistenz. | Einheitliche Schreibweise wählen. |
| [Minor] | UWG/Fairness | Zeile 107: `neo: '„rund um die Uhr", Anfrage „in 30 Sekunden"; Tel. 0160/4873888'` | Die Telefonnummer von Neogutachter wird im direkten Vergleich öffentlich angezeigt. Wettbewerbsrechtlich ist das Anführen einer Wettbewerber-Hotline in einer Vergleichstabelle ungewöhnlich und könnte als Verweis auf ein Konkurrenzprodukt wirken. Solange die Zahl korrekt und belegbar ist, ist es sachlich zulässig; UWG-Risiko gering wenn die Quelle (Website) archiviert. | Interne Prüfung: Ob Hotline-Nummer der Wettbewerber in der Vergleichstabelle gewünscht ist, oder ob "Telefon verfügbar" reicht. |
| [Minor] | ToV | Zeile 78: `'Neogutachter konzentriert sich im Kern auf die Vermittlung [...] und ist als einzige der vier Plattformen mit Whitelabel-Branding auch für Sachverständige als Partner nutzbar.'` | "als einzige der vier Plattformen" — dieser Superlativ-Claim ist im Fließtext einer FAQ-Antwort, nicht in der Tabelle. Er wäre UWG-relevant, wenn falsch. Laut Tabelle Zeile 148 wird er aber durch die Tabelle selbst belegt (alle anderen "nein"). Sachlich konsistent. Kein Fehler. | Kein Handlungsbedarf. |

---

## /kfz-gutachter/wertminderung
`src/app/kfz-gutachter/wertminderung/page.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Critical] | Fakten/Recht | Zeile 57: FAQ-Antwort: `'In Deutschland mit der Sanden/Danner-Formel oder Variationen davon (Halbgewachs, BVSK-Methode).'` | **Methoden-Benennung unvollständig/abweichend:** Die haftpflicht-Spoke `/haftpflicht/wertminderung` (kanonisches Glossar, Zeile 37) nennt vier anerkannte Methoden: Ruhkopf-Sahm, Halbgewachs-Höning, MFM (Modifizierte Frankfurter Methode), Berens-Hettberg-Strunk. Die Ratgeber-Seite nennt "Sanden/Danner-Formel" — dabei handelt es sich um eine ältere, weniger gebräuchliche Bezeichnung, die im deutschen Sachverständigenwesen nicht mehr als Hauptreferenz gilt. "Sanden/Danner" ist bekannt (1960er), aber die vier o.g. Methoden sind heute die anerkannten. Die Abweichung zwischen der SEO-Ratgeber-Seite (Sanden/Danner) und dem Rechts-Glossar (Ruhkopf-Sahm u.a.) schafft Inkonsistenz und könnte Vertrauensprobleme erzeugen. | Angleichen: entweder Ratgeber-Seite auf "nach anerkannten Methoden (Ruhkopf-Sahm, Halbgewachs-Höning u.a.)" updaten, oder Sanden/Danner als historische Quelle der Faustregel erläutern (die Faustregel "25-20-15-10 %" stammt eher aus allgemeiner SV-Praxis). |
| [Important] | Fakten | Zeile 41–44: FAUSTREGEL-Tabelle endet bei "ab 5. Jahr" mit "Einzelfall". | Tabelle an sich korrekt. Aber im FAQ-Text (Zeile 57) fehlt der Hinweis auf die vier anerkannten Methoden — stattdessen nur "Sanden/Danner oder Variationen davon". Ratgeber und Glossar sollten konsistente Methoden-Liste haben. | Zeile 57 FAQ-Antwort: Methoden-Liste aus dem Glossar übernehmen. |
| [Minor] | Fakten | Zeile 62: FAQ-Antwort: `'OLG Oldenburg hat sogar bei 200.000 km Laufleistung Wertminderung zuerkannt.'` | Das OLG Oldenburg-Urteil wird ohne Aktenzeichen genannt. Das ist eine Anker-Tatsache ohne nachprüfbare Quelle. | Aktenzeichen ergänzen oder Formulierung auf "OLG-Rechtsprechung" allgemein halten. |

---

## /haftpflicht/[slug] — Template + Daten-Audit
`src/app/haftpflicht/[slug]/page.tsx` + Content-Dateien unter `src/content/claimondo/haftpflicht/*.md`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Critical] | ToV/du-Sie-Bruch | Alle haftpflicht/*.md Dateien: durchgehend "du/dein/dir"-Ansprache, z.B. `wertminderung.md` Zeile 47: `"weil das Fahrzeug nun als 'Unfall-Wagen' gilt"` (ok), aber Zeile 119: `"du musst sie aktiv geltend machen"` | **Systematischer du/Sie-Bruch:** Alle haftpflicht-Spoke-Inhalte (Markdown-Files) adressieren den Leser konsequent mit "du/dein/dir". Die kfz-gutachter-Seiten (ablauf, kosten, wertminderung, Hub) und die geteilten Komponenten (SpokeCtaBand, ConversionAnchorBlock) adressieren den Leser mit "Sie/Ihnen/Ihres". Kanon: Geschädigte (B2C) = "Sie". Da die Spoke-Contents via `MarkdownRenderer` unverändert gerendert werden und SpokeCtaBand + ConversionAnchorBlock "Sie" verwenden, wechselt die Ansprache innerhalb derselben Seite von "du" (Artikel) zu "Sie" (CTA-Band). Das ist ein harter ToV-Bruch auf jeder haftpflicht/[slug]-Seite. | Alle haftpflicht/*.md von "du" auf "Sie" umschreiben. Das betrifft geschätzt alle ~45 Live-Files. Alternativ: AGENTS.md/B2B-ToV präzisieren, ob "du" für Wissenscontent gewollt ist. Aktuell verstößt es gegen Kanon. |
| [Critical] | Fakten/Az. | `reparaturkosten.md` Zeile 22/95: `'130 %-Grenze: Reparatur bis 1,30 × Wiederbeschaffungswert (BGH VI ZR 70/04)'` vs. kfz-gutachter/[stadt]/page.tsx Zeile 138: `'Die 130%-Regel (BGH VI ZR 67/91)'` | **Widersprüchliche BGH-Aktenzeichen für die 130%-Regel:** Kanon nennt "BGH VI ZR 67/91" als das kanonische Leit-Az. für die 130%-Regel. `reparaturkosten.md` und dessen Content attributiert "BGH VI ZR 70/04". Beide Urteile sind real (VI ZR 67/91 = Grundsatz 130%-Grenze; VI ZR 70/04 = Weiterentwicklung), aber die Differenz zwischen kfz-gutachter/[stadt]-FAQ (VI ZR 67/91) und haftpflicht/reparaturkosten (VI ZR 70/04) ist eine projektweit sichtbare Inkonsistenz. Da der Kanon VI ZR 67/91 als "kanonisches Leit-Az." mit "6 Monate Weiternutzung" benennt, sollte VI ZR 67/91 Primär-Az. sein; VI ZR 70/04 kann als Folge-Az. genannt werden. | In reparaturkosten.md als Haupt-Az. VI ZR 67/91 aufnehmen, VI ZR 70/04 als weiterführende Entscheidung führen. |
| [Important] | Fakten | `sv-kosten.md` Zeile 19/57: Excerpt und Fließtext: `'typisch 300–1.200 € je nach Schadenshöhe'`. Kosten-Seite kfz-gutachter/kosten: `'550–2.600 €'` / Hub `'600–2.400 €'` | **Inkonsistente SV-Honorar-Spannen:** Das Glossar-Spoke nennt "300–1.200 € (Standard-Fälle)" und "1.000–2.500 € bei größeren Schäden". Die Ratgeber-Seiten nennen 550–2.600 € oder 600–2.400 €. Vier verschiedene Grenzwerte in derselben Domäne. | Entscheiden ob "300–1.200 €" (Standard) + "1.000–2.500 €" (größere Fälle) die richtige Aufspaltung ist, oder eine Gesamtspanne "ca. 600–2.400 €". Projektweit vereinheitlichen. |
| [Important] | ToV | `wertminderung.md` Zeile 117–131: Abschnitt "Was du jetzt machst — konkret" mit Emojis (💡, 🛠) | Emojis in Artikel-Texten — Kanon AGENTS.md sagt "Nur wenn User explizit wünscht". Für einen Schadensrecht-Artikel wirken 💡🛠 informell und nicht dem "auf Augenhöhe"-Ton gemäß. | Emojis aus den "Was du jetzt machst"-Abschnitten in den haftpflicht/*.md entfernen. |
| [Minor] | Fakten | `wertminderung.md` Frontmatter `last_legal_review: pending` (Zeile 26) und Footer: `*Letzte fachliche Überprüfung: pending — Schluss-Review durch unsere Partnerkanzlei steht aus.*` | Auf einer Live-Seite mit Rechtsaussagen (§249, BGH-Az.) erscheint "pending" als öffentlich sichtbarer Disclaimer. Das ist inhaltlich ehrlich, aber für Nutzer und Suchmaschinen unvorteilhaft. | Entweder Review durchführen und auf Datum setzen, oder Disclaimer aus dem Front-End-Rendering herausnehmen (intern behalten). |
| [Minor] | Fakten | `sv-kosten.md` gleiches `last_legal_review: pending` mit öffentlichem "pending"-Text (Zeile 235). | Wie oben. | Wie oben. |

---

## Extrahierte Fakten/Zahlen/Claims

| Seite | Claim / Zahl | Verwendeter Wert | Kanon-Wert | Status |
|---|---|---|---|---|
| kfz-gutachter/ablauf | Auszahlung-Dauer | "Ø 6–8 Wochen" (durchgehend) | Bekannte Variante: "6–8 Wochen" vs. "Ø 32 Tage" | Variante 1 (6–8 Wochen) |
| kfz-gutachter/ablauf | Rückruf-Dauer | "Antwort unter 15 Minuten" | Bekannte Variante: "5 Min" vs. "unter 15 Min" | Variante "unter 15 Minuten" |
| kfz-gutachter/ablauf | Form-Dauer | "5 Min" (Schaden melden) | Bekannte Variante: "30 Sek" vs. "60 Sek" vs. "5 Minuten" | Variante "5 Min" |
| kfz-gutachter/ablauf | Gutachter-Termin | "<48 h" | Kanon: "unter 48 Stunden" | Korrekt |
| kfz-gutachter/kosten | BVSK-Honorarspanne | "550–2.600 €" (Fließtext), "600–2.600 €" (OG) | Kanon: "BVSK-Honorartabelle 2026" | Inkonsistente Unterkante |
| kfz-gutachter/kosten | BVSK-Jahresreferenz | "HB-V-Befragung des BVSK aus 2025" | Kanon: "BVSK-Honorartabelle 2026" | Abweichung |
| kfz-gutachter/kosten | Bagatellgrenze | "750 €" | Kanon: "§249 BGB" (750 € implizit, OLG-abhängig 700–1.000 €) | Korrekt mit Schwankungshinweis |
| kfz-gutachter/wertminderung | Wertminderungs-Spanne | "500–2.500 €" | Kanon: "15–25 % (erste 3 Jahre)" — Spanne 500–2.500 € für Faustregel-Kontext plausibel | Korrekt |
| kfz-gutachter/wertminderung | BGH-Az. Wertminderung | "VI ZR 357/03" | Kanon: "BGH VI ZR 357/03" | Korrekt |
| kfz-gutachter/wertminderung | Methode | "Sanden/Danner-Formel" | Kanon-Haftpflicht-Glossar: "Ruhkopf-Sahm, Halbgewachs-Höning, MFM, Berens-Hettberg-Strunk" | Inkonsistenz |
| kfz-gutachter/ablauf | Fallzahl-Quelle | "Durchschnitt aus 2.400+ Fällen" | Kanon-Note: Fallzahl wird auch in [stadt]-Seite genutzt | Konsistenz-Prüfung mit aktueller DB empfohlen |
| kfz-gutachter/[stadt] | Schadensersatz | "8 Mio. €+" | Kanon: "über 8 Millionen Euro" (Stand 14.05.2026) | Korrekt |
| kfz-gutachter/ablauf | 130%-Regel Az. | keine direkte Nennung | Kanon: VI ZR 67/91 | n/a auf dieser Seite |
| haftpflicht/reparaturkosten | 130%-Regel Az. | BGH VI ZR 70/04 | Kanon: BGH VI ZR 67/91 (mit VI ZR 70/04 als Fortführung) | Az.-Inkonsistenz mit kfz-gutachter/[stadt]-FAQ |
| kfz-gutachter/[stadt]-FAQ | 130%-Regel Az. | BGH VI ZR 67/91 | Kanon: VI ZR 67/91 | Korrekt |
| haftpflicht/sv-kosten | SV-Honorar | "300–1.200 €" | Ratgeber-Seiten: "550–2.600 €" | Inkonsistenz |
| kfz-gutachter/vermittlungsportale-vergleich | Auszahlung-Dauer (FAQ) | "sechs bis acht Wochen" | Variante "6–8 Wochen" | Variante 1 (ausgeschrieben) |
| online-kfz-gutachten | LG Bremen Az. | "9 O 1720/24, 16.01.2026" | Aus öffentlichen Quellen belegbar | Korrekt |
| online-kfz-gutachten | Rechtskraft | "noch nicht rechtskräftig" | Korrekte Nuancierung vorhanden | Korrekt |
| kfz-gutachter/kosten | BGH-Az. Kürzungen | VI ZR 50/15, VI ZR 76/16 | Kanon nennt VI ZR 357/13 als Haupt-Az. BVSK | Abweichung von Kanon-Az. |
