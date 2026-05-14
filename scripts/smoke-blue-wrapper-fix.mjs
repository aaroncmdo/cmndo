// Smoke fuer AAR-blue-wrapper-fix (14.05.2026): prueft dass kein
// Body-Direkt-Kind mehr eine navy Glass-Pill von der Floating-Sidebar-Regel
// abbekommt. Screenshots auf Marketing- + Portal-Pages.
//
// Voraussetzung: Dev-Server laeuft auf BASE (default http://localhost:3000).
// Aufruf:  node scripts/smoke-blue-wrapper-fix.mjs
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3000'
const OUT = 'docs/14.05.2026/aar-blue-wrapper-fix'

const TARGETS = [
  ['ueber-uns', '/ueber-uns'],
  ['home', '/'],
  ['faq', '/faq'],
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []

for (const [slug, path] of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const url = `${BASE}${path}`
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {})
    const status = resp?.status() ?? 0

    // Warten auf body-attribute (gesetzt clientseitig durch SidebarModeApplier)
    await page.waitForFunction(() => document.body.dataset.sidebarMode === 'floating', { timeout: 5000 }).catch(() => {})

    // Probe: erstes direktes div-Kind der body
    const probe = await page.evaluate(() => {
      const mode = document.body.dataset.sidebarMode ?? null
      const directDivs = Array.from(document.body.children).filter(
        (el) => el.tagName === 'DIV' && !el.className?.toString().includes('absolute'),
      )
      const sample = directDivs.slice(0, 3).map((el) => {
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName,
          className: typeof el.className === 'string' ? el.className.slice(0, 80) : '[non-string]',
          backgroundColor: cs.backgroundColor,
          borderRadius: cs.borderRadius,
          paddingTop: cs.paddingTop,
          paddingLeft: cs.paddingLeft,
        }
      })
      return { mode, sample }
    })

    const file = join(OUT, `${slug}.png`)
    await page.screenshot({ path: file, fullPage: false })

    // Heuristik: wenn paddingTop/Left auf body>div > 0 ist UND backgroundColor nicht transparent → defekt
    const broken = probe.sample.some((s) => {
      const pad = parseFloat(s.paddingTop || '0') + parseFloat(s.paddingLeft || '0')
      const bg = s.backgroundColor || ''
      const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
      return pad > 0 && hasBg
    })

    results.push({ slug, status, file, mode: probe.mode, probe: probe.sample, broken })
    console.log(`[${broken ? 'X' : 'OK'}] ${slug}  status=${status}  mode=${probe.mode}`)
    for (const s of probe.sample) {
      console.log(`     - ${s.tag}.${s.className} bg=${s.backgroundColor} pad=${s.paddingTop}/${s.paddingLeft} radius=${s.borderRadius}`)
    }
  } catch (err) {
    console.error(`[FAIL] ${slug}: ${err.message}`)
    results.push({ slug, error: err.message })
  } finally {
    await ctx.close()
  }
}

await browser.close()

const anyBroken = results.some((r) => r.broken)
console.log('\n=== ERGEBNIS ===')
console.log(anyBroken ? 'BLUE-WRAPPER STILL PRESENT' : 'BLUE-WRAPPER ENTFERNT')
process.exit(anyBroken ? 1 : 0)
