// Typ-Taxonomie fuer die Termine-Hub-View (Kunde + Flotte). Rein, ohne JSX.

export type TerminTyp =
  | 'besichtigung'
  | 'nachbesichtigung'
  | 'reparatur'
  | 'beratung'
  | 'konfrontation'

/** i18n-Label-Key (unter kunde.termine.typ.*) + Icon-Key (aufgeloest in TerminTypBadge). */
export const TERMIN_TYP_META: Record<
  TerminTyp,
  { labelKey: string; icon: 'hardhat' | 'search' | 'wrench' | 'video' | 'users' }
> = {
  besichtigung: { labelKey: 'typ.besichtigung', icon: 'hardhat' },
  nachbesichtigung: { labelKey: 'typ.nachbesichtigung', icon: 'search' },
  reparatur: { labelKey: 'typ.reparatur', icon: 'wrench' },
  beratung: { labelKey: 'typ.beratung', icon: 'video' },
  konfrontation: { labelKey: 'typ.konfrontation', icon: 'users' },
}

/** Basis-Typ aus gutachter_termine.typ (ohne Nachbesichtigung — die ist synthetisch). */
export function basisTypVonGutachterTermin(
  typ: string | null,
): 'besichtigung' | 'beratung' | 'konfrontation' {
  if (typ === 'kb_beratung') return 'beratung'
  if (typ === 'konfrontation') return 'konfrontation'
  return 'besichtigung'
}
