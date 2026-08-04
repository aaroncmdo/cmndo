// J7 — Storno / DSGVO-Löschung — Journey-Smoke gegen PROD.
//
// Journey-Spec: docs/fundament/journeys/j07-storno-dsgvo-loeschung.md
// Seed:         scripts/smoke/storno-dsgvo-seed.mjs (3 getrennte Wegwerf-Konten, self-cleaning)
//
// ⚠ Soll≠Ist (Erhebung 04.08., file:line-belegt): KEIN Kunde-Storno — j07:18 "Kunde storniert"
//   hat keine Kunde-UI. Storno ist INTERN (Admin/KB): markClaimAsStorniert (endzustand-actions.ts:309,
//   requireRole admin/kb) via EndzustandDropdown -> EndzustandModal in der Fallakte /faelle/[id].
// ⚠ DSGVO ist IRREVERSIBEL -> ausschliesslich eigene Wegwerf-Konten aus dem Seed; die Admin-Zeile
//   wird per EXAKTER Wegwerf-Email getargetet (page.locator('li', { hasText: email })), NIE
//   "erste Zeile" — die Liste zeigt ALLE offenen Anträge, auch echte.
// ⚠ 2-Schritt PFLICHT: chk_bestaetigt_logic (DB-CHECK) verlangt bestaetigt_am für
//   status='ausgefuehrt'. "Direkt ausführen" auf einem frisch eingereichten Antrag würde den
//   Status-Write silent verlieren (fuehreLoeschungAus ignoriert das Update-Result) — der Smoke
//   fährt deshalb Bestätigen -> Direkt ausführen (entspricht dem j07-2-Schritt-Prinzip).
//
// Lauf: CI=1 RUN_STORNO_DSGVO_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//       npx playwright test storno-dsgvo-smoke --project=chromium --reporter=line --workers=1
import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SEED_PATH = path.resolve(__dirname, '../../../scripts/smoke/.storno-dsgvo-seed.json')
const SEED: Record<string, string> = existsSync(SEED_PATH) ? JSON.parse(readFileSync(SEED_PATH, 'utf8')) : {}

// --- service-role DB-Client zum Verifizieren (env process.env-first — CI hat kein .env.local) ---
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (process.env)')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_STORNO_DSGVO_SMOKE, 'set RUN_STORNO_DSGVO_SMOKE=1 to run this prod smoke')
  test.skip(!SEED.stornoClaimId, 'storno-dsgvo-seed fehlt — erst: node scripts/smoke/storno-dsgvo-seed.mjs')
})

test('A · Storno (intern Admin): EndzustandDropdown -> Modal -> operative_status=storniert', async ({ page }) => {
  // Journey J7 · Ablauf A — Throwaway-Admin storniert den Wegwerf-Claim (regulierung = nicht-terminal).
  test.setTimeout(120_000)
  await login(page, SEED.adminEmail, SEED.adminPw)
  await page.goto(`/faelle/${SEED.stornoClaimId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  const trigger = page.getByRole('button', { name: 'Endzustand' })
  await expect(trigger, 'Endzustand-Trigger sichtbar (FallIdentityHeader-ActionBar)').toBeVisible({ timeout: 20_000 })
  await expect(trigger, 'regulierung ist nicht-terminal — Trigger muss enabled sein').toBeEnabled()

  // Hydration-robustes Öffnen (J4-Lektion #4929): Klick idempotent wiederholen, bis das
  // Dropdown-Item wirklich da ist — ein Sofort-Klick vor Hydration verpufft sonst.
  const stornoItem = page.getByRole('button', { name: 'Stornieren', exact: true })
  await expect(async () => {
    await trigger.click()
    await expect(stornoItem).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await stornoItem.click()

  // Modal: Pflicht-Begründung + Confirm-Tipp 'STORNIEREN' (EndzustandModal mode=storniert).
  const grundFeld = page.getByPlaceholder(/Kunde wünscht Abbruch/)
  await expect(grundFeld, 'Begründungs-Feld im Storno-Modal').toBeVisible({ timeout: 10_000 })
  await grundFeld.fill('SMOKE-J7: Storno-Journey (Wegwerf-Claim, Regel-4-Testlauf)')
  await page.getByPlaceholder('STORNIEREN').fill('STORNIEREN')

  // notify default false bei storniert — defensiv absichern (Regel 4: keine Kunden-Comms).
  const notifyCheckbox = page.getByRole('checkbox')
  if (await notifyCheckbox.count() > 0 && await notifyCheckbox.first().isChecked()) {
    await notifyCheckbox.first().uncheck()
  }

  await page.getByRole('button', { name: 'Schaden stornieren', exact: true }).click()
  // Erfolg = Modal schliesst; "bereits in einem Endzustand" wäre Guard-/Seed-Problem.
  await expect(page.getByText(/bereits in einem Endzustand/i)).toHaveCount(0, { timeout: 10_000 })
  await expect(grundFeld, 'Modal schliesst bei Erfolg').toBeHidden({ timeout: 15_000 })

  // DB-Verify (SSoT): setEndzustandFields schreibt operative_status + abgeschlossen_am +
  // endzustand_gesetzt_am/_grund atomar mit Row-Check (#4625-Klasse).
  await expect(async () => {
    const { data } = await db()
      .from('claims')
      .select('operative_status, abgeschlossen_am, endzustand_gesetzt_am, endzustand_grund')
      .eq('id', SEED.stornoClaimId)
      .maybeSingle()
    expect(data?.operative_status, 'operative_status muss storniert sein').toBe('storniert')
    expect(data?.abgeschlossen_am, 'abgeschlossen_am (Close-Marker) muss gesetzt sein').not.toBeNull()
    expect(data?.endzustand_gesetzt_am, 'endzustand_gesetzt_am muss gesetzt sein').not.toBeNull()
    expect(data?.endzustand_grund ?? '').toContain('SMOKE-J7')
  }).toPass({ timeout: 30_000 })
})

test.describe.serial('B · DSGVO-Löschung (2-Schritt: Antrag -> Bestätigung -> Ausführung)', () => {
  test('B1 · Kunde stellt Lösch-Antrag im Profil -> status=eingereicht', async ({ page }) => {
    // Journey J7 · Ablauf B Schritt 1 — DsgvoLoeschCard auf /kunde/profil (stelleLoeschAntrag).
    test.setTimeout(120_000)

    // Retry-Idempotenz: lief die Kette schon weiter (bestaetigt/ausgefuehrt), ist der
    // Kunde ggf. schon gelöscht — B2 asserted den Endzustand, hier nichts mehr zu tun.
    const { data: pre } = await db()
      .from('dsgvo_loeschauftraege')
      .select('status')
      .eq('email', SEED.dsgvoKundeEmail)
      .maybeSingle()
    if (pre && pre.status !== 'eingereicht') return

    await login(page, SEED.dsgvoKundeEmail, SEED.dsgvoKundePw)
    await page.goto('/kunde/profil', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    const stellenBtn = page.getByRole('button', { name: 'Lösch-Antrag stellen' })
    const liegtVor = page.getByText('Lösch-Antrag liegt vor')
    await expect(stellenBtn.or(liegtVor).first(), 'DsgvoLoeschCard sichtbar').toBeVisible({ timeout: 20_000 })

    if (await stellenBtn.isVisible().catch(() => false)) {
      // Hydration-robust: Klick wiederholen, bis das Confirm-Formular offen ist.
      const confirmBtn = page.getByRole('button', { name: 'Ja, Antrag stellen' })
      await expect(async () => {
        await stellenBtn.click()
        await expect(confirmBtn).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await page.getByPlaceholder('Warum möchten Sie Ihre Daten löschen lassen?')
        .fill('SMOKE-J7: DSGVO-Journey (Wegwerf-Konto, Regel-4-Testlauf)')
      await confirmBtn.click()
      await expect(liegtVor, 'Card wechselt auf Antrag-liegt-vor').toBeVisible({ timeout: 15_000 })
    }

    await expect(async () => {
      const { data } = await db()
        .from('dsgvo_loeschauftraege')
        .select('status, eingereicht_von')
        .eq('email', SEED.dsgvoKundeEmail)
        .maybeSingle()
      expect(data?.status, 'Antrag muss eingereicht sein').toBe('eingereicht')
      expect(data?.eingereicht_von).toBe('self_service')
    }).toPass({ timeout: 20_000 })
  })

  test('B2 · Admin bestätigt + führt aus -> anonymisiert + Login entzogen', async ({ page }) => {
    // Journey J7 · Ablauf B Schritte 2+3 — /admin/datenschutz/loeschauftraege.
    test.setTimeout(180_000)

    const pre = await db()
      .from('dsgvo_loeschauftraege')
      .select('id, status')
      .eq('email', SEED.dsgvoKundeEmail)
      .maybeSingle()
    expect(pre.data, 'B1 muss den Antrag angelegt haben').toBeTruthy()
    const auftragId = pre.data!.id as string

    if (pre.data!.status !== 'ausgefuehrt') {
      await login(page, SEED.adminEmail, SEED.adminPw)
      await page.goto('/admin/datenschutz/loeschauftraege', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})

      // ⚠⚠ Zeile per EXAKTER Wegwerf-Email targeten — die Liste zeigt ALLE offenen Anträge.
      const row = page.locator('li', { hasText: SEED.dsgvoKundeEmail })
      await expect(row, 'Antrag-Zeile des Wegwerf-Kunden sichtbar').toBeVisible({ timeout: 20_000 })

      // Schritt 2: Bestätigen (setzt bestaetigt_am — Voraussetzung für chk_bestaetigt_logic).
      // Bei Retry nach Teil-Fortschritt (status=bestaetigt) fehlt der Button -> Badge-Check trägt.
      await expect(async () => {
        const bestBtn = row.getByRole('button', { name: 'Bestätigen' })
        if (await bestBtn.isVisible().catch(() => false)) await bestBtn.click()
        await expect(row.getByText('14d Karenz')).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 30_000 })

      // Schritt 3: Direkt ausführen -> Inline-Confirm "Ja, ausführen" (DsgvoLoeschAdminActions).
      const jaBtn = row.getByRole('button', { name: 'Ja, ausführen' })
      await expect(async () => {
        await row.getByRole('button', { name: 'Direkt ausführen' }).click()
        await expect(jaBtn).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })
      await jaBtn.click()
    }

    // DB-Verify (SSoT): fuehreLoeschungAus = rpc dsgvo_anonymize_user_data + auth.admin.deleteUser
    // + status=ausgefuehrt. Die Action bricht VOR deleteUser/Status-Write ab, wenn die RPC wirft
    // (Schema-Drift-Klasse, Migration 20260804193646) -> status='ausgefuehrt' beweist den RPC-Lauf.
    // Kette dauert (RPC + Auth-Delete) -> toPass-Poll statt fixem Timeout.
    await expect(async () => {
      const d = db()
      const { data: auftrag } = await d
        .from('dsgvo_loeschauftraege')
        .select('status, bestaetigt_am, ausgefuehrt_am, audit_payload')
        .eq('id', auftragId)
        .maybeSingle()
      expect(auftrag?.status, 'Antrag muss ausgeführt sein').toBe('ausgefuehrt')
      expect(auftrag?.ausgefuehrt_am, 'ausgefuehrt_am muss gesetzt sein').not.toBeNull()
      const payload = (auftrag?.audit_payload ?? {}) as Record<string, unknown>
      expect(payload.auth_user_deleted, 'audit_payload.auth_user_deleted muss true sein').toBe(true)

      // Login entzogen: auth.users weg (getUserById liefert user=null/Fehler).
      const userRes = await d.auth.admin.getUserById(SEED.dsgvoKundeUid).catch(() => null)
      expect(userRes?.data?.user ?? null, 'auth.users muss gelöscht sein').toBeNull()

      // profiles weg via ON DELETE CASCADE (profiles_id_fkey -> auth.users).
      const { count: profCount } = await d
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('id', SEED.dsgvoKundeUid)
      expect(profCount ?? 0, 'profiles-Zeile muss weg sein (CASCADE)').toBe(0)

      // Claim bleibt bestehen (Anonymisierung, kein Delete); der Personen-Bezug faellt via
      // FK-Kette: auth-Delete -> profiles-CASCADE -> claims.geschaedigter_user_id SET NULL.
      // (claims.kunde_email existiert seit dem Schema-Umbau nicht mehr — der fruehere
      // Snapshot-Assert entfiel mit Migration 20260804193646.)
      const { data: claim } = await d
        .from('claims')
        .select('geschaedigter_user_id')
        .eq('id', SEED.dsgvoClaimId)
        .maybeSingle()
      expect(claim, 'DSGVO-Claim muss noch existieren (Anonymisierung, kein Delete)').toBeTruthy()
      expect(claim?.geschaedigter_user_id, 'geschaedigter_user_id muss NULL sein').toBeNull()
    }).toPass({ timeout: 60_000 })
  })
})
