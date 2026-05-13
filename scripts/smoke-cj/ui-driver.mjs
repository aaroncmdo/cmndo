// UI-Driver — Playwright, klickt durch die Customer-Journey gemäß Step-Map.
// Capture pro Step: screenshot, console, pageerror, network (4xx/5xx + failed).
// Bei pageerror oder network-error → wirft → Orchestrator desync(track=ui).
//
// Live-Modus (--live):
//   • headed, slowMo 400 ms, viewport 1440x900, devtools auf
//   • Step-HUD-Overlay (sticky top-right) zeigt aktuellen Step + Elapsed
//   • Click-Flash: 250 ms roter Outline auf jedem Element bevor geklickt wird
//   • Pro Step optional Pause auf Tastendruck (--pause)
//   • Multi-Context: pro Rolle (Kunde/SV/Admin) eigener BrowserContext mit
//     eigenen Cookies + eigenem Fenster, damit Auth nicht durcheinanderläuft
//   • Cross-Domain: action.domain='app' wechselt von Marketing-Domain auf App-Domain

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'

export class UiDriver {
  constructor({ marketingBaseUrl, appBaseUrl, outDir, supabaseAdminClient, live = false, pause = false }) {
    this.marketingBaseUrl = marketingBaseUrl   // z. B. https://claimondo.de
    this.appBaseUrl = appBaseUrl               // z. B. https://app.staging.claimondo.de
    this.outDir = outDir
    this.supabase = supabaseAdminClient
    this.live = live
    this.pause = pause
    this.browser = null
    this.contexts = {}   // { kunde, sv, admin } → BrowserContext
    this.pages = {}      // { kunde, sv, admin } → Page
    this.activeRole = null
    this.stepCounter = 0
  }

  async start() {
    this.browser = await chromium.launch({
      headless: this.live ? false : Boolean(process.env.SMOKE_HEADLESS) || false,
      slowMo: this.live ? 400 : 0,
      devtools: this.live,
      args: this.live ? ['--window-size=1440,900', '--window-position=40,40'] : [],
    })
  }

  async _ensureContext(role) {
    if (this.contexts[role]) return this.contexts[role]
    const ctx = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      recordHar: { path: path.join(this.outDir, `session-${role}.har`) },
    })
    await ctx.tracing.start({ screenshots: true, snapshots: true, sources: true })
    const page = await ctx.newPage()
    this.contexts[role] = ctx
    this.pages[role] = page
    if (this.live) await this._installHud(page, role)
    return ctx
  }

  async _installHud(page, role) {
    // Sticky-HUD-Overlay direkt in die Page injizieren. Zeigt aktuellen Step.
    // Wird per page.evaluate auf jedem framenavigated re-installed.
    await page.addInitScript(({ role }) => {
      if (window.__SMOKE_HUD__) return
      window.__SMOKE_HUD__ = true
      const css = `
        #smoke-hud { position: fixed; top: 16px; right: 16px; z-index: 2147483647;
          background: rgba(13,27,62,.94); color: #fff; padding: 10px 14px; border-radius: 12px;
          font: 600 12px/1.3 system-ui, sans-serif; letter-spacing: -.01em;
          box-shadow: 0 8px 24px rgba(0,0,0,.3); pointer-events: none; max-width: 320px;
        }
        #smoke-hud .role { color: #7BA3CC; text-transform: uppercase; font-size: 10px; letter-spacing: .1em; margin-bottom: 4px }
        #smoke-hud .step { font-size: 14px; margin-bottom: 2px }
        #smoke-hud .meta { color: rgba(255,255,255,.6); font-weight: 400; font-size: 11px }
        .smoke-flash { outline: 3px solid #ef4444 !important; outline-offset: 2px !important;
          transition: outline-color .15s; box-shadow: 0 0 0 4px rgba(239,68,68,.3) !important;
        }
      `
      const style = document.createElement('style')
      style.textContent = css
      document.documentElement.appendChild(style)
      const mount = () => {
        if (document.getElementById('smoke-hud')) return
        const el = document.createElement('div')
        el.id = 'smoke-hud'
        el.innerHTML = `<div class="role">${role}</div><div class="step" id="smoke-hud-step">warte…</div><div class="meta" id="smoke-hud-meta"></div>`
        document.body.appendChild(el)
      }
      if (document.body) mount()
      else document.addEventListener('DOMContentLoaded', mount)
    }, { role })
  }

  async _updateHud(role, { step, phase, elapsedMs }) {
    if (!this.live) return
    const page = this.pages[role]
    if (!page) return
    await page.evaluate(({ step, phase, elapsedMs }) => {
      const s = document.getElementById('smoke-hud-step')
      const m = document.getElementById('smoke-hud-meta')
      if (s) s.textContent = `${step}  •  ${phase}`
      if (m) m.textContent = `${elapsedMs} ms`
    }, { step, phase, elapsedMs }).catch(() => {})
  }

  async _flashElement(page, selector) {
    if (!this.live) return
    await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return
      el.classList.add('smoke-flash')
      setTimeout(() => el.classList.remove('smoke-flash'), 600)
    }, selector).catch(() => {})
    await page.waitForTimeout(250)
  }

  async _waitForKeypress() {
    if (!this.pause) return
    process.stdout.write('  [Pause] Enter drücken für nächsten Step… ')
    await new Promise((r) => process.stdin.once('data', r))
  }

  async runStep(step) {
    this.stepCounter += 1
    const role = step.role ?? 'kunde'
    this.activeRole = role
    await this._ensureContext(role)
    const page = this.pages[role]

    const stepDir = path.join(this.outDir, step.id)
    mkdirSync(stepDir, { recursive: true })
    const consoleLog = path.join(stepDir, 'console.jsonl')
    const errLog = path.join(stepDir, 'pageerrors.jsonl')
    const net4xx = path.join(stepDir, 'network-4xx-5xx.jsonl')
    const netFail = path.join(stepDir, 'network-failed.jsonl')

    let hardErr = null
    const onConsole = (msg) => {
      if (['warning', 'error'].includes(msg.type())) {
        appendFileSync(consoleLog, JSON.stringify({ ts: Date.now(), type: msg.type(), text: msg.text() }) + '\n')
      }
    }
    const onPageError = (err) => {
      appendFileSync(errLog, JSON.stringify({ ts: Date.now(), message: err.message, stack: err.stack }) + '\n')
      hardErr = new Error(`pageerror: ${err.message}`)
    }
    const onResponse = (res) => {
      if (res.status() >= 400) {
        appendFileSync(net4xx, JSON.stringify({ ts: Date.now(), url: res.url(), status: res.status() }) + '\n')
      }
    }
    const onReqFailed = (req) => {
      appendFileSync(netFail, JSON.stringify({ ts: Date.now(), url: req.url(), failure: req.failure() }) + '\n')
    }
    page.on('console', onConsole)
    page.on('pageerror', onPageError)
    page.on('response', onResponse)
    page.on('requestfailed', onReqFailed)

    const startedAt = Date.now()
    await this._updateHud(role, { step: step.id, phase: 'start', elapsedMs: 0 })

    try {
      await this._execute(page, step)
      if (step.waitFor?.selector) {
        await page.waitForSelector(step.waitFor.selector, { timeout: step.waitFor.timeoutMs ?? 5000 })
      }
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
      await page.screenshot({ path: path.join(stepDir, 'screenshot.png'), fullPage: true })

      if (hardErr) {
        writeFileSync(path.join(stepDir, 'dom.html'), await page.content())
        throw hardErr
      }
      await this._updateHud(role, { step: step.id, phase: 'done', elapsedMs: Date.now() - startedAt })
      await this._waitForKeypress()
      return { ok: true }
    } finally {
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('response', onResponse)
      page.off('requestfailed', onReqFailed)
    }
  }

  async _execute(page, step) {
    const ui = step.ui
    const baseUrl = ui.domain === 'app' ? this.appBaseUrl : this.marketingBaseUrl
    switch (ui.action) {
      case 'noop':
        return
      case 'navigate':
        await page.goto(new URL(ui.url, baseUrl).toString())
        return
      case 'click':
        await this._flashElement(page, ui.selector)
        await page.click(ui.selector)
        return
      case 'evalCustomEvent': {
        // Test-SV-ID ins window injecten, dann das Custom-Event feuern
        await page.evaluate(({ id }) => { window.__SMOKE_SV_ID__ = id }, { id: process.env.SMOKE_TEST_SV_USER_ID })
        await page.evaluate(ui.script)
        return
      }
      case 'fillForm':
        if (ui.preActions) {
          for (const pa of ui.preActions) {
            await this._flashElement(page, pa.selector)
            await page.click(pa.selector)
          }
        }
        for (const [sel, val] of Object.entries(ui.fields)) {
          await this._flashElement(page, sel)
          // Select-Tags brauchen .selectOption, Inputs .fill
          const tag = await page.$eval(sel, (el) => el.tagName).catch(() => 'INPUT')
          if (tag === 'SELECT') await page.selectOption(sel, String(val))
          else await page.fill(sel, String(val))
        }
        if (ui.submit) {
          await this._flashElement(page, ui.submit)
          await page.click(ui.submit)
        }
        return
      case 'openMagicLinkFromDb': {
        const token = await this._pollDbValue(ui.tokenSource.table, ui.tokenSource.match, ui.tokenSource.column, 8000)
        const url = new URL(ui.pathTemplate.replace('{token}', token), this.appBaseUrl).toString()
        await page.goto(url)
        return
      }
      case 'login':
        await page.goto(new URL(ui.url, this.appBaseUrl).toString())
        await this._flashElement(page, '[name="email"]')
        await page.fill('[name="email"]', ui.email)
        await this._flashElement(page, '[name="passwort"]')
        await page.fill('[name="passwort"]', ui.passwort)
        await this._flashElement(page, '[type="submit"]')
        await page.click('[type="submit"]')
        if (ui.successWait) await page.waitForSelector(ui.successWait.selector, { timeout: ui.successWait.timeoutMs })
        return
      case 'goToFallakteAndClick': {
        const id = await this._pollDbValue(ui.fallSource.table, ui.fallSource.match, ui.fallSource.column, 4000)
        const url = new URL(ui.pathTemplate.replace('{id}', id), this.appBaseUrl).toString()
        await page.goto(url)
        if (ui.preActions) for (const pa of ui.preActions) {
          await this._flashElement(page, pa.selector)
          await page.click(pa.selector)
        }
        await this._flashElement(page, ui.clickSelector)
        await page.click(ui.clickSelector)
        return
      }
      case 'goToFallakteAndFill': {
        const id = await this._pollDbValue(ui.fallSource.table, ui.fallSource.match, ui.fallSource.column, 4000)
        const url = new URL(ui.pathTemplate.replace('{id}', id), this.appBaseUrl).toString()
        await page.goto(url)
        if (ui.preActions) for (const pa of ui.preActions) {
          await this._flashElement(page, pa.selector)
          await page.click(pa.selector)
        }
        for (const [sel, val] of Object.entries(ui.fields)) {
          await this._flashElement(page, sel)
          const tag = await page.$eval(sel, (el) => el.tagName).catch(() => 'INPUT')
          if (tag === 'SELECT') await page.selectOption(sel, String(val))
          else await page.fill(sel, String(val))
        }
        if (ui.submit) {
          await this._flashElement(page, ui.submit)
          await page.click(ui.submit)
        }
        return
      }
      case 'uploadFile':
        await this._flashElement(page, ui.selector)
        await page.setInputFiles(ui.selector, ui.filePath)
        if (ui.submitAfter) {
          await this._flashElement(page, ui.submitAfter)
          await page.click(ui.submitAfter)
        }
        return
      default:
        throw new Error(`unknown ui.action: ${ui.action}`)
    }
  }

  async _pollDbValue(table, match, column, timeoutMs) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      let q = this.supabase.from(table).select(column)
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
      const { data } = await q.order('erstellt_am', { ascending: false }).limit(1).maybeSingle()
      if (data?.[column]) return data[column]
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`pollDbValue-timeout: ${table}.${column}`)
  }

  async cancel() {
    try {
      for (const role of Object.keys(this.contexts)) {
        try { await this.contexts[role].tracing.stop({ path: path.join(this.outDir, `trace-${role}.zip`) }) } catch {}
        try { await this.pages[role]?.close() } catch {}
        try { await this.contexts[role]?.close() } catch {}
      }
      await this.browser?.close().catch(() => {})
    } catch {}
    this.browser = null
    this.contexts = {}
    this.pages = {}
  }
}
