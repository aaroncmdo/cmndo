// Pure Logik für den Werkstatt-Finder-Wizard (Phase 2). Kein React — testbar isoliert.
import type { Gewerk, Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import { GEWERKE } from '@/lib/werkstatt/bedarf/types'
import type { KaskoTarifAuswahl, WbErgebnis } from '@/lib/kasko-wb/types'

// Aaron-Vorgabe: PKW/Transporter/LKW/Motorrad/Anhänger, Default PKW. Jeder grobe Typ mappt auf
// eine REPRÄSENTATIVE EU-Klasse — leads.fahrzeugklasse speichert eu_klasse, die Engine löst die
// reparatur_gruppe daraus auf (fahrzeugklassen-Tabelle). Der ZB1/Schein-OCR im /flow verfeinert später.
export type Fahrzeugtyp = 'pkw' | 'transporter' | 'lkw' | 'motorrad' | 'anhaenger'

export const FAHRZEUGTYP_OPTIONEN: { wert: Fahrzeugtyp; label: string; euKlasse: string }[] = [
  { wert: 'pkw', label: 'PKW', euKlasse: 'M1' },
  { wert: 'transporter', label: 'Transporter', euKlasse: 'N1' },
  { wert: 'lkw', label: 'LKW', euKlasse: 'N2' },
  { wert: 'motorrad', label: 'Motorrad', euKlasse: 'L3e' },
  { wert: 'anhaenger', label: 'Anhänger', euKlasse: 'O2' },
]

export function fahrzeugtypZuEuKlasse(typ: Fahrzeugtyp): string {
  return FAHRZEUGTYP_OPTIONEN.find((o) => o.wert === typ)?.euKlasse ?? 'M1'
}

// Datalist-Vorschläge fürs Hersteller-Feld (leads.fahrzeug_hersteller = freier Text; Liste ist Komfort).
export const HAEUFIGE_HERSTELLER = [
  'Audi', 'BMW', 'Mercedes-Benz', 'Volkswagen', 'Opel', 'Ford', 'Toyota', 'Škoda', 'Seat', 'Renault',
  'Peugeot', 'Citroën', 'Fiat', 'Volvo', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 'Honda', 'Suzuki',
  'Dacia', 'Mini', 'Tesla', 'Porsche', 'Cupra',
] as const

// F1 (Entry-Point-Audit 24.07.) + Unverschuldet-Option (Aaron 04.08.): Schuldfrage-/Abrechnungswahl
// im Werkstatt-Finder. DREI Wege: unverschuldet (Gegner haftet -> haftpflicht), Kasko (eigene VS),
// Selbstzahler. Der Kunde bestimmt damit das FlowLink-Szenario direkt. Vorher fehlte die Haftpflicht-
// Option -> ein unverschuldeter Kunde MUSSTE sich falsch als kasko/selbstzahler einordnen und verlor
// seinen Regulierungsanspruch (§ 249 BGB). Der Finder ist outbound (keine Provision) -> alle Wege
// korrekt erheben statt Haftpflicht wegzuleiten (Aaron: Kunden behalten > wegschicken).
export type Abrechnungswahl = 'haftpflicht' | 'kasko' | 'selbstzahler'

// Kasko-WB Phase 1: Antwort der Tariffrage im Wizard-State (Client rechnet die Ableitung nur fuer die UI;
// der Server leitet beim Speichern erneut ab — Trust-Boundary).
export type KaskoWbWahl = KaskoTarifAuswahl & WbErgebnis

export type WerkstattWizardState = {
  standort: { adresse: string; lat: number; lng: number } | null
  hersteller: string
  fahrzeugtyp: Fahrzeugtyp
  gewerbe: boolean
  modell: string
  bedarf: Reparaturbedarf | null
  abrechnung: Abrechnungswahl | null
  kaskoWb: KaskoWbWahl | null
}

export const WIZARD_INITIAL: WerkstattWizardState = {
  standort: null,
  hersteller: '',
  fahrzeugtyp: 'pkw',
  gewerbe: false,
  modell: '',
  bedarf: null,
  abrechnung: null,
  kaskoWb: null,
}

export type WizardStep = 'standort' | 'fahrzeug' | 'schaden' | 'abrechnung' | 'kontakt'
export const WIZARD_STEPS: WizardStep[] = ['standort', 'fahrzeug', 'schaden', 'abrechnung', 'kontakt']

// Pflicht-Gate pro Schritt (Spec §4): Standort Pflicht · Hersteller Pflicht (Typ/gewerbe haben
// Defaults, Modell optional) · Schaden Pflicht (eine Bedarfs-Quelle) · Kontakt = im Wizard validiert.
export function kannWeiter(step: WizardStep, s: WerkstattWizardState): boolean {
  switch (step) {
    case 'standort':
      return s.standort != null
    case 'fahrzeug':
      return s.hersteller.trim().length > 0
    case 'schaden':
      return s.bedarf != null && s.bedarf.kategorien.length > 0
    case 'abrechnung':
      return s.abrechnung != null && (s.abrechnung !== 'kasko' || s.kaskoWb != null)
    case 'kontakt':
      return true
  }
}

// Abrechnungswahl -> Lead-Felder (schuldfrage + eigene_versicherung, die das /flow-Szenario matchen):
//   haftpflicht (unverschuldet) -> schuldfrage='gegner' (eigene_versicherung irrelevant, der Gegner zahlt)
//   kasko/selbstzahler          -> schuldfrage='eigenverantwortung', getrennt per eigene_versicherung.
// Kasko/Selbstzahler BEIDE zusammen — eigenverantwortung OHNE eigene_versicherung wuerde im /flow-Quali
// still disqualifizieren (Spiegel erstelle-anfrage.ts:122); 'gegner' hat das Problem nicht (das
// haftpflicht-Szenario matcht ueber schuldfrage allein).
export function abrechnungZuLeadFelder(w: Abrechnungswahl): {
  schuldfrage: 'eigenverantwortung' | 'gegner'
  eigeneVersicherung: 'ja' | 'nein' | null
} {
  if (w === 'haftpflicht') return { schuldfrage: 'gegner', eigeneVersicherung: null }
  return { schuldfrage: 'eigenverantwortung', eigeneVersicherung: w === 'kasko' ? 'ja' : 'nein' }
}

// D1 (Aaron 27.07.): Der Umkreis-Cap (MAX_UMKREIS_KM) macht die leere Ergebnisliste zum
// legitimen Ergebnis. Der Wizard zeigt dann einen Hinweis statt stumm zu verschwinden —
// aber erst NACH einer abgeschlossenen Suche (kein Flackern im Debounce-/Ladefenster).
export function zeigeUmkreisLeerHinweis(s: {
  hatGesucht: boolean
  loading: boolean
  anzahlTreffer: number
}): boolean {
  return s.hatGesucht && !s.loading && s.anzahlTreffer === 0
}

// Manuelle Gewerke-Auswahl → Reparaturbedarf. confidence=70 (> HART_SCHWELLE 60): der Nutzer hat die
// Gewerke bewusst gewählt → hart auf passende Werkstätten filtern (Engine fällt bei 0 auf Geo-nächste zurück).
export function manuelleGewerkeZuBedarf(gewerke: Gewerk[]): Reparaturbedarf {
  const kategorien = gewerke.filter((g) => (GEWERKE as readonly string[]).includes(g))
  return { kategorien, quelle: 'manuell', confidence: kategorien.length ? 70 : 0 }
}

// Wizard-State → Eingabe für sucheEchteWerkstaetten (Task 2).
export function wizardStateZuSuche(s: WerkstattWizardState): {
  lat?: number
  lng?: number
  marke: string | null
  fahrzeugklasse: string | null
  bedarf?: Reparaturbedarf
} {
  return {
    lat: s.standort?.lat,
    lng: s.standort?.lng,
    marke: s.hersteller.trim() || null,
    fahrzeugklasse: fahrzeugtypZuEuKlasse(s.fahrzeugtyp),
    bedarf: s.bedarf ?? undefined,
  }
}
