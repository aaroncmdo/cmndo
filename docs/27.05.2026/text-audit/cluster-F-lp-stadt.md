# Text-Audit Cluster F — Landingpage + Stadt-Seiten

Audit-Datum: 27.05.2026  
Prüfer: Claude (Read-only)  
Scope: `/kfzgutachter-lp`, `/kfz-gutachter/[stadt]` (Template + Daten), `/kfz-gutachter-koeln` (Alias)

---

## `/kfzgutachter-lp` — `src/app/kfzgutachter-lp/page.tsx` + `warum-cards-data.ts`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| **[Important]** | Fakten/Zahlen | `page.tsx` Z. 232 — `TrustBar`-Items | `'100+ DAT-geprüfte Gutachter'` — der Kanon sagt „hunderte zertifizierte Sachverständige". `100+` ist eine Untergrenze, während an anderer Stelle auf der selben Seite (Z. 496) `'100+ zertifizierte Sachverständige in Köln, Düsseldorf, Essen, Dortmund und Bochum'` steht (also allein NRW). Die Formulierung „DAT-geprüft" ist zudem unspezifisch: Kanon sagt „DAT-/BVSK-zertifiziert". | Angleichen an: `'Hunderte zertifizierte Sachverständige'` oder mindestens `'100+ DAT-/BVSK-zertifizierte Gutachter'`, um die dual-Zertifizierung zu reflektieren. |
| **[Important]** | Fakten/Zahlen | `page.tsx` Z. 231 — `TrustBar`-Item | `'2.000+ vermittelte Fälle'` — die KPI-Konstante in der Stadt-Template-Seite lautet `'2.000+ vermittelte Schadensfälle'` (staedte-template). Leichter Wording-Unterschied, keine Zahl abweichend. Im Kanon kein exakter Fallzahl-Wert fixiert, aber `Schadensfälle` ist präziser als `Fälle`. | Harmonisieren auf `'2.000+ vermittelte Schadensfälle'`. |
| **[Important]** | Fakten/Zahlen | `page.tsx` Z. 232 — `TrustBar`-Item | `'5,0 ★ Google'` — diese Zahl ist nicht im Kanon gesichert. Eine hartkodierte Bewertungsnote ohne Datum/Basis und ohne Methodik-Hinweis. Google-Bewertungen ändern sich dynamisch. | Ergänzen um Datum oder Basis-Anzahl, z. B. `'5,0 ★ Google (Stand 05/2026, N=47)'`, oder auf einen dynamischen Wert aus der LiveCountPill-Logik auslagern. |
| **[Important]** | Fakten/Zahlen | `page.tsx` Z. 557 — FAQ `'60 % der Geschädigten verlieren Geld …'` | Die 60-%-Aussage erscheint auch in `service-pitch.ts` (SERVICE_PITCH_USPS Cluster 1) mit dem Zusatz `'(anwaltliche Praxis-Erfahrung)'`. Auf der LP fehlt diese Quellenangabe — die nackte Zahl wirkt wie eine belegte Statistik, ist aber Praxis-Einschätzung. Kein Widerspruch zum Kanon, aber UWG §5-Risiko. | Einfügen: `'60 % der Geschädigten verlieren Geld am Telefon mit der Versicherung (Erfahrungswert aus anwaltlicher Praxis). Mit uns nicht.'` |
| **[Important]** | Fakten/Zahlen | `warum-cards-data.ts` Z. 69 — `hinweis` in Karte `kuerzungen` | `'30–40 % davon holt unsere Partnerkanzlei BGH-konform zurück.'` — Kanon-Fakt lautet „30–40 % der Schadenspositionen von Versicherer-Prüfdiensten **gekürzt**". Die Karte dreht die Aussage leicht: „30–40 % … **zurückgeholt**" — das ist eine andere Behauptung (nicht Kürzungsquote, sondern Rückholquote). | Entweder am Kanon bleiben: `'Versicherer kürzen bei 30–40 % der Schadenspositionen — unsere Partnerkanzlei holt die Kürzungen BGH-konform zurück.'` Oder die Rückholquote separat belegen. |
| **[Minor]** | ToV | `page.tsx` Z. 266 — Überschrift `WarumUnabhaengig` | `'Warum NIE der Versicherer-Gutachter? Wessen Brot ich ess …'` — das umgangssprachliche Sprichwort-Fragment passt zum Aufhänger, aber `NIE` (Großbuchstaben für Betonung) und das unvollendete Sprichwort sind stilistisch informell. Keine Regelabweichung, da Werbetexte Emphase erlauben. | Optional: prüfen ob `'Warum nicht der Versicherer-Gutachter?'` als H2 + `'Wessen Brot ich ess, dessen Lied ich sing.'` als Sub-Kicker sauberer wirkt. |
| **[Minor]** | Fakten/Zahlen | `page.tsx` Z. 289 — `WAS_WIR`-Item 4 | `'Ø 32 Tage bis das Geld auf Ihrem Konto ist.'` — korrekte Kanon-Zahl. Konsistenz-Check: Die Methodik-Note (Z. 545–547) erklärt die 32-Tage-Zahl explizit. Kein Finding, nur dokumentiert zur Vollständigkeit. | Keine Aktion nötig. |
| **[Minor]** | Brille 2 (BGH-Az.) | `page.tsx` Z. 356 — `NICHT_UNSERE_SACHE`-Item 3 | `'(VI ZR 119/04)'` als Beleg für die 750 €-Bagatellgrenze. BGH VI ZR 119/04 betrifft das **Restwert-Wahlrecht** (regionaler Markt), **nicht** die Bagatellgrenze. Die korrekte Fundstelle für die 750 €-Grenze wäre AG/LG-Rspr. (keine BGH-Leitentscheidung) oder formlos `'nach aktueller Rechtsprechung'`. Im `BghAuthorityGrid` wird VI ZR 119/04 korrekt als `'Restwert regional'` bezeichnet. | Az. korrigieren: `VI ZR 119/04` entfernen oder durch `'nach aktueller Rechtsprechung'` ersetzen; alternativ auf den BGH-Beschluss von 2015 (VI ZA 35/14) hinweisen, der die 750 €-Linie implizit trägt, oder die Grenze ohne Az. nennen. |
| **[Minor]** | Ton | `page.tsx` Z. 567 — FAQ `'Was ist eine Sicherungsabtretung?'` | `'Branchen-Standard bei unverschuldetem Unfall.'` — korrekt und knapp, aber letzter Satz steht abrupt ohne Verb. Kein grammatischer Fehler (Nominalsatz im Deutschen erlaubt), aber wirkt abgehackt. | Optional: `'Dies ist Branchen-Standard bei unverschuldetem Unfall.'` |

---

## `/kfz-gutachter/[stadt]` — Template `src/app/kfz-gutachter/[stadt]/page.tsx` + `src/app/kfz-gutachter/staedte.ts`

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| **[Important]** | Fakten/Zahlen | `page.tsx` Z. 52–55 — `KPIS`-Konstante | `'8 Mio. €+'` als KPI-Wert für `'Schadensersatz durchgesetzt'`. Kanon-Wert: **über 8 Millionen Euro** (Stand 14.05.2026). Die `8 Mio. €+`-Formulierung ist korrekt, aber die Methodik-Note (Z. 58–59) gibt `Stand 14.05.2026` an — das ist inzwischen über 6 Wochen alt. | Stand-Datum in der Methodik-Note auf aktuellen Wert pflegen, oder generisch `'Stand 05/2026'` schreiben. |
| **[Important]** | Fakten/Zahlen | `page.tsx` Z. 286 — Hero-CTA | `'Jetzt anrufen — Rückruf in 5 Min'` (Hero-Button). An anderen Stellen im Template und auf der LP steht konsistent **`unter 15 Minuten`** (Z. 391, Z. 563, `service-pitch.ts` Z. 39). Die `5 Min`-Angabe ist die kürzere Schätzung und weicht vom einheitlichen 15-Min-Kanon ab. | Anpassen auf `'Jetzt anrufen — Rückruf in 15 Min'` für Cross-Page-Konsistenz. |
| **[Important]** | Cross-Page | `staedte.ts` Z. 1–8 — Kommentar-Warnung | `'Partner-SVs-Zahlen für Welle 4 sind konservative Schätzwerte ohne harte Partnerzusagen'` — dieser Hinweis gilt für die `partnerSVs`-Felder aller Welle-4-Städte (Z. 591–Ende). Das Template rendert `partnerSVs` jedoch **nicht** direkt im UI-Text — kein nutzersichtbarer Fehler, aber relevant für Fakten-Review. | Audit bestätigt: `partnerSVs` taucht in keinem JSX-String auf (nur in JSON-LD), nutzerseitig kein Finding. |
| **[Important]** | Fakten/Zahlen | `staedte.ts` Z. 1988 — Düsseldorf-FAQ | `'BGH: 715,81 €'` als Bagatellgrenze. Dieselbe Formulierung auch in der Bonn-FAQ (Z. 2084). Der Wert `715,81 €` entstammt der alten BGH-Rspr. (2003); die `'aktuelle Rechtsprechung rund 1.000 €'` wird im selben Satz korrekt nachgeschoben. Der Mix aus veralteter BGH-Zahl und aktuellem Richtwert kann verwirren. Die LP-FAQ (Z. 562) schreibt korrekt `'Schaden über 750 €'` ohne veraltete BGH-Zahl. | Vereinheitlichen: Entweder nur `'ab rund 750–1.000 € Reparaturkosten'` schreiben, oder den alten Wert streichen und nur die aktuelle Praxis nennen. |
| **[Minor]** | Fakten/Az. | `page.tsx` Z. 138 — `buildStadtFaq`, 130%-Regel-Antwort | `'130%-Regel (BGH VI ZR 67/91)'` — korrekte Fundstelle; im `BghAuthorityGrid` ebenfalls korrekt (`VI ZR 67/91`). Kein Finding. | — |
| **[Minor]** | Grammatik | `page.tsx` Z. 344 — `Lokal-Block` | `'rund {s.bevoelkerung} Einwohner'` + `'Bundesland {s.bundesland}'` — Interpolation korrekt. Formulierung `'(rund {X} Einwohner, Bundesland {Y})'` ist grammatikalisch ein Einschub ohne Hauptverb. Kein Fehler (Klammer-Einschub), aber leicht abgehackt. | Optional: `'({X} Einwohner · {Y})'` für kompakteres Scanning. |
| **[Minor]** | Ton | `page.tsx` Z. 299 — Hero-Sub `'Anonyme Beratung · Keine Bindung · DSGVO-konform'` | Stil-konsistent mit LP. Kein Finding. | — |
| **[Minor]** | Cross-Page | Hyperlocal-Daten — Köln FAQ `staedte.ts` Z. 1940 | Bagatellgrenze `'rund 1.000 € brutto'` — LP verwendet `'750 €'`, Köln-FAQ `'1.000 € brutto'`, Düsseldorf-FAQ `'715,81 € / rund 1.000 €'`. Drei verschiedene Schwellenwert-Formulierungen auf verwandten Seiten. | Auf eine Formulierung einigen; Empfehlung: `'ab etwa 750 € (netto) Reparaturschaden'` als einheitlichen Richtwert, ohne veraltete BGH-Zahl. |

---

## `/kfz-gutachter-koeln` — `src/app/(marketing)/kfz-gutachter-koeln/page.tsx`

Diese Seite ist ein reiner Alias auf `/kfz-gutachter/[stadt]` mit `stadt='koeln'`. Sie rendert identischen Inhalt (via `KfzGutachterStadtPage({ params: ALIAS_PARAMS })`). Alle Findings der Stadt-Seite (Template + Köln-Hyperlocal) gelten hier ebenso. Keine zusätzlichen Texte vorhanden.

**Kein eigenständiges Finding.**

---

## Extrahierte Fakten/Zahlen/Claims

| Seite/Datei | Wert/Claim | Status |
|---|---|---|
| `kfzgutachter-lp/page.tsx` TrustBar | `2.000+ vermittelte Fälle` | Kanon nicht exakt; in Stadt-Template: `2.000+ vermittelte Schadensfälle` — Wording-Divergenz |
| `kfzgutachter-lp/page.tsx` TrustBar | `100+ DAT-geprüfte Gutachter` | Kanon: „hunderte zertifizierte Sachverständige" — Zahl und Qualifikations-Label divergieren |
| `kfzgutachter-lp/page.tsx` TrustBar | `5,0 ★ Google` | Nicht im Kanon; dynamisch anfällig, kein Datum/Basisgröße |
| `kfzgutachter-lp/page.tsx` | `Ø 32 Tage bis Auszahlung` | Kanon-konform |
| `kfzgutachter-lp/page.tsx` FAQ | `60 % der Geschädigten verlieren Geld…` | Kanon-konform, aber fehlende Quellen-Qualifizierung auf LP (vs. `service-pitch.ts`) |
| `kfzgutachter-lp/page.tsx` NICHT_UNSERE_SACHE | Az. `VI ZR 119/04` für 750 €-Bagatellgrenze | **Falsches Az.** — VI ZR 119/04 = Restwert-Wahlrecht, nicht Bagatellgrenze |
| `kfzgutachter-lp/warum-cards-data.ts` Karte `kuerzungen` | `30–40 % davon holt … zurück` | Kanon nennt 30–40 % als Kürzungsquote, nicht Rückholquote — Aussagedrehung |
| `kfzgutachter-lp/page.tsx` PROZESS | `Rückruf in unter 15 Minuten` | Kanon-konform |
| `kfz-gutachter/[stadt]/page.tsx` KPIS | `8 Mio. €+` Schadensersatz | Kanon-konform (Stand 14.05.2026 in Methodik-Note) |
| `kfz-gutachter/[stadt]/page.tsx` Hero-CTA | `Rückruf in 5 Min` | **Abweichung** vom Kanon-Standard `unter 15 Minuten` |
| `staedte.ts` DUS/Bonn-FAQs | `BGH: 715,81 €` als Bagatellgrenze | Veraltete BGH-Zahl — inkonsistent mit LP (`750 €`) und Köln-FAQ (`1.000 €`) |
| `staedte.ts` Köln-FAQ | Bagatellgrenze `1.000 € brutto` | Inkonsistent mit LP-FAQ (`750 €`) und DUS/Bonn-FAQ (`715,81 €`) |
| `service-pitch.ts` | `32 Tage Ø Auszahlung statt 4–6 Monate Branchen-Durchschnitt` | Kanon-konform; wird konsistent auf LP + Stadt-Template verwendet |
| `service-pitch.ts` SERVICE_PITCH_USPS | `Hunderte DAT-/BVSK-zertifizierte Sachverständige` | Kanon-konform; aber LP-TrustBar weicht mit `100+ DAT-geprüfte Gutachter` ab |
| `BghAuthorityGrid.tsx` | Az. `VI ZR 38/22 ff.`, `VI ZR 65/18`, `VI ZR 174/24`, `VI ZR 53/09`, `VI ZR 119/04`, `VI ZR 357/03`, `VI ZR 67/91`, `VI ZR 280/22` | Alle im Grid korrekt dem jeweiligen Thema zugeordnet |
| `kfzgutachter-lp/page.tsx` FAQ Wertminderung | `BGH VI ZR 357/03` korrekt zitiert | Kanon-konform |
| `kfzgutachter-lp/page.tsx` FAQ Kürzungen | `VI ZR 65/18, VI ZR 174/24, VI ZR 38/22 ff.` | Kanon-konform |
| `FounderSection.tsx` | `Nicolas Kitta (CEO) + Aaron Sprafke (COO)` | Kanon-konform |
| `staedte.ts` Köln | `37.636 Verkehrsunfälle 2025` | Quellenbelegt (Polizei Köln); nur im Hyperlocal-Block, nicht als pauschaler Claim |
