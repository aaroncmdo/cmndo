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
 * Gruppentreue Auswertung fuer EINEN benannten Agenten.
 *
 * ⚠ WARUM NICHT `parseRobots(txt, agent)`: die Funktion oben fuehrt die
 * `*`-Gruppe und die Agenten-Gruppe ZUSAMMEN (`wert === '*' || wert === agent`).
 * Nach der robots-Spezifikation gilt aber die spezifischste zutreffende Gruppe
 * ALLEIN; `*` greift nur, wenn es keine eigene Gruppe gibt. Der Unterschied ist
 * kein Detail — bei
 *
 *     User-agent: *          User-agent: GPTBot
 *     Allow: /               Disallow: /
 *
 * meldet die Zusammenfuehrung „GPTBot darf" und kehrt die Aussage damit um.
 * Genau diese Sperrform ist die verbreitetste; ein Pruefwerkzeug, das sie
 * uebersieht, meldet flaechendeckend Zugang, wo keiner ist.
 *
 * `parseRobots` bleibt unveraendert: produktiv wird es nur mit `*` aufgerufen,
 * und dort ist das Verhalten korrekt.
 */
export function istAgentErlaubt(txt: string, agent: string, pfad = '/'): boolean {
  const gruppen = parseGruppen(txt)
  const gesucht = agent.toLowerCase()

  const eigene = gruppen.filter((g) => g.agenten.includes(gesucht))
  const zutreffend = eigene.length > 0
    ? eigene
    : gruppen.filter((g) => g.agenten.includes('*'))

  // Keine Gruppe trifft zu → keine Einschraenkung.
  if (zutreffend.length === 0) return true
  return istErlaubt({ regeln: zutreffend.flatMap((g) => g.regeln) }, pfad)
}

type Gruppe = { agenten: string[]; regeln: { pfad: string; erlaubt: boolean }[] }

/**
 * Zerlegt robots.txt in Gruppen.
 *
 * ⚠ Mehrere `User-agent`-Zeilen DIREKT hintereinander gehoeren zur selben
 * Gruppe — die Regeln darunter gelten fuer alle davon. Wer je Zeile eine neue
 * Gruppe aufmacht, ordnet die Regeln nur dem letzten Agenten zu.
 */
function parseGruppen(txt: string): Gruppe[] {
  const gruppen: Gruppe[] = []
  let aktuell: Gruppe | null = null
  let zuletztAgent = false

  for (const rohzeile of txt.split(/\r?\n/)) {
    const zeile = rohzeile.replace(/#.*$/, '').trim()
    if (!zeile) continue

    const trenner = zeile.indexOf(':')
    if (trenner === -1) continue
    const schluessel = zeile.slice(0, trenner).trim().toLowerCase()
    const wert = zeile.slice(trenner + 1).trim()

    if (schluessel === 'user-agent') {
      if (!aktuell || !zuletztAgent) {
        aktuell = { agenten: [], regeln: [] }
        gruppen.push(aktuell)
      }
      aktuell.agenten.push(wert.toLowerCase())
      zuletztAgent = true
      continue
    }

    zuletztAgent = false
    if (!aktuell) continue
    // ⚠ Leeres `Disallow:` heisst „alles erlaubt" und darf KEINE Regel werden —
    // sonst sperrte ein `Disallow:` (ohne Pfad) die ganze Domain.
    if (schluessel === 'disallow' && wert) aktuell.regeln.push({ pfad: wert, erlaubt: false })
    if (schluessel === 'allow' && wert) aktuell.regeln.push({ pfad: wert, erlaubt: true })
  }
  return gruppen
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
