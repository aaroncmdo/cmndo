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
