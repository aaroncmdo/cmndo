export const EINWAENDE = [
  { typ: 'kosten', einwand: 'Was kostet mich das?', antwort: 'Bei uns zahlen Sie nichts. Wir rechnen direkt mit der gegnerischen Versicherung ab. Sie haben kein Kostenrisiko.', fachgrundlage: '§ 249 BGB — Schadensersatzpflicht des Schädigers' },
  { typ: 'kosten', einwand: 'Warum ist das kostenlos?', antwort: 'Ihre Ansprüche auf Erstattung der Gutachterkosten treten Sie an uns ab. Wir holen das Geld direkt bei der Versicherung. Für Sie entstehen null Kosten.', fachgrundlage: 'Sicherungsabtretung § 398 BGB' },
  { typ: 'vertrauen', einwand: 'Ich kenne Claimondo nicht.', antwort: 'Wir arbeiten mit TÜV-zertifizierten Sachverständigen und erfahrenen Partnerkanzleien. Über 500 Kunden vertrauen uns bereits.', fachgrundlage: '' },
  { typ: 'vertrauen', einwand: 'Warum soll ich nicht direkt zur Versicherung gehen?', antwort: 'Die gegnerische Versicherung vertritt NICHT Ihre Interessen. Ein unabhängiger Gutachter stellt sicher, dass Sie den vollen Schadensersatz erhalten — nicht den gekürzten Betrag den die Versicherung anbietet.', fachgrundlage: '§ 249 II BGB — Anspruch auf Sachverständigenkosten' },
  { typ: 'zeit', einwand: 'Ich habe keine Zeit für einen Termin.', antwort: 'Der Gutachter kommt zu Ihnen — an Ihren Arbeitsplatz, nach Hause oder zur Werkstatt. Der Termin dauert nur 30-45 Minuten.', fachgrundlage: '' },
  { typ: 'zeit', einwand: 'Das dauert doch ewig.', antwort: 'Der Gutachter kommt innerhalb von 24-48 Stunden. Das Gutachten ist in der Regel nach 3-5 Werktagen fertig. Die Kanzlei übernimmt sofort danach.', fachgrundlage: '' },
  { typ: 'werkstatt', einwand: 'Meine Werkstatt macht das.', antwort: 'Ein Werkstatt-Kostenvoranschlag ist kein Gutachten. Ein unabhängiges Gutachten sichert Ihnen MEHR Geld — Wertminderung, Nutzungsausfall, Kostenpauschale — das berechnet keine Werkstatt.', fachgrundlage: 'BGH VI ZR 67/06 — Recht auf Sachverständigengutachten' },
  { typ: 'versicherung', einwand: 'Die Versicherung hat schon einen Gutachter geschickt.', antwort: 'Das war ein Versicherungs-Gutachter der die Interessen der GEGNERISCHEN Versicherung vertritt. Sie haben das Recht auf ein eigenes, unabhängiges Gutachten.', fachgrundlage: 'BGH VI ZR 67/06' },
  { typ: 'bagatell', einwand: 'Der Schaden ist doch nur klein.', antwort: 'Auch bei Schäden ab 750€ netto lohnt sich ein Gutachten. Häufig werden versteckte Schäden gefunden, Wertminderung kommt dazu, und Sie bekommen mehr als gedacht.', fachgrundlage: 'Bagatellschadengrenze ca. 750€ netto' },
  { typ: 'schuld', einwand: 'Ich bin teilschuld am Unfall.', antwort: 'Auch bei Teilschuld haben Sie Ansprüche — anteilig. Wir klären die genaue Schuldfrage und sichern Ihnen den maximalen Anteil.', fachgrundlage: '§ 254 BGB — Mitverschulden' },
  { typ: 'daten', einwand: 'Was passiert mit meinen Daten?', antwort: 'Ihre Daten werden ausschließlich zur Schadensabwicklung verwendet. Wir sind DSGVO-konform und geben nichts an Dritte weiter, außer an den beauftragten Gutachter und die Kanzlei.', fachgrundlage: 'DSGVO Art. 6 Abs. 1b' },
  { typ: 'anwalt', einwand: 'Brauche ich einen Anwalt?', antwort: 'Unsere Partnerkanzlei ist automatisch mit dabei — ohne extra Kosten für Sie. Die Anwaltskosten trägt die gegnerische Versicherung.', fachgrundlage: '§ 249 BGB — Erstattung vorgerichtlicher Anwaltskosten' },
  { typ: 'closing', einwand: 'Ich muss nochmal drüber nachdenken.', antwort: 'Verstehe ich. Wichtig: Die Verjährungsfrist läuft. Je schneller wir starten, desto besser Ihre Position. Soll ich Ihnen den Link schicken? Dauert nur 2 Minuten.', fachgrundlage: '§ 195 BGB — 3 Jahre Verjährung' },
]

export const FACHBEGRIFFE: Record<string, string> = {
  'Wiederbeschaffungswert': 'Der Betrag, den Sie benötigen, um ein gleichwertiges Fahrzeug zu kaufen. Wird vom Gutachter anhand von Marktdaten ermittelt.',
  'Restwert': 'Der aktuelle Wert Ihres beschädigten Fahrzeugs im nicht-reparierten Zustand.',
  'Nutzungsausfall': 'Entschädigung für jeden Tag, an dem Sie Ihr Fahrzeug nicht nutzen können. Beträge gestaffelt nach Fahrzeugklasse (20-175€/Tag).',
  '130%-Regel': 'Wenn die Reparaturkosten zwischen 100% und 130% des Wiederbeschaffungswerts liegen, dürfen Sie trotzdem reparieren lassen — aber nur wenn Sie das Fahrzeug mind. 6 Monate weiterfahren.',
  'Wertminderung': 'Merkantile Wertminderung: Ein repariertes Unfallfahrzeug ist weniger wert als ein unfallfreies. Dieser Unterschied wird entschädigt.',
  'Kostenpauschale': 'Pauschal 25-30€ für Aufwand (Telefonate, Porto, Fahrten). Steht Ihnen automatisch zu.',
  'Sicherungsabtretung': 'Sie treten Ihren Anspruch auf Gutachterkosten-Erstattung an uns ab. Wir holen das Geld direkt von der Versicherung.',
  'Totalschaden': 'Wenn die Reparaturkosten den Wiederbeschaffungswert übersteigen (über 130%). Dann wird der WBW minus Restwert erstattet.',
  'Haftpflichtschaden': 'Schaden durch einen anderen Verkehrsteilnehmer verursacht. Dessen Versicherung muss alle Kosten tragen.',
  'Kaskoschaden': 'Schaden an Ihrem eigenen Fahrzeug (z.B. Wildunfall, Hagel). Ihre eigene Versicherung reguliert.',
}

export const FRISTEN = [
  { name: 'Verjährung Schadensersatz', dauer: '3 Jahre', basis: '§ 195 BGB', detail: 'Ab Kenntnis des Schadens, zum Jahresende.' },
  { name: 'Regulierungsfrist Versicherung', dauer: '4-6 Wochen', basis: 'Branchenüblich', detail: 'Nach Zugang des Anspruchsschreibens.' },
  { name: 'Widerrufsrecht SA', dauer: '14 Tage', basis: '§ 355 BGB', detail: 'Ab Vertragsschluss.' },
  { name: '6-Monate-Frist (130%-Regel)', dauer: '6 Monate', basis: 'BGH VI ZR 192/05', detail: 'Fahrzeug muss mind. 6 Monate weitergefahren werden.' },
]
