// scripts/smoke-popover-e2e.mjs — vollständige E2E des Scroll-Popovers.
// Verifiziert: Scroll-Trigger, Race-Fix nach Arm-Karenz, sessionStorage-Sperre,
// 3-Step-Wizard, Google-Places-Autocomplete, Verfügbarkeits-API,
// Profile-Stack-Rendering, Callback-Submit → anfragen-Zeile in DB.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const LP = 'http://localhost:3000/kfzgutachter-lp'

let failed = 0
function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    console.log(`  FAIL  ${name} ${extra}`)
    failed++
  }
}

async function scenarioA(browser) {
  console.log('\n=== Scenario A: schneller Scroll innerhalb Arm-Karenz triggert nach Arm ===')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${LP}?popover_debug=1`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 600)
  await page.waitForTimeout(2000)
  const modalCount = await page.locator('[role=dialog]').count()
  check('Modal öffnet sich nach Arm-Flip ohne weiteres Scroll-Event', modalCount === 1)
  await ctx.close()
}

async function scenarioB(browser) {
  console.log('\n=== Scenario B: sessionStorage-Flag blockt Re-Trigger ===')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // Flag MUSS vor goto() gesetzt sein — sonst feuert useEffect bevor wir es
  // setzen koennen. addInitScript injectet vor jedem App-Code-Run; das ist
  // das Aequivalent zum `sample`-Bug-Fix aus Task A.
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('kfz-lp-popover-seen', '1') } catch {}
  })
  const page = await ctx.newPage()
  await page.goto(LP, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight * 0.5 }))
  await page.waitForTimeout(2000)
  const modalCount = await page.locator('[role=dialog]').count()
  check('Modal bleibt zu wenn Flag gesetzt', modalCount === 0)
  await ctx.close()
}

async function scenarioC(browser) {
  console.log('\n=== Scenario C: ?popover_force=1 öffnet Modal sofort ===')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${LP}?popover_force=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const modalCount = await page.locator('[role=dialog]').count()
  check('Modal öffnet sich ohne Scroll', modalCount === 1)
  await ctx.close()
}

async function scenarioD(browser) {
  console.log('\n=== Scenario D: Full-Funnel Köln → Callback-Submit → anfragen-Row ===')
  const UNIQUE_PHONE = `0151${String(Date.now()).slice(-7)}`
  const UNIQUE_NAME = `Popover E2E ${Date.now().toString(36)}`

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  let verfuegbarRes = null
  page.on('response', async (r) => {
    if (r.url().includes('/api/kfzgutachter-lp/gutachter-verfuegbar')) {
      try { verfuegbarRes = await r.json() } catch {}
    }
  })

  await page.goto(`${LP}?popover_force=1&utm_source=e2e&utm_campaign=popover-smoke`, {
    waitUntil: 'networkidle',
  })
  await page.waitForTimeout(500)

  // Step 1
  await page.locator('button[aria-pressed="false"]').first().click()
  await page.locator('button:has-text("Weiter")').click()
  await page.waitForTimeout(500)

  // Step 2 — Autocomplete + Place-Pick
  // Warten bis Maps-Script geladen ist (sonst kein Service, keine Predictions).
  await page.waitForFunction(() => Boolean(window.google?.maps?.places), {
    timeout: 15000,
  }).catch(() => {})
  await page.locator('#popover-standort').fill('Hohenstaufenring Köln')
  // Debounce 200 ms + Predictions-Roundtrip + Render — bis zu ~3 s warten.
  await page.locator('[role=option]').first().waitFor({ timeout: 10000 })
  const suggestionCount = await page.locator('[role=option]').count()
  check('Autocomplete liefert Suggestions', suggestionCount > 0)
  await page.locator('[role=option]').first().click()
  for (let i = 0; i < 25 && !verfuegbarRes; i++) await page.waitForTimeout(500)
  check('Verfügbarkeits-API antwortet ok', verfuegbarRes?.ok === true)
  check('count ist Zahl', typeof verfuegbarRes?.count === 'number')
  if (verfuegbarRes?.count > 0) {
    check('gutachter-Array geliefert', Array.isArray(verfuegbarRes.gutachter))
    const avatarCount = await page.locator('ul.flex.items-center.-space-x-2\\.5 li').count()
    check('Avatar-Stack hat ≥1 Avatar', avatarCount >= 1)
  }
  await page.waitForTimeout(500)
  const dropdownOpenAfterPick = await page.locator('[role=listbox]').count()
  check('Dropdown zu nach Pick (suppressNextQueryRef)', dropdownOpenAfterPick === 0)

  await page.locator('button:has-text("Weiter")').click()
  await page.waitForTimeout(400)

  // Step 3 — Callback-Pfad
  await page.locator('button:has-text("Lieber Rückruf")').click()
  await page.waitForTimeout(300)
  await page.locator('#popover-cb-name').fill(UNIQUE_NAME)
  await page.locator('#popover-cb-phone').fill(UNIQUE_PHONE)
  await page.locator('button:has-text("Rückruf anfordern")').click()
  await page.locator('text=Danke').waitFor({ timeout: 10000 })
  check('Success-View gerendert', true)

  // DB-Verifikation
  await new Promise((r) => setTimeout(r, 1000))
  const { data: anfrage } = await sb
    .from('anfragen')
    .select('id, kontakt_name, kontakt_telefon, payload, utm_source, utm_campaign, konvertier_status, lead_id')
    .eq('kontakt_telefon', UNIQUE_PHONE)
    .single()
  check('anfragen-Row existiert', Boolean(anfrage))
  check('kontakt_name korrekt', anfrage?.kontakt_name === UNIQUE_NAME)
  check('utm_source=e2e', anfrage?.utm_source === 'e2e')
  check('payload.fahrzeug gesetzt', Boolean(anfrage?.payload?.fahrzeug))
  check('payload.place_id gesetzt', Boolean(anfrage?.payload?.place_id))
  check('konvertier_status=success', anfrage?.konvertier_status === 'success')
  check('lead_id verlinkt', Boolean(anfrage?.lead_id))

  await ctx.close()
}

;(async () => {
  const browser = await chromium.launch()
  try {
    await scenarioA(browser)
    await scenarioB(browser)
    await scenarioC(browser)
    await scenarioD(browser)
  } finally {
    await browser.close()
  }
  console.log(`\n${failed === 0 ? '✓ ALL GREEN' : `✗ ${failed} CHECKS FAILED`}`)
  process.exit(failed === 0 ? 0 : 1)
})()
