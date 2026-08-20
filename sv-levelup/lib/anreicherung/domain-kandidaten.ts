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

  /**
   * ⚠ Eine Domain, die GENAU dem Ort des Leads entspricht, gehoert praktisch
   * immer der STADT.
   *
   * Am 20.08. an echten Daten gefunden: „Kfz Gutachter Herne / Ingenieurbüro
   * für Fahrzeugtechnik" ergab `herne.de` — die Website der Stadt Herne. Der
   * Lead bekam daraus E-Mail und Telefon der Stadtverwaltung, und zwar mit
   * Zuordnungssicherheit **90**: die Stadtseite nennt naturgemaess „Herne" und
   * die Postleitzahl 44623, genau wie der Lead. Die Pruefung konnte den
   * Unterschied nicht sehen — sie sucht ja Firmenname und PLZ, und beides
   * stand da. Dieselbe Falle bei „… Jürgen Schmidt Werne" → `werne.de`.
   *
   * Betroffen ist nur die BLANKE Form. `sv-herne.de` oder
   * `kfz-gutachter-herne.de` gehoeren plausibel einem Buero in Herne und
   * bleiben Kandidaten.
   */
  const istOrt = (wort: string) =>
    ortSlug !== null && umlauteAuf(wort).toLowerCase().replace(/[^a-z0-9]/g, '') === ortSlug

  const blank = (wort: string) => (istOrt(wort) ? null : `${wort}.de`)

  const kandidaten = [
    blank(erstes),
    `sv-${erstes}.de`,
    mehrteilig ? blank(letztes) : null,
    mehrteilig ? `sv-${letztes}.de` : null,
    mehrteilig ? blank(zusammen) : `kfz-gutachter-${erstes}.de`,
    // `herne-herne.de` waere Unsinn — es entstand, wenn der Kern selbst der Ort ist.
    ortSlug && !istOrt(erstes) ? `${erstes}-${ortSlug}.de` : null,
  ].filter((d): d is string => d !== null)

  return [...new Set(kandidaten)].slice(0, 5)
}
