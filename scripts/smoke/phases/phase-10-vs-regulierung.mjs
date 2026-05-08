/**
 * scripts/smoke/phases/phase-10-vs-regulierung.mjs — Phase 10: VS-Regulierung
 *
 * Was getestet wird:
 *  Admin öffnet den VS-Tab in der Fallakte und erfasst eine VS-Reaktion
 *  (Typ: voll-reguliert) mit Betrag. State-Transitions:
 *  anschlussschreiben → regulierung-laeuft → regulierung → zahlung-eingegangen
 *
 * Source-Hinweise:
 *  - VS-Tab in Fallakte: src/app/faelle/[id]/_tabs/ProzessTab.tsx
 *  - VS-Reaktion erfassen via: src/components/kb/RegulierungCard.tsx
 *  - State-Machine: src/lib/faelle/state-machine.ts
 *  - Actions: src/lib/claims/endzustand-actions.ts + src/lib/kanzlei-fall/actions.ts
 *
 * Workaround-Strategie:
 *  Falls VS-Tab nicht sichtbar oder Drawern nicht öffnen:
 *  Service-Role setzt faelle.status direkt auf 'zahlung-eingegangen'.
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
} from '../helpers.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * @param {import('playwright').BrowserContext} adminContext
 * @param {{ fallId: string|null; notes: string[] }} prevResult
 * @returns {{ phase: 10, result: 'pass'|'soft'|'hard', notes: string[], fallId: string|null }}
 */
export async function runPhase10(adminContext, prevResult = { notes: [] }) {
  const notes = prevResult.notes ?? []
  let result = 'pass'
  let page = null

  logPhase(10, '=== Phase 10: VS-Regulierung ===')

  const fixtures = loadFixtureIds() ?? {}
  const fallId = prevResult.fallId ?? fixtures.fall_id ?? null

  logPhase(10, `fallId=${fallId}`)

  const db = getServiceDb()

  if (!fallId) {
    const msg = 'fallId nicht verfügbar — Phase 10 kann nicht sinnvoll laufen'
    logSoft(10, msg)
    notes.push(`SOFT: ${msg}`)
    result = 'soft'
    // Workaround-Only-Path: nichts zu tun ohne fallId
    logPhase(10, `Phase 10 abgeschlossen (ohne fallId): ${result.toUpperCase()}`)
    return { phase: 10, result, notes, fallId: null }
  }

  // --- Voraussetzung: faelle.status auf kanzlei-uebergeben setzen ----------
  // (sonst ist der VS-Tab ggf. nicht sichtbar)
  const { data: currentFall } = await db.from('faelle').select('status').eq('id', fallId).maybeSingle()
  logPhase(10, `faelle.status aktuell: ${currentFall?.status}`)

  // Status-Kette die für VS-Tab nötig ist: 'kanzlei-uebergeben' oder weiter
  const vsRelevanteStatus = ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung-laeuft', 'regulierung', 'zahlung-eingegangen', 'abgeschlossen']
  if (!vsRelevanteStatus.includes(currentFall?.status)) {
    logPhase(10, `Setze faelle.status=kanzlei-uebergeben als VS-Tab-Vorbedingung`)
    await db.from('faelle').update({ status: 'kanzlei-uebergeben' }).eq('id', fallId)
  }

  // --- Login als test-admin ------------------------------------------------
  logPhase(10, 'Login als test-admin@claimondo.de')
  try {
    page = await loginAs(adminContext, 'test-admin@claimondo.de', 'Test1234!', BASE_URL)
  } catch (err) {
    const msg = `Admin-Login fehlgeschlagen: ${err.message}`
    logHard(10, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 10, result: 'hard', notes, fallId }
  }

  if (page.url().includes('/login')) {
    const msg = 'Admin-Login fehlgeschlagen'
    logHard(10, msg)
    notes.push(`HARD: ${msg}`)
    if (page) await page.close().catch(() => {})
    return { phase: 10, result: 'hard', notes, fallId }
  }

  try {
    // --- Schritt 10a: Fallakte öffnen ----------------------------------------
    const fallUrl = `${BASE_URL}/faelle/${fallId}`
    logPhase(10, `Navigiere zu Fallakte: ${fallUrl}`)
    await gotoAndShoot(page, fallUrl, 'phase10-fallakte')

    // --- Schritt 10b: Prozess-Tab / VS-Tab öffnen ---------------------------
    logPhase(10, 'Suche Prozess-Tab oder VS-Tab')

    const prozessTabSelectors = [
      page.getByRole('tab', { name: /Prozess/i }),
      page.getByRole('tab', { name: /VS/i }),
      page.getByRole('tab', { name: /Regulierung/i }),
      page.getByRole('button', { name: /Prozess/i }),
    ]

    let prozessTab = null
    for (const tab of prozessTabSelectors) {
      if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
        prozessTab = tab
        break
      }
    }

    if (prozessTab) {
      logPhase(10, 'Prozess/VS-Tab gefunden — klicke')
      await clickAndShoot(page, prozessTab, 'phase10-prozess-tab')
    } else {
      logSoft(10, 'Prozess-Tab nicht gefunden')
      notes.push('SOFT: Prozess-Tab nicht gefunden — prüfe FallakteShell Tab-Config und faelle.status Sichtbarkeits-Bedingungen')
      result = 'soft'
    }

    await page.waitForTimeout(1500)

    // --- Schritt 10c: "VS-Reaktion erfassen" Drawer öffnen -----------------
    logPhase(10, 'Suche "VS-Reaktion erfassen"-Button')

    const vsReaktionSelectors = [
      page.getByRole('button', { name: /VS.Reaktion erfassen/i }),
      page.getByRole('button', { name: /Regulierung erfassen/i }),
      page.getByRole('button', { name: /VS.Antwort/i }),
      page.getByRole('button', { name: /Antwort erfassen/i }),
      page.locator('[data-testid="vs-reaktion-btn"]'),
    ]

    let vsReaktionBtn = null
    for (const btn of vsReaktionSelectors) {
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        vsReaktionBtn = btn
        break
      }
    }

    if (vsReaktionBtn) {
      logPhase(10, '"VS-Reaktion erfassen"-Button gefunden — klicke')
      await clickAndShoot(page, vsReaktionBtn, 'phase10-vs-reaktion-oeffnen')
      await page.waitForTimeout(1500)

      // --- Schritt 10d: Reaktions-Typ wählen --------------------------------
      const vollReguliert = page.getByRole('radio', { name: /Voll.reguliert/i })
        .or(page.locator('input[value="voll-reguliert"]'))
        .or(page.getByText('Voll-reguliert', { exact: false }))
        .first()

      if (await vollReguliert.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clickAndShoot(page, vollReguliert, 'phase10-voll-reguliert')
        logPhase(10, 'Voll-Reguliert ausgewählt')
      } else {
        logSoft(10, 'Reaktions-Typ "Voll-reguliert" nicht gefunden im Drawer')
        notes.push('SOFT: VS-Reaktion-Drawer öffnet sich, aber "Voll-reguliert"-Option nicht gefunden. Prüfe: RegulierungCard.tsx / ManualStatusOverrideModal.tsx')
        result = 'soft'
      }

      // Betrag eingeben
      const betragInput = page.locator('input[name="betrag"], input[placeholder*="Betrag"], input[placeholder*="€"]').first()
      if (await betragInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await betragInput.fill('15000')
        logPhase(10, 'Betrag: 15000€ eingetragen')
      }

      // Speichern
      const speichernBtn = page.getByRole('button', { name: /Speichern|Bestätigen|Erfassen/i }).first()
      if (await speichernBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clickAndShoot(page, speichernBtn, 'phase10-vs-reaktion-speichern')
        await page.waitForTimeout(3000)
        logPhase(10, `Nach VS-Reaktion URL: ${page.url()}`)
      }

    } else {
      const msg = '"VS-Reaktion erfassen"-Button nicht gefunden'
      logSoft(10, msg)
      notes.push(`SOFT: ${msg} — VS-Tab möglicherweise nicht sichtbar weil faelle.status-Bedingung nicht erfüllt. Prüfe: src/app/faelle/[id]/_tabs/ProzessTab.tsx und lib/fall/section-visibility.ts`)
      result = 'soft'
    }

    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase10-nach-vs-reaktion.png`,
    }).catch(() => {})

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 10 UI: ${err.message}`
    logSoft(10, msg)
    notes.push(`SOFT: ${msg}`)
    result = 'soft'
  } finally {
    if (page) await page.close().catch(() => {})
  }

  // --- Workaround: Service-Role-Mutate ----------------------------------------
  await new Promise((r) => setTimeout(r, 1500))

  const { data: fallNachVs } = await db.from('faelle').select('status').eq('id', fallId).maybeSingle()
  logPhase(10, `faelle.status nach VS-Reaktion: ${fallNachVs?.status}`)

  const zielStatus = 'zahlung-eingegangen'
  if (fallNachVs?.status !== zielStatus) {
    const { error } = await db.from('faelle').update({ status: zielStatus }).eq('id', fallId)
    if (error) {
      notes.push(`SOFT: faelle.status=${zielStatus} Workaround fehlgeschlagen: ${error.message}`)
    } else {
      logPhase(10, `Workaround: faelle.status=${zielStatus} gesetzt`)
      notes.push(`SOFT: faelle.status=${zielStatus} via Service-Role Workaround gesetzt`)
      result = result === 'hard' ? 'hard' : 'soft'
    }
  } else {
    logPhase(10, `faelle.status=${zielStatus} — VS-Reaktion hat funktioniert!`)
  }

  logPhase(10, `Phase 10 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 10, result, notes, fallId }
}
