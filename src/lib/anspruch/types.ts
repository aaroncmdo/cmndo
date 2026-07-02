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

export type VisionResult = {
  beschaedigte_teile: string[]
  schweregrad: Schweregrad
  segment: Segment
  geschaetzte_kosten_min: number
  geschaetzte_kosten_max: number
  beschreibung: string
}

export type AnspruchPositionTyp =
  | 'reparatur' | 'nutzungsausfall' | 'wertminderung'
  | 'gutachterkosten' | 'kostenpauschale' | 'abschleppkosten'

export type AnspruchPosition = {
  typ: AnspruchPositionTyp
  label: string
  minEur: number | null
  maxEur: number | null
  hinweis?: string
  gedecktDurchGegner?: boolean
}

export type AnspruchSpanne = {
  positionen: AnspruchPosition[]
  gesamtMinEur: number
  gesamtMaxEur: number
  hinweise: string[]
}

export type SchaetzInput = {
  reparaturMinEur: number
  reparaturMaxEur: number
  schweregrad: Schweregrad
  segment: Segment
  fahrbereit: boolean
  ezJahr: number | null
  aktuellesJahr: number
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
}
