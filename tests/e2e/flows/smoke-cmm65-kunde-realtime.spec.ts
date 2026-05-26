import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// CMM-65 §0 gate: verify the Kunde fall-page live-refresh now works through the
// claims realtime subscription (FallRealtimeRefresh's third leg was switched
// faelle -> claims in PR #1741). The Kunde is the critical role: they cannot
// subscribe to gutachter_termine (no Kunde SELECT-RLS there), so the claims leg
// is their ONLY termin/recency refresh path.
//
// Auth is reused from a cached storageState (see kunde-auth.setup.ts) so this
// can be re-run without re-logging in. Mechanic: open the Kunde fall page, wait
// for the realtime channel, fire a claims UPDATE (service-role PATCH = exactly
// what touchClaimRecency does). Assert (1) the postgres_changes payload reaches
// THIS Kunde-authenticated socket (proves RLS lets the Kunde read claims via
// realtime) and (2) router.refresh() fires (RSC request).

const BASE = process.env.STAGING_APP_URL ?? 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://paizkjajbuxxksdoycev.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const KUNDE_STORAGE =
  process.env.KUNDE_STORAGE ?? path.resolve(__dirname, '..', '..', '..', 'playwright', '.auth', 'kunde.json')
const HAVE_STATE = fs.existsSync(KUNDE_STORAGE)

// test-kunde@claimondo.de -> CLM-2026-00115 (live 2026-05-26)
const FALL_ID = process.env.SMOKE_FALL_ID ?? '65a7640b-62dc-48ca-975f-27c8450477c6'
const CLAIM_ID = process.env.SMOKE_CLAIM_ID ?? '5b2757e1-ea4c-4f2e-8870-ec7a33647d2c'

const SCREENS = path.resolve(__dirname, '..', '..', '..', 'docs', '26.05.2026', 'cmm65-realtime-smoke', 'screens')
if (!fs.existsSync(SCREENS)) fs.mkdirSync(SCREENS, { recursive: true })

test.use({
  baseURL: BASE,
  httpCredentials: BASIC_PASS ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
  storageState: HAVE_STATE ? KUNDE_STORAGE : undefined,
})

test('CMM-65 Kunde realtime: claims UPDATE -> WS delivery + router.refresh()', async ({ page, request }) => {
  test.setTimeout(120_000)
  // Opt-in: this hits staging + needs a prepared test-kunde fixture (faelle.kunde_id
  // + claims.onboarding_complete on CLM-2026-00115). Never runs incidentally in CI.
  test.skip(!process.env.RUN_CMM65_SMOKE, 'set RUN_CMM65_SMOKE=1 to run (see smoke-audit MD)')
  test.skip(!BASIC_PASS, 'STAGING_BASIC_AUTH_PASS not set')
  test.skip(!SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY not set')
  test.skip(!HAVE_STATE, `no kunde storageState at ${KUNDE_STORAGE} — run kunde-auth-setup first`)

  // --- observers (register before navigation) ---
  const wsUrls: string[] = []
  const recvFrames: { t: number; text: string }[] = []
  page.on('websocket', (ws) => {
    wsUrls.push(ws.url())
    ws.on('framereceived', (f) => {
      const text = typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString('utf8')
      recvFrames.push({ t: Date.now(), text })
    })
  })
  const rscRefreshes: { t: number; url: string }[] = []
  page.on('request', (req) => {
    const h = req.headers()
    if (h['rsc'] === '1' || h['next-router-state-tree']) rscRefreshes.push({ t: Date.now(), url: req.url() })
  })
  page.on('console', (m) => console.log(`[browser:${m.type()}] ${m.text()}`.slice(0, 300)))
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))

  // --- 1) open the Kunde fall page (auth from cached storageState) ---
  await page.goto(`/kunde/faelle/${FALL_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  console.log(`[fall-page] url=${page.url()}`)
  await page.screenshot({ path: path.join(SCREENS, '01-kunde-fall-loaded.png'), fullPage: true })
  // Guard: if auth expired / ownership denied / onboarding-gated we'd be off the
  // fall route. CMM-63 canonicalizes /kunde/faelle/<fall_id> -> <claim_id>, so accept either.
  expect(page.url(), 'should be on the Kunde fall detail route').toMatch(
    new RegExp(`/kunde/faelle/(${FALL_ID}|${CLAIM_ID})`),
  )

  // --- 2) wait for realtime websocket + SUBSCRIBED handshake ---
  await expect
    .poll(() => wsUrls.some((u) => u.includes('/realtime/v1')), {
      timeout: 25_000,
      message: 'realtime websocket connected',
    })
    .toBe(true)
  console.log(`[realtime] ws connected: ${wsUrls.filter((u) => u.includes('/realtime/v1')).length} socket(s)`)
  await page.waitForTimeout(3_000) // allow phx_join + SUBSCRIBED + RLS auth

  const triggerTs = Date.now()

  // --- 3) trigger a claims UPDATE (service-role; == touchClaimRecency bump) ---
  const patchRes = await request.patch(`${SUPA_URL}/rest/v1/claims?id=eq.${CLAIM_ID}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    data: { updated_at: new Date().toISOString() },
  })
  console.log(`[trigger] PATCH claims id=${CLAIM_ID} -> ${patchRes.status()}`)
  expect(patchRes.ok(), `claims PATCH failed: ${patchRes.status()} ${await patchRes.text().catch(() => '')}`).toBeTruthy()

  // --- 4) the postgres_changes payload must reach THIS Kunde socket (RLS pass) ---
  await expect
    .poll(() => recvFrames.filter((f) => f.t >= triggerTs && f.text.includes(CLAIM_ID)).length, {
      timeout: 20_000,
      message: 'claims UPDATE delivered to Kunde realtime socket (RLS authorized)',
    })
    .toBeGreaterThan(0)
  console.log('[result] claims realtime frame delivered to Kunde socket OK')

  // --- 5) the subscription handler must call router.refresh() (RSC request) ---
  await expect
    .poll(() => rscRefreshes.filter((r) => r.t >= triggerTs).length, {
      timeout: 10_000,
      message: 'router.refresh() RSC request after realtime event',
    })
    .toBeGreaterThan(0)
  console.log('[result] router.refresh() fired OK')

  await page.waitForTimeout(1_500)
  await page.screenshot({ path: path.join(SCREENS, '02-kunde-fall-after-refresh.png'), fullPage: true })

  console.log(
    `[summary] wsSockets=${wsUrls.length} framesAfterTrigger=${recvFrames.filter((f) => f.t >= triggerTs).length} ` +
      `claimFramesAfterTrigger=${recvFrames.filter((f) => f.t >= triggerTs && f.text.includes(CLAIM_ID)).length} ` +
      `rscRefreshesAfterTrigger=${rscRefreshes.filter((r) => r.t >= triggerTs).length}`,
  )
})
