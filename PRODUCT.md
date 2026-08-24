# Product

## Register

brand

> Default gilt für die Marketing-Flächen (claimondo.de, autounfall.io, Cluster-LPs):
> dort IST das Design das Produkt. Die Portale unter `src/app/**`
> (Kunde, SV, Werkstatt, Kanzlei, Dispatch, Admin) sind **product** und werden
> pro Aufgabe auf dieses Register umgestellt.

## Users

**Primär: der Unfallgeschädigte, kurz nach dem Schaden.** Er ist unfreiwillig hier.
Meist wenige Stunden bis Tage nach einem Unfall, oft noch aufgewühlt, mit einem
beschädigten Auto und einer Gegenseite, deren Versicherung ihn anruft, bevor er
selbst weiß, was ihm zusteht. Er kennt die Begriffe nicht (Wertminderung,
Nutzungsausfall, Restwert, fiktive Abrechnung) und muss trotzdem in wenigen Tagen
Entscheidungen treffen, die vierstellige Beträge kosten können. Häufig mobil,
häufig zwischen Terminen, selten mit Ruhe zum Lesen.

Sein Job: **herausfinden, was ihm zusteht, und die richtige Person finden, die es
für ihn durchsetzt.** Nicht: eine Plattform verstehen.

**Sekundär:** Sachverständige, Werkstätten, Kanzleien und Flottenverantwortliche,
die als Partner in die Plattform kommen. Andere Verfassung: nüchtern, geschäftlich,
im Arbeitskontext. Ihre Flächen (Partner-Seiten, Portale) dürfen anders klingen als
die Geschädigten-Strecke, aber nicht aus einer anderen Welt stammen.

## Product Purpose

Claimondo bringt Unfallgeschädigte mit unabhängigen Kfz-Sachverständigen zusammen
und begleitet den Schaden bis zur Regulierung. Der Gegenspieler ist der
Prüfdienstleister der gegnerischen Versicherung, dessen Interesse dem des
Geschädigten entgegensteht.

Erfolg heißt: Jemand, der vorher nicht wusste, dass ihm ein eigener Gutachter
zusteht, hat nach wenigen Minuten einen Termin und das Gefühl, nichts falsch
gemacht zu haben.

## Brand Personality

**Ruhig. Sicher. Auf der richtigen Seite.**

Die Seite senkt den Puls, statt ihn zu erhöhen. Sie erklärt, bevor sie fordert.
Sie sagt klar, was zu tun ist, ohne zu drängen, und sie behauptet nichts, was sie
nicht belegen kann. Der Ton ist der eines erfahrenen Menschen, der schon hundert
solcher Fälle begleitet hat: knapp, freundlich, ohne Alarm.

Wichtig: Ruhe ist nicht Blässe. Die Seite darf Haltung zeigen, gerade wo es um die
Interessen der Gegenseite geht. Aber sie erzeugt keinen Druck, den der Nutzer
ohnehin schon hat.

## Anti-references

Alle vier ausdrücklich ausgeschlossen (Aaron, 24.08.2026). Das schließt jede
naheliegende Kategorie-Antwort aus; es muss etwas Eigenes werden.

- **Versicherungs-Konzern.** Kühl, bürokratisch, austauschbar. Navy plus Stockfotos
  lächelnder Berater, Formularsprache, Absenderlogik statt Empfängerlogik.
- **Vergleichsportal.** Check24-Ästhetik: laute Badges, Sternchen-Preise,
  Dringlichkeitsbanner, Vergleichstabellen als Selbstzweck.
- **Generisches SaaS.** Gradient-Hero, drei gleiche Feature-Karten mit Icons,
  Logo-Leiste, „Jetzt kostenlos starten". Austauschbar mit jedem Startup.
- **Anwalts-Website alter Schule.** Serifen, Marmor, Paragraphenzeichen,
  Aktenordner-Bildsprache. Seriös, aber verstaubt und distanziert.

## Design Principles

1. **Erst ordnen, dann fordern.** Wer im Stress ankommt, braucht Orientierung vor
   dem Call-to-Action. Auf jeder Fläche steht zuerst, wo der Nutzer ist und was
   gilt, und erst danach, was er tun kann.

2. **Eine Entscheidung pro Bildschirm.** Der Nutzer trifft ohnehin zu viele
   Entscheidungen gleichzeitig. Konkurrierende Angebote nebeneinander sind
   Belastung, keine Auswahl.

3. **Belegen statt behaupten.** Jede Zahl, jede Frist, jeder Anspruch trägt seine
   Quelle (Aktenzeichen, Paragraph, Datum). Das ist zugleich das Trust-Signal,
   das die vier Anti-Referenzen nicht haben.

4. **Die Sprache des Geschädigten, nicht die der Branche.** Fachbegriffe werden
   erklärt, wo sie zuerst auftauchen, oder vermieden. Niemand sucht nach
   „fiktiver Abrechnung", er will wissen, ob er das Geld auch ohne Reparatur bekommt.

5. **Ruhe ist eine Layout-Entscheidung.** Sie entsteht aus Rhythmus, Weißraum und
   wenigen gleichzeitigen Reizen, nicht aus blassen Farben. Eine ruhige Seite darf
   kräftig sein, aber nicht laut an mehreren Stellen zugleich.

## Accessibility & Inclusion

- Zielniveau **WCAG 2.2 AA**. Kontraste werden maschinell geprüft
  (`npm run check:contrast` im Marketing-Build).
- Die Kernzielgruppe ist altersmäßig breit (jeder mit Auto), Lesebrille und
  kleines Display sind Normalfall, nicht Randfall: Fließtext nicht unter 16px,
  Touch-Ziele mindestens 44x44.
- Häufig mobil unter Stress bedient, teils einhändig, teils unterwegs bei
  schlechter Verbindung. Bedienelemente gehören in Daumenreichweite.
- Mehrsprachig ausgelegt (de, en, pl, tr, ru, ar). Arabisch bedeutet RTL:
  Layouts dürfen keine Leserichtung voraussetzen.
- `prefers-reduced-motion` wird respektiert; keine Bewegung, die Aufmerksamkeit
  erzwingt.
