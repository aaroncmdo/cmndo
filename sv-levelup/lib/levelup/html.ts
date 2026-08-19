/**
 * Rohes HTML lesen, ohne einen Browser zu starten.
 *
 * Bewusst mit regulaeren Ausdruecken statt mit einem Parser: die Module lesen
 * je Seite fuenf bis zehn Stellen, und ein Parser im Messpfad waere eine
 * weitere Abhaengigkeit, die bei kaputtem Fremd-HTML wirft. Was hier nicht
 * gefunden wird, ist „nicht feststellbar" (R-B) — nie „fehlt".
 *
 * Herausgeloest aus `module/web.ts`, weil `seo` und `ux` dieselbe Erkennung
 * brauchen. Zwei Kopien von `istClientseitig` waeren zwei Gelegenheiten, den
 * Schutz zu verlieren, der einem Betrieb faelschlich einen abmahnfaehigen
 * Verstoss vorwirft.
 */

const ENTITIES: Record<string, string> = {
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  ndash: '–', mdash: '—', euro: '€', hellip: '…',
}

export function deuteEntities(s: string): string {
  return s
    .replace(/&([a-zA-Z]+);/g, (ganz, name: string) => ENTITIES[name] ?? ganz)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
}

/** Was ein Leser saehe — ohne Skripte, Formatvorlagen und Auszeichnung. */
export function sichtbarerText(html: string): string {
  return deuteEntities(
    html
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

/**
 * Der Textinhalt jedes Vorkommens eines Elements.
 *
 * ⚠ `\\b` hinter dem Namen ist Pflicht: ohne die Wortgrenze faende `head`
 * auch `<header>`.
 */
export function textIn(html: string, tag: string): string[] {
  const treffer = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi'))]
  return treffer.map((t) => sichtbarerText(t[1])).filter((s) => s.length > 0)
}

/** Ein Attributwert aus jedem Vorkommen eines Elements, das ihn traegt. */
export function attribut(html: string, tag: string, name: string): string[] {
  const treffer = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))]
  const werte: string[] = []
  for (const t of treffer) {
    const m = t[0].match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
    if (m) werte.push(deuteEntities(m[1]))
  }
  return werte
}

/**
 * Der `content` eines `<meta>`-Elements mit bestimmtem `name` (oder `property`).
 *
 * ⚠ NICHT ueber zwei `attribut()`-Listen und deren Listenplatz zusammenfuehren:
 * die Listen enthalten nur Elemente, die das jeweilige Attribut TRAGEN. Ein
 * `<meta charset="utf-8">` dazwischen verschiebt die eine Liste gegen die
 * andere, und die Beschreibung waere pltzlich der Wert eines fremden
 * Elements. Deshalb wird jedes Element als Ganzes gelesen.
 */
export function metaInhalt(html: string, name: string): string | null {
  for (const t of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = t[0]
    const n = tag.match(/\b(?:name|property)\s*=\s*["']([^"']*)["']/i)?.[1]
    if (!n || n.toLowerCase() !== name.toLowerCase()) continue
    const c = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]
    if (c !== undefined) return deuteEntities(c)
  }
  return null
}

/**
 * Der Anfang eines Rumpfs, gemessen an SICHTBAREM Text statt an Markup.
 *
 * ⚠ Am echten Bestand gefunden (19.08.): Ein fester Ausschnitt von 2500
 * Zeichen misst nicht „oben auf der Seite", sondern „in den ersten 2500 Byte
 * Auszeichnung" — und das ist bei Baukasten-Seiten etwas voellig anderes.
 * `kfz-sachverstaendigenbuero-stanoksei.de` liefert 1 MB HTML; in den ersten
 * 2500 Rumpf-Zeichen stehen 50 Zeichen sichtbarer Text (der Rest ist
 * eingebettetes CSS). Die Telefonnummer steht bei 1 % der Seite — also ganz
 * oben — und waere trotzdem als „erst weiter unten" gemeldet worden.
 *
 * Das Fenster verdoppelt sich, bis genug sichtbarer Text zusammenkommt —
 * logarithmisch viele Durchlaeufe statt eines je Schritt.
 *
 * ⚠ Der Startwert muss KLEIN sein. Mit 4000 galten bei einer 4200 Zeichen
 * langen Seite 95 % als „oben", und eine Nummer im Fussbereich waere als
 * „oben sichtbar" durchgegangen. Und ⚠ keine kuenstliche Obergrenze: bleibt
 * eine Seite auch nach dem ganzen Rumpf unter der Textmenge, ist sie so
 * textarm, dass `istClientseitig` sie ohnehin von der Messung ausnimmt.
 */
export function obererBereich(rumpf: string, textZeichen: number): string {
  let ende = Math.min(1000, rumpf.length)
  while (ende < rumpf.length && sichtbarerText(rumpf.slice(0, ende)).length < textZeichen) {
    ende = Math.min(rumpf.length, ende * 2)
  }
  return rumpf.slice(0, ende)
}

/** Unter beiden Schwellen zugleich liefert eine Seite ihren Inhalt nicht serverseitig. */
const MIN_TEXT_BYTES = 500
const MIN_TEXT_ANTEIL = 0.03

/**
 * Erkennt Seiten, die ihren Inhalt erst im Browser aufbauen.
 *
 * ⚠ Der schaedlichste Fehler, den dieses Produkt machen kann, haengt an dieser
 * Funktion. Am echten Bestand gemessen (18.08.): Der Befund warf
 * `gutachter-yigit.com` fehlendes Impressum UND fehlende
 * Datenschutzerklaerung vor — beides abmahnfaehig. Die Seite ist eine
 * React-Anwendung; im ausgelieferten HTML steht kein einziger Link, im
 * Browser stehen beide da.
 *
 *   gutachter-yigit.com   13.145 B HTML,    53 B Text = 0,4 %   → Anwendung
 *   sv-bergk.de           10.493 B HTML, 3.136 B Text = 29,9 %  → serverseitig
 *
 * BEIDE Schwellen muessen zutreffen: eine knappe, aber echt ausgelieferte
 * Seite hat wenig Text UND einen hohen Anteil — sie darf nicht als Anwendung
 * gelten.
 */
export function istClientseitig(html: string): boolean {
  if (html.length === 0) return false
  const text = sichtbarerText(html)
  return text.length < MIN_TEXT_BYTES && text.length / html.length < MIN_TEXT_ANTEIL
}
