# Marketing-Audit B — Konversion Partnerseiten

**Datum:** 23.08.2026
**Gegenstand:** `/werkstatt/partner-werden`, `/flotte/partner-werden`, `/makler/partner-werden`, `/gutachter-partner` (+ 3 Ratgeber-Unterseiten), `/vorteile`, `/wie-es-funktioniert`, `/ueber-uns`
**Methode:** Live-Abruf aller 10 Seiten (alle HTTP 200), gerendertes Ergebnis in Chromium bei 1440×900 und 390×844, Quelltext, i18n-Messages, Gegenmessung der Zahlenversprechen gegen die Prod-Datenbank.

Alle Befunde sind am **gerenderten Live-Ergebnis** verifiziert, nicht nur am Code.

---

## Kurzfassung

Die drei „klassischen" Partnerseiten (Werkstatt, Flotte, Makler) sind handwerklich solide: Angebot in der ersten Bildschirmhöhe, klarer CTA, keine Phantom-Zahlen. Die wichtigste Seite von allen — `/gutachter-partner`, die Angebotsseite des Geschäftsmodells — ist die mit Abstand schwächste: Sie trägt eine um den Faktor ~1.000 überhöhte Netzwerkzahl, fünf einander widersprechende Aussagen zur Freischaltung und keine Navigation.

Die Geldfrage wird auf **allen vier** Seiten umschifft. Kein Formular sagt, was nach dem Absenden passiert.

---

## 1 — Die Netzwerkzahl ist um Faktor ~1.000 überhöht ⛔

**Was ist.** Auf `/gutachter-partner` steht sichtbar und fett:

> **„Bereits 10034 Sachverständige sind im Claimondo-Netzwerk."**

Dieselbe Zahl steckt im JSON-LD, das Google und die KI-Suchmaschinen auslesen:

```json
"@type":"Service","description":"Kfz-Sachverständige tragen sich in das Claimondo-Netzwerk
ein und erhalten Aufträge direkt ohne Eigenakquise. 10034 Sachverständige im bundesweiten Netzwerk."
```

Die Zahl entsteht in `app/[locale]/gutachter-partner/page.tsx:63-75` als Summe aus `sv_leads` **plus** aktiven Sachverständigen. Gegen Prod gemessen (23.08.):

| Bestandteil | Zahl | Was das wirklich ist |
|---|---|---|
| `sv_leads` gesamt | **10.019** | kalt gescrapte Adressen: 9.957 aus `places_discovery`, 62 aus einem Excel-Import |
| davon beansprucht (`claim_status='beansprucht'`) | **0** | — |
| davon konvertiert (`konvertiert_zu_sv_id`) | **0** | — |
| `sachverstaendige` mit `ist_aktiv` | 15 | davon 5 Testaccounts |
| **echte, aktive, verifizierte SVs** | **10** | |

Die 10.019 sind Menschen, die noch nie von Claimondo gehört haben. Kein einziger hat je zugestimmt. Der Code-Kommentar daneben sagt ausdrücklich *„kein Fake-Wert"* — die Absicht war Ehrlichkeit, die Zusammensetzung der Summe macht daraus das Gegenteil.

**Warum es schadet.** Dreifach:

1. **Rechtlich.** Eine nachweisbar unzutreffende Angabe über die Größe des eigenen Netzwerks ist irreführende Werbung (§ 5 UWG). Sie steht zudem maschinenlesbar im Schema-Markup — der Nachweis ist trivial zu führen.
2. **Vertrauen.** Ein Sachverständiger, der sich registriert und im Portal zehn Kollegen vorfindet statt zehntausend, ist als Partner verloren — und erzählt es weiter. Die Zielgruppe ist klein und redet miteinander.
3. **Sie wirkt gegen das eigene Ziel.** „10.034 Sachverständige sind schon dabei" liest ein Gutachter nicht als Beweis, sondern als Warnung: *Bei der Konkurrenz bekomme ich nie einen Auftrag.* Verknappung wäre hier das stärkere Argument als Masse.

Nebenbei: die Zahl wird ohne Tausendertrennzeichen ausgegeben („10034").

**Was stattdessen.** Die Zahl streichen oder auf das ändern, was sie tatsächlich misst. Zwei tragfähige Varianten:

- **Ehrliche Knappheit:** „Wir nehmen derzeit Sachverständige in *N* Regionen auf." Das ist wahr, überprüfbar und erzeugt genau den Sog, den die falsche Zahl zerstört.
- **Die Karte ehrlich beschriften:** Die Pins auf der Karte *sind* die `sv_leads`. Wenn dort steht „10.019 Kfz-Sachverständige in Deutschland erfasst — *N* davon sind Claimondo-Partner", ist die Datenbasis ein Aktivposten statt eines Risikos, und der Claim-Flow („Finde deinen Eintrag") wird dadurch überhaupt erst verständlich.

Der Fix ist klein: `getNetzwerkGroesse()` darf `sv_leads` nicht mitzählen, oder die beiden Zahlen müssen getrennt ausgewiesen werden.

---

## 2 — Fünf widersprüchliche Aussagen zur Freischaltung, auf einer Seite ⛔

**Was ist.** `/gutachter-partner` beantwortet die Frage „wann kann ich anfangen?" fünfmal, und jedes Mal anders. Alle fünf sind live, in Lesereihenfolge:

| Position | Aussage | Quelle |
|---|---|---|
| Hero, 1. Absatz | „Wir nehmen Partner **regional gestaffelt** auf — **sobald Ihre Region dran ist, melden wir uns.**" | `hero.subheadline` |
| Schritt 2 | „Sie schalten sich **selbst frei, ohne Wartezeit**." | `content.schritte[1]` |
| Onboarding-Block | „Registrierung und Onboarding dauern zusammen **unter 15 Minuten** — danach sind Sie freigeschaltet" | `content.onboarding_text` |
| nach Absenden | „Nach unserer Prüfung (**innerhalb von 48 Stunden**) schalten wir dein Profil frei." | `SvClaimClient.tsx:518` |
| FAQ | „Nach Freischaltung Ihrer Region: **7 bis 14 Werktage** … 30-minütiger Live-Onboarding-Call" | `content.faqs[3]` |

Der Kommentar in `page.tsx:57` dokumentiert, dass das Warteliste-Modell am 04.08. abgeschafft wurde („Sofort-Start-Umbau"). Der **Code** wurde umgestellt, die **Texte** nicht: Hero-Subheadline und FAQ tragen weiterhin das alte Modell. Das Warteliste-Vokabular liegt komplett noch in `de.json` (`success.headline: "Sie stehen auf der Liste."`, `form.submit: "Auf die Warteliste setzen"`).

**Warum es schadet.** Der erste Satz, den ein Sachverständiger liest, sagt ihm *„warte, wir melden uns"* — und nimmt damit jedem CTA darunter die Dringlichkeit. Er ist die teuerste Zeile der Seite, weil sie oberhalb der Falz steht und die Handlung stoppt, bevor sie beginnt. Die FAQ-Antwort ist zusätzlich im `FAQPage`-Schema (`partner-faq.ts`) — Google kann ausgerechnet die veraltete „7 bis 14 Werktage"-Antwort als Rich Result ausspielen.

**Was stattdessen.** Eine Zeitangabe festlegen und alle fünf Stellen darauf ziehen. Nach Codelage ist das reale Versprechen: *sofort registrieren und sichtbar, Verifizierung läuft parallel*. Konkret:

- `hero.subheadline` → das Warteliste-Framing ersetzen, z. B. „In wenigen Minuten registriert und im Gutachter-Finder sichtbar. Die Qualifikationsprüfung läuft parallel."
- FAQ „Wie lange dauert das Onboarding?" → auf dasselbe Versprechen umschreiben, inkl. der 48-Stunden-Prüfung als *paralleler* Schritt.
- Tote Warteliste-Keys aus `de.json` entfernen (`success.*`, `form.*` — das zugehörige Formular existiert laut Kommentar nicht mehr).

---

## 3 — Die Geldfrage wird auf allen vier Seiten umschifft ⛔

**Was ist.** Gemessen über den sichtbaren Text aller vier Partnerseiten: die **einzige** Geldzahl ist „0 €".

| Seite | Prozentangaben | Eurobeträge |
|---|---|---|
| `/werkstatt/partner-werden` | keine | `0 €` |
| `/flotte/partner-werden` | keine | `0 €` |
| `/makler/partner-werden` | keine | `0 €` |
| `/gutachter-partner` | keine | **keine** |

Die Seiten sagen durchweg, was *nicht* kostet. Was kostet, wird benannt, aber nie beziffert:

- Werkstatt: „Provision nur auf Erfolg" — Höhe: nirgends.
- Gutachter: „Die konkrete Plattform-Provision hängt von Auftragsvolumen und Region ab und wird **im Erstgespräch** transparent besprochen."
- Gutachter, Karte: „**Pro/Premium-Pakete** liefern größere Radien — das besprechen wir im Erstgespräch." Bezahlpakete werden erwähnt, ohne Preis, auf einer Seite mit der Überschrift „Kostenlos starten".
- Gutachter: „Optional sichern Sie sich als **Netzwerkpartner** die bevorzugte Platzierung" — ebenfalls ohne Preis.

**Warum es schadet.** Das ist die eine Frage, mit der diese Zielgruppe auf die Seite kommt. „Besprechen wir im Erstgespräch" ist für einen skeptischen Unternehmer kein Versprechen von Transparenz, sondern deren Gegenteil: Es signalisiert, dass der Preis von ihm abhängt und verhandelt wird — also dass es einen schlechteren und einen besseren Deal gibt und er nicht weiß, welchen er bekommt. Der Widerspruch zwischen „kostenlos" in der Überschrift und drei unbezifferten Bezahlstufen im Text ist genau das Muster, das Vermittlungsportale ihren schlechten Ruf eingebracht hat.

**Was stattdessen.** Eine Zahl oder eine Spanne, sichtbar ohne Scrollen. Die BVSK-Honorartabelle ist bereits als Grundlage genannt — darauf lässt sich eine Beispielrechnung stellen, ohne sich auf einen Satz festzulegen:

> „Beispiel: Schaden 6.000 €, BVSK-Honorar 1.020 €. Claimondo-Anteil: X %. Ihr Netto: Y €. Kein Grundpreis, keine Mindestabnahme, keine Laufzeit."

Für Werkstatt gilt dasselbe mit einer zusätzlichen Chance: Nach interner Festlegung fällt die Provision **nur bei inbound-Haftpflichtfällen** an. Das ist eine Einschränkung *zugunsten* des Partners — sie steht nicht auf der Seite, obwohl sie eines der stärksten Argumente wäre. (Bitte vor Veröffentlichung gegenprüfen; ich stütze mich hier auf eine interne Notiz, nicht auf den Vertragstext.)

Ebenfalls nirgends beantwortet, obwohl es jeder fragt: **Vertragsbindung, Laufzeit, Kündigungsfrist.** Für Gutachter gibt es immerhin die gute Aussage „keine Exklusiv-Bindung"; für Werkstatt, Flotte und Makler fehlt sie ganz.

---

## 4 — Kein einziges Formular sagt, was danach passiert ⛔

**Was ist.** Alle vier CTA-Ziele sind erreichbar (HTTP 200, geprüft 23.08.). Gemessen am gerenderten Formular:

| Zielgruppe | sichtbare Felder | „wie es weitergeht"-Hinweis |
|---|---|---|
| Werkstatt | **15** (8 Pflicht + 5 Leistungs-Checkboxen + 2 Bestätigungen) | **keiner** |
| Makler | **11** (6 Pflicht + Rechtsform + Pool-Wahl + 2 Bestätigungen) | **keiner** |
| Flotte | **4** (3 Pflicht) | **keiner** |
| Sachverständiger | **1** (Suchfeld, dann schrittweise) | **keiner** |

Auf keiner der vier Registrierungsseiten steht, was nach dem Klick auf „Kostenlos registrieren" passiert — kein „Sie erhalten sofort eine E-Mail", kein „wir prüfen innerhalb von X", kein „danach sind Sie im Finder sichtbar".

*Einschränkung:* Ich habe die Formulare nicht abgeschickt (kein Schreibzugriff auf Prod ohne Freigabe). „Erreichbar" ist belegt, „funktionsfähig" nicht — ein 200 beweist nur, dass die Seite lädt.

**Warum es schadet.** Genau das schwarze Loch. Wer 15 Felder ausfüllt, will vorher wissen, wofür. Die Kombination ist besonders ungünstig, weil die Reibung dort am höchsten ist, wo der Landing-Page-Text sie am niedrigsten verspricht: Die Werkstatt-Seite endet mit **„Kostenlos. Unverbindlich. Sofort startklar."** — und führt auf ein 15-Feld-Formular inklusive §19-UStG-Frage.

**Was stattdessen.**

- Auf jede Registrierungsseite eine Drei-Schritt-Vorschau über das Formular: *1. Formular (2 Min) → 2. Bestätigungs-E-Mail → 3. Sie sind im Finder sichtbar.*
- Werkstatt-Formular entschlacken: Die fünf Leistungs-Checkboxen (Karosserie/Lackierung/Mechanik/Glas/Smart Repair) und die Steuerfrage gehören ins Profil **nach** der Registrierung, nicht davor. Vier Felder wie bei Flotte reichen für den Einstieg.
- Die Versprechen angleichen: entweder „Sofort startklar" streichen oder das Formular auf dieses Versprechen kürzen.

---

## 5 — `/gutachter-partner` läuft ohne Navigation, Logo und mit zwei H1 🔶

**Was ist.** Die Seite rendert ab Pixel 0 mit dem dunklen Hero. Kein Claimondo-Logo, keine Topbar, keine Navigation. Verifiziert: Der einzige Treffer für „Werkstatt finden" im ausgelieferten HTML liegt im RSC-Script-Payload (Byte 129112), nicht im gerenderten Markup — auf der Werkstatt-Seite steht er dagegen als echtes `<a href="/werkstatt-finden">`. Ursache: `gutachter-partner/layout.tsx` gibt nur `children` zurück, die Seite montiert `LandingTopbar` nicht.

Zusätzlich hat die Seite als einzige **zwei `<h1>`**: ein `sr-only`-H1 in `page.tsx:104` und das sichtbare H1 in `GutachterPartnerClient.tsx:193`. Beide tragen unterschiedlichen Text.

Der `PartnerFooter` enthält Impressum, Datenschutz und AGB — rechtlich ist die Seite also in Ordnung. Das Problem ist Vertrauen, nicht Compliance.

**Warum es schadet.** Eine B2B-Akquiseseite ohne Absender im Kopfbereich sieht aus wie eine zugekaufte Kampagnenseite. Wer prüfen will, mit wem er es zu tun hat — und diese Zielgruppe prüft —, findet oben nichts und muss über fünf Bildschirmhöhen bis zum Footer scrollen. Zwei H1 mit unterschiedlichem Inhalt ist außerdem ein vermeidbarer SEO- und Screenreader-Defekt.

**Was stattdessen.** `LandingTopbar` in `gutachter-partner/layout.tsx` montieren (wie auf den anderen drei Partnerseiten). Das `sr-only`-H1 entfernen und stattdessen dem sichtbaren H1 den vollständigen Text geben — dann trägt ein Element beide Aufgaben.

---

## 6 — Anrede-Bruch genau am Konversionspunkt 🔶

**Was ist.** `/gutachter-partner` siezt im Hero und in allen Inhaltsblöcken („Werden **Sie** Claimondo-Partner", „**Ihr** Gebiet, **Ihr** Radius") — 34 Sie-Formen. Der Claim-Flow direkt darunter duzt:

> „Finde **deinen** Eintrag · Suche nach **deinem** Namen, **deiner** Firma"

Der Bruch ist oberhalb der Falz sichtbar und verschärft sich im weiteren Verlauf: „Das bin ich", „Bestätige **deine** Kontaktdaten", „Lege ein neues Profil an", „schalten wir **dich** frei", „**Deine** DAT-Sachverständigennummer", „Mit dem Absenden stimmst **du** unseren Nutzungsbedingungen zu" (`SvClaimClient.tsx`). Der Kommentar in `PartnerContent.tsx:7` hält als Vorgabe ausdrücklich „B2B Sie-Anrede" fest — der Claim-Flow wurde aus dem App-Kontext übernommen und nicht angepasst (siehe Dateikopf: *„Repliziert SvRegistrierenClient aus dem Haupt-App-Flow"*).

**Warum es schadet.** Die Zielgruppe sind selbstständige Sachverständige, überwiegend gestandene Unternehmer. Das plötzliche Du ausgerechnet in dem Formular, in dem sie ihre Daten hergeben, wirkt unprofessionell und lässt die Seite zusammengesetzt statt gemacht wirken. Es ist der billigste Fix im ganzen Bericht.

**Was stattdessen.** `SvClaimClient.tsx` durchgängig auf Sie umstellen (rund 15 Strings). Falls die Komponente auch im App-Kontext läuft, wo Du gewollt ist: Anrede als Prop durchreichen.

---

## 7 — Zwei Zahlen ohne Quelle, während eine dritte vorbildlich belegt ist 🔶

**Was ist.** Auf `/vorteile`, `/ueber-uns` und der Startseite steht die Kürzungsquote mustergültig bequellt:

> „30–40 %¹ … ¹ Quelle: NDR-Reportage „Prüfdienstleister" 2022, Verbraucherzentrale-Auswertungen, BGH VI ZR 38/22 ff. / VI ZR 65/18 / VI ZR 174/24."

Im selben Kachelblock stehen zwei Zahlen **ohne** Fußnote:

- **„8 Mio. €+ durchgesetzte Ansprüche (Aggregat)"** (`vorteile.kpis[1]`, identisch `home.kpis[1]`)
- **„32 Tage Ø bis zur Auszahlung"**

Gegen Prod gemessen: 78 Claims insgesamt, davon **0** mit erfasster Schadenhöhe (`schadens_hoehe_netto`), 2 mit Kostenvoranschlag über zusammen 5.000 €. 8 Mio. € auf 78 Fälle wären ~103.000 € pro Fall — für Kfz-Haftpflichtschäden nicht plausibel.

*Unsicherheit, ausdrücklich:* Das Wort „(Aggregat)" deutet darauf hin, dass hier bewusst etwas anderes gemeint ist als das Plattformvolumen — etwa die kumulierte Historie der Partner-Sachverständigen oder Vorerfahrung der Gründer. Das kann legitim sein. Nachweisen kann ich es nicht, und ein Leser, der die Kachel neben „32 Tage Ø bis zur Auszahlung" sieht, liest sie als Claimondos eigene Bilanz.

**Warum es schadet.** Das Team kann Belege — es hat sie bei der 30–40 %-Aussage geliefert und laut Kommentar in `makler/partner-werden/page.tsx:92` am 14.05. bereits einmal Phantom-Zahlen entfernt („'89+' und '97 %'"). Genau deshalb fallen die zwei verbliebenen unbequellten Zahlen auf: Sie stehen direkt neben dem Beweis, dass es auch anders geht. Für Partner, die diese Seiten zur Beurteilung des Unternehmens lesen, ist eine unbelegte Millionenzahl das Signal, dem Rest auch nicht zu trauen.

**Was stattdessen.** Entweder eine Fußnote nach dem Muster der 30–40 %-Angabe (was genau ist aggregiert, über welchen Zeitraum, welche Quelle) — oder die Kachel durch eine Zahl ersetzen, die aus der Plattform belegbar ist. Dasselbe für „32 Tage".

---

## 8 — Unterscheidbarkeit: der Text ist verschieden, das Argument ist identisch 🔶

Das habe ich gemessen statt geschätzt. Near-Duplicate über 8-Wort-Shingles am **gerenderten** Text, bereinigt um das geteilte Chrome (Topbar + Footer = 136 gemeinsame Shingles, ermittelt als Schnittmenge über sechs Referenzseiten):

| Paar | Body-Überlappung |
|---|---|
| Werkstatt ↔ Makler | 2,7 % (20 Shingles) |
| Werkstatt ↔ Flotte | 2,4 % (19) |
| Flotte ↔ Makler | 1,4 % (11) |
| alle gegen `/gutachter-partner` | 0,0 % |

**Die Formulierungen sind also nicht kopiert.** Die Vermutung „dieselbe Seite mit ausgetauschtem Substantiv" trifft auf der Textebene nicht zu — das ist eine gute Nachricht und heißt: hier muss nicht neu geschrieben werden.

**Identisch ist die Architektur.** Alle drei Seiten haben exakt dieselbe Abschnittsfolge, dieselben Array-Längen und dieselben Klassen (373 / 370 / 368 Zeilen Quelltext):

`Hero mit Pill-Badge → AnswerCapsule → 4 Zahlenkacheln → 4 Nutzen-Karten → 3 Ablaufschritte → 4er-Checkliste → Cross-Link → Navy-CTA`

Und drei der vier Nutzen-Karten machen auf allen Seiten dieselbe Aussage, teils fast wörtlich:

- „Persönlicher Ansprechpartner — **Kein Ticketsystem, kein Callcenter.** Sie erreichen direkt das Claimondo-Team" — auf allen dreien nahezu identisch
- „Rechtssichere Haftpflicht-Abwicklung … §249 BGB" — Werkstatt und Flotte nahezu identisch
- Zahlenkacheln: `< 48h Ø Gutachten-Termin` auf allen dreien, `§249` auf zweien, `BVSK` auf zweien

**Warum es schadet.** Von vier Nutzenargumenten ist nur eines zielgruppenspezifisch. Ein Flottenbetreiber und ein Makler haben grundverschiedene Interessen — der eine will Ausfallzeit senken und Verwaltung loswerden, der andere will Kundenbindung und darf berufsrechtlich nichts falsch machen. Beide bekommen dieselben drei Sätze über Ticketsysteme und §249 BGB. Wo die Seiten spezifisch werden, sind sie gut (Flotte: „Netzwerkkarte am Fahrzeug", Makler: „§34d GewO"); das trägt aber nur ein Viertel der Fläche.

**Was stattdessen.** Kein Rewrite. Je Seite die drei generischen Nutzen-Karten gegen zielgruppeneigene tauschen und die generischen Aussagen in eine kleinere gemeinsame Zeile verschieben. Zum Beispiel:

- **Flotte:** Standzeit/Ausfalltage statt „Persönlicher Ansprechpartner"; Ersatzfahrzeug-Frage; wer haftet bei Fahrerverschulden.
- **Makler:** Haftungsfrage bei Empfehlung; was passiert mit *seiner* Kundenbeziehung; Abgrenzung zur eigenen Courtage.
- **Werkstatt:** Auslastung; wer zahlt bei Streit über die Kalkulation; Verhältnis zur Versicherer-Steuerung.

Bei den `< 48h`- und `BVSK`-Kacheln zusätzlich prüfen, ob sie belegt sind — „BVSK zertifiziertes Partner-Netzwerk" liest sich, als zertifiziere der BVSK das Netzwerk. Tatsächlich prüft Claimondo die BVSK-Mitgliedschaft einzelner SVs. Das ist eine andere Aussage und sollte umformuliert werden („Sachverständige mit BVSK-, IHK- oder öbuv-Nachweis").

---

## 9 — Makler: CTA verspricht Rückruf, Formular ist Selbstbedienung 🔹

**Was ist.** Der Abschluss-CTA lautet „Partnerschaft anfragen." mit der Unterzeile **„Kostenlos. Unverbindlich. In 24 Stunden Rückmeldung."** — der Button daneben heißt „Jetzt kostenlos registrieren" und führt auf ein 11-Feld-Selbstregistrierungsformular. Auf der Zielseite ist von einer Rückmeldung innerhalb 24 Stunden keine Rede.

**Warum es schadet.** Zwei verschiedene Angebote im selben Block. Wer eine Anfrage erwartet, wird mit einem Kontoformular überrascht; wer sich registriert, wartet danach auf einen Anruf, der so nirgends zugesagt ist. Kleiner Effekt als 1–4, aber trivial zu beheben.

**Was stattdessen.** Entscheiden, welches der Weg ist. Bei Selbstregistrierung: „In zwei Minuten registriert — Zugang sofort." Bei Rückruf: den Button auf ein Kontaktformular führen und die 24 Stunden dort wiederholen.

---

## Was gut ist — bitte nicht anfassen

- **Die Hero-Zone von Werkstatt, Flotte und Makler.** Das Angebot steht bei allen dreien in der ersten Bildschirmhöhe, auch mobil: Badge auf ~129 px, H1 auf ~195 px, CTA auf 480–542 px bei 844 px Viewport-Höhe. Die Badge-Zeile „Kostenlos gelistet · Aufträge über den Finder · Provision nur auf Erfolg" leistet in einer Zeile, was viele Seiten in einem Absatz nicht schaffen — Leistung, Preis und Bedingung. Das ist das Muster, an dem sich `/gutachter-partner` ausrichten sollte.
- **Die Quellenarbeit bei der 30–40 %-Aussage.** NDR, Verbraucherzentrale und drei BGH-Aktenzeichen mit Fußnote: vorbildlich, und für eine skeptische Zielgruppe stärker als jede Selbstauskunft.
- **Der Verzicht auf Phantom-Zahlen** auf den drei klassischen Partnerseiten. Der UWG-Fix vom 14.05. hat gehalten.
- **Die Ehrlichkeit im Verdienst-Abschnitt für Gutachter.** „Aufträge sind nicht exklusiv … Wir sind ein zusätzlicher Kanal, keine Bindung" beantwortet die Kernangst der Zielgruppe direkt und ohne Ausflüchte. Diesen Ton bräuchte auch die Provisionsfrage.
- **Der Claim-Flow als Einstieg** (`SvClaimClient`). Ein Feld statt eines Formulars, „Finde deinen Eintrag" statt „Registrieren" — das ist die niedrigste Hürde aller vier Zielgruppen und konzeptionell die beste Idee auf den Partnerseiten. Sie wird derzeit von der falschen Netzwerkzahl und dem Warteliste-Text zugedeckt.
- **Die Hub-Spoke-Struktur** der drei Ratgeber-Unterseiten. Alle drei verlinken sauber zurück auf `/gutachter-partner`, keine Sackgassen, und mit 514–588 Wörtern eigenständigem Text (0 % Überlappung untereinander nach Chrome-Abzug) sind sie kein Dünnschicht-Content.

---

## Reihenfolge der Umsetzung

| # | Befund | Aufwand | Wirkung |
|---|---|---|---|
| 1 | Netzwerkzahl 10034 korrigieren (Code + JSON-LD) | klein | sehr hoch — Rechtsrisiko |
| 2 | Freischaltungs-Versprechen vereinheitlichen (5 Stellen) | klein | sehr hoch |
| 3 | Provision beziffern (alle vier Seiten) | mittel — braucht Entscheidung | sehr hoch |
| 4 | „Wie es weitergeht" auf die vier Formulare | klein | hoch |
| 5 | Werkstatt-Formular von 15 auf ~5 Felder | mittel | hoch |
| 6 | Topbar auf `/gutachter-partner`, doppeltes H1 weg | klein | mittel |
| 7 | `SvClaimClient` auf Sie umstellen | klein | mittel |
| 8 | „8 Mio. €+" und „32 Tage" bequellen oder streichen | klein | mittel |
| 9 | Je Seite 3 generische Nutzen-Karten ersetzen | mittel | mittel |
| 10 | Makler-CTA vereindeutigen | klein | niedrig |

---

## Methodische Hinweise

- Alle 10 Seiten am 23.08.2026 live abgerufen, alle HTTP 200.
- Zahlenversprechen gegen Prod (`paizkjajbuxxksdoycev`) gemessen, nicht gegen Marketing-Texte.
- Duplikatsmessung am gerenderten Text mit Chrome-Referenzwert — ohne diesen Abzug hätten die Paare 16–18 % gezeigt und die Diagnose in die falsche Richtung gelenkt (die 136 Chrome-Shingles machen den Großteil aus).
- Falz-Messung mit echtem Browser bei 1440×900 und 390×844, nicht aus dem Quelltext geschätzt.
- **Nicht geprüft:** ob die Registrierungsformulare erfolgreich absenden. Das hätte Schreibzugriff auf Prod bedeutet. HTTP 200 belegt Erreichbarkeit, nicht Funktion.
