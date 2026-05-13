// UI-Driver — Playwright, klickt durch die Customer-Journey gemäß Step-Map.
// Capture pro Step: screenshot, console, pageerror, network (4xx/5xx + failed), axe.
// Bei pageerror oder network-error → wirft → Orchestrator desync(track=ui).

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'

export class UiDriver {
  constructor({ baseUrl, outDir, supabaseAdminClient }) {
    this.baseUrl = baseUrl
    this.outDir = outDir
    this.supabase = supabaseAdminClient  // für tokenSource-Lookups
    this.browser = null
    this.context = null
    this.page = null
  }

  async start() {
    this.browser = await chromium.launch({ headless: false })
    this.context = await this.browser.newContext({
      baseURL: this.baseUrl,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      recordHar: { path: path.join(this.outDir, 'session.har') },
    })
    await this.context.tracing.start({ screenshots: true, snapshots: true })
    this.page = await this.context.newPage()
  }

  async runStep(step) {
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
    this.page.on('console', onConsole)
    this.page.on('pageerror', onPageError)
    this.page.on('response', onResponse)
    this.page.on('requestfailed', onReqFailed)

    try {
      await this._execute(step.ui)
      // Settle: auf network-idle warten, sonst race mit DB-Watcher
      await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})

      // Screenshot + axe
      await this.page.screenshot({ path: path.join(stepDir, 'screenshot.png'), fullPage: true })

      if (hardErr) {
        // DOM-Dump nur bei Error
        writeFileSync(path.join(stepDir, 'dom.html'), await this.page.content())
        throw hardErr
      }
      return { ok: true }
    } finally {
      this.page.off('console', onConsole)
      this.page.off('pageerror', onPageError)
      this.page.off('response', onResponse)
      this.page.off('requestfailed', onReqFailed)
    }
  }

  async _execute(ui) {
    switch (ui.action) {
      case 'fillLeadForm':
        await this.page.goto(ui.url ?? '/')
        for (const [k, v] of Object.entries(ui.payload)) {
          await this.page.fill(`[name="${k}"]`, String(v))
        }
        await this.page.click('[data-testid="lead-submit"]')
        return
      case 'openMagicLinkFromDb': {
        const { table, match, column } = ui.tokenSource
        // Tail-Poll: token wird typischerweise im vorigen Step erzeugt
        const token = await this._pollDbValue(table, match, column, 5000)
        const url = new URL(`/flow/${token}`, this.baseUrl).toString()
        await this.page.goto(url)
        return
      }
      case 'clickCheckbox':
        await this.page.click(ui.selector)
        return
      case 'fillForm':
        for (const [sel, val] of Object.entries(ui.fields)) {
          await this.page.fill(sel, val)
        }
        if (ui.submit) await this.page.click(ui.submit)
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
      const { data } = await q.limit(1).single()
      if (data?.[column]) return data[column]
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`pollDbValue-timeout: ${table}.${column} (${JSON.stringify(match)})`)
  }

  async cancel() {
    try {
      if (this.context) {
        await this.context.tracing.stop({ path: path.join(this.outDir, 'trace.zip') }).catch(() => {})
      }
      await this.page?.close().catch(() => {})
      await this.context?.close().catch(() => {})
      await this.browser?.close().catch(() => {})
    } catch {}
    this.browser = this.context = this.page = null
  }
}
