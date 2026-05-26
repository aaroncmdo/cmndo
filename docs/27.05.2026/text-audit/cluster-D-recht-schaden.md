# Text-Audit Cluster D — Recht-/Schaden-Content

Datum: 2026-05-27 | Prüfer: Claude Sonnet 4.6 | Cluster: D (6 Seiten)

---

## /haftpflicht

Datei: `src/app/haftpflicht/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | `SpokeCtaBand headline` (Zeile 113) | CTA verwendet "du/dir"-Anrede: „Unklar, welcher Anspruch **dir** zusteht? Wir prüfen **deinen** Fall" — inkonsistent mit dem Sie-ToV der restlichen Seite | „Unklar, welcher Anspruch Ihnen zusteht? Wir prüfen Ihren Fall kostenfrei." |

---

## /kfz-haftpflicht-schaden

Datei: `src/content/claimondo/cornerstones/kfz-haftpflicht-schaden.md`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Critical | Recht/Az. | Quellen-Verzeichnis Zeile 394 + FAQ #7 (Zeile 350) | **130%-Regel mit BGH VI ZR 70/04 belegt** — dieser Az. betrifft das Integritätsinteresse allgemein, ist aber nicht das Leiturteil. Das kanonische Leiturteil für die 130%-Regel ist **BGH VI ZR 67/91** (6-Monats-Nutzungspflicht). VI ZR 70/04 ist ein nachgeordnetes Folgeurteil. Andere Seiten im Projekt (HauptseitePremium, BghAuthorityGrid, kfz-gutachter/[stadt]) verwenden korrekt VI ZR 67/91. | Primär-Az. im FAQ und Quellen-Verzeichnis auf **BGH VI ZR 67/91** ändern; VI ZR 70/04 kann als sekundäre Referenz bleiben. |
| Critical | Recht/Az. | Quellen-Verzeichnis Zeile 395 + In-Text Zeile 344 | **BGH VI ZR 53/09** wird als „Markenwerkstatt-Recht (Porsche-Urteil)" eingeordnet — der Kanon ordnet VI ZR 53/09 der „freien Werkstattwahl / keine Pflicht zur Kostenminimierung" zu. VI ZR 53/09 stärkt die Werkstattwahl allgemein, nicht primär das Markenwerkstatt-Recht. Das Markenwerkstatt-Recht beruht auf dem BGH-Komplex um VI ZR 91/09 (23.02.2010) und VI ZR 320/12 (14.05.2013). Die Bezeichnung ist zumindest irreführend, könnte aber intern konsistent sein wenn das Porsche-Urteil tatsächlich VI ZR 53/09 ist — die Zuordnung sollte durch einen Juristensatz verifiziert werden. | Kurz-Beschreibung präzisieren: „BGH VI ZR 53/09 — freie Werkstattwahl / kein Werkstattnetz-Zwang". Markenwerkstatt separat als VI ZR 91/09 führen. |
| Important | ToV | Gesamtseite (z.B. Zeilen 30, 36, 40, 61, 120, 150, 209, 276, 323, 350, 440) | **Durchgängige du/dir-Ansprache** im Cornerstone-Fließtext, FAQ und CTA. Das /haftpflicht-Hub und die anderen Pillar-Seiten dieses Clusters verwenden „Sie/Ihnen". Interne Inkonsistenz im Cluster. | Entweder das Cornerstone auf „Sie" umstellen oder — wenn du/dir als bewusste SEO-Entscheidung für dieses Format gilt — die Inkonsistenz intern dokumentieren. Empfehlung: auf „Sie" vereinheitlichen. |
| Important | Fakten | Zeile 40 | Behauptung „holt statistisch 20–80 % mehr aus der Versicherung als ohne" — Zahl ohne Quellenangabe, Streuband (20–80 %) extrem breit und daher kaum belastbar als Faktenbeleg. | Beleg ergänzen oder Formulierung abschwächen: „häufig deutlich mehr" mit Link auf /schadensreport-2026. |
| Minor | Stil | Zeile 535 | „Letzte fachliche Überprüfung: **pending**" sichtbar im Fließtext — das steht unverändert im gerenderten Markdown und wirkt für Nutzer unprofessionell. | Entweder echtes Datum eintragen oder den Abschnitt aus dem gerenderten Body ausblenden (wird von `MarkdownRenderer` gerendert). |

---

## /unverschuldeter-unfall-rechte

Datei: `src/app/unverschuldeter-unfall-rechte/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | `SpokeCtaBand headline` (Zeile 256) | CTA-Band nutzt du-Anrede: „Hol **dir** alles, was **dir** zusteht" — die restliche Seite ist konsequent in Sie-Ansprache. | „Holen Sie sich alles, was Ihnen zusteht — 0 €." |
| Minor | Fakten | Zeile 103 | Klammer-Formulierung „(vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer)" ist juristisch korrekt, aber für die Zielgruppe (Geschädigte) unnötig verwirrend — der Kontext suggeriert, dass bei unverschuldetem Unfall doch Eigenkosten entstehen können. | Umformulierung: „(bei anerkannter Allein-Haftung der Gegenseite)" oder Klammer ganz streichen und stattdessen in den FAQ-Block auslagern. |

---

## /unfall-was-tun-als-geschaedigter

Datei: `src/app/unfall-was-tun-als-geschaedigter/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | `SpokeCtaBand headline` (Zeile 302) | CTA-Band: „Wir führen **dich** durch alles" — Seite sonst konsequent Sie-Anrede. | „Wir führen Sie durch alles — 0 €." |
| Minor | Recht | `TYPEN`-Array Eintrag Parkplatzunfall (Zeile 63–64) | Text: „Häufig Haftungsquoten: auf Parkplätzen gelten Schrittgeschwindigkeit und gegenseitige Rücksichtnahme." — Der erste Teil des Satzes ist kein vollständiger Satz und grammatisch unvollständig (nach dem Doppelpunkt fehlt ein Subjekt). | Z.B. „Auf Parkplätzen gelten Schrittgeschwindigkeit und gegenseitige Rücksichtnahme — die Haftungsquote variiert stark." |

---

## /versicherung-schickt-gutachter

Datei: `src/app/versicherung-schickt-gutachter/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | `SpokeCtaBand headline` (Zeile 235) | CTA-Band: „kostet **dich** 0 €" — Seite sonst konsequent Sie-Anrede. | „Eigener Gutachter statt Versicherer-Prüfer — für Sie 0 €." |
| Important | ToV | Cross-Link Zeile 222 | Interner Link-Text „Unverschuldeter Unfall: **deine** Rechte im Überblick" — Sie-Kontext der Seite. | „Unverschuldeter Unfall: Ihre Rechte im Überblick" |
| Minor | Recht | VERGLEICH-Tabelle Zeile 52 | Zeile „Ihre Kosten: 0 € (§ 249 BGB)" — der Paragraph legt die Kostenfreiheit nicht direkt fest, sondern der Erstattungsanspruch folgt aus dem Naturalrestitutionsprinzip in Verbindung mit BGH VI ZR 67/06. § 249 BGB als Alleinbeleg ist zumindest unvollständig. | Az. ergänzen: „0 € (§ 249 BGB, BGH VI ZR 67/06)" |

---

## /gegnerische-versicherung-zahlt-nicht

Datei: `src/app/gegnerische-versicherung-zahlt-nicht/page.tsx`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| Important | ToV | `SpokeCtaBand headline` (Zeile 269) | CTA: „Wir setzen **deinen** Anspruch durch" — Seite sonst konsequent Sie-Anrede. | „Wir setzen Ihren Anspruch durch — 0 €." |
| Important | ToV | Cross-Link Zeile 256 | Link-Text „Unverschuldeter Unfall: **deine** Rechte im Überblick" — Sie-Kontext. | „Unverschuldeter Unfall: Ihre Rechte im Überblick" |
| Minor | Recht | FAQ Zeile 90 | „typisch 4–6 Wochen" für Prüffrist. Der Kanon nennt 4 Wochen als Frist (bei klarer Haftung), die BGH-Rechtsprechung hat keine starre 6-Wochen-Grenze normiert. Die Formulierung „4–6 Wochen" ist gängige Praxis, aber nicht BGH-belegt. | Formulierung präzisieren: „4 Wochen bei klarer Haftungslage, bei komplexen Sachverhalten nach Umständen länger (BGH-Linie)" — oder Az. ergänzen. |

---

## Extrahierte Fakten/Zahlen/Claims

| Seite | Wert | Fundstelle |
|---|---|---|
| `/kfz-haftpflicht-schaden` | BGH VI ZR 235/13 (08.07.2014) — Anwaltskosten als Verzugsschaden | Zeile 393 |
| `/kfz-haftpflicht-schaden` | BGH VI ZR 70/04 (15.02.2005) — 130%-Regel Integritätsinteresse | Zeile 394 ⚠ Primär-Az. für 130%-Regel ist VI ZR 67/91 |
| `/kfz-haftpflicht-schaden` | BGH VI ZR 53/09 (20.10.2009) — Markenwerkstatt-Recht / freie Werkstattwahl | Zeile 395 |
| `/kfz-haftpflicht-schaden` | BGH VI ZR 67/06 (23.01.2007) — Sachverständigen-Kosten | Zeile 401 |
| `/kfz-haftpflicht-schaden` | BGH VI ZR 357/03 (23.11.2004) — merkantile Wertminderung | Zeile 400 ✓ |
| `/kfz-haftpflicht-schaden` | BGH VI ZR 393/02 (29.04.2003) — Restwert regional | Zeile 399 |
| `/kfz-haftpflicht-schaden` | § 195 BGB Verjährung 3 Jahre | Zeile 47, 204 ✓ |
| `/kfz-haftpflicht-schaden` | § 288 BGB Verzugszinsen 5 Prozentpunkte über Basiszins | Zeile 199 ✓ |
| `/kfz-haftpflicht-schaden` | Nutzungsausfall 27–175 €/Tag (Sanden/Danner) | Zeile 168, 353 |
| `/kfz-haftpflicht-schaden` | Hinterbliebenengeld 5.000–15.000 € § 844 Abs. 3 BGB | Zeile 374 |
| `/kfz-haftpflicht-schaden` | „20–80 % mehr" mit Anwalt — ohne Quellenbeleg | Zeile 40, 440 ⚠ |
| `/unverschuldeter-unfall-rechte` | BGH VI ZR 53/09 — freie Werkstattwahl | Zeilen 98, 184 |
| `/unfall-was-tun-als-geschaedigter` | BGH VI ZR 235/13 — Anwaltskosten | Zeile 86 ✓ |
| `/unfall-was-tun-als-geschaedigter` | § 195 BGB Verjährung 3 Jahre, § 199 Abs. 2 BGB 30 Jahre Personenschäden | Zeile 96 ✓ |
| `/versicherung-schickt-gutachter` | BGH VI ZR 67/06 — SV-Kosten trägt Versicherer | Zeilen 27, 69 ✓ |
| `/versicherung-schickt-gutachter` | BGH VI ZR 357/03 — Wertminderung ab ~750 € Gutachtengrenze | Zeile 79 ✓ Az. korrekt (Wertminderung) |
| `/gegnerische-versicherung-zahlt-nicht` | BGH VI ZR 280/22 — Werkstatt-/SV-Risiko trägt Schädiger | Zeilen 41, 95 ✓ |
| `/gegnerische-versicherung-zahlt-nicht` | § 288 Abs. 1 BGB — 5 Prozentpunkte über Basiszinssatz | Zeile 90 ✓ |
| `/gegnerische-versicherung-zahlt-nicht` | Prüffrist „4–6 Wochen" | Zeilen 85, 90 ⚠ kein BGH-Az. belegt |
