# Gesamtspezifikation · Sichtbarkeits-Check für Kfz-Sachverständige

**Fassung 2.0 · 12. August 2026** · ersetzt die Fassung vom Juli 2026
**Marke der Oberfläche:** SV-LevelUp · **Messmaschine:** Skill `gutachter-sichtbarkeits-check`

Was sich gegenüber Fassung 1 geändert hat, steht in Kapitel 14. Die wichtigsten drei Punkte vorweg:
**zwei Modi** statt eines Ablaufs, **dreizehn wählbare Module** statt eines festen Prüfumfangs,
und ein **eigenes Keyword-Kapitel**, das Google und Meta trennt und auf 20 km statt 50 km misst.

---

## Inhalt

1. [Was das System ist](#1-was-das-system-ist)
2. [Die zwei Modi](#2-die-zwei-modi)
3. [Toolstack](#3-toolstack)
4. [Datenquellen und Zugangsstatus](#4-datenquellen-und-zugangsstatus)
5. [Die dreizehn Module](#5-die-dreizehn-module)
6. [Das Scoring-Modell](#6-das-scoring-modell)
7. [Keyword-Recherche — Google, Meta, Longtail](#7-keyword-recherche)
8. [Marktbewertung im Vergleich](#8-marktbewertung-im-vergleich)
9. [Der Maßnahmenplan](#9-der-massnahmenplan)
10. [Die Erzeugnisse](#10-die-erzeugnisse)
11. [Die Oberflächen](#11-die-oberflaechen)
12. [Die eisernen Regeln](#12-die-eisernen-regeln)
13. [Erweiterungspunkte](#13-erweiterungspunkte)
14. [Was sich geändert hat · offene Punkte](#14-was-sich-geaendert-hat)

---

## 1. Was das System ist

Ein Sachverständiger kommt über eine Claimondo-Mail auf eine Seite, wählt seine Ausgangslage und
den Prüfumfang. Das System misst, was er ausgewählt hat, zeigt den Befund, hält die Lösungen hinter
einer Terminbuchung zurück und erzeugt daraus einen Maßnahmenplan, der im Verkaufsgespräch benutzt
wird.

```
┌────────────────────────────────────────────────────────────────┐
│ A · Skill "gutachter-sichtbarkeits-check"                      │
│     Die Messung. Python-Skripte + MCP-Abfragen + Browser.      │
│     Läuft in Claude/Cowork oder als Worker im Backend.         │
└───────────────────────────┬────────────────────────────────────┘
                            │ befunde.json
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌────────────────┐ ┌──────────────────┐ ┌────────────────────────┐
│ B · Dokumente  │ │ C · Landing-Page │ │ D · Innensicht         │
│   Befundbericht│ │  /check          │ │  Gesamtauswertung      │
│   Weckruf      │ │  7 Zustände      │ │  Maßnahmenplan         │
│   Maßnahmenplan│ │  Paywall = Termin│ │  Gesprächsleitfaden    │
└────────────────┘ └──────────────────┘ └────────────────────────┘
```

**A** ist die Substanz und funktioniert allein. **C** ist, was der Sachverständige sieht.
**D** ist neu in Fassung 2 und das, was der Vertrieb sieht — dieselben Daten, andere Ansicht.

**Was das System ausdrücklich nicht ist:** kein Ranking-Werkzeug, kein Angebotsgenerator, keine
Umsatzprognose. Es misst den öffentlich sichtbaren Zustand und leitet daraus Arbeit ab.

---

## 2. Die zwei Modi

Die erste Frage der Oberfläche entscheidet über alles Weitere.

| | **Weg A · Aufbau** | **Weg B · Bestand** |
|---|---|---|
| Wer | kein Google-Profil, Website im Bau oder gerade online | Profil und Website laufen seit mindestens einem Jahr |
| Leitfrage | Gegen wen trete ich an, was baue ich zuerst? | Wo stehe ich, was kostet mich am meisten? |
| Kopfzeile des Befunds | „Das Feld, in das Sie eintreten" | „Wo Sie im Feld stehen" |
| Kennzahl oben | Einstiegs-Index des Marktes | Gesamtscore über sieben Säulen |
| Position | „154. von 154 — noch kein Profil" | „38. von 154" |
| Voreingestellte Module | Wettbewerb, Verzeichnisse, Keywords, Anzeigen, Marktbewertung, Nischen, Volumen | zusätzlich Unternehmensprofil, Website, SEO, Nutzererlebnis |
| Gesperrt | Module zur eigenen Seite, solange keine URL vorliegt | keine |
| Maßnahmen-Reihenfolge | Profil → Bewertungen → Seite → Ortsseiten → Ads | Rechtslücken → Auszeichnung → Inhalte → Ads-Messung |

**Regel für die Sperrlogik.** Ein Modul ist gesperrt, wenn (a) es für den gewählten Modus nicht
vorgesehen ist, (b) es eine Website-Adresse braucht und keine vorliegt, oder (c) es ein
Unternehmensprofil voraussetzt und der Modus „Aufbau" ist. Gesperrte Module zeigen **den Grund im
Klartext**, nicht nur eine Ausgrauung.

**Der Wunsch des Nutzers wird getrennt vom Messbaren gespeichert.** Wer ein Modul auswählt und
später eine URL nachträgt, bekommt das Modul zurück — es wird nicht dauerhaft entfernt. (Das war in
der ersten Implementierung ein Fehler.)

---

## 3. Toolstack

### Der Skill (A)

| Baustein | Technik | Zweck | Stand |
|---|---|---|---|
| `collect.py` | Python 3.11, `requests` | Website-Crawl über Sitemap, PageSpeed, SSL Labs, SEO-Prüfung | ✅ |
| `seiten_check.py` | Python, `urllib`, Threads | Breitenschnitt über bis zu 50 Wettbewerber-Domains | ✅ neu |
| `verzeichnisse.py` | Python, `requests` | 15 Branchenverzeichnisse, robots.txt-konform, NAP-Abgleich | ✅ neu |
| `wettbewerb.py` | Python, Places API | 50-km-Umkreissuche, Rangliste | 📄 braucht Key |
| `maps_ernte.js` | Browser-JS über Chrome-Bridge | Kartenausschnitte, Bewertungen, Koordinaten | ⚠️ siehe R-F |
| `keyword_planer.py` | Python, Google Ads API | Suchvolumen, CPC, Wettbewerb · Radius 20 km | 📄 braucht Konto |
| `meta_reichweite.py` | Python, Meta Marketing API | Reichweitenschätzung, Interessen · Radius 20 km | 📄 braucht Konto |
| `suggest_ernte.py` | Python, Autocomplete-Schnittstelle | Longtail und Formulierungen | ✅ neu |
| `ads_transparenz.js` | Browser-JS | Anzeigenzahl je Domain im Transparenzcenter | ✅ neu |
| `markt_vergleich.js` | Browser-JS | Vergleichsmärkte, gleiche Methode, gleicher Tag | ✅ neu |
| `google_ads.py` | Python, REST | eigene Kampagnen, Impression Share | 📄 braucht Konto |
| `ux_check.py` | Python, Playwright | Bildschirmfotos Handy/Rechner | ⚠️ braucht Netzzugang im Browser |
| `build_pdf.py` | Chromium headless | HTML → PDF | ✅ |
| Ahrefs | MCP | Domain Rating, SERP, Keywords | ❌ `Insufficient plan` |

### Die Oberflächen (C und D)

| Baustein | Technik |
|---|---|
| Frontend | Vanilla JS, alles inline in einer HTML-Datei, kein Framework, kein Build |
| Backend | Express.js, öffentliche Endpoints ohne JWT |
| Datenbank | PostgreSQL (Prod) / SQLite (Dev) über `db.js` |
| Worker | Node, ruft die Skill-Pipeline, Warteschlange über Statusspalte |
| Terminbuchung | eigener Slot-Picker im Claimondo-Backend, keine Fremdanbieter |
| Mail | bestehender Versand des Projekts, `.ics`-Anhang |

---

## 4. Datenquellen und Zugangsstatus

Stand 12. August 2026. Jede Zeile ist in dieser Sitzung geprüft worden.

| Quelle | Liefert | Zugang | Ersatz, wenn nicht verfügbar |
|---|---|---|---|
| Google Places API (New) | Büros im Radius, Bewertungen, Koordinaten | ❌ kein Key | Kartenausschnitte über Chrome-Bridge |
| Google Maps (Browser) | dasselbe, manuell ausgelöst | ✅ | — |
| Google Ads Keyword-Planer | **Suchvolumen, CPC, Wettbewerb · 20 km** | ❌ kein Konto | **kein Ersatz** — Volumen bleibt „nicht erhoben" |
| Meta Marketing API | **Reichweite, Interessen · 20 km** | ❌ kein Konto | **kein Ersatz** |
| Google Autocomplete | Formulierungen, Longtail, Ortsnachfrage ja/nein | ✅ frei | — |
| Google Trends | Saisonkurve, relative Regionalnachfrage | ✅ Browser | — |
| Google Ads Transparency Center | Anzeigenzahl je Domain | ✅ Browser | — |
| PageSpeed Insights v5 | Core Web Vitals | ⚠️ ohne Key `429` | eigene Serverabrufe, als solche gekennzeichnet |
| SSL Labs | Zertifikatsgüte | ✅ frei | — |
| Branchenverzeichnisse | Einträge, NAP-Konsistenz | ✅ 9 von 15 abfragbar | gesperrte = „nicht geprüft" |
| Ahrefs MCP | DR, SERP, Keyword-Volumen | ❌ `Insufficient plan` | Keyword-Planer, sonst „nicht erhoben" |
| Claimondo-MCP | Partner-SVs im Radius | ✅ | — |

**Die drei Zugänge, die das System freischalten:** Places-Key, Google-Ads-Konto, Meta-Business-Konto.
Ohne sie fehlen genau drei Dinge: absolute Suchvolumina, Reichweitenschätzungen und die
automatisierte Umkreissuche. Alles andere ist heute messbar.

---

## 5. Die dreizehn Module

Jedes Modul ist einzeln an- und abschaltbar und trägt: Punktzahl, Dauer, Befunde, abgeleitete
Maßnahmen und einen Gesprächsbaustein. **Was nicht gemessen wird, erzeugt keine Maßnahme und
erscheint in keinem Dokument.**

| # | Modul | Punkte | Dauer | Modus | Braucht | Neu in 2.0 |
|---|---|---|---|---|---|---|
| 1 | Google-Unternehmensprofil | 20 | 1 min | B | Profil | |
| 2 | Website — Technik & Recht | 12 | 2 min | A·B | URL | |
| 3 | SEO & Inhalte | 12 | 2 min | A·B | URL | |
| 4 | Nutzererlebnis | 12 | 2 min | B | URL | |
| 5 | Wettbewerber im 50-km-Umkreis | 16 | 3 min | A·B | — | |
| 6 | Branchenverzeichnisse & NAP | 12 | 2 min | A·B | — | ✦ |
| 7 | **Google-Keyword-Planer · 20 km** | 14 | 3 min | A·B | Ads-Konto | ✦ |
| 8 | **Meta-Reichweite · 20 km** | 8 | 2 min | A·B | Meta-Konto | ✦ |
| 9 | Longtail-Recherche (Autocomplete) | 8 | 3 min | A·B | — | ✦ |
| 10 | Anzeigen im Transparenzcenter | 10 | 2 min | A·B | — | ✦ |
| 11 | Marktbewertung im Vergleich | — | 3 min | A·B | — | ✦ |
| 12 | Nischen & Positionierung | — | 2 min | A·B | — | ✦ |
| 13 | Marktvolumen-Rechnung | — | 1 min | A·B | — | ✦ |

Module 11 bis 13 tragen **keine Punkte**. Sie bewerten nicht den Sachverständigen, sondern den
Markt — und in einen persönlichen Score gehört nichts, was er nicht beeinflussen kann.

### Was jedes Modul liefern muss

Ein Modul ist erst fertig, wenn es diese fünf Dinge erzeugt:

1. **Befunde** — je Befund: Wert, Beschriftung, Ampel, ein Satz Einordnung mit Feldvergleich
2. **Punktwert** — erreicht von möglich, oder ausdrücklich „ohne Punktwertung"
3. **Maßnahmen** — je Maßnahme: Titel, Begründung, Aufwand, Wirkung, Punktgewinn, **Herkunft**, Phase
4. **Gesprächsbaustein** — Zahl, Wortlaut zum Vorlesen, Rückfrage, wahrscheinlicher Einwand mit Antwort
5. **Fehlstellenliste** — was in diesem Modul heute nicht erhebbar ist und warum

---

## 6. Das Scoring-Modell

Sieben Säulen, 100 Punkte. Unverändert gegenüber Fassung 1, aber die Module speisen jetzt
mehrere Säulen gleichzeitig.

| Säule | Punkte | Gespeist aus Modul |
|---|---|---|
| 1 · Google-Unternehmensprofil | 20 | 1 |
| 2 · Branchenverzeichnisse & NAP | 12 | 6 |
| 3 · Auffindbarkeit & Wettbewerbsposition | 16 | 5, 8, 10 |
| 4 · SEO — On-Page & Keywords | 20 | 3, 7, 9 |
| 5 · Nutzererlebnis | 12 | 4 |
| 6 · Technik & Ladezeit | 12 | 2 |
| 7 · Vertrauen & Rechtssicherheit | 8 | 2 |

**Teilbefund-Regel.** Sind weniger als **60 der 100 Punkte** erhebbar — weil Module abgeschaltet
oder Zugänge gesperrt sind —, wird **kein normierter Score ausgegeben**. Stattdessen steht
„Teilbefund" mit einem Sternchen und der Zahl der erhobenen Punkte. Ein auf ein Drittel der
Kriterien normierter Wert sieht aus wie eine Messung und ist keine.

**Ampelschwellen je Säule:** unter 40 % rot, 40–70 % gelb, über 70 % grün. Der Zielwert im
Säulendiagramm liegt bei **85 %** — nicht bei 100, weil die letzten Punkte in jeder Säule
unverhältnismäßig teuer sind.

---

## 7. Keyword-Recherche

**Das wichtigste Kapitel der Fassung 2.** In Fassung 1 war Keyword-Arbeit ein Nebensatz in Säule 4.
Sie ist jetzt in drei Module getrennt, weil drei verschiedene Fragen dahinterstehen.

### 7.1 Der Radius: Standort + 20 km

Alle Keyword-Messungen laufen auf **dem Standort des Sachverständigen plus 20 Kilometer** — nicht
auf den 50 km des Wettbewerbsradius.

**Begründung:** Wer nach einem Unfall einen Gutachter sucht, sucht in der Nähe. Der 50-km-Radius
beantwortet die Frage „gegen wen trete ich an"; der 20-km-Radius beantwortet „wonach suchen meine
Kunden". Das sind zwei verschiedene Gebiete, und sie in einem Wert zu vermischen erzeugt
Volumenzahlen, die niemandem gehören.

Die Ortsliste für den 20-km-Radius wird aus den Koordinaten des Büros berechnet und enthält alle
Gemeinden mit mindestens 5.000 Einwohnern. Für Münster sind das zwölf Orte.

### 7.2 Modul 7 · Google-Keyword-Planer

**Frage:** Wonach wird aktiv gesucht, wie oft, und was kostet ein Klick?

**Standard-Keywords je Ort im 20-km-Radius** — vier Muster, für jeden Ort einzeln abgefragt:

```
kfz gutachter <Ort>
kfz sachverständiger <Ort>
unfallgutachten <Ort>
kfz gutachten <Ort>
```

Dazu die ortsunabhängigen Kernbegriffe: `kfz gutachter`, `unfallgutachten`, `schadensgutachten`,
`wertgutachten auto`.

**Je Begriff erhoben:** durchschnittliches monatliches Suchvolumen (12 Monate), Spannweite,
Wettbewerbsdruck (niedrig/mittel/hoch), Klickpreis-Spanne oben im Gebot.

**Ohne Konto:** Es gibt keinen Ersatz. Der Planer liefert ohne aktives Google-Ads-Konto keine
absoluten Werte. In diesem Fall steht im Bericht die Begriffsliste **ohne Zahlen** und der Satz
„absolutes Suchvolumen nicht erhoben — Google-Ads-Konto erforderlich". Nicht geschätzt, nicht
aus Fremdquellen hochgerechnet.

**Erste Maßnahme dieses Moduls ist deshalb immer:** Ads-Konto anlegen. Kostet nichts, solange keine
Kampagne läuft, und schaltet die einzige belastbare Volumenquelle frei.

### 7.3 Modul 8 · Meta-Reichweite

**Frage:** Wie viele Menschen im Gebiet lassen sich überhaupt ansprechen, und worüber?

Meta wird **getrennt** gerechnet und getrennt ausgewiesen. Die Logik ist eine andere: Bei Google
sucht jemand aktiv nach einem Gutachter, bei Meta wird er unterbrochen. Das sind verschiedene
Absichten, verschiedene Kosten und verschiedene Kennzahlen.

**Erhoben:** geschätzte Reichweite im 20-km-Radius, Zielgruppengröße nach Interessen (Fahrzeughalter,
Pendler, Kfz-Versicherung, Autohäuser), Kosten je tausend Einblendungen als Spanne.

**Getrennte Kennzahlenreihen — verbindlich:**

| | Google | Meta |
|---|---|---|
| Absicht | aktive Suche | Unterbrechung |
| Leitkennzahl | Kosten je Anfrage | Kosten je erreichter Person im Gebiet |
| Zweck | akute Anfrage abgreifen | Bekanntheit im Gebiet aufbauen |
| Erfolg messbar nach | Tagen | Monaten |

**Regel:** Die beiden Kennzahlenreihen werden nie zu einer zusammengerechnet. Wer das tut, steuert
falsch — ein günstiger Tausenderkontaktpreis rechnet einen teuren Klickpreis schön.

### 7.4 Modul 9 · Longtail-Recherche

**Frage:** Welche Formulierungen benutzen Menschen tatsächlich?

Google-Autocomplete, systematisch abgefragt: Ortsvarianten für alle Orte im Radius und
alphabetische Auffächerung für acht Themenstämme (`kfz gutachter`, `unfallgutachten`,
`kfz gutachten`, `wertminderung`, `nutzungsausfall`, `gutachter unfall`, `kfz sachverständiger`,
`schadensgutachten`).

**Was diese Methode kann:** Sie zeigt, welche Begriffe existieren und welche Orte überhaupt
nachgefragt werden. Google schlägt nur vor, was oft genug gesucht wird — ein fehlender Vorschlag ist
eine belastbare **Untergrenze**.

**Was sie nicht kann:** absolute Zahlen. Deshalb ist sie ausdrücklich die **Ergänzung** zum
Keyword-Planer, nicht sein Ersatz.

**Der wertvollste Einzelbefund dieser Methode:** die Ortsliste teilt sich in Orte mit und ohne
messbare Nachfrage. Im Münsterland waren das zwölf mit und sechs ohne — und die sechs ohne standen
vorher auf der Ortsseiten-Liste. Ohne diese Messung wären sechs Seiten für nicht vorhandene Nachfrage
geschrieben worden.
---

## 8. Marktbewertung im Vergleich

Ein Markt ist nicht gut oder schlecht, sondern leichter oder schwerer als ein anderer. Modul 11
misst deshalb **sechs Vergleichsmärkte mit identischer Methode**: ein Kartenausschnitt, gleiche
Zoomstufe, gleicher Suchbegriff, gleicher Tag.

### 8.1 Der Einstiegs-Index

Sechs Faktoren, über alle Märkte normiert, gewichtet:

| Faktor | Gewicht | Gemessen als | Richtung |
|---|---|---|---|
| Sättigung der Mitte | 25 % | Median der Bewertungen im Spitzenfeld | niedriger = besser |
| Höhe der Spitze | 18 % | Bewertungszahl des Marktführers | niedriger = besser |
| Dichte des oberen Zehntels | 17 % | 90.-Perzentil | niedriger = besser |
| Nachfragebreite | 20 % | eindeutige Autocomplete-Vorschläge mit Stadtnamen | höher = besser |
| Anzeigendruck | 10 % | gesponserte Einträge je Feldgröße | niedriger = besser |
| Lücken im Feld | 10 % | Anteil ohne Website oder ohne Bewertung | höher = besser |

Ergebnis: ein Wert von 0 bis 100. **Höher heißt leichter hineinzukommen.**

### 8.2 Die Marktmatrix

Streudiagramm, vier Quadranten:

- **waagerecht:** Nachfragebreite
- **senkrecht:** Einstiegshürde (Median), **oben = leichter**
- **Kreisfläche:** Bewertungszahl des Marktführers

Der Quadrant „viel Nachfrage · niedrige Hürde" ist in aller Regel leer. Das gehört so gesagt: Märkte,
die groß und leicht zugleich sind, gibt es praktisch nicht. Die Wahl ist immer ein Tausch.

### 8.3 Auswahl der Vergleichsmärkte

Vier bis sechs Städte, vergleichbar in Struktur und Entfernung, davon mindestens eine deutlich
größere und eine deutlich kleinere. Für Münster: Paderborn, Osnabrück, Essen, Dortmund, Bielefeld,
Oldenburg.

**Grenze, die genannt werden muss:** Gemessen wird je Markt **ein Kartenausschnitt** mit 9 bis 21
ausgespielten Büros — nicht der ganze Markt. Der Index vergleicht **Spitzenfelder**, keine
Marktgrößen. Einwohnerzahlen und Fahrzeugbestände sind nicht eingerechnet.

---

## 9. Der Maßnahmenplan

Der Plan wird **erzeugt, nicht ausgewählt**. Jede Maßnahme hängt an einem Befund; wird das Modul
abgeschaltet, verschwindet die Maßnahme.

### 9.1 Aufbau einer Maßnahme

| Feld | Inhalt | Pflicht |
|---|---|---|
| Titel | ein Satz im Imperativ | ✓ |
| Begründung | warum, mit dem gemessenen Feldvergleich | ✓ |
| Aufwand | in Stunden oder Tagen, nicht in Geld | ✓ |
| Wirkung | hoch / mittel / niedrig | ✓ |
| Punktgewinn | wie viele Score-Punkte, oder 0 bei Grundlagenarbeit | ✓ |
| **Herkunft** | welches Modul, welche Messung | ✓ |
| Phase | 1, 2 oder 3 | ✓ |

Die **Herkunft** ist das Feld, das den Unterschied macht. „Sieben fehlende Einträge anlegen ·
*Modul Verzeichnisse · Abgleich 15 Verzeichnisse*" ist überprüfbar. Ohne Herkunft ist es eine
Empfehlung wie jede andere.

### 9.2 Die drei Phasen

| Phase | Zeitraum | Prinzip |
|---|---|---|
| 1 · Fundament | Woche 1 – 4 | Ohne diese Schritte wirkt nichts, was danach kommt |
| 2 · Sichtbarkeit | Woche 4 – 12 | Hier entsteht der Vorsprung, den im Feld kaum jemand verteidigt |
| 3 · Nachfrage kaufen | ab Woche 8 | Erst wenn gemessen wird, lohnt sich bezahlte Reichweite |

Innerhalb einer Phase wird nach **Wirkung, dann Punktgewinn** sortiert. Nicht nach Aufwand — die
billigste Maßnahme ist selten die wichtigste.

### 9.3 Die Kopfzeile des Plans

Vier Zahlen, live aus den gewählten Modulen: **Maßnahmen · erreichbare Punkte · Aufwand gesamt ·
Zeitraum**. Kein Preis. Keine Umsatzprognose. Der Aufwand steht in Stunden, damit der
Sachverständige selbst rechnen kann, was ihn seine Zeit wert ist.

---

## 10. Die Erzeugnisse

### 10.1 Drei Dokumente für den Sachverständigen

| # | Dokument | Zweck | Enthält Lösungen |
|---|---|---|---|
| 1 | **Befundbericht** | die Messung, vollständig, mit Quellen und Daten | nein |
| 2 | **Top-Gutachter 2026** | ein Diagramm, ein Vergleich, die Konsequenz — ein Mehrwertpunkt, ein Teaser | nein |
| 3 | **Maßnahmenplan** | konkrete Anweisungen, Reihenfolge, Aufwand | ja, vollständig |

Dokument 3 wird **erst nach der Terminbuchung** erzeugt und versendet — auch dann, wenn der
Sachverständige im Gespräch absagt.

### 10.2 Drei Ansichten für den Vertrieb

| Ansicht | Zweck |
|---|---|
| **Gesamtauswertung** | alle Befunde je Modul, Säulendiagramm, Fehlstellenliste |
| **Maßnahmenplan** | derselbe Plan wie Dokument 3, aber filterbar nach Modulen |
| **Gesprächsleitfaden** | Minutenplan, Gesprächsbausteine, Einwandbehandlung, Nachfassplan |

Alle drei greifen auf **dieselbe Modulauswahl** zu. Wird ein Modul abgeschaltet, verschwindet es
überall — es gibt keine Ansicht, die mehr zeigt als gemessen wurde.

### 10.3 Der Gesprächsleitfaden

**Minutenplan für 30 Minuten:**

| Zeit | Abschnitt | Regel |
|---|---|---|
| 0 – 3 | Rahmen setzen | sagen, was passiert und dass nichts gekauft werden muss |
| 3 – 8 | Die Lage | **erst das Feld, dann seine Position** — nie umgekehrt |
| 8 – 18 | Die drei Zahlen | nach jeder Zahl eine Frage stellen und die Antwort abwarten |
| 18 – 25 | Der Plan | **nur Phase 1** zeigen, der Rest kommt im PDF |
| 25 – 30 | Die Entscheidung | eine Frage, kein Angebotspaket |

**Die drei Gesprächsbausteine** werden automatisch gewählt: die drei Module mit dem schlechtesten
Verhältnis von erreichten zu möglichen Punkten. Je Baustein: die Zahl, der Wortlaut zum Vorlesen,
die Rückfrage, der wahrscheinliche Einwand mit Antwort.

**Was im Gespräch nicht gesagt wird — verbindlich:**

| Nicht sagen | Warum |
|---|---|
| „Das bringt Ihnen X Aufträge im Monat." | Nicht messbar. Bei Anfragen aufhören (R-D). |
| „Ihre Konkurrenz macht das alles schon." | Stimmt nachweislich nicht — die Wahrheit ist das bessere Argument. |
| „Wir garantieren Platz 1 bei Google." | Niemand kann das. Gemessene Schwellen wirken stärker. |

**Nachfassen — dieselbe Stunde:** Plan als PDF senden · die Zahl aufgreifen, bei der er am längsten
geschwiegen hat · Messtermin in 30 Tagen setzen · bei Nein Wiedervorlage in 90 Tagen.

> Der stärkste Nachfassgrund überhaupt ist die **Wiederholmessung**. Wer nichts getan hat, sieht das
> schwarz auf weiß — das überzeugt mehr als jedes Argument im Erstgespräch.

---

## 11. Die Oberflächen

| Datei | Rolle | Zielgruppe |
|---|---|---|
| `mockup-levelup-v2.html` | **Hauptfassung** · sieben Schritte, zwei Modi, wählbarer Prüfumfang | Sachverständiger |
| `mockup-levelup-auswertung.html` | Innensicht · Auswertung, Plan, Gesprächsleitfaden | Vertrieb |
| `mockup-levelup.html` | erste Fassung, sechs Zustände | Referenz |
| `mockup-nextlevel.html` | Variante für erfahrene Büros · Serifen, Petrol, ruhig | Sachverständiger |
| `mockup.html` | neutrale Rückfallebene | Referenz |

### 11.1 Die sieben Zustände der Hauptfassung

| # | Zustand | Inhalt |
|---|---|---|
| 1 | Ausgangslage | zwei Moduskarten, URL-Feld erscheint erst nach der Wahl |
| 2 | **Prüfumfang** | elf Modulkacheln mit Kippschalter, Bilanzleiste, Sperrgründe im Klartext |
| 3 | Messung | Prüfliste der gewählten Module, wartet → läuft → fertig |
| 4 | Befund | modusabhängig, nur die gemessenen Blöcke, darunter der Tresor |
| 5 | Freischalten | Terminwahl, sechs Slots, Rückrufnummer |
| 6 | Funnel | drei Fragen: Jahre, KI-Nutzung, Marketingpartner |
| 7 | Frei | Maßnahmen, modusabhängig |

Zustand 2 ist neu in Fassung 2. Die Fortschrittsleiste unter dem Kopf zeigt durchgehend die
Position; erledigte Schritte grün, aktueller in Signalfarbe.

### 11.2 Gestaltungsregeln

**SV-LevelUp:** Werkstatt bei Nacht (`#0a121c`), Signalorange (`#ff4d1c`), kursive Archivo in
Versalien, Rennstreifen als Abschnittstrenner, schräge Plakette im Logo, Tacho mit fünf Stufen.

**Die Tacho-Stufen sind keine erfundene Skala.** Sie sind die gemessenen Schwellen des Gebiets —
für Münster 5 · 12 · 43 · 117 Bewertungen, also unteres Fünftel, Median, oberes Viertel, oberste
zehn Prozent. Der Zeiger sagt nicht „Level 3 von 5", sondern „Sie liegen vor 62 von 154 Büros".

**Diagrammfarben sind nicht die Markenfarbe.** Für Datenreihen gilt die geprüfte Palette
(Blau `#2a78d6`, Orange `#eb6834`, Aqua `#1baf7a`) plus die Statusfarben (gut `#0ca30c`, Warnung
`#fab219`, ernst `#ec835a`, kritisch `#d03b3b`). Signalorange trägt die Marke, nie eine Datenaussage.

**Textfarbe auf dunklen Flächen ausdrücklich setzen.** Die globale Regel `b { color: var(--ink) }`
macht Zahlen auf schwarzen Balken unsichtbar — das ist zweimal passiert.

---

## 12. Die eisernen Regeln

**R-A · Jede Zahl trägt Quelle und Erhebungsdatum.** Ohne Ausnahme.

**R-B · Fehlende Messung ist nicht null.** „Nicht erhoben" mit Grund, niemals ein Nullwert, der wie
ein Messergebnis aussieht. Ein Balken auf 0 heißt „gemessen und schlecht".

**R-C · Geschätztes wird als geschätzt gekennzeichnet**, samt Rechenweg. Klickraten sind
Branchendurchschnitte, keine Messung der Domain.

**R-D · Keine Euro-Hochrechnungen.** Bei Anfragen aufhören. Der Auftragswert ist unbekannt, die
Annahmekette zu lang.

**R-E · Lösungen gehen im Zustand `ready` gar nicht über die Leitung.** Nicht leer, nicht null,
nicht unscharf — das Feld wird nicht erzeugt. Auch keine Maßnahmen-Überschriften. Sichtbar sind nur
Anzahl und Aufwandsangaben.

**R-F · Abruf von Google-Suchseiten und Google Maps — neu gefasst.**

> Fassung 1 verbot den Abruf kategorisch. Das ist in der Praxis nicht haltbar: Ohne Places-Key und
> ohne Ahrefs-Plan gibt es keinen anderen Weg zu Bewertungszahlen im Umkreis. Die Regel wird deshalb
> **geteilt**, nicht aufgeweicht:
>
> **R-F1 · Automatisierter, serverseitiger Abruf bleibt untersagt.** Kein Skript, kein Worker, kein
> Headless-Browser ruft Google-Suchseiten oder Maps ab. Für Rankings gibt es Ahrefs, für Umkreisdaten
> die Places API, für Karten die Static Maps API.
>
> **R-F2 · Eine vom Menschen ausgelöste Browsersitzung ist zulässig**, wenn alle vier Bedingungen
> erfüllt sind: (a) ein Mensch startet die Sitzung in seinem eigenen, angemeldeten Browser;
> (b) es werden nur öffentlich sichtbare Ergebnisseiten gelesen, nichts geschrieben, keine Sperre
> umgangen, kein Captcha gelöst; (c) die Abfragezahl bleibt in der Größenordnung dessen, was ein
> Mensch von Hand tun würde — Richtwert: höchstens zwanzig Kartenausschnitte je Befund;
> (d) im Bericht steht die Herkunft ausdrücklich als „Google Maps, manuell ausgelöst, <Datum>".
>
> **R-F3 · Bildschirmfotos von Google-Ergebnisseiten bleiben untersagt.** Belegbilder kommen aus der
> Static Maps API oder aus PageSpeed. Gelesene Werte dürfen als eigene Darstellung wiedergegeben
> werden, das Original nicht.
>
> **Sobald ein Places-Key vorliegt, gilt R-F1 wieder uneingeschränkt** und die Umkreisdaten werden
> über die API neu erhoben.

**R-G · `robots.txt` vor jeder Verzeichnisabfrage lesen und befolgen.** Gesperrt heißt „nicht
geprüft", nicht „nicht vorhanden". Keine Captcha-Umgehung, keine Proxy-Netze zum Umgehen von Sperren.
Eine Abfrage je Verzeichnis und Check, 24 Stunden Zwischenspeicher.

**R-H · Der Check liest, er schreibt nicht.** Keine Einträge anlegen, ändern oder beanspruchen.

**R-I · Fällt eine Belegquelle aus, fehlt der Beleg.** Kein nachgezeichnetes Ersatzbild.

**R-J · Rechtliche Hinweise sind Hinweise, keine Rechtsberatung.** Immer mit diesem Zusatz.

**R-K · Bewertungen werden aufgebaut, nicht gekauft.** (neu) Gekaufte Bewertungen sind
wettbewerbswidrig, werden von Google entfernt und kosten im Zweifel das ganze Profil. Der
Maßnahmenplan schlägt ausschließlich Abfrageprozesse vor.

**R-L · Google und Meta werden nie zu einer Kennzahl verrechnet.** (neu) Zwei Absichten, zwei
Kostenlogiken, zwei Zeithorizonte. Ein günstiger Tausenderkontaktpreis rechnet einen teuren
Klickpreis schön — das ist der häufigste Steuerungsfehler in diesem Kanalpaar.

---

## 13. Erweiterungspunkte

**13.1 Neue Datenquelle.** Eintrag in Kapitel 4 mit Zugangsstatus und Ersatzregel, dann ein Modul in
Kapitel 5. Ohne Ersatzregel wird die Quelle nicht aufgenommen.

**13.2 Neues Modul.** Punktzahl, Dauer, Modus, Abhängigkeit festlegen; die fünf Pflichtausgaben aus
Kapitel 5 erzeugen; Zuordnung zu einer Säule oder ausdrücklich „ohne Punktwertung".

**13.3 Weiteres Verzeichnis.** In die Liste der 15 aufnehmen, robots.txt-Status prüfen, Gewicht
festlegen. Gesperrte Verzeichnisse bleiben in der Liste — als „nicht geprüft".

**13.4 Andere Fachrichtung** (Bau, Immobilien, Medizin). Säulen bleiben, Suchbegriffsmuster und
Verzeichnisliste werden ersetzt, Nischenliste neu erhoben.

**13.5 Weiterer Vergleichsmarkt.** Koordinaten und Zoomstufe eintragen, mit identischer Methode am
selben Tag messen. Märkte aus verschiedenen Tagen werden nicht in einen Index gerechnet.

**13.6 Vierte Ansicht.** Beispiele: Zuweiser-Karte (Werkstätten und Verkehrsrechtskanzleien im
Nahbereich), Bewertungs-Aktualität, Wiederholmessung mit Verlauf.

**13.7 Weitere Funnel-Frage.** Höchstens vier insgesamt. Jede zusätzliche Frage kostet Abschlüsse.

**13.8 Search Console.** Sobald der Sachverständige Zugriff gibt: echte Klicks und Positionen statt
abgeleiteter Werte. Ersetzt Teile von Modul 3 und 9.

---

## 14. Was sich geändert hat

### Gegenüber Fassung 1 (Juli 2026)

| Neu | Kapitel |
|---|---|
| Zwei Modi mit unterschiedlichen Vorwahlen und Befundansichten | 2 |
| Dreizehn einzeln wählbare Module statt festem Prüfumfang | 5 |
| Keyword-Recherche in drei Module getrennt, Radius 20 km | 7 |
| Google und Meta getrennt gerechnet | 7.3, R-L |
| Marktbewertung gegen Vergleichsmärkte, Einstiegs-Index | 8 |
| Maßnahmenplan wird aus Befunden erzeugt, mit Herkunftsangabe | 9 |
| Drei Vertriebsansichten, gesteuert über dieselbe Modulauswahl | 10.2 |
| Gesprächsleitfaden mit Minutenplan und Einwandbehandlung | 10.3 |
| Zustand 2 „Prüfumfang" in der Oberfläche | 11.1 |
| R-F geteilt in F1/F2/F3 · R-K und R-L neu | 12 |

### Offene Punkte

1. **Places-Key** — schaltet R-F1 wieder scharf und ersetzt die Browser-Ernte.
2. **Google-Ads-Konto** — einzige Quelle für absolute Suchvolumina. Ohne es bleibt Modul 7 ohne Zahlen.
3. **Meta-Business-Konto** — dasselbe für Modul 8.
4. **`ux_check.py`** — braucht eine Umgebung, in der der Browser Netzzugang hat.
5. **Zuweiser-Modul** — Werkstätten und Verkehrsrechtskanzleien im Nahbereich, noch nicht gebaut.
6. **Bewertungs-Aktualität** — 191 Bewertungen aus fünf Jahren sind etwas anderes als 50 aus diesem.
7. **Wiederholmessung** — der stärkste Nachfassgrund, technisch noch nicht angelegt.
8. **`messwert.ts` als Union** — die Typgarantie deckt heute nur die halbe Regel R-B ab.
9. **Row Level Security** auf `levelup.messpunkte` — vor jedem Livegang zu schließen.

---

*Fassung 2.0 · 12. August 2026. Alle Beispielzahlen stammen aus der Münsterland-Erhebung desselben
Tages und sind im Report „Wettbewerbsanalyse Münsterland 50 km" mit Quelle belegt. Rechtliche
Angaben sind Hinweise, keine Rechtsberatung.*
