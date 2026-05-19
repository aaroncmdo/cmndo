// Preview-Screenshots der kfzgutachter-Ads-Landeseite (lokaler Dev-Server).
// Desktop + Mobile (voll) + Mobile-Falte (684 px) + Stadt-Variante.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.env.LP_URL || 'http://localhost:3000/kfzgutachter-lp'
const OUT = 'docs/18.05.2026/lp-preview'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []

async function shot(name, viewport, fullPage, targetUrl = URL) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce', // pausiert Reviews-Karussell
  })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`))
  let status = 'n/a'
  try {
    const resp = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
    status = resp ? String(resp.status()) : 'no-response'
    // Sicheres Warten bis alle <img>-Tags geladen sind (decode resolves auch fuer fertige).
    await page.evaluate(async () => {
      const imgs = Array.from(document.images)
      await Promise.all(imgs.map((i) => i.decode().catch(() => null)))
    })
  } catch (e) {
    errors.push(`[${name}] goto: ${e.message}`)
  }
  await page.waitForTimeout(800)
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage, timeout: 120_000, animations: 'disabled' })
    console.log(`${name}: HTTP ${status} → ${OUT}/${name}.png`)
  } catch (e) {
    errors.push(`[${name}] screenshot: ${e.message}`)
  }
  await ctx.close()
}

await shot('desktop', { width: 1440, height: 900 }, true)
await shot('mobile', { width: 390, height: 844 }, true)
await shot('mobile-fold', { width: 390, height: 684 }, false)
await shot('desktop-koeln', { width: 1440, height: 900 }, false, URL + '?stadt=koeln')
await shot('mobile-fold-koeln', { width: 390, height: 684 }, false, URL + '?stadt=koeln')

await browser.close()
console.log(errors.length ? `\nFEHLER (${errors.length}):\n` + errors.join('\n') : '\nkeine Console-/Page-Errors')
