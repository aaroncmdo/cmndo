export type RobotsRegeln = { regeln: { pfad: string; erlaubt: boolean }[] }

/**
 * Minimaler robots.txt-Parser fuer genau unseren Zweck (R-G): wir pruefen vier
 * bekannte Pfade gegen die Gruppe fuer `*` bzw. den uebergebenen Agenten.
 *
 * Bewusst kein Paket: dreissig Zeilen Logik rechtfertigen keine zusaetzliche
 * Abhaengigkeit im Crawl-Pfad.
 */
export function parseRobots(txt: string, agent = '*'): RobotsRegeln {
  const regeln: { pfad: string; erlaubt: boolean }[] = []
  let inGruppe = false

  for (const rohzeile of txt.split(/\r?\n/)) {
    const zeile = rohzeile.replace(/#.*$/, '').trim()
    if (!zeile) continue

    const trenner = zeile.indexOf(':')
    if (trenner === -1) continue
    const schluessel = zeile.slice(0, trenner).trim().toLowerCase()
    const wert = zeile.slice(trenner + 1).trim()

    if (schluessel === 'user-agent') {
      inGruppe = wert === '*' || wert.toLowerCase() === agent.toLowerCase()
      continue
    }
    if (!inGruppe) continue
    if (schluessel === 'disallow' && wert) regeln.push({ pfad: wert, erlaubt: false })
    if (schluessel === 'allow' && wert) regeln.push({ pfad: wert, erlaubt: true })
  }
  return { regeln }
}

/**
 * Laengste passende Regel gewinnt — so loest auch Google den Konflikt zwischen
 * `Disallow: /` und `Allow: /impressum`. Ohne passende Regel gilt: erlaubt.
 */
export function istErlaubt(regeln: RobotsRegeln, pfad: string): boolean {
  let treffer: { pfad: string; erlaubt: boolean } | null = null
  for (const r of regeln.regeln) {
    if (!pfad.startsWith(r.pfad)) continue
    if (!treffer || r.pfad.length > treffer.pfad.length) treffer = r
  }
  return treffer ? treffer.erlaubt : true
}
