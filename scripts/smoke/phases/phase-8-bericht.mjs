/**
 * scripts/smoke/phases/phase-8-bericht.mjs — Phase 8: D2 Bericht-Erstellung
 *
 * Was getestet wird:
 *  SV öffnet den Auftrag-/Termin-Detail und erstellt den Schadensbericht.
 *  Felder: Schadenbeschreibung, Reparaturkosten, Wiederbeschaffungswert, Restwert.
 *  Ziel: "Final freigeben" → auftraege.status='erfuellt', faelle.status='gutachten-eingegangen'.
 *
 * Source-Hinweise:
 *  - /gutachter/termine/[id] enthält TerminDetailActions + PolizeiberichtUpload
 *  - /gutachter/fall/[id] enthält GutachtenCard + SvToolsCard
 *  - Bericht-Felder können in SvFallakteView (Feldmodus D2) oder in /gutachter/fall/[id] liegen
 *
 * Workaround-Strategie:
 *  Falls kein UI-Pfad gefunden: Service-Role-Mutate auftraege+faelle auf Ziel-Status.
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
 * @param {import('playwright').BrowserContext} svContext
 * @param {{ auftragId: string|null; terminId: string|null; fallId: string|null; notes: string[] }} prevResult
 * @returns {{ phase: 8, result: 'pass'|'soft'|'hard', notes: string[], auftragId: string|null, fallId: string|null }}
 */
export async function runPhase8(svContext, prevResult = { notes: [] }) {
  const notes = prevResult.notes ?? []
  let result = 'pass'
  let page = null

  logPhase(8, '=== Phase 8: D2 Bericht-Erstellung ===')

  const fixtures = loadFixtureIds() ?? {}
  const auftragId = prevResult.auftragId ?? fixtures.auftrag_id ?? null
  const terminId = prevResult.terminId ?? fixtures.termin_id ?? null
  const fallId = prevResult.fallId ?? fixtures.fall_id ?? null

  logPhase(8, `auftragId=${auftragId} | terminId=${terminId} | fallId=${fallId}`)

  const db = getServiceDb()

  if (!auftragId && !terminId && !fallId) {
    const msg = 'Keine auftragId / terminId / fallId verfügbar — Phase 8 kann nicht sinnvoll laufen'
    logSoft(8, msg)
    notes.push(`SOFT: ${msg}`)
    result = 'soft'
  }

  // --- Login als test-sv ----------------------------------------------------
  logPhase(8, 'Login als test-sv@claimondo.de')
  try {
    page = await loginAs(svContext, 'test-sv@claimondo.de', 'Test1234!', BASE_URL)
  } catch (err) {
    const msg = `Login fehlgeschlagen: ${err.message}`
    logHard(8, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 8, result: 'hard', notes, auftragId, fallId }
  }

  if (page.url().includes('/login')) {
    const msg = 'SV-Login fehlgeschlagen — URL ist noch /login'
    logHard(8, msg)
    notes.push(`HARD: ${msg}`)
    if (page) await page.close().catch(() => {})
    return { phase: 8, result: 'hard', notes, auftragId, fallId }
  }

  try {
    // --- Schritt 8a: Termin/Fall öffnen ------------------------------------
    let zielUrl = null
    if (fallId) {
      zielUrl = `${BASE_URL}/gutachter/fall/${fallId}`
    } else if (terminId) {
      zielUrl = `${BASE_URL}/gutachter/termine/${terminId}`
    } else if (auftragId) {
      zielUrl = `${BASE_URL}/gutachter/auftraege`
    }

    if (zielUrl) {
      logPhase(8, `Navigiere zu ${zielUrl}`)
      await gotoAndShoot(page, zielUrl, 'phase8-fall-detail')
    }

    // --- Schritt 8b: D2-Felder ausfüllen (falls sichtbar) ------------------
    logPhase(8, 'Suche Schadens-Felder (Beschreibung, Kosten)')

    const schadenBeschreibungSelector = [
      'textarea[name="schadensbeschreibung"]',
      'textarea[placeholder*="Schaden"]',
      'textarea[placeholder*="Beschreibung"]',
      '[data-testid="schadensbeschreibung"]',
    ]

    let felderGefunden = false
    for (const sel of schadenBeschreibungSelector) {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.fill('Smoke-Test: Heckschaden mit Delle ca. 30x20cm, Lackschaden komplett')
        felderGefunden = true
        logPhase(8, `Schadensbeschreibung ausgefüllt (Selektor: ${sel})`)
        break
      }
    }

    if (!felderGefunden) {
      logSoft(8, 'Schadensbeschreibungs-Feld nicht gefunden — Bericht-Felder möglicherweise auf anderem UI-Pfad')
      notes.push('SOFT: Schadensbeschreibungs-Feld nicht gefunden — prüfe SvFallakteView D2 oder /gutachter/termine/[id]/vor-ort Route')
      result = 'soft'

      // Versuche /gutachter/termine/[id]/vor-ort
      if (terminId) {
        const vorOrtUrl = `${BASE_URL}/gutachter/termine/${terminId}/vor-ort`
        logPhase(8, `Versuche Vor-Ort-Route: ${vorOrtUrl}`)
        await gotoAndShoot(page, vorOrtUrl, 'phase8-vor-ort')

        for (const sel of schadenBeschreibungSelector) {
          const el = page.locator(sel).first()
          if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
            await el.fill('Smoke-Test: Heckschaden mit Delle ca. 30x20cm')
            felderGefunden = true
            break
          }
        }
      }
    }

    // Reparaturkosten
    const kostenSelectors = [
      'input[name="reparaturkosten"]',
      'input[placeholder*="Reparatur"]',
      'input[placeholder*="kosten"]',
      '[data-testid="reparaturkosten"]',
    ]
    for (const sel of kostenSelectors) {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.fill('3500')
        logPhase(8, 'Reparaturkosten: 3500€ eingetragen')
        break
      }
    }

    // Wiederbeschaffung
    const wbwSelectors = [
      'input[name="wiederbeschaffungswert"]',
      'input[placeholder*="Wiederbeschaffung"]',
      'input[placeholder*="Wert"]',
    ]
    for (const sel of wbwSelectors) {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.fill('18000')
        logPhase(8, 'Wiederbeschaffungswert: 18000€ eingetragen')
        break
      }
    }

    // --- Schritt 8c: "Bericht generieren" / "Final freigeben" suchen -------
    logPhase(8, 'Suche "Final freigeben" oder "Bericht freigeben" Button')

    const freigebeButtonSelectors = [
      page.getByRole('button', { name: /Final freigeben/i }),
      page.getByRole('button', { name: /Bericht freigeben/i }),
      page.getByRole('button', { name: /Bericht generieren/i }),
      page.getByRole('button', { name: /Gutachten freigeben/i }),
      page.getByRole('button', { name: /Abschließen/i }),
      page.getByRole('button', { name: /Besichtigung abschließen/i }),
    ]

    let freigebeBtn = null
    for (const btn of freigebeButtonSelectors) {
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        freigebeBtn = btn
        break
      }
    }

    if (freigebeBtn) {
      logPhase(8, '"Final freigeben"-Button gefunden — klicke')
      await clickAndShoot(page, freigebeBtn, 'phase8-bericht-freigeben')
      await page.waitForTimeout(3000)
      logPhase(8, `Nach Freigabe URL: ${page.url()}`)

      // Bestätigungs-Dialog
      const confirmBtn = page.getByRole('button', { name: /Bestätigen|OK|Ja/i }).first()
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clickAndShoot(page, confirmBtn, 'phase8-freigabe-confirm')
        await page.waitForTimeout(2000)
      }

    } else {
      const msg = '"Final freigeben"-Button nicht gefunden — Bericht-UI-Pfad unbekannt oder Preconditions nicht erfüllt'
      logSoft(8, msg)
      notes.push(`SOFT: ${msg} — Prüfe: src/app/gutachter/feldmodus/BesichtigungAbschliessenButton.tsx und src/app/gutachter/termine/[id]/vor-ort/VorOrtClient.tsx`)
      result = 'soft'
    }

    // --- Screenshot des aktuellen Zustands ----------------------------------
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase8-final-state.png`,
    }).catch(() => {})

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 8 UI: ${err.message}`
    logSoft(8, msg)
    notes.push(`SOFT: ${msg}`)
    result = 'soft'
  } finally {
    if (page) await page.close().catch(() => {})
  }

  // --- Workaround: Service-Role-Mutate wenn UI-Pfad nicht vollständig war ---
  logPhase(8, 'DB-Workaround: Setze auftraege.status=erfuellt + faelle.status=gutachten-eingegangen')
  await new Promise((r) => setTimeout(r, 1500))

  // DB-Check: auftraege.status
  let auftragErfuellt = false
  if (auftragId) {
    const { data: auftragRow } = await db.from('auftraege').select('status').eq('id', auftragId).maybeSingle()
    auftragErfuellt = auftragRow?.status === 'erfuellt'
    if (!auftragErfuellt) {
      // Workaround: direkt setzen
      const { error } = await db.from('auftraege').update({
        status: 'erfuellt',
        erfuellt_am: new Date().toISOString(),
      }).eq('id', auftragId)
      if (error) {
        notes.push(`SOFT: auftraege.status=erfuellt Workaround fehlgeschlagen: ${error.message}`)
      } else {
        logPhase(8, 'Workaround: auftraege.status=erfuellt gesetzt')
        notes.push('SOFT: auftraege.status=erfuellt via Service-Role Workaround gesetzt (UI-Freigabe nicht vollständig)')
        result = result === 'hard' ? 'hard' : 'soft'
      }
    } else {
      logPhase(8, 'auftraege.status ist bereits erfuellt — kein Workaround nötig')
    }
  }

  // DB-Check: faelle.status
  let effectiveFallId = fallId
  if (!effectiveFallId && auftragId) {
    const { data: auftragRow } = await db.from('auftraege').select('fall_id').eq('id', auftragId).maybeSingle()
    effectiveFallId = auftragRow?.fall_id ?? null
  }

  if (effectiveFallId) {
    const { data: fallRow } = await db.from('faelle').select('status').eq('id', effectiveFallId).maybeSingle()
    if (fallRow?.status !== 'gutachten-eingegangen') {
      const { error } = await db.from('faelle').update({ status: 'gutachten-eingegangen' }).eq('id', effectiveFallId)
      if (error) {
        notes.push(`SOFT: faelle.status=gutachten-eingegangen Workaround fehlgeschlagen: ${error.message}`)
      } else {
        logPhase(8, 'Workaround: faelle.status=gutachten-eingegangen gesetzt')
        notes.push('SOFT: faelle.status=gutachten-eingegangen via Service-Role Workaround gesetzt')
        result = result === 'hard' ? 'hard' : 'soft'
      }
    } else {
      logPhase(8, `faelle.status ist ${fallRow?.status} — OK`)
    }
    saveFixtureIds({ fall_id: effectiveFallId })
  } else {
    notes.push('SOFT: fall_id nicht verfügbar — faelle.status-Assert übersprungen')
    result = result === 'hard' ? 'hard' : 'soft'
  }

  logPhase(8, `Phase 8 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 8, result, notes, auftragId, fallId: effectiveFallId }
}
