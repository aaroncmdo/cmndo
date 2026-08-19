import type { MessRegistry } from '../modul-vertrag'
import { messeGbp } from './gbp'
import { messeWeb } from './web'
import { messeWett } from './wett'

export { messeGbp } from './gbp'
export { messeWeb } from './web'
export { messeWett } from './wett'

/**
 * Die Module, die es gibt — an einer Stelle.
 *
 * Was hier fehlt, ist keine Luecke im Code: die Messmaschine macht aus einem
 * Modul ohne Messfunktion eine Fehlstelle mit Grund („wird noch nicht
 * gemessen"), nie null Punkte (R-B).
 *
 * ⚠ `gbp` und `wett` brauchen den Firmennamen: ohne ihn finden sie den eigenen
 * Eintrag in der Kartensuche nicht und weisen das als Fehlstelle aus, statt
 * einen falschen Rang zu behaupten. Deshalb ist die Registry eine FUNKTION
 * des Firmennamens, kein festes Objekt — sonst muesste jeder Aufrufer daran
 * denken, ihn durchzureichen, und wer es vergisst, bekommt stillschweigend
 * einen blinden Befund (genau das ist am 19.08. passiert: `wett` meldete
 * 0 von 18 Punkten, weil das Einstiegsformular den Namen nie abfragte).
 */
export function baueModulRegistry(firmenname: string | null): MessRegistry {
  return {
    gbp: (k) => messeGbp({ ...k, firmenname }),
    web: messeWeb,
    wett: (k) => messeWett({ ...k, firmenname }),
  }
}
