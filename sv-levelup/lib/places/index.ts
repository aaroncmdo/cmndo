import { erzeugeLegacy } from './legacy'
import { erzeugeNeu } from './neu'
import type { AdapterOpts, PlacesAdapter } from './adapter'

export { PlacesFehler } from './adapter'
export type { Betrieb, PlacesAdapter, Profil, Umkreis } from './adapter'

/**
 * Der EINZIGE Schaltpunkt zwischen Legacy und New.
 *
 * Default ist `legacy`, weil nur die mit dem heutigen Key laeuft. Nach A-1
 * genuegt `LEVELUP_PLACES_API=neu` in der ENV — kein Modul aendert sich.
 */
export function holeAdapter(opts: AdapterOpts = {}): PlacesAdapter {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY fehlt')

  return process.env.LEVELUP_PLACES_API === 'neu'
    ? erzeugeNeu(key, opts)
    : erzeugeLegacy(key, opts)
}
