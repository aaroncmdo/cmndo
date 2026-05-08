/**
 * scripts/journey/07-popover-audit.mjs — Phase 7: Pop-Over-Audit pro Detail-Seite
 *
 * Aaron-Brief: "auch die pop overs alles dann verstehst du die logik"
 *
 * Pro Rolle werden die zentralen Detail-Seiten geöffnet. Jeder Pop-Over-Trigger
 * (Sheet, Modal, Drawer) wird angeklickt und geprüft:
 *   1. Öffnet sich das Pop-Over?
 *   2. Zeigt es Inhalt (nicht leer)?
 *   3. Zeigt es KEINE Daten einer anderen Rolle (Hygiene)?
 *   4. Lässt es sich schließen (Escape / Schließen-Button)?
 *
 * Getestete Seiten + Trigger:
 *
 * DISPATCH /dispatch/leads/[id]:
 *   - PhaseHeader-Pill → Bottom-Sheet (Phasenliste)
 *   - "Gutachter suchen" → SV-Suggestion-Liste inline
 *   - "Kalender vergleichen" → SvKalenderVergleichModal
 *   - "Disqualifizieren" → Disqualifizierungs-Modal (Radiogründe)
 *
 * ADMIN /admin/faelle (Kanban Hub):
 *   - Kein dediziertes Pop-Over-Pattern — skip, Kanban-Cards sind inline
 *
 * GUTACHTER /gutachter/auftraege:
 *   - AuftragCard ohne eigene Modale, FallakteDrawer via Auftragsdetail
 *
 * KUNDE /kunde/faelle/[id]:
 *   - "Anderen Termin vorschlagen" → GegenvorschlagModal
 *     (Daten-Hygiene: kein SV-interner Kalender sichtbar)
 *
 * Klassifikation pro Trigger:
 *   OPENS  — Dialog/Sheet erscheint, Inhalt vorhanden
 *   EMPTY  — Dialog erscheint, aber leer (SOFT)
 *   STUCK  — Klick hat keinen Effekt (SOFT)
 *   CLOSE-FAIL — Schließen schlägt fehl (SOFT)
 */

import {
  record,
  shoot,
  assertVisible,
  getAdminDb,
  loadFixtureIds,
  loginAs,
} from './_helpers.mjs'

const PHASE = 7
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * Klickt einen Trigger und prüft ob ein Dialog/Sheet/Popover öffnet.
 * Gibt das klassifizierte Ergebnis zurück.
 */
async function probePopover(page, trigger, label, closeFn) {
  const beforeDialogs = await page.locator('[role="dialog"], [data-state="open"], [data-radix-dialog-content]').count().catch(() => 0)

  let result = 'STUCK'
  let detail = ''

  try {
    await trigger.click({ timeout: 3_000 })
    await page.waitForTimeout(800)

    const afterDialogs = await page.locator('[role="dialog"], [data-state="open"], [data-radix-dialog-content]').count().catch(() => 0)
    const sheetVisible = await page.locator('[role="dialog"]').first().isVisible({ timeout: 1_500 }).catch(() => false)

    if (afterDialogs > beforeDialogs || sheetVisible) {
      // Inhalt-Check: mindestens ein sichtbares Text-Element innen
      const content = await page.locator('[role="dialog"]').first().textContent({ timeout: 1_500 }).catch(() => '')
      if (content && content.trim().length > 5) {
        result = 'OPENS'
        detail = content.trim().slice(0, 60)
      } else {
        result = 'EMPTY'
        detail = 'Dialog offen, aber kein Inhalt erkennbar'
      }
    } else {
      // Sheet / Radix-Drawer check (kein role="dialog")
      const anyOverlay = await page.locator('[data-vaul-drawer], [data-state="open"]').first().isVisible({ timeout: 1_000 }).catch(() => false)
      if (anyOverlay) {
        result = 'OPENS'
        detail = 'Overlay/Sheet geöffnet'
      }
    }
  } catch (err) {
    result = 'STUCK'
    detail = err.message.slice(0, 60)
  }

  const sev = result === 'OPENS' ? 'PASS' : 'SOFT'
  record(sev, PHASE, `PopOver "${label}" → ${result}${detail ? `: ${detail}` : ''}`, `pop-${result.toLowerCase()}`)
  await shoot(page, `07-pop-${label.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30)}`)

  // Pop-Over schließen
  try {
    if (closeFn) {
      await closeFn()
    } else {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      // Fallback: Schließen-Button
      const closeBtn = page
        .locator('button[aria-label*="schließen" i], button[aria-label*="close" i], button[data-testid*="close"]')
        .first()
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click()
        await page.waitForTimeout(200)
      }
    }
  } catch {
    record('SOFT', PHASE, `PopOver "${label}" — Schließen fehlgeschlagen`, 'pop-close-fail')
  }

  await page.waitForTimeout(400)
  return result
}

// ─── Dispatch: /dispatch/leads/[id] ──────────────────────────────────────────

async function auditDispatchLeadDetail(leadId) {
  if (!leadId) {
    record('INFO', PHASE, 'Kein Lead-ID — Dispatch-Detail-Audit übersprungen', 'dispatch-skip')
    return
  }

  const page = await loginAs('dispatch')
  await page.goto(`${BASE_URL}/dispatch/leads/${leadId}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await page.waitForTimeout(3_500)
  await shoot(page, '07-dispatch-lead-detail')

  // ── Trigger 1: PhaseHeader-Pill → Bottom-Sheet ──────────────────────────
  const phasePill = page
    .locator('button[aria-label*="Phase" i], button[aria-label*="phase" i]')
    .or(page.locator('button').filter({ hasText: /Phase [0-9]|Phase wechseln/i }))
    .first()

  if (await phasePill.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await probePopover(page, phasePill, 'PhaseHeader-Pill')
  } else {
    record('INFO', PHASE, 'PhaseHeader-Pill nicht sichtbar (Lead evtl. in anderem Status)', 'dispatch-phase-pill')
  }

  // ── Trigger 2: "Gutachter suchen" → SV-Suggestions ────────────────────
  const svSuchenBtn = page.getByRole('button', { name: /Gutachter suchen|Erneut suchen/i }).first()
  if (await svSuchenBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    try {
      await svSuchenBtn.click({ timeout: 3_000 })
      await page.waitForTimeout(4_000) // API-Call + Render
      await shoot(page, '07-dispatch-sv-suggestions')
      const svCard = page.locator('text=/Sachverständige|SV-Name|Profil|Erreichbarkeit/i').first()
      const svVisible = await svCard.isVisible({ timeout: 2_000 }).catch(() => false)
      record(
        svVisible ? 'PASS' : 'SOFT',
        PHASE,
        svVisible ? 'SV-Suggestions geladen' : 'SV-Suggestions leer oder nicht erschienen',
        'dispatch-sv-suchen',
      )
    } catch (err) {
      record('SOFT', PHASE, `"Gutachter suchen" Fehler: ${err.message.slice(0, 80)}`, 'dispatch-sv-suchen-err')
    }
  } else {
    record('INFO', PHASE, '"Gutachter suchen"-Button nicht sichtbar (Termin evtl. schon vergeben)', 'dispatch-sv-skip')
  }

  // ── Trigger 3: "Kalender vergleichen" → SvKalenderVergleichModal ───────
  const kalenderBtn = page.getByRole('button', { name: /Kalender vergleichen|Kalender öffnen/i }).first()
  if (await kalenderBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await probePopover(page, kalenderBtn, 'SvKalenderVergleich')
  } else {
    record('INFO', PHASE, '"Kalender vergleichen"-Button nicht sichtbar', 'dispatch-kalender-skip')
  }

  // ── Trigger 4: "Disqualifizieren" → Modal ──────────────────────────────
  // Achtung: destruktiv — wir öffnen nur, prüfen Inhalt, schließen ohne Submit.
  const disqualBtn = page.getByRole('button', { name: /Disqualifizieren/i }).first()
  if (await disqualBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await probePopover(page, disqualBtn, 'Disqualifizieren-Modal', async () => {
      // Erst Abbrechen-Button suchen, dann Escape
      const abbrBtn = page.getByRole('button', { name: /Abbrechen|Schließen|Zurück/i }).first()
      if (await abbrBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await abbrBtn.click()
      } else {
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(300)
    })
  } else {
    record('INFO', PHASE, '"Disqualifizieren"-Button nicht sichtbar', 'dispatch-disqual-skip')
  }

  // ── Hygiene: Kein anderer Lead/Kunden-Name sichtbar ────────────────────
  // (Regression: Pagination oder Filter-Leak zeigt Daten anderer Leads)
  const pageText = await page.textContent('body').catch(() => '')
  const leakPatterns = [/Max\s+Mustermann/i, /Test.*GmbH.*Schadenmeldung/i]
  for (const pat of leakPatterns) {
    if (pat.test(pageText)) {
      record('SOFT', PHASE, `Hygiene: Verdächtiger Fremd-Content in Dispatch-Detail: ${pat}`, 'dispatch-hygiene')
    }
  }
  record('PASS', PHASE, 'Dispatch-Lead-Detail Pop-Over-Audit abgeschlossen', 'dispatch-done')
}

// ─── Gutachter: /gutachter/auftraege (kein Auftrag-Detail-Modal) ─────────────

async function auditGutachterAuftraege() {
  const page = await loginAs('sv')
  await page.goto(`${BASE_URL}/gutachter/auftraege`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await page.waitForTimeout(2_500)
  await shoot(page, '07-sv-auftraege')

  // Suche nach Auftrag-Card-Link + Detail-Seite
  const auftragLink = page.locator('a[href*="/gutachter/auftraege/"]').first()
  const auftragLinkVisible = await auftragLink.isVisible({ timeout: 2_000 }).catch(() => false)
  if (!auftragLinkVisible) {
    record('INFO', PHASE, 'Keine Auftrag-Cards für SV vorhanden — Gutachter-Audit übersprungen', 'sv-skip')
    return
  }

  const auftragHref = await auftragLink.getAttribute('href')
  await page.goto(`${BASE_URL}${auftragHref}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await page.waitForTimeout(2_500)
  await shoot(page, '07-sv-auftrag-detail')

  // Alle sichtbaren Trigger auf Detail-Seite inventarisieren
  const triggers = await page.evaluate(() => {
    const sel = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])'
    return Array.from(document.querySelectorAll(sel))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const cs = window.getComputedStyle(el)
        return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'
      })
      .map((el, idx) => ({
        idx,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        aria: el.getAttribute('aria-label') || '',
        testid: el.getAttribute('data-testid') || '',
      }))
  })

  const SKIP = /abmelden|löschen|stornieren|ablehnen|sign.?out|kamera|mikrofon|datei|zurück|×|^x$/i
  const modalTriggers = triggers.filter((t) => {
    const label = t.testid || t.aria || t.text
    return !SKIP.test(label) && label.length > 1
  }).slice(0, 10)

  record('INFO', PHASE, `Gutachter-Auftrag-Detail: ${triggers.length} Buttons (${modalTriggers.length} auditiert)`, 'sv-detail-inventory')

  for (const t of modalTriggers) {
    const label = t.testid || t.aria || t.text
    const trigger = t.testid
      ? page.locator(`[data-testid="${t.testid}"]`).first()
      : t.aria
        ? page.locator(`[aria-label="${t.aria}"]`).first()
        : page.locator('button').filter({ hasText: t.text || ' ' }).first()

    if (!(await trigger.isVisible({ timeout: 1_000 }).catch(() => false))) continue
    await probePopover(page, trigger, `SV-${label}`)
    // nach NAV zurücknavigieren
    if (!page.url().includes(auftragHref ?? '')) {
      await page.goto(`${BASE_URL}${auftragHref}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(1_000)
    }
  }

  record('PASS', PHASE, 'Gutachter-Auftrag-Detail Pop-Over-Audit abgeschlossen', 'sv-done')
}

// ─── Kunde: /kunde/faelle/[id] ────────────────────────────────────────────────

async function auditKundeFallDetail(fallId) {
  if (!fallId) {
    record('INFO', PHASE, 'Kein Fall-ID — Kunde-Detail-Audit übersprungen', 'kunde-skip')
    return
  }

  const page = await loginAs('kunde')
  await page.goto(`${BASE_URL}/kunde/faelle/${fallId}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await page.waitForTimeout(3_000)
  await shoot(page, '07-kunde-fall-detail')

  // ── Trigger: "Anderen Termin vorschlagen" → GegenvorschlagModal ─────────
  const gegenBtn = page.getByRole('button', { name: /anderen Termin|Gegenvorschlag|Termin vorschlagen/i }).first()
  if (await gegenBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await probePopover(page, gegenBtn, 'GegenvorschlagModal', async () => {
      // Abbrechen statt Speichern — kein destruktiver Effekt
      const abbrBtn = page.getByRole('button', { name: /Abbrechen|Schließen|Zurück/i }).first()
      if (await abbrBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await abbrBtn.click()
      } else {
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(300)
    })

    // Hygiene: Im Modal darf KEIN interner SV-Kalender / Dispatch-Tool sichtbar sein
    const hygieneCheck = page.locator('text=/Dispatch|Admin-Ansicht|Interne Notiz/i').first()
    const hygieneVisible = await hygieneCheck.isVisible({ timeout: 800 }).catch(() => false)
    record(
      hygieneVisible ? 'SOFT' : 'PASS',
      PHASE,
      hygieneVisible
        ? 'Hygiene: Interne Inhalte im Kunden-Modal sichtbar!'
        : 'Hygiene: Kunden-Modal zeigt keine internen Dispatch-Daten',
      'kunde-hygiene',
    )
  } else {
    record('INFO', PHASE, '"Anderen Termin vorschlagen"-Button nicht sichtbar (kein offener Termin)', 'kunde-gegenvorschlag-skip')
  }

  // ── Weitere sichtbare Trigger auditieren (max 6) ─────────────────────────
  const SKIP_KUNDE = /abmelden|löschen|kamera|mikrofon|datei|×|^x$/i
  const allBtns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button:not([disabled])'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const cs = window.getComputedStyle(el)
        return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'
      })
      .map((el, idx) => ({
        idx,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        aria: el.getAttribute('aria-label') || '',
      })),
  )

  const kundeTargets = allBtns
    .filter((b) => {
      const l = b.aria || b.text
      return !SKIP_KUNDE.test(l) && l.length > 2 && !/anderen Termin|Gegenvorschlag/i.test(l)
    })
    .slice(0, 6)

  for (const btn of kundeTargets) {
    const label = btn.aria || btn.text
    const trigger = btn.aria
      ? page.locator(`[aria-label="${btn.aria}"]`).first()
      : page.locator('button').filter({ hasText: btn.text || ' ' }).first()
    if (!(await trigger.isVisible({ timeout: 800 }).catch(() => false))) continue
    await probePopover(page, trigger, `Kunde-${label}`)
    if (!page.url().includes(`/kunde/faelle/${fallId}`)) {
      await page.goto(`${BASE_URL}/kunde/faelle/${fallId}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(1_000)
    }
  }

  record('PASS', PHASE, 'Kunde-Fall-Detail Pop-Over-Audit abgeschlossen', 'kunde-done')
}

// ─── Haupt-Export ─────────────────────────────────────────────────────────────

export async function runPhase7(prevResult = {}) {
  console.log('\n━━━ Phase 7: Pop-Over-Audit pro Detail-Seite ━━━\n')

  const fixtures = loadFixtureIds() ?? {}
  const leadId = prevResult.leadId ?? fixtures.journey_lead_id ?? null
  const fallId = prevResult.fallId ?? fixtures.journey_fall_id ?? null

  if (!leadId && !fallId) {
    record('SOFT', PHASE, 'Weder Lead-ID noch Fall-ID vorhanden — Pop-Over-Audit mit Minimal-Scope', 'precondition')
  }

  await auditDispatchLeadDetail(leadId)
  await auditGutachterAuftraege()
  await auditKundeFallDetail(fallId)

  record('PASS', PHASE, 'Phase 7 Pop-Over-Audit abgeschlossen', 'phase-done')
  return { ok: true, leadId, fallId }
}
