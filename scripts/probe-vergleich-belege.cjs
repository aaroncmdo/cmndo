// Probe-Script: Wettbewerbs-Faktencheck fuer GEO-Sprint Vergleichs-Page (Tag 1).
// Oeffnet die 403-blockenden Konkurrenz- + Trustpilot-Seiten mit echtem Chromium,
// extrahiert sichtbaren Text zur Fakten-Verifikation und legt datierte
// Screenshot-Belege fuer die UWG-Paragraph-6-Vorpruefung ab.
//
// Aufruf (NODE_PATH zeigt auf node_modules des Haupt-Repos, da der Worktree keine hat):
//   NODE_PATH="<main-repo>/node_modules" node scripts/probe-vergleich-belege.cjs

let chromium
try { chromium = require('playwright').chromium }
catch { try { chromium = require('playwright-core').chromium } catch { chromium = require('@playwright/test').chromium } }

const OUT =
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/session-0525-2137/docs/25.05.2026/vergleich-belege'
const DATE = '2026-05-25'

const TARGETS = [
  { name: 'unfallgiganten-home', url: 'https://www.unfallgiganten.de/' },
  { name: 'unfallgiganten-kfz-gutachter', url: 'https://www.unfallgiganten.de/kfz-gutachter' },
  { name: 'neogutachter-home', url: 'https://neogutachter.de/' },
  { name: 'unfallpaten-home', url: 'https://www.unfallpaten.de/' },
  { name: 'trustpilot-neogutachter', url: 'https://de.trustpilot.com/review/neogutachter.de' },
  { name: 'trustpilot-unfallgiganten', url: 'https://de.trustpilot.com/review/unfallgiganten.de' },
  { name: 'trustpilot-unfallpaten', url: 'https://de.trustpilot.com/review/unfallpaten.de' },
  { name: 'trustpilot-claimondo', url: 'https://de.trustpilot.com/review/claimondo.de' },
]

// Begriffe, deren Trefferzeilen fuer den Faktencheck relevant sind.
const KW = [
  /\d+\s*(minuten|min\b|stunden|std\b|sekunden|sek\b|h\b)/i,
  /vor ort/i,
  /netzwerk|sachverst|gutachter/i,
  /trustscore|bewertung|von 5|sterne|\d,\d\s*\/?\s*5/i,
  /kostenlos|kostenfrei|0\s*€|gratis|versicherung (uebernimmt|übernimmt|zahlt|trägt|traegt)/i,
  /anwalt|rechtsbeistand|kanzlei|rechtsanwalt/i,
  /deutschlandweit|bundesweit|österreich|oesterreich|schweiz|dach\b/i,
  /online.?gutachten|ohne besichtigung|ferngutachten|foto/i,
  /24\s*\/?\s*7|rund um die uhr|soforthilfe|0800/i,
]

function scan(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const hits = []
  const seen = new Set()
  for (const l of lines) {
    if (l.length > 220) continue
    if (KW.some((re) => re.test(l))) {
      const key = l.toLowerCase()
      if (!seen.has(key)) { seen.add(key); hits.push(l) }
    }
  }
  return hits.slice(0, 40)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'de-DE',
    viewport: { width: 1366, height: 900 },
  })
  const page = await ctx.newPage()

  for (const t of TARGETS) {
    const res = { name: t.name, url: t.url }
    try {
      const resp = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      res.status = resp ? resp.status() : 'no-response'
      await page.waitForTimeout(4000) // JS/Cloudflare/Trustpilot-Render abwarten
      res.title = await page.title()
      const text = await page.innerText('body').catch(() => '')
      res.textLen = text.length
      res.hits = scan(text)
      res.head = text.replace(/\n{2,}/g, '\n').trim().slice(0, 800)
      await page.screenshot({ path: `${OUT}/${t.name}-${DATE}.png`, fullPage: false })
      res.screenshot = `${t.name}-${DATE}.png`
    } catch (e) {
      res.error = String(e).slice(0, 300)
    }
    console.log('\n========== ' + t.name + ' ==========')
    console.log(JSON.stringify(res, null, 1))
  }

  await browser.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
