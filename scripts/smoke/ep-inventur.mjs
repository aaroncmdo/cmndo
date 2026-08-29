// Entry-Point-Inventur: faehrt jeden oeffentlichen Kunden-Einstieg an und protokolliert,
// WAS dort steht (iframes, Eingabefelder, Buttons). Sendet NICHTS ab — reine Erkundung.
//
// Lauf:  node scripts/smoke/ep-inventur.mjs
// Out:   scripts/smoke/.ep-inventur.json + Screenshots unter scripts/smoke/.ep-shots/
//
// Messfallen, die hier bewusst adressiert sind (AGENTS.md Regel 4 + memory):
//  - iframe: der Finder laeuft in app.claimondo.de/embed/* IM Marketing-Dokument.
//    Wer nur das aeussere Dokument misst, meldet "0 Eingabefelder" fuer ein gesundes Feature.
//  - zu frueh gemessen: "leer" und "noch nicht fertig" sehen identisch aus -> networkidle
//    + Textlaenge ueber die Zeit beobachten, nicht einmal raten.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MARKETING = 'https://claimondo.de'
const APP = 'https://app.claimondo.de'

const ZIELE = [
  { id: 'E1', name: 'Mini-Wizard Schaden melden', url: `${MARKETING}/schaden-melden` },
  { id: 'E4', name: 'Gutachter-Finder (iframe)', url: `${MARKETING}/gutachter-finden` },
  { id: 'E5', name: 'Werkstatt-Finder (iframe)', url: `${MARKETING}/werkstatt-finden` },
  { id: 'E6', name: 'Stadtseite Koeln', url: `${MARKETING}/kfz-gutachter/koeln` },
  { id: 'E7', name: 'Ads-Landing kfzgutachter-lp', url: `${MARKETING}/kfzgutachter-lp` },
  { id: 'E8', name: 'Anspruch pruefen /check', url: `${MARKETING}/check` },
  { id: 'E9', name: 'Startseite', url: `${MARKETING}/` },
  { id: 'E11', name: 'Selbstverschulden', url: `${MARKETING}/schaden-melden/selbstverschulden` },
  { id: 'E12', name: 'Beratung anfragen', url: `${MARKETING}/beratung-anfragen` },
  { id: 'E13', name: 'Ersteinschaetzung', url: `${MARKETING}/ersteinschaetzung` },
  { id: 'A1', name: 'Embed Gutachter-Finder direkt', url: `${APP}/embed/gutachter-finder` },
  { id: 'A2', name: 'Embed Werkstatt-Finder direkt', url: `${APP}/embed/werkstatt-finder` },
]

const SHOTS = join(process.cwd(), 'scripts/smoke/.ep-shots')
mkdirSync(SHOTS, { recursive: true })

/** Alles Interaktive eines Frames einsammeln. */
async function frameInventur(frame) {
  return frame
    .evaluate(() => {
      const sichtbar = (el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
      }
      const felder = [...document.querySelectorAll('input, textarea, select')]
        .filter(sichtbar)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          typ: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          ph: el.getAttribute('placeholder') || '',
          label: (el.labels?.[0]?.innerText || '').trim().slice(0, 60),
        }))
      const buttons = [...document.querySelectorAll('button, a[role="button"], input[type="submit"]')]
        .filter(sichtbar)
        .map((el) => ({
          text: (el.innerText || el.getAttribute('value') || '').trim().replace(/\s+/g, ' ').slice(0, 70),
          typ: el.getAttribute('type') || '',
        }))
        .filter((b) => b.text)
      return { felder, buttons, textLen: (document.body?.innerText || '').length }
    })
    .catch((e) => ({ fehler: String(e).slice(0, 200) }))
}

const browser = await chromium.launch({ headless: true })
const ergebnisse = []

for (const ziel of ZIELE) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })
  const page = await ctx.newPage()
  const konsole = []
  page.on('console', (m) => {
    if (m.type() === 'error') konsole.push(m.text().slice(0, 160))
  })

  const eintrag = { ...ziel }
  try {
    const resp = await page.goto(ziel.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    eintrag.status = resp?.status() ?? null
    eintrag.endUrl = page.url()
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})
    // Textlaenge ueber die Zeit beobachten statt einmal raten
    let vorher = -1
    for (let i = 0; i < 6; i++) {
      const jetzt = await page.evaluate(() => (document.body?.innerText || '').length).catch(() => 0)
      if (jetzt === vorher && jetzt > 200) break
      vorher = jetzt
      await page.waitForTimeout(1500)
    }

    eintrag.haupt = await frameInventur(page.mainFrame())
    eintrag.frames = []
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue
      const inv = await frameInventur(f)
      eintrag.frames.push({ url: f.url(), ...inv })
    }
    eintrag.konsoleFehler = konsole.slice(0, 5)
    await page.screenshot({ path: join(SHOTS, `${ziel.id}.png`), fullPage: false })
  } catch (err) {
    eintrag.fehler = String(err).slice(0, 300)
  }
  ergebnisse.push(eintrag)
  const f = eintrag.frames?.reduce((n, x) => n + (x.felder?.length ?? 0), 0) ?? 0
  console.log(
    `${ziel.id.padEnd(4)} ${String(eintrag.status ?? '---').padEnd(4)} ` +
      `felder=${eintrag.haupt?.felder?.length ?? '?'}+${f}(iframe) ` +
      `frames=${eintrag.frames?.length ?? 0} ${ziel.url}`,
  )
  await ctx.close()
}

await browser.close()
writeFileSync(join(process.cwd(), 'scripts/smoke/.ep-inventur.json'), JSON.stringify(ergebnisse, null, 2))
console.log('\nfertig -> scripts/smoke/.ep-inventur.json')
