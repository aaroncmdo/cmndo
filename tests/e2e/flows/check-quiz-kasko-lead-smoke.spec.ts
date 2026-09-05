// Kasko-WB Phase 2 (05.09.2026): das /check-Quiz verspricht bei Eigenverschulden keine Partnerwerkstatt mehr, und
// ein Quiz-Lead mit „Ich war (haupt)schuld" kommt als Kasko-Lead in die Phase-1-Strecke (Versicherungsfrage,
// Tariffrage) statt als „Schuld offen" daran vorbeizulaufen.
//
// OPERATIVES SOLL (vor dem Code formuliert):
//   1. Ein Besucher beantwortet die drei Quiz-Fragen mit „Ich war (haupt)schuld" / „Vor weniger als 1 Woche" /
//      „Nein, noch nicht". Das Ergebnis sagt ihm ehrlich, dass die Werkstatt vom Tarif abhaengt — es verspricht
//      KEINE Partnerwerkstatt — und bietet den Foto-Check an.
//   2. Reicht er das Lead-Formular ein, entsteht ein Lead mit schuldfrage='eigenverantwortung' und einer
//      Dispatcher-Notiz zur Herkunft; im FlowLink erscheint nach dem Consent die Versicherungsfrage
//      („Ja, ich habe eine Kaskoversicherung"), danach die Tariffrage.
//
// MESSGRENZE (ehrlich ausgewiesen): Das Lead-Formular haengt am Google-Places-Ortsfeld (externe Suggestion,
// nicht stabil per Playwright). Deshalb wird der Formular-Submit durch den Zustand ersetzt, den er erzeugt
// (eine `anfragen`-Zeile mit payload.check, Service-Role) und die Konversion ueber dieselbe DB-Funktion
// (`convert_anfrage_zu_lead`) ausgeloest, die auch die Server-Action ruft. Der FlowLink-Weg danach ist echter
// UI-Klick. `anfragen` ist eine Audit-Tabelle (niemals DELETE) — je Lauf bleibt eine Zeile mit kontakt_name
// „Abnahme Smoke" stehen; der Lead wird geloescht (FK SET NULL).
//
// Marketing laeuft nur auf prod (kein staging) -> RUN_CHECK_QUIZ_SMOKE gated, im ci.yml e2e-Job gesetzt.
//   RUN_CHECK_QUIZ_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test check-quiz-kasko-lead-smoke

import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { ZIEL } from '../lib/ziel'
import { loescheLeadMitAnhang, serviceClient } from '../lib/seed-lead-flowlink'

const MARKETING = process.env.MARKETING_BASE_URL || 'https://claimondo.de'
const RUN = process.env.RUN_CHECK_QUIZ_SMOKE === '1'

test.describe('Check-Quiz -> Kasko-Lead -> FlowLink (Kasko-WB Phase 2)', () => {
  test.skip(!RUN, 'RUN_CHECK_QUIZ_SMOKE nicht gesetzt (Marketing nur prod)')
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY fehlt')
  test.setTimeout(5 * 60_000)

  let aufraeumen: string | null = null
  test.afterEach(async () => {
    if (!aufraeumen) return
    const leadId = aufraeumen
    aufraeumen = null
    await loescheLeadMitAnhang(serviceClient(), leadId)
  })

  test('Quiz-Ergebnis bei Eigenverschulden: keine Partnerwerkstatt-Zusage, Foto-Check angeboten', async ({ page }) => {
    await page.goto(`${MARKETING}/check`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^Ich war \(haupt\)schuld/ }).click()
    await page.getByRole('button', { name: /^Vor weniger als 1 Woche/ }).click()
    await page.getByRole('button', { name: /^Nein, noch nicht/ }).click()

    const heading = page.getByRole('heading', { name: /Wir helfen auch bei eigener Schuld/ })
    await expect(heading).toBeVisible({ timeout: 20_000 })
    const text = await page.locator('main').innerText()
    expect(text).toContain('Werkstattbindung')
    expect(text, 'das alte Versprechen darf nicht mehr auftauchen').not.toContain('Koordination mit der Partnerwerkstatt')
    await expect(page.getByRole('link', { name: /Foto/ }).first()).toBeVisible()
  })

  test('Konversion: schuld=selbst wird eigenverantwortung; FlowLink stellt die Versicherungsfrage', async ({ page }) => {
    const db = serviceClient()
    // Ausgangszustand = was das Lead-Formular schreibt (check-lead-action.ts): eine anfragen-Zeile.
    const { data: anfrage, error: aErr } = await db
      .from('anfragen')
      .insert({
        quelle: 'claimondo-check',
        quelle_variant: 'interaktiv-anspruchscheck',
        kontakt_name: 'Abnahme Smoke',
        kontakt_telefon: null,
        kontakt_plz_oder_stadt: '50670',
        payload: { check: { schuld: 'selbst', unfall_her: 'unter_woche', gutachten: 'nein' }, smoke: true },
      })
      .select('id')
      .single()
    if (aErr || !anfrage) throw new Error(`anfragen-Seed fehlgeschlagen: ${aErr?.message}`)

    const { data: leadId, error: rpcErr } = await db.rpc('convert_anfrage_zu_lead', { p_anfrage_id: anfrage.id })
    if (rpcErr || !leadId) throw new Error(`Konversion fehlgeschlagen: ${rpcErr?.message}`)
    aufraeumen = leadId as string

    const { data: lead } = await db.from('leads').select('schuldfrage, notiz, auswertung_unverbindlich').eq('id', leadId).single()
    expect(lead?.schuldfrage, 'Befund 4 der Phase-1-Analyse: selbst fiel aus der Whitelist').toBe('eigenverantwortung')
    expect(lead?.notiz ?? '').toContain('Anspruchsprüfung')
    expect((lead?.auswertung_unverbindlich as { tier?: string } | null)?.tier).toBe('kasko')

    // FlowLink seeden (die Server-Action legt ihn nach der Konversion an) und per UI oeffnen.
    const token = randomBytes(16).toString('hex')
    const { error: flErr } = await db.from('flow_links').insert({
      token,
      lead_id: leadId,
      service_typ: 'komplett',
      sprache: 'de',
      status: 'aktiv',
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (flErr) throw new Error(`FlowLink-Seed fehlgeschlagen: ${flErr.message}`)

    await page.goto(`${ZIEL}/flow/${token}`, { waitUntil: 'domcontentloaded' })
    for (const cb of await page.getByRole('checkbox').all()) {
      if (!(await cb.isChecked())) await cb.check()
    }
    await page.getByRole('button', { name: /^weiter/i }).first().click()
    // schuldfrage ist vorbelegt -> keine Schuldfrage mehr, aber die Versicherungsfrage (quali_offen).
    await expect(page.getByRole('button', { name: /Ja, ich habe eine Kaskoversicherung/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /^Ich selbst/i })).toHaveCount(0)
  })
})
