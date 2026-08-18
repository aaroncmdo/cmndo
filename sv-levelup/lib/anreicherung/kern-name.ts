/**
 * Firmenname -> Kernbegriff fuer die Domain-Suche.
 *
 * ⚠ Das ist NICHT die DB-Spalte sv_leads.normalized_name. Die ist
 * GENERATED ALWAYS und macht nur lower() + Whitespace-Normalisierung
 * (geprueft 18.08.2026). Die aggressive Normalisierung, die CONTEXT §5
 * beschreibt — Umlaute auflaesen, Gattungswoerter entfernen — existiert in der
 * Datenbank nicht. Sie lebt ausschliesslich hier und wird NIE geschrieben.
 */

/**
 * Gattungs-, Rechtsform- und Bindewoerter. 'partner' und 'und' stehen bewusst
 * NICHT in der Streichliste: "Meyer und Partner" ist ein Eigenname, dessen
 * zweiter Teil zur Domain gehoert. 'und' wird separat als Bindewort entfernt.
 */
const GATTUNG = [
  'kfz', 'kraftfahrzeug', 'sachverstaendigenbuero', 'sachverstaendiger', 'sachverstaendige',
  'gutachter', 'gutachterbuero', 'ingenieurbuero', 'ingenieur', 'sv', 'svbuero', 'buero',
  'gmbh', 'ug', 'ag', 'kg', 'ohg', 'gbr', 'mbh', 'co',
]

const IMMER_STREICHEN = new Set(GATTUNG)

export function umlauteAuf(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
}

export function kernName(firma: string): string {
  return umlauteAuf(firma)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')      // &, ., ,, +, Klammern usw. raus
    .split(/[\s-]+/)
    .filter((w) => w.length > 1)         // einzelne Buchstaben tragen nichts
    .filter((w) => w !== 'und')          // Bindewort
    .filter((w) => !IMMER_STREICHEN.has(w))
    .join(' ')
    .trim()
}
