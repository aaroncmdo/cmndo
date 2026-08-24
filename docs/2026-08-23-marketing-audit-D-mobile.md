# Marketing-Audit D — Mobiles Erlebnis

**Datum:** 2026-08-23
**Gegenstand:** `https://claimondo.de` (live, Produktion)
**Viewports:** 375 × 667 · 390 × 844 · 414 × 896, jeweils `isMobile`, `hasTouch`, iPhone-User-Agent, `de-DE`
**Seiten:** `/` · `/schaden-melden` · `/ersteinschaetzung` · `/gutachter-finden` · `/werkstatt-finden` · `/check`
**Werkzeug:** Playwright 1.59.1 (Chromium), eigene Messskripte — kein Code geändert

---

## Wie gemessen wurde

Damit die Befunde nachstellbar sind, hier die Verfahren:

| Frage | Verfahren |
|---|---|
| Horizontales Scrollen | `documentElement.scrollWidth` vs. `innerWidth`, plus **praktische Gegenprobe**: `window.scrollTo(200,0)` und `scrollX` zurücklesen. Für jedes zu breite Element wurde die Vorfahren-Kette geprüft (`overflow-x: auto/scroll` = scrollbar, `hidden/clip` = abgeschnitten). |
| Klickbarkeit | `getBoundingClientRect()` aller `a[href]`, `button`, `[role=button]`, `input`, `textarea`, `select`. `<label>`-Elemente und 1×1-Skip-Links wurden aus der Bilanz genommen — sie sind keine echten Tap-Ziele. Radios/Checkboxen in einem umschließenden `<label>` zählen mit der Label-Fläche. |
| Verdeckung | `document.elementFromPoint()` an **drei** Punkten je Element (15 %, 50 %, 85 % der Breite auf halber Höhe), an Scroll-Ständen alle 260 px über die ganze Seite. **Gegenprobe:** Overlay per `display:none` entfernt, dieselben Punkte erneut gemessen. |
| Verdeckung über iframe-Grenzen | `elementFromPoint` kann Frame-Grenzen nicht überschreiten. Für `/gutachter-finden` und `/werkstatt-finden` (Vollbild-iframes auf `app.claimondo.de`) wurde stattdessen die Frame-Position mit der Overlay-Box **rechnerisch** verschnitten und der Überdeckungsanteil in Prozent bestimmt. |
| Ladeverhalten | `PerformanceObserver` auf `layout-shift` (CLS) plus eigener Zeitmesser für das Erscheinen fixierter Elemente — **CLS erfasst `position: fixed` nicht.** |

**Was nicht gemessen werden konnte:** Das Verhalten der echten iOS-Bildschirmtastatur. Headless Chromium hat keine Softtastatur; das Verkleinern des Viewports löst das automatische Heranscrollen des fokussierten Feldes, das Safari selbst vornimmt, nicht aus. Die Ergebnisse dieser Simulation sind daher nicht verwertbar und stehen unten nicht als Befund. Was messbar war — Tastaturtyp und Schriftgröße — steht unter Befund 11.

---

# Befunde nach Wirkung

## 1 🔴 Das ProvenExpert-Siegel liegt fest über dem wichtigsten Bildschirmbereich — auf jeder Seite, nur mobil

**Viewport:** alle drei (375 × 667, 390 × 844, 414 × 896) · **Seiten:** alle sechs

Das Bewertungssiegel hängt in einem `position: fixed`-Container mit `top: 340px; right: 0; z-index: 39`. Es scrollt **nicht** mit: es steht bei jedem Scroll-Stand an derselben Bildschirmstelle.

| Viewport | Verdeckte Zone (Bildschirmkoordinaten) | Abstand vom rechten Rand |
|---|---|---|
| 375 × 667 | x 247–367, y 196–348 | 128 px |
| 390 × 844 | x 262–382, y 196–348 | 128 px |
| 414 × 896 | x 286–406, y 196–348 | 128 px |

Die Zone ist **absolut gleich groß** (120 × 152 px), egal wie breit der Bildschirm ist. Bei 375 px Breite belegt sie damit ein Drittel der Zeilenbreite; auf einem 1280-px-Desktop liegt dasselbe Element bei x = 1130, also außerhalb des Inhalts. **Deshalb fällt der Fehler auf großen Bildschirmen nicht auf.**

### Was konkret verdeckt wird

**Überschriften — der visuelle Beweis:**

| Seite | Was der Nutzer bei 375 × 667 ohne Scrollen liest |
|---|---|
| `/` | „Unverschuld… / Unfall? / Wir haben's im / Griff." — das Wort **Unverschuldet** ist abgeschnitten |
| `/check` | „Was steht / Ihnen na… / dem Unfall…" — die Frage ist unvollständig |
| `/ersteinschaetzung` | „Unverschulde… / Unfall? **0**… / Eigenkost… / für Sie." — das **„0 € Eigenkosten"** ist verdeckt |
| `/schaden-melden` | Der Fließtext „…dann kommt [ein] sicherer Link per WhatsApp oder E-Mail" ist zerschnitten |

**Bedienelemente**, die an mindestens einem der drei Testpunkte nicht antippbar sind (feinschrittiger Scan, 375 × 667):

| Seite | Scroll-Stände mit Blockade | Betroffene Bedienelemente | Nach Gegenprobe verbleibend |
|---|---|---|---|
| `/` | 106 von 196 | **85** | **0** |
| `/schaden-melden` | 6 von 14 | 10 | 0 |
| `/ersteinschaetzung` | 4 von 22 | 8 | 0 |
| `/check` | 4 von 11 | 9 | 0 |

Die Gegenprobe ist eindeutig: Wird das Widget per `display:none` entfernt und derselbe Punkt erneut gemessen, ist **keines** der Elemente mehr blockiert. Die Ursache steht damit fest.

**Die konversionsrelevanten Treffer:**

- `/schaden-melden` — die Felder **Unfalldatum**, **Unfallort**, **Nachname**, **Telefon** und **E-Mail** sind rechts überdeckt. Bei 279 px Feldbreite ab x = 96 liegen die rechten ~85 px unter dem Widget: Der Nutzer sieht nicht, was er tippt, sobald die Eingabe dort ankommt.
- `/` — das Lead-Formular: Feld **„Max Mustermann"** (Name), Feld **„z. B. Köln oder 50670"** und der Absende-Button **„Jetzt kostenlosen Rückruf erhalten →"**.
- `/check` — die Quiz-Antworten **„Noch unklar"** und **„Ich war (haupt)schuld"**. Diese Buttons sind 293 px breit ab x = 41, das Widget beginnt bei x = 247: **die rechten 87 px jeder Antwort (30 % der Fläche) lösen das Bewertungs-Widget aus statt der Antwort.**
- `/ersteinschaetzung` — **„Jetzt kostenlos einschätzen lassen"** und **„Ersteinschätzung starten"**.
- `/` — 63 weitere Inhaltskarten (Ratgeber-Links, BGH-Urteile, Ablaufschritte), jeweils rechts blockiert.

### Der Schließknopf hilft nicht

Der Minimier-Knopf misst **20 × 20 px** — weniger als die Hälfte des empfohlenen Minimums, und er sitzt selbst in der verdeckten Zone. Nach dem Antippen schrumpft das Siegel auf einen runden Knopf; die Überschriften sind dann vollständig lesbar (verifiziert per Aufnahme). Der Zustand überlebt einen Reload. Das nützt aber nur, wer den Knopf findet — der Erstbesucher, um den es hier geht, sieht das Widget aufgeklappt.

### Es klappt erst nach dem ersten Rendern auf

| Seite | First Contentful Paint | Widget sichtbar | Verzögerung |
|---|---|---|---|
| `/` | 1120 ms | 1376 ms | +256 ms |
| `/schaden-melden` | 584 ms | 943 ms | +359 ms |
| `/check` | 480 ms | 653 ms | +173 ms |

Der Nutzer liest also erst die vollständige Überschrift, dann legt sich das Widget darüber. Die gemessene CLS bleibt dabei bei ~0,0001 — **weil CLS `position: fixed` grundsätzlich nicht erfasst.** Wer nur auf die Core-Web-Vitals schaut, sieht diesen Sprung nie.

---

## 2 🔴 Der fixe CTA-Balken verdeckt die seiteneigene Handlung — und macht Footer-Elemente dauerhaft unerreichbar

**Viewport:** alle drei · **Seiten:** `/`, `/ersteinschaetzung`, `/check` (auf `/schaden-melden` gibt es ihn nicht)

Der Balken (`fixed bottom-4 … z-40`, drei Schaltflächen: „Gutachter finden" / „Sofort anrufen" / „Rückruf") ist bei 375 × 667 **106 px hoch** und belegt mit seinem Randabstand y 545–667 — die unteren **18 % des Bildschirms**.

**Zwei verschiedene Schweregrade, sauber getrennt:**

**(a) Wegscrollbar, aber störend.** An einem beliebigen Scroll-Stand liegt Inhalt unter dem Balken. Das ist bei jeder fixierten Fußleiste so und der Nutzer kann weiterscrollen. Es trifft aber ausgerechnet die Stellen, an denen er ohnehin stehen bleibt:

- `/check` bei scrollY = 0: Die erste Quiz-Frage **„Wer trägt die Schuld am Unfall?"** wird angeschnitten, und die Antwort **„Der Unfallgegner"** ist an allen drei Punkten blockiert. Die Seite hat genau ein Ziel — diese Frage zu beantworten.
- `/ersteinschaetzung` bei scrollY = 0: der seiteneigene Haupt-CTA **„Jetzt kostenlos einschätzen"** wird vom generischen Balken überlagert. Der Nutzer sieht zwei konkurrierende Handlungsaufforderungen übereinander.
- `/` bei scrollY = 780–1040: die Formularfelder **Name** und **Telefon** sowie der Absende-Button **„Jetzt kostenlosen Rückruf erhalten →"** — an allen drei Punkten.

Umfang: 74 Elemente auf `/` (72 davon komplett), 23 auf `/check` (21 komplett), 19 auf `/ersteinschaetzung` (18 komplett).

**(b) Dauerhaft unerreichbar.** Am **maximalen** Scroll-Stand kann nicht weiter gescrollt werden — was dort unter dem Balken liegt, ist mobil nie erreichbar:

| Seite | maxScrollY | Dauerhaft blockiert |
|---|---|---|
| `/` | 50 632 | `info@claimondo.de`, LinkedIn-Link |
| `/ersteinschaetzung` | 5 357 | `info@claimondo.de`, LinkedIn-Link, „Bewertungen" |
| `/check` | 2 503 | Telefonnummer `0151 5360 8515`, `info@claimondo.de`, LinkedIn-Link, „Bewertungen" |

Auf `/check` ist damit die **Telefonnummer im Footer** mobil nicht antippbar. Sie steht zwar auch im Balken darüber („Sofort anrufen") — der Footer-Eintrag ist trotzdem tot.

---

## 3 🟠 Die Eingabefelder auf `/schaden-melden` sind 32 px hoch

**Viewport:** alle drei · **Seite:** `/schaden-melden`

Alle sechs Felder des Kernformulars messen **279 × 32 px**: Unfalldatum, Unfallort, Vorname, Nachname, Telefon, E-Mail. Das sind 12 px unter dem üblichen 44-px-Minimum.

Zum Vergleich: Das Lead-Formular auf der Startseite nutzt **285 × 50 px** — dort ist es richtig gelöst. Die beiden Formulare tun dasselbe und sind unterschiedlich gebaut.

Erschwerend: Zwischen zwei Feldern liegt jeweils nur das 14 px hohe Label. Bei einem Nutzer mit nassen Fingern am Straßenrand ist das ein enges Raster.

---

## 4 🟠 `/gutachter-finden` beginnt mit dem optionalen Schritt

**Viewport:** alle drei · **Seite:** `/gutachter-finden`

Das Buchungspanel (iframe von `app.claimondo.de/embed/gutachter-finder`) öffnet mit:

> **Ihr Wunschtermin**
> *Optional — wählen Sie Ihren Wunschtag und die Uhrzeit.*

Der Pflichtschritt **„Wo steht das Fahrzeug?"** folgt erst 188 px darunter (y = 527 bei 375 × 667).

Die Schwesterseite `/werkstatt-finden` macht es umgekehrt und beginnt direkt mit **„Wo steht das Fahrzeug?"** (y = 382). Der Ablauf sollte auf beiden Seiten gleich sein — und für jemanden, der gerade einen Unfall hatte, ist die Terminwahl der falsche erste Schritt.

---

## 5 🟠 Die Kopfleiste unterschreitet auf jeder Seite das Tap-Minimum

**Viewport:** alle drei · **Seiten:** alle sechs

| Element | Größe |
|---|---|
| Logo / „Claimondo Startseite" | 36 × 36 |
| Menü-Knopf (Hamburger) | 36 × 36 |
| Sprache wählen („DE") | 64 × 38 |
| Login | 95 × 38 |

Alle vier liegen unter 44 px Höhe, und die Abstände zwischen ihnen betragen **5–6 px**. Der Menü-Knopf ist auf einer Seite mit 51 299 px Länge (Startseite bei 375 px Breite) das wichtigste Navigationsmittel überhaupt.

---

## 6 🟠 Bedienelemente in den Karten-Panels

**Viewport:** alle drei · **Seiten:** `/gutachter-finden`, `/werkstatt-finden`

Gemessen **innerhalb** des iframes:

| Element | Größe | Seite |
|---|---|---|
| Uhrzeit-Chips „08:00" … „18:00" (11 Stück) | 53–60 × **35** | `/gutachter-finden` |
| „Schließen" (Panel einklappen) | 373 × **38** | beide |
| „Adresse eingeben…" | 323 × **42** | beide |
| Mapbox-Attribution / „Toggle attribution" | 88 × 23 bzw. 24 × 24 | beide (fremd, nicht änderbar) |

Von 30 Bedienelementen auf `/gutachter-finden` liegen 15 unter 44 px. Die Uhrzeit-Chips stehen zudem in einer horizontal scrollbaren Reihe, in der bei 375 px nur fünf von elf sichtbar sind.

Zusätzlich überdeckt das ProvenExpert-Widget den **„Schließen"-Knopf zu 32 %** (375 × 667, beide Kartenseiten).

---

## 7 🟡 Die fixen Chips „Städte" / „Ratgeber" liegen auf dem Adressfeld

**Viewport:** alle drei · **Seite:** `/gutachter-finden`

Die beiden Chips (`fixed bottom-4 left-4 z-30`, 79 × 40 und 102 × 40) überlappen den unteren Rand des Adressfelds im Panel darunter — gemessen **14 % der Feldfläche** bei 375 × 667, 13 % bei 390 × 844, 12 % bei 414 × 896.

Praktisch: Wer unten links ins Adressfeld tippt, öffnet die Städte-Liste. Der Container trägt zwar `pointer-events-none`, die Chips selbst aber `pointer-events-auto` — sie fangen den Tap.

---

## 8 🟡 Die Städte-Links im Footer sind 20 px hoch bei 6 px Abstand

**Viewport:** alle drei · **Seiten:** alle sechs (geteilter Footer)

Die Liste „Kfz-Gutachter Köln · Düsseldorf · Dortmund · Essen · Hamburg · Berlin · München · Frankfurt · Stuttgart · Leipzig" besteht aus 20 px hohen Links mit 6 px Zwischenraum — nebeneinander und untereinander. Der Mittelpunktabstand liegt teils bei 0 px (direkt aneinandergrenzend).

Dieselbe Struktur gibt es auf der Startseite noch einmal als Chips (30 px hoch, 7 px Abstand) und als Decoder-Links mit **127 × 16 px**.

Bilanz der echten Tap-Ziele (ohne Labels und Skip-Links, ohne Widget-eigene Elemente):

| Seite | Block-Tap-Ziele | unter 44 px | unter 32 px |
|---|---|---|---|
| `/` | 343 | 230 (67 %) | 221 |
| `/schaden-melden` | 30 | 24 | 13 |
| `/ersteinschaetzung` | 29 | 18 | 13 |
| `/check` | 31 | 18 | 13 |

Der Großteil davon sind Footer- und Chip-Listen. Sie sind zweitrangig gegenüber den Befunden 1–3, aber die Zahl zeigt, dass 44 px im Projekt kein durchgehendes Maß ist.

---

## 9 🟡 Zwei Tabellen auf der Startseite sind nur seitlich scrollbar — ohne Hinweis

**Viewport:** 375 × 667 · **Seite:** `/`

| Tabelle | Breite | Überhang | Container |
|---|---|---|---|
| „Trigger / Aussage · Wer / Prüfdienst · Kürzungs-Mechanik · **Gegenargument**" | 760 px (`min-w-[760px]`) | +385 px | `overflow-x-auto` → **scrollbar** |
| „Fahrzeugalter · Wertminderung · Beispiel bei 6.000 €" | 480 px (`min-w-[480px]`) | +105 px | `overflow-x-auto` → **scrollbar** |

Technisch ist das korrekt gelöst: Der Inhalt geht nicht verloren, und die Seite selbst wird nicht breiter (siehe Befund 11).

Praktisch sieht der Mobilnutzer von der ersten Tabelle nur die Spalten 1 und 2. Die Spalte **„Gegenargument"** — das Argument gegen die Versicherung, also der eigentliche Wert des Abschnitts — steht ganz rechts und ist ohne Wischen unsichtbar. Es gibt keinen Hinweis, dass man wischen kann (kein Schatten am Rand, kein Symbol, kein Text).

**Kleiner Nebenbefund:** Im Footer ragt die Zeile „0151 5360 8515 · info@claimondo.de · Bewertungen" 4 px über den Viewport und wird vom `overflow-hidden` des Footers abgeschnitten. Betrifft alle Seiten, sichtbarer Verlust ist minimal.

---

## 10 🟡 Einhandbedienung: die Daumenzone ist besetzt

**Viewport:** alle drei · **Seiten:** alle sechs

Zwei Beobachtungen, beide aus den Positionsmessungen oben abgeleitet:

**Die rechte Bildschirmhälfte gehört dem Widget.** Bei Einhandbedienung mit der rechten Hand liegt die bequemste Daumenzone rechts unten bis rechts Mitte. Genau dort — x 247–367 bei 375 px Breite, also die rechten 34 % — sitzt das Bewertungssiegel. Der Nutzer greift mit dem Daumen zuerst in den einzigen Bereich, in dem er nichts auslösen kann außer ProvenExpert.

**Die Navigation liegt außerhalb der Reichweite.** Menü (36 × 36), Login und Sprachwahl stehen oben rechts. Bei 667 px Bildschirmhöhe ist die obere rechte Ecke einhändig nur durch Umgreifen erreichbar — bei 896 px gar nicht. Das ist bei den meisten Websites so und für sich kein Fehler; in Kombination mit der 36-px-Größe (Befund 5) wird daraus aber ein doppeltes Hindernis.

**Was gut liegt:** Der CTA-Balken sitzt unten mittig — die beste Stelle für den Daumen. Die drei Schaltflächen darin sind 48–50 px hoch und damit als einzige Handlungsziele der Seite ausreichend groß.

---

## 11 🟢 Was sauber ist

Diese Punkte wurden geprüft und sind in Ordnung — sie brauchen keine Arbeit:

**Kein horizontales Scrollen.** Auf allen sechs Seiten und in allen drei Viewports gilt `documentElement.scrollWidth == innerWidth`. Die praktische Gegenprobe (`scrollTo(200, 0)`) ergab auf jeder Seite **`scrollX = 0`** — die Seite lässt sich nicht wegschieben. Auch nicht durch `overflow-x: hidden` erkauft: `html` und `body` stehen beide auf `overflow-x: visible`.

**Kein Layout-Sprung.** CLS liegt auf allen 18 Kombinationen zwischen **0 und 0,0001**. Nachladende Bilder oder Schriften verschieben nichts unter dem Finger. (Einschränkung: Das gilt nicht für das fixierte Widget — siehe Befund 1.)

**Ladezeit.** First Contentful Paint zwischen 380 ms (`/check`) und 1900 ms (`/`, ungünstigster Lauf). Keine Konsolenfehler auf irgendeiner der sechs Seiten.

**Die richtige Tastatur öffnet sich.** Auf `/schaden-melden`: `type="tel"` für Telefon, `type="email"` für E-Mail, `type="date"` für das Unfalldatum, `autocomplete="given-name"` / `"family-name"` / `"tel"` / `"email"` durchgehend gesetzt. Auf `/`: `type="tel"` **plus** `inputmode="tel"`. Das Feld „Stadt / PLZ" bleibt bewusst auf Text — richtig, weil beides eingegeben werden darf.

**Keine ungewollte Vergrößerung beim Fokus.** Alle Eingabefelder haben `font-size: 16px`. iOS zoomt damit beim Antippen nicht hinein — ein häufiger Mobilfehler, der hier vermieden ist.

**Die Handlung ist sofort erreichbar.** Auf `/`, `/check` und `/ersteinschaetzung` steht der CTA-Balken ohne Scrollen im Bild. Dass er zu viel Platz nimmt und Inhalt verdeckt, ist Befund 2 — dass er da ist, ist richtig.

**Kein Cookie-Banner im Weg.** Die Zustimmung ist per Voreinstellung erteilt (Opt-out-Modell), es erscheint keine Einwilligungsschicht, die Bedienelemente verdecken würde.

---

# Die drei größten Hebel

**Erstens:** Das ProvenExpert-Siegel aus der Mitte des Bildschirms nehmen. Es steht bei jeder Bildschirmbreite exakt 128 px vom rechten Rand und 196 px von oben — auf einem 375-px-Gerät ist das mitten im Text, auf dem Desktop daneben. Es zerschneidet vier von sechs Überschriften, überdeckt fünf Felder des Meldeformulars und macht die rechten 30 % von zwei der drei Quiz-Antworten auf `/check` zu einer Falle: Wer dort tippt, landet bei ProvenExpert. Die Gegenprobe zeigt, dass **alle** 85 Blockaden auf der Startseite allein daran hängen — es ist ein einziges Element mit einem einzigen Fix.

**Zweitens:** Den fixen CTA-Balken kleiner machen oder beim Scrollen ausblenden. Er belegt 18 % des Bildschirms, verdeckt auf `/check` die erste Quiz-Frage und auf `/ersteinschaetzung` den seiteneigenen Haupt-CTA — und am Seitenende, wo nichts mehr wegscrollt, macht er `info@claimondo.de`, den LinkedIn-Link und auf `/check` die Footer-Telefonnummer dauerhaft untippbar.

**Drittens:** Die Eingabefelder auf `/schaden-melden` von 32 px auf 44 px bringen und die Kopfleiste (36 × 36) mitziehen. Das Startseiten-Formular macht es mit 50 px bereits richtig vor — es ist dieselbe Aufgabe, zweimal unterschiedlich gebaut, und die schlechtere Variante steht auf der Seite, die „Schaden melden" heißt.
