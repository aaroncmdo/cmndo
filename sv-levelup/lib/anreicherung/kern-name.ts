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
  'kfz', 'kraftfahrzeug', 'kraftfahrzeugtechnik', 'fahrzeugtechnik', 'fahrzeugbewertung',
  'sachverstaendigenbuero', 'sachverstaendiger', 'sachverstaendige', 'sachverstaendigen',
  'gutachter', 'gutachterbuero', 'gutachten', 'schadengutachten', 'pruefstelle',
  'ingenieurbuero', 'ingenieur', 'sv', 'svbuero', 'buero',
  'gmbh', 'ug', 'ag', 'kg', 'ohg', 'gbr', 'mbh', 'co',
]

/**
 * Titel, Abkuerzungen und Fuellwoerter. Sie stehen bewusst NEBEN der
 * Gattungsliste: es sind keine Taetigkeitsbegriffe, aber als Domain-Kern
 * genauso unbrauchbar.
 *
 * ⚠ Am Bestand gemessen (18.08.): ohne 'ing' ergab "Ing.-Büro Urbach KG" den
 * Kandidaten `sv-ing.de` — eine fremde Firma, deren Impressum eine fremde
 * Telefonnummer lieferte. Ohne 'inh' entstand `inh.de`.
 */
const TITEL_UND_FUELLWOERTER = [
  'ing', 'inh', 'dipl', 'dr', 'prof', 'kfm',
  'fuer', 'der', 'die', 'das', 'den', 'dem', 'von', 'vom', 'am', 'im', 'zur', 'zum',
]

const IMMER_STREICHEN = new Set([...GATTUNG, ...TITEL_UND_FUELLWOERTER])

export function umlauteAuf(s: string): string {
  return s
    // NFKC zuerst: Betriebe fuehren ihren Namen als Auffaelligkeits-Trick in
    // Unicode-Schmuckschrift ("𝗞𝗙𝗭 𝗦𝗮𝗰𝗵𝘃𝗲𝗿𝘀𝘁ä𝗻𝗱𝗶𝗴𝗲𝗻𝗯ü𝗿𝗼"), am echten Places-Lauf
    // gefunden (18.08.). Ohne das filtert die a-z-Regel unten alles weg und der
    // Kern wird zu Muell ("ae ue") statt zum Namen.
    //
    // NFKC, nicht NFKD: beide zerlegen Kompatibilitaetszeichen, aber nur NFKC
    // setzt danach wieder zusammen. Unter NFKD zerfiele "ü" in u + Trema, und
    // die Ersetzung unten faende kein "ü" mehr — aus "Müller" wuerde "Muller".
    .normalize('NFKC')
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
