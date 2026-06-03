// Single-Source der Dispatcher-Call-Skripte (phasen-frei). Konsumiert von der
// v2-Sidebar (DispatchGespraechshilfe / DispatchEinwandKarten, zeigen ALLES) und
// — bis zum P3b-Cutover — von der Legacy-SidebarStubs (indexiert nach Phase).
export type GespraechsSektion = { titel: string; opener: string; folge: string[] }
export type Einwand = { einwand: string; antwort: string }
export type DisqualifikationsHilfe = { grund: string; skript: string }

export const GESPRAECHS_SEKTIONEN: GespraechsSektion[] = [
  // index 0 = Phase 1
  {
    titel: 'Einstieg + Empathie + Qualifizierung',
    opener:
      '„Claimondo Unfallservice, [Ihr Name] am Apparat. Das klingt stressig — wir kümmern uns. Erzählen Sie mir zuerst in Ruhe wie es passiert ist."',
    folge: [
      'Aktiv zuhören, nicht unterbrechen — erst 60–90s reden lassen.',
      'Dann strukturiert Q1 (Hergang), Q2 (Schaden/Personenschaden), Q3 (Polizei) abhaken.',
      'Bei „unklar" immer Teilschuld-Aufklärung vorlesen (rot markierter Checkbox-Block).',
    ],
  },
  // index 1 = Phase 2
  {
    titel: 'Terminreservierung + Pfad-Entscheidung',
    opener:
      '„Ich habe einen Sachverständigen in Ihrer Nähe verfügbar — [Datum] um [Uhrzeit] könnten wir direkt reservieren. Passt das für Sie?"',
    folge: [
      'Zuerst Besichtigungsadresse klären (Auto-Save bei Select).',
      'Dann Pfad A (Komplett) vs. Pfad B (Nur SV) erklären — Standard ist Komplett.',
      'SV-Vorschläge nach Distanz + Kontingent automatisch sortiert.',
    ],
  },
  // index 2 = Phase 3
  {
    titel: 'Schadentyp + Konstellation',
    opener:
      '„Damit wir das richtig einordnen — war das ein Auffahrunfall, ein Spurwechsel, oder auf dem Parkplatz?"',
    folge: [
      'Pro Schadentyp gibt es Dispatch-Hinweise (Zeugen/Dashcam/Polizei-AZ etc.).',
      'Bei Parkplatz ohne Kennzeichen: Kamera-Check ist Pflicht — Disqualifier.',
      'Schadentyp bestimmt automatisch die Ortskategorie (siehe P2-B).',
    ],
  },
  // index 3 = Phase 4
  {
    titel: 'Stammdaten + Gegner',
    opener:
      '„Ich nehme noch kurz die restlichen Daten auf — Kennzeichen, Marke, Gegner-Kennzeichen. Dann sind wir fast durch."',
    folge: [
      'Kennzeichen über HSN/TSN triggert Cardentity-Call (Halter + Marke).',
      'Gegner-Versicherung: wenn bekannt eintragen, sonst „unbekannt" — Kanzlei recherchiert.',
      'Vorschäden-Frage nicht vergessen (Kasko-relevant).',
    ],
  },
  // index 4 = Phase 5
  {
    titel: 'Letzter Check + FlowLink-Versand',
    opener:
      '„Ich schicke Ihnen jetzt den Link per WhatsApp. Darin unterschreiben Sie den Sachverständigen-Auftrag — das dauert drei Minuten. Danach ist Ihr Termin fix gebucht."',
    folge: [
      'Summary durchgehen — rote Zeilen sind noch offene Pflichtfelder.',
      'WA-Nummer + Email live editierbar (wird onBlur gespeichert).',
      'Nach Versand: Auto-Sprung zu Phase 6 Status-Tracking.',
    ],
  },
  // index 5 = Phase 6
  {
    titel: 'Nachverfolgung + Inaktiv-Alarm',
    opener:
      '„Der Link wurde gesendet. Ich prüfe in den nächsten zwei Stunden den Status — melden Sie sich wenn irgendwas hakt, sonst hören wir uns nach dem Termin wieder."',
    folge: [
      'Alarm bei >2h ohne Portal-Öffnung — direkt Rückruf einleiten.',
      'Erneut-senden-Button unter dem Stepper falls Link verloren.',
      'Nach SA-Unterschrift wird T4 „Termin bestätigt" automatisch gesendet.',
    ],
  },
]

export const EINWAENDE: Einwand[] = [
  {
    einwand: '„Ich melde mich selbst bei der Versicherung"',
    antwort:
      'Wir übernehmen alles komplett — Gutachten, Kanzlei, Kommunikation mit der Gegenseite. Mit unserer Partnerkanzlei bekommen Sie im Schnitt mehr heraus als wenn Sie es selbst regulieren.',
  },
  {
    einwand: '„Muss ich irgendetwas zahlen?"',
    antwort:
      'Nein, für Sie ist alles kostenlos. Die Kosten trägt die Versicherung des Unfallverursachers — das ist Ihr gesetzliches Recht.',
  },
  {
    einwand: '„Ich habe schon einen Anwalt"',
    antwort:
      'Kein Problem — dann übernehmen wir nur den Gutachtertermin. Ihr Anwalt bleibt unabhängig, wir liefern ihm nur das Gutachten.',
  },
  {
    einwand: '„Das dauert mir zu lange"',
    antwort:
      'Wir haben oft schon übermorgen einen Termin. Sie müssen nur kurz unterschreiben — das dauert drei Minuten im Portal.',
  },
  {
    einwand: '„Ich überlege mir das"',
    antwort:
      'Ich halte den Termin 30 Minuten für Sie offen — danach geht der Slot an den nächsten Fall. Sollen wir zusammen kurz durchgehen?',
  },
  {
    einwand: '„Wie lange dauert die Regulierung?"',
    antwort:
      'In der Regel 4–6 Wochen. Sie sehen den Status jederzeit live in Ihrem Portal — inkl. aller Dokumente.',
  },
  {
    einwand: '„Ist das seriös?"',
    antwort:
      'Wir arbeiten ausschließlich mit zertifizierten Gutachtern und der LexDrive GmbH als Kanzlei-Partner — beide gerichtlich anerkannt und geprüft.',
  },
]

export const DISQUALIFIKATIONS_HILFE: DisqualifikationsHilfe[] = [
  {
    grund: 'Eigenverschulden',
    skript:
      'Kurz bestätigen: "Wenn ich das richtig verstehe — Sie haben den Unfall verursacht, ist das so?" ' +
      'Erklären: "In diesem Fall ist leider unsere Zuständigkeit nicht gegeben — unser Service gilt ausschließlich für Schäden, bei denen die Versicherung des anderen Fahrers für Sie aufkommt." ' +
      'Tipp: "Ich empfehle Ihnen, direkt bei Ihrer eigenen Versicherung anzurufen." ' +
      'Sauber abschließen. Keine offene Tür.',
  },
  {
    grund: 'Kein Schaden',
    skript:
      '"Wenn keine Verletzung vorliegt und Ihr Fahrzeug keinen erkennbaren Schaden hat, können wir den Fall leider nicht weiter bearbeiten." ' +
      '"Sollten Sie in den kommenden Tagen doch noch etwas bemerken — Schmerzen, ein Geräusch am Auto, irgendetwas — melden Sie sich einfach erneut." ' +
      'Sauber abschließen.',
  },
  {
    grund: 'Kasko / eigene Versicherung',
    skript:
      '"Wenn der Schaden über Ihre eigene Kasko-Versicherung laufen muss, ist das leider nicht unser Zuständigkeitsbereich — wir arbeiten nur mit Haftpflichtschäden des Unfallgegners." ' +
      '"Bitte wenden Sie sich direkt an Ihren eigenen Versicherer." ' +
      'Sauber abschließen.',
  },
  {
    grund: 'Fahrerflucht ohne Kennzeichen',
    skript:
      '"Ohne Kennzeichen des Verursachers haben wir leider keine Möglichkeit, den Gegner zu ermitteln — und damit auch keine Versicherung gegen die wir regulieren könnten." ' +
      '"Bitte erstatten Sie zuerst Anzeige bei der Polizei. Wenn der Verursacher später ermittelt wird, melden Sie sich gerne wieder bei uns." ' +
      'Sauber abschließen.',
  },
  {
    grund: 'Parkplatz ohne Kamera',
    skript:
      '"Auf einem Parkplatz ohne Kennzeichen des Verursachers und ohne Überwachungskamera haben wir keine Möglichkeit, den Unfallgegner zu identifizieren." ' +
      '"Bitte erstatten Sie Anzeige bei der Polizei — das ist der richtige Weg in diesem Fall." ' +
      'Sauber abschließen.',
  },
]
