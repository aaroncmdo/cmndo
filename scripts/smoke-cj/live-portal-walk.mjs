// Live-Portal-Walk: Kunde landet via Magic-Link im /kunde/onboarding-Portal,
// alle Felder werden durchgespielt, jeder Weiter-Button geklickt, Console/
// Network/PageError-Capture, DB-Snapshot pro Step.

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

loadEnv({ path: '.env.test' })
loadEnv({ path: '.env.local' })

const OUT_DIR = `docs/13.05.2026/smoke-claimondo-de/live-portal-walk-${Date.now()}`
mkdirSync(OUT_DIR, { recursive: true })
console.log(`Output: ${OUT_DIR}`)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// 1. Letzter konvertierter Smoke-Lead → dessen kunde_id holen
const { data: leads } = await supabase
  .from('leads')
  .select('id, email, konvertiert_zu_fall_id, qualifizierungs_phase, vorname, nachname')
  .ilike('nachname', 'Multi%')
  .eq('qualifizierungs_phase', 'konvertiert')
  .order('konvertiert_am', { ascending: false })
  .limit(1)
const lead = leads?.[0]
if (!lead || !lead.konvertiert_zu_fall_id) {
  console.error('Kein konvertierter Multi-Lead — erst live-field-walk laufen lassen')
  process.exit(1)
}
const { data: fall } = await supabase
  .from('faelle')
  .select('id, kunde_id, status')
  .eq('id', lead.konvertiert_zu_fall_id)
  .single()
if (!fall?.kunde_id) { console.error('Fall ohne kunde_id'); process.exit(1) }

console.log(`✓ Fall: ${fall.id} (status=${fall.status})`)
console.log(`✓ Kunde-User: ${fall.kunde_id}`)
console.log(`✓ Lead-Email: ${lead.email}`)

// 2. Password setzen (Magic-Link redirect ist auf cmndo.vercel.app fehl-
//    konfiguriert in Supabase Site URL — eigener Bug, separater Fix-PR).
//    Workaround: service-role setzt Password, Walker loggt sich klassisch ein.
const NEW_PW = 'SmokeWalk1234!'
const { error: pwErr } = await supabase.auth.admin.updateUserById(fall.kunde_id, { password: NEW_PW })
if (pwErr) { console.error('Pw-Reset:', pwErr); process.exit(1) }
console.log(`✓ Password reset auf ${NEW_PW}`)

const allLogs = {
  fields: [], pageErrors: [], consoleErrors: [], networkErrors: [],
  dbSnapshots: [], errorCount: 0,
}

async function dbSnapshot(label) {
  const [{ data: lRow }, { data: fRow }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', lead.id).single(),
    supabase.from('faelle').select('*').eq('id', fall.id).single(),
  ])
  const snap = { label, ts: new Date().toISOString(), lead: lRow, fall: fRow }
  allLogs.dbSnapshots.push(snap)
  return snap
}

const browser = await chromium.launch({
  headless: false, slowMo: 350,
  args: ['--window-size=1440,900', '--window-position=40,40'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })
const page = await ctx.newPage()

page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) {
    allLogs.consoleErrors.push({ ts: Date.now(), type: msg.type(), text: msg.text() })
    if (msg.type() === 'error') allLogs.errorCount += 1
  }
})
page.on('pageerror', (err) => {
  allLogs.pageErrors.push({ ts: Date.now(), msg: err.message })
  allLogs.errorCount += 1
  console.log(`⚠ pageerror: ${err.message}`)
})
page.on('response', (res) => {
  if (res.status() >= 400) {
    allLogs.networkErrors.push({ ts: Date.now(), url: res.url(), status: res.status() })
    if (res.status() >= 500) console.log(`⚠ ${res.status()} ${res.url()}`)
  }
})

async function injectHud(role = 'kunde-portal') {
  await page.evaluate((r) => {
    if (document.getElementById('walk-hud')) return
    try {
      const css = document.createElement('style')
      css.textContent = `
        #walk-hud{position:fixed;top:16px;right:16px;z-index:2147483647;background:rgba(13,27,62,.94);color:#fff;padding:12px 16px;border-radius:12px;font:600 13px/1.3 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none;max-width:380px}
        #walk-hud .h{color:#7BA3CC;text-transform:uppercase;font-size:10px;letter-spacing:.1em;margin-bottom:4px}
        #walk-hud .m{color:rgba(255,255,255,.7);font-weight:400;font-size:11px;margin-top:4px}
        #walk-hud .err{color:#fca5a5;font-weight:600;font-size:11px;margin-top:4px}
        .walk-flash{outline:3px solid #f59e0b!important;outline-offset:3px!important;box-shadow:0 0 0 6px rgba(245,158,11,.3)!important}
        .walk-flash-click{outline:3px solid #ef4444!important;outline-offset:3px!important;box-shadow:0 0 0 6px rgba(239,68,68,.4)!important}
      `
      document.documentElement.appendChild(css)
      const el = document.createElement('div'); el.id = 'walk-hud'
      el.innerHTML = `<div class="h">${r}</div><div id="walk-step">…</div><div class="m" id="walk-meta"></div><div class="err" id="walk-err"></div>`
      document.body.appendChild(el)
    } catch {}
  }, role).catch(() => {})
}

async function hud(step, meta = '') {
  await page.evaluate(([s, m, e]) => {
    const x = document.getElementById('walk-step'); if (x) x.textContent = s
    const y = document.getElementById('walk-meta'); if (y) y.textContent = m
    const z = document.getElementById('walk-err'); if (z) z.textContent = e > 0 ? `${e} JS-Errors` : ''
  }, [step, meta, allLogs.errorCount]).catch(() => {})
}

async function flash(h, klass = 'walk-flash') {
  await h.evaluate((el, k) => { el.classList.add(k); setTimeout(() => el.classList.remove(k), 700) }, klass).catch(() => {})
  await page.waitForTimeout(450)
}

let captured = 0
async function snap(label) {
  captured += 1
  const file = `${String(captured).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true })
  return file
}

async function signCanvasIfAny(stepN) {
  const canvases = await page.locator('canvas:visible').elementHandles()
  for (const c of canvases) {
    const box = await c.boundingBox()
    if (!box || box.width < 100 || box.height < 50) continue
    await hud(`step ${stepN}`, `signature canvas`)
    await c.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await flash(c)
    const x0 = box.x + 30, y = box.y + box.height / 2
    await page.mouse.move(x0, y); await page.mouse.down()
    for (let i = 1; i <= 7; i += 1) await page.mouse.move(x0 + i * 40, y + (i % 2 === 0 ? -20 : 20), { steps: 5 })
    await page.mouse.up()
    allLogs.fields.push({ step: stepN, tag: 'CANVAS', drawn: true })
    return true
  }
  return false
}

async function walkVisibleInputs(stepN) {
  const inputs = await page.locator('input:visible, textarea:visible, select:visible').elementHandles()
  console.log(`  → ${inputs.length} Eingabefelder`)
  for (const h of inputs) {
    const info = await h.evaluate((el) => ({
      tag: el.tagName, type: el.type, name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'), value: el.value, readOnly: el.readOnly,
    })).catch(() => null)
    if (!info || info.readOnly) continue
    await hud(`step ${stepN}`, `${info.tag.toLowerCase()}${info.type ? '/' + info.type : ''} ${info.name ?? info.placeholder ?? ''}`)
    await flash(h)
    let setValue = null
    try {
      if (info.tag === 'INPUT' && info.type === 'checkbox') {
        if (!await h.isChecked()) { await h.check({ timeout: 2000 }); setValue = 'checked' }
      } else if (info.tag === 'INPUT' && info.type === 'radio') {
        await h.check({ timeout: 2000 }); setValue = 'radio'
      } else if (info.tag === 'SELECT') {
        const opts = await h.$$eval('option', (os) => os.map((o) => o.value).filter(Boolean))
        if (opts.length > 0) { await h.selectOption(opts[0]); setValue = opts[0] }
      } else if (info.tag === 'INPUT' && ['hidden', 'submit', 'button', 'file', 'password'].includes(info.type)) {
        // skip — password-input.value ist immer leer (browser-security),
        // wir würden sonst den vorherigen Login-Pw überschreiben
      } else if (info.tag === 'INPUT' && info.type === 'number') {
        if (!info.value) { await h.fill('1'); setValue = '1' }
      } else if (info.tag === 'INPUT' && info.type === 'date') {
        if (!info.value) { await h.fill('2026-05-20'); setValue = '2026-05-20' }
      } else if (info.tag === 'INPUT' && info.type === 'tel') {
        if (!info.value) { await h.fill('+4915112345678'); setValue = '+4915112345678' }
      } else if (info.tag === 'INPUT' && info.type === 'email') {
        if (!info.value) { await h.fill(lead.email); setValue = lead.email }
      } else {
        if (!info.value || info.value.length < 2) { await h.fill('Smoke-Portal'); setValue = 'Smoke-Portal' }
      }
    } catch { /* skip */ }
    allLogs.fields.push({ step: stepN, ...info, valueAfter: setValue })
  }
}

async function clickNextIfAny(stepN) {
  // Scope auf main-Content. Sidebar/nav/aside haben oft eigene Submit-Buttons
  // (Abmelden = form[action=logout] mit type=submit), die der Walker sonst
  // priorisiert und uns aus dem Portal raushaut.
  const sels = [
    'main button:has-text("Los geht\'s")',
    'main button:has-text("Beauftragen")',
    'main button:has-text("Termin buchen")',
    'main button:has-text("Absenden")',
    'main button:has-text("Speichern")',
    'main button:has-text("Bestätigen")',
    'main button:has-text("Weiter")',
    'main button:has-text("Fertig")',
    'main button[type="submit"]:visible',
    // Fallback: Pages ohne <main>-Wrapper
    'button:has-text("Los geht\'s"):not(nav button):not(aside button):visible',
    'button:has-text("Weiter"):not(nav button):not(aside button):visible',
  ]
  for (const sel of sels) {
    const btn = page.locator(sel).first()
    if (await btn.count() > 0 && await btn.isVisible() && await btn.isEnabled()) {
      await hud(`step ${stepN}`, `click ${sel}`)
      await flash(await btn.elementHandle(), 'walk-flash-click')
      await btn.click()
      return sel
    }
  }
  return null
}

console.log(`\n▶ Pre-walk Snapshot + Magic-Link öffnen`)
await dbSnapshot('pre-walk')

// Classic Login auf app.claimondo.de/login → kommt durch zu /kunde
console.log(`▶ Login bei app.claimondo.de/login`)
await page.goto('https://app.claimondo.de/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(2000)
await injectHud()
await page.fill('[name="email"]', lead.email)
await page.fill('[name="password"]', NEW_PW)
await snap('00-login-filled')
await page.click('[type="submit"]')
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(3000)
await injectHud()
await snap('01-after-login')
console.log(`▶ URL after login: ${page.url()}`)
// Direkt zu Kunde-Onboarding
await page.goto('https://app.claimondo.de/kunde/onboarding', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(2500)
await injectHud()
await snap('02-kunde-onboarding')

for (let stepN = 1; stepN <= 8; stepN += 1) {
  console.log(`\nStep ${stepN}: ${page.url()}`)
  await dbSnapshot(`pre-step-${stepN}`)
  await walkVisibleInputs(stepN)
  await signCanvasIfAny(stepN)
  await page.waitForTimeout(800)
  await snap(`step-${stepN}-filled`)
  const clicked = await clickNextIfAny(stepN)
  if (!clicked) {
    console.log(`  ↩ kein Next-Button`)
    await snap(`step-${stepN}-end`)
    await dbSnapshot(`step-${stepN}-end`)
    break
  }
  console.log(`  → ${clicked}`)
  await page.waitForTimeout(3000)
  await injectHud()
  await dbSnapshot(`post-step-${stepN}`)
  await snap(`step-${stepN}-after-next`)
}

console.log(`\n▶ Summary`)
console.log(`  Felder: ${allLogs.fields.length}, PageErrors: ${allLogs.pageErrors.length}, ConsoleErr: ${allLogs.consoleErrors.filter((e) => e.type === 'error').length}, Network≥400: ${allLogs.networkErrors.length}`)
const first = allLogs.dbSnapshots[0]; const last = allLogs.dbSnapshots[allLogs.dbSnapshots.length - 1]
const fallDiff = {}
for (const k of Object.keys(last.fall ?? {})) {
  if (JSON.stringify(first.fall?.[k]) !== JSON.stringify(last.fall?.[k])) fallDiff[k] = { from: first.fall?.[k], to: last.fall?.[k] }
}
writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({
  fallId: fall.id, kundeId: fall.kunde_id, leadEmail: lead.email,
  finalUrl: page.url(), errorCount: allLogs.errorCount,
  fallDiff,
  fields: allLogs.fields,
  pageErrors: allLogs.pageErrors,
  consoleErrors: allLogs.consoleErrors.slice(-30),
  networkErrors: allLogs.networkErrors.slice(-30),
  dbSnapshots: allLogs.dbSnapshots,
}, null, 2))
console.log(`  fallDiff:`, fallDiff)
console.log(`  Final-URL: ${page.url()}`)
console.log(`\n✓ Output: ${OUT_DIR}`)

await page.waitForTimeout(2000)
await browser.close()
