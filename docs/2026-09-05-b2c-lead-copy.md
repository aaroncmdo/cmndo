# B2C-Lead-Copy: Texte der Konversionsflächen, ausgelegt auf Geschädigten-Anfragen – 05.09.2026

**Frage Aaron (05.09.):** „Hast du alle Skills benutzt, damit wir unsere Texte noch mal verbessern und auf die B2C-Lead-Generierung auslegen?" – Nein. Die Aufnahme (04./05.09.) lief mit 15 Skills, das Umschreiben hatte noch nicht begonnen. Dieser Durchgang nutzt zusätzlich **customer-research, marketing-psychology (angewendet), signup-flow-cro, paid-ads, competitor-alternatives, email-sequence, product-marketing-context** und liefert die neuen Texte je Fläche samt Umsetzung (Branch `kitta/copy-audit-b2c-lead-copy`, gestapelt auf #5862).

**Ziel:** mehr qualifizierte Geschädigten-Anfragen (Rückruf, Schadenmeldung, Gutachter-Termin). Messung: GA4 `generate_lead` je Quelle (`lead-form-hero`, `sticky-rueckruf`, `check`, `schaden-melden`), Rückruf-Tasks im Dispatch, `leads.source_channel`. Ausgangslage (leads, 120 Tage, ohne Test-Konten): 10 Self-Service-Leads mit Schuldfrage „Gegner", einzelne aus Check, KI-Deeplink, ChatGPT, Schadenkarte. Alle Google-Ads-Kampagnen sind seit Juni/Juli pausiert (beide Konten).

---

## 1 · Kundensprache (customer-research)

**Quellen:** 7 Google-/ProvenExpert-Bewertungen mit Text (Cluster-LP, `kfz-gutachter-koeln/lib/content.ts`, `GoogleReviewsStrip.tsx`), 43 FAQ-Fragen (`faq.groups`), Antwortverteilung im Check (`leads.schuldfrage`: fast nur „Gegner"), ChatGPT-Test vom 03.09. (Formulierung schlägt Inhalt), Anzeigentexte der pausierten Kampagnen. Lead-Freitexte: in 180 Tagen **keine** (Felder leer) – dort gibt es keine Stimme des Kunden.

**Was Kunden sagen, wenn es gut lief** (wörtlich): „von vorne bis hinten einfach nur super" · „das Kundenportal gefallen und die Schnelligkeit der Abwicklung" · „unkompliziert und schnell" · „um Mietwagen und Kommunikation mit den Rechtsanwälten gekümmert" · „der Gutachter hat super Arbeit geleistet und die Kanzlei hat schnell reguliert" · „unerwartet schnelle Bearbeitung, besonders freundlicher Kontakt" · „gute Idee über WhatsApp".
→ Die drei Werte, die Kunden nennen: **schnell**, **unkompliziert**, **jemand kümmert sich** (Mietwagen, Anwalt, Kommunikation). Nicht: „BGH-konform", „disponiert", „Plattform", „Netzwerk".

**Was Kunden fragen, bevor sie anfragen** (FAQ-Reihenfolge = Angstreihenfolge): Was kostet das wirklich? · Muss ich in Vorleistung gehen? · Was, wenn die Versicherung ablehnt? · „Wir kümmern uns um alles" – was heißt das? · Brauche ich wirklich einen Anwalt? · Was passiert mit meinen Daten / HIS-Datei? · Wann bekomme ich mein Geld? · Mein Auto ist älter als 10 Jahre – geht das noch?
→ Jede Konversionsfläche beantwortet die ersten drei Ängste **vor** dem Formular: 0 €, keine Vorkasse, Versicherung zahlt nach § 249 BGB, keine Bindung.

**Persona (aus PRODUCT.md, bestätigt durch die Daten):** unfreiwillig hier, Stunden bis Tage nach dem Unfall, mobil, ohne Fachbegriffe, mit der Gegenversicherung schon am Telefon. Job: herausfinden, was ihm zusteht, und jemanden finden, der es für ihn durchsetzt.

---

## 2 · Psychologie je Fläche (marketing-psychology)

| Prinzip | Anwendung |
|---|---|
| Zero-Price + Regret Aversion | „0 € für Sie" in H1-Nähe, „keine Bindung, Sie entscheiden nach dem Gespräch" unter jedem CTA |
| Loss Aversion | „Versicherer kürzen 30–40 %" (belegt) als Grund, den eigenen Gutachter zu nehmen – nicht als Drohung, sondern als Verlustbild |
| Authority | § 249 BGB, BGH-Aktenzeichen, Partnerkanzlei; nie „wir" als Rechtsdurchsetzer (RDG) |
| Social Proof | 5,0 aus 27 Bewertungen, wörtliche Kundenstimmen statt Kennzahlen ohne Quelle |
| Hick's Law | ein Primär-CTA je Fläche, Telefon als Zweitweg, Rest unter die Falz |
| Activation Energy | drei Angaben, keine Anmeldung, Rückruf statt Formularmarathon; Check mit drei Klicks |
| Goal Gradient / Commitment | Check: „Frage 1 von 3", Ergebnis vor dem Formular |
| Peak-End | Danke-Zustand mit konkreter Erwartung („in 15 Minuten, 8–20 Uhr, Nummer kann unterdrückt sein") |
| Framing | „Ihr eigener Gutachter" (Besitz) statt „unabhängiger Sachverständiger aus dem Netzwerk" |

**Bewusst nicht:** Scarcity/Urgency („nur heute"), erfundene Zahlen, „Wir kümmern uns" (ist der Satz der Versicherung, den die Seite selbst übersetzt).

---

## 3 · Alternativen-Framing (competitor-alternatives)

Der Geschädigte vergleicht nicht Claimondo mit Wettbewerbern, sondern vier Wege. Jede Fläche nennt den Weg, den die Gegenseite ihm nahelegt, und was er dabei verliert:

| Weg | Was er verliert | Satz für die Seite |
|---|---|---|
| Der Gutachter der Versicherung | Prüfdienst im Interesse des Zahlers, Kürzung typisch 30–40 %, Wertminderung fehlt oft | „Der Gutachter der Versicherung arbeitet für die Versicherung. Ihrer arbeitet für Sie." |
| „Die Werkstatt regelt das" | Reparatur ja, Wertminderung/Nutzungsausfall/Anwalt nein | „Die Werkstatt repariert. Wertminderung und Nutzungsausfall holt keine Werkstatt." |
| Direkt mit der Versicherung | keine Waffengleichheit, Kürzungen ohne Widerspruch | „Ohne eigenes Gutachten verhandeln Sie über eine Zahl, die die Gegenseite gesetzt hat." |
| Anwalt selbst suchen | braucht trotzdem Gutachten, Termin, Werkstatt – vier Telefonate | „Anwalt, Gutachter, Werkstatt, Mietwagen: ein Anruf statt vier." |

Bestehende Seiten dafür: `/versicherung-schickt-gutachter`, `/decoder/*`, FAQ. Neu als Sektion auf der Startseite in Task D3 (Distill), nicht in diesem PR.

---

## 4 · Ads ↔ Landingpage (paid-ads)

Beide Google-Ads-Konten (claimondo 2201510905, Cluster 9511127970) haben nur pausierte Kampagnen (Search „SE-claimondo-generisch/-Standorte", A/B „kfzgutachter vs schaden", „CMP – Gutachter-Finder", Spokes Köln/Bonn/Aachen/Wuppertal/Düsseldorf, PMAX). Ihre Anzeigentexte (Supermetrics, 05.09.):

- **Angles, die die Anzeigen tragen:** „Unverschuldet? 0 € für Sie" · „Wird Ihr Schaden gekürzt?" / „30–40 % werden oft gekürzt" · „Nicht den Versicherer nehmen" / „Versicherer-Gutachter? Nein." · „Termin in 48 Std." · „Wir kommen zu Ihnen" · „Mietwagen + Anwalt inklusive" · „Anruf genügt – Rest machen wir".
- **Probleme in den Anzeigen selbst:** RDG-Verstöße („wir holen alles für Sie heraus", „Wir setzen alle BGH-konformen Positionen durch"), unbelegte Zahlen („Über 2000 abgewickelte Fälle", „100+ Gutachter in NRW"), unklare Zertifizierung („Offiziell DAT-zertifiziert", „DAT-geprüft") – vor dem Neustart korrigieren.

**Message-Match:** Die neuen Hero-Texte greifen genau die tragenden Angles auf (0 €, eigener Gutachter, Termin < 48 h, Gutachter kommt zu Ihnen, Anwalt + Mietwagen inklusive). Für den Neustart ein RSA-Set ohne RDG und ohne unbelegte Zahlen (Headlines ≤ 30 Zeichen, Beschreibungen ≤ 90):

Headlines: Unverschuldet? 0 € für Sie · Ihr eigener Kfz-Gutachter · Gutachter kommt zu Ihnen · Termin in unter 48 Stunden · Wird Ihr Schaden gekürzt? · Nicht den Versicherer-Gutachter · Anwalt + Mietwagen inklusive · Rückruf in 15 Minuten · Versicherung zahlt (§ 249 BGB) · Wertminderung sichern · Ein Anruf statt vier · Kfz-Gutachter {Stadt} · Unabhängig, nicht vom Versicherer · Keine Vorkasse, keine Bindung · Was steht Ihnen zu?
Beschreibungen: „Unverschuldeter Unfall? Die gegnerische Versicherung zahlt Gutachten, Anwalt und Reparatur – 0 € für Sie." · „Versicherer-Prüfdienste kürzen typisch 30–40 %. Ihr eigenes Gutachten hält dagegen – unsere Partnerkanzlei verhandelt." · „Ein unabhängiger Sachverständiger kommt zu Ihnen, meist in unter 48 Stunden. Rückruf in 15 Minuten." · „Gutachter, Anwalt, Werkstatt, Mietwagen aus einer Hand. Ohne Vorkasse, ohne Bindung."

---

## 5 · Die neuen Texte je Fläche

Regeln: Sie-Form · Antwort zuerst · Fachwort in Klammern nach der Erklärung · nur belegte Zahlen (0 €, 15 Min, < 48 h, 32 Tage mit Stichtag, 30–40 % mit Quelle, 5,0 aus 27) · RDG: verhandeln/klagen/durchsetzen nur „unsere Partnerkanzlei" · keine Ausrufezeichen · keine Geviertstriche im UI.

### 5.1 Startseite Hero (`home.hero`)

| Key | Vorher | Nachher | Warum |
|---|---|---|---|
| trust_badge | Sachverständigen-Netzwerk · bundesweit erreichbar | Unabhängige Kfz-Sachverständige · Termin in unter 48 Stunden | konkret, Ad-Match „Termin in 48 Std." |
| h1_plain | Unverschuldet im Unfall? | (bleibt) | Frage = Situation des Lesers, Ad-Match |
| h1_accent | Wir haben's im Griff. | Ihr eigener Gutachter. 0 € für Sie. | Besitz-Framing + Zero-Price; „Wir haben's im Griff" sagt nichts, was er bekommt |
| sub_headline | Wir koordinieren … 32 Tage Ø Auszahlung statt 4–6 Monate Branchen-Durchschnitt. | Ein unabhängiger Sachverständiger kommt zu Ihnen, meist in unter 48 Stunden. Gutachten, Anwalt und Reparatur zahlt die gegnerische Versicherung (§ 249 BGB). Unsere Partnerkanzlei verhandelt, Sie sehen jeden Schritt in Ihrer Fallakte. | drei Ängste beantwortet, „4–6 Monate" (unbelegt) raus |
| cta_primary | Lassen Sie uns mit der Versicherung reden → | Gutachter-Termin sichern → | sagt, was er bekommt; Ad-Match „Jetzt Termin sichern" |
| trust_footer | Anonyme Beratung · Keine Bindung · DSGVO-konform | Kostenlos · keine Bindung · Sie entscheiden nach dem Gespräch | Regret Aversion; „DSGVO-konform" sagt dem Geschädigten nichts |

Hero-Bullet (`service-pitch.ts`, `SERVICE_REALITY_BULLETS`): „32 Tage statt 4 Monate. Im Schnitt." → „Termin in unter 48 Stunden. Der Gutachter kommt zu Ihnen." (Vergleichswert unbelegt).

### 5.2 Rückruf-Formular (`home.lead_form`, `kfz_gutachter_stadt.form_*`)

| Key | Vorher | Nachher |
|---|---|---|
| heading / form_h2 | Schaden melden in 30 Sekunden | Rückruf anfordern – wir sagen Ihnen, was Ihnen zusteht |
| sub / form_sub | Drei Felder. Ohne Anmeldung. DSGVO-konform. | Drei Angaben, keine Anmeldung. Ein Berater ruft Sie in 15 Minuten an. |
| submit / form_submit_idle | Jetzt kostenlosen Rückruf erhalten → | Kostenlosen Rückruf anfordern → |

Das Formular ist ein Rückruf, keine Schadenmeldung – die alte Überschrift versprach etwas anderes als der Knopf. Labels, Platzhalter, Erfolgstext bleiben (sie sind gut: „Nummer kann unterdrückt sein").

### 5.3 Kennzahlen-Streifen (`home.kpis`, `kfz_gutachter_stadt.trust_kpis`, `vorteile.kpis`)

| Position | Vorher | Nachher |
|---|---|---|
| 1 | 2.000+ vermittelte Schadensfälle | 0 € Eigenanteil bei unverschuldetem Unfall |
| 2 | 8 Mio. €+ Schadensersatz durchgesetzt | < 48 h bis zum Termin beim Gutachter |
| 3 | 32 Tage Ø bis zur Auszahlung | (bleibt, mit Stichtag in der Methodik-Zeile) |
| 4 | < 15 Min bis zum ersten Rückruf | (bleibt) |

Methodik-Zeile: „32 Tage = Durchschnitt aller über Claimondo abgewickelten Haftpflichtfälle seit Gründung, Stand 14.05.2026. Rückruf und Termin: gelebte Prozesszeiten, täglich 8–20 Uhr." Dieselbe Änderung in `brand-fakten-library.ts` (F54 „8 Mio.", F51 „bundesweit größte", F52 „hunderte … 16 Bundesländern") und `brand-constants.ts`, weil beide `llms.txt` speisen. **Entscheidung 2 aus dem Bericht bleibt offen** – hier werden nur unbelegte durch belegte Aussagen ersetzt; ein belegter Wert kann jederzeit zurück.

### 5.4 Anspruch prüfen (`check.*`)

| Key | Nachher |
|---|---|
| sub | Drei kurze Fragen, dann sehen Sie sofort, welche Ansprüche Sie haben. Ohne Anmeldung, ohne Kosten. |
| result_voll_sub | Unverschuldet? Dann zahlt die gegnerische Versicherung alles: Gutachten, Anwalt, Reparatur, Mietwagen. Sie werden so gestellt, als wäre der Unfall nie passiert (§ 249 BGB). |
| result_pruefen_sub | Die Schuldfrage ist oft klarer, als sie sich anfühlt. Unsere Partnerkanzlei prüft den Hergang und sichert Ihre Ansprüche – für Sie kostenlos. |
| result_kasko_sub | Gegen den Gegner besteht kein Anspruch. Über Ihre Kaskoversicherung koordinieren wir Gutachten, Werkstatt und Abwicklung für Sie. |
| insight_unklar | Die Schuldfrage klärt unsere Partnerkanzlei mit Ihnen – das geht oft schneller als gedacht. |
| lead_heading | Jetzt kostenlos prüfen lassen, was Ihnen zusteht |
| lead_sub | Ein Berater ruft Sie in 15 Minuten an (täglich 8–20 Uhr) und geht Ihre Ansprüche mit Ihnen durch. Kostenlos, keine Bindung. |
| lead_submit | Kostenlosen Rückruf anfordern |

### 5.5 Schaden melden (`schaden-melden/page.tsx`, `MiniWizardClient.tsx`)

- Untertitel: „Drei kurze Fragen, dann kommt Ihr sicherer Link per WhatsApp oder E-Mail. Dort wählen Sie den Gutachter-Termin und unterschreiben die Vollmacht – alles Weitere koordinieren wir."
- Option „Schuldfrage unklar": „Das klären wir gemeinsam mit Ihnen und unserer Partnerkanzlei." (vorher „unseren Anwälten" – RDG, vom Scanner nicht erkannt: Dativ Plural)
- Rückruf-Box: „Keine Zeit für das Formular? Ein Berater ruft Sie zurück, meist in 15 Minuten."
- Meta: Titel „Unfallschaden online melden – sicherer Link per WhatsApp | Claimondo", Beschreibung „In drei Minuten Schaden melden: Sie erhalten sofort einen sicheren Link per WhatsApp oder E-Mail, wählen den Gutachter-Termin und unterschreiben die Vollmacht. 0 € bei unverschuldetem Unfall (§ 249 BGB)."
- signup-flow-cro: Felder bleiben (Datum, Ort, Vor-/Nachname, Telefon, E-Mail, Einwilligung) – E-Mail ist nötig für den Link; Telefon für WhatsApp. Kein weiteres Feld. Erfolgsseite `link-versendet` bleibt.

### 5.6 Stadtseiten (`kfz_gutachter_stadt.*`, 36 Städte × 6 Sprachen)

| Key | Nachher |
|---|---|
| hero_subheadline | Ihr unabhängiger Gutachter kommt zu Ihnen {ort}, meist in unter 48 Stunden. Gutachten und Anwalt zahlt die gegnerische Versicherung (§ 249 BGB), unsere Partnerkanzlei verhandelt. Für Sie 0 €. |
| hero_bullets[3] | Termin in unter 48 Stunden – der Gutachter kommt zu Ihnen. |
| hero_trust_line | Kostenlos · keine Bindung · Sie entscheiden nach dem Gespräch |

Die alte Subheadline („Wir disponieren Ihren Gutachter, führen die Versicherungs-Verhandlung und setzen Ihren Anspruch durch") war ein RDG-Verstoß, den der Scanner wegen der Verb-Reihung nicht erkannte – Scanner in diesem PR erweitert (Reihung `Wir …, führen …, setzen … durch` und `unseren Anwälten`).

### 5.7 Kontaktleiste (`home.sticky_call`)

`success_sub`: „Ein Berater meldet sich in 15 Minuten, täglich 8–20 Uhr. Die Nummer kann unterdrückt sein." Rest bleibt.

### 5.8 LP (`/kfzgutachter-lp`, beide Kopien)

Statistik-Zeile: „100+ geprüfte Gutachter" → „Termin in unter 48 h", „2.000+ vermittelte Fälle" → „0 € für Unverschuldete". Hero und Kacheln sind seit #5862 RDG-frei.

---

## 6 · Nach der Anfrage (email-sequence, Service-Mails ohne Werbung)

Heute: Rückruf-Zusage im Erfolgstext, Link-Mail bei der Schadenmeldung. Fehlt: was passiert, wenn der Rückruf nicht ankommt, und die Brücke zum Termin. Vorschlag (alle drei sind Vertragsanbahnung, Art. 6 I b DSGVO, keine Werbung, kein DOI nötig; kein Tracking-Pixel):

| # | Auslöser | Betreff | Kern |
|---|---|---|---|
| 1 | sofort nach Rückruf-Anfrage (nur wenn E-Mail vorliegt) | Wir rufen Sie in 15 Minuten an | Erwartung, Nummer kann unterdrückt sein, direkte Nummer, Link zum Check |
| 2 | 2 h ohne erreichten Rückruf | Wir haben Sie nicht erreicht | zwei Wege: Wunschzeit wählen oder WhatsApp; kein Druck |
| 3 | 24 h nach Link-Versand ohne Termin | Ihr Gutachter-Termin wartet | drei Sätze, was der Termin bringt (0 €, Beweissicherung), Link |

Umsetzung als Task 12b (Resend, `lib/communications`), nicht in diesem PR. Cold-Mail an gescrapte Sachverständige bleibt gestoppt bis zur anwaltlichen Freigabe (Bericht, Entscheidung 6).

---

## 7 · Bilder und Assets (Frage Aaron 05.09.)

Verfügbar: `image` (KI-Bildgenerierung über Gemini/Flux/Ideogram/GPT-Image – **braucht einen API-Schlüssel, im Repo ist keiner hinterlegt**), `canvas-design` (programmatische Grafik als PNG/PDF), `ad-creative` (Anzeigenvarianten), `video` (HeyGen/Remotion), Figma-MCP (Vektor-Illustrationen, Diagramme, `generate_diagram`). Ohne Schlüssel kann ich Vektor-/Canvas-Grafiken liefern, keine gemalten Szenen.

**Serie „Aus der Patsche" (8 Situationen, je Karte: Situation → Fehler → Ausweg), Stil: flache Illustration in Navy/Ondo/Creme, ein Objekt pro Bild, Bildunterschrift trägt den Witz:**

1. Das Telefon klingelt am Unfalltag – die gegnerische Versicherung „kümmert sich". Ausweg: erst der eigene Gutachter, dann das Gespräch.
2. Der Brief „Wir schicken Ihnen unseren Gutachter". Ausweg: § 249 BGB, freie Wahl.
3. Die Werkstatt: „Das regeln wir mit der Versicherung." Ausweg: Wertminderung und Nutzungsausfall holt keine Werkstatt.
4. Der Kostenvoranschlag statt Gutachten. Ausweg: Beweissicherung vor der Reparatur.
5. Der Mietwagen wird „nicht übernommen". Ausweg: Nutzungsausfall 23–219 € pro Tag.
6. Die Kürzung um 30–40 % („UPE-Aufschläge nicht erstattungsfähig"). Ausweg: BGH VI ZR 65/18, Partnerkanzlei.
7. Das Restwert-Angebot aus dem Internet. Ausweg: regionaler Markt, BGH VI ZR 119/04.
8. „Ist doch nur ein Kratzer." Ausweg: Bagatellgrenze 750 €, Wertminderung auch bei kleinen Schäden.

Einsatz: Startseite (Sektion statt Kartengitter, D3), Social (ad-creative), Check-Ergebnis, autounfall.io-Artikel. Nächster Schritt: Gemini- oder Flux-Schlüssel (Entscheidung Aaron), dann 8 Bilder in einem konsistenten Stil-Prompt, oder Vektorserie via Figma/Canvas ohne Schlüssel.

---

## 8 · Umsetzung und Nachweis

- Branch `kitta/copy-audit-b2c-lead-copy` (auf #5862 gestapelt, weil dieselben Dateien) · sechs Sprachen per String-Replace mit Exakt-1-Prüfung · Scanner-Erweiterung mit Unit-Tests · `check:i18n`, `check:i18n-render`, `tsc`, `build`, `vitest` · Regel-4-Spec `tests/e2e/service-pitch-b2c-lead-copy.spec.ts` (gerenderte Texte auf `/`, `/kfz-gutachter/koeln`, `/check` nach drei Klicks, `/schaden-melden`, `/vorteile`; keine „2.000+" / „8 Mio" mehr sichtbar; Positivkontrolle).
- Erfolgsmessung: `generate_lead` je Quelle vier Wochen vor/nach Deploy; bei 3–8 Anfragen im Monat ist das eine Richtung, kein Test (ab-test-setup: statistisch nicht auswertbar).
