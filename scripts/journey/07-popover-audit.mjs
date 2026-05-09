/**
 * scripts/journey/07-popover-audit.mjs — Phase 7: Pop-Over-Audit (alle Seiten)
 *
 * Aaron-Brief: "auch die pop overs alles dann verstehst du die logik"
 * = ALLE Seiten, ALLE Rollen, JEDEN Trigger der ein Overlay öffnet.
 *
 * Strategie:
 *   1. Pro Rolle alle relevanten Routen öffnen
 *   2. Auf jeder Seite alle klickbaren Elemente inventarisieren
 *   3. Pro Element klicken + warten ob ein Overlay erscheint
 *      (dialog, sheet, drawer, popover, radix-portal, vaul-drawer)
 *   4. Overlay geöffnet → Inhalt + Hygiene prüfen → schließen
 *   5. Kein Overlay → Element als NOOP/NAV klassifizieren (nicht SOFT)
 *
 * Klassifikation:
 *   OPENS     — Overlay erscheint, hat Inhalt                → PASS
 *   EMPTY     — Overlay erscheint, kein Inhalt               → SOFT
 *   STUCK     — Klick hat Effekt, aber kein Overlay           → PASS (kein Bug)
 *   NAV       — URL-Wechsel nach Klick                        → PASS (Info)
 *   CLICK-ERR — Klick schlägt fehl                           → SOFT
 *   HYGIENE   — Overlay zeigt interne/rollenfalsche Inhalte   → SOFT
 *
 * Routen-Matrix (analog Button-Audit Phase 3):
 *   admin:    /admin, /admin/faelle
 *   dispatch: /dispatch/dashboard, /dispatch/leads, /dispatch/leads/[id]
 *   sv:       /gutachter/heute, /gutachter/auftraege, /gutachter/posteingang,
 *             /gutachter/profil, /gutachter/kalender
 *   kunde:    /kunde, /kunde/faelle, /kunde/faelle/[id], /kunde/chat
 *
 * Cap: max 20 Trigger pro Seite. Destruktive + headless-inkompatible
 * Elemente werden wie in Phase 3 übersprungen.
 */

import {
  record,
  shoot,
  getAdminDb,
  loadFixtureIds,
  loginAs,
} from './_helpers.mjs'

const PHASE = 7
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// ─── Filter-Pattern (wie _button-audit.mjs) ───────────────────────────────────
const DANGEROUS   = /löschen|verwerfen|stornieren|ablehnen|bestätige.*lösch|sign.?out|abmelden/i
const HEADLESS    = /aufnahme starten|aufnahme stoppen|kamera|mikrofon|datei wählen|foto aufnehmen/i
const NOISE       = /^(zurück zur navigation|menü|settings|theme|sprache|search|suche|×|^x)$/i
// Nur-Navigation: diese klicken wir nicht für Pop-Over-Audit
const NAV_ONLY    = /^(Home|Dashboard|Aufträge|Fälle|Heute|Posteingang|Profil|Kalender|Chat|Abrechnung|Leads|Admin)$/i

// Overlay-Selektoren — was zählt als "Pop-Over geöffnet"
const OVERLAY_SEL = [
  '[role="dialog"]',
  '[data-state="open"]',
  '[data-radix-dialog-content]',
  '[data-vaul-drawer]',
  '[data-radix-popper-content-wrapper]',
  '[role="tooltip"]:not([aria-hidden])',
  '[role="listbox"]',
  '[role="menu"]',
].join(', ')

// Hygiene-Patterns: was darf in Kunden-/SV-Overlays NICHT stehen
const HYGIENE_DISPATCH = /Dispatch-intern|Admin-Only|interne Notiz/i
const HYGIENE_KUNDE    = /Dispatch|Admin-Ansicht|interne Notiz|SV-Matching/i

// ─── Inventory ────────────────────────────────────────────────────────────────

async function inventory(page) {
  return await page.evaluate(() => {
    const sel = [
      'button:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      '[role="tab"]',
      '[role="menuitem"]',
      // aria-haspopup-Attribute deuten stark auf Pop-Over hin
      '[aria-haspopup="true"], [aria-haspopup="dialog"], [aria-haspopup="menu"], [aria-haspopup="listbox"]',
    ].join(',')
    const all = [...new Set(Array.from(document.querySelectorAll(sel)))]
    return all
      .filter((el) => {
        const r  = el.getBoundingClientRect()
        const cs = window.getComputedStyle(el)
        return r.width > 4 && r.height > 4
          && cs.visibility !== 'hidden'
          && cs.display !== 'none'
          && cs.opacity !== '0'
      })
      .map((el, idx) => {
        const text    = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
        const aria    = el.getAttribute('aria-label') || ''
        const testid  = el.getAttribute('data-testid') || ''
        const tag     = el.tagName.toLowerCase()
        const href    = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null
        const haspop  = el.getAttribute('aria-haspopup') || ''
        return { idx, text, aria, testid, tag, href, haspop }
      })
  })
}

// ─── Overlay-Zähler ───────────────────────────────────────────────────────────

async function countOverlays(page) {
  return page.locator(OVERLAY_SEL).count().catch(() => 0)
}

// ─── Overlay schließen ────────────────────────────────────────────────────────

async function closeOverlay(page) {
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(250)
  // Radix-Overlay prüfen
  const stillOpen = await page.locator(OVERLAY_SEL).first().isVisible({ timeout: 600 }).catch(() => false)
  if (stillOpen) {
    // Schließen-Button suchen
    const closeBtn = page.locator([
      'button[aria-label*="schließen" i]',
      'button[aria-label*="close" i]',
      'button[data-testid*="close"]',
      'button[aria-label*="zurück" i]',
    ].join(', ')).first()
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click().catch(() => {})
      await page.waitForTimeout(250)
    }
  }
}

// ─── Pro-Seite Pop-Over-Probe ──────────────────────────────────────────────────

async function auditPagePopovers(page, { role, route, fallId, leadId }) {
  const items = await inventory(page)
  const startUrl = page.url()

  record('INFO', PHASE, `Pop-Over-Audit "${role}${route}": ${items.length} klickbare Elemente`, 'page-inventory')

  let probed = 0
  let opens = 0

  for (const item of items) {
    if (probed >= 20) {
      record('INFO', PHASE, `Cap 20 erreicht auf ${role}${route}`, 'cap')
      break
    }

    const label = item.testid || item.aria || item.text
    if (!label || label.length < 2) continue
    if (DANGEROUS.test(label)) continue
    if (HEADLESS.test(label)) continue
    if (NOISE.test(label.trim())) continue
    if (NAV_ONLY.test(label.trim()) && !item.haspop) continue
    // Reine externe Links überspringen
    if (item.href && (item.href.startsWith('http') || item.href.startsWith('mailto:'))) continue

    probed++

    // Element neu lokalisieren
    let target
    try {
      target = item.testid
        ? page.locator(`[data-testid="${item.testid}"]`).first()
        : item.aria
          ? page.locator(`[aria-label="${item.aria}"]`).first()
          : page.locator(item.tag).filter({ hasText: item.text || ' ' }).first()
    } catch { continue }

    if (!(await target.isVisible({ timeout: 800 }).catch(() => false))) continue

    const beforeUrl      = page.url()
    const beforeOverlays = await countOverlays(page)

    let outcome = 'NOOP'
    let detail  = ''

    try {
      await target.click({ timeout: 2_500 })
      await page.waitForTimeout(600)

      const afterUrl      = page.url()
      const afterOverlays = await countOverlays(page)
      const newOverlay    = afterOverlays > beforeOverlays

      if (newOverlay) {
        // Inhalt lesen
        const content = await page.locator(OVERLAY_SEL).first().textContent({ timeout: 1_200 }).catch(() => '')
        if (content && content.trim().length > 5) {
          outcome = 'OPENS'
          detail  = content.trim().slice(0, 80).replace(/\s+/g, ' ')
          opens++

          // Hygiene-Check
          const hygieneText = content
          if (role === 'kunde' && HYGIENE_KUNDE.test(hygieneText)) {
            record('SOFT', PHASE, `Hygiene "${label}": interne Inhalte in Kunden-Overlay!`, 'hygiene-fail')
          } else if (role === 'sv' && HYGIENE_DISPATCH.test(hygieneText)) {
            record('SOFT', PHASE, `Hygiene "${label}": Dispatch-interne Inhalte in SV-Overlay!`, 'hygiene-fail')
          }

          await shoot(page, `07-${role}-${route.replace(/\//g, '-').replace(/[^a-zA-Z0-9-]/g, '')}-${label.slice(0, 20).replace(/\s+/g, '_')}`)
        } else {
          outcome = 'EMPTY'
          detail  = 'Overlay offen, kein Inhalt'
        }
        await closeOverlay(page)
      } else if (afterUrl !== beforeUrl) {
        outcome = 'NAV'
        detail  = `→ ${new URL(afterUrl).pathname}`
        // Zurücknavigieren
        await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
        await page.waitForTimeout(800)
      }
    } catch (err) {
      outcome = 'CLICK-ERR'
      detail  = err.message.slice(0, 60)
    }

    const sev = outcome === 'OPENS' ? 'PASS'
              : outcome === 'NAV'   ? 'PASS'
              : outcome === 'EMPTY' || outcome === 'CLICK-ERR' ? 'SOFT'
              : 'INFO'   // NOOP = kein Bug

    record(sev, PHASE, `"${role}${route}" → "${label}" → ${outcome}${detail ? `: ${detail}` : ''}`, `pop-${outcome.toLowerCase()}`)
  }

  record(
    'INFO',
    PHASE,
    `"${role}${route}" Zusammenfassung: ${probed} geprüft, ${opens} Overlays geöffnet`,
    'page-summary',
  )
}

// ─── Routen-Matrix ────────────────────────────────────────────────────────────

export async function runPhase7(prevResult = {}) {
  console.log('\n━━━ Phase 7: Pop-Over-Audit (alle Seiten, alle Rollen) ━━━\n')

  const fixtures  = loadFixtureIds() ?? {}
  const leadId    = prevResult.leadId  ?? fixtures.journey_lead_id  ?? null
  const fallId    = prevResult.fallId  ?? fixtures.journey_fall_id  ?? null

  const ROUTES = {
    admin: [
      '/admin',
      '/admin/faelle',
    ],
    dispatch: [
      '/dispatch/dashboard',
      '/dispatch/leads',
      ...(leadId ? [`/dispatch/leads/${leadId}`] : []),
    ],
    sv: [
      '/gutachter/heute',
      '/gutachter/auftraege',
      '/gutachter/posteingang',
      '/gutachter/profil',
      '/gutachter/kalender',
    ],
    kunde: [
      '/kunde',
      '/kunde/faelle',
      ...(fallId ? [`/kunde/faelle/${fallId}`] : []),
      '/kunde/chat',
    ],
  }

  for (const [role, routes] of Object.entries(ROUTES)) {
    let page
    try {
      page = await loginAs(role)
    } catch (err) {
      record('SOFT', PHASE, `Login als ${role} fehlgeschlagen: ${err.message}`, `login-${role}`)
      continue
    }

    for (const route of routes) {
      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
        await page.waitForTimeout(2_000)

        // Redirect-Check
        const finalPath = new URL(page.url()).pathname
        if (finalPath !== route) {
          record('INFO', PHASE, `${role}:${route} redirected → ${finalPath}`, `redirect`)
          // Trotzdem auditieren (könnte z.B. /gutachter/heute → /gutachter/heute mit Session-Param sein)
        }

        await shoot(page, `07-${role}${route.replace(/\//g, '-')}`)
        await auditPagePopovers(page, { role, route, leadId, fallId })
      } catch (err) {
        record('SOFT', PHASE, `${role}:${route} Fehler: ${err.message.slice(0, 100)}`, `route-error`)
      }
    }
  }

  record('PASS', PHASE, 'Phase 7 Pop-Over-Audit abgeschlossen — alle Seiten, alle Rollen', 'phase-done')
  return { ok: true, leadId, fallId }
}
