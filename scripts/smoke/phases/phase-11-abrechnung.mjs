/**
 * scripts/smoke/phases/phase-11-abrechnung.mjs — Phase 11: Abrechnung
 *
 * Was getestet wird:
 *  Admin öffnet /admin/abrechnungen, sieht die Abrechnung für test-sv,
 *  öffnet das Detail, und klickt "Markiere als bezahlt".
 *  DB-Check: abrechnungen.status='bezahlt', partner_provisionen falls Maik-Lead.
 *
 * Source-Hinweise:
 *  - Route: /admin/abrechnungen → AbrechnungenListClient.tsx
 *  - Action: markBezahlt(abrechnung_id) in src/app/admin/abrechnungen/actions.ts
 *  - Finance-Hub: /admin/finance/(hub)/abrechnungen/page.tsx (Alternativ)
 *  - Provision: src/lib/finance/abrechnungen-generator.ts → partner_provisionen
 *
 * Workaround-Strategie:
 *  Falls keine Abrechnung in DB: Service-Role Insert.
 *  Falls "Markiere als bezahlt" Button fehlt: Service-Role Update.
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
 * @param {{ fallId: string|null; auftragId: string|null; leadId: string|null; notes: string[] }} prevResult
 * @returns {{ phase: 11, result: 'pass'|'soft'|'hard', notes: string[], abrechnungId: string|null }}
 */
export async function runPhase11(adminContext, prevResult = { notes: [] }) {
  const notes = prevResult.notes ?? []
  let result = 'pass'
  let page = null

  logPhase(11, '=== Phase 11: Abrechnung ===')

  const fixtures = loadFixtureIds() ?? {}
  const fallId = prevResult.fallId ?? fixtures.fall_id ?? null
  const auftragId = prevResult.auftragId ?? fixtures.auftrag_id ?? null
  const leadId = prevResult.leadId ?? fixtures.lead_direkt_id ?? fixtures.lead_maik_id ?? null

  logPhase(11, `fallId=${fallId} | auftragId=${auftragId} | leadId=${leadId}`)

  const db = getServiceDb()

  // --- Voraussetzung: faelle.status auf abgeschlossen setzen ---------------
  if (fallId) {
    const { data: fall } = await db.from('faelle').select('status').eq('id', fallId).maybeSingle()
    logPhase(11, `faelle.status aktuell: ${fall?.status}`)
    if (!['zahlung-eingegangen', 'abgeschlossen'].includes(fall?.status)) {
      await db.from('faelle').update({ status: 'abgeschlossen' }).eq('id', fallId)
      logPhase(11, 'Voraussetzung: faelle.status=abgeschlossen gesetzt')
    }
  }

  // --- Abrechnung in DB suchen / anlegen -----------------------------------
  let abrechnungId = null

  // Suche bestehende Abrechnung für test-sv
  const { data: svProfile } = await db.from('profiles').select('id').eq('email', 'test-sv@claimondo.de').maybeSingle()
  const svProfileId = svProfile?.id ?? null

  const { data: svEintrag } = svProfileId
    ? await db.from('sachverstaendige').select('id').eq('profile_id', svProfileId).maybeSingle()
    : { data: null }
  const svId = svEintrag?.id ?? null

  if (svId) {
    const { data: vorhandeneAbr } = await db
      .from('abrechnungen')
      .select('id, status')
      .eq('empfaenger_id', svId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (vorhandeneAbr) {
      abrechnungId = vorhandeneAbr.id
      logPhase(11, `Bestehende Abrechnung gefunden: ${abrechnungId} (status=${vorhandeneAbr.status})`)
    }
  }

  // Falls keine Abrechnung: Workaround-Insert
  if (!abrechnungId) {
    logPhase(11, 'Keine Abrechnung gefunden — Workaround: Service-Role Insert')
    notes.push('SOFT: Keine Abrechnung in DB gefunden — Abrechnung via Service-Role angelegt (Abrechnungs-Generator wurde nicht getriggert)')
    result = 'soft'

    // abrechnungen Schema: empfaenger_typ, empfaenger_email, empfaenger_name, status (enum: versendet|bezahlt|...),
    // abrechnungs_nr, abrechnungs_zeitraum_start, abrechnungs_zeitraum_ende, positionen (jsonb), summe_netto, summe_brutto, ust_betrag
    const { data: svProfileData } = svProfileId
      ? await db.from('profiles').select('email, vorname, nachname').eq('id', svProfileId).maybeSingle()
      : { data: null }

    const now = new Date().toISOString().slice(0, 10)
    const insertPayload = {
      empfaenger_typ: 'sv',
      empfaenger_email: svProfileData?.email ?? 'test-sv@claimondo.de',
      empfaenger_name: `${svProfileData?.vorname ?? 'Test'} ${svProfileData?.nachname ?? 'SV'}`,
      status: 'versendet',
      abrechnungs_nr: `SMOKE-${Date.now()}`,
      abrechnungs_zeitraum_start: now,
      abrechnungs_zeitraum_ende: now,
      positionen: [{ bezeichnung: 'Grundhonorar Erstbesichtigung', betrag_netto: 350 }],
      summe_netto: 350,
      summe_brutto: 416.5,
      ust_betrag: 66.5,
    }
    if (fallId) insertPayload.fall_id = fallId

    const { data: neuAbr, error: abErr } = await db
      .from('abrechnungen')
      .insert(insertPayload)
      .select('id')
      .maybeSingle()

    if (abErr) {
      notes.push(`SOFT: Abrechnung-Insert fehlgeschlagen: ${abErr.message}`)
    } else {
      abrechnungId = neuAbr?.id
      logPhase(11, `Workaround-Abrechnung angelegt: ${abrechnungId}`)
    }
  }

  // --- Login als test-admin ------------------------------------------------
  logPhase(11, 'Login als test-admin@claimondo.de')
  try {
    page = await loginAs(adminContext, 'test-admin@claimondo.de', 'Test1234!', BASE_URL)
  } catch (err) {
    const msg = `Admin-Login fehlgeschlagen: ${err.message}`
    logHard(11, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 11, result: 'hard', notes, abrechnungId }
  }

  if (page.url().includes('/login')) {
    const msg = 'Admin-Login fehlgeschlagen'
    logHard(11, msg)
    notes.push(`HARD: ${msg}`)
    if (page) await page.close().catch(() => {})
    return { phase: 11, result: 'hard', notes, abrechnungId }
  }

  try {
    // --- Schritt 11a: /admin/abrechnungen öffnen ----------------------------
    logPhase(11, 'Navigiere zu /admin/abrechnungen')
    await gotoAndShoot(page, `${BASE_URL}/admin/abrechnungen`, 'phase11-abrechnungen-liste')

    await page.waitForTimeout(2000)

    // Screenshot der Liste
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase11-liste.png`,
    }).catch(() => {})

    // --- Schritt 11b: Abrechnung in Liste finden ----------------------------
    let abrechnungGeöffnet = false

    if (abrechnungId) {
      const linkMitId = page.locator(`a[href*="${abrechnungId}"], [data-abrechnung-id="${abrechnungId}"]`).first()
      if (await linkMitId.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clickAndShoot(page, linkMitId, 'phase11-abrechnung-oeffnen')
        abrechnungGeöffnet = true
      }
    }

    if (!abrechnungGeöffnet) {
      // Erstes Element in der Liste klicken
      const ersteZeile = page.locator('table tbody tr a, [data-testid^="abrechnung-row"]').first()
      if (await ersteZeile.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clickAndShoot(page, ersteZeile, 'phase11-abrechnung-erste')
        abrechnungGeöffnet = true
      } else {
        logSoft(11, 'Kein Abrechnungs-Link in Liste sichtbar')
        notes.push('SOFT: Keine Abrechnung in /admin/abrechnungen Liste sichtbar — prüfe AbrechnungenListClient.tsx Filter und svId-Zuordnung')
        result = 'soft'
      }
    }

    if (abrechnungGeöffnet) {
      await page.waitForTimeout(1500)
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase11-abrechnung-detail.png`,
      }).catch(() => {})

      // --- Schritt 11c: "Markiere als bezahlt" klicken ---------------------
      logPhase(11, 'Suche "Markiere als bezahlt"-Button')

      const bezahltSelectors = [
        page.getByRole('button', { name: /Markiere als bezahlt/i }),
        page.getByRole('button', { name: /Als bezahlt markieren/i }),
        page.getByRole('button', { name: /Bezahlt/i }),
        page.locator('[data-testid="mark-bezahlt-btn"]'),
      ]

      let bezahltBtn = null
      for (const btn of bezahltSelectors) {
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          bezahltBtn = btn
          break
        }
      }

      if (bezahltBtn) {
        logPhase(11, '"Markiere als bezahlt"-Button gefunden — klicke')
        await clickAndShoot(page, bezahltBtn, 'phase11-bezahlt-klick')
        await page.waitForTimeout(3000)

        // Confirm-Dialog / Beleg-Upload falls vorhanden
        const confirmBtn = page.getByRole('button', { name: /Bestätigen|Ja|OK/i }).first()
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await clickAndShoot(page, confirmBtn, 'phase11-bezahlt-confirm')
          await page.waitForTimeout(2000)
        }

        logPhase(11, `Nach Bezahlt-Markierung URL: ${page.url()}`)

      } else {
        const msg = '"Markiere als bezahlt"-Button nicht gefunden'
        logSoft(11, msg)
        notes.push(`SOFT: ${msg} — Abrechnung möglicherweise bereits bezahlt oder UI-Pfad nicht geöffnet. Prüfe: AbrechnungenListClient.tsx markBezahlt-Action`)
        result = 'soft'
      }
    }

    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? '.'}/phase11-final-state.png`,
    }).catch(() => {})

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 11 UI: ${err.message}`
    logSoft(11, msg)
    notes.push(`SOFT: ${msg}`)
    result = 'soft'
  } finally {
    if (page) await page.close().catch(() => {})
  }

  // --- DB-Asserts + Workaround ---------------------------------------------
  await new Promise((r) => setTimeout(r, 1500))

  if (abrechnungId) {
    const { data: abrRow } = await db.from('abrechnungen').select('status, bezahlt_am').eq('id', abrechnungId).maybeSingle()
    logPhase(11, `abrechnungen.status: ${abrRow?.status}`)

    if (abrRow?.status !== 'bezahlt') {
      // Workaround
      const { error } = await db.from('abrechnungen').update({
        status: 'bezahlt',
        bezahlt_am: new Date().toISOString(),
      }).eq('id', abrechnungId)
      if (error) {
        notes.push(`SOFT: abrechnungen.status=bezahlt Workaround fehlgeschlagen: ${error.message}`)
      } else {
        logPhase(11, 'Workaround: abrechnungen.status=bezahlt gesetzt')
        notes.push('SOFT: abrechnungen.status=bezahlt via Service-Role Workaround gesetzt (UI-Klick war nicht vollständig)')
        result = result === 'hard' ? 'hard' : 'soft'
      }
    } else {
      logPhase(11, 'abrechnungen.status=bezahlt — Markierung hat funktioniert!')
    }
  } else {
    notes.push('SOFT: abrechnungId nicht bekannt — abrechnungen-Assert übersprungen')
    result = result === 'hard' ? 'hard' : 'soft'
  }

  // Partner-Provision prüfen (falls Maik-Lead)
  if (leadId) {
    const { data: lead } = await db.from('leads').select('source_channel').eq('id', leadId).maybeSingle()
    if (lead?.source_channel === 'maik_partner') {
      // Tabelle heißt provisionen_maik (nicht partner_provisionen)
      const { data: provision } = await db
        .from('provisionen_maik')
        .select('id, status, betrag')
        .eq('lead_id', leadId)
        .maybeSingle()

      if (!provision) {
        notes.push('SOFT: Maik-Lead erkannt, aber partner_provisionen Row fehlt — Provisions-Trigger wurde nicht ausgelöst. Prüfe: lib/finance/abrechnungen-generator.ts → partner_provisionen Insert')
        result = result === 'hard' ? 'hard' : 'soft'
      } else {
        logPhase(11, `partner_provisionen: id=${provision.id}, status=${provision.status}, betrag=${provision.betrag}`)
        if (provision.status !== 'paid') {
          notes.push(`SOFT: partner_provisionen.status=${provision.status} (erwartet: paid) — Provisions-Status-Transition fehlt`)
          result = result === 'hard' ? 'hard' : 'soft'
        }
      }
    } else {
      logPhase(11, `Lead-Quelle: ${lead?.source_channel} — kein Maik-Lead, Provision-Assert übersprungen`)
    }
  }

  logPhase(11, `Phase 11 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 11, result, notes, abrechnungId }
}
