// Selbstbeobachtender Wizard-Walker: klickt sich durch einen mehrstufigen Formular-Flow
// und protokolliert bei JEDEM Schritt, was die Seite anbietet. Dadurch muss die
// Feldstruktur nicht vorab geraten werden (und Aenderungen fallen sofort auf).
//
// Aufruf:  node --env-file=<pfad>/.env.local scripts/smoke/ep-walker.mjs <ziel> [--headed]
//   ziel = e1 | e4 | e5 | e6 | e8 | e9 | flow:<token>
//
// Messfallen, die hier adressiert sind:
//  - iframe: Finder laeuft in app.claimondo.de/embed/* im Marketing-Dokument -> gezielt adressieren
//  - Hydration: erst auf ein Element WARTEN, dann zaehlen (count() liefert sonst 0)
//  - has-text matcht Substring UND case-insensitiv -> volle Optionstitel verwenden
//  - button[type=submit].first() trifft in Portalen den ABMELDEN-Button der Navigation

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKETING, APP, identitaet, svc, zustand, zusammenfassung } from './ep-lib.mjs'

const ziel = process.argv[2]
const headed = process.argv.includes('--headed')
if (!ziel) {
  console.error('Ziel fehlt. e1 | e4 | e5 | e6 | e8 | e9 | flow:<token>')
  process.exit(1)
}

const ZIELE = {
  e1: { url: `${MARKETING}/schaden-melden`, frame: null },
  e4: { url: `${MARKETING}/gutachter-finden`, frame: 'embed/gutachter-finder' },
  e5: { url: `${MARKETING}/werkstatt-finden`, frame: 'embed/werkstatt-finder' },
  e6: { url: `${MARKETING}/kfz-gutachter/koeln`, frame: 'embed/gutachter-finder' },
  e8: { url: `${MARKETING}/check`, frame: null },
  e9: { url: `${MARKETING}/`, frame: null },
}

const SHOTS = join(process.cwd(), 'scripts/smoke/.ep-walk')
mkdirSync(SHOTS, { recursive: true })

const ident = identitaet(ziel.startsWith('flow') ? 'FLOW' : ziel.toUpperCase())
console.log('Identitaet:', JSON.stringify(ident))

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 250 : 0 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE' })
const page = await ctx.newPage()
const konsole = []
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 200)) })
const posts = []
page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url().slice(0, 120)) })

let ctxFrame = page.mainFrame()

async function zielFrame(muster) {
  if (!muster) return page.mainFrame()
  for (let i = 0; i < 20; i++) {
    const f = page.frames().find((x) => x.url().includes(muster))
    if (f) {
      // warten bis der Frame wirklich Inhalt hat (leer != noch nicht fertig)
      for (let j = 0; j < 15; j++) {
        const len = await f.evaluate(() => (document.body?.innerText || '').length).catch(() => 0)
        if (len > 200) return f
        await page.waitForTimeout(1000)
      }
      return f
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(`iframe mit "${muster}" nicht gefunden`)
}

/** Was steht gerade da? */
async function schnappschuss(frame, label) {
  const daten = await frame.evaluate(() => {
    const sichtbar = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    const txt = (el) => (el.innerText || el.getAttribute('value') || '').trim().replace(/\s+/g, ' ')
    return {
      titel: [...document.querySelectorAll('h1,h2,h3,legend')].filter(sichtbar).map(txt).filter(Boolean).slice(0, 8),
      felder: [...document.querySelectorAll('input,textarea,select')].filter(sichtbar).map((el) => ({
        tag: el.tagName.toLowerCase(), typ: el.getAttribute('type') || '', name: el.getAttribute('name') || '',
        ph: el.getAttribute('placeholder') || '', wert: (el.value || '').slice(0, 30),
        label: (el.labels?.[0]?.innerText || '').trim().slice(0, 50),
      })),
      klickbar: [...document.querySelectorAll('button,[role=button],[role=radio],label,a[href]')].filter(sichtbar)
        .map((el) => ({ text: txt(el).slice(0, 80), tag: el.tagName.toLowerCase(), typ: el.getAttribute('type') || '', disabled: el.hasAttribute('disabled') }))
        .filter((b) => b.text && b.text.length < 90),
      textLen: (document.body?.innerText || '').length,
    }
  })
  console.log(`\n──── ${label} ────`)
  console.log('  Titel   :', daten.titel.join(' | ') || '(keine)')
  console.log('  Felder  :', daten.felder.map((f) => `${f.tag}[${f.typ}]${f.name ? '#' + f.name : ''}${f.ph ? ' "' + f.ph + '"' : ''}${f.label ? ' <' + f.label + '>' : ''}`).join('  ') || '(keine)')
  console.log('  Klick   :', [...new Set(daten.klickbar.map((b) => b.text + (b.disabled ? ' [aus]' : '')))].slice(0, 24).join(' | '))
  await page.screenshot({ path: join(SHOTS, `${ziel.replace(':', '-')}-${label}.png`) }).catch(() => {})
  return daten
}

// ── Start ──────────────────────────────────────────────────────────────────
if (ziel.startsWith('flow:')) {
  const token = ziel.slice(5)
  await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
} else {
  const z = ZIELE[ziel]
  if (!z) throw new Error(`unbekanntes Ziel ${ziel}`)
  await page.goto(z.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})
  ctxFrame = await zielFrame(z.frame)
}
await page.waitForTimeout(3000)
await schnappschuss(ctxFrame, 'start')

console.log('\nPOSTs bisher:', posts.length, '| Konsolenfehler:', konsole.length)
if (konsole.length) console.log(konsole.slice(0, 3))

writeFileSync(join(SHOTS, `${ziel.replace(':', '-')}-ident.json`), JSON.stringify(ident, null, 2))
console.log('\nIdentitaet gespeichert. Browser bleibt 2s offen.')
await page.waitForTimeout(2000)
await browser.close()
