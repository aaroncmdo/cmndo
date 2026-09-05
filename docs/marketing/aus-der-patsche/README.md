# Aus der Patsche — Bildserie (8 Blätter)

Acht Situationen nach dem unverschuldeten Unfall, gezeichnet wie Messblätter: eine Beobachtung, ein Fund, ein Weg heraus. Design-Philosophie: `DESIGN-PHILOSOPHY.md` („Ruhige Evidenz"). Die Blätter liegen fertig unter `claimondo-marketing/public/illustrationen/aus-der-patsche/` (1080 × 1350, 4:5, PNG, 155–250 KB).

## Die Blätter

| Blatt | Datei | Beobachtung | Der Weg heraus |
|---|---|---|---|
| 01 Der Anruf | `patsche-01-der-anruf.png` | Die gegnerische Versicherung ruft an. Freundlich und schnell. Am Ende zahlt sie, was ihr eigener Gutachter festlegt. | Sie dürfen Ihren eigenen Gutachter wählen (§ 249 BGB). Termin meist in unter 48 Stunden, für Sie 0 €. |
| 02 Der Brief | `patsche-02-der-brief.png` | „Wir schicken Ihnen unseren Gutachter vorbei." Er arbeitet für die, die ihn schicken. Das steht nicht im Brief. | Sie wählen den Gutachter. Bei fremder Schuld zahlt ihn die gegnerische Versicherung trotzdem. |
| 03 Die Werkstatt regelt das | `patsche-03-die-werkstatt-regelt-das.png` | „Wir regeln das mit der Versicherung." Die Werkstatt regelt die Reparatur. Sechs weitere Positionen regelt niemand. | Ein Gutachten erfasst alle sieben Positionen. Unsere Partnerkanzlei macht sie geltend, für Sie 0 €. |
| 04 Der Kostenvoranschlag | `patsche-04-kostenvoranschlag.png` | Ein Kostenvoranschlag schätzt. Ein Gutachten beweist. Die Versicherung kennt den Unterschied ganz genau. | Bei fremder Schuld zahlt die gegnerische Versicherung Ihr Gutachten. Es dokumentiert jede Position. |
| 05 Der Mietwagen | `patsche-05-der-mietwagen.png` | „Ein Mietwagen ist nicht gedeckt." Jeder Tag ohne Auto ist trotzdem Geld wert. Das nennt sich Nutzungsausfall. | 23 bis 219 € pro Tag, je nach Fahrzeug. Das Gutachten legt die Klasse fest, die Gegenseite zahlt. |
| 06 Die Kürzung | `patsche-06-die-kuerzung.png` | Der Prüfdienst der Versicherung kürzt Ihr Gutachten. Im Schnitt um 30 bis 40 Prozent. Er nennt das Prüfung. | Unsere Partnerkanzlei holt gekürzte Beträge zurück. Für Sie 0 €, die Kosten trägt die Gegenseite. |
| 07 Das Restwert-Angebot | `patsche-07-das-restwert-angebot.png` | Plötzlich will jemand am anderen Ende des Landes Ihr Unfallauto kaufen. Die Versicherung hat ihn gefunden. Zufällig. | Ihr Gutachten ermittelt den Restwert regional. Diesen Wert dürfen Sie zugrunde legen. |
| 08 Der Kratzer | `patsche-08-nur-ein-kratzer.png` | „Ist doch nur ein Kratzer." Der Kratzer ist das Einzige, was man von außen sieht. Genau das ist sein Trick. | Der Gutachter sieht, was hinter dem Lack liegt. Bevor die Versicherung es kleinrechnet. |

## Alt-Texte (für `<Image alt>`)

* 01: Zeitachse 0 bis 48 h: Unfall bei Stunde 0, Anruf der gegnerischen Haftpflicht bei Stunde 2, eigener Gutachter bis Stunde 48.
* 02: Ein Brief der gegnerischen Versicherung, Textzeilen als Balken, Zeile 7 lesbar: „… schicken wir Ihnen unseren Gutachter vorbei." Stempel „Kostenlos für Sie".
* 03: Liste von sieben Schadenpositionen, nur „Reparatur" abgehakt; Wertminderung, Nutzungsausfall, Mietwagen, Gutachterkosten, Unkostenpauschale, Anwaltskosten offen.
* 04: Links eine einzelne Seite „Kostenvoranschlag", rechts ein Stapel von 16 Seiten „Gutachten" mit Fotos und Messwerten.
* 05: Kalender mit 14 Tagen, in jedem Feld ein kleines Auto; große Zahl 14, Formel „× 23 bis 219 € pro Tag = Nutzungsausfall".
* 06: Balken „Ihr Gutachten" zu 65 % gefüllt, die letzten 35 % rot schraffiert; darunter 100 Punkte, 35 davon als rote Ringe. Quelle: NDR, Verbraucherzentrale, BGH VI ZR 38/22.
* 07: Karte mit Entfernungsringen 50, 100, 200 km um „Ihr Standort", drei regionale Angebote; weit außerhalb ein rotes „Höchstgebot" aus der Restwertbörse der Versicherung.
* 08: Technische Seitenansicht eines Autos, am Heck ein 4 cm langer roter Kratzer; dahinter schraffiert fünf Bauteile: Stoßfängerträger, Parksensor, Halterung, Seitenwand, Lack.

## Regeln für Texte auf den Blättern

* **RDG:** verhandeln, durchsetzen, zurückholen, geltend machen nur mit „unsere Partnerkanzlei" als Subjekt. Claimondo koordiniert, kommuniziert, rechnet ab.
* **Zahlen:** nur aus dem Zahlen-Register (0 €, Termin < 48 h, Rückruf 15 Min, Nutzungsausfall 23–219 €/Tag, Prüfdienst-Kürzung 30–40 % mit Quelle NDR/Verbraucherzentrale/BGH VI ZR 38/22). Beispielwerte (Tag 1–14, 4 cm, Schaden-Nr.) sind erkennbar Illustration; keine Euro-Beträge erfinden.
* **Marke:** Navy `#0D1B3E`, Ondo `#4573A2`, Creme `#F5F1E8`, ein einziges Rot `#B23A2E` nur für den Verlust. Kein Verlauf, kein Schatten, kein Foto. Der Witz sitzt in der Beobachtung, nicht in einer Pointe.
* **Lesbarkeit mobil:** Beobachtung 44 px, Weg heraus 29 px im 1080-Bild (≈ 16 und 10,5 CSS-px bei 390 px Breite). Messmarken (13 px Mono) sind Textur.

## Neu erzeugen

```
python docs/marketing/aus-der-patsche/generator.py            # alle 8 Blätter nach public/illustrationen/aus-der-patsche/
python docs/marketing/aus-der-patsche/generator.py 3 6        # nur Blatt 03 und 06
python docs/marketing/aus-der-patsche/generator.py --pdf      # zusätzlich aus-der-patsche.pdf (hier im Ordner, nicht committen)
```

Voraussetzungen: Python 3 mit `Pillow` (≥ 10, variable Fonts) und `reportlab` (nur für `--pdf`). Die Schriften Montserrat und JetBrains Mono (beide SIL Open Font License) lädt der Generator beim ersten Lauf von Google Fonts nach `fonts/` (gitignored).

Ein neues Blatt ist eine Funktion `sheet_NN()`; Rahmen (Serienmarke, Messkante, Beobachtung, Weg heraus, Fuß) kommt aus `chrome()`. Der Umbruch ist ausgewogen (keine Witwe), die Beobachtung wird bei mehr als drei Zeilen automatisch kleiner, der Weg heraus bei mehr als zwei.

## Einbindung (offen, Task D8 im Plan `docs/superpowers/plans/2026-09-04-copy-audit-umsetzungsplan.md`)

Vorschlag: Startseite unter dem Hero (01 oder 06), Stadtseiten (02), `/check`-Ergebnis Gegner/Teilschuld (03), FAQ Mietwagen (05), Ratgeber Restwert (07), FAQ Bagatelle (08); Anzeigen: 06 als Bildanzeige. Die Einbindung ist ein nutzersichtbarer Pfad und bekommt nach Regel 4 einen Prod-Smoke (Playwright: `alt`, `innerText` daneben, LCP/CLS). Soll-Blatt: `memory/abnahmen/2026-09-05-aus-der-patsche-bildserie.md`.
