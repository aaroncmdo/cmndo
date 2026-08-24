# Marketing-Audit E — Texte und Vertrauen

**Datum:** 23.08.2026
**Prüfgegenstand:** `claimondo-marketing/` (Worktree `hyperlokal-p3-a1-nachbarstaedte`)
**Leserperspektive:** Unfallgeschädigter ohne Fachkenntnis, unverschuldet, mit Angst vor Kosten
**Methode:** Volltext-Analyse `i18n/messages/de.json` (316 KB, 50 Namespaces) + 94 deutsche
Content-Artikel + Consumer-Prüfung jedes Befunds im TSX + Gegenmessung der Zahlenbehauptungen
gegen die Prod-DB (`paizkjajbuxxksdoycev`, nur Lesezugriff).

**Wichtige Methodenregel, die hier zweimal gegriffen hat:** Ein Text in `de.json` ist noch kein
Befund. Zu jedem Fund wurde der Consumer gesucht. Zwei kritisch klingende Strings sind
**nicht live** und stehen deshalb unten unter „Latent", nicht oben.

---

## Kurzfassung

Die inhaltliche Substanz ist überdurchschnittlich. Die Ratgeberseiten beantworten die Frage des
Lesers meist im ersten Satz, die Kostenaussage „0 €" steht früh und fett, Passivsprache ist fast
nicht vorhanden (16 Fundstellen im gesamten Textkorpus), Umlaute sind durchgehend korrekt.

Die Probleme liegen nicht in der Sprache, sondern in der **Verlässlichkeit der Zahlen**. Dieselbe
Frage bekommt je nach Seite eine andere Antwort — beim Rückruf (5 vs. 15 Minuten), bei der
Auszahlungsdauer (32 Tage vs. 6–8 Wochen), beim Gutachterhonorar (drei Spannen), beim
Nutzungsausfall (drei Spannen). Und die vier größten Zahlen der Startseite sind aus dem System
nicht belegbar.

---

# Tier 1 — Vertrauensbrecher

## 1. Das Rückruf-Versprechen bricht im Moment des Absendens

**Fundstelle:** `i18n/messages/de.json` → `home.hero.cta_call`, `home.lead_form.rueckruf_badge`,
`home.lead_form.success_body`
**Gerendert:** `components/landing/sections/HeroSection.tsx:159`,
`components/landing/HomeLeadFormClient.tsx`

Der Nutzer liest über dem Formular:

> **Rückruf in 5 Minuten** (`lead_form.rueckruf_badge`)

und im Button daneben:

> **Jetzt anrufen — Rückruf in 5 Min** (`hero.cta_call`)

Er füllt aus, klickt ab — und die Bestätigung sagt:

> „Ein Berater ruft Sie in **unter 15 Minuten** zurück." (`lead_form.success_body`)

Der Widerspruch trifft ihn in genau der Sekunde, in der er gerade Vertrauen investiert hat. Das
ist die teuerste Stelle der ganzen Seite für einen Bruch.

**15 Minuten ist überall sonst die Zahl** — KPI-Band (`< 15 Min`), Sticky-Call-Modal, alle
`page_meta`-Beschreibungen, `content.anchor.callback_15min`. Die 5 Minuten sind der Ausreißer, und
sie stehen auf den zwei sichtbarsten Elementen der Startseite.

Zweiter Punkt: Die 5-Minuten-Zusage nennt keine Geschäftszeiten. Das Sticky-Call-Modal tut es
(„meistens in unter 15 Minuten **während der Geschäftszeiten**"). Wer nachts um 23 Uhr nach
einem Unfall das Formular ausfüllt, hat eine unbedingte Zusage gelesen.

**Vorschlag** — eine Zahl, überall, mit Bedingung:

| Key | Ist | Soll |
|---|---|---|
| `home.hero.cta_call` | `Jetzt anrufen — Rückruf in 5 Min` | `Jetzt anrufen — oder Rückruf in 15 Minuten` |
| `home.lead_form.rueckruf_badge` | `Rückruf in 5 Minuten` | `Rückruf in 15 Minuten` |
| `home.lead_form.success_body` | `… in <strong>unter 15 Minuten</strong> zurück. Bitte halten Sie das Telefon bereit …` | unverändert lassen — das ist die ehrliche Formulierung |

Wenn 5 Minuten der reale Wert ist, dann muss die Bestätigung angehoben werden, nicht der Badge
gesenkt. Aber es darf nur **eine** Zahl geben.

---

## 2. Die vier größten Zahlen der Startseite sind aus dem System nicht belegbar

**Fundstelle:** `i18n/messages/de.json` → `home.kpis`, `home.kpi_methodik`
**Gerendert:** `components/landing/sections/HomeTrustStripSection.tsx:26-41` — direkt unter dem
Hero, in `text-4xl`/`sm:text-5xl font-extrabold`. Das sind die **größten Zahlen der Seite**.

| Behauptung | Stand Prod-DB (23.08.2026) |
|---|---|
| **2.000+** vermittelte Schadensfälle | 75 Zeilen in `claims`, davon 45 aktiv · 79 `leads` |
| **8 Mio. €+** Schadensersatz durchgesetzt | 0 Zeilen in `abrechnungen`, 0 in `zahlungseingaenge`, 0 in `gutachter_monatsabrechnungen`, 0 in `schadenspositionen` |
| **32 Tage** Ø bis zur Auszahlung | 0 Fälle mit `schlussabrechnung_am`; 3 Fälle mit `abgeschlossen_am` (Ø 3,6 Tage) |
| **< 15 Min** bis zum ersten Rückruf | nicht aus der DB messbar — plausibel, aber unbelegt |

Erschwerend kommt die Methodik-Fußnote selbst hinzu:

> „Aggregierte Auswertung aller über das Claimondo-Partner-Netzwerk vermittelten Fälle seit
> Gründung. **Stand 14.05.2026.** Detaillierte Methodik auf Anfrage einsehbar."
> (`home.kpi_methodik`)

Der **erste Datensatz in `claims` stammt vom 15.07.2026** — zwei Monate *nach* dem angegebenen
Stichtag. Die Zahlen können also nicht aus diesem System stammen. Das ist für sich noch kein
Vorwurf: Fälle können vor der Plattform über die Partner-SVs gelaufen sein. Aber dann sagt die
Fußnote das Falsche, und der Satz „Detaillierte Methodik auf Anfrage einsehbar" ist eine Zusage,
die jemand einlösen kann — ein Wettbewerber, ein Journalist, ein Anwalt der Gegenseite.

Der Code-Kommentar an der Stelle behauptet ausdrücklich, die Zahlen seien geprüft:

```
// KPIs + Methodik 1:1 aus home.kpis / home.kpi_methodik (real + UWG-konform mit
// Quellen-Fussnote, §9).
```
`components/landing/sections/HomeTrustStripSection.tsx:12-13`

Diese Zusicherung deckt die Zahlen nicht. Im selben File ist die Google-Reviews-Komponente
korrekt abgesichert („nie erfundene Bewertungen, UWG §5", rendert nichts ohne echte Daten) — der
Maßstab ist im Haus vorhanden, er wurde auf die KPIs nur nicht angewandt.

**Vorschlag.** Entweder die Zahlen aus einer belegbaren Quelle herleiten und die Fußnote das
sagen lassen, was sie wirklich ist — oder auf Zahlen umstellen, die stimmen und trotzdem tragen:

```
Ist:   2.000+   vermittelte Schadensfälle
       8 Mio. €+ Schadensersatz durchgesetzt
       32 Tage   Ø bis zur Auszahlung
       < 15 Min  bis zum ersten Rückruf

Soll:  0 €       Ihr Eigenanteil bei unverschuldetem Unfall
       < 48 h    bis der Gutachter bei Ihnen ist
       < 15 Min  bis zum ersten Rückruf
       § 249 BGB Ihre Rechtsgrundlage
```

Diese vier sind alle belegbar (die ersten beiden sind Leistungszusagen, die dritte ist der
gelebte Prozess, die vierte ist Gesetz) — und sie beantworten die Fragen, die der Geschädigte
tatsächlich hat. „8 Mio. €" beantwortet keine.

Fußnote dann ehrlich:
> „0 € gilt bei unverschuldetem Unfall und Schaden über 750 €; bei Teilschuld anteilig.
> Terminzusagen sind Zielwerte des Partner-Netzwerks, keine Garantie."

---

## 3. „Bundesweit größte digitale Plattform" — auf neun Seiten, mit zehn Sachverständigen

**Fundstelle:** `i18n/messages/de.json` → `content.anchor.cornerstone_closing`
**Gerendert:** `components/content/ConversionAnchorBlock.tsx:151`, aufgerufen mit
`variant="cornerstone"` auf **neun Seiten**:

```
/e-auto-gutachter              /motorrad-gutachter
/kfz-haftpflicht-schaden       /ratgeber
/kosten-kfz-gutachten          /unfall-was-tun-als-geschaedigter
/lkw-gutachter                 /unfallskizze
                               /unverschuldeter-unfall-rechte
```

Ist-Text:

> „Claimondo ist die **bundesweit größte digitale Plattform** für die vollständige Regulierung
> von Kfz-Haftpflichtschäden in Deutschland."

Stand Prod-DB: **10** Sachverständige sind echt, aktiv, verifiziert und haben einen Standort
(`sachverstaendige`: 22 Zeilen gesamt, 15 aktiv, davon 5 Testaccounts → 10 echte). 75 Fälle.

Eine Spitzenstellungsbehauptung ist die schärfste Form der Werbeaussage — im Streitfall muss
**der Werbende** sie beweisen, nicht der Angreifer widerlegen. Mit 10 SVs ist sie nicht
beweisbar, und die betroffenen Seiten sind ausgerechnet die, auf denen ein verängstigter
Geschädigter landet (`/unfall-was-tun-als-geschaedigter`, `/unverschuldeter-unfall-rechte`).

Zusätzlich schadet sie inhaltlich: Der Satz steht als **Abschluss-Absatz** unter einem sonst
sachlichen, hilfreichen Block. Er kippt den Ton von „wir erklären Ihnen das" zu „wir sind die
Größten" — genau an der Stelle, an der Vertrauen entstehen sollte.

**Vorschlag** — die eigentliche Stärke benennen statt eine Rangfolge zu behaupten:

> „Claimondo begleitet Kfz-Haftpflichtschäden von der Schadenmeldung bis zur Auszahlung: eigener
> Sachverständiger, Partnerkanzlei, Werkstatt und Fallakte an einer Stelle. Für unverschuldet
> Geschädigte 0 € Eigenkosten nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen
> Haftpflichtversicherer)."

Der Halbsatz mit dem Anerkenntnis-Vorbehalt ist schon da und ist gut — er bleibt.

---

## 4. 32 Tage oder 6–8 Wochen? Die Startseite und die eigene Über-uns-Seite widersprechen sich

Die Startseite macht die Auszahlungsdauer zum zentralen Verkaufsargument:

| Fundstelle | Aussage |
|---|---|
| `home.hero.sub_headline` | „**32 Tage** Ø Auszahlung statt 4–6 Monate Branchen-Durchschnitt" |
| `home.kpis[2]` | „**32 Tage** — Ø bis zur Auszahlung" |
| `home.hero_bullets[3]` | „**32 Tage** statt 4 Monate. Im Schnitt." |
| `home.prozess.eyebrow` | „In **32 Tagen** zum Geld" |
| `home.prozess.steps[4].text` | „Ø **32 Tage** von Schadensmeldung bis zur Auszahlung" |
| `home.schadensreport_teaser.heading` | „**32 Tage.** Branchen-Durchschnitt: 4–6 Monate." |

Und dann, auf `/ueber-uns`, unter der Überschrift „Vier Versprechen, **an denen wir uns messen
lassen**":

> „Antwort unter 15 Minuten. Termin in unter 48 Stunden. Gutachten in 48 Stunden. Auszahlung im
> Schnitt nach **6–8 Wochen**." (`ueber_uns.werte.items.2.text`)

Und auf `/kfz-gutachter/ablauf`:

> „Dauer typisch **6–8 Wochen**" / „Vom Unfall bis zur Auszahlung in **6–8 Wochen**"
> (`page_meta.kfz_gutachter_ablauf.description` / `.og_description`)

32 Tage sind 4,6 Wochen. 6–8 Wochen sind 42–56 Tage — **bis zum Doppelten**. Ein Leser, der von
der Startseite auf „Wie läuft das ab?" klickt (genau das tut ein vorsichtiger Mensch), findet
dort eine andere Zahl als die, die ihn hergebracht hat.

Besonders unglücklich: Die Startseite stellt „32 Tage" gegen „4–6 Monate Branchen-Durchschnitt".
Nimmt man den eigenen Ablauf-Wert von 6–8 Wochen, schrumpft der beworbene Vorsprung erheblich.

**Vorschlag.** Eine Zahl festlegen und alle sechs Startseiten-Stellen plus die zwei anderen
Seiten darauf ziehen. Ist der realistische Wert 6–8 Wochen, dann trägt auch das noch gut:

> `home.hero.sub_headline`:
> „Wir koordinieren Gutachter, Anwalt und Werkstatt — unsere Partnerkanzlei verhandelt mit der
> gegnerischen Versicherung. Für Sie 0 € (§ 249 BGB). Vom Unfall bis zur Auszahlung meist 6–8
> Wochen — Sie sehen jeden Schritt live im Portal."

Und „4–6 Monate Branchen-Durchschnitt" braucht eine Quelle oder muss weg. Aktuell steht die
Zahl viermal ohne Beleg.

---

## 5. Eine Branchenzahl wird als eigene Leistung ausgegeben — mit Fußnote ins Leere

**Fundstelle:** `i18n/messages/de.json` → `ueber_uns.zahlen.items[4]`, `ueber_uns.trust_strip.labels[3]`
**Gerendert:** `app/[locale]/ueber-uns/page.tsx:411-429`

Auf `/ueber-uns` steht als Kennzahl:

> **30–40 %** — „Versicherer-Kürzung **zurückgeholt**²"

Die belegte Zahl ist eine andere. Überall sonst im Projekt wird 30–40 % korrekt als das
beschrieben, was Versicherer-Prüfdienste **kürzen**:

> „Typische Kürzung durch Versicherer-Prüfdienste: 30–40 % (NDR-Reportage 2022,
> Verbraucherzentrale, BGH VI ZR 38/22 ff.)." (`home.pruefdienst_kontrast.fussnote`)

„Was die Gegenseite abzieht" und „was wir zurückholen" sind zwei verschiedene Behauptungen. Die
zweite ist eine Erfolgsquote von Claimondo — und die genannten Quellen (NDR, Verbraucherzentrale,
BGH) sagen darüber nichts.

**Verschärfend:** Die hochgestellte ² verweist auf nichts. Der Render-Block läuft von Zeile 411
bis 429 und gibt nur `kpi` + `label` aus; die Section schließt in Zeile 431 **ohne
Fußnotenabsatz**. Auch ¹ auf „Eigenanteil nach §249 BGB¹" (`items[0]`) hat auf dieser Seite
keinen Referenten. Ein Fußnotenzeichen ist ein Versprechen auf einen Beleg — zwei davon zeigen
hier ins Leere. Das ist schlimmer als gar keine Fußnote.

**Vorschlag:**

```
Ist:   30–40 %  Versicherer-Kürzung zurückgeholt²
Soll:  30–40 %  typische Kürzung durch Versicherer-Prüfdienste — dagegen arbeiten wir
```

und darunter den Fußnotenabsatz tatsächlich rendern (der Text existiert bereits als
`ueber_uns.trust_strip.methodik_note`, er wird in diesem Block nur nicht ausgegeben). Die ¹ auf
`items[0]` entweder mit einem Satz zur 750-€-Grenze belegen oder streichen.

---

# Tier 2 — Verständlichkeit

## 6. Die Startseite benutzt acht Fachbegriffe, die sie nirgends erklärt

Systematischer Test über alle 50 Namespaces: Kommt der Begriff vor, und steht *auf derselben
Seite* irgendwo eine Erklärung? Ergebnis für `home`:

**Unerklärt auf der Startseite:** UPE-Aufschläge · Verbringung · Beilackierung · Wertminderung ·
Nutzungsausfall · Wiederbeschaffungswert · Restwert · fiktiv abrechnen

Der dichteste Fall ist die erste Anspruchs-Karte, weit oben:

> „Unsere Partnerkanzlei verhandelt vollständige Erstattung inkl. **UPE-Aufschläge**,
> **Verbringung** und **Beilackierung** mit der Versicherung. BGH VI ZR 65/18 + VI ZR 174/24."
> (`home.ansprueche.cards[0].text`)

Drei unerklärte Fachwörter und zwei Aktenzeichen in einem Satz. Der Leser, für den diese Seite
gebaut ist, versteht davon nichts — und er kann nicht beurteilen, ob das viel Geld ist. Genau das
müsste der Satz aber leisten: Diese drei Positionen sind zusammen oft vierstellig, und sie sind
das, was Prüfdienste zuerst streichen.

**Vorschlag** (Zahl statt Fachwort, Fachwort in Klammern):

> „Unsere Partnerkanzlei holt auch die Posten, die Versicherer zuerst streichen: den Aufschlag
> auf Original-Ersatzteile (UPE), den Transport zum Lackierer (Verbringung) und das Angleichen
> der Nachbarteile, damit der Farbton stimmt (Beilackierung). Zusammen oft über 1.000 €.
> BGH VI ZR 65/18 · VI ZR 174/24."

Analog für Karte 2, die einen Begriff *als Überschrift* führt, ohne ihn zu erklären:

> Ist: **„Merkantile Wertminderung"** — „Unsere Partnerkanzlei setzt die Wertminderung nach
> Sanden/Danner-Formel durch …"
>
> Soll: **„Wertverlust, weil Ihr Auto jetzt ein Unfallwagen ist"** — „Auch fachgerecht repariert
> bringt Ihr Fahrzeug beim Verkauf weniger. Diesen Verlust (Fachbegriff: merkantile
> Wertminderung) muss die Gegenseite ersetzen — meist 500–2.500 €. BGH VI ZR 357/03."

Positiv-Referenz im eigenen Haus: `/kfz-gutachter/kosten` macht genau das richtig (siehe „Was
gut ist").

## 7. Ausgerechnet die FAQ erklärt neun Begriffe nicht

Dieselbe Messung für `faq` — die Seite, auf die ein ratloser Mensch geht, um Begriffe zu klären:

**Unerklärt:** Wertminderung · Wiederbeschaffungswert · Restwert · UPE-Aufschlag ·
Verbringungskosten · Beilackierung · fiktive Abrechnung · Abfindungserklärung · Sanden/Danner

Beispiel aus `faq.groups[1].fragen[1].antwort`:

> „1. **Stundenverrechnungssätze** (Verweis auf billigere Werkstatt), 2. **UPE-Aufschläge**
> (trotz BGH VI ZR 65/18 erstattungsfähig), 3. **Verbringungskosten** (trotz BGH-Recht),
> 4. **Beilackierungskosten** …"

Das ist eine Liste für Fachleute. Ein Halbsatz je Position würde sie für Laien öffnen, ohne sie
zu verlängern:

> „2. **UPE-Aufschläge** — der Zuschlag, den Werkstätten auf Original-Ersatzteile berechnen
> (trotz BGH VI ZR 65/18 erstattungsfähig)"

**Vollständige Rangliste** (Anzahl unerklärter Begriffe je Seite, Auszug):

| Seite | Anzahl | Begriffe |
|---|---|---|
| `faq` | 9 | s. o. |
| `wie_es_funktioniert` | 9 | + Sicherungsabtretung, Werkstattrisiko |
| `home` | 8 | s. o. |
| `schadensreport_2026` | 7 | |
| `ueber_uns` / `vorteile` / `kfz_gutachter_hub` / `kfz_gutachter_ablauf` | je 6 | |
| `gutachter_finden` / `kfz_gutachter_stadt` / `ersteinschaetzung` | je 5 | |

Der Hebel liegt bei **fünf Begriffen**: Wertminderung, Nutzungsausfall, UPE, Verbringung,
Wiederbeschaffungswert. Sie machen den Großteil aller Treffer aus. Eine zentrale, wiederverwendbare
Kurzdefinition (Tooltip oder Klammerzusatz) würde die Liste auf ein Drittel drücken.

## 8. Die Kostenzusage ist unbedingt formuliert, die Bedingungen stehen zehn Sektionen tiefer

Der Hero sagt, ohne Einschränkung:

> „Für Sie **0 €** (§ 249 BGB)." (`home.hero.sub_headline`)
> „**0 €** für Sie. (§ 249 BGB)." (`home.hero_bullets[4]`)

Die Bedingung steht erst in der FAQ-Sektion weit unten:

> „Bei einem unverschuldeten Unfall **mit Schaden über 750 €** zahlen Sie 0 €."
> (`home.faq.items[0].antwort`)

und die zweite Einschränkung ebenfalls dort:

> „Bei Teilschuld trägt die gegnerische Versicherung **den prozentualen Anteil**."
> (`home.faq.items[3].antwort`)

Die Unverschuldet-Bedingung ist sauber gelöst — sie steht als Frage in der H1 („Unverschuldet im
Unfall?"). Die 750-€-Grenze und die Teilschuld-Quote fehlen oben. Für einen Menschen mit
Kostenangst ist das die Information, die er zuerst braucht; findet er sie erst nach dem
Telefonat, fühlt es sich wie Kleingedrucktes an.

**Vorschlag** — ein Halbsatz an der `trust_footer`-Zeile im Hero (steht bereits direkt unter den
CTAs, `HeroSection.tsx:173`):

```
Ist:  Anonyme Beratung · Keine Bindung · DSGVO-konform
Soll: Anonyme Beratung · Keine Bindung · 0 € bei unverschuldetem Unfall ab 750 € Schaden
```

Das kostet keine Konversion — es nimmt die Angst, dass später eine Rechnung kommt.

## 9. Das Gutachterhonorar hat drei verschiedene Spannen — auf Seiten, die sich gegenseitig verlinken

| Fundstelle | Spanne |
|---|---|
| `kfz_gutachter_kosten.hero_intro` + `.antwort_capsule` + `.faqs[0]` (`/kfz-gutachter/kosten`) | **550–2.600 €** |
| `home.faq.items[0].antwort` (Startseite) | **550–2.600 €** |
| `kosten_kfz_gutachten.hero_intro` (`/kosten-kfz-gutachten`) | **300–1.200 €** |
| `content/claimondo/haftpflicht/sv-kosten.md:52` | **300–1.200 €** |
| `page_meta.kosten_kfz_gutachten.description` | **300–1.200 €** |
| `page_meta.kfz_gutachter_kosten.og_description` | **600–2.600 €** |

Drei Werte für dieselbe BVSK-Tabelle. Die beiden Kostenseiten verlinken einander direkt
(`kfz_gutachter_kosten.crosslink_kosten_ueberblick` → „Was kostet ein Gutachten? (Überblick)"),
der Leser kann den Widerspruch also in zwei Klicks sehen. Und `600–2.600 €` erscheint als
Google-Vorschautext, während die Zielseite `550–2.600 €` zeigt.

**Vorschlag:** Eine Spanne festlegen (fachlich plausibel ist die volle Tabelle HB I–V, also
550–2.600 €) und die drei Abweichler angleichen. Wo „typisch" gemeint ist, das auch schreiben:
„typisch 550–1.400 €, bei hohen Schäden bis 2.600 €".

## 10. Nutzungsausfall: ebenfalls drei Spannen

| Fundstelle | Spanne |
|---|---|
| `home.ansprueche.cards[2].text` | **23–175 €/Tag** |
| `check.range_nutzungsausfall` | **ca. 35–175 € pro Tag** |
| `page_meta.kfz_gutachter_nutzungsausfall.description` | **23–219 €** |

Gleiche Ursache, gleicher Fix. Die Tabelle hat einen definierten Wertebereich — er gehört einmal
zentral abgelegt und überall referenziert, nicht dreimal getippt.

---

# Tier 3 — Konsistenz

## 11. Du und Sie im selben Text — der Google-Snippet siezt, der erste Satz duzt

Die Seiten-Oberfläche (Startseite, Formulare, CTAs, Ratgeber-Intros) siezt durchgehend. Die
Artikel-Inhalte tun es nur teilweise: **45 von 94** deutschen Content-Dateien enthalten Du-Formen,
**21 Dateien mischen beides innerhalb derselben Datei**.

Schärfstes Beispiel — `content/claimondo/haftpflicht/sv-kosten.md`:

```
Zeile 33 (meta_description, erscheint als Google-Vorschau):
  "… Sie wählen Ihren SV frei — für Sie 0 €."

Zeile 52 (erster Satz des Fließtexts, den er dann liest):
  "Bei einem unverschuldeten Verkehrsunfall hast du Anspruch auf einen eigenen,
   unabhängigen Kfz-Sachverständigen …"
```

Der Nutzer wird in der Suche gesiezt und beim Klick geduzt. Zweites Beispiel —
`content/claimondo/decoder/werkstatt-netz.md` (von der Startseite aus zweimal verlinkt): Zeile 34
siezt, Zeile 63–107 duzt, Zeile 130 (Musterbrief) siezt wieder.

Auch in `de.json`:

| Fundstelle | Ist |
|---|---|
| `content.cta_band.headline_default` | „Unverschuldeter Unfall? **Hol dir**, was **dir** zusteht." |
| `content.inline_check.text` | „Wir prüfen kostenfrei, wo **du** in **deinem** Schadensfall stehst." |
| `wertminderung_rechner.titel` | „Wertminderung mit **deinen** Werten berechnen" |
| `upload.signatur.successBody` | „Wir melden uns innerhalb von 24 Stunden bei **dir**." |

`content.cta_band` ist der Fallback der `SpokeCtaBand`-Komponente
(`components/content/SpokeCtaBand.tsx:17`), die an **38 Stellen** eingebunden ist — überall dort,
wo keine eigene Headline übergeben wird, duzt das CTA-Band mitten in einer Sie-Seite.

**Vorschlag:** Auf Sie vereinheitlichen (das ist die Form der Startseite, der Formulare und aller
Ratgeber-Intros — die Mehrheit und die Conversion-Pfade).

```
content.cta_band.headline_default
  Ist:  Unverschuldeter Unfall? Hol dir, was dir zusteht.
  Soll: Unverschuldeter Unfall? Holen Sie sich, was Ihnen zusteht.

content.inline_check.text
  Ist:  Wir prüfen kostenfrei, wo du in deinem Schadensfall stehst. Ohne Kostenrisiko.
  Soll: Wir prüfen kostenfrei, wo Sie in Ihrem Schadensfall stehen. Ohne Kostenrisiko.

wertminderung_rechner.titel
  Ist:  Wertminderung mit deinen Werten berechnen
  Soll: Wertminderung mit Ihren Werten berechnen

upload.signatur.successBody
  Ist:  Wir melden uns innerhalb von 24 Stunden bei dir. Deine Dokumente wurden sicher übermittelt.
  Soll: Wir melden uns innerhalb von 24 Stunden bei Ihnen. Ihre Dokumente wurden sicher übermittelt.
```

Nebenbefund zum letzten Eintrag: „innerhalb von **24 Stunden**" ist eine vierte Reaktionszeit
neben 5 Min / 15 Min / 48 h. Hier ist sie vermutlich korrekt (Dokumenten-Upload, nicht Erstkontakt)
— sie sollte aber als solche kenntlich sein: „Wir prüfen Ihre Unterlagen und melden uns innerhalb
von 24 Stunden."

## 12. Passiv ist fast kein Thema — eine Ausnahme

Über das gesamte Textkorpus fanden sich **16** Passivkonstruktionen in Fließtexten. Die meisten
sind sachlich richtig („die Daten … werden nicht weitergegeben", „jedes Dokument wird sofort
gespeichert"). Behördendeutsch ist hier kein strukturelles Problem.

Die eine Stelle, die das Muster aus dem Auftrag exakt trifft, steht im Kunden-Flow:

```
flow.step_gutachter.sub
  Ist:  Dieser Sachverständige wird Ihren Schaden begutachten.
  Soll: Dieser Sachverständige sieht sich Ihren Schaden an.
```

Zweite, kleinere:

```
ueber_uns.werte.items[1].text
  Ist:  Jede Schadensposition nach §249 BGB wird durchgesetzt — Reparatur, Wertminderung, …
  Soll: Wir setzen jede Schadensposition nach § 249 BGB durch — Reparatur, Wertminderung, …
```

## 13. Umlaute: sauber

Vollscan über `de.json` und alle TSX-Dateien nach ASCII-Ersatz (`fuer`, `ueber`, `koenn`,
`muess`, `groess`, `Strasse`, `zurueck`, `moegl`, `verfueg`, …).

**Kein einziger Treffer in nutzersichtbarem Text.** Alle Fundstellen sind URL-Slugs
(`/sachverstaendige`, `/decoder/wir-pruefen-sachverhalt` — dort korrekt), Variablennamen
(`verfuegbarkeit`, `{bundesstrassen}`) und Code-Kommentare — alle drei nach AGENTS.md ausdrücklich
erlaubt. Die Umlaut-Regel ist durchgehalten.

---

# Latent — im Repo, aber nicht live

Beide Strings wären Tier-1-Befunde, **wenn** sie gerendert würden. Sie werden es nicht. Ich führe
sie auf, weil sie ohne Warnung live gehen können, sobald jemand den Namespace anschließt.

**a) „Deutschlandweit über 50 Partner-Gutachter"** (`landing.hero.trust_badge`)

Der Namespace `landing` hat in `claimondo-marketing/` **keinen** `useTranslations('landing')`-
Aufruf — er steht nur in `i18n/client-namespaces.ts:39` und wird damit ins Client-Bundle geliefert,
aber nirgends angezeigt. Faktenlage: **10** echte aktive SVs gegen „über 50" — Faktor 5. Das ist
dasselbe Muster wie die 473 behaupteten Partner bei ~15 echten. Empfehlung: Zahl jetzt korrigieren
oder den toten Namespace entfernen, nicht warten, bis er angeschlossen wird.

**b) „ja (als einzige der verglichenen Plattformen)"** (`kfz_gutachter_vergleich.tabelle_rows[7]`)

Diese ist live auf `/kfz-gutachter/vermittlungsportale-vergleich`, aber sauber eingegrenzt („der
**verglichenen** Plattformen") und damit belegbar, solange die Vergleichstabelle stimmt. Kein
Befund — nur zur Kenntnis, weil vergleichende Werbung erhöhte Sorgfalt verlangt.

---

# Was gut ist — und als Vorlage taugen sollte

## `/kfz-gutachter/kosten` — die Referenzseite

Diese Seite macht alles, was den anderen fehlt. Sie beantwortet die Angstfragen als
**Überschriften**, nicht als versteckte Absätze:

- „Müssen Sie in Vorleistung gehen?" → **„Nein."** als erstes Wort der Antwort
- „Was ist die Bagatellgrenze 750 €?" → erklärt, inklusive der Warnung, dass optisch kleine
  Schäden teuer sein können
- „Was ist eine Sicherungsabtretung?" → in einem Satz ohne Jargon: „Sie unterzeichnen einmal —
  der Gutachter rechnet danach direkt mit der Versicherung ab. Sie haben kein Insolvenzrisiko,
  kein Vorleistungsrisiko."
- **BVSK wird ausgeschrieben** („Bundesverband der freiberuflichen und unabhängigen
  Sachverständigen für das Kraftfahrzeugwesen") und mit drei Zahlenbeispielen greifbar gemacht:
  „Schaden 5.000 € → ca. 700 €. Schaden 15.000 € → ca. 1.400 €."
- Sie sagt auch, wann es **nicht** kostenlos ist („Selbstverschuldet: Nur Vollkasko ersetzt — und
  zwar mit Selbstbeteiligung"). Diese Ehrlichkeit schafft mehr Vertrauen als jede KPI.

**Das ist die Vorlage.** Die Startseite und die FAQ sollten daran angeglichen werden.

## `/versicherung-schickt-gutachter` — perfekter Einstieg

> H1: „Wir schicken Ihnen unseren Gutachter" — müssen Sie das akzeptieren?
> Intro: **„Nein.** Bei unverschuldetem Unfall wählen Sie Ihren eigenen, unabhängigen
> Sachverständigen frei (§ 249 BGB)."

Die Frage, die der Nutzer stellt, wörtlich als Überschrift; die Antwort als erstes Wort. Genau
richtig für jemanden, der gerade unter Druck telefoniert hat.

## `/kfz-gutachter/sachverstaendiger-vs-gutachter`

Beantwortet exakt die Wissenslücke aus dem Auftrag („er weiß nicht, was ein Sachverständiger von
einem Gutachter unterscheidet") — und zwar entlastend: „Im Alltag werden beide Begriffe **synonym**
verwendet." Statt den Leser dumm dastehen zu lassen, nimmt sie ihm die Sorge, etwas
Wichtiges nicht zu wissen. Vorbildlich.

## Weiteres

- **Rollentrennung** ist konsequent und rechtlich sauber: durchgehend „**unsere Partnerkanzlei**
  verhandelt", nie „wir verhandeln". Das ist in ~25 Textstellen diszipliniert durchgehalten.
- **Der Anerkenntnis-Vorbehalt** („vorbehaltlich Anerkenntnis durch den gegnerischen
  Haftpflichtversicherer") relativiert die 0-€-Zusage an den richtigen Stellen, ohne sie zu
  entwerten.
- **Die 30–40-%-Kürzungsquote** ist überall außer auf `/ueber-uns` (Befund 5) korrekt mit Quelle
  versehen — NDR-Reportage, Verbraucherzentrale, BGH-Aktenzeichen. Das ist mehr Beleg-Disziplin,
  als die Branche üblicherweise zeigt.
- **`/kfz-gutachter/online-kfz-gutachten`** benennt das LG-Bremen-Urteil (16.01.2026, Az. 9 O
  1720/24) inklusive des Hinweises „Das Urteil ist **noch nicht rechtskräftig**". Diese
  Selbstbeschränkung an einer Stelle, an der man den Wettbewerber hätte breittreten können, ist
  ein echtes Vertrauenssignal.

---

# Reihenfolge der Umsetzung

| # | Maßnahme | Aufwand | Wirkung |
|---|---|---|---|
| 1 | Rückrufzeit auf eine Zahl (Befund 1) | 2 Strings | sehr hoch |
| 2 | KPI-Band der Startseite belegen oder ersetzen (Befund 2) | 5 Strings | sehr hoch |
| 3 | „bundesweit größte Plattform" streichen (Befund 3) | 1 String, 9 Seiten | sehr hoch |
| 4 | 32 Tage vs. 6–8 Wochen auflösen (Befund 4) | 8 Strings | hoch |
| 5 | „zurückgeholt" → „Kürzung" + Fußnote rendern (Befund 5) | 1 String, 1 Komponente | hoch |
| 6 | Fünf Kernbegriffe zentral erklären (Befund 6+7) | Tooltip-Komponente | hoch |
| 7 | 750-€-Grenze in den Hero-Trust-Footer (Befund 8) | 1 String | mittel |
| 8 | BVSK- und Nutzungsausfall-Spannen vereinheitlichen (9+10) | 6 Strings | mittel |
| 9 | Du → Sie (Befund 11) | 4 Strings + 21 MD-Dateien | mittel |
| 10 | Zwei Passivsätze (Befund 12) | 2 Strings | gering |

Die Punkte 1–5 sind zusammen etwa 17 geänderte Strings und eine kleine Komponenten-Ergänzung.

---

## Anhang — Messkommandos zur Reproduktion

```bash
# Fachbegriffe ohne Erklaerung je Seite
node scratchpad/jargon.js

# Sie/Du-Mischung in Content-Artikeln
for f in $(find content -name "*.md" -not -path "*_translations*"); do
  grep -qE "\b(dein|deine|deinen|dir|dich)\b" "$f" \
    && grep -qE "\b(Ihre|Ihren|Ihnen)\b" "$f" && echo "$f"
done

# Umlaut-Ersatz in nutzersichtbarem Text
grep -rInoE "(fuer|ueber |koenn|muess|groess|zurueck|verfueg)" --include="*.tsx" app components
```

Prod-Gegenmessung (nur Lesezugriff, Projekt `paizkjajbuxxksdoycev`):

```sql
select (select count(*) from claims)                                    as claims,        -- 75
       (select count(*) from abrechnungen)                              as abrechnungen,  -- 0
       (select count(*) from zahlungseingaenge)                         as zahlungen,     -- 0
       (select min(created_at)::date from claims)                       as erster_fall,   -- 2026-07-15
       (select count(*) from sachverstaendige
         where geloescht_am is null and ist_aktiv
           and not coalesce(ist_testaccount,false))                     as sv_echt_aktiv; -- 10
```
