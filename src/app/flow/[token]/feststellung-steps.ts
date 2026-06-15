// AAR-956 15.06. (Aaron): Micro-Step-Aufteilung der Kunden-Feststellung. Statt
// eines langen Scrolls wird jede Config-Phase (Schaden/Unfall/Fahrzeug/Service)
// in kleine Schritte mit 1-3 Feldern zerlegt — eine Frage pro Screen.
//
// Deklarativ + adjustierbar: die FELDER kommen weiterhin aus der Config
// (onboarding_phasen/-felder via ladeFlowPhasen), hier steht NUR die Gruppierung
// + Reihenfolge. Ein 'felder'-Schritt ist sichtbar, sobald >=1 seiner Felder
// sichtbar ist (audience kunde + istFeststellungsFeld + conditional_on erfuellt)
// — sonst faellt er raus (z.B. Gegner-Schritt nur bei schuldfrage='gegner').
// Custom-Schritte rendern Spezial-Komponenten (ZB1-Foto, Polizeibericht).
//
// i18n: Titel/Kapitel sind vorerst Deutsch (deutsches Produkt; non-DE laeuft
// ueber den Sprach-Banner-Fallback). TODO: nach messages/<locale>.json ziehen,
// sobald die Strecke steht.

export type FeststellungMicroStep =
  | { kind: 'felder'; id: string; kapitel: string; titel: string; sub?: string; feldKeys: string[] }
  | { kind: 'zb1'; id: string; kapitel: string; titel: string; sub?: string }
  | { kind: 'polizeibericht'; id: string; kapitel: string; titel: string; sub?: string }

export const FESTSTELLUNG_STEPS: FeststellungMicroStep[] = [
  // ① Schaden
  { kind: 'felder', id: 'unfalltyp', kapitel: 'Schaden', titel: 'Was für ein Unfall war es?', feldKeys: ['schadentyp', 'schadentyp_freitext'] },
  { kind: 'felder', id: 'hergang', kapitel: 'Schaden', titel: 'Wie ist es passiert?', sub: 'Schildere den Hergang so ausführlich wie möglich — Richtung, Tempo, Ampel/Vorfahrt, wer war wo. Daraus erstellen wir die präzise Unfallskizze.', feldKeys: ['unfallhergang', 'schaden_sichtbar'] },
  { kind: 'felder', id: 'folgeschaeden', kapitel: 'Schaden', titel: 'Verletzte oder weitere Schäden?', feldKeys: ['personenschaden_flag', 'sachschaden_flag', 'sachschaden_beschreibung'] },
  // ② Unfall
  { kind: 'felder', id: 'wann_wo', kapitel: 'Unfall', titel: 'Wann und wo?', feldKeys: ['unfalldatum', 'unfall_uhrzeit', 'unfallort'] },
  { kind: 'felder', id: 'polizei_zeugen', kapitel: 'Unfall', titel: 'Polizei & Zeugen', feldKeys: ['polizei_vor_ort', 'polizei_aktenzeichen', 'zeugen'] },
  { kind: 'polizeibericht', id: 'polizeibericht', kapitel: 'Unfall', titel: 'Polizeibericht', sub: 'Falls du den Bericht schon hast, lad ihn hier hoch.' },
  { kind: 'felder', id: 'gegner', kapitel: 'Unfall', titel: 'Daten des Unfallgegners', sub: 'Steht auf dem europäischen Unfallbericht oder der Visitenkarte.', feldKeys: ['gegner_kennzeichen', 'auslandskennzeichen', 'gegner_versicherung', 'gegner_telefon'] },
  // ③ Fahrzeug
  { kind: 'zb1', id: 'fahrzeugschein', kapitel: 'Fahrzeug', titel: 'Fahrzeugschein fotografieren', sub: 'Ein Foto füllt Marke, FIN und Halter automatisch aus.' },
  { kind: 'felder', id: 'dein_fahrzeug', kapitel: 'Fahrzeug', titel: 'Dein Fahrzeug', feldKeys: ['kennzeichen', 'fahrzeug_fahrbereit', 'mietwagen_flag'] },
  { kind: 'felder', id: 'halter', kapitel: 'Fahrzeug', titel: 'Wem gehört das Fahrzeug?', feldKeys: ['ist_fahrzeughalter', 'halter_vorname', 'halter_nachname', 'halter_geburtsdatum', 'halter_strasse', 'halter_plz', 'halter_stadt'] },
  { kind: 'felder', id: 'vorschaeden', kapitel: 'Fahrzeug', titel: 'Vorschäden am Auto?', feldKeys: ['hat_vorschaeden'] },
  // ④ Service
  { kind: 'felder', id: 'service', kapitel: 'Service', titel: 'Wie sollen wir helfen?', feldKeys: ['service_typ', 'kanzlei_wunsch'] },
]
