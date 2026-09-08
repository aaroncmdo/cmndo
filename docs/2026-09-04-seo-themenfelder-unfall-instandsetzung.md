# Themenfelder für neue SEO-Seiten: Unfall und Unfallinstandsetzung — 04.09.2026

**Auftrag (Aaron):** „zusätzlich möchte ich, dass wir mehr Seiten nutzen, die darauf ausgelegt sind, das SEO für den Unfall und Unfallinstandsetzung … nutze den seo-geo-Skill, um dir systematisch zu überlegen, was relevant ist" · „welche Themenfelder".

**Methode (seo-geo · content-strategy · programmatic-seo · keyword-research):** (1) Bestand beider Properties vollständig inventarisiert (Crawl 04.09.: claimondo.de 416 DE-Seiten, autounfall.io 257, Cluster 55), (2) gegen die Technik-Wissensbasis `marketing-strategy/research/Pillar-C-Technik` (T1–T8, 70 Themen) und die Keyword-Cluster-Dokumente (`06a-autounfall-io-SEO-1-KEYWORD-CLUSTER.md`, 8 Hubs / 87 Keywords) gelegt, (3) Lücken nach Suchintention, Käuferphase und Playbook geordnet, (4) nach Kundenwirkung 40 % · Produkt-Fit 30 % · Suchpotenzial 20 % · Aufwand 10 % bewertet.

**Datenlage, ehrlich:** Ahrefs weist auf dem aktuellen Tarif jeden Abruf ab („Insufficient plan" — auch Keywords-Explorer, am 04.09. erneut geprüft), der OpenSEO-MCP war nicht erreichbar, ein GSC-Zugang ist im Repo nicht verdrahtet. **Suchvolumen sind deshalb nur dort angegeben, wo sie aus der Mai-Recherche im Repo stammen** (`rest-pages.generated.ts`-Eyebrows, 06a-Tiers). Alles andere steht als `unbekannt`. Vor dem Bau der Welle 1 gehört ein GSC-Export (Queries mit `reparatur|werkstatt|lack|teile|karosserie|instandsetzung`, Position 5–20) als Prüfung dazu — das ist der einzige kostenlose Erstanbieter-Nachweis.

---

## 1 · Was es schon gibt (damit nichts doppelt entsteht)

| Thema | claimondo.de | autounfall.io | Cluster-LPs |
|---|---|---|---|
| Erstattungsfragen (H3) | 20 Spokes: Reparaturkosten (Übersicht), Wertminderung, WBW, SV-Kosten, Mietwagen, Nutzungsausfall, Abschlepp, Anwaltskosten, **Beilackierung, ADAS-Kalibrierung, Reparaturbestätigung, Ersatzteil-Qualität** (21.08.) | — | — |
| Reparatur & Werkstatt (Pillar 04) | — | Hub `/reparatur` + `fiktive-abrechnung`, `upe-aufschlaege`, `verbringungskosten`, `stundenverrechnungssatz`, `verweisrecht-versicherung`, `werkstattwahl-recht`, `werkstattrisiko-bgh-2024`, `neuwagen-schaden`, `werkstatt-direkt-vs-spaeter`, `gutachten-oder-kostenvoranschlag` | — |
| Totalschaden / Werte | H3 `wiederbeschaffungswert`, Decoder `reparatur-unwirtschaftlich` | `totalschaden-130-prozent-regel`, `wbw-*` (7), `wiederbeschaffungswert` (Rechner), Decoder `130-prozent-verweigert`, `totalschaden-trick`, `restwert-zu-hoch` | — |
| Versicherer-Kürzungen | 11 Decoder, 12 Versicherer-Profile | 16 Decoder, Kürzungs-Checker | — |
| Schadenarten | `haftpflicht/wildunfall`, `glatteis-aquaplaning` | `hagel-sturmschaden`, `steinschlag-glasbruch`, `marderschaden`, `vandalismus`, `wildunfall`, `parkschaden`, `eauto-tesla-unfall`, `tesla-e-auto-gutachten` | — |
| Fahrzeugtypen | `e-auto-gutachter`, `lkw-gutachter`, `motorrad-gutachter` | — | — |
| Lokal | 183 Stadtseiten `/kfz-gutachter/<stadt>` | 100 pSEO `kfz-unfall/<stadt>/<typ>` | 5 Hubs + 45 Ort-Spokes |
| Akutphase / Verhalten | Cornerstones, `unfall-was-tun-als-geschaedigter`, `unfallskizze` | Pillar 01 komplett (Checkliste, 12 Fotos, Polizei, Aussage, Unfallbericht) | — |
| Werkstatt-Partner (B2B) | werkstatt.claimondo.de, `/werkstatt-finden` (0 Wörter Inhalt — nur iframe) | — | — |

**Wo die Lücke sitzt (Bestätigung des Befunds vom 21.08.):** Die **technische, handwerkliche Seite der Instandsetzung** hat auf keiner Property Seiten — was in der Werkstatt passiert, wie repariert wird, woran man Qualität erkennt, was ein Schadenbild am einzelnen Bauteil bedeutet. Vorhanden ist nur die Frage „ist es erstattungsfähig" (claimondo.de) und „wer darf die Werkstatt wählen" (autounfall.io).

**Rollenregel (aus `06a` §0 und `PROJECT-seo-unfallinstandsetzung-cluster`), für jedes neue Thema anzuwenden:**

* „**Ist es erstattungsfähig / was steht mir zu?**" → claimondo.de, Cluster H3 (Vertiefung unter `reparaturkosten`, nie zweite Übersicht).
* „**Wie läuft das / wie wird das gemacht / was bedeutet das technisch?**" → autounfall.io (Education, standalone, keine Stadt- und Brand-Keywords).
* „**Werkstatt/Gutachter in <Stadt>**" → claimondo.de Stadtseiten bzw. Cluster-Domains, nur mit Substanz-Gate (≥ 3 harte Fakten je Ort, sonst Hub-Abschnitt).
* „**Reparaturaufträge / Partner werden**" → werkstatt.claimondo.de.

---

## 2 · Die Themenfelder

Legende: **Playbook** nach programmatic-seo (Glossar · How-to · Decoder · Vergleich · Tool · Ort · Persona/Typ) · **Phase** = Käuferphase (Akut · Info · Entscheidung) · **Vol.** = Suchvolumen, wo im Repo belegt.

### Feld A — Reparaturmethoden und Karosserie (Pillar C, T5)

Der Kern von „Unfallinstandsetzung": was die Werkstatt tut, warum es so teuer ist, woran man Pfusch erkennt.

| Seite (Arbeitstitel) | Intention | Playbook | Property | Quelle | Vol. |
|---|---|---|---|---|---|
| Unfallinstandsetzung: Ablauf in der Karosseriewerkstatt (Annahme → Demontage → Richten → Lackieren → Endkontrolle) | Info | How-to/Hub | autounfall.io (neuer Hub `/unfallinstandsetzung`) | T5, T1.1 | unbekannt |
| Rahmenrichtbank und Karosserievermessung — wann ein Auto „verzogen" ist | Info | Glossar | autounfall.io | T5.6, BVSK-Nebenkosten 252–272 € | unbekannt |
| Achsvermessung nach Unfall — Pflicht oder Kür, was sie kostet, wer zahlt | Info/Erstattung | Glossar + H3-Vertiefung | autounfall.io (Technik) + claimondo.de H3.21 (Erstattung, 132–140 € BVSK-Korridor) | T5.5, T1.7 | unbekannt |
| Schweißen, Kleben, Sektionsaustausch — wie Strukturteile ersetzt werden (und warum die Versicherung „Instandsetzen statt Erneuern" sagt) | Info | Glossar | autounfall.io | T5.1–T5.4 | unbekannt |
| Lackierung nach Unfall: Lackaufbau, Lackierstufen, Metallic/Perleffekt-Aufschläge, Lackschichtdicke messen | Info | Glossar | autounfall.io | T5.7–T5.9, T1.4 | unbekannt |
| Smart Repair vs. Fachreparatur — wann Ausbeulen ohne Lackieren reicht | Entscheidung | Vergleich | autounfall.io | Cross-Cutting „SmartRepair" | unbekannt |
| Hersteller-Reparaturvorgaben (Werksvorgaben) — warum die Werkstatt sie einhalten muss und was das für Ihren Anspruch heißt | Info/Erstattung | Glossar | autounfall.io + Absatz in claimondo H3.1 | T5.10 (BGH-Relevanz) | unbekannt |

### Feld B — Sicherheitssysteme nach dem Unfall (T4)

Hohe Angst, hohe Kosten, Versicherer streichen gern: Airbag, Gurtstraffer, Sensorik.

| Seite | Intention | Playbook | Property | Quelle |
|---|---|---|---|---|
| Airbag ausgelöst — was alles getauscht werden muss (Gurtstraffer, Steuergerät, Sensoren) und was das kostet | Akut/Info | Glossar | autounfall.io | T4.1, T4.2 |
| Assistenzsysteme nach Unfall: Frontkamera, Radar, Notbremsassistent neu kalibrieren | Info | Glossar | autounfall.io (Technik; claimondo `adas-kalibrierung` deckt Erstattung bereits) | T4.6–T4.8 |
| Crashbox, Längsträger, aktive Motorhaube — versteckte Strukturschäden, die ein Kostenvoranschlag nicht sieht | Info | Glossar | autounfall.io | T4.3, T4.4 |
| ESP/ABS-Sensorik nach Unfall — Fehlerspeicher auslesen (59–74 € BVSK) | Info | Glossar | autounfall.io | T4.5, T1.7 |

### Feld C — E-Auto und Hochvolt (T8; Ausbau des Bestands)

| Seite | Intention | Playbook | Property | Quelle |
|---|---|---|---|---|
| Hochvolt-Batterie nach Unfall: Diagnostik, Quarantäne, Tausch vs. Modulreparatur (Kostenbeispiele) | Info/Entscheidung | Glossar | autounfall.io (Spezial-Hub „E-Auto nach Unfall" aus `eauto-tesla-unfall` + `tesla-e-auto-gutachten`) | T8.1–T8.3 |
| Wallbox beschädigt (Unfall in der Garage) — Kasko, Haftpflicht, Gutachten | Info | Glossar | autounfall.io | T8.5 |
| Hybrid-Spezifika · Wasserstoff (Stand 2026) | Info | Glossar | autounfall.io | T8.6, T8.7 |
| E-Auto-Gutachter: vertiefen (SoH-Test, Batterie-Garantie, Reichweitenverlust — drei `/wissen`-Artikel existieren bereits als News, Fachseite fehlt) | Entscheidung | Fachseite | claimondo.de `/e-auto-gutachter` ausbauen | Wissen-Artikel 08/2026 |

### Feld D — Reparaturablauf aus Kundensicht (Prozess, kein Recht)

Die Fragen zwischen Gutachten und Auszahlung — heute nirgends beantwortet.

| Seite | Intention | Playbook | Property | Quelle |
|---|---|---|---|---|
| Reparaturfreigabe: wer gibt sie, wann darf die Werkstatt anfangen, was passiert bei Teilfreigabe | Akut | How-to | autounfall.io (+ Verweis auf claimondo `reparaturkosten`) | Journey J4 (KVA → Freigabe → Schlussrechnung) |
| Reparaturdauer: wie lange dauert eine Unfallreparatur, Ersatzteil-Lieferzeit, und wie sich das auf Nutzungsausfall/Mietwagen auswirkt | Info | How-to | autounfall.io | T1.1 (Reparaturdauer im Gutachten) |
| Reparaturqualität prüfen: Spaltmaße, Lackschichtdicke, Farbton, Probefahrt — was Sie bei der Abholung kontrollieren | Info | Checkliste | autounfall.io | T5.8, T1.7 |
| Nachbesserung und Werkstatt-Gewährleistung — wenn die Reparatur mangelhaft ist | Info/Recht | Glossar + H3 (Haftung Werkstatt vs. Versicherer) | autounfall.io + claimondo H3 | T7.9 (Werkstattrisiko) |
| Weiterbenutzung / 6-Monats-Frist (130-%-Fall) | Erstattung | H3-Vertiefung | claimondo.de (zurückgestellt 21.08., Überschneidung mit 3 Dateien prüfen) | T3.6, BGH VI ZR 70/04 |

### Feld E — Kosten und Kalkulation (T1.2–T1.7, T7)

| Seite | Intention | Playbook | Property | Quelle | Vol. |
|---|---|---|---|---|---|
| Was kostet die Reparatur nach einem Unfall? Richtwerte je Schadenbild (Stoßstange, Tür, Kotflügel, Front, Heck) | Info | Kosten-Hub | autounfall.io | Repo-Realfälle (Cluster), BVSK | 06c: Kosten-Hub „~1.700/Monat" (Kfz-Gutachten-Kosten, Referenz autocrashexpert.de 53 Keywords) |
| Kostenvoranschlag lesen — Positionen, Arbeitswerte, UPE, Verbringung, Nebenkosten erklärt | Info | How-to | autounfall.io (`gutachten-lesen` existiert; KVA-Pendant fehlt) | T1.5–T1.7 |
| Kalkulationssysteme (Audatex, DAT, Schwacke): woher die Zahlen im Gutachten kommen | Info | Glossar | autounfall.io | T1.1 |
| Lackierkosten nach Unfall — Tabelle nach Bauteil und Lackart | Info | Tabelle | autounfall.io | T5.7 |
| Reparaturkosten brutto/netto, MwSt bei fiktiver Abrechnung | Erstattung | — (existiert: `wbw-mehrwertsteuer`, H3.1) | — | — |

### Feld F — Schadenbild × Bauteil (programmatisch, autounfall.io)

Head-Terms wie „Stoßstange reparieren Kosten", „Tür eingedellt was tun" — hier liegt vermutlich das größte unerschlossene Volumen, aber **ohne Ahrefs/GSC nicht belegbar**. Vor dem Bau messen.

| Bauteil/Schaden | Seite | Kannibalisierung |
|---|---|---|
| Stoßstange (Riss, Kratzer, Halter) | reparieren oder tauschen · Kosten · was zusteht | keine |
| Tür/Kotflügel (Delle, Beule) | Ausbeulen vs. Austausch · Beilackierung (Verweis claimondo H3.17) | keine |
| Front-/Heckschaden | versteckte Strukturschäden (Verweis Feld B) | keine |
| Seitenschaden / Streifschaden | Spurwechsel-Bezug (Cluster-Realfall) | Cluster-LPs erwähnen es lokal |
| Scheibe/Glas | existiert (`steinschlag-glasbruch`) | — |
| Felge/Reifen/Achse nach Bordsteinkontakt | Achsvermessung (Feld A) | keine |
| Lackschaden/Kratzer | Smart Repair (Feld A) | keine |
| Unterboden/Ölwanne | Aufsetzer | keine |
| Hagel, Marder, Vandalismus, Wild | existieren | — |

Bauregel: nur bauen, wenn je Seite ≥ 400 Wörter eigener Substanz (Reparaturweg, Kostenspanne, Erstattungs-Hinweis, FAQ) — nicht „Template mit ausgetauschtem Bauteil" (Jaccard < 40 % zu jeder Nachbarseite, Positivkontrolle im Bestand: höchste Ähnlichkeit 8,2 %).

### Feld G — Werkstattwahl, Werkstattbindung, Werkstatt finden

| Seite | Intention | Playbook | Property | Hinweis |
|---|---|---|---|---|
| Werkstattbindung in der Kasko: was der Tarif erlaubt, was Sie verlieren | Entscheidung | Glossar | autounfall.io | **Koordination:** Lane `kitta/werkstattbindung-kasko-tarife` (PR #5857) baut das Produkt-Feature — Copy dort mit abstimmen |
| Markenwerkstatt vs. freie Werkstatt nach Unfall — Rechte, Kosten, Qualität | Entscheidung | Vergleich | autounfall.io (`werkstattwahl-recht` + `verweisrecht` existieren als Recht; der Vergleich fehlt) | T1.3 |
| Werkstatt nach Unfall finden — worauf achten (Meisterbetrieb, Herstellervorgaben, Gutachter-Kooperation) | Entscheidung | Checkliste | claimondo.de `/werkstatt-finden` — heute 19 Wörter außerhalb des iframes; ein Content-Block unter dem Finder ist der billigste Hebel (Nacht-Audit #2 notiert das fehlende H1) | Partner-Werkstätten (28) als Beleg |
| Unfallinstandsetzung <Stadt> (programmatisch) | Lokal | Ort | claimondo.de nur mit Substanz-Gate (Partner-Werkstatt vor Ort + Ortsdaten aus `stadt_lokalinhalte`) | Scaled-Content-Risiko wie bei den Stadtseiten (Memory Hyperlokal); ohne Partner-Werkstatt keine eigene Seite |

### Feld H — Rechtliches rund um die Reparatur (claimondo.de H3)

| Seite | Grundlage | Hinweis |
|---|---|---|
| Werkstattrechnung höher als das Gutachten — wer zahlt die Differenz | BGH VI ZR 38/22 ff. (Werkstattrisiko) | Abgrenzung: `werkstattrisiko-bgh-2024` liegt auf autounfall.io → auf claimondo.de nur als Erstattungs-Vertiefung mit anderem Fokus (Prognoserisiko, Vorschuss) oder gar nicht |
| Standgeld/Standkosten der Werkstatt bei verzögerter Regulierung | § 249, Verzug | frei (0 Fundstellen) |
| Reparaturdauer verzögert — Nutzungsausfall verlängert sich | Eigennutzungs-Vermutung (Gegenlesen mit H3 `nutzungsausfall`!) | Widerspruchsgefahr wie bei `reparaturbestaetigung` (23.08.) |
| Probefahrt-, An-/Abmeldekosten, Fehlerspeicher — die kleinen Positionen | T1.7 | frei |

### Feld I — B2B: Unfallinstandsetzung als Werkstatt-Angebot

werkstatt.claimondo.de: „Unfallinstandsetzung" ist zugleich das Fachwort der Karosseriebetriebe (ZKF). Ein Ratgeber-Spoke „Unfallinstandsetzung ohne Versicherer-Steuerung: wie Partnerwerkstätten Aufträge über den Finder bekommen" spricht die Werkstatt in ihrer Sprache an; Vorbild sind die drei Gutachter-Ratgeber unter `/gutachter-partner/*` (514–588 Wörter, 0 % Überlappung).

---

## 3 · Priorisierung (Scoring: Kundenwirkung 40 · Produkt-Fit 30 · Suchpotenzial 20 · Aufwand 10)

| Rang | Seite | Property | Kunde | Fit | Such | Aufwand | Score | Begründung |
|---|---|---|---|---|---|---|---|---|
| 1 | Unfallinstandsetzung-Hub: Ablauf in der Werkstatt (Feld A) | autounfall.io | 9 | 8 | 7 | 8 | 8,1 | Fehlender Pillar; Anker für 15 Spokes; erklärt die Positionen, die Prüfdienste streichen |
| 2 | Was kostet die Reparatur — Richtwerte je Schadenbild (E) | autounfall.io | 9 | 8 | 8 | 6 | 8,1 | einzige belegte Volumenklasse (Kosten-Hub 06c); füttert Feld F |
| 3 | Werkstatt nach Unfall finden — Content unter dem Finder (G) | claimondo.de | 8 | 9 | 6 | 9 | 7,9 | Seite existiert mit 19 Wörtern; sofortiger Hebel, Regel-4-Smoke vorhanden |
| 4 | Airbag ausgelöst — was getauscht wird, was es kostet (B) | autounfall.io | 9 | 7 | 6 | 8 | 7,7 | Akut-Angst, Versicherer streichen, keine Konkurrenzseite im Bestand |
| 5 | Reparaturfreigabe + Reparaturdauer (D, 2 Seiten) | autounfall.io | 8 | 9 | 5 | 8 | 7,6 | deckt Journey J4 aus Kundensicht; Verbindung zu Nutzungsausfall |
| 6 | Achsvermessung: Technik (AU) + Erstattung H3.21 (CM) | beide | 7 | 8 | 6 | 7 | 7,1 | konkrete BVSK-Zahl, häufige Kürzungsposition |
| 7 | Reparaturqualität prüfen — Abhol-Checkliste (D) | autounfall.io | 8 | 6 | 5 | 8 | 6,9 | shareable + zitierfähig (Checklisten werden von KI gern übernommen) |
| 8 | Hochvolt-Batterie nach Unfall (C) | autounfall.io | 7 | 7 | 6 | 6 | 6,7 | wachsend; Bestand hat Einstieg |
| 9 | Lackierung nach Unfall (A) + Lackierkosten-Tabelle (E) | autounfall.io | 7 | 7 | 6 | 6 | 6,7 | verbindet Beilackierung (CM) mit Technik |
| 10 | Markenwerkstatt vs. freie Werkstatt (G) | autounfall.io | 7 | 8 | 6 | 7 | 7,0 | Vergleichs-Playbook, Entscheidungsphase |
| 11 | Weiterbenutzung / 6-Monats-Frist (D/H) | claimondo.de | 6 | 8 | 5 | 5 | 6,3 | seit 21.08. zurückgestellt — erst Überschneidung auflösen |
| 12 | Schadenbild × Bauteil, 6–8 Seiten (F) | autounfall.io | 7 | 6 | ? | 5 | offen | **erst nach GSC/Ahrefs-Nachweis** |
| 13 | Unfallinstandsetzung <Stadt> (G, programmatisch) | claimondo.de | 5 | 7 | ? | 3 | offen | nur mit Partner-Werkstatt vor Ort |

**Welle 1 (4 Wochen):** Rang 1–5 (7 Seiten). **Welle 2:** 6–10. **Welle 3:** 11–13 nach Datennachweis.

---

## 4 · GEO-Layer (gilt für jede neue Seite)

Nach der am Original nachgerechneten Rangfolge (`REFERENCE-geo-studie-zahlen-und-shopify-llmstxt`, arXiv 2311.09735 Tabelle 1 — nicht die Zahlen aus dem Skill): **Expertenzitate (+41 %)** > Statistik (+31 %) > Flüssigkeit (+28 %) > Quellen (+27 %). GEO wirkt vor allem für schlecht platzierte Seiten — genau die Lage neuer Seiten.

1. **Antwort zuerst** (Quick-Answer-Box wie auf autounfall.io), dann Ablauf, dann Zahlen-Tabelle, dann FAQ (FAQPage-Schema).
2. **Ein Expertenzitat je Seite** mit Namen und Funktion — Sachverständiger aus dem Netzwerk für Technikseiten, Partnerkanzlei für Erstattungsseiten. Keine erfundenen Zitate; Freigabe dokumentieren.
3. **Zahlen mit Quelle:** BVSK-Korridore (T1.7), Lackaufschläge (T1.4), BGH-Aktenzeichen nur aus dem Repo (`grep -rho "BGH [IVX]* ZR [0-9]*/[0-9]*"`), keine Erfindung.
4. **Ehrlichkeitsregel autounfall.io:** „Keine Rechtsberatung", Verkehrsrechts-Partnerkanzlei unbenannt (Entity-Lock), kein Claimondo außer in Vergleichen.
5. **Interne Verlinkung:** Hub → Spokes → Hub; Cross-Property nur Technik (AU) ↔ Erstattung (CM) je Thema (Achsvermessung, Beilackierung, ADAS, Reparaturbestätigung).
6. **llms.txt beider Properties** um den neuen Hub ergänzen (die DB-/Generat-Inhalte fehlen dort heute; Memory `COORDINATION-wissen-artikel-seo-geo-audit`).

## 5 · Qualitäts-Gates vor jedem Commit (aus den Memories, verbindlich)

* Near-Duplicate: Jaccard über Wort-5-Shingles des Bodys < 40 % zu jeder Nachbarseite, gemessen am gebauten HTML (`aehnlichkeit.mjs`); Positivkontrolle nennen.
* Nachbarseiten **gegenlesen** auf inhaltlichen Widerspruch (Beispiel 23.08.: Beweislast beim Nutzungsausfall).
* Frontmatter gegen den Bestand validieren (`validate-spoke.mjs`); freie `nummer` (H3.21 ff.).
* Substanz-Gate für lokale Seiten: ≥ 3 externe belegbare Fakten, sonst keine Seite.
* Sie-Form, echte Umlaute, keine Superlative ohne Beleg, RDG-Wortlaut (Copy-Lint aus dem Umsetzungsplan).
* Regel 4: Prod-Smoke am gerenderten Text, Sitemap-Zähler (+n), genau 1 H1, Self-Canonical.

## 6 · Offene Fragen an Aaron

1. GSC-Zugang (API oder Export) für die Query-Prüfung vor Welle 1 — wer richtet ihn ein?
2. Feld F (Schadenbild × Bauteil) und Feld G-Ort (Unfallinstandsetzung <Stadt>): erst nach Daten oder als Wette bauen?
3. Expertenzitate: welche Sachverständigen aus dem Netzwerk dürfen namentlich zitiert werden (Freigabe)?
4. Koordination mit der Werkstattbindung-Kasko-Lane (PR #5857): wer schreibt die Kasko-Werkstattbindung-Seite?
