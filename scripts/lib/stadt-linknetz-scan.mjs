// Pure Auswertung des Stadt-Link-Graphen. Kein IO, kein Netz — das Sammeln der
// Kanten macht scripts/check-stadt-linknetz.mjs.
//
// WARUM die Quellen getrennt gezaehlt werden (das ist der Kern dieser Datei):
// Der LandingFooter verlinkt von JEDER Seite der Site auf dieselben zehn
// Staedte, die Uebersicht /kfz-gutachter auf alle. Zaehlt man diese Kanten
// mit, hat jede Stadt zweistellig viele "eingehende Links", es gibt nie eine
// Waise, und die Kennzahl misst nur noch, dass es einen Footer gibt. Solche
// globalen Strips sagen ueber das THEMATISCHE Netz — welche Stadt verweist auf
// welche verwandte Stadt — nichts aus. Sie werden deshalb erfasst und
// ausgewiesen, aber aus Waisen-, Reziprozitaets- und Schnitt-Rechnung
// herausgehalten.

/** Quellen, die auf jeder Seite gleich sind und deshalb kein thematisches
 *  Signal tragen. Ueber die Option `globaleQuellen` ueberschreibbar. */
export const GLOBALE_QUELLEN = ['footer', 'uebersicht']

/**
 * Trennt ausgeliefertes HTML in Seiteninhalt und Site-Footer.
 *
 * Der Schnitt ist der Kern jeder Crawl-Messung: der LandingFooter verlinkt von
 * JEDER Seite dieselben zehn Staedte. Landen die im Inhalt, hat jede Stadt zehn
 * eingehende Links geschenkt und die Waisen-Zahl misst nur noch, dass es einen
 * Footer gibt.
 *
 * Geschnitten wird am LETZTEN `<footer`, nicht am ersten: `<footer>` innerhalb
 * `<blockquote>` ist korrektes HTML fuer eine Quellenangabe, und genau das
 * steht auf /kfz-gutachter/online-kfz-gutachten ("— sinngemaesse Kernaussage
 * des LG Bremen"). Am ersten Vorkommen abzuschneiden verwarf dort den halben
 * Seiteninhalt samt der acht Stadt-Verweise — die Seite meldete null, obwohl
 * sie korrekt gerendert war.
 *
 * `standorte` aktiviert die Reissleine gegen die Umkehrung dieses Fehlers:
 * stuende der Site-Footer VOR einem weiteren `<footer`, schnitte diese Funktion
 * zu spaet ab. Traegt der Footer-Teil die erwarteten Standorte nicht, ist die
 * Trennung nicht vertrauenswuerdig und der Aufrufer erfaehrt es, statt still
 * falsch zu zaehlen.
 *
 * @param {string} html
 * @param {readonly string[]} [standorte] Slugs, die im Site-Footer stehen MUESSEN.
 * @returns {{ inhalt: string, footer: string, unsicher: string | null }}
 */
export function teileAmSeitenFooter(html, standorte = []) {
  const i = html.lastIndexOf('<footer')
  if (i < 0) return { inhalt: html, footer: '', unsicher: 'kein <footer>-Element — Trennung unsicher' }

  const inhalt = html.slice(0, i)
  const footer = html.slice(i)
  if (standorte.length === 0) return { inhalt, footer, unsicher: null }

  const gefunden = standorte.filter((s) => footer.includes(`/kfz-gutachter/${s}"`)).length
  // Die Haelfte reicht: der Footer koennte legitim gekuerzt werden, aber ein
  // Zitat-Footer oder Nachwort traegt KEINEN dieser Slugs.
  if (gefunden * 2 < standorte.length) {
    return {
      inhalt,
      footer,
      unsicher: `hinter dem Schnitt stehen nur ${gefunden}/${standorte.length} Footer-Standorte — Trennung unsicher`,
    }
  }
  return { inhalt, footer, unsicher: null }
}

/**
 * @typedef {{ von: string, nach: string, quelle?: string, vonIstStadt?: boolean }} Kante
 */

/**
 * @param {{
 *   slugs: readonly string[],
 *   kanten: readonly Kante[],
 *   minEingehend?: number,
 *   globaleQuellen?: readonly string[],
 * }} eingabe
 */
export function analysiereLinknetz({
  slugs,
  kanten,
  minEingehend = 2,
  globaleQuellen = GLOBALE_QUELLEN,
}) {
  const seiten = new Set(slugs)
  const global = new Set(globaleQuellen)

  const toteLinks = []
  const jeQuelle = {}
  /** Menge "von>nach" aller thematischen Kanten — entdoppelt Mehrfachlieferungen. */
  const thematisch = new Set()
  /** slug -> Set der Quell-Slugs mit thematischer Kante darauf. */
  const eingehend = new Map(slugs.map((s) => [s, new Set()]))

  for (const kante of kanten) {
    const quelle = kante.quelle ?? 'nachbar'
    jeQuelle[quelle] = (jeQuelle[quelle] ?? 0) + 1

    // Ein totes Ziel ist EIN Befund. Es darf nicht zusaetzlich als fehlende
    // Rueckkante auftauchen — sonst zaehlt derselbe Fehler doppelt.
    if (!seiten.has(kante.nach)) {
      toteLinks.push({ von: kante.von, nach: kante.nach, quelle })
      continue
    }
    if (kante.von === kante.nach) continue
    if (global.has(quelle)) continue

    thematisch.add(`${kante.von}>${kante.nach}`)
    eingehend.get(kante.nach).add(kante.von)
  }

  const waisen = slugs.filter((s) => eingehend.get(s).size === 0).sort()

  const schwach = slugs
    .map((s) => ({ slug: s, eingehend: eingehend.get(s).size }))
    .filter((x) => x.eingehend < minEingehend)
    .sort((a, b) => a.eingehend - b.eingehend || a.slug.localeCompare(b.slug))

  // Reziprozitaet nur zwischen zwei Stadtseiten pruefen. Eine Kante von
  // /ratgeber auf eine Stadt kann per Definition keine Rueckkante haben —
  // sie als "einseitig" zu melden waere Rauschen.
  const einseitig = [...thematisch]
    .map((s) => {
      const [von, nach] = s.split('>')
      return { von, nach }
    })
    .filter(({ von, nach }) => seiten.has(von) && !thematisch.has(`${nach}>${von}`))
    .sort((a, b) => a.von.localeCompare(b.von) || a.nach.localeCompare(b.nach))

  const grade = slugs.map((s) => eingehend.get(s).size)

  return {
    toteLinks,
    waisen,
    einseitig,
    schwach,
    kennzahl: {
      staedte: slugs.length,
      thematischeKanten: thematisch.size,
      jeQuelle,
      eingehendMin: grade.length ? Math.min(...grade) : 0,
      eingehendMax: grade.length ? Math.max(...grade) : 0,
      eingehendSchnitt: grade.length ? grade.reduce((a, b) => a + b, 0) / grade.length : 0,
    },
  }
}
