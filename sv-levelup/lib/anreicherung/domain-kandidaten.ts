import { kernName, umlauteAuf } from './kern-name'

/**
 * Hoechstens 5 Domain-Kandidaten je Lead (F-15). Die Reihenfolge ist die
 * Wahrscheinlichkeit: direkte Domain zuerst, Praefix-Varianten danach, die
 * Ort-Variante zuletzt. Der Lauf probiert sie in dieser Reihenfolge und bricht
 * beim ersten belastbaren Treffer ab.
 *
 * Leerer Kern -> leere Liste. Wir raten NICHT (R-B): ein Lead, dessen Name nur
 * aus Gattungswoertern besteht ("Kfz-Sachverstaendigenbuero"), bekommt keine
 * Kandidaten und faellt mit Grund durch.
 */
export function domainKandidaten(firma: string, ort: string | null): string[] {
  const kern = kernName(firma)
  if (!kern) return []

  const teile = kern.split(' ')
  const erstes = teile[0]
  // Bei "Inh. Harald Lange" ist der Nachname das LETZTE Kernwort — am Bestand
  // der haeufigste Domain-Kern. Wer nur das erste nimmt, raet `harald.de`.
  const letztes = teile[teile.length - 1]
  const zusammen = teile.join('')
  const ortSlug = ort ? umlauteAuf(ort).toLowerCase().replace(/[^a-z0-9]/g, '') : null
  const mehrteilig = teile.length > 1

  const kandidaten = [
    `${erstes}.de`,
    `sv-${erstes}.de`,
    mehrteilig ? `${letztes}.de` : null,
    mehrteilig ? `sv-${letztes}.de` : null,
    mehrteilig ? `${zusammen}.de` : `kfz-gutachter-${erstes}.de`,
    ortSlug ? `${erstes}-${ortSlug}.de` : null,
  ].filter((d): d is string => d !== null)

  return [...new Set(kandidaten)].slice(0, 5)
}
