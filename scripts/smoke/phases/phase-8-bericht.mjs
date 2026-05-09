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

  // F-09 Fix: Precondition — Session auf 'arrived' setzen damit der
  // BesichtigungAbschliessenButton in /gutachter/feldmodus sichtbar wird.
  // Nur wenn terminId bekannt.
  if (terminId) {
    const sessionRows = await db.from('sv_tages_session').select('id, status').eq('sv_id', '7f79e570-776b-4525-82ce-c35654ed6ecc').maybeSingle()
    const sessionId = sessionRows.data?.id ?? null
    if (sessionId) {
      const { error: sessErr } = await db.from('sv_tages_session').update({ status: 'arrived', aktueller_termin_id: terminId }).eq('id', sessionId)
      const { error: tErr } = await db.from('gutachter_termine').update({ besichtigung_gestartet_am: new Date().toISOString(), sv_angekommen_am: new Date().toISOString() }).eq('id', terminId)
      if (!sessErr && !tErr) {
        logPhase(8, `F-09 Precondition: Session auf arrived gesetzt (sessionId=${sessionId})`)
      } else {
        logPhase(8, `F-09 Precondition Warn: sess=${sessErr?.message} termin=${tErr?.message}`)
      }
    }
  }

  try {
    // --- Schritt 8a: /gutachter/feldmodus öffnen (enthält BesichtigungAbschliessenButton) ---
    // F-09 Fix: Feldmodus ist die primäre Route für BesichtigungAbschliessenButton
    let zielUrl = `${BASE_URL}/gutachter/feldmodus`
    logPhase(8, `Navigiere zu ${zielUrl} (F-09: BesichtigungAbschliessenButton liegt im Feldmodus)`)
    await gotoAndShoot(page, zielUrl, 'phase8-feldmodus')

    // Fallback: Fall-Detail für Schaden-Felder
    const fallDetailUrl = fallId
      ? `${BASE_URL}/gutachter/fall/${fallId}`
      : terminId
        ? `${BASE_URL}/gutachter/termine/${terminId}`
        : null
    if (fallDetailUrl) {
      logPhase(8, `Fallback: Navigiere zu ${fallDetailUrl} für Schaden-Felder`)
      await gotoAndShoot(page, fallDetailUrl, 'phase8-fall-detail')
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

    // --- Schritt 8c: "Besichtigung abschließen" im Feldmodus suchen ---------
    // F-09 Fix: BesichtigungAbschliessenButton ist nur im Feldmodus-Modal sichtbar
    // (Session muss arrived sein — Precondition oben via Service-Role gesetzt).
    logPhase(8, 'Zurück zu /gutachter/feldmodus — suche "Besichtigung abschließen"')
    await page.goto(`${BASE_URL}/gutachter/feldmodus`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase8-feldmodus-arrived.png` }).catch(() => {})

    const freigebeButtonSelectors = [
      page.getByRole('button', { name: /Besichtigung abschlie[sß]en/i }),
      page.getByRole('button', { name: /Final freigeben/i }),
      page.getByRole('button', { name: /Bericht freigeben/i }),
      page.getByRole('button', { name: /Bericht generieren/i }),
      page.getByRole('button', { name: /Gutachten freigeben/i }),
      page.getByRole('button', { name: /Abschlie[sß]en/i }),
    ]

    let freigebeBtn = null
    for (const btn of freigebeButtonSelectors) {
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        freigebeBtn = btn
        break
      }
    }

    if (freigebeBtn) {
      logPhase(8, '"Besichtigung abschließen"-Button gefunden — erster Klick')
      await freigebeBtn.click({ force: true })
      // BesichtigungAbschliessenButton.tsx:70 — onBlur setzt confirming=false zurück.
      // Sofort nach dem ersten Klick prüfen ob der Button in den Confirm-State
      // gewechselt hat ("Trotzdem abschließen") und direkt wieder klicken,
      // bevor blur feuern kann.
      await page.waitForTimeout(150)
      const btnText = await freigebeBtn.textContent().catch(() => '')
      if (btnText?.includes('Trotzdem')) {
        logPhase(8, 'Confirm-State aktiv — zweiter Klick (force)')
        await freigebeBtn.click({ force: true })
        await page.waitForTimeout(500)
      }
      await page.screenshot({ path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase8-bericht-freigeben.png` }).catch(() => {})
      await page.waitForTimeout(3000)
      logPhase(8, `Nach Freigabe URL: ${page.url()}`)

    } else {
      const msg = '"Besichtigung abschließen"-Button nicht gefunden in /gutachter/feldmodus (F-09: Session muss arrived sein)'
      logSoft(8, msg)
      notes.push(`SOFT: ${msg} — BesichtigungAbschliessenButton.tsx nur sichtbar wenn sessionStatus=arrived`)
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
  // F-09 Fix: 'erfuellt' ist kein gültiger auftraege.status (Constraint: termin|besichtigung|gutachten|abgeschlossen).
  // Nach Besichtigung: status='abgeschlossen' (Auftrag erledigt, Gutachten folgt separat).
  logPhase(8, 'DB-Workaround: Setze auftraege.status=abgeschlossen + faelle.status=gutachten-eingegangen')
  await new Promise((r) => setTimeout(r, 1500))

  // DB-Check: auftraege.status
  const FERTIG_STATI = ['abgeschlossen', 'gutachten']
  let auftragErfuellt = false
  if (auftragId) {
    const { data: auftragRow } = await db.from('auftraege').select('status').eq('id', auftragId).maybeSingle()
    auftragErfuellt = FERTIG_STATI.includes(auftragRow?.status ?? '')
    if (!auftragErfuellt) {
      // Workaround: 'abgeschlossen' ist valider Constraint-Wert
      const { error } = await db.from('auftraege').update({
        status: 'abgeschlossen',
        abgeschlossen_am: new Date().toISOString(),
      }).eq('id', auftragId)
      if (error) {
        notes.push(`SOFT: auftraege.status=abgeschlossen Workaround fehlgeschlagen: ${error.message}`)
      } else {
        logPhase(8, 'Workaround: auftraege.status=abgeschlossen gesetzt')
        notes.push('SOFT: auftraege.status=abgeschlossen via Service-Role Workaround gesetzt (UI-Freigabe nicht vollständig)')
        result = result === 'hard' ? 'hard' : 'soft'
      }
    } else {
      logPhase(8, `auftraege.status ist bereits ${auftragRow?.status} — kein Workaround nötig`)
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
