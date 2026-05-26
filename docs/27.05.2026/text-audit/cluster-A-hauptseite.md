# Text-Audit Cluster A — Hauptseite `/` + `/schaden-melden`

Audit-Datum: 27.05.2026  
Auditor: Claude (read-only, keine Edits)  
Prüf-Brillen: 1 Rechtschreibung/Grammatik/Umlaute · 2 Tone-of-Voice · 3 Fakten/Zahlen · 4 Cross-Page-Wording

---

## `/` — Hauptseite

### Findings

| Severity | Brille | Fundstelle (Datei + String-Auszug) | Befund | Vorschlag |
|----------|--------|-------------------------------------|--------|-----------|
| **[Critical]** | Fakten/Zahlen | `HauptseitePremium.tsx` Z. 273: `„Jetzt anrufen — Rückruf in 5 Min"` | Widerspruch zum Kanon-Fakt und zum eigenen KPI-Block (`< 15 Min bis zum ersten Rückruf`, Z. 56). Auch `HomeLeadFormClient.tsx` Z. 98 (`Rückruf in 5 Minuten`) und `StickyCallBar.tsx` Z. 110/129 (`unter 15 Minuten`) widersprechen sich gegenseitig. `5 Min` ist nirgends im Kanon belegt. | Einheitlich `< 15 Min` oder `Rückruf in unter 15 Minuten` verwenden — konsistent mit KPI-Strip und StickyCallBar. `HauptseitePremium.tsx` Z. 273 und `HomeLeadFormClient.tsx` Z. 98 korrigieren. |
| **[Critical]** | Fakten/Zahlen | `HauptseitePremium.tsx` Z. 54: `{ wert: '8 Mio. €+', label: 'Schadensersatz durchgesetzt' }` | Kanon sagt „über 8 Millionen Euro" — Wert stimmt inhaltlich, aber der KPI-Methodik-Hinweis (Z. 61) nennt Stand `14.05.2026`. Heute ist 27.05.2026 — falls der Wert dynamisch wächst, ist der Stand veraltet. Kein eigentlicher Fehler, aber Risiko: statisch hartkodiert statt aus DB. Separate Notiz: die `service-pitch.ts` Sub-Headline (Z. 39) nennt `32 Tage Ø Auszahlung statt 4–6 Monate Branchen-Durchschnitt` — der Kanon bestätigt das. KPI-Wert `8 Mio. €+` deckt sich mit Kanon `über 8 Millionen Euro`. | Kein Fehler im Wortlaut; KPI-Stand-Datum in `KPI_METHODIK` auf aktuelles Datum nachführen (14.05.2026 → 27.05.2026 oder dynamisch). |
| **[Critical]** | Fakten/Zahlen | `HauptseitePremium.tsx` MISSTRAUEN-Array Z. 87: `„Acht Ansprüche plus freie Werkstatt- und Gutachterwahl (BGH VI ZR 53/09)"` | `BGH VI ZR 53/09` ist das Markenwerkstatt-Urteil (Stundenverrechnungssatz Markenwerkstatt bei Fahrzeugen < 3 Jahre). Das Recht auf **freie Werkstattwahl** ergibt sich aus § 249 BGB und wird in der Rechtsprechung über `BGH VI ZR 65/18` und die Kanon-Leitentscheidungen abgesichert. VI ZR 53/09 als Beleg für „freie Gutachterwahl" ist eine Falsch-Attribution des Aktenzeichens. | Formulierung korrigieren: entweder `(§ 249 BGB)` als Grundlage nennen oder das Az. auf das korrekte Leiturteil ändern. `BGH VI ZR 53/09` ggf. als separaten Punkt für `Markenwerkstatt-Sätze` behalten (vgl. `BghAuthorityGrid.tsx` — dort korrekt verortet). |
| **[Important]** | Fakten/Zahlen | `service-pitch.ts` Z. 140: `„BGH VI ZR 65/18 + VI ZR 174/24"` als Beleg für UPE-Aufschläge + Beilackierung in `ANSPRUECHE_REFRAMED` | `VI ZR 174/24` ist ein 2025-Urteil zur Beilackierung. Es ist nicht im Kanon der Hauptfakten gelistet, aber in `BghAuthorityGrid.tsx` korrekt aufgeführt. Der Kanon-Faktenpool nennt `VI ZR 65/18` für UPE. Das Kombinieren beider Az. in einem Textsatz ohne Trennung der jeweiligen Aussage (UPE vs. Beilackierung) ist unscharf — nicht faktisch falsch, aber missverständlich. | Az. mit Kurzkontext trennen: `„UPE-Aufschläge (BGH VI ZR 65/18) und Beilackierung (BGH VI ZR 174/24)"`. |
| **[Important]** | Fakten/Zahlen | `HomeLeadFormClient.tsx` Z. 98: `„Rückruf in 5 Minuten"` (Grün-Dot-Label im Hero-Form-Header) | Identischer Fehler wie Critical-Finding oben, aber zweite Fundstelle: das grüne Label sagt `5 Minuten`, das Success-State desselben Formulars Z. 63 sagt `unter 15 Minuten`. Dieselbe Komponente widerspricht sich intern. | `Rückruf in 5 Minuten` → `Rückruf in unter 15 Min` |
| **[Important]** | Fakten/Zahlen | `HauptseitePremium.tsx` KPIS Z. 52: `{ wert: '2.000+', label: 'vermittelte Schadensfälle' }` | Dieser Wert ist nicht im Kanon aufgeführt. Er könnte korrekt sein, aber es gibt keine Kanon-Absicherung. `KPI_METHODIK` (Z. 59–62) nimmt ihn mit dem allgemeinen Aggregat-Framing ab. Kein Hard-Fehler, aber nicht verifizierbar. | Aaron prüfen: stimmt `2.000+` mit aktueller DB überein? Ggf. aktualisieren oder mit `Stand 14.05.2026` explizit einfrieren. |
| **[Important]** | Cross-Page-Wording | `HauptseitePremium.tsx` Z. 96: Prozess-Schritt 1: `„3 Felder, ohne Anmeldung — Sie sind in 60 Sekunden durch."` vs. `/schaden-melden` Metadata Z. 25: `„In 30 Sekunden Schaden melden"` | Zwei verschiedene Zeitangaben für denselben Vorgang: `60 Sekunden` auf der Hauptseite, `30 Sekunden` auf der Schaden-melden-Page. Inkonsistenz erzeugt Glaubwürdigkeitsproblem. | Auf einen Wert einigen und überall konsequent verwenden. Empfehlung: `30 Sekunden` (konservativerer, glaubwürdigerer Claim). Dann in `PROZESS_STEPS` Z. 96 anpassen: `„3 Felder, ohne Anmeldung — Sie sind in 30 Sekunden durch."` |
| **[Important]** | Cross-Page-Wording | `HauptseitePremium.tsx` Prozess-Schritt 1 Z. 96: `„3 Felder"` vs. Hero-Form `HomeLeadFormClient.tsx` Z. 101–103 (tatsächlich hat das Home-Lead-Form 3 Felder: Name, Telefon, Stadt — korrekt). Aber `/schaden-melden` `MiniWizardClient.tsx` (AAR-902-Kommentar Z. 16: `4-Felder-Mini-Wizard`) und `page.tsx` Z. 42: `„Drei Fragen"` | `page.tsx` sagt `Drei Fragen`, der Wizard hat faktisch 4 Fieldsets (Schuldfrage, Wann/Wo, Kontakt, DSGVO) mit ~6–7 Eingabefeldern. `Drei Fragen` ist für Nutzer irreführend. | `page.tsx` description anpassen: z.B. `„In wenigen Schritten Schaden melden"` statt der konkreten Zahl. Oder Feldanzahl im Wizard auf tatsächliche Schrittlogik abstimmen. |
| **[Minor]** | ToV | `FounderSection.tsx` Z. 19–20: Nicolas-Quote: `„Es geht nicht darum wer ich bin, sondern was ich tue. Daran wird man gemessen." — Batman` | Batman-Zitat wirkt im Founder-Trust-Kontext (E-E-A-T) inadäquat — es ist ein Film-Zitat, kein Geschäfts-Insight. Schwächt die Seriosität des Vertrauens-Ankers. | Aaron: durch ein persönliches Statement oder ein belegtes Geschäftszitat ersetzen. |
| **[Minor]** | Rechtschreibung | `FounderSection.tsx` Z. 59: `„Wir wissen wie es ist, nach einem Unfall einer Versicherung gegenüberzustehen."` | Fehlende Kommasetzung: vor dem Komma-Relativsatz `wie es ist` fehlt ein Komma nach `wissen`. Korrekt: `„Wir wissen, wie es ist, nach einem Unfall…"` | `Wir wissen, wie es ist, nach einem Unfall einer Versicherung gegenüberzustehen.` |
| **[Minor]** | ToV | `service-pitch.ts` Z. 110: `„Nächster freier Gutachter — nicht der, der in drei Wochen Zeit hat. Wie Uber, aber für Schadensgutachten."` | Das Komma nach `Uber` ist stilistisch unüblich in deutschen Kurzsätzen. Auch „Wie Uber" in einem inhaltlich ernst gemeinten Brand-Text — akzeptabel als Analogie (Disclaimer in PortalMockupSection korrekt ergänzt), aber im `service-pitch.ts` selbst fehlt der Disclaimer-Kontext. | Kein zwingender Fix. Konsistenzprüfung: `PortalMockupSection.tsx` hat Disclaimer, `service-pitch.ts` nicht. Wenn der Text direkt verwendet wird (z.B. in llms.txt), ist das in Ordnung; wenn er auf der UI erscheint, braucht er keinen eigenen Disclaimer (der ist im PortalMockupSection-Footer). |
| **[Minor]** | Rechtschreibung | `BeraterSection.tsx` Z. 39: `„— Claimondo-Schadenbegleitung"` | `Schadenbegleitung` müsste `Schadensbegleitung` sein (Fugen-s wie in `Schadensregulierung`, `Schadensgutachten`). Inkonsistenz im eigenen Wortfeld — die Seite verwendet sonst konsequent `Schadensregulierung`. | `— Claimondo-Schadensbegleitung` |

---

## `/schaden-melden`

### Findings

| Severity | Brille | Fundstelle (Datei + String-Auszug) | Befund | Vorschlag |
|----------|--------|-------------------------------------|--------|-----------|
| **[Important]** | Fakten/Zahlen | `src/app/schaden-melden/page.tsx` Z. 42: `description="Drei Fragen, dann erhalten Sie per WhatsApp oder E-Mail einen sicheren Login-Link."` | Der MiniWizard hat keine `3 Fragen` — er hat 4 Fieldsets mit insgesamt ~7 Eingabefeldern (Schuldfrage-Radio, Unfalldatum, Unfallort, Vorname, Nachname, Telefon, E-Mail + DSGVO-Checkbox). `Drei Fragen` ist faktisch falsch und für Nutzer irreführend. | Formulierung auf etwas Offenes ändern: `„In wenigen Schritten Schaden melden — Sie erhalten direkt einen sicheren Login-Link per WhatsApp oder E-Mail."` |
| **[Important]** | Cross-Page-Wording | `page.tsx` Metadata-Title Z. 23: `„Schaden melden — Sicherer Login-Link"` | `Sicherer Login-Link` als Seitentitel ist ungewöhnlich — klingt wie ein Phishing-Warnung-Kontext. Der eigentliche Nutzer-Nutzen ist die schnelle Schadenmeldung. | `„Schaden melden — Unfall kostenlos melden und Login-Link erhalten"` oder einfach `„Schaden melden — Claimondo"` (der Layout-Fallback). |
| **[Minor]** | ToV | `MiniWizardClient.tsx` Z. 39: Schuldfrage-Option: `„Ich bin selbst schuld"` mit Desc: `„Kasko-Fall — Sie hören gleich auf der nächsten Seite, wie wir trotzdem helfen können."` | Das Wizard hat keine `nächste Seite` — es ist ein Ein-Seiten-Formular. Nach Submit erfolgt ein Router-Push zu einem Magic-Link-Flow. Die Erwähnung `auf der nächsten Seite` ist irreführend und stimmt mit dem tatsächlichen Flow nicht überein. | Desc anpassen: `„Kasko-Fall — nach Ihrer Meldung zeigen wir Ihnen, wie wir trotzdem helfen können."` |
| **[Minor]** | Rechtschreibung | `MiniWizardClient.tsx` Z. 36: Schuldfrage-Option desc: `„Wir klären das gemeinsam mit Ihnen und unseren Anwälten."` | `unseren Anwälten` — korrekt. Keine Beanstandung. Anmerkung: `Anwälten` (Plural) legt nahe, Claimondo hat angestellte Anwälte; tatsächlich ist es eine **Partnerkanzlei**. Leichte Unschärfe gegenüber Kanon (`anwaltliche Durchsetzung über Partnerkanzlei inklusive`). | Präzisierung: `„Wir klären das gemeinsam mit Ihnen und unserer Partnerkanzlei."` |

---

## Extrahierte Fakten/Zahlen/Claims

| Seite | Wert/Claim | Exakter String | Datei (Zeile) |
|-------|-----------|----------------|---------------|
| `/` | Rückruf-Zeit | `< 15 Min` (KPI-Strip) | `HauptseitePremium.tsx:56` |
| `/` | Rückruf-Zeit (widersprüchlich) | `Rückruf in 5 Min` | `HauptseitePremium.tsx:273` |
| `/` | Rückruf-Zeit (widersprüchlich) | `Rückruf in 5 Minuten` | `HomeLeadFormClient.tsx:98` |
| `/` | Rückruf-Zeit (korrekt) | `unter 15 Minuten` | `HomeLeadFormClient.tsx:63` |
| `/` | Rückruf-Zeit (korrekt) | `unter 15 Minuten` | `StickyCallBar.tsx:110,129` |
| `/` | Schadensersatz | `8 Mio. €+` | `HauptseitePremium.tsx:54` |
| `/` | Schadensersatz | `über 8 Millionen Euro Schadensersatz durchgesetzt` | `service-pitch.ts` (via KPI-Block) |
| `/` | Ø Auszahlung | `32 Tage` | `HauptseitePremium.tsx:55`, `service-pitch.ts:55,94,167,203` |
| `/` | Branchen-Durchschnitt | `4–6 Monate` | `service-pitch.ts:94`, `PlattformMechanikSection.tsx:59` |
| `/` | Erstattungskosten | `0 €` | Mehrfach, korrekt |
| `/` | SV-Termin | `< 48 h vor Ort` | `PROZESS_STEPS:Z.97`, `service-pitch.ts:42` |
| `/` | Kürzungsquote | `30–40 %` | `VersichererTaktikenSection.tsx:112`, `SiebenFehlerSection.tsx:26`, `FAQS:144`, `service-pitch.ts:185` |
| `/` | Schadensfälle | `2.000+` | `HauptseitePremium.tsx:53` |
| `/` | SV-Netzwerk | `DAT-/BVSK-zertifizierte Sachverständige (hunderte)` | `service-pitch.ts:209`, `HauptseitePremium.tsx` Einsatzgebiet-Section |
| `/` | Tesla-Gutachten-Beispiel | `22.000 € → 48.000 €` | `TeslaEAutoSection.tsx:21`, `FAQS:169` |
| `/` | Wertminderung-Spanne | `500 € – 2.500 €` | `WertminderungSandenDannerSection.tsx:29`, `FAQS:149` |
| `/` | Wertminderung Beispiel | `VW Golf 2 Jahre, 6.000 € Reparatur → 1.200 € (20 %)` | `WertminderungSandenDannerSection.tsx:38–44` |
| `/` | BVSK-Honorarspanne | `550 € – 2.600 €` | `FAQS:124` |
| `/` | Schadensschwelle | `> 750 €` für kostenfreien SV | `FAQS:124`, `VersichererTaktikenSection.tsx:35` |
| `/` | Werkstattrisiko BGH-Datum | `16.01.2024`, `5 Leitentscheidungen` | `FAQS:159`, `BghAuthorityGrid.tsx:10` |
| `/` | BGH-Aktenzeichen | `VI ZR 38/22`, `VI ZR 65/18`, `VI ZR 174/24`, `VI ZR 53/09`, `VI ZR 119/04`, `VI ZR 357/03`, `VI ZR 67/91`, `VI ZR 280/22` | `BghAuthorityGrid.tsx`, `VersichererTaktikenSection.tsx`, `FAQS` |
| `/` | BGH-Az. (problematisch) | `BGH VI ZR 53/09` für freie Werkstatt-/Gutachterwahl | `HauptseitePremium.tsx:87` (MISSTRAUEN-Karte) |
| `/` | Sanden/Danner-Nutzungsausfall | `23–175 €/Tag` | `service-pitch.ts:152` |
| `/` | Restwert-BGH | `BGH VI ZR 119/04` | `VersichererTaktikenSection.tsx:54`, `BghAuthorityGrid.tsx:14` |
| `/` | 130%-Regel BGH | `BGH VI ZR 67/91` | `FAQS:154`, `BghAuthorityGrid.tsx:16` |
| `/` | Gründungsjahr/Ort | `2025, Köln` | `service-pitch.ts:209` (indirekt via USPs) |
| `/` | Gründer | `Nicolas Kitta (CEO) + Aaron Sprafke (COO)` | `FounderSection.tsx`, `service-pitch.ts:209` |
| `/` | Koordination-Claim | `„Sie reden mit niemandem. Wir mit allen."` | `HauptseitePremium.tsx:245–246`, `service-pitch.ts:28` |
| `/` | Prozess-Schritte | `5 Schritte` | `PROZESS_STEPS:Z.96–100` |
| `/schaden-melden` | Wizard-Schritte | `„Drei Fragen"` (pageDesc), tatsächlich 4 Fieldsets | `page.tsx:42` |
| `/schaden-melden` | Kostenhinweis | `0 € Beratung` | `StickyCallBar.tsx:129` |

---

## Zusammenfassung für Cross-Page-Konsolidierung

**Rückruf-Zeit:** Drei verschiedene Werte auf der Hauptseite: `5 Min` (Hero-Phone-CTA + Form-Label), `< 15 Min` (KPI-Strip), `unter 15 Minuten` (Success-State + StickyCallBar). Muss auf einen Wert vereinheitlicht werden.

**Schrittanzahl:** `60 Sekunden` (Prozess-Schritt 1 auf `/`) vs. `30 Sekunden` (Metadata `/schaden-melden`). Muss angeglichen werden.

**BGH VI ZR 53/09:** Wird auf der Hauptseite im MISSTRAUEN-Array als Beleg für `freie Werkstatt- und Gutachterwahl` verwendet — das Az. belegt aber Markenwerkstatt-Sätze. Diese Fehl-Attribution muss korrigiert werden.

**`Drei Fragen` auf `/schaden-melden`:** Der MiniWizard hat faktisch mehr als 3 Fragen — der PageHeader-Text ist irreführend.
