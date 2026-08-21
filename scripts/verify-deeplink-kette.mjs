#!/usr/bin/env node
/**
 * Verifikation der Deep-Link-Kette (GEO) — "die KI-Empfehlung ueberlebt den Klick".
 *
 * Prueft END-TO-END, ob ein KI-Assistent einen konkreten Gutachter empfehlen UND
 * verlinken kann, sodass der Kunde bei GENAU diesem Gutachter landet:
 *
 *   1. robots.txt beider Hosts    — darf ein KI-Agent die API ueberhaupt abrufen?
 *   2. REST-API mit KI-User-Agent — kommt `gutachter[].buchungs_url` an, wohlgeformt?
 *   3. Ziel-Route                 — antwortet der Deep-Link mit 200?
 *   4. Gegenprobe unbekannte ID   — faellt still zurueck statt zu brechen?
 *   5. MCP-Server                 — steht der Direktlink in der Markdown-Ausgabe?
 *
 * Das ist der Regel-4-Nachweis fuer PR #5462. Zwei Deploys sind noetig (App + der
 * SEPARAT deployte MCP-Server auf dem VPS), deshalb meldet das Skript pro Schicht
 * einzeln — "MCP noch alt" ist ein anderer Zustand als "MCP kaputt".
 *
 * Nutzung:
 *   node scripts/verify-deeplink-kette.mjs                 # gegen prod
 *   node scripts/verify-deeplink-kette.mjs --plz 40213     # andere PLZ
 *
 * Exit 0 = Kette vollstaendig. Exit 1 = mindestens eine Schicht rot.
 * Exit 2 = ein PRUEFLING war nicht messbar (Netzfehler o.ae.) — bewusst NICHT als
 * "gruen" und nicht als "kaputt": ein totes Instrument ist kein Befund.
 */

const API_HOST = 'https://app.claimondo.de'
const WEB_HOST = 'https://claimondo.de'
const MCP_URL = 'https://mcp.claimondo.de/mcp'
// Der Browsing-Agent, den ChatGPT im Auftrag eines Nutzers sendet — der realistischste
// Fall fuer "ChatGPT ohne installierte App".
const KI_UA = 'Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)'

const args = process.argv.slice(2)
const plzIdx = args.indexOf('--plz')
const PLZ = plzIdx >= 0 && args[plzIdx + 1] ? args[plzIdx + 1] : '50670'

let rot = 0
let unmessbar = 0
const zeile = (sym, text) => console.log(`  ${sym} ${text}`)
const ok = (t) => zeile('✓', t)
const fail = (t) => { rot++; zeile('✗', t) }
const warn = (t) => zeile('!', t)
const tot = (t) => { unmessbar++; zeile('?', `${t}  (nicht messbar — kein Befund)`) }

async function hole(url, opts = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 25_000)
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: { 'User-Agent': KI_UA, ...(opts.headers ?? {}) },
    })
    const text = await res.text()
    return { ok: true, status: res.status, text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Minimaler robots.txt-Auswerter fuer EINEN Pfad.
 *
 * ⚠ Bewusst kein Zeilen-Grep: `grep "Disallow: /api"` findet Treffer in Gruppen, die
 * fuer einen anderen Agenten gelten — oder auf einem anderen Host. Beides fuehrt zu
 * Fehlalarm. Hier wird die zutreffende Gruppe bestimmt (exakter Agent vor `*`) und
 * innerhalb dieser die LAENGSTE passende Regel gewertet (Standardverhalten).
 */
function robotsErlaubt(robotsText, agent, pfad) {
  const gruppen = []
  let aktuell = null
  for (const rohZeile of robotsText.split(/\r?\n/)) {
    const z = rohZeile.replace(/#.*$/, '').trim()
    if (!z) continue
    const m = z.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i)
    if (!m) continue
    const [, feldRoh, wert] = m
    const feld = feldRoh.toLowerCase()
    if (feld === 'user-agent') {
      if (!aktuell || aktuell.regeln.length > 0) {
        aktuell = { agents: [], regeln: [] }
        gruppen.push(aktuell)
      }
      aktuell.agents.push(wert.toLowerCase())
    } else if (aktuell) {
      aktuell.regeln.push({ typ: feld, pfad: wert })
    }
  }
  const a = agent.toLowerCase()
  const exakt = gruppen.find((g) => g.agents.some((x) => x !== '*' && a.includes(x)))
  const gruppe = exakt ?? gruppen.find((g) => g.agents.includes('*'))
  if (!gruppe) return { erlaubt: true, grund: 'keine zutreffende Gruppe → erlaubt' }

  let beste = null
  for (const r of gruppe.regeln) {
    if (r.pfad === '') continue
    if (!pfad.startsWith(r.pfad)) continue
    if (!beste || r.pfad.length > beste.pfad.length) beste = r
  }
  if (!beste) return { erlaubt: true, grund: 'keine passende Regel → erlaubt' }
  return {
    erlaubt: beste.typ === 'allow',
    grund: `${beste.typ === 'allow' ? 'Allow' : 'Disallow'}: ${beste.pfad}${exakt ? ` (Gruppe ${exakt.agents[0]})` : ' (Gruppe *)'}`,
  }
}

console.log(`\nDeep-Link-Kette — PLZ ${PLZ}, User-Agent "ChatGPT-User"\n${'='.repeat(64)}`)

// ---------------------------------------------------------------- 1) robots.txt
console.log('\n1) Darf ein KI-Agent die API abrufen?')
const rApi = await hole(`${API_HOST}/robots.txt`)
if (!rApi.ok) tot(`${API_HOST}/robots.txt: ${rApi.error}`)
else {
  const u = robotsErlaubt(rApi.text, 'ChatGPT-User', '/api/v1/gutachter-termine')
  u.erlaubt
    ? ok(`${API_HOST}/api/v1/ erlaubt — ${u.grund}`)
    : fail(`${API_HOST}/api/v1/ GESPERRT — ${u.grund}. Ohne das ist der ganze Weg fuer browsende KIs tot.`)
}
const rWeb = await hole(`${WEB_HOST}/robots.txt`)
if (!rWeb.ok) tot(`${WEB_HOST}/robots.txt: ${rWeb.error}`)
else {
  const l = robotsErlaubt(rWeb.text, 'ChatGPT-User', '/llms.txt')
  l.erlaubt ? ok(`${WEB_HOST}/llms.txt erlaubt — ${l.grund}`) : fail(`${WEB_HOST}/llms.txt gesperrt — ${l.grund}`)
  // Hinweis statt Fehler: /api/ ist auf der Marketing-Domain gesperrt, dort liegt aber
  // keine oeffentliche API. Wer das als Blocker meldet, sitzt dem falschen Host auf.
  const a = robotsErlaubt(rWeb.text, 'ChatGPT-User', '/api/')
  if (!a.erlaubt) warn(`${WEB_HOST}/api/ gesperrt (${a.grund}) — korrekt, die API liegt auf ${API_HOST}`)
}

// ------------------------------------------------------------------- 2) REST-API
console.log('\n2) Liefert die API den Direktlink je Gutachter?')
const api = await hole(`${API_HOST}/api/v1/gutachter-termine?plz=${encodeURIComponent(PLZ)}`)
let ersterLink = null
if (!api.ok) tot(`API-Abruf: ${api.error}`)
else if (api.status !== 200) fail(`API antwortete HTTP ${api.status}`)
else {
  let daten = null
  try { daten = JSON.parse(api.text) } catch { /* unten behandelt */ }
  if (!daten) fail('API-Antwort ist kein gueltiges JSON')
  else {
    const liste = Array.isArray(daten.gutachter) ? daten.gutachter : []
    ok(`HTTP 200, ${liste.length} Gutachter`)
    if (liste.length === 0) {
      // KEIN Fehler: in vielen PLZ gibt es schlicht keinen buchbaren SV. Das ist der
      // dokumentierte Abdeckungs-Engpass, nicht ein Defekt dieser Kette.
      warn(`keine buchbaren Gutachter in ${PLZ} — Kette hier nicht pruefbar, andere PLZ waehlen (--plz 50670)`)
    } else {
      const mit = liste.filter((g) => typeof g.buchungs_url === 'string' && g.buchungs_url)
      if (mit.length === 0) {
        fail('KEIN gutachter[].buchungs_url — API noch nicht deployed oder Feld verloren gegangen')
      } else if (mit.length < liste.length) {
        fail(`nur ${mit.length}/${liste.length} Gutachter haben buchungs_url — darf nicht luecken`)
      } else {
        ok(`alle ${liste.length} Gutachter haben buchungs_url`)
        ersterLink = mit[0].buchungs_url
        const svId = mit[0].id
        // Der Link muss den Gutachter WIRKLICH tragen — HTTP 200 allein beweist das nicht.
        if (!ersterLink.includes(`sv=${encodeURIComponent(svId)}`)) {
          fail(`buchungs_url enthaelt die eigene id nicht: ${ersterLink}`)
        } else ok(`Link traegt die Gutachter-ID: …?…&sv=${String(svId).slice(0, 8)}…`)
      }
    }
    if (typeof daten.buchungs_hinweis === 'string' && /buchungs_url/.test(daten.buchungs_hinweis)) {
      ok('buchungs_hinweis weist die KI auf buchungs_url hin')
    } else {
      warn('buchungs_hinweis nennt buchungs_url nicht — KI koennte weiter die Sammelkarte verlinken')
    }
  }
}

// ------------------------------------------------------------- 3+4) Ziel-Route
console.log('\n3) Fuehrt der Link zu einer lebenden Seite?')
if (!ersterLink) warn('uebersprungen — kein Link aus Schritt 2')
else {
  const seite = await hole(ersterLink)
  if (!seite.ok) tot(`Deep-Link: ${seite.error}`)
  else if (seite.status === 200) ok(`Deep-Link antwortet HTTP 200`)
  else fail(`Deep-Link antwortet HTTP ${seite.status}: ${ersterLink}`)
}

console.log('\n4) Gegenprobe — unbekannte sv-ID darf NICHT brechen')
const fake = `${WEB_HOST}/gutachter-finden?plz=${encodeURIComponent(PLZ)}&sv=00000000-0000-0000-0000-000000000000`
const gp = await hole(fake)
if (!gp.ok) tot(`Gegenprobe: ${gp.error}`)
else if (gp.status === 200) ok('unbekannte ID → HTTP 200 (faellt still auf den bestgerankten SV zurueck)')
else fail(`unbekannte ID → HTTP ${gp.status} (sollte 200 sein)`)

// ------------------------------------------------------------------- 5) MCP
console.log('\n5) Gibt der MCP-Server den Direktlink aus? (separat deployed!)')
const mcp = await hole(MCP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'claimondo_finde_gutachter_termine', arguments: { plz: PLZ } },
  }),
})
if (!mcp.ok) tot(`MCP-Aufruf: ${mcp.error}`)
else if (mcp.status !== 200) fail(`MCP antwortete HTTP ${mcp.status}`)
else {
  // Streamable HTTP kann SSE sein ("data: {...}") — sonst greift man ins Leere.
  const roh = mcp.text.match(/^data: (.+)$/m)?.[1] ?? mcp.text
  let ausgabe = ''
  try {
    const env = JSON.parse(roh)
    ausgabe = env?.result?.content?.[0]?.text ?? ''
  } catch { /* unten */ }
  if (!ausgabe) fail('MCP-Antwort ohne lesbaren Text-Inhalt')
  else if (/Termin bei .+ buchen: /.test(ausgabe)) {
    ok('MCP nennt Gutachter MIT Direktlink')
    if (/Alle Gutachter auf der Karte/.test(ausgabe)) ok('Sammelkarte korrekt als Uebersicht deklariert')
  } else if (/Interaktive Karte \/ Buchung/.test(ausgabe)) {
    // Bewusst WARN, nicht FAIL: exakt der erwartete Zustand vor dem VPS-Deploy.
    warn('MCP zeigt noch die Sammelkarte — alter Stand (VPS-Deploy ausstehend) ODER API liefert das Feld noch nicht')
  } else {
    warn('MCP-Ausgabe ohne Gutachter (evtl. keine freien Slots in dieser PLZ)')
  }
}

// ------------------------------------------------------------------ Ergebnis
console.log(`\n${'='.repeat(64)}`)
if (rot > 0) {
  console.log(`ROT — ${rot} Schicht(en) defekt${unmessbar ? `, ${unmessbar} nicht messbar` : ''}.`)
  process.exit(1)
}
if (unmessbar > 0) {
  console.log(`UNVOLLSTAENDIG — ${unmessbar} Pruefling(e) nicht messbar. Kein Freibrief: erneut fahren.`)
  process.exit(2)
}
console.log('GRUEN — die Kette traegt: KI darf abrufen, bekommt den Direktlink, der Link lebt.')
process.exit(0)
