/**
 * scripts/journey/02-dispatch-quali.mjs — Phase 2: Dispatch-Quali + SV-Termin
 *
 * Was getestet wird:
 *  Dispatch loggt sich ein, öffnet den Lead-Detail, geht durch:
 *   - Phase-Detection (welche Phase ist aktiv?)
 *   - Pop-Over: "Phase wechseln" / Phase-Header-Click
 *   - Phase 2: SV-Suche-Button → SV-Liste → Slot-Kachel → Reservierung
 *   - Verifikation: Lead-Status nach Reservierung
 *
 * Cross-Role-Checks:
 *  - SV: bekommt Mitteilung "Neuer Auftrag" (Glocke), aber Auftrag ist NOCH NICHT
 *    in /gutachter/auftraege (SA noch nicht unterschrieben — fall_id existiert noch nicht)
 *  - Admin: sieht Lead-Status-Update in /admin (Lead jetzt "umgewandelt-sv" oder "flow-versendet"?)
 *  - Kunde: sieht Termin-Vorschlag im Kunde-Portal? FlowLink-Mail-Link?
 *
 * Daten-Hygiene:
 *  - Lead taucht NICHT mehr im Quali-Offen-Tab des Dispatch-Portals auf
 *  - Lead taucht im "Umgewandelt"- oder "Flow-versendet"-Tab auf
 */

import { record, shoot, assertVisible, assertHidden, checkpoint, getAdminDb, loadFixtureIds, openPopover, closePopover, loginAs } from './_helpers.mjs'

const PHASE = 2
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export async function runPhase2(prevResult = {}) {
  console.log('\n━━━ Phase 2: Dispatch-Quali + SV-Termin ━━━\n')

  const fixtures = loadFixtureIds() ?? {}
  const leadId = prevResult.leadId ?? fixtures.journey_lead_id ?? fixtures.lead_direkt_id ?? null

  if (!leadId) {
    record('HARD', PHASE, 'Kein Lead-ID verfügbar — Phase 1 hat keinen Lead angelegt', 'precondition')
    return { ok: false }
  }

  const page = await loginAs('dispatch')
  await page.waitForTimeout(1_500)

  // ─── Schritt 2.1: Lead-Detail öffnen ────────────────────────────────────
  await page.goto(`${BASE_URL}/dispatch/leads/${leadId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_500)
  await shoot(page, '02-dispatch-lead-detail')

  // URL muss Lead-ID enthalten
  if (!page.url().includes(leadId)) {
    record('HARD', PHASE, `Navigation zu /dispatch/leads/${leadId} fehlgeschlagen — URL=${page.url()}`, 'navigation')
    return { ok: false }
  }
  record('PASS', PHASE, `Lead-Detail geöffnet: ${page.url()}`, 'navigation')

  // ─── Schritt 2.2: Phase-Header sichtbar? ────────────────────────────────
  const phaseHeader = page.locator('[data-phase], header').filter({ hasText: /Phase\s*\d/i }).first()
  await assertVisible(page, phaseHeader, 'Phase-Header in Dispatch-Shell', PHASE, { tag: 'phase-header', timeout: 3_000 })

  // Phase-Wechsel-Pop-Over (falls vorhanden — Pill-Button öffnet Bottom-Sheet)
  const phasePill = page.getByRole('button', { name: /Phase\s*\d/i }).first()
  if (await phasePill.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await openPopover(page, phasePill, PHASE, 'Phase-Wechsel-Pop-Over')
    await shoot(page, '02-phase-popover-open')
    await closePopover(page)
  } else {
    record('INFO', PHASE, 'Kein Phase-Pill-Button sichtbar (möglicherweise Desktop-Layout ohne Pop-Over)', 'phase-popover')
  }

  // ─── Schritt 2.3: SV-Dispatch-Panel finden ──────────────────────────────
  // Header-Text "SV-Termin reservieren" markiert die Sektion
  const svPanel = page.locator('div').filter({ hasText: /SV-Termin reservieren/i }).first()
  await assertVisible(page, svPanel, 'SV-Termin-reservieren Panel', PHASE, { tag: 'sv-panel' })

  // ─── Schritt 2.4: "Gutachter suchen"-Button ─────────────────────────────
  const sucheBtn = page.getByRole('button', { name: /Gutachter suchen|Erneut suchen/i }).first()
  const sucheVisible = await sucheBtn.isVisible({ timeout: 3_000 }).catch(() => false)

  if (sucheVisible) {
    record('PASS', PHASE, '"Gutachter suchen"-Button sichtbar (hardGateOk=true)', 'sv-suche-btn')
    await sucheBtn.click()
    record('INFO', PHASE, 'Gutachter-Suche getriggert', 'sv-suche-click')
    await page.waitForTimeout(3_000) // Mapbox-ETA-Calls dauern
    await shoot(page, '02-sv-suche-laeuft')
  } else {
    // Suche schon auto-getriggert? SV-Cards bereits gerendert?
    const svCardsVorhanden = page.locator('[class*="SvCard"], button').filter({ hasText: /Slot|Reservieren/i }).first()
    if (await svCardsVorhanden.isVisible({ timeout: 2_000 }).catch(() => false)) {
      record('INFO', PHASE, 'SV-Liste war bereits auto-geladen (topSuggestions !== null)', 'sv-suche-auto')
    } else {
      record('SOFT', PHASE, 'Weder "Gutachter suchen"-Button noch SV-Liste sichtbar — hardGate ggf. nicht erfüllt', 'sv-suche-btn')
    }
  }

  // Warte bis "Suche passende Gutachter…" verschwunden ist
  await page.waitForFunction(() => !document.body.innerText.includes('Suche passende Gutachter'), { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
  await shoot(page, '02-sv-suche-fertig')

  // ─── Schritt 2.5: SV-Card sichtbar? ────────────────────────────────────
  // Look for any "Reservieren"-Button or Slot-Kachel pattern
  const slotKacheln = page.locator('button').filter({ hasText: /\d{2}:\d{2}|Slot/ })
  const slotCount = await slotKacheln.count().catch(() => 0)

  if (slotCount === 0) {
    // Alternative: "Keine SVs in Reichweite gefunden"-Hinweis?
    const keineSv = page.locator('text=/Keine SVs in Reichweite/i').first()
    if (await keineSv.isVisible({ timeout: 2_000 }).catch(() => false)) {
      record('SOFT', PHASE, 'SV-Liste leer — "Keine SVs in Reichweite". Test-Daten erweitern oder Isochrone prüfen', 'sv-leer')
    } else {
      record('SOFT', PHASE, 'Keine Slot-Kacheln gefunden — SvCard-Layout veränert?', 'slot-list')
    }
    return { ok: false, leadId }
  }
  record('PASS', PHASE, `${slotCount} Slot-Kachel(n) sichtbar`, 'slot-list')

  // ─── Schritt 2.6: Ersten Slot reservieren ──────────────────────────────
  const ersterSlot = slotKacheln.first()
  const slotText = (await ersterSlot.textContent()) || '?'
  await ersterSlot.click()
  record('INFO', PHASE, `Slot-Kachel geklickt: "${slotText.replace(/\s+/g, ' ').trim()}"`, 'slot-click')
  await page.waitForTimeout(3_000)
  await shoot(page, '02-slot-reserviert')

  // ─── Schritt 2.7: DB-Verifikation ──────────────────────────────────────
  const db = getAdminDb()
  const { data: leadRow } = await db
    .from('leads')
    .select('status, qualifizierungs_phase')
    .eq('id', leadId)
    .maybeSingle()

  if (leadRow) {
    record('INFO', PHASE, `Lead-Status nach Slot-Click: status=${leadRow.status} | qualifizierungs_phase=${leadRow.qualifizierungs_phase}`, 'db-lead')
    if (leadRow.status === 'umgewandelt-sv' || leadRow.status === 'flow-gesendet') {
      record('PASS', PHASE, `Lead-Status korrekt auf "${leadRow.status}" transitioniert`, 'db-status-ok')
    } else {
      record('SOFT', PHASE, `Lead-Status ist "${leadRow.status}" — erwartet umgewandelt-sv oder flow-gesendet nach Slot-Reservierung`, 'db-status-stuck')
    }
  }

  // gutachter_termine: muss einen reservierten Termin geben
  const { data: termine } = await db
    .from('gutachter_termine')
    .select('id, status, sv_id, start_zeit')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(3)

  const reserviert = (termine ?? []).find((t) => t.status === 'reserviert' || t.status === 'bestaetigt')
  if (reserviert) {
    record('PASS', PHASE, `gutachter_termin angelegt: ${reserviert.id} (status=${reserviert.status})`, 'db-termin')
  } else {
    record('SOFT', PHASE, `Kein reservierter Termin in gutachter_termine für lead_id=${leadId}`, 'db-termin')
  }

  // auftraege: darf NOCH NICHT existieren (kein SA, kein Fall, kein Auftrag)
  const { data: auftrag } = await db
    .from('auftraege')
    .select('id')
    .eq('fall_id', '00000000-0000-0000-0000-000000000000') // dummy
    .maybeSingle()
  // Eigentlicher Check: über fall_id->lead-Lookup. Lead hat keinen Fall.
  const { data: fall } = await db.from('faelle').select('id').eq('lead_id', leadId).maybeSingle()
  if (!fall) {
    record('PASS', PHASE, 'faelle existiert NOCH NICHT — korrekt (SA-Unterschrift fehlt)', 'db-fall-noch-nicht')
  } else {
    record('INFO', PHASE, `faelle existiert bereits — fall_id=${fall.id}. Sollte erst nach SA passieren`, 'db-fall-zu-frueh')
  }

  // ─── Schritt 2.8: Cross-Role-Checkpoints ───────────────────────────────

  // SV: Glocke / Mitteilung "Neuer Auftrag-Termin" — aber NICHT Auftrag in /gutachter/auftraege
  await checkpoint('sv', async (svPage) => {
    await svPage.goto(`${BASE_URL}/gutachter/auftraege`, { waitUntil: 'domcontentloaded' })
    await svPage.waitForTimeout(2_500)
    await shoot(svPage, '02-cross-sv-auftraege')

    // Auftrag-Card darf noch NICHT da sein (SA fehlt — sa_unterschrieben=true ist Voraussetzung)
    const emptyState = svPage.locator('text=/Heute keine Aufträge|0 Aufträge/').first()
    const emptyOk = await emptyState.isVisible({ timeout: 3_000 }).catch(() => false)
    if (emptyOk) {
      record('PASS', PHASE, 'SV: Auftrag-Liste ist leer (korrekt — SA fehlt)', 'cross-sv-leer')
    } else {
      record('SOFT', PHASE, 'SV: Auftrag-Liste zeigt etwas obwohl SA fehlt — Sichtbarkeits-Logik prüfen (faelle.sa_unterschrieben)', 'cross-sv-falsch')
    }

    // Glocke: Mitteilung "Neuer Auftrag" oder "Termin reserviert" sollte da sein
    // Bell-Icon im Header / Posteingang-Link
    await svPage.goto(`${BASE_URL}/gutachter/posteingang`, { waitUntil: 'domcontentloaded' })
    await svPage.waitForTimeout(2_000)
    await shoot(svPage, '02-cross-sv-posteingang')
    const mitteilung = svPage.locator('text=/Termin|Auftrag|reserviert/i').first()
    await assertVisible(svPage, mitteilung, 'SV-Posteingang zeigt Mitteilung über reservierten Termin', PHASE, { tag: 'cross-sv-bell' })
  })

  // Kunde: sieht den Termin-Vorschlag (FlowLink-Mail oder /kunde/termin)
  await checkpoint('kunde', async (kundePage) => {
    await kundePage.goto(`${BASE_URL}/kunde/faelle`, { waitUntil: 'domcontentloaded' })
    await kundePage.waitForTimeout(2_000)
    await shoot(kundePage, '02-cross-kunde-faelle')
    // Da kein Fall existiert vor SA, ist die Liste leer für DEN aktuellen Lead
    record('INFO', PHASE, 'Kunde: /kunde/faelle gerendert. Kunde-Portal-Sichtbarkeit auf Pre-SA-Zustand wird in Phase 4 (FlowLink) detailliert getestet.', 'cross-kunde')
  })

  // Admin: Lead muss als "umgewandelt-sv" oder Sub-Phase im Status sichtbar sein
  await checkpoint('admin', async (adminPage) => {
    await adminPage.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' })
    await adminPage.waitForTimeout(2_000)
    await shoot(adminPage, '02-cross-admin-dashboard')
    record('INFO', PHASE, 'Admin: Dashboard gerendert (Lead-Liste-Tab in /admin/leads wird in Phase 4 detailliert geprüft)', 'cross-admin')
  })

  // Daten-Hygiene Dispatch: Lead darf NICHT mehr im Quali-Offen-Tab erscheinen
  await checkpoint('dispatch', async (dispPage) => {
    await dispPage.goto(`${BASE_URL}/dispatch/leads`, { waitUntil: 'domcontentloaded' })
    await dispPage.waitForTimeout(2_500)
    await shoot(dispPage, '02-cross-dispatch-leads-nach-reserve')
    // Default-Filter zeigt alle. Wir prüfen: Lead-Status sollte NICHT "quali-offen" mehr sein → Filter-Tab "quali-offen" sollte den Lead nicht enthalten.
    const qualiOffenTab = dispPage.getByRole('button', { name: /Quali-?offen/i }).first()
    if (await qualiOffenTab.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await qualiOffenTab.click()
      await dispPage.waitForTimeout(1_500)
      const leadInQuali = dispPage.locator(`text=/${leadId.slice(0, 8)}/`).first()
      await assertHidden(dispPage, leadInQuali, 'Lead darf NICHT mehr im Quali-Offen-Tab des Dispatch-Portals stehen', PHASE, { tag: 'hygiene-quali-offen' })
    } else {
      record('INFO', PHASE, 'Kein "Quali-offen"-Filter-Tab im Dispatch — Layout veränert', 'hygiene-quali-tab')
    }
  })

  return { ok: true, leadId, terminId: reserviert?.id ?? null }
}
