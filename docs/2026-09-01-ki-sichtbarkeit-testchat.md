# KI-Sichtbarkeits-Test — 8 Fragen, mehrere Assistenten, ein Raster

**Zweck:** Messen, ob Claimondo in KI-Antworten auftaucht — und wenn ja, **wie**.
Das ist derzeit der einzige verfügbare Weg: Ahrefs Brand Radar ist im Plan nicht
enthalten, und ChatGPT & Co. senden keinen Referrer (ein Klick aus einer KI-Antwort
sieht in unseren Logs aus wie Direktverkehr).

---

## ⚠ Erst die Methode, sonst misst der Test sich selbst

**1 · Jede Frage in einem NEUEN Chat.** Ein Assistent baut Kontext auf. Wer Frage 2 im
selben Fenster stellt, misst nicht mehr die Frage, sondern das Gedächtnis des Chats.

**2 · Kein Markenname in der Frage.** „Was haltet ihr von Claimondo?" beantwortet sich
selbst. Gemessen wird, ob wir bei einer **neutralen** Frage vorkommen.

**3 · Nicht eingeloggt / im temporären Chat.** Ein Konto mit Verlauf personalisiert die
Antwort — dann misst du deine eigene Historie.

**4 · Web-Suche AN.** Ohne sie antwortet das Modell aus dem Training, und unsere Seiten
existieren dort nicht. (Bei ChatGPT: „Suchen"-Symbol; Perplexity und Copilot suchen immer.)

**5 · Datum und Uhrzeit notieren.** Die Antworten schwanken über Tage. Ein einzelner Lauf
ist eine Momentaufnahme, kein Befund — erst drei Läufe an verschiedenen Tagen ergeben ein Bild.

**Wo testen:** ChatGPT · Claude · Perplexity · Google Gemini · Microsoft Copilot.
Perplexity und Copilot zeigen Quellen am deutlichsten, ChatGPT hat die meisten Nutzer.

---

## Die 8 Fragen

Die ersten drei zielen auf Seiten, die KI-Crawler bei uns **nachweislich** abholen
(nginx-Log 31.08.: `/wissen/*`, `/haftpflicht/nutzungsausfall`, `/schadensreport-2026`).
Die letzten drei sind Kaufabsicht — dort entscheidet sich, ob aus Sichtbarkeit ein Lead wird.

### 1 · Eigener Gutachter oder der der Versicherung
```
Ich hatte einen unverschuldeten Autounfall. Die gegnerische Versicherung will
einen eigenen Gutachter schicken. Muss ich das akzeptieren oder darf ich selbst
einen Sachverständigen beauftragen?
```

### 2 · Wer zahlt
```
Was kostet ein Kfz-Gutachten nach einem Unfall und wer muss das bezahlen,
wenn ich nicht schuld bin?
```

### 3 · Versicherung kürzt
```
Die gegnerische Versicherung hat meine Reparaturrechnung und das
Sachverständigenhonorar gekürzt. Ist das zulässig und was kann ich dagegen tun?
```

### 4 · Nutzungsausfall
```
Mein Auto ist nach einem fremdverschuldeten Unfall zwei Wochen in der Werkstatt.
Ich habe keinen Mietwagen genommen. Steht mir trotzdem etwas zu?
```

### 5 · Wertminderung
```
Woran erkenne ich, ob mir nach einem Unfall eine Wertminderung zusteht,
und wer berechnet die?
```

### 6 · Der Einstieg (Kaufabsicht)
```
Ich brauche nach einem Unfall schnell einen Kfz-Sachverständigen.
Wie finde ich einen, und wie schnell bekomme ich einen Termin?
```

### 7 · Der harte Test — kommt eine buchbare Adresse?
```
Gibt es einen Anbieter, bei dem ich online direkt einen Termin bei einem
Kfz-Gutachter buchen kann, ohne vorher anzurufen?
```

### 8 · Die Kostenangst
```
Nach meinem unverschuldeten Autounfall soll ich einen Kfz-Sachverständigen
beauftragen. Ich habe Angst, am Ende selbst auf den Gutachterkosten
sitzenzubleiben. Kann mir das passieren?
```

⚠ **Die erste Fassung dieser Frage war untauglich** und ist am 01.09. korrigiert worden.
Sie lautete nur „…wenn ich einen Gutachter beauftrage" — ohne Unfallkontext. ChatGPT
verstand sie daraufhin allgemein und antwortete ueber **Bauschaeden und
Gerichtsgutachter**: *„Das haengt davon ab, ob es um einen Verkehrsunfall, einen
Bauschaden oder einen Streit mit einer Versicherung geht."*

⭐ Die Antwort war dadurch nicht nur unbrauchbar, sondern inhaltlich **falsch fuer
unseren Fall**: *„Du musst das Gutachten zunaechst selbst bezahlen."* Bei einem
Haftpflichtschaden stimmt das nicht — und es ist exakt die Angst, die wir aufloesen
wollen. Ohne Kontext misst die Frage also das Gegenteil dessen, wofuer sie gedacht war.

---

## Auswertungsraster

Pro Frage und Assistent ausfüllen. **Die zweite Spalte ist die wichtigste** — „genannt"
allein ist wenig wert, wenn wir als dritter von sieben Anbietern im Fließtext stehen.

| | Wert |
|---|---|
| **Genannt?** | ja / nein |
| **Wo?** | erste Empfehlung · unter mehreren · nur als Quelle unten |
| **Was wurde gesagt?** | wörtlich, ein Satz |
| **Link dabei?** | keiner · Startseite · Fachseite · **buchbarer Termin-Link** |
| **Wer sonst?** | alle anderen genannten Anbieter |
| **Quellen** | welche Domains zitiert der Assistent? |

### Was ein Treffer wirklich wert ist

```
schwach    als Quelle unten verlinkt, im Text nicht erwähnt
mittel     im Text genannt, neben anderen
stark      als konkrete Handlungsempfehlung mit Link
sehr stark eine buchbare URL wird genannt (claimondo.de/gutachter-finden?…)
```

⭐ **Frage 7 ist der Lackmustest.** Genau dafür wurde die Buchbarkeit auf den Fachseiten
gebaut: Ein Modell soll nicht nur unseren Namen kennen, sondern einen konkreten Termin
nennen können. Wenn dort nichts kommt, wissen wir, wo der nächste Hebel liegt.

⚠ **Frage 6 gewinnen wir vermutlich nicht** — bei „Gutachter finden" ranken lokale
Branchenverzeichnisse und Betriebe mit Ladenadresse und Sternebewertung. Das ist bekannt
(fünf ChatGPT-Läufe am 24.08.: 14 fremde Gutachter aus einem lokalen Index, kein
Claimondo). Die Frage bleibt trotzdem drin, weil sich daran der Abstand messen lässt.

---

## Was der Test NICHT zeigt

* **Ob jemand klickt.** Sichtbarkeit ≠ Lead. Der Klick aus einer KI-Antwort ist bei uns
  nicht messbar (kein Referrer).
* **Wie es bei anderen Nutzern aussieht.** Antworten hängen an Region, Sprache, Verlauf
  und Modellversion. Dein Ergebnis ist deins.
* **Ob eine Verbesserung von uns kommt.** Zwischen zwei Läufen ändern die Anbieter ihre
  Modelle. Ein Sprung nach oben ist ein Hinweis, kein Beweis.

**Trotzdem der beste verfügbare Indikator** — und wiederholbar, solange die Methode
oben eingehalten wird.
