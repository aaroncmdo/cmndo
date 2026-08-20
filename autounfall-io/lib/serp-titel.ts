// Kurzfassungen fuer die Suchergebnis-Anzeige.
//
// Gemessen am 20.08.2026 ueber alle 254 Sitemap-URLs: **71 Titel lagen ueber 60
// Zeichen** und wurden von Google abgeschnitten. `metaTitle()` in `./meta.ts`
// faengt den Fall zwar ab — es laesst dann das Marken-Suffix weg statt den Titel
// zu beschneiden — aber das rettet nur die Marke, nicht die Lesbarkeit: der
// Titel wird trotzdem abgeschnitten. Der Notfall-Zweig lief damit auf 141 von
// 254 Seiten als Dauerzustand.
//
// Gekuerzt wird redaktionell, nicht algorithmisch: ein generischer Kuerzer
// (Segmente von hinten weglassen) wurde gegen die echten Titel getestet und
// haette **58 davon auf unter 28 Zeichen** zusammengestrichen — die Startseite
// waere woertlich zu „autounfall.io" geworden. Deshalb diese explizite Liste.
//
// Prinzip: das Haupt-Keyword bleibt vorn und vollstaendig, gekuerzt wird der
// Nachsatz. Wo es ohne Substanzverlust geht, liegt die Kurzfassung unter 44
// Zeichen — dann passt zusaetzlich das Suffix, und die Seite traegt wieder die
// Marke (so bei allen zehn SF-Versicherer-Hubs).
//
// Der Schluessel ist der VOLLE Originaltitel, so wie ihn die Seite liefert
// (`content/rest-pages.generated.ts` und `content/decoder-*.generated.ts` sind
// auto-generiert und werden nicht angefasst). Aendert sich ein Originaltitel,
// greift sein Eintrag still nicht mehr — `npm run check:serp-titel` prueft
// deshalb Laengen, Duplikate und ob die Schluessel die Quelle noch treffen.
export const SERP_KURZTITEL: Record<string, string> = {
  'autounfall.io — Unfall-Assistance: Ratgeber, Decoder & Rechner': 'Unfall-Assistance: Ratgeber & Rechner',
  'Abschleppdienst nach Unfall — richtig wählen, Kostenfalle vermeiden': 'Abschleppdienst nach Unfall richtig wählen',
  'Abtretungserklärung nach Unfall: Muster, Recht & Risiken (§398 BGB)': 'Abtretungserklärung nach Unfall: Muster & Recht',
  'Akutphase-Checkliste · Was tun nach dem Autounfall — interaktiv mit 8 Schritten': 'Akutphase-Checkliste: was tun nach dem Unfall',
  'Akutphase-Spezialfälle — Fahrerflucht, Ausland, anonymer Gegner': 'Akutphase-Spezialfälle: Fahrerflucht & Ausland',
  'Anspruch & Versicherung · Was steht Ihnen nach einem Unfall zu?': 'Anspruch & Versicherung nach dem Unfall',
  'Auffahrunfall: Wer haftet — und wann der Anscheinsbeweis fällt': 'Auffahrunfall: Haftung & Anscheinsbeweis',
  'Bagatellschaden: Definition, 750-€-Grenze und was die Versicherung zahlt': 'Bagatellschaden: Definition & 750-€-Grenze',
  'Beweissicherung nach Unfall: die 12 Pflichtfotos + Skizzen-Vorlage': 'Beweissicherung nach Unfall: 12 Pflichtfotos',
  'Die 12 Pflichtfotos nach dem Unfall — detaillierte Anleitung pro Foto': 'Die 12 Pflichtfotos nach dem Unfall',
  'Die ersten 24 Stunden nach dem Unfall — stundengenauer Zeitplan': 'Die ersten 24 Stunden nach dem Unfall',
  'Selbstanzeige Fahrerflucht · 24-Stunden-Fenster · §142 Abs. 4': 'Selbstanzeige Fahrerflucht: 24-Stunden-Fenster',
  'Spiegel angefahren · Kratzer auf Parkplatz · ist das Fahrerflucht?': 'Spiegel angefahren: ist das Fahrerflucht?',
  'Fahrerflucht · Regress der eigenen Versicherung · §81 VVG · bis 5.000 €': 'Fahrerflucht: Regress der Versicherung (§81 VVG)',
  'Schadensgutachten, Wertgutachten, Beweisgutachten — was wann?': 'Schadens-, Wert- und Beweisgutachten',
  'Gutachten oder Kostenvoranschlag — was ist nach dem Unfall richtig?': 'Gutachten oder Kostenvoranschlag?',
  'Sachverständigen finden — unabhängiges Kfz-Gutachten anfragen': 'Sachverständigen finden: Gutachten anfragen',
  'Guter vs. schlechter Kfz-Sachverständiger — die 6 Qualitätsmerkmale': 'Kfz-Sachverständiger: 6 Qualitätsmerkmale',
  'Sachverständige-Ratgeber · Die 10 wichtigsten Fragen rund um Kfz-Gutachten': 'Sachverständige-Ratgeber: die 10 wichtigsten Fragen',
  'Was darf der Versicherungs-Sachverständige? — Prüfdienste erklärt': 'Was darf der Versicherungs-Sachverständige?',
  'Wer beauftragt den Sachverständigen — ich oder die Versicherung?': 'Wer beauftragt den Sachverständigen?',
  'Hagel & Sturmschäden — Teilkasko-Leistung richtig durchsetzen': 'Hagel & Sturmschaden: Teilkasko durchsetzen',
  'Haushaltsführungsschaden — Berechnung nach Schulz-Borck/Pardey': 'Haushaltsführungsschaden berechnen',
  'SF-Klasse für Fahranfänger · SF 0 + Sonderwege · Beitragssatz': 'SF-Klasse für Fahranfänger: SF 0 & Sonderwege',
  'Kürzungs-Checker: Was die Versicherung gestrichen hat zurückholen': 'Kürzungs-Checker: Gestrichenes zurückholen',
  'Merkantile Wertminderung: was sie ist und wie viel Sie zusteht': 'Merkantile Wertminderung: was Ihnen zusteht',
  'Mietwagen-Anspruch nach Unfall — Sanden/Danner-Klassen, Schwacke, Nutzungsausfall': 'Mietwagen-Anspruch: Sanden/Danner & Schwacke',
  'Nutzungsausfall nach Unfall · Anspruch nach §249 BGB · Tabelle + Rechner': 'Nutzungsausfall: Tabelle + Rechner (§249 BGB)',
  'Nutzungsausfall oder Mietwagen · Entscheidungshilfe · BGH VI ZR 211/15': 'Nutzungsausfall oder Mietwagen?',
  'Nutzungsausfall-Tabelle 2026 · Gruppen A–L · Sanden/Danner/Küppersbusch erklärt': 'Nutzungsausfall-Tabelle 2026: Gruppen A–L',
  'Parkschaden: Wer zahlt — und was tun bei unbekanntem Verursacher?': 'Parkschaden: Wer zahlt bei unbekanntem Täter?',
  'Schaden-Rechner: Nutzungsausfall, Schmerzensgeld, Totalschaden & mehr': 'Schaden-Rechner: Nutzungsausfall & mehr',

  // Die zehn SF-Versicherer-Hubs teilen ein Template; das letzte Segment faellt.
  // Alle bleiben unter 44 Zeichen und tragen dadurch wieder die Marke.
  'ADAC · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'ADAC · SF-Klasse · Rückstufungs-Rechner',
  'Allianz · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'Allianz · SF-Klasse · Rückstufungs-Rechner',
  'AXA · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'AXA · SF-Klasse · Rückstufungs-Rechner',
  'DEVK · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'DEVK · SF-Klasse · Rückstufungs-Rechner',
  'Generali · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'Generali · SF-Klasse · Rückstufungs-Rechner',
  'HUK-Coburg · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'HUK-Coburg · SF-Klasse · Rückstufung',
  'HUK24 · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'HUK24 · SF-Klasse · Rückstufungs-Rechner',
  'LVM · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'LVM · SF-Klasse · Rückstufungs-Rechner',
  'Provinzial · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'Provinzial · SF-Klasse · Rückstufung',
  'VHV · SF-Klasse · Rückstufungs-Rechner · Beitragssatz-Tabelle 2026': 'VHV · SF-Klasse · Rückstufungs-Rechner',

  'SF-Rückstufungs-Rechner: Was ein Unfall Ihre Versicherung kostet': 'SF-Rückstufungs-Rechner: was ein Unfall kostet',
  'Selbst zahlen oder Versicherung melden · Verursacher-Entscheidung': 'Selbst zahlen oder der Versicherung melden?',
  'SF-Klassen-Tabelle 2026 · Beitragssätze und Rückstufung im Überblick': 'SF-Klassen-Tabelle 2026: Beitragssätze',
  'Schadenfreiheitsklasse übertragen · Regeln, Versicherer, Antrag': 'Schadenfreiheitsklasse übertragen: Regeln',
  'Unfall verursacht · Was jetzt zählt · Folgen für SF-Klasse und Geschädigten': 'Unfall verursacht: Folgen für die SF-Klasse',
  'Schuldfrage beim Auffahrunfall · Anscheinsbeweis · Teilschuld erklärt': 'Schuldfrage beim Auffahrunfall',
  'Stundenverrechnungssatz nach Unfall: welcher Satz erstattungsfähig ist': 'Stundenverrechnungssatz: welcher Satz zählt',
  'Tesla & E-Auto-Gutachten — was Standard-Sachverständige übersehen': 'Tesla & E-Auto-Gutachten: oft übersehen',
  'Akutphase · Was tun in den ersten 24 Stunden nach einem Unfall': 'Was tun in den ersten 24 Stunden?',
  'Verbringungskosten · was die Versicherung erstatten muss · BGH-Linie': 'Verbringungskosten: was erstattet wird',
  'Vergleiche · Claimondo gegenüber 8 Alternativen im Kfz-Schadenmanagement': 'Claimondo im Vergleich mit 8 Alternativen',
  'Claimondo vs. ControlExpert · Versicherer-Prüfdienst im Vergleich': 'Claimondo vs. ControlExpert',
  'DEKRA/TÜV vs. unabhängiger Kfz-Sachverständiger — wann lohnt sich was?': 'DEKRA/TÜV oder freier Sachverständiger?',
  'Claimondo vs. IMD-NET (imd-gutachten.de) — der ehrliche Anbieter-Vergleich': 'Claimondo vs. IMD-NET im Vergleich',
  'Claimondo vs. Unfallpaten — der ehrliche Anbieter-Vergleich (2026)': 'Claimondo vs. Unfallpaten im Vergleich',
  'Schaden selbst regulieren (DIY) vs. Claimondo — ehrliche Entscheidungshilfe': 'Schaden selbst regulieren oder Claimondo?',
  'Versicherungs-Regulierung vs. Claimondo — was die Versicherung NICHT zahlt': 'Was die Versicherung NICHT zahlt',
  'Versicherer-Decoder — was die Kfz-Versicherung wirklich meint': 'Versicherer-Decoder: Briefe übersetzt',
  'Versicherung fordert immer neue Unterlagen — was steckt dahinter?': 'Versicherung fordert immer neue Unterlagen',
  'Stundenverrechnungssatz gekürzt — Verweis auf freie Werkstatt': 'Stundenverrechnungssatz gekürzt: was tun?',
  'Totalschaden-Abrechnung zu niedrig — Wiederbeschaffungswert prüfen': 'Totalschaden zu niedrig abgerechnet?',
  'Versicherungs-Anruf nach Unfall — was sagen, was vermeiden (mit Risiko-Quiz)': 'Versicherungs-Anruf: was sagen, was vermeiden',
  'Vorfahrt missachtet · Bußgeld + Haftpflichtfolgen · 630 SV/Mo': 'Vorfahrt missachtet: Bußgeld & Haftung',
  'Werkstatt sofort oder erst Sachverständigen? — Reparatur-Timing nach Unfall': 'Werkstatt oder erst zum Sachverständigen?',
  'Werkstattrisiko nach BGH 16.01.2024 — was sich für Geschädigte geändert hat': 'Werkstattrisiko nach BGH 2024',
  'Wertminderung nach §249 BGB — Berechnung, Methoden, Durchsetzung': 'Wertminderung nach §249 BGB berechnen',

  // Drei Decoder-Titel mit typografischen Anfuehrungszeichen — maschinell aus
  // der generierten Quelle uebernommen, damit die Zeichen exakt stimmen.
  '„Wir schicken Ihnen einen Gutachter“ — müssen Sie das zulassen?': 'Versicherung schickt Gutachter: Ihre Wahl',
  '„Ein Gutachten ist nicht nötig“ — sagt die Versicherung. Stimmt das?': 'Gutachten nicht nötig? Was dahintersteckt',
  '„Wir prüfen den Sachverhalt" — was die Versicherung damit meint': 'Wir prüfen den Sachverhalt: was das heißt',
}
