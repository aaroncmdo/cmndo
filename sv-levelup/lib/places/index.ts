import { erzeugeLegacy } from './legacy'
import { erzeugeNeu } from './neu'
import { erzeugeZaehler, mitBudget, VORGABE_BUDGET, type Zaehler } from './budget'
import type { AdapterOpts, PlacesAdapter } from './adapter'

export { PlacesFehler } from './adapter'
export type { Betrieb, PlacesAdapter, Profil, Umkreis } from './adapter'
export {
  BudgetErschoepft,
  erzeugeZaehler,
  schaetzeKosten,
  GRATIS_JE_MONAT,
  PREIS_JE_1000,
  VORGABE_BUDGET,
  type Zaehler,
} from './budget'

/**
 * Der EINZIGE Schaltpunkt zwischen Legacy und New.
 *
 * Default ist `legacy`, weil nur die mit dem heutigen Key laeuft. Nach A-1
 * genuegt `LEVELUP_PLACES_API=neu` in der ENV — kein Modul aendert sich.
 *
 * ⚠ SEIT DEM 21.08. IMMER MIT BUDGET. Wer keinen Zaehler uebergibt, bekommt
 * einen mit dem Vorgabewert (1.000 Abrufe, unter Googles Gratis-Kontingent).
 * Das ist Absicht: Der Lauf, der 2.798 EUR kostete, war ein Lauf, den niemand
 * begrenzt hatte — weil man nichts begrenzen MUSSTE. Ein Vorgabewert, den man
 * bewusst anheben muss, kehrt die Richtung um.
 */
export function holeAdapter(opts: AdapterOpts & { budget?: number } = {}): PlacesAdapter {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY fehlt')

  const zaehler: Zaehler =
    (opts.zaehler as Zaehler | undefined) ?? erzeugeZaehler(opts.budget ?? VORGABE_BUDGET)

  const roh =
    process.env.LEVELUP_PLACES_API === 'neu'
      ? erzeugeNeu(key, { ...opts, zaehler })
      : erzeugeLegacy(key, { ...opts, zaehler })

  // Zwei Schranken, mit Absicht: der Zaehler IM Adapter faengt jeden HTTP-Abruf
  // (inkl. Paging + Wiederholung), diese hier faengt auch einen kuenftigen
  // Adapter, der den Zaehler nicht durchreicht.
  return mitBudget(roh, zaehler)
}
