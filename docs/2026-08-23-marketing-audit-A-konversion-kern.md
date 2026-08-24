# Marketing-Audit A — Konversions-Kernseiten claimondo.de

**Datum:** 2026-08-23
**Geprueft:** `/`, `/schaden-melden`, `/schaden-melden/selbstverschulden`, `/ersteinschaetzung`, `/check`, `/beratung-anfragen`, `/gutachter-finden`, `/werkstatt-finden`
**Methode:** Live-Rendering gegen `https://claimondo.de` mit Playwright, iPhone-13-Viewport (390x844, DPR 3), Locale de-DE. Screenshots + DOM-Messung (CTA-Positionen, Feldlisten, Scrollhoehen, Ladezeiten). Funnel `/check` interaktiv durchgespielt bis zum Ergebnis. **Kein Formular abgesendet** — es wurden keine Leads erzeugt.

**Geltungsbereich der Messung:** nur Mobile (390 px). Desktop wurde nicht geprueft. Die Ladezeiten sind je 2 Laeufe von diesem Rechner — der Absolutwert haengt an der Leitung, der **Vergleich** der beiden Embeds untereinander ist die belastbare Aussage.

---

## Zusammenfassung

Der Inhalt dieser Seiten ist gut. Die Kostenfrage — die entscheidende Huerde bei diesem Produkt — ist ueberall frueh und klar beantwortet, und der `/check`-Funnel ist handwerklich der beste Flow der Website. Was Konversion kostet, sind **nicht die Texte, sondern zwei Overlays und eine Wegefuehrung**: Zwei fest positionierte Elemente verdecken auf jedem Handy-Bildschirm genau das, was der Nutzer lesen und antippen soll, und der beste Funnel ist von der Startseite aus nicht verlinkt.

Die ersten drei Befunde sind Layout-/Verdrahtungsfehler, keine Textfragen. Sie sind vergleichsweise billig zu beheben und wirken auf allen Seiten gleichzeitig.

---

## 1. Das ProvenExpert-Siegel verdeckt auf JEDER Seite die Hauptueberschrift — Mobile

**Was ist.** Das Bewertungs-Siegel ist fest positioniert (`position: fixed`, rechte Bildschirmhaelfte, ca. y 590–1045 bei 844 px Viewporthoehe) und liegt ueber dem Seiteninhalt. Es bleibt beim Scrollen stehen. Auf allen acht geprueften Seiten schneidet es die H1 und den Einleitungstext ab. Gemessen, nicht vermutet:

| Seite | Was der Nutzer tatsaechlich liest |
|---|---|
| `/` | „Unverschulde**…** Unfall? Wir haben's i**…** Griff." |
| `/schaden-melden` | „Ihren Schade**…** in wenige**…** Minuten me**…**" |
| `/check` | „Was steht**…** Ihnen na**…** dem Unfall**…**" |
| `/check` (Ergebnis) | „Unverschuldet? Dann zahlt die geg**…** Versicherung. Nach §249 BGB wer**…** gestellt, als waere der Unfall nie pa**…**" |
| `/gutachter-finden` | verdeckt die Karte; sichtbar bleibt „Claimon**…**" + Ladespinner |
| `/werkstatt-finden` | verdeckt die Karte rechts oben |

Auf `/check` trifft es damit ausgerechnet den Satz, der die Kostenfrage beantwortet.

**Warum es schadet.** Der erste Bildschirm ist die einzige Stelle, an der ein gestresster Nutzer entscheidet, ob er bleibt. Das Nutzenversprechen ist dort nicht lesbar — auf keiner der acht Seiten. Das Siegel soll Vertrauen schaffen und zerstoert dabei die Aussage, die Vertrauen schaffen wuerde. Der Minimieren-Knopf ist **20x20 px** (gemessen) und liegt damit deutlich unter der 44-px-Mindestgroesse fuer Tap-Ziele — der Ausweg ist auf dem Handy kaum treffbar.

**Was stattdessen.** Auf Viewports < 768 px das Siegel nicht als Overlay ausspielen, sondern als statischen Block in den Fluss setzen — sinnvollerweise unter dem Hero oder bei den Trust-Elementen, wo es ohnehin hingehoert. Falls das Overlay bleiben soll: erst nach dem ersten Scroll-Ereignis einblenden, unten links statt mittig rechts, und den Schliessen-Knopf auf mindestens 44x44 px. Der schnellste Zwischenschritt, falls die Widget-Konfiguration das hergibt, ist der Mobile-Aus-Schalter von ProvenExpert selbst.

---

## 2. Die Sticky-CTA-Leiste verdeckt Formularinhalte — und zieht aus dem Funnel heraus

**Was ist.** Am unteren Rand klebt auf `/`, `/check`, `/ersteinschaetzung` und `/beratung-anfragen` eine Leiste mit drei Elementen: „Gutachter finden" (358x48 px, navy, volle Breite), darunter „Sofort anrufen" (250x50) und „Rueckruf" (100x50). Sie belegt die unteren ~120 px des Bildschirms und liegt ueber dem Inhalt.

Auf `/check` — der Seite, deren einziger Zweck es ist, drei Fragen beantworten zu lassen — liegt sie damit exakt auf den Antwortmoeglichkeiten. Gemessene Koordinaten im ungescrollten Zustand: Antwortknopf „Der Unfallgegner" bei y 583–641, Leiste „Sofort anrufen" bei y 598–648. Von vier Antwortoptionen ist bei Ankunft **eine vollstaendig und eine halb** sichtbar; die Frage selbst („Wer traegt die Schuld am Unfall?") wird vom oberen Rand der Leiste angeschnitten. Auf dem Ergebnisbildschirm verdeckt sie die vierte Anspruchsposition.

**Warum es schadet.** Zwei Dinge zugleich. Erstens verdeckt sie das Bedienelement, das der Nutzer als naechstes braucht. Zweitens — und das wiegt schwerer — ist der **visuell dominanteste Knopf der Seite ein Ausstieg**: Auf einer Funnel-Seite ist „Gutachter finden" grossflaechig, dunkel und volle Breite, waehrend die eigentlichen Antwortoptionen weisse, umrandete Knoepfe sind. Die Seite bewirbt gegen sich selbst.

**Was stattdessen.** Auf Funnel- und Formularseiten (`/check`, `/schaden-melden`) die Sticky-Leiste ganz weglassen — dort ist der Seiteninhalt der CTA. Wo sie bleibt (`/`), reicht **ein** Element statt drei, und der Seiteninhalt braucht unten ein `padding-bottom` in Hoehe der Leiste, damit nichts dauerhaft darunter verschwindet. Wenn auf `/check` ein Notausgang gewuenscht ist, gehoert er als unauffaelliger Textlink unter den Funnel, nicht als dominantester Knopf darueber.

---

## 3. `/gutachter-finden` — das Ziel des Haupt-CTA — laedt 6–7 Sekunden und fragt dann das Falsche zuerst

**Was ist.** „Gutachter finden" ist der prominenteste CTA der Startseite (erster Knopf im Hero, y=542) und das haeufigste Linkziel im Seiteninhalt. Die Seite besteht ausschliesslich aus einem iframe auf `app.claimondo.de/embed/gutachter-finder`. Zwei Messungen:

| Seite | Bis interaktiv | Erster Schritt im Wizard |
|---|---|---|
| `/gutachter-finden` | **5.958 ms / 7.160 ms** | „Ihr Wunschtermin — *Optional* — waehlen Sie Ihren Wunschtag und die Uhrzeit" |
| `/werkstatt-finden` | 2.466 ms / 2.309 ms | „Wo steht das Fahrzeug?" |

In den ersten sechs Sekunden sieht der Nutzer eine leere Flaeche mit Ladespinner und dem angeschnittenen Wort „Claimon…". Kein Text, kein Hinweis, dass etwas passiert.

Danach oeffnet der Wizard mit einer Terminauswahl (14 Tages- und 12 Stundenknoepfe), die als „Optional" gekennzeichnet ist, und erst darunter kommt „Wo steht das Fahrzeug?".

**Warum es schadet.** Der wichtigste Weg ins Produkt ist der langsamste Weg der Website — knapp dreimal so lang wie der Werkstatt-Finder, der technisch dasselbe tut. Sechs Sekunden Leerfläche nach einem Klick liest sich als „kaputt", besonders auf Mobilfunk und besonders bei jemandem, der gerade einen Unfall hatte.

Die Schrittreihenfolge kostet zusaetzlich: Der Nutzer soll einen Termin waehlen, bevor er weiss, ob ueberhaupt ein Gutachter in seiner Naehe verfuegbar ist. Das ist eine Entscheidung ohne Entscheidungsgrundlage. Dass der Schritt „Optional" heisst, hilft nicht — er steht trotzdem als erste Huerde im Weg, und die Karte zeigt beim Start ganz Deutschland ohne einen einzigen sichtbaren Gutachter-Marker, also auch keinen Beleg fuer Abdeckung.

**Was stattdessen.** Drei Dinge, in dieser Reihenfolge:
1. **Schritte tauschen** — „Wo steht das Fahrzeug?" nach vorn, Terminwahl danach, genau wie im Werkstatt-Finder. Das ist vermutlich eine Konfigurations- oder Reihenfolgeaenderung im Embed und der billigste der drei Punkte.
2. **Ladezeit angehen** — warum das Gutachter-Embed dreimal so lang braucht wie das Werkstatt-Embed, ist eine offene Frage; die Zahl belegt den Unterschied, nicht die Ursache. Der Verdacht liegt beim initialen Datenabruf (alle SV-Standorte bundesweit) gegenueber dem parametrisierten Aufruf, den die Startseite benutzt (`?lat=51.1&lng=10.2&zoom=5.3`) — das muesste jemand mit Zugriff auf das Embed pruefen.
3. **Skelett statt Spinner** — solange geladen wird, Kartenumriss und Eingabefeld als Platzhalter zeigen, damit die Seite arbeitet statt haengt.

---

## 4. Die Startseite ist 76 Bildschirme lang — und verlinkt den besten Funnel kein einziges Mal

**Was ist.** Gemessene Scrollhoehe der Startseite: **50.367 px** = 76 Handy-Bildschirme. Darauf 373 klickbare Elemente, davon 330 im Seitenkoerper. Wohin sie fuehren:

- **198** sind Knoepfe ohne Ziel (FAQ-Akkordeons, Aufklapper)
- **14** tragen generische Beschriftungen: 7x „Mehr erfahren", 5x „Details ansehen", dazu „Alle Themen ansehen"
- **4x** `/gutachter-finden`, **4x** `tel:`, **3x** `/schaden-melden`, **2x** WhatsApp
- **0x** `/check` · **0x** `/beratung-anfragen` · **0x** `/ersteinschaetzung` · **0x** `/werkstatt-finden`

Der Gutachter-Finder-iframe sitzt auf y=25.967 — nach 39 Bildschirmen.

**Warum es schadet.** `/check` ist der sauberste Konversionsweg, den die Website hat (siehe „Was gut ist"), und aus dem Inhalt der Startseite fuehrt kein einziger Link dorthin — nur ein Eintrag im eingeklappten Menue. Drei weitere Konversionsseiten sind aus dem Startseiteninhalt ebenfalls unerreichbar. Gleichzeitig konkurrieren Dutzende Ratgeber-Links („Im Cluster ansehen", „Was BGH-fest gilt", „So vermeiden Sie diesen Fehler") um dieselbe Aufmerksamkeit. Fuer SEO mag das tragen; fuer jemanden, der gerade einen Unfall hatte und wissen will, was er jetzt tun soll, ist es eine Halde.

Die 14 generischen CTAs sind der kleinere, aber leicht behebbare Teil: „Mehr erfahren" sagt dem Nutzer nicht, was passiert, wenn er tippt.

**Was stattdessen.**
- **`/check` in den Hero.** Er kostet drei Klicks, liefert vorher einen Wert (die Anspruchsliste) und verlangt erst danach Kontaktdaten. Das ist das konversionsstaerkste Muster im Bestand und gehoert neben „Gutachter finden" auf den ersten Bildschirm — plausibel sogar davor, weil er schneller laedt und weniger verlangt. (Vermutung, nicht belegt: Ein A/B-Test „Anspruch pruefen" gegen „Gutachter finden" als primaerer Hero-CTA waere die Messung, die das entscheidet.)
- **Generische Labels ersetzen** — „Mehr erfahren" → „Was der BGH zum Werkstattrisiko sagt", „Details ansehen" → „Wie wir den Gutachter disponieren".
- Der Ratgeber-Block ist Substanz und soll bleiben; er gehoert nur hinter den Konversionspfad, nicht davor und nicht dazwischen.

---

## 5. `/beratung-anfragen` heisst „anfragen", hat aber kein Formular

**Was ist.** Null Formularfelder auf der Seite (gemessen). Angeboten werden ausschliesslich Telefon, WhatsApp und E-Mail. Die Ueberschrift lautet „Kostenlose Beratung. Direkt. Persoenlich.", der Text verspricht Rueckmeldung in unter 15 Minuten.

**Warum es schadet.** Der Seitenname setzt die Erwartung eines Formulars. Wer nicht telefonieren mag — nach einem Unfall, unterwegs, im Grossraumbuero, oder schlicht aus Gewohnheit — findet hier keinen Weg und muss zurueck. Die Startseite hat ein funktionierendes Rueckruf-Formular mit drei Feldern (Name, Telefon, Ort); auf der Seite, die „Beratung anfragen" heisst, fehlt es.

**Was stattdessen.** Das bestehende Rueckruf-Formular der Startseite (Name, Telefon, optional Ort — drei Felder, bereits gebaut) hierher uebernehmen und als primaeren Weg setzen, Telefon und WhatsApp gleichrangig daneben. Kein neues Bauteil noetig.

---

## 6. `/ersteinschaetzung` verspricht Foto-Upload und KI-Analyse — und liefert einen Link auf drei Textfragen

**Was ist.** Die Seite beschreibt einen Drei-Schritte-Ablauf: „Schritt 01: Fotos und Unfallbeschreibung hochladen · ca. 5 Minuten, keine Anmeldung erforderlich", „Schritt 02: Unsere KI analysiert Fotos und Beschreibung", „Schritt 03: Ergebnis + Empfehlung". Im strukturierten Datenblock steht „KI-basierte Sofortbewertung … Fotos hochladen, in unter 15 Minuten erhalten Sie Reparaturkosten-Schaetzung, Wiederbeschaffungswert und Gutachten-Empfehlung."

Gemessen: **null Formularfelder, kein Upload-Element.** Beide CTAs („Ersteinschaetzung starten", „Jetzt kostenlos einschaetzen lassen", `app/[locale]/ersteinschaetzung/page.tsx:134` und `:281`) zeigen auf `/check` — den Drei-Fragen-Funnel ohne Fotofunktion, der weder Reparaturkosten noch Wiederbeschaffungswert schaetzt.

**Warum es schadet.** Wer wegen der Fotoanalyse klickt, landet in einem Fragebogen und bekommt nicht, wofuer er gekommen ist. Das ist der teuerste Moment fuer Vertrauensverlust, weil er direkt nach einer expliziten Zusage kommt. Ein Nutzer, der das einmal erlebt, glaubt auch der 0-Euro-Aussage weniger.

**Was stattdessen.** Zwei ehrliche Wege, je nach Roadmap. Wenn die Fotoanalyse existiert oder bald kommt: Upload hier einbauen und die Seite halten. Wenn nicht: Die Seite auf das umschreiben, was sie liefert — „In 3 Fragen zur Einschaetzung, welche Ansprueche Sie haben" — und die Foto-/KI-Zusagen samt Schema.org-Beschreibung entfernen. Die Fassung mit Foto-Versprechen ohne Foto-Funktion sollte in keinem Fall online bleiben.

**Randbefund:** Diese Seite hat mit 8,9 Bildschirmen ausserdem viel Text fuer eine Seite, deren gesamte Funktion ein Weiterleitungsknopf ist.

---

## 7. Kleinere Reibungspunkte

**`/schaden-melden` — 8 Felder fuer einen Link.** Der Nutzer fuellt Schuldfrage, Unfalldatum, Unfallort, Vorname, Nachname, Telefon, E-Mail und DSGVO-Haken aus und bekommt dafuer „Ihren sicheren Link", in dem er laut Einleitung Gutachtertermin und Vollmacht *erst noch* erledigt. Unfalldatum und Unfallort koennten in den FlowLink wandern, wo der Nutzer ohnehin ist und mehr Ruhe hat — das senkt die Einstiegshuerde auf Kontaktdaten plus Schuldfrage. Zum Vergleich: `/check` kommt mit drei Klicks plus zwei Feldern aus und liefert vorher einen sichtbaren Gegenwert. Der Text „Drei kurze Fragen" trifft die tatsaechlichen acht Felder nicht ganz.

**Keine Fortschrittsanzeige auf `/schaden-melden`.** Das Formular hat drei benannte Bloecke („Wer ist schuld?", „Wann und wo?", „Wie erreichen wir Sie?"), zeigt aber keinen Fortschritt. `/check` und beide Finder-Embeds haben einen Balken. Ein „Schritt 2 von 3" ueber den Bloecken kostet wenig.

**Pflichtfelder nicht ausgezeichnet.** Der Wizard laeuft mit `noValidate` und validiert ueber zod — die Fehlermeldungen erscheinen sichtbar und feldnah, das ist sauber geloest und **kein** Konversionsproblem. Es fehlt aber `aria-required` an den Pflichtfeldern, sodass Screenreader den Pflichtcharakter vor dem Absenden nicht ansagen. Zugaenglichkeit, kein Konversionsthema — der Vollstaendigkeit halber notiert.

**`/schaden-melden/selbstverschulden` ist keine Sackgasse** — sie erklaert sachlich, warum Claimondo hier nicht zustaendig ist, gibt drei konkrete Handlungsschritte und bietet Werkstattsuche und Telefon an. Ehrlich und richtig gebaut. Ein Detail: Der Werkstatt-Knopf zeigt direkt auf `app.claimondo.de/embed/werkstatt-finder` statt auf die eigene Seite `/werkstatt-finden` — damit verlaesst der Nutzer die Marketing-Domain und verliert Kopf- und Fusszeile.

**`/werkstatt-finden` hat praktisch keinen eigenen Inhalt** (371 Zeichen ausserhalb des iframes) und keinen einzigen CTA im ersten Bildschirm ausser dem Embed selbst. Der Weiter-Knopf im Wizard ist grau und liest sich als deaktiviert, obwohl er der Fortschrittsknopf ist — ein aktiverer Farbton wuerde helfen. Das Embed selbst arbeitet gut.

---

## Was gut ist und nicht angefasst werden sollte

**Die Kostenfrage ist geloest.** Auf jeder einzelnen Seite steht die Antwort frueh und in klarer Sprache — „Fuer Sie 0 € (§ 249 BGB)" im Hero der Startseite, „Kostenlos & unverbindlich" ueber dem Formular von `/schaden-melden`, „Unverschuldeter Unfall? 0 € Eigenkosten fuer Sie" als H1 der Ersteinschaetzung, „Kostenlos · ohne Kostenrisiko" auf `/check`. Besonders stark: Auf `/schaden-melden` haengt der Satz „Klassischer Haftpflichtfall — die Gegnerversicherung reguliert. Sie zahlen nichts dazu" direkt an der Auswahl „Der Gegner ist schuld", also genau dort, wo die Frage im Kopf des Nutzers entsteht. Die FAQ nennt sogar konkrete Spannen (550–2.600 € nach BVSK) und erklaert die Teilschuld-Quote. Das ist besser geloest als bei den meisten Wettbewerbern und sollte unveraendert bleiben.

**Der `/check`-Funnel ist das beste Stueck der Website.** Interaktiv durchgespielt: drei Fragen, je eine pro Bildschirm, Fortschrittsanzeige „Frage 1 von 3", ab Frage 2 ein Zurueck-Knopf, grosse Antwortflaechen, keine Texteingabe. Am Ende steht zuerst ein Ergebnis mit Gegenwert („Das steht Ihnen zu — 0 € Eigenkosten" mit konkreter Anspruchsliste: Schadensgutachten, Wertminderung, Nutzungsausfall, Kostenpauschale) und **erst danach** das Kontaktformular mit drei Feldern, davon zwei Pflicht. Genau die richtige Reihenfolge: erst liefern, dann fragen. Dieser Flow braucht keine inhaltliche Aenderung — er braucht nur, dass die Sticky-Leiste ihn nicht verdeckt (Befund 2) und dass die Startseite ihn ueberhaupt verlinkt (Befund 4).

**Die Schuldfrage als Einstieg** ist auf `/schaden-melden` und `/check` richtig gesetzt: Sie qualifiziert sofort, sortiert Selbstverschulden sauber aus und beantwortet gleichzeitig die Kostenfrage — drei Dinge mit einer Frage.

**`/werkstatt-finden`** macht als Embed vor, was `/gutachter-finden` nicht macht: schnell laden, Ortsfrage zuerst, Fortschrittsbalken, Standort-Knopf als Abkuerzung.

---

## Vorschlag zur Reihenfolge

| # | Massnahme | Wirkung | Aufwand |
|---|---|---|---|
| 1 | ProvenExpert-Siegel auf Mobile aus dem Overlay nehmen | alle 8 Seiten, erster Bildschirm | klein |
| 2 | Sticky-Leiste auf `/check` + `/schaden-melden` entfernen, sonst auf 1 Element reduzieren + `padding-bottom` | Funnel-Seiten | klein |
| 3 | `/gutachter-finden`: Schritte tauschen (Ort vor Termin) | Haupt-CTA-Ziel | klein |
| 4 | `/check` in den Hero der Startseite | bester Funnel wird erreichbar | klein |
| 5 | `/ersteinschaetzung`: Versprechen und Funktion in Deckung bringen | Vertrauen | mittel — Roadmap-Entscheidung noetig |
| 6 | Rueckruf-Formular auf `/beratung-anfragen` | zweiter Kanal fuer Nicht-Anrufer | klein — Bauteil existiert |
| 7 | `/gutachter-finden`: Ladezeit 6–7 s untersuchen | Haupt-CTA-Ziel | unklar — Ursache offen |

---

## Offene Punkte / nicht belegt

- **Ursache der 6–7 s** auf `/gutachter-finden` ist nicht ermittelt. Belegt ist nur der Unterschied zum Werkstatt-Embed (2,3–2,5 s). Der Verdacht auf einen unparametrisierten bundesweiten Datenabruf ist eine Hypothese.
- **Desktop wurde nicht geprueft.** Ob Siegel und Sticky-Leiste dort ebenfalls verdecken, ist offen — bei Overlays mit fester Position ist es auf breiten Viewports meist unkritisch, aber ungemessen.
- **Ob das Siegel nach Minimieren dauerhaft verschwindet** (Cookie) wurde nicht getestet. Fuer Erstbesucher — die relevante Gruppe — gilt der gemessene Zustand.
- **Keine Konversionsdaten eingesehen.** Die Priorisierung folgt der beobachteten Reibung, nicht gemessenen Abbruchraten. Wo echte Trichterzahlen vorliegen, sollten sie diese Reihenfolge korrigieren duerfen.
- **`/check` mit der Antwort „Ich war (haupt)schuld"** wurde nicht durchgespielt — nur der Hauptpfad „Der Unfallgegner". Ob der Ausschlusspfad dort ebenso sauber endet wie `/schaden-melden/selbstverschulden`, ist ungeprueft.

---

# Nachtrag: Siegel-Position durchgerechnet

**Auftrag:** Positionen fuer Startseite und `/check` bei 375x667, 390x844 und 1440x900 ermitteln — H1, Sticky-Leiste, Siegel — und den `top`-Wert bestimmen, bei dem das Siegel zwischen beiden frei laege.

**Methode:** Playwright, echte Viewports (Mobile mit `isMobile`/`hasTouch`/iOS-UA, DPR 3), 5 s Wartezeit fuer das nachladende Widget. Gemessen wurde die **visuelle Vereinigungsbox** aller sichtbaren Siegel-Teile — sie faengt das runde Signet mit, das oben ueber die weisse Karte hinausragt.

## Kurzantwort

**Nein — es gibt keinen `top`-Wert, der auf allen drei Breiten funktioniert. Auf den beiden Handy-Breiten gibt es ueberhaupt keinen.** Das Siegel ist auf Mobile 232 px hoch; die groesste zusammenhaengende Luecke im Bereich, den es belegt, misst 178 px auf der Startseite und **106 px auf `/check`**. Es fehlen also 54 bis 126 px. Das ist kein Positionsproblem, das man mit einer besseren Zahl loest, sondern ein Platzproblem.

Auf Desktop ist der aktuelle Wert dagegen **korrekt** und sollte bleiben.

## Die Messwerte

| Viewport | Seite | Header endet | H1 | Sticky-Leiste | Siegel (visuell) |
|---|---|---|---|---|---|
| 375x667 | Startseite | 65 | **243–390** | **545–651** | 116–348 |
| 375x667 | `/check` | 65 | **171–284** | **545–651** | 116–348 |
| 390x844 | Startseite | 65 | **243–390** | **722–828** | 116–348 |
| 390x844 | `/check` | 65 | **171–284** | **722–828** | 116–348 |
| 1440x900 | Startseite | 65 | 227–482 | *keine* | 91–340 |
| 1440x900 | `/check` | 65 | 183–284 | *keine* | 91–340 |

Auf beiden Handy-Breiten schneidet das Siegel die H1 — auf `/check` zusaetzlich den Einleitungssatz. Auf Desktop ueberdeckt es **nichts** (automatisch geprueft: leere Trefferliste), weil es dort bei x 1140–1440 liegt und der Textsatz nicht so weit nach rechts reicht.

## Zur Kartenhoehe: unveraendert, die alte Messung war richtig

Die gemessene Hoehe betraegt **232 px auf Mobile** und **249 px auf Desktop** — identisch auf Startseite und `/check`, also keine Drift und kein Unterschied je Seite. Das deckt sich exakt mit den Werten im CSS-Kommentar (Mobil y 116–348 = 232 px, Desktop y 91–340 = 249 px). Die dort genannten 275 px waren nie die Hoehe, sondern die Warnschwelle, ab der die Oberkante unter den Header rutschen wuerde; die ist weiterhin nicht erreicht.

**Die Messung vom 13.08. ist reproduzierbar und war nicht falsch.** Sie beantwortete die Frage nach fixen Elementen korrekt — es gibt tatsaechlich null Ueberlappung mit Header und CTA-Leiste. Nur nach dem Seiteninhalt hat damals niemand gefragt.

## Warum kein Wert passt — die Luecken

Gemessen wurde, welche Inhalte den vom Siegel belegten Streifen schneiden, und wie gross die freien Zwischenraeume sind:

| Viewport | Seite | groesste freie Luecke | Siegel braucht | fehlt |
|---|---|---|---|---|
| 375x667 | Startseite | 178 px | 232 px | **54 px** |
| 375x667 | `/check` | **106 px** | 232 px | **126 px** |
| 390x844 | Startseite | 182 px | 232 px | **50 px** |
| 390x844 | `/check` | **106 px** | 232 px | **126 px** |

Auf `/check` ist die einzige nennenswerte Luecke der Streifen zwischen Header-Unterkante und H1-Oberkante: y 65–171. Darunter folgt lueckenlos H1 (171–284), Einleitung (304–376), Fortschrittsbalken (457–463), "FRAGE 1 VON 3" (483–499), die Frage selbst (507–563) und die vier Antwortknoepfe (583–851). Es gibt dort schlicht keinen leeren Streifen von 232 px.

Auf der Startseite liegt zusaetzlich ein Hero-Bild ueber den gesamten Bereich. Ein Siegel ueber einem Foto ist zumutbar, deshalb habe ich das Bild bei der Luecken-Rechnung **nicht** als Sperrzone gewertet — nur Text und Bedienelemente. Auch unter dieser fuer das Siegel guenstigen Annahme bleibt die groesste Luecke bei 178 bzw. 182 px.

## Die Ursache in einer Zahl

| Viewport | Siegel | Anteil an der Bildschirmflaeche | Anteil an der Breite |
|---|---|---|---|
| 375x667 | 260 x 232 | **24,1 %** | **69 %** |
| 390x844 | 260 x 232 | **18,3 %** | **67 %** |
| 1440x900 | 300 x 249 | 5,8 % | 21 % |

Das Overlay ist auf Desktop ein Randelement und auf dem kleinsten Handy ein Viertel des Bildschirms. Bei 69 % Breitenanteil gibt es kein "daneben" — jede vertikale Position, die auf Inhalt trifft, verdeckt ihn. Deshalb traegt dieselbe Regel auf Desktop und scheitert auf Mobile.

## Zwei Funde am Rand, die beim Nachziehen wichtig waeren

**1. Auf Mobile steht das Siegel 8 px tiefer als der gesetzte Wert.** Das Widget bringt eine eigene Regel mit:

```css
@media only screen and (max-width: 600px) { .pe-pro-seal { margin: 8px; bottom: 0 } }
```

Das `margin: 8px` wirkt zusaetzlich zu `top: 340px !important` — gemessene Unterkante mobil ist deshalb **348**, auf Desktop **340**. Wer je einen Mobile-Wert setzt, muss diese 8 px einrechnen.

**2. `hideOnMobile` greift bei genau 600 px.** Im ausgelieferten Script-Bundle nachgelesen: Die Option setzt die Klasse `pe-visible-desktop`, und dazu existiert

```css
@media only screen and (max-width: 600px) { .pe-visible-desktop { display: none !important } }
```

Damit ist die Wirkung exakt bestimmt: Ausblendung bei Viewport-Breite **kleiner/gleich 600 px**. Beide Handy-Breiten fallen darunter, **Tablet 768 px und Desktop behalten das Siegel unveraendert** — inklusive der am 13.08. geprueften Tablet-Position (91–340). Die Grenze der Option faellt genau mit der Grenze des Platzproblems zusammen.

## Empfehlung

**`hideOnMobile: true` in `components/shared/ProSealWidget.tsx` (aktuell `false`), CSS-Regel unveraendert lassen.**

Das ist hier keine Notloesung, sondern die einzige Option, die das Problem tatsaechlich loest: Es gibt auf Breiten bis 600 px keinen Platz fuer ein 260 x 232 px grosses Overlay. Die Frage ist nicht "wohin", sondern "ob". Die Regel `top: 340px !important` bleibt genau so stehen — sie ist fuer Tablet und Desktop nachweislich richtig und wird dort weiter gebraucht.

**Was das kostet:** Auf Handys erscheint das Siegel nicht mehr. Auf der Startseite ist das folgenlos — dort steht bereits `<ProvenExpertSiegel>` im Trust-Strip (`components/landing/sections/HomeTrustStripSection.tsx:48`), das Note und Anzahl serverseitig im Claimondo-Design rendert. Auf `/check` und den uebrigen Seiten faellt der Trust-Marker auf Mobile weg, weil das Overlay im Layout haengt (`app/[locale]/layout.tsx:253`) und das statische Siegel nur auf der Startseite steht. Falls Aaron das nicht will, ist die saubere Antwort, `<ProvenExpertSiegel>` auch dort in den Fluss zu setzen — die Komponente existiert, ist gebaut und braucht keinen Drittanbieter-Request.

**Nebeneffekt, eher willkommen:** Mobilnutzer kontaktieren `s.provenexpert.net` / `d.provenexpert.net` dann nicht mehr, ihre IP geht nicht mehr an die Expert Systems AG. Der Datenschutz-Abschnitt 9.6 bleibt inhaltlich korrekt — er beschreibt weiterhin zutreffend, was passiert. Kein Textaenderungsbedarf, aber der Kreis der Betroffenen wird kleiner.

### Verworfene Alternativen, mit Begruendung

- **Anderer `top`-Wert nur fuer Mobile** — geht nicht, siehe Luecken-Tabelle. Auf `/check` fehlen 126 px.
- **Siegel nach unten links** — loest nichts. Bei 67–69 % Breitenanteil bleibt kein nutzbarer Raum daneben; ausserdem waere es dann wieder bei der CTA-Leiste, was die Regel vom 13.08. gerade verhindern sollte.
- **Karte verkleinern** (`showReviews: false`, `googleStars: false` in der Konfiguration) — **ungeprueft**, weil ich dafuer die Konfiguration haette aendern muessen. Rechnerisch muesste die Karte unter 106 px schrumpfen, um auf `/check` zu passen; fuer ein Siegel mit Sternen, Note und Bewertungszahl halte ich das fuer unrealistisch, kann es aber nicht belegen. Selbst wenn es fuer die Startseite reichte (178 px), bliebe `/check` ungeloest.

## Offene Punkte

- **Nur Startseite und `/check` gemessen**, wie beauftragt. Die uebrigen sechs Seiten tragen dasselbe Overlay aus demselben Layout; im ersten Audit war die Ueberdeckung dort sichtbar, aber nicht vermessen.
- **Der 600-px-Breakpoint stammt aus dem ausgelieferten Script-Bundle**, nicht aus einer Herstellerdokumentation. Er ist im Code eindeutig (`matchMedia("(max-width: 600px)")` plus die zitierte CSS-Regel), koennte sich aber mit einer Widget-Version aendern. Nach einem Update von `proseal-v2.js` waere er nachzupruefen.
- **Verhalten bei Querformat** (z. B. 844x390) wurde nicht gemessen.
