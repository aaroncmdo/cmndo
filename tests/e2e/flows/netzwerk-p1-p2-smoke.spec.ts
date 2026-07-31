// Regel-4-Prod-Smokes P1 (Verbindungs-Netzwerk-UI) + P2 (Netzwerkpartner-Badge) — gegen prod,
// Wegwerf-Konten, vollstaendiges Cleanup. Deckt den #4862-Smoke-Plan ab:
//   P1-1 SV-Portal: Tabs rendern · Verzeichnis-Suche · "Vernetzen" (Kante 'offen')
//   P1-2 Werkstatt: Anfragen-Tab · "Annehmen" (Kante 'angenommen') · Glocken-Mitteilung (DB)
//   P1-3 Verbindungen beidseitig · "Entfernen" (Kante weg)
//   P1-4 /flotte/netzwerk rendert die Tabs
//   P1-5 Kalt-Einladung: EinladenForm -> netzwerk_einladungen 'offen' -> anonyme Registrierung
//        via ?einladung=<token> -> Einladung 'eingeloest' + Auto-Kante 'angenommen'
//   P2   comped-Abo-Seed -> /api/v1/gutachter-termine?plz= : ist_top_partner false->true
//
// SICHERHEIT: throwaway-Accounts (telefon=NULL); die Registrier-Pflicht-Telefonnummer nutzt den
// reservierten fiktionalen Drama-Nummernkreis +49 30 23125 0xx (nie vergeben); Emails nur
// @claimondo.test. P2 macht den Wegwerf-SV fuer MINUTEN map-ready (anonymes Finder-Profil) und
// raeumt sofort. Cleanup inkl. Mitteilungen (FK-Learning aus dem P4-Smoke).

import { execSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const NEUE_WERKSTATT_EMAIL = `throwaway-p1kalt-${Date.now().toString(36)}@claimondo.test`

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

async function loginCookies(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = (await res.json()) as { access_token?: string }
  if (!session.access_token) throw new Error(`Auth fehlgeschlagen: ${JSON.stringify(session)}`)
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const value = encodeURIComponent(JSON.stringify(session))
  const CHUNK = 3180
  const chunks: { name: string; value: string }[] = []
  if (value.length <= CHUNK) chunks.push({ name: `sb-${projectRef}-auth-token`, value })
  else for (let i = 0; i * CHUNK < value.length; i++) chunks.push({ name: `sb-${projectRef}-auth-token.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) })
  return chunks.map((c) => ({ ...c, domain: '.claimondo.de', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const }))
}

function mkThrowaway(rolle: string): { uid: string; email: string; password: string } {
  const out = execSync(`node scripts/smoke/throwaway-account.mjs create ${rolle} --json`, { encoding: 'utf8' })
    .trim().split('\n').pop() as string
  return JSON.parse(out) as { uid: string; email: string; password: string }
}

test.describe.configure({ mode: 'serial' })

let sv: { uid: string; email: string; password: string } | null = null
let werkstatt: { uid: string; email: string; password: string } | null = null
let flotte: { uid: string; email: string; password: string } | null = null
let werkstattName = ''
let svId: string | null = null
let einladungToken: string | null = null

test.beforeAll(async () => {
  sv = mkThrowaway('sachverstaendiger')
  werkstatt = mkThrowaway('werkstatt')
  flotte = mkThrowaway('flottenmanager')
  const db = svc()
  const { data: w } = await db.from('werkstaetten').select('name').eq('user_id', werkstatt.uid).maybeSingle()
  werkstattName = ((w as { name?: string } | null)?.name ?? '').trim()
  const { data: s } = await db.from('sachverstaendige').select('id').eq('profile_id', sv.uid).maybeSingle()
  svId = ((s as { id?: string } | null)?.id ?? null)
  if (!werkstattName || !svId) throw new Error('Wegwerf-Satelliten fehlen')
})

test.afterAll(async () => {
  const db = svc()
  try {
    const uids = [sv?.uid, werkstatt?.uid, flotte?.uid].filter(Boolean) as string[]
    // Neu registrierte Kalt-Einladungs-Werkstatt aufloesen (per Email).
    const { data: neu } = await db.from('profiles').select('id').eq('email', NEUE_WERKSTATT_EMAIL).maybeSingle()
    const neuUid = (neu as { id?: string } | null)?.id ?? null
    if (neuUid) uids.push(neuUid)

    for (const uid of uids) {
      await db.from('netzwerk_verbindungen').delete().eq('anfrager_id', uid)
      await db.from('netzwerk_verbindungen').delete().eq('empfaenger_id', uid)
      await db.from('netzwerk_einladungen').delete().eq('einlader_id', uid)
      await db.from('mitteilungen').delete().eq('empfaenger_id', uid)
    }
    if (svId) await db.from('sv_netzwerk_abonnements').delete().eq('sv_id', svId)
    if (neuUid) {
      await db.from('werkstaetten').delete().eq('user_id', neuUid)
      await db.from('profiles').delete().eq('id', neuUid)
      await db.auth.admin.deleteUser(neuUid)
    }
  } catch (err) {
    console.error('[cleanup DB]', err)
  }
  for (const acc of [sv, werkstatt, flotte]) {
    if (!acc) continue
    try {
      execSync(`node scripts/smoke/throwaway-account.mjs cleanup ${acc.uid}`, { encoding: 'utf8' })
    } catch (err) {
      console.error('[cleanup acc]', err)
    }
  }
})

test('P1-1 SV: Tabs rendern + Verzeichnis-Suche + Vernetzen (Kante offen)', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ baseURL: APP, serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } })
  await ctx.addCookies(await loginCookies(sv!.email, sv!.password))
  const page = await ctx.newPage()

  await page.goto('/gutachter/netzwerk', { waitUntil: 'domcontentloaded' })
  for (const label of ['Feed', 'Verbindungen', 'Anfragen']) {
    await expect(page.getByRole('link', { name: label }).first(), `Tab ${label}`).toBeVisible({ timeout: 20_000 })
  }

  await page.goto('/gutachter/netzwerk?tab=verbindungen', { waitUntil: 'domcontentloaded' })
  const suche = page.getByPlaceholder(/Müller oder Köln/)
  await expect(suche, 'Verzeichnis-Suche sichtbar').toBeVisible({ timeout: 15_000 })
  await page.locator('select').first().selectOption({ value: 'werkstatt' }).catch(() => {})
  await suche.fill(werkstattName)
  const vernetzen = page.getByRole('button', { name: 'Vernetzen' }).first()
  await expect(vernetzen, `Treffer fuer "${werkstattName}" mit Vernetzen-Button`).toBeVisible({ timeout: 20_000 })
  await vernetzen.click()
  await expect(page.getByRole('button', { name: 'Angefragt' }).first()).toBeVisible({ timeout: 15_000 })

  const db = svc()
  const { data: kante } = await db
    .from('netzwerk_verbindungen').select('status')
    .eq('anfrager_id', sv!.uid).eq('empfaenger_id', werkstatt!.uid).maybeSingle()
  expect((kante as { status?: string } | null)?.status, 'Kante offen').toBe('offen')
  await ctx.close()
})

test('P1-2 Werkstatt: Anfrage sichtbar + Annehmen (Kante angenommen) + Glocken-Mitteilung', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ baseURL: APP, serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } })
  await ctx.addCookies(await loginCookies(werkstatt!.email, werkstatt!.password))
  const page = await ctx.newPage()

  await page.goto('/werkstatt/netzwerk?tab=anfragen', { waitUntil: 'domcontentloaded' })
  const annehmen = page.getByRole('button', { name: 'Annehmen' }).first()
  await expect(annehmen, 'eingehende Anfrage mit Annehmen').toBeVisible({ timeout: 20_000 })
  await annehmen.click()
  await page.waitForTimeout(2500)

  const db = svc()
  const { data: kante } = await db
    .from('netzwerk_verbindungen').select('status')
    .eq('anfrager_id', sv!.uid).eq('empfaenger_id', werkstatt!.uid).maybeSingle()
  expect((kante as { status?: string } | null)?.status, 'Kante angenommen').toBe('angenommen')

  const { data: glocke } = await db
    .from('mitteilungen').select('id, titel').eq('empfaenger_id', werkstatt!.uid).ilike('titel', '%etzwerk%')
  expect((glocke ?? []).length, 'Glocken-Mitteilung zur Netzwerk-Anfrage').toBeGreaterThan(0)
  await ctx.close()
})

test('P1-3 Verbindungen beidseitig + Entfernen', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ baseURL: APP, serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } })
  await ctx.addCookies(await loginCookies(sv!.email, sv!.password))
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept().catch(() => {}))

  await page.goto('/gutachter/netzwerk?tab=verbindungen', { waitUntil: 'domcontentloaded' })
  const entfernen = page.getByRole('button', { name: 'Entfernen' }).first()
  await expect(entfernen, 'Verbindung gelistet (Entfernen sichtbar)').toBeVisible({ timeout: 20_000 })
  await entfernen.click()
  await page.waitForTimeout(2500)

  const db = svc()
  const { data: kante } = await db
    .from('netzwerk_verbindungen').select('id')
    .eq('anfrager_id', sv!.uid).eq('empfaenger_id', werkstatt!.uid).maybeSingle()
  expect(kante, 'Kante entfernt (beidseitig weg — Paar-Row geloescht)').toBeNull()
  await ctx.close()
})

test('P1-4 Flotte: /flotte/netzwerk rendert die Tabs', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ baseURL: APP, serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } })
  await ctx.addCookies(await loginCookies(flotte!.email, flotte!.password))
  const page = await ctx.newPage()
  await page.goto('/flotte/netzwerk', { waitUntil: 'domcontentloaded' })
  for (const label of ['Feed', 'Verbindungen', 'Anfragen']) {
    await expect(page.getByRole('link', { name: label }).first(), `Flotte-Tab ${label}`).toBeVisible({ timeout: 20_000 })
  }
  await ctx.close()
})

test('P1-5 Kalt-Einladung: senden -> offen -> anonyme Registrierung -> eingeloest + Auto-Kante', async ({ browser }) => {
  test.setTimeout(180_000)
  const ctx = await browser.newContext({ baseURL: APP, serviceWorkers: 'block', viewport: { width: 1280, height: 1100 } })
  await ctx.addCookies(await loginCookies(sv!.email, sv!.password))
  const page = await ctx.newPage()

  await page.goto('/gutachter/netzwerk?tab=verbindungen', { waitUntil: 'domcontentloaded' })
  const emailFeld = page.getByPlaceholder('werkstatt@beispiel.de')
  await expect(emailFeld, 'EinladenForm sichtbar').toBeVisible({ timeout: 15_000 })
  await emailFeld.fill(NEUE_WERKSTATT_EMAIL)
  await page.getByRole('button', { name: /einlad/i }).first().click()
  await page.waitForTimeout(2500)

  const db = svc()
  const { data: einladung } = await db
    .from('netzwerk_einladungen').select('id, status')
    .eq('einlader_id', sv!.uid).eq('email', NEUE_WERKSTATT_EMAIL).maybeSingle()
  const e = einladung as { id?: string; status?: string } | null
  expect(e?.status, 'Einladung offen').toBe('offen')

  // Der Klartext-Token reist nur in der Einladungs-Mail (.test = tot) und liegt in der DB
  // NUR als sha256-Hash. Fuer die Redemption injizieren wir einen SELBST erzeugten Token
  // (identisches Verfahren aus einladung-core: sha256-hex + 8-Zeichen-Prefix) in die soeben
  // per UI erzeugte offene Einladung — der Redemption-Pfad selbst bleibt der echte.
  einladungToken = randomBytes(24).toString('base64url')
  const { error: tokErr } = await db
    .from('netzwerk_einladungen')
    .update({
      token_hash: createHash('sha256').update(einladungToken).digest('hex'),
      token_lookup_prefix: einladungToken.slice(0, 8),
    })
    .eq('id', e!.id as string)
  expect(tokErr, 'Token-Injection').toBeNull()
  await ctx.close()

  // Anonyme Registrierung ueber den Einladungs-Link.
  const anonCtx = await browser.newContext({ baseURL: APP, viewport: { width: 1280, height: 1400 } })
  const reg = await anonCtx.newPage()
  await reg.goto(`/werkstatt/registrieren?einladung=${einladungToken}`, { waitUntil: 'domcontentloaded' })
  await reg.getByLabel(/Werkstatt-Name/).fill('SMOKE Kalt-Einladung Werkstatt')
  await reg.getByLabel(/Vorname/).fill('Smoke')
  await reg.getByLabel(/Nachname/).fill('Kalt')
  await reg.getByLabel(/E-Mail/).fill(NEUE_WERKSTATT_EMAIL)
  await reg.getByLabel(/Telefon/).fill('+49 30 23125 011')
  await reg.getByLabel(/Straße/).fill('Smokestraße 1')
  await reg.getByLabel(/PLZ/).fill('10115')
  await reg.getByLabel(/^Ort/).fill('Berlin')
  // Einwilligungs-Checkbox(en) abhaken (Lauf-2-Befund: "Bitte bestätigen Sie die Einwilligung").
  for (const cb of await reg.locator('input[type="checkbox"]:visible').all()) {
    const checked = await cb.isChecked().catch(() => true)
    if (!checked) await cb.check().catch(() => {})
  }
  await reg.getByRole('button', { name: /registrieren|konto|absenden|erstellen/i }).last().click()
  await expect(
    reg.getByText(/Werkstatt-Konto ist aktiv|erfolgreich/i).first(),
    'Registrierungs-Erfolgs-UI',
  ).toBeVisible({ timeout: 45_000 })

  const deadline = Date.now() + 45_000
  let ok = false
  let lastE: Record<string, unknown> | null = null
  while (Date.now() < deadline && !ok) {
    const { data: e2 } = await db
      .from('netzwerk_einladungen').select('status')
      .eq('einlader_id', sv!.uid).eq('email', NEUE_WERKSTATT_EMAIL).maybeSingle()
    lastE = e2 as Record<string, unknown>
    ok = lastE?.status === 'eingeloest'
    if (!ok) await new Promise((r) => setTimeout(r, 3000))
  }
  if (!ok) {
    // Diagnose: volle Lage loggen (Einladungen zur Email, Kanten des neuen Profils, Profil).
    const { data: alle, error: qErr } = await db
      .from('netzwerk_einladungen')
      .select('id, einlader_id, email, status, token_lookup_prefix, eingeloest_profil_id')
      .eq('email', NEUE_WERKSTATT_EMAIL)
    const { data: prof } = await db.from('profiles').select('id').eq('email', NEUE_WERKSTATT_EMAIL).maybeSingle()
    const pid = (prof as { id?: string } | null)?.id
    const { data: kanten } = pid
      ? await db.from('netzwerk_verbindungen').select('anfrager_id, empfaenger_id, status').eq('empfaenger_id', pid)
      : { data: null }
    console.log('[P1-5 DIAG] qErr=', qErr?.message, 'einladungen=', JSON.stringify(alle), 'neuesProfil=', pid, 'kanten=', JSON.stringify(kanten), 'injTokenPrefix=', einladungToken?.slice(0, 8))
  }
  expect(ok, `Einladung eingeloest (zuletzt: ${JSON.stringify(lastE)})`).toBe(true)

  const { data: neu } = await db.from('profiles').select('id').eq('email', NEUE_WERKSTATT_EMAIL).maybeSingle()
  const neuUid = (neu as { id?: string } | null)?.id
  expect(neuUid, 'neuer Werkstatt-User existiert').toBeTruthy()
  const { data: autoKante } = await db
    .from('netzwerk_verbindungen').select('status')
    .or(`and(anfrager_id.eq.${sv!.uid},empfaenger_id.eq.${neuUid}),and(anfrager_id.eq.${neuUid},empfaenger_id.eq.${sv!.uid})`)
    .maybeSingle()
  expect((autoKante as { status?: string } | null)?.status, 'Auto-Kante angenommen').toBe('angenommen')
  await anonCtx.close()
})

test('P2 Badge: comped-Abo -> istNetzwerkpartner false->true (Embed-Finder, derive-at-read)', async () => {
  test.setTimeout(240_000)
  const db = svc()
  // Wegwerf-SV fuer Minuten map-ready machen (anonymes Profil; sofortiges Cleanup im afterAll
  // via Account-Delete). ladeAktiveSVs verlangt verifiziert + map-ready + isochrone.
  // Surface-Wahl: /embed/gutachter-finder rendert AktiverSVPublic.istNetzwerkpartner server-
  // seitig ins RSC-HTML (gleiches Abo-Praedikat wie ist_top_partner, P2-T5) — OHNE den
  // Slot-Zwang der /api/v1/gutachter-termine-Terminengine (SV ohne Verfuegbarkeiten wird
  // dort nie gelistet; dokumentierter Surface-Pivot).
  const lat = 52.532
  const lng = 13.385
  const d = 0.01
  const iso = { type: 'Polygon', coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]] }
  const { error: updErr } = await db
    .from('sachverstaendige')
    .update({
      standort_lat: lat,
      standort_lng: lng,
      standort_adresse: 'Smokeweg 1, 10115 Berlin',
      isochrone_polygon: iso,
      ist_testaccount: false,
      verifiziert: true,
    })
    .eq('id', svId!)
  expect(updErr, 'map-ready-Update').toBeNull()

  const fetchFlag = async (): Promise<boolean | null> => {
    try {
      const res = await fetch(`${APP}/embed/gutachter-finder`)
      if (!res.ok) return null
      const html = await res.text()
      const pos = html.indexOf(svId!)
      if (pos < 0) return null
      // `id` ist das ERSTE Feld des AktiverSVPublic-Objekts, istNetzwerkpartner das vorletzte —
      // der erste Match NACH der id-Position gehoert sicher zu DIESEM SV (ein Rueckwaerts-
      // Fenster matchte den Nachbar-SV, Lauf-7-Befund: echte comped-Partner im Embed).
      const window = html.slice(pos, pos + 4000)
      const m = window.match(/istNetzwerkpartner\\?":(true|false)/)
      return m ? m[1] === 'true' : null
    } catch {
      return null
    }
  }

  // Ohne Abo: gelistet mit istNetzwerkpartner=false (poll — RSC-/Route-Cache-schonend).
  let before: boolean | null = null
  for (let i = 0; i < 15 && before === null; i++) {
    before = await fetchFlag()
    if (before === null) await new Promise((r) => setTimeout(r, 6000))
  }
  expect(before, 'SV im Embed-Finder gelistet, ohne Abo istNetzwerkpartner=false').toBe(false)

  const { error: aboErr } = await db
    .from('sv_netzwerk_abonnements')
    .insert({ sv_id: svId!, status: 'comped' })
  expect(aboErr, 'comped-Abo-Seed').toBeNull()

  let after: boolean | null = null
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline && after !== true) {
    after = await fetchFlag()
    if (after !== true) await new Promise((r) => setTimeout(r, 6000))
  }
  expect(after, 'mit comped-Abo istNetzwerkpartner=true (derive-at-read, kein Deploy noetig)').toBe(true)
})
