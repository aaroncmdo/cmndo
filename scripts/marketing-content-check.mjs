// Inhalts-Audit der Hauptseite: prüfen ob die 3 neuen Sections rendern
// und ob alle erwarteten Marker (BGH-Aktenzeichen, Versicherer-Namen,
// 7-Fehler-Nummerierung) im DOM ankommen.
import { chromium } from 'playwright'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3002'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 })

// Body innerText laden
const text = await page.evaluate(() => document.body.innerText)

const CHECKS = [
  // BghAuthoritySection
  ['BGH-Section Headline', '8 BGH-Urteile, die für Sie sprechen'],
  ['BGH VI ZR 38/22', 'VI ZR 38/22'],
  ['BGH VI ZR 65/18', 'VI ZR 65/18'],
  ['BGH VI ZR 174/24', 'VI ZR 174/24'],
  ['BGH Werkstattrisiko', 'Werkstattrisiko'],
  ['BGH UPE-Aufschläge', 'UPE-Aufschläge'],
  ['BGH 130%-Regel', '130%-Regel'],

  // VersichererTaktikenSection
  ['Versicherer Headline', 'Versicherer-Taktiken — und wie wir sie kontern'],
  ['ControlExpert', 'ControlExpert'],
  ['K-Expert', 'K-Expert'],
  ['DEKRA', 'DEKRA'],
  ['HUK', 'HUK'],
  ['33 % Anspruch', '33 % ihres Anspruchs'],

  // SiebenFehlerSection
  ['7-Fehler Headline', '7 Fehler, die Sie nach einem Unfall vermeiden'],
  ['Fehler Abfindung', 'Abfindungserklärung'],
  ['Fehler HIS-Datei', 'HIS-Datei'],
  ['Fehler Zwei-Foto', 'Zwei-Foto-Regel'],
  ['Fehler Polizei', 'Polizei'],
  ['Fehler Wertminderung', 'merkantile Wertminderung'],

  // Umlaut-Sanity-Check der Wörter die ich geschrieben habe
  ['Umlaut: Fürs', 'für'],
  ['Umlaut: Schädigte', 'geschädigt'],
  ['Umlaut: Höchstrichterliche', 'höchstrichterlich'],
  ['Umlaut: über', 'über'],
]

console.log(`Body text length: ${text.length} chars\n`)
let pass = 0, fail = 0
for (const [label, needle] of CHECKS) {
  const ok = text.toLowerCase().includes(needle.toLowerCase())
  console.log(`${ok ? '✓' : '✗'} ${label}: "${needle}"`)
  if (ok) pass++; else fail++
}
console.log(`\n${pass}/${pass+fail} checks pass.`)

// ASCII-Ersatz scan im gerenderten Text
const ASCII_REPL = /\b(Fuer|fuer|naechst|Naechst|ueber|Ueber|aendern|Aenderung|loesch|Loesch|grosse|groesse|moegli|Moegli|spaet|Spaet|haeuf|Haeuf|jaehr|Jaehr|geprueft|gepruef|fuehrt|Fuehrt|gehoer|Gehoer|verfueg|Verfueg|muess|Muess|Schaeden|schaeden|Anwaelte|anwaelte)\b/g
const hits = [...new Set(text.match(ASCII_REPL) ?? [])]
console.log(`\nASCII-Ersatz-Funde: ${hits.length === 0 ? 'KEINE' : hits.join(', ')}`)

await browser.close()
