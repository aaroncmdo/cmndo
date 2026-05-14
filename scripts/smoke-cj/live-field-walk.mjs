// Live-Field-Walk mit voller Beobachtung:
//   - HUD im Browser, Flash auf jedes angefasste Feld
//   - Console + PageError + Network-4xx/5xx Capture pro Step
//   - DB-Snapshot (leads + flow_links + faelle für den Lead) vor + nach jedem Step
//   - Final-Summary: alle erfassten Felder + DB-Mutations + Errors

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

loadEnv({ path: '.env.test' })
loadEnv({ path: '.env.local' })

const APP_URL = 'https://app.claimondo.de'
const OUT_DIR = `docs/13.05.2026/smoke-claimondo-de/live-field-walk-${Date.now()}`
mkdirSync(OUT_DIR, { recursive: true })
console.log(`Output: ${OUT_DIR}`)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// 1. Fresh flow_link
const { data: leads } = await supabase
  .from('leads')
  .select('id, vorname, nachname, telefon, email, service_typ, sprache')
  .ilike('nachname', 'Multi%')
  .eq('qualifizierungs_phase', 'rueckruf')
  .order('created_at', { ascending: false })
  .limit(1)
const lead = leads?.[0]
if (!lead) { console.error('Kein Lead'); process.exit(1) }
const token = randomBytes(16).toString('hex')
await supabase.from('flow_links').insert({
  token, lead_id: lead.id,
  service_typ: lead.service_typ ?? 'komplett',
  sprache: lead.sprache ?? 'de', status: 'aktiv',
  expires_at: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
})
console.log(`✓ Lead: ${lead.vorname} ${lead.nachname} (${lead.id})`)
console.log(`✓ flow_link token: ${token}`)

const allLogs = {
  fields: [],
  consoleErrors: [],
  pageErrors: [],
  networkErrors: [],
  dbSnapshots: [],
  errorCount: 0,
}

async function dbSnapshot(label) {
  const [{ data: lRow }, { data: flRow }, { data: fallRow }, { data: nachRows }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', lead.id).single(),
    supabase.from('flow_links').select('*').eq('token', token).single(),
    supabase.from('faelle').select('*').eq('lead_id', lead.id).maybeSingle(),
    supabase.from('nachrichten').select('id, kanal, typ, empfaenger, erstellt_am').eq('lead_id', lead.id).order('erstellt_am', { ascending: false }).limit(5),
  ])
  const snap = { label, ts: new Date().toISOString(), lead: lRow, flow_link: flRow, fall: fallRow, nachrichten_count: nachRows?.length ?? 0 }
  allLogs.dbSnapshots.push(snap)
  return snap
}

const browser = await chromium.launch({
  headless: false, slowMo: 350,
  args: ['--window-size=1440,900', '--window-position=40,40'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })
const page = await ctx.newPage()

// Error-Capture
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) {
    allLogs.consoleErrors.push({ ts: Date.now(), type: msg.type(), text: msg.text() })
    if (msg.type() === 'error') allLogs.errorCount += 1
  }
})
page.on('pageerror', (err) => {
  allLogs.pageErrors.push({ ts: Date.now(), msg: err.message, stack: err.stack })
  allLogs.errorCount += 1
  console.log(`  ⚠ pageerror: ${err.message}`)
})
page.on('response', (res) => {
  if (res.status() >= 400) {
    allLogs.networkErrors.push({ ts: Date.now(), url: res.url(), status: res.status() })
    if (res.status() >= 500) console.log(`  ⚠ ${res.status()} ${res.url()}`)
  }
})

async function injectHud() {
  await page.evaluate(() => {
    if (document.getElementById('walk-hud')) return
    try {
      const css = document.createElement('style')
      css.textContent = `
        #walk-hud { position: fixed; top: 16px; right: 16px; z-index: 2147483647;
          background: rgba(13,27,62,.94); color: #fff; padding: 12px 16px; border-radius: 12px;
          font: 600 13px/1.3 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.3);
          pointer-events: none; max-width: 380px; }
        #walk-hud .h { color: #7BA3CC; text-transform: uppercase; font-size: 10px; letter-spacing: .1em; margin-bottom: 4px }
        #walk-hud .m { color: rgba(255,255,255,.7); font-weight: 400; font-size: 11px; margin-top: 4px }
        #walk-hud .err { color: #fca5a5; font-weight: 600; font-size: 11px; margin-top: 4px }
        .walk-flash { outline: 3px solid #f59e0b !important; outline-offset: 3px !important;
          box-shadow: 0 0 0 6px rgba(245,158,11,.3) !important; }
        .walk-flash-click { outline: 3px solid #ef4444 !important; outline-offset: 3px !important;
          box-shadow: 0 0 0 6px rgba(239,68,68,.4) !important; }
      `
      document.documentElement.appendChild(css)
      const el = document.createElement('div'); el.id = 'walk-hud'
      el.innerHTML = '<div class="h">live-field-walk</div><div id="walk-step">…</div><div class="m" id="walk-meta"></div><div class="err" id="walk-err"></div>'
      document.body.appendChild(el)
    } catch {}
  }).catch(() => {})
}

async function hud(step, meta = '') {
  await page.evaluate(([s, m, errs]) => {
    const e = document.getElementById('walk-step'); if (e) e.textContent = s
    const mm = document.getElementById('walk-meta'); if (mm) mm.textContent = m
    const er = document.getElementById('walk-err'); if (er) er.textContent = errs > 0 ? `${errs} JS-Errors` : ''
  }, [step, meta, allLogs.errorCount]).catch(() => {})
}

async function flash(handle, klass = 'walk-flash') {
  await handle.evaluate((el, k) => { el.classList.add(k); setTimeout(() => el.classList.remove(k), 700) }, klass).catch(() => {})
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
    if (!box || box.width < 100 || box.height < 50) continue  // skip kleine canvas
    await hud(`step ${stepN}`, `signature canvas ${Math.round(box.width)}×${Math.round(box.height)}`)
    await c.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await flash(c, 'walk-flash')
    // Polyline mit mouse: 7 Punkte
    const x0 = box.x + 30, y = box.y + box.height / 2
    await page.mouse.move(x0, y)
    await page.mouse.down()
    for (let i = 1; i <= 7; i += 1) {
      await page.mouse.move(x0 + i * 40, y + (i % 2 === 0 ? -20 : 20), { steps: 5 })
    }
    await page.mouse.up()
    await page.waitForTimeout(500)
    allLogs.fields.push({ step: stepN, tag: 'CANVAS', kind: 'signature', drawn: true })
    return true
  }
  return false
}

async function walkVisibleInputs(stepN) {
  const inputs = await page.locator('input:visible, textarea:visible, select:visible').elementHandles()
  console.log(`  → ${inputs.length} sichtbare Eingabefelder`)
  for (const h of inputs) {
    const info = await h.evaluate((el) => ({
      tag: el.tagName, type: el.type, name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'), value: el.value, readOnly: el.readOnly,
    })).catch(() => null)
    if (!info || info.readOnly) continue
    await hud(`step ${stepN}`, `${info.tag.toLowerCase()}${info.type ? '/' + info.type : ''} ${info.name ?? info.placeholder ?? ''}`)
    await flash(h, 'walk-flash')
    let setValue = null
    try {
      if (info.tag === 'INPUT' && info.type === 'checkbox') {
        if (!await h.isChecked()) { await h.check({ timeout: 2000 }); setValue = 'checked' }
      } else if (info.tag === 'INPUT' && info.type === 'radio') {
        await h.check({ timeout: 2000 }); setValue = 'radio-selected'
      } else if (info.tag === 'SELECT') {
        const opts = await h.$$eval('option', (os) => os.map((o) => o.value).filter(Boolean))
        if (opts.length > 0) { await h.selectOption(opts[0]); setValue = opts[0] }
      } else if (info.tag === 'INPUT' && ['hidden', 'submit', 'button', 'file'].includes(info.type)) {
        // skip
      } else if (info.tag === 'INPUT' && info.type === 'number') {
        if (!info.value) { await h.fill('1'); setValue = '1' }
      } else if (info.tag === 'INPUT' && info.type === 'date') {
        if (!info.value) { await h.fill('2026-05-20'); setValue = '2026-05-20' }
      } else {
        if (!info.value || info.value.length < 2) { await h.fill('Smoke-Walk'); setValue = 'Smoke-Walk' }
      }
    } catch (err) { /* skip if fail */ }
    allLogs.fields.push({ step: stepN, ...info, valueAfter: setValue })
  }
}

async function clickNextIfAny(stepN) {
  const candidates = [
    'button:has-text("SA unterzeichnen")',
    'button:has-text("Beauftragen")',
    'button:has-text("Termin buchen")',
    'button:has-text("Absenden")',
    'button:has-text("Weiter")',
    'button:has-text("Speichern")',
    'button:has-text("Bestätigen")',
    'button[type="submit"]:visible',
  ]
  for (const sel of candidates) {
    const btn = page.locator(sel).first()
    if (await btn.count() > 0 && await btn.isVisible() && await btn.isEnabled()) {
      await hud(`step ${stepN}`, `click: ${sel}`)
      await flash(await btn.elementHandle(), 'walk-flash-click')
      await btn.click()
      return sel
    }
  }
  return null
}

console.log(`\n▶ Pre-walk DB-Snapshot`)
await dbSnapshot('pre-walk')

console.log(`▶ Open ${APP_URL}/flow/${token}\n`)
await page.goto(`${APP_URL}/flow/${token}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(3500)
await injectHud()

for (let stepN = 1; stepN <= 6; stepN += 1) {
  console.log(`\nStep ${stepN}:`)
  await dbSnapshot(`pre-step-${stepN}`)
  await hud(`step ${stepN}`, 'felder befüllen')
  await walkVisibleInputs(stepN)
  await signCanvasIfAny(stepN)
  await page.waitForTimeout(800)
  await snap(`step-${stepN}-filled`)
  const clicked = await clickNextIfAny(stepN)
  if (!clicked) {
    console.log(`  ↩ kein Submit — Wizard zu Ende`)
    await snap(`step-${stepN}-end`)
    await dbSnapshot(`step-${stepN}-end`)
    break
  }
  console.log(`  → click ${clicked}`)
  await page.waitForTimeout(2500)
  await dbSnapshot(`post-step-${stepN}`)
  await injectHud()
  await snap(`step-${stepN}-after-next`)
}

console.log(`\n▶ Final-Summary`)
console.log(`  Felder berührt: ${allLogs.fields.length}`)
console.log(`  Page-Errors: ${allLogs.pageErrors.length}`)
console.log(`  Console-Errors: ${allLogs.consoleErrors.filter((e) => e.type === 'error').length}`)
console.log(`  Network ≥400: ${allLogs.networkErrors.length}`)
console.log(`  DB-Snapshots: ${allLogs.dbSnapshots.length}`)

// DB-Diff summary
const first = allLogs.dbSnapshots[0]
const last = allLogs.dbSnapshots[allLogs.dbSnapshots.length - 1]
const leadDiff = {}
for (const k of Object.keys(last.lead ?? {})) {
  if (JSON.stringify(first.lead?.[k]) !== JSON.stringify(last.lead?.[k])) leadDiff[k] = { from: first.lead?.[k], to: last.lead?.[k] }
}
const flDiff = {}
for (const k of Object.keys(last.flow_link ?? {})) {
  if (JSON.stringify(first.flow_link?.[k]) !== JSON.stringify(last.flow_link?.[k])) flDiff[k] = { from: first.flow_link?.[k], to: last.flow_link?.[k] }
}

writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({
  token, leadId: lead.id, leadName: `${lead.vorname} ${lead.nachname}`,
  errorCount: allLogs.errorCount,
  leadDiff, flowLinkDiff: flDiff,
  fallEntstanden: Boolean(last.fall),
  fields: allLogs.fields,
  pageErrors: allLogs.pageErrors,
  consoleErrors: allLogs.consoleErrors.slice(-50),
  networkErrors: allLogs.networkErrors.slice(-50),
  dbSnapshots: allLogs.dbSnapshots,
}, null, 2))

console.log(`\n  leadDiff:`, leadDiff)
console.log(`  flowLinkDiff:`, flDiff)
console.log(`  fallEntstanden: ${Boolean(last.fall)}`)
console.log(`\n✓ Output: ${OUT_DIR}`)

await page.waitForTimeout(2000)
await browser.close()
