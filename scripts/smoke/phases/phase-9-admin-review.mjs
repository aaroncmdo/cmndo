/**
 * scripts/smoke/phases/phase-9-admin-review.mjs — Phase 9: Admin-Review (Filmcheck + Freigabe)
 *
 * Was getestet wird:
 *  Admin öffnet Fallakte, navigiert zum Filmcheck-Tab, gibt Gutachten frei
 *  und übergibt an Kanzlei. Ziel-Status: faelle.status='kanzlei-uebergeben',
 *  lexdrive_events-Insert.
 *
 * Source-Hinweise:
 *  - Fallakte liegt unter /faelle/[id] (nicht /admin/faelle) — dort ist der
 *    zentrale Fallakten-Hub mit Tabs (Übersicht, Prozess, Dokumente, Kommunikation)
 *  - LexDriveTriggerPanel in src/app/faelle/[id]/_components/LexDriveTriggerPanel.tsx
 *  - Admin sieht Fallakte über /admin/faelle → Fallakten-Link → /faelle/[id]
 *  - Filmcheck-Tab: prüfe ob "Filmcheck" als Tab-Label existiert; sonst "Dokumente"-Tab
 *
 * Workaround-Strategie:
 *  Falls "Freigeben"-Button nicht sichtbar: Service-Role setzt faelle.status direkt.
 */

import {
  clickAndShoot,
  gotoAndShoot,
  assertDb,
  loadFixtureIds,
  loginAs,
  logPhase,
  logWarn,
  logHard,
  logSoft,
  getServiceDb,
  saveFixtureIds,
  waitForMitteilung,
} from '../helpers.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * @param {import('playwright').BrowserContext} adminContext
 * @param {{ auftragId: string|null; fallId: string|null; notes: string[] }} prevResult
 * @returns {{ phase: 9, result: 'pass'|'soft'|'hard', notes: string[], fallId: string|null }}
 */
export async function runPhase9(adminContext, prevResult = { notes: [] }) {
  const notes = prevResult.notes ?? []
  let result = 'pass'
  let page = null

  logPhase(9, '=== Phase 9: Admin-Review (Filmcheck + Freigabe) ===')

  const fixtures = loadFixtureIds() ?? {}
  const fallId = prevResult.fallId ?? fixtures.fall_id ?? null

  logPhase(9, `fallId=${fallId}`)

  const db = getServiceDb()

  // --- Login als test-admin ------------------------------------------------
  logPhase(9, 'Login als test-admin@claimondo.de')
  try {
    page = await loginAs(adminContext, 'test-admin@claimondo.de', 'Test1234!', BASE_URL)
  } catch (err) {
    const msg = `Admin-Login fehlgeschlagen: ${err.message}`
    logHard(9, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 9, result: 'hard', notes, fallId }
  }

  if (page.url().includes('/login')) {
    const msg = 'Admin-Login fehlgeschlagen — URL ist noch /login'
    logHard(9, msg)
    notes.push(`HARD: ${msg}`)
    if (page) await page.close().catch(() => {})
    return { phase: 9, result: 'hard', notes, fallId }
  }

  try {
    // --- Schritt 9a: Fallakte öffnen ----------------------------------------
    if (fallId) {
      const fallUrl = `${BASE_URL}/faelle/${fallId}`
      logPhase(9, `Navigiere zu Fallakte: ${fallUrl}`)
      await gotoAndShoot(page, fallUrl, 'phase9-fallakte')
    } else {
      logSoft(9, 'fallId nicht bekannt — navigiere zu /admin/faelle für manuelle Suche')
      notes.push('SOFT: fallId fehlt — Fallakte konnte nicht direkt geöffnet werden')
      result = 'soft'
      await gotoAndShoot(page, `${BASE_URL}/admin/faelle`, 'phase9-faelle-liste')

      // Versuche ersten Fall-Link zu finden
      const ersterFallLink = page.locator('a[href*="/faelle/"]').first()
      if (await ersterFallLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await clickAndShoot(page, ersterFallLink, 'phase9-erster-fall')
      }
    }

    await page.waitForTimeout(2000)
    logPhase(9, `Fallakte URL: ${page.url()}`)

    // --- Schritt 9b: Prozess-Tab öffnen (enthält LexDriveTriggerPanel) ------
    // FallakteShell.tsx:57-63 — TABS: uebersicht|dokumente|kommunikation|prozess|verlauf|timeline
    // LexDrive-Panel liegt in _prozess/Sections.tsx, importiert als EndpointRegister.
    // Filmcheck-Tab existiert NICHT im aktuellen Layout.
    logPhase(9, 'Suche Prozess-Tab (enthält LexDrive-Trigger)')
    const prozessTabSelectors = [
      page.getByRole('button', { name: /^Prozess$/i }),
      page.getByText('Prozess', { exact: true }),
    ]

    let prozessTab = null
    for (const tab of prozessTabSelectors) {
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
        prozessTab = tab
        break
      }
    }

    if (prozessTab) {
      logPhase(9, 'Prozess-Tab gefunden — klicke')
      await clickAndShoot(page, prozessTab, 'phase9-prozess-tab')
      await page.waitForTimeout(1500)
    } else {
      logSoft(9, 'Prozess-Tab nicht gefunden — FallakteShell.tsx prüfen')
      notes.push('SOFT: Prozess-Tab nicht gefunden in /faelle/[id] — Tab ggf. für diese Rolle ausgeblendet')
      result = 'soft'
    }

    // Screenshot Prozess-Tab-Zustand
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase9-prozess-state.png`,
    }).catch(() => {})

    // --- Schritt 9c: "Fall an LexDrive übergeben" suchen -------------------
    // _prozess/Sections.tsx:595: Button "Fall an LexDrive übergeben"
    // LexDriveTriggerPanel hat eine Auswahl-Liste mit Event-Buttons
    logPhase(9, 'Suche LexDrive-Übergabe-Button im Prozess-Tab')

    const freigebeSelectors = [
      page.getByRole('button', { name: /Fall an LexDrive übergeben/i }),
      page.getByRole('button', { name: /LexDrive.*übergeben/i }),
      page.getByRole('button', { name: /Kanzlei.*übergeben/i }),
      page.getByRole('button', { name: /Kanzlei übergeben/i }),
      page.getByRole('button', { name: /Freigeben/i }),
      page.locator('[data-testid="kanzlei-freigabe-btn"]'),
    ]

    let freigebeBtn = null
    for (const btn of freigebeSelectors) {
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        freigebeBtn = btn
        break
      }
    }

    if (freigebeBtn) {
      logPhase(9, 'LexDrive-Übergabe-Button gefunden — klicke')
      await clickAndShoot(page, freigebeBtn, 'phase9-kanzlei-freigabe')
      await page.waitForTimeout(3000)

      // Bestätigungs-Dialog
      const confirmBtn = page.getByRole('button', { name: /Bestätigen|Ja|OK/i }).first()
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clickAndShoot(page, confirmBtn, 'phase9-freigabe-confirm')
        await page.waitForTimeout(2000)
      }

      logPhase(9, `Nach Freigabe URL: ${page.url()}`)
    } else {
      const msg = 'LexDrive-Übergabe-Button nicht gefunden im Prozess-Tab'
      logSoft(9, msg)
      notes.push(`SOFT: ${msg} — _prozess/Sections.tsx:595. Möglicherweise: Prozess-Tab nicht aktiv, faelle.status passt nicht, oder Rolle sieht Button nicht`)
      result = 'soft'
    }

    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase9-nach-freigabe.png`,
    }).catch(() => {})

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 9 UI: ${err.message}`
    logSoft(9, msg)
    notes.push(`SOFT: ${msg}`)
    result = 'soft'
  } finally {
    if (page) await page.close().catch(() => {})
  }

  // --- Workaround: Service-Role-Mutate -----------------------------------
  await new Promise((r) => setTimeout(r, 1500))

  if (fallId) {
    const { data: fallRow } = await db.from('faelle').select('status').eq('id', fallId).maybeSingle()
    if (fallRow?.status !== 'kanzlei-uebergeben') {
      const { error } = await db.from('faelle').update({ status: 'kanzlei-uebergeben' }).eq('id', fallId)
      if (error) {
        notes.push(`SOFT: faelle.status=kanzlei-uebergeben Workaround fehlgeschlagen: ${error.message}`)
      } else {
        logPhase(9, 'Workaround: faelle.status=kanzlei-uebergeben gesetzt')
        notes.push('SOFT: faelle.status=kanzlei-uebergeben via Service-Role gesetzt (UI-Freigabe nicht vollständig)')
        result = result === 'hard' ? 'hard' : 'soft'
      }
    } else {
      logPhase(9, 'faelle.status=kanzlei-uebergeben — UI-Freigabe hat funktioniert!')
    }

    // lexdrive_events prüfen
    const { data: lexEvents } = await db
      .from('lexdrive_events')
      .select('id, typ, fall_id')
      .eq('fall_id', fallId)
      .limit(5)

    if (!lexEvents || lexEvents.length === 0) {
      notes.push('SOFT: lexdrive_events: Kein Insert für diesen Fall — LexDrive-Webhook wurde nicht ausgelöst. Prüfe: src/lib/lexdrive/process-event.ts und Kanzlei-Übergabe-Action')
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(9, `lexdrive_events: ${lexEvents.length} Event(s) gefunden`)
    }
  } else {
    notes.push('SOFT: fallId nicht bekannt — faelle.status + lexdrive_events Assert übersprungen')
    result = result === 'hard' ? 'hard' : 'soft'
  }

  logPhase(9, `Phase 9 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 9, result, notes, fallId }
}
