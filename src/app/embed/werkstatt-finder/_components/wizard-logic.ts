// Pure Logik für den Werkstatt-Finder-Wizard (Phase 2). Kein React — testbar isoliert.
import type { Gewerk, Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import { GEWERKE } from '@/lib/werkstatt/bedarf/types'

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

export type WerkstattWizardState = {
  standort: { adresse: string; lat: number; lng: number } | null
  hersteller: string
  fahrzeugtyp: Fahrzeugtyp
  gewerbe: boolean
  modell: string
  bedarf: Reparaturbedarf | null
}

export const WIZARD_INITIAL: WerkstattWizardState = {
  standort: null,
  hersteller: '',
  fahrzeugtyp: 'pkw',
  gewerbe: false,
  modell: '',
  bedarf: null,
}

export type WizardStep = 'standort' | 'fahrzeug' | 'schaden' | 'kontakt'
export const WIZARD_STEPS: WizardStep[] = ['standort', 'fahrzeug', 'schaden', 'kontakt']

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
    case 'kontakt':
      return true
  }
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
