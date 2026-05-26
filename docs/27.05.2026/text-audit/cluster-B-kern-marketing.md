# Text-Audit Cluster B — Kern-Marketing-Seiten
**Datum:** 27.05.2026 | **Auditor:** Claude (Read-Only) | **Branch:** kitta/doc38-hyperlocal-staedte

Geprüfte Seiten: `/vorteile`, `/wie-es-funktioniert`, `/ueber-uns`, `/faq`

---

## /vorteile
**Dateien:** `src/app/vorteile/page.tsx`, `src/components/landing/VersichererTaktikenSection.tsx`, `src/components/landing/SiebenFehlerSection.tsx`, `src/components/landing/sections/WertminderungSandenDannerSection.tsx`, `src/components/landing/sections/TeslaEAutoSection.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/Zahlen | `page.tsx` Z. 53: `{ wert: '8 Mio. €+', label: 'durchgesetzte Ansprüche (Aggregat)' }` | KPI „8 Mio. €+" steht im Trust-Strip ohne Quellenangabe/Fußnotenziffer. Kanon-Fakt laut `brand-constants.ts` D7: „Über 8 Millionen Euro … Stand 14.05.2026". Die Zahl ist korrekt, aber im Trust-Strip fehlt der Standdatum-Hinweis bzw. Methodik-Fußnote (vgl. UWG-Fix-Kommentar Z.47–48 der Datei). | Fußnotenziffer ergänzen (z.B. `wert: '8 Mio. €+²'`) und im `methodikNote`-String aufnehmen: „² Aggregat Partner-Netzwerk, Stand 14.05.2026." |
| [Important] | Rechtschreibung/Grammatik | `page.tsx` Z. 83: `'Gutachten in 5 Werktagen, Besichtigung in 48 h'` | Konsistenzproblem: Bulletpunkt sagt „Besichtigung in 48 h", der übergeordnete Fließtext (Z. 69) und andere Seiten sagen „unter 48 Stunden" / „< 48 h". Keine inhaltliche Abweichung, aber uneinheitliches Kurzformat. | Einheitlich „< 48 h" oder „in unter 48 h" verwenden. |
| [Important] | Cross-Page-Wording | `page.tsx` Z. 126–127: „das Partner-Netzwerk deckt deutsche Großstädte ab. Der nächste DAT-Gutachter aus dem Netzwerk ist meist wenige Kilometer entfernt." | Kanon-Fakten: „hunderte zertifizierte Sachverständige, alle 16 Bundesländer". Die Karte „deckt deutsche Großstädte ab" ist enger formuliert als der Kanon und widerspricht dem Anspruch „alle 16 Bundesländer". Auf `/wie-es-funktioniert` heißt es „72 deutsche Großstädte". | Formulierung angleichen: „bundesweit – alle 16 Bundesländer abgedeckt" oder zumindest „über 72 Großstädte". |
| [Minor] | Tone-of-Voice | `page.tsx` Z. 336: `„Bereit, das Drittel zurückzuholen, das Ihnen zusteht?"` | „das Drittel" impliziert ~33 %, der Kanon nennt 30–40 %. Werblich zugespitzt, aber nicht durch einen Belege gedeckten Fixwert. | Entweder „bis zu 40 %" oder „den gekürzten Anteil" statt „das Drittel". |

---

## /wie-es-funktioniert
**Dateien:** `src/app/wie-es-funktioniert/page.tsx`, `src/components/landing/FounderSection.tsx`, `src/components/landing/SiebenFehlerSection.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Critical] | Fakten/Zahlen | `page.tsx` Z. 115: `'Schwerpunkt ist NRW, aber das Partner-Netzwerk deckt 72 deutsche Großstädte ab'` | Kanon: „hunderte zertifizierte Sachverständige, alle 16 Bundesländer". „72 deutsche Großstädte" ist eine Konkretisierung, die im Kanon nicht belegt ist. Wenn die Zahl korrekt ist, fehlt sie in `brand-constants.ts`; wenn nicht, ist sie faktisch unklar. | Zahl 72 in `brand-constants.ts` D3 als belegten Wert aufnehmen oder durch „alle 16 Bundesländer" ersetzen. |
| [Important] | Rechtschreibung/Grammatik | `page.tsx` Z. 82: `'Eigenkasko-Reparaturen können bei unverschuldetem Unfall via Sicherungsabtretung (§398 BGB) direkt … abgerechnet werden'` | „Eigenkasko" ist kein Standardbegriff; gemeint ist die gegnerische Haftpflicht-Regulierung über Sicherungsabtretung. Zudem: §398 BGB betrifft Abtretung von Forderungen generell – die Sicherungsabtretung der SV-Kosten ist ein eigenes Institut. Die Formulierung verbindet zwei verschiedene Konzepte unscharf. | Präzisieren: „Die Gutachterkosten werden via Sicherungsabtretung (§398 BGB) direkt zwischen Sachverständigem und Versicherung abgerechnet — Sie zahlen keinen Cent vor." |
| [Minor] | Tone-of-Voice | `page.tsx` Z. 361: `'Was bei Online-Kfz-Gutachten rechtlich erlaubt ist (LG Bremen 2026)'` | Angegebenes Gericht/Urteil „LG Bremen 2026" ist für den Nutzer nicht verifizierbar und wirkt wie ein konkretes Az., ohne eines zu sein. | Az. hinzufügen oder Formulierung allgemeiner halten: „Was Online-Kfz-Gutachten rechtlich bedeuten". |

---

## /ueber-uns
**Dateien:** `src/app/ueber-uns/page.tsx`, `src/i18n/messages/de.json` (Schlüssel `ueber_uns`), `src/components/landing/FounderSection.tsx`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/Zahlen | `page.tsx` Z. 97: `'Antwort unter 15 Minuten. Termin in unter 48 Stunden. Gutachten in 48 Stunden. Auszahlung im Schnitt nach 6–8 Wochen.'` (Wert „Schnelligkeit" in WERTE-Array) | Zwei Probleme: (1) „Gutachten in 48 Stunden" widerspricht dem Kanon „Gutachten in 5 Werktagen" (so auf `/vorteile` Z. 83 und `/wie-es-funktioniert` Z. 70). „5 Werktage" ist der konsistente Wert auf allen anderen Seiten. (2) „Auszahlung im Schnitt nach 6–8 Wochen" widerspricht dem Kanon-KPI „Ø 32 Tage" (≈ 4,6 Wochen), der auf `/vorteile`, `/wie-es-funktioniert` und in `brand-constants.ts` D6 genannt wird. | (1) „Gutachten in 48 Stunden" → „Gutachten in 5 Werktagen". (2) „6–8 Wochen" → „Ø 32 Tage" oder entfernen. |
| [Important] | Cross-Page-Wording | `page.tsx` Z. 97 vs. `brand-constants.ts` D6 | „Auszahlung im Schnitt nach 6–8 Wochen" (= 42–56 Tage) vs. Kanon „Ø 32 Tage". Widersprüchlicher Claim in derselben Codebase. | Angleichen: „Ø 32 Tage" (= Kanon D6). |
| [Important] | Rechtschreibung/Grammatik | `de.json` Z. 458: `"Wir sind die Plattform die Geschädigten gibt was ihnen zusteht"` | Fehlendes Komma vor Relativsatz. Korrekt: „Wir sind die Plattform, die Geschädigten gibt, was ihnen zusteht." Außerdem: Doppeltes Relativpronomen (Plattform die … gibt / Plattform die Geschädigten … was) lässt sich klarer formulieren. | „Wir sind die Plattform, die Geschädigten zurückgibt, was ihnen zusteht — nicht das, was die Versicherung gerade noch durchwinkt." |
| [Minor] | Tone-of-Voice | `page.tsx` Z. 274: BGH-Refs `VI ZR 65/18, VI ZR 174/24, VI ZR 119/04` | `VI ZR 119/04` (Restwert, regionaler Markt) taucht hier im Zusammenhang mit der Grundlage für „unabhängigen Sachverständigen" auf. Das Az. passt thematisch nicht zu dieser Aussage. | Az. VI ZR 119/04 entfernen oder durch das passende `VI ZR 67/06` ersetzen (allg. Gutachterkosten-Erstattung). |

---

## /faq
**Dateien:** `src/app/faq/page.tsx`, `src/app/faq/FaqClient.tsx`, `src/app/faq/faqs.ts`

| Severity | Brille | Fundstelle (Datei + String) | Befund | Vorschlag |
|---|---|---|---|---|
| [Critical] | Rechtschreibung/Grammatik | `faqs.ts` Z. 108: `'"Vielen Dank, aber ich nehme meinen Recht auf einen unabhängigen Sachverständigen und Fachanwalt meiner Wahl wahr."'` | Grammatikfehler: „meinen Recht" ist falsch. „Recht" ist Neutrum → korrekt: „mein Recht". Dieser Satz ist als wörtliche Empfehlung für den Nutzer formuliert (quasi ein Skript, das er sagen soll) — ein Grammatikfehler hier wirkt besonders unprofessionell. | → `„mein Recht"`. |
| [Important] | Fakten/Zahlen | `faqs.ts` Z. 138: `'Bundesweiter Durchschnitt: 6–8 Wochen vom Unfall bis zur vollständigen Auszahlung.'` | Widerspruch zu Kanon-KPI „Ø 32 Tage" (≈ 4,6 Wochen) auf anderen Seiten und in `brand-constants.ts` D6. „6–8 Wochen" gilt als „bundesweiter Durchschnitt", das impliziert, Claimondo sei langsamer als der Durchschnitt. | Entweder als Markt-Benchmark kennzeichnen: „Branchendurchschnitt ohne Anwalt: 6–8 Wochen; mit Claimondo: Ø 32 Tage." Oder: konsistent „Ø 32 Tage" verwenden. |
| [Important] | Fakten/Zahlen | `faqs.ts` Z. 48: `'BGH VI ZR 174/24 aus 2025 gilt'` | Die Erwähnung „aus 2025" als Klammerbemerkung impliziert, das Urteil sei erst kürzlich ergangen und deshalb besonders relevant. Faktisch korrekt (2024/25), aber der Hinweis in Klammern wirkt redaktionell unfertig; konsistenter Stil wäre ohne Jahreshinweis. | Klammer entfernen oder als vollständige Information: „BGH VI ZR 174/24 (Urteil vom 14.01.2025)" |
| [Important] | Cross-Page-Wording | `faqs.ts` Z. 133–134: `'der schriftliche Gutachten-Bericht liegt bei Standard-Schäden innerhalb von 48 Stunden vor'` | Widerspruch zu Kanon „Gutachten in 5 Werktagen" (`brand-constants.ts` implizit, `/vorteile` Z. 83, `/wie-es-funktioniert` Z. 70). „48 Stunden" ist ambig: die Vor-Ort-Besichtigung in 48 h, aber das schriftliche Gutachten ist 5 Werktage. | Formulierung trennen: „Besichtigung in unter 48 h; schriftliches Gutachten in 5 Werktagen." |
| [Minor] | Rechtschreibung/Grammatik | `faqs.ts` Z. 23: `'11.900 € → nach Versicherer-Kürzungen bleiben rund 8.000 € übrig.'` | 11.900 € minus 30–40 % ergibt 7.140–8.330 €. „rund 8.000 €" liegt am oberen Ende der 30%-Kürzung (–29,4 %) und wäre eigentlich eher ~7.500 € bei 37 % (mittlerer Wert). Nicht falsch, aber das Beispiel stützt den Kanon-Wert nicht optimal. | Beispiel anpassen: „Gutachtenwert 12.500 € → nach Kürzung (35 %): rund 8.100 €" oder Rechenweg explizit machen. |

---

## Extrahierte Fakten/Zahlen/Claims

| Seite | Wert/Claim | Fundstelle |
|---|---|---|
| /vorteile | 30–40 % Versicherer-Kürzung | `page.tsx` Z. 50, 160; `VersichererTaktikenSection.tsx` Z. 112 |
| /vorteile | 8 Mio. €+ durchgesetzte Ansprüche | `page.tsx` Z. 52 |
| /vorteile | 0 € Eigenanteil nach §249 BGB | `page.tsx` Z. 52 |
| /vorteile | Ø 32 Tage bis Auszahlung | `page.tsx` Z. 53, 339 |
| /vorteile | Besichtigung in 48 h | `page.tsx` Z. 83 |
| /vorteile | Gutachten in 5 Werktagen | `page.tsx` Z. 83 |
| /vorteile | BGH VI ZR 65/18 (UPE) | `page.tsx` Z. 141, 155 |
| /vorteile | BGH VI ZR 174/24 (Beilackierung) | `page.tsx` Z. 141, 155 |
| /vorteile | BGH VI ZR 38/22 ff. (Werkstattrisiko) | `page.tsx` Z. 141, 160 |
| /vorteile | BGH VI ZR 357/03 (Wertminderung) | `page.tsx` Z. 150; `WertminderungSandenDannerSection.tsx` Z. 47 |
| /vorteile | Sanden/Danner: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % | `page.tsx` Z. 150 |
| /wie-es-funktioniert | Ø 32 Tage bis Auszahlung | `page.tsx` Z. 50, 81 |
| /wie-es-funktioniert | < 15 Min Rückruf | `page.tsx` Z. 47 |
| /wie-es-funktioniert | < 48 h Gutachter vor Ort | `page.tsx` Z. 48 |
| /wie-es-funktioniert | 5 Werktage bis Gutachten steht | `page.tsx` Z. 49 |
| /wie-es-funktioniert | 72 deutsche Großstädte | `page.tsx` Z. 115 |
| /wie-es-funktioniert | BGH VI ZR 65/18, VI ZR 174/24, VI ZR 38/22 ff. | `page.tsx` Z. 76–77 |
| /ueber-uns | Gegründet 2025 Köln | `page.tsx` Z. 246; `de.json` Z. 463 |
| /ueber-uns | Nicolas Kitta (CEO) + Aaron Sprafke (COO) | `page.tsx` Z. 255–257 |
| /ueber-uns | Hansaring 10, 50670 Köln | `page.tsx` via HQ_STREET/HQ_POSTAL_CODE/HQ_CITY |
| /ueber-uns | 30–40 % Kürzung | `page.tsx` Z. 291 |
| /ueber-uns | Gutachten in 48 Stunden ⚠️ | `page.tsx` Z. 97 (Widerspruch zu Kanon „5 Werktage") |
| /ueber-uns | Auszahlung im Schnitt 6–8 Wochen ⚠️ | `page.tsx` Z. 97 (Widerspruch zu Kanon „Ø 32 Tage") |
| /ueber-uns | BGH VI ZR 65/18, VI ZR 174/24, VI ZR 119/04 | `page.tsx` Z. 274 |
| /faq | 30–40 % Prüfdienst-Kürzung | `faqs.ts` Z. 23, 178; `FaqClient.tsx` Z. 127 |
| /faq | BGH VI ZR 38/22 ff. (Werkstattrisiko, Datum 16.01.2024) | `faqs.ts` Z. 78 |
| /faq | BGH VI ZR 357/03 (Wertminderung, keine starre Altersgrenze) | `faqs.ts` Z. 88, 168 |
| /faq | BGH VI ZR 67/91 (130%-Regel) | `faqs.ts` Z. 73 |
| /faq | BGH VI ZR 119/04 (regionaler Restwert) | `faqs.ts` Z. 53, 223, 283, 288 |
| /faq | BGH VI ZR 53/09 (Markenwerkstatt unter 3 Jahren) | `faqs.ts` Z. 268 |
| /faq | BGH VI ZR 280/22 (SV-Risiko) | `VersichererTaktikenSection.tsx` Z. 72 |
| /faq | §195 BGB (3-Jahres-Verjährung) | `faqs.ts` Z. 193 |
| /faq | §398 BGB (Sicherungsabtretung) | `faqs.ts` Z. 188 |
| /faq | Bundesweiter Durchschnitt 6–8 Wochen ⚠️ | `faqs.ts` Z. 138 (Widerspruch zu Kanon „Ø 32 Tage") |
| /faq | Schriftliches Gutachten „innerhalb von 48 Stunden" ⚠️ | `faqs.ts` Z. 133 (Widerspruch zu Kanon „5 Werktage") |
| /faq | Sanden/Danner: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % | `faqs.ts` Z. 88 |
| /faq | Nutzungsausfall Gruppe A–L, ~23 € bis 175 €/Tag | `faqs.ts` Z. 93, 228 |

---

*Audit-Hinweis: BGH VI ZR 235/13 (Anwaltskosten) ist im Kanon aufgeführt und wird korrekt in `src/data/`, `src/content/`, `src/lib/seo/brand-fakten-library.ts` und weiteren Dateien verwendet — taucht aber auf den vier geprüften Cluster-B-Seiten selbst nicht explizit auf (nur indirekt über „Anwaltskosten trägt die Gegenseite"). Kein Finding, nur Hinweis.*
