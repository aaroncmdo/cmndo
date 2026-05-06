// Screenshot-Generator fuer Design-/Code-Review der drei Portale
// (Gutachter, Dispatch, Kunde). Loggt sich pro Rolle ein, navigiert
// alle relevanten Routes auf Desktop + Mobile-Viewport und legt
// PNGs unter docs/portals-review/screenshots/{rolle}/{slug}-{viewport}.png ab.
//
// Voraussetzungen:
//   - lokaler Dev-Server laeuft auf SCREENSHOT_BASE_URL (Default http://localhost:3000)
//   - test-User existieren (test-sv@/test-dispatch@/test-kunde@claimondo.de mit Test1234!)
//     siehe scripts/seed-test-data.ts
//   - npx playwright install chromium  (einmalig)
//
// Ausfuehrung:
//   node scripts/screenshot-portals.mjs            # alle drei Portale
//   node scripts/screenshot-portals.mjs gutachter  # nur ein Portal
//
// Output: docs/portals-review/screenshots/<rolle>/...png
//         docs/portals-review/screenshots/<rolle>/INDEX.md

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? 'Test1234!'
const OUT_DIR = 'docs/portals-review/screenshots'

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 },
]

const PORTALS = {
  gutachter: {
    label: 'Sachverstaendiger',
    email: 'test-sv@claimondo.de',
    landingMatch: /\/gutachter/,
    routes: [
      ['gutachter-dashboard', '/gutachter'],
      ['auftraege-liste', '/gutachter/auftraege'],
      ['heute', '/gutachter/heute'],
      ['kalender', '/gutachter/kalender'],
      ['route', '/gutachter/route'],
      ['termine-liste', '/gutachter/termine'],
      ['posteingang', '/gutachter/posteingang'],
      ['nachrichten', '/gutachter/nachrichten'],
      ['mitteilungen', '/gutachter/mitteilungen'],
      ['tasks', '/gutachter/tasks'],
      ['statistiken', '/gutachter/statistiken'],
      ['abrechnung', '/gutachter/abrechnung'],
      ['profil', '/gutachter/profil'],
      ['profil-branding', '/gutachter/profil/branding'],
      ['einstellungen', '/gutachter/einstellungen'],
      ['einstellungen-kalender', '/gutachter/einstellungen/kalender'],
      ['gebiet', '/gutachter/gebiet'],
      ['leadpreise', '/gutachter/leadpreise'],
      ['team', '/gutachter/team'],
      ['community', '/gutachter/community'],
      ['reklamationen', '/gutachter/reklamationen'],
      ['feldmodus', '/gutachter/feldmodus'],
      ['verifizierung', '/gutachter/verifizierung'],
      ['vertrag', '/gutachter/vertrag'],
    ],
    // Dynamische Pages — werden zur Laufzeit aufgeloest (erste Treffer-ID)
    dynamic: {
      'fall-detail': {
        url: '/gutachter/fall/{id}',
        resolve: async (page) => {
          await page.goto(`${BASE_URL}/gutachter/auftraege`)
          await page.waitForLoadState('networkidle').catch(() => {})
          const link = await page.locator('a[href*="/gutachter/fall/"]').first()
          const href = await link.getAttribute('href').catch(() => null)
          if (!href) return null
          const m = href.match(/\/gutachter\/fall\/([0-9a-f-]+)/)
          return m ? m[1] : null
        },
      },
    },
  },
  dispatch: {
    label: 'Dispatch',
    email: 'test-dispatch@claimondo.de',
    landingMatch: /\/dispatch/,
    routes: [
      ['dashboard', '/dispatch/dashboard'],
      ['leads-liste', '/dispatch/leads'],
      ['rueckrufe', '/dispatch/rueckrufe'],
      ['sachverstaendige-liste', '/dispatch/sachverstaendige'],
      ['kalender', '/dispatch/kalender'],
      ['karte', '/dispatch/karte'],
      ['isochrone', '/dispatch/isochrone'],
    ],
    dynamic: {
      'lead-detail': {
        url: '/dispatch/leads/{id}',
        resolve: async (page) => {
          await page.goto(`${BASE_URL}/dispatch/leads`)
          await page.waitForLoadState('networkidle').catch(() => {})
          const link = await page.locator('a[href*="/dispatch/leads/"]').first()
          const href = await link.getAttribute('href').catch(() => null)
          if (!href) return null
          const m = href.match(/\/dispatch\/leads\/([0-9a-f-]+)/)
          return m ? m[1] : null
        },
      },
      'sv-detail': {
        url: '/dispatch/sachverstaendige/{id}',
        resolve: async (page) => {
          await page.goto(`${BASE_URL}/dispatch/sachverstaendige`)
          await page.waitForLoadState('networkidle').catch(() => {})
          const link = await page.locator('a[href*="/dispatch/sachverstaendige/"]').first()
          const href = await link.getAttribute('href').catch(() => null)
          if (!href) return null
          const m = href.match(/\/dispatch\/sachverstaendige\/([0-9a-f-]+)/)
          return m ? m[1] : null
        },
      },
    },
  },
  kunde: {
    label: 'Kunde',
    email: 'test-kunde@claimondo.de',
    landingMatch: /\/kunde/,
    routes: [
      ['dashboard', '/kunde'],
      ['faelle-liste', '/kunde/faelle'],
      ['termine-liste', '/kunde/termine'],
      ['nachbesichtigung-liste', '/kunde/nachbesichtigung'],
      ['chat', '/kunde/chat'],
      ['profil', '/kunde/profil'],
      ['einstellungen', '/kunde/einstellungen'],
    ],
    dynamic: {
      'fall-detail': {
        url: '/kunde/faelle/{id}',
        resolve: async (page) => {
          await page.goto(`${BASE_URL}/kunde/faelle`)
          await page.waitForLoadState('networkidle').catch(() => {})
          const link = await page.locator('a[href*="/kunde/faelle/"]').first()
          const href = await link.getAttribute('href').catch(() => null)
          if (!href) return null
          const m = href.match(/\/kunde\/faelle\/([0-9a-f-]+)/)
          return m ? m[1] : null
        },
      },
    },
  },
}

async function login(page, email) {
  // Erste Compile in Next 16 Turbopack kann 10-20s dauern — entsprechende Geduld.
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // Defensiv: falls nicht der Email-Tab vorausgewaehlt ist, Tab anklicken.
  const emailTab = page.locator('button:has-text("E-Mail")').first()
  if (await emailTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailTab.click().catch(() => {})
  }
  // Auf den Email-Input warten — bis zu 60s, dann erst fuellen.
  const emailInput = page.locator('input#email, input[name="email"], input[type="email"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: 60000 })
  await emailInput.fill(email)
  const pwInput = page.locator('input#password, input[name="password"], input[type="password"]').first()
  await pwInput.waitFor({ state: 'visible', timeout: 5000 })
  await pwInput.fill(PASSWORD)
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Anmelden"), button:has-text("Login")').first().click(),
  ])
}

async function disableAnimations(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  })
}

async function screenshotRoute(context, viewport, label, slug, url, indexLines) {
  const page = await context.newPage()
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  let success = false
  let errorMsg = ''
  try {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    await disableAnimations(page)
    await page.waitForTimeout(500) // letzten layout-shift abwarten
    const filePath = join(OUT_DIR, label, `${slug}-${viewport.name}.png`)
    await page.screenshot({ path: filePath, fullPage: true })
    success = true
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err)
  }
  await page.close()
  indexLines.push(
    success
      ? `- [${slug} (${viewport.name})](./${slug}-${viewport.name}.png) — ${url}`
      : `- ❌ ${slug} (${viewport.name}) — ${url} — ${errorMsg.slice(0, 100)}`,
  )
  return success
}

async function processPortal(browser, portalKey, portal) {
  console.log(`\n=== ${portal.label} (${portalKey}) ===`)
  const portalDir = join(OUT_DIR, portalKey)
  await mkdir(portalDir, { recursive: true })

  const indexLines = [`# ${portal.label}-Portal — Screenshots`, '', `Generiert: ${new Date().toISOString()}`, '', `Test-User: \`${portal.email}\``, '', '## Routen', '']

  // Dynamische Routes auflösen — separater context fuer login + resolve
  const resolveContext = await browser.newContext({ viewport: VIEWPORTS[0] })
  const resolvePage = await resolveContext.newPage()
  await login(resolvePage, portal.email)
  const dynamicResolved = {}
  for (const [slug, cfg] of Object.entries(portal.dynamic ?? {})) {
    try {
      const id = await cfg.resolve(resolvePage)
      if (id) {
        dynamicResolved[slug] = cfg.url.replace('{id}', id)
        console.log(`  ${slug} → ${dynamicResolved[slug]}`)
      } else {
        console.log(`  ${slug} → kein Eintrag gefunden, skip`)
      }
    } catch (err) {
      console.log(`  ${slug} → Fehler: ${err.message}`)
    }
  }
  await resolveContext.close()

  // Pro Viewport: separater Browser-Context (sauberer Cookie-Scope)
  for (const viewport of VIEWPORTS) {
    indexLines.push(`### Viewport: ${viewport.name} (${viewport.width}×${viewport.height})`, '')
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await login(page, portal.email)
    await page.close()

    for (const [slug, url] of portal.routes) {
      await screenshotRoute(context, viewport, portalKey, slug, url, indexLines)
    }
    for (const [slug, url] of Object.entries(dynamicResolved)) {
      await screenshotRoute(context, viewport, portalKey, slug, url, indexLines)
    }

    indexLines.push('')
    await context.close()
  }

  await writeFile(join(portalDir, 'INDEX.md'), indexLines.join('\n'), 'utf8')
  console.log(`  → ${join(portalDir, 'INDEX.md')}`)
}

async function main() {
  const target = process.argv[2]
  const portals = target ? { [target]: PORTALS[target] } : PORTALS
  if (target && !PORTALS[target]) {
    console.error(`Unbekanntes Portal: ${target}. Verfuegbar: ${Object.keys(PORTALS).join(', ')}`)
    process.exit(1)
  }
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  try {
    for (const [key, portal] of Object.entries(portals)) {
      await processPortal(browser, key, portal)
    }
  } finally {
    await browser.close()
  }

  console.log(`\nFertig. PNGs: ${OUT_DIR}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
