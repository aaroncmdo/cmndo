# Operatives Soll — der komplette Fluss bis zum Abschluss

> **Auftrag Aaron 31.08.2026:** „überleg dir, was operativ laufen sollte, damit der Kunde in
> einem kompletten Fluss durchkommt bis Abschluss. Geh das per Playwright durch und notier
> alles, was falsch ist, wo Eingaben fehlen, wo Informationen fehlen, Informationen zu viel."
>
> **Regel 4 Schritt 1:** Dieses Soll ist **aus der Fachlogik hergeleitet, nicht aus dem Code
> gelesen**. Der Code ist der Prüfling, nicht der Maßstab. Geschrieben **vor** dem ersten Klick.

## Wer da ist und was er will

Ein Unfallgeschädigter, wenige Stunden bis Tage nach dem Schaden. Unfreiwillig hier. Er kennt
weder „Wertminderung" noch „Nutzungsausfall" noch „fiktive Abrechnung". Die gegnerische
Versicherung hat ihn womöglich schon angerufen und einen eigenen Gutachter angeboten.

**Sein Job:** herausfinden, was ihm zusteht, und jemanden finden, der es durchsetzt.
**Nicht:** eine Plattform verstehen.

Daraus folgt der Maßstab für jeden Schritt: *Weiß er nach diesem Bildschirm, wo er steht, was
gerade passiert ist und was als Nächstes von ihm erwartet wird?*

## Der Fluss in acht Stationen

### S1 · Meldung — er gibt so wenig wie möglich

Er tippt Name, Telefon, Ort. Mehr darf an dieser Stelle nicht verlangt werden: Jedes zusätzliche
Pflichtfeld ist ein Abbruchgrund, bevor überhaupt ein Kontakt besteht.

**Soll:** Absenden funktioniert mit genau diesen drei Angaben. Danach steht auf dem Bildschirm,
*was jetzt passiert* — nicht nur „Danke".

### S2 · Der Kanal zurück — sofort, ohne Warten

**Soll:** Binnen Sekunden eine WhatsApp mit einem Link, der ihn zurück in **seinen** Vorgang
bringt. Er soll nie in der Lage sein, auf einen Rückruf warten zu *müssen*. Der Link trägt
seinen Namen und ist ohne Passwort nutzbar.

### S3 · Führung — eine Frage pro Bildschirm, jede erklärt sich selbst

**Soll:** Der Flow fragt nur, was für die Regulierung nötig ist, und begründet jede Frage in
einem Halbsatz. Jede Auswahl ist ohne Vorwissen entscheidbar; Fachbegriffe werden dort erklärt,
wo sie zuerst auftauchen. Der Fortschritt ist sichtbar („Schritt 4 von 9"), und die angezeigte
Zahl stimmt mit der tatsächlichen Länge überein.

**Explizit ein Befund, wenn:** ein Feld Pflicht ist, ohne es zu kennzeichnen · eine Frage
Fachwissen voraussetzt · der Fortschritt etwas anderes verspricht als er hält · dieselbe Angabe
zweimal abgefragt wird.

### S4 · Termin — der Kunde wählt, das System hält

**Soll:** Er sieht echte, buchbare Termine mit Ort und Name des Gutachters. Nach der Buchung
bekommt er eine Bestätigung, in der Datum, Uhrzeit, Ort und Ansprechpartner stehen. Scheitert
die Buchung, sagt der Bildschirm das **und** bietet einen Weg (anderer Termin / Rückruf) —
niemals eine Zusage ohne Termin.

### S5 · Auftrag — er unterschreibt, und weiß wofür

**Soll:** Vor der Unterschrift steht in einem Satz, was er beauftragt und was es ihn kostet
(0 €, die gegnerische Versicherung zahlt). Nach der Unterschrift bekommt er einen **Beleg** —
eine Kopie oder Bestätigung dessen, was er gerade unterschrieben hat. Ein Auftrag ohne
Beleg ist nicht abgeschlossen, er ist nur weg.

### S6 · Wartezeit — er wird nicht allein gelassen

**Soll:** Zwischen Beauftragung und Gutachten weiß er jederzeit, in welchem Schritt sein Fall
steht — in Klartext, nicht als Status-Slug. Passiert etwas (SV zugewiesen, Termin bestätigt,
Gutachten fertig), erfährt er es aktiv, ohne nachsehen zu müssen.

### S7 · Gutachten — ⚠ braucht eine zweite Instanz

Der Sachverständige erstellt das Gutachten. **Das ist per Playwright nicht allein fahrbar** —
es braucht die SV-Rolle und einen realen Arbeitsschritt. Dieser Teil wird als **verdrahtet, nicht
gelaufen** ausgewiesen, wenn er nicht vollständig fahrbar ist (Aaron hat das ausdrücklich
anerkannt).

### S8 · Abschluss — er weiß, dass es vorbei ist, und was er hat

**Soll:** Am Ende sagt ihm die Oberfläche, dass der Vorgang abgeschlossen ist, was er bekommen
hat (Gutachten, Summe) und was — falls überhaupt — noch von ihm zu tun ist. Ein Fall, der still
in einen Endzustand rutscht, ohne dass der Kunde es erfährt, ist **nicht** abgeschlossen.

## Was in jedem Schritt ein Befund ist

| Kategorie | Beispiel |
|---|---|
| **Eingabe fehlt** | ein Feld, das die Fachlogik braucht, wird nie erhoben |
| **Eingabe zu viel** | Pflichtfeld, das für diesen Weg irrelevant ist |
| **Information fehlt** | der Kunde erfährt nicht, was passiert ist oder als Nächstes kommt |
| **Information zu viel** | mehrere konkurrierende Angebote/Texte auf einem Bildschirm |
| **Falsche Information** | Anzeige widerspricht dem, was in der DB steht |
| **Sackgasse** | ein Zustand ohne Weg vorwärts, ohne dass das gesagt wird |
| **Stiller Fehlschlag** | Klick ohne Wirkung, ohne Fehlermeldung |

## Szenarien

| # | Weg | Warum |
|---|---|---|
| **A** | Haftpflicht · unverschuldet · nur Gutachten | der Hauptweg, den Aaron durchgängig sehen will |
| **B** | Haftpflicht · **Abrechnungsfrage übersprungen** | prüft den frisch gefixten Werkstatt-Step im echten Fluss |
| **C** | Kasko / Selbstzahler | anderer Szenario-Zweig, andere Step-Sequenz |

Gefahren wird **per UI, mit echter Eingabe**, gegen prod. Jeder Zustandsübergang ist ein echter
Klick; geseedet wird höchstens der Ausgangszustand.

## Nachweisform

Pro Schritt festgehalten: Überschrift · sichtbarer Text · vorhandene Felder (Pflicht?) ·
angebotene Aktionen · Screenshot. Danach die DB-Gegenprobe: Ist angekommen, was angezeigt wurde?
