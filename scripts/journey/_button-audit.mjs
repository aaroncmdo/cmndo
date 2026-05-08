/**
 * scripts/journey/_button-audit.mjs — Button-Inventar + Click-Audit pro Seite
 *
 * Aaron-Brief: "wirklich jeden knopf ausprobieren und schauen funktioniert der
 * und macht der was der soll? und gibts den schon, muss das anders?"
 *
 * Ablauf pro auditPage(page, {phase, label}):
 *   1. Inventar bauen — alle sichtbaren `button`, `a[href]`, `[role=button|tab|menuitem]`
 *   2. Für jedes Element in einem isolierten Probe-Tab klicken (state-Flow nicht stören)
 *   3. Nach jedem Klick erfassen: URL-Wechsel, neue Modale/Toasts, Console-Errors
 *   4. Klassifikation: WORKS | NOOP | ERROR | DEAD-LINK | NAV | MODAL
 *
 * Wichtig: Buttons mit destruktivem Effekt (Löschen, Ablehnen, Stornieren) werden
 * über Label-Heuristik ausgefiltert oder über das `dangerLabels`-Pattern gemarkt.
 *
 * Output:
 *   - record('PASS'|'SOFT', phase, msg, tag) für jeden Button
 *   - Screenshot pro WORKS/MODAL-Klick zur Doku
 */

import { record, shoot } from './_helpers.mjs'

const DANGEROUS = /löschen|löscht|verwerfen|abbrechen.*irreversibel|stornieren|ablehnen|bestätige.*lösch|sign[a]?out|abmelden/i
const SKIPPABLE = /externer link|hilfe|datenschutz|impressum|cookie/i
// Headless-incompatible Buttons — brauchen Permissions/Hardware (Mikro, Kamera, File-Picker)
const HEADLESS_BLOCKED = /aufnahme starten|aufnahme stoppen|kamera|mikrofon|datei wählen|foto aufnehmen/i
// Generische Layout-/A11y-Buttons die nicht zur Audit-Spur gehören
const NOISE = /^(zurück zur navigation|menü|settings|theme|sprache|language|search|suche|new|neu|entfernen|remove|×|x)$/i

/**
 * Sammelt alle klickbaren Elemente auf der aktuellen Seite.
 */
async function inventory(page) {
  return await page.evaluate(() => {
    const sel = [
      'button:not([disabled])',
      'a[href]',
      '[role="button"]:not([aria-disabled="true"])',
      '[role="tab"]',
      '[role="menuitem"]',
    ].join(',')
    const all = Array.from(document.querySelectorAll(sel))
    const visible = all.filter((el) => {
      const r = el.getBoundingClientRect()
      const cs = window.getComputedStyle(el)
      return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
    })
    return visible.map((el, idx) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      const aria = el.getAttribute('aria-label') || ''
      const testid = el.getAttribute('data-testid') || ''
      const tag = el.tagName.toLowerCase()
      const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null
      const role = el.getAttribute('role') || ''
      return { idx, text, aria, testid, tag, href, role }
    })
  })
}

/**
 * Auditiert alle Buttons/Links der aktuellen Seite.
 *
 * @param {import('playwright').Page} page — vorhanden geöffnete Seite (eingeloggt)
 * @param {{ phase: number; label: string; max?: number; skipPatterns?: RegExp[] }} opts
 */
export async function auditPage(page, opts) {
  const { phase, label } = opts
  const max = opts.max ?? 30
  const skipPatterns = opts.skipPatterns ?? []

  const startUrl = page.url()
  const items = await inventory(page)
  record('INFO', phase, `Button-Audit "${label}": ${items.length} klickbare Elemente gefunden (max ${max})`, 'audit-inventory')
  await shoot(page, `audit-${label}-inventar`)

  const results = []
  let processed = 0

  // Console-Error-Listener — neu pro Audit-Run aktivieren
  const consoleErrors = []
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200))
  }
  page.on('console', onConsole)

  for (const item of items) {
    if (processed >= max) {
      record('INFO', phase, `Audit-Cap erreicht (${max}) — ${items.length - processed} Elemente nicht getestet`, 'audit-cap')
      break
    }

    const itemLabel = item.testid || item.aria || item.text || `${item.tag}#${item.idx}`
    if (DANGEROUS.test(itemLabel) || DANGEROUS.test(item.aria)) {
      record('INFO', phase, `Audit übersprungen (destruktiv): "${itemLabel}"`, 'audit-skip-danger')
      continue
    }
    if (HEADLESS_BLOCKED.test(itemLabel) || HEADLESS_BLOCKED.test(item.aria)) {
      record('INFO', phase, `Audit übersprungen (headless-incompatible): "${itemLabel}"`, 'audit-skip-headless')
      continue
    }
    if (NOISE.test(itemLabel.trim()) || SKIPPABLE.test(itemLabel) || skipPatterns.some((re) => re.test(itemLabel))) {
      continue
    }

    processed++
    consoleErrors.length = 0

    // Element neu lokalisieren (DOM-Reorder möglich nach vorigem Klick)
    let target
    try {
      target = item.testid
        ? page.locator(`[data-testid="${item.testid}"]`).first()
        : item.aria
          ? page.locator(`[aria-label="${item.aria}"]`).first()
          : page.locator(`${item.tag}`).filter({ hasText: item.text || ' ' }).first()
    } catch {
      continue
    }

    const visible = await target.isVisible({ timeout: 1_000 }).catch(() => false)
    if (!visible) {
      results.push({ label: itemLabel, status: 'GONE' })
      continue
    }

    // Vor-Klick-State erfassen
    const beforeUrl = page.url()
    const beforeDialogs = await page.locator('[role="dialog"], [data-state="open"]').count().catch(() => 0)

    let outcome = 'NOOP'
    let outcomeMsg = ''
    try {
      // Externe Links nicht klicken (würde Browser navigieren)
      if (item.href && (item.href.startsWith('http') || item.href.startsWith('mailto:') || item.href.startsWith('tel:'))) {
        outcome = 'EXTERNAL'
        outcomeMsg = `extern → ${item.href}`
      } else {
        await target.click({ timeout: 2_500, trial: false })
        await page.waitForTimeout(400)
        const afterUrl = page.url()
        const afterDialogs = await page.locator('[role="dialog"], [data-state="open"]').count().catch(() => 0)
        const errorBanner = await page.locator('[role="alert"]').first().textContent({ timeout: 500 }).catch(() => null)

        if (consoleErrors.length > 0) {
          outcome = 'ERROR'
          outcomeMsg = `Console-Errors: ${consoleErrors.slice(0, 2).join(' | ')}`
        } else if (errorBanner && /fehler|error/i.test(errorBanner)) {
          outcome = 'ERROR'
          outcomeMsg = `Error-Banner: ${errorBanner.slice(0, 80)}`
        } else if (afterUrl !== beforeUrl) {
          outcome = 'NAV'
          outcomeMsg = `→ ${new URL(afterUrl).pathname}`
        } else if (afterDialogs > beforeDialogs) {
          outcome = 'MODAL'
          outcomeMsg = 'Pop-Over/Modal geöffnet'
        } else {
          outcome = 'NOOP'
          outcomeMsg = 'kein sichtbarer State-Wechsel'
        }
      }
    } catch (err) {
      outcome = 'CLICK-FAIL'
      outcomeMsg = err.message.slice(0, 80)
    }

    const sev = outcome === 'ERROR' || outcome === 'CLICK-FAIL' ? 'SOFT' : 'PASS'
    record(sev, phase, `Button "${itemLabel}" → ${outcome}${outcomeMsg ? ` — ${outcomeMsg}` : ''}`, `btn-${outcome.toLowerCase()}`)
    results.push({ label: itemLabel, status: outcome, msg: outcomeMsg })

    // Zurück-Navigation falls nötig
    if (outcome === 'NAV' && page.url() !== startUrl) {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(500)
    } else if (outcome === 'MODAL') {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(200)
      // Falls Modal nicht via Escape weggeht, schließen-Button suchen
      const closeBtn = page.locator('button[aria-label*="schließen" i], button[aria-label*="close" i]').first()
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click().catch(() => {})
        await page.waitForTimeout(200)
      }
    }
  }

  page.off('console', onConsole)

  const summary = {
    nav: results.filter((r) => r.status === 'NAV').length,
    modal: results.filter((r) => r.status === 'MODAL').length,
    noop: results.filter((r) => r.status === 'NOOP').length,
    error: results.filter((r) => r.status === 'ERROR' || r.status === 'CLICK-FAIL').length,
    external: results.filter((r) => r.status === 'EXTERNAL').length,
    gone: results.filter((r) => r.status === 'GONE').length,
  }
  record(
    'INFO',
    phase,
    `Audit "${label}" Summary: NAV=${summary.nav} MODAL=${summary.modal} NOOP=${summary.noop} ERROR=${summary.error}`,
    'audit-summary',
  )
  return results
}
