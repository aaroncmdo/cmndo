// scripts/smoke-push-flow.mjs — verifiziert den Lead-zu-Dispatcher-Push-Flow.
//
// Was getestet wird:
//   1. LP-Submit erzeugt einen Lead via anfragen-Inbox + convert_anfrage_zu_lead
//   2. Round-Robin: leads.zugewiesen_an wird automatisch auf einen Dispatcher
//      gesetzt (NULL nur wenn keine dispatch-Profile in der DB existieren)
//   3. Push: für jeden aktiven Dispatcher/Admin entsteht eine benachrichtigungen-
//      Row mit typ='neuer-lead' und link='/dispatch/leads/<id>'
//
// Vorausgesetzt: localhost:3000 läuft mit dem Branch-Stand, Supabase-Service-
// Role-Key in .env.local.
//
// Cleanup-Pendant: scripts/cleanup-push-flow.mjs (gleiches Pattern wie
// cleanup-popover-smoke.mjs).
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ''),
      ]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const LP = 'http://localhost:3000/kfzgutachter-lp'

let failed = 0
function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    console.log(`  FAIL  ${name} ${extra}`)
    failed++
  }
}

const UNIQUE_PHONE = `0151${String(Date.now()).slice(-7)}`
const UNIQUE_NAME = `PushFlow Smoke ${Date.now().toString(36)}`

;(async () => {
  console.log(`Phone: ${UNIQUE_PHONE} · Name: ${UNIQUE_NAME}`)

  // 0. Recipient-Liste vorab snapshoten — vor dem Submit, damit wir die Soll-
  //    Anzahl der Benachrichtigungs-Rows berechnen können (1 pro aktivem
  //    Dispatcher/Admin).
  const { data: recipients, error: recErr } = await sb
    .from('profiles')
    .select('id, rolle')
    .in('rolle', ['dispatch', 'admin'])
  if (recErr) {
    console.error('FAIL profiles snapshot:', recErr.message)
    process.exit(1)
  }
  const recipientIds = (recipients ?? []).map((r) => r.id)
  console.log(`Snapshot: ${recipientIds.length} Empfänger (dispatch + admin)`)
  check('mindestens 1 Empfänger snapshot', recipientIds.length > 0)

  // 1. LP-Submit per Browser
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(
      `${LP}?popover_force=1&utm_source=push-smoke&utm_campaign=push-flow`,
      { waitUntil: 'networkidle' },
    )
    await page.waitForTimeout(500)

    // Step 1: Fahrzeug
    await page.locator('button[aria-pressed="false"]').first().click()
    await page.locator('button:has-text("Weiter")').click()
    await page.waitForTimeout(500)

    // Step 2: Standort + Suggestion — Maps-Script-Load + Suggestion-Render
    // sind zwei separate Waits, sonst Race wenn Script erst nach Fill geladen
    // wird.
    await page.locator('#popover-standort').fill('Hohenstaufenring Köln')
    await page.waitForFunction(() => Boolean(window.google?.maps?.places), null, {
      timeout: 20000,
    })
    await page.locator('[role=option]').first().waitFor({ timeout: 15000 })
    await page.locator('[role=option]').first().click()
    await page.locator('button:has-text("Weiter")').click()
    await page.waitForTimeout(400)

    // Step 3: Callback-Submit
    await page.locator('button:has-text("Lieber Rückruf")').click()
    await page.waitForTimeout(300)
    await page.locator('#popover-cb-name').fill(UNIQUE_NAME)
    await page.locator('#popover-cb-phone').fill(UNIQUE_PHONE)
    await page.locator('button:has-text("Rückruf anfordern")').click()
    await page.locator('text=Danke').waitFor({ timeout: 10000 })
  } finally {
    await browser.close()
  }

  // 2. DB-Verifikation — Lead muss da sein
  await new Promise((r) => setTimeout(r, 1500))
  const { data: anfrage } = await sb
    .from('anfragen')
    .select('id, lead_id, konvertier_status, kontakt_telefon')
    .eq('kontakt_telefon', UNIQUE_PHONE)
    .single()
  check('anfrage existiert', Boolean(anfrage))
  check('konvertier_status=success', anfrage?.konvertier_status === 'success')
  check('lead_id verlinkt', Boolean(anfrage?.lead_id))

  if (!anfrage?.lead_id) {
    console.log('\n✗ ABORT — kein lead_id, Push-Verify nicht möglich')
    process.exit(1)
  }

  // 3. Round-Robin: zugewiesen_an muss gesetzt sein (NUR wenn dispatch-User existieren)
  const { data: lead } = await sb
    .from('leads')
    .select('id, zugewiesen_an, status')
    .eq('id', anfrage.lead_id)
    .single()
  const hasDispatcher = (recipients ?? []).some((r) => r.rolle === 'dispatch')
  if (hasDispatcher) {
    check(
      'leads.zugewiesen_an automatisch gesetzt (Round-Robin)',
      Boolean(lead?.zugewiesen_an),
    )
  } else {
    check(
      'leads.zugewiesen_an=NULL (keine Dispatcher → Self-Claim-Pfad)',
      lead?.zugewiesen_an == null,
    )
  }

  // 4. Push: 1 benachrichtigungen-Row pro Empfänger
  const linkPattern = `/dispatch/leads/${anfrage.lead_id}`
  const { data: notifications, error: nErr } = await sb
    .from('benachrichtigungen')
    .select('id, user_id, typ, titel, link')
    .eq('link', linkPattern)
  if (nErr) {
    console.error('FAIL benachrichtigungen-Query:', nErr.message)
    process.exit(1)
  }
  check(
    `benachrichtigungen-Count == ${recipientIds.length}`,
    (notifications?.length ?? 0) === recipientIds.length,
    `(got ${notifications?.length ?? 0})`,
  )

  const notifiedUserIds = new Set((notifications ?? []).map((n) => n.user_id))
  const missingRecipients = recipientIds.filter((id) => !notifiedUserIds.has(id))
  check(
    'jeder Empfänger hat eine Benachrichtigung',
    missingRecipients.length === 0,
    missingRecipients.length > 0
      ? `(fehlt für ${missingRecipients.length} Empfänger)`
      : '',
  )

  if (notifications && notifications.length > 0) {
    const first = notifications[0]
    check('typ=neuer-lead', first.typ === 'neuer-lead')
    check(
      'titel enthält Lead-Name',
      Boolean(first.titel?.includes(UNIQUE_NAME)),
      `(titel='${first.titel}')`,
    )
  }

  console.log(`\n${failed === 0 ? '✓ ALL GREEN' : `✗ ${failed} CHECKS FAILED`}`)
  console.log(`Cleanup: node scripts/cleanup-push-flow.mjs`)
  process.exit(failed === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
