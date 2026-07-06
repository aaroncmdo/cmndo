export type Segment =
  | 'kleinwagen' | 'kompakt' | 'mittelklasse' | 'oberklasse' | 'suv' | 'transporter'

export const SEGMENTE: readonly Segment[] = [
  'kleinwagen', 'kompakt', 'mittelklasse', 'oberklasse', 'suv', 'transporter',
] as const

export const SEGMENT_LABEL: Record<Segment, string> = {
  kleinwagen: 'Kleinwagen',
  kompakt: 'Kompaktklasse',
  mittelklasse: 'Mittelklasse',
  oberklasse: 'Oberklasse',
  suv: 'SUV / Geländewagen',
  transporter: 'Transporter',
}

export type Schweregrad = 'leicht' | 'mittel' | 'schwer'

// Schuldfrage: steuert Framing + Positionen der Ersteinschaetzung (nicht die berechneten Betraege).
export type Schuldform = 'unverschuldet' | 'teilschuld' | 'selbst'

export const SCHULDFORMEN: readonly Schuldform[] = ['unverschuldet', 'teilschuld', 'selbst'] as const

export const SCHULD_LABEL: Record<Schuldform, string> = {
  unverschuldet: 'Die andere Person',
  teilschuld: 'Teils ich',
  selbst: 'Ich selbst',
}

export type VisionResult = {
  beschaedigte_teile: string[]
  schweregrad: Schweregrad
  segment: Segment
  geschaetzte_kosten_min: number
  geschaetzte_kosten_max: number
  wiederbeschaffungswert_min?: number | null
  wiederbeschaffungswert_max?: number | null
  restwert_min?: number | null
  restwert_max?: number | null
  beschreibung: string
}

export type AnspruchPositionTyp =
  | 'reparatur' | 'nutzungsausfall' | 'wertminderung'
  | 'gutachterkosten' | 'kostenpauschale' | 'abschleppkosten' | 'anwaltskosten'

export type AnspruchPosition = {
  typ: AnspruchPositionTyp
  label: string
  minEur: number | null
  maxEur: number | null
  hinweis?: string
  gedecktDurchGegner?: boolean
}

export type WbwHeuristikBand = {
  segment: Segment
  alterBisJahre: number
  wbwMinEur: number
  wbwMaxEur: number
  restwertFaktor: number
}

export type AnspruchWeg = {
  titel: string
  positionen: AnspruchPosition[]
  summeMinEur: number
  summeMaxEur: number
}

export type TotalschadenInfo = {
  wbwMinEur: number
  wbwMaxEur: number
  restwertMinEur: number
  restwertMaxEur: number
  reparaturWeg: AnspruchWeg | null   // null ab Zone C (>130%)
  totalschadenWeg: AnspruchWeg
  reparaturBis130Moeglich: boolean
  guenstiger: 'reparatur' | 'totalschaden'
  hinweisReparatur?: string
}

export type AnspruchSpanne = {
  positionen: AnspruchPosition[]
  gesamtMinEur: number
  gesamtMaxEur: number
  hinweise: string[]
  schuld: Schuldform
  totalschaden?: TotalschadenInfo
}

export type SchaetzInput = {
  reparaturMinEur: number
  reparaturMaxEur: number
  schweregrad: Schweregrad
  segment: Segment
  fahrbereit: boolean
  ezJahr: number | null
  aktuellesJahr: number
  schuld?: Schuldform
  wbwMinEur?: number | null
  wbwMaxEur?: number | null
  restwertMinEur?: number | null
  restwertMaxEur?: number | null
}

export type SegmentSatz = { tagessatzMinEur: number; tagessatzMaxEur: number }
export type WertminderungFaktor = { alterBisJahre: number; faktorMin: number; faktorMax: number }

export type AnspruchConfig = {
  kostenpauschaleEur: number
  wertminderungMinReparaturEur: number
  wertminderungMaxAlterJahre: number
  bagatelleSchwelleEur: number
  abschleppMinEur: number
  abschleppMaxEur: number
  dauerTage: Record<Schweregrad, { min: number; max: number }>
  totalschadenSchwelleProzent: number
  reparaturGrenzeProzent: number
  wiederbeschaffungsdauerTage: { min: number; max: number }
}
