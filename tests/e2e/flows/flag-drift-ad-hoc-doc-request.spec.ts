import { test, expect } from '@playwright/test'
import {
  loginContextOrSkip,
  skipIfAuthWall,
  serviceClient,
  APP,
  CLAIMS,
} from './_golden-path-lib'

// #4164 (Flag-Drift Boy-Scout) — E2E fuer die drei betroffenen Flows, gegen
// staging/prod, opt-in (nie im Default-CI), serial. Nutzt die SP1-Fixtures
// (CLAIMS.c1/c2) + die golden-path-Harness (loginContext + serviceClient DB-Assert).
//
// Was bewiesen wird:
//  1. **Ad-hoc-Doc-Anforderung** (der HARTE Fix): requestDokumentFromKunde legte
//     dokument_upload_anfragen.status = 'pending' an — CHECK-invalide -> der Insert
//     schlug bei JEDEM Aufruf fehl (Feature kaputt). Fix -> 'gesendet'. Hier klickt
//     Admin auf der Fallakte "Dokument anfordern" + sendet; wir asserten die NEUE
//     Anfrage-Row mit status='gesendet' direkt in der DB. Vor dem Fix: keine Row +
//     Fehler-Toast -> der Test wuerde rot.
//  2. **SV Fall-Detail** (`gutachter/fall/[id]`): der tote `.in('status',[...])`-Wert
//     'durchgefuehrt' (aktiver-Termin-Query) wurde entfernt -> Surface muss rendern.
//  3. **SV Tagesvorbereitung-Export** (`exportTagesvorbereitung`): dito toter
//     'durchgefuehrt'-Filter entfernt -> Export-Query laeuft (CSV ODER "Keine Termine").
//
// Anlage/Cleanup: die erzeugte ad-hoc-Anfrage wird nach dem Lauf wieder geloescht.
// Kanal = E-Mail + interne Fixture-Identitaet (@claimondo.de) -> kein Real-Comms-Risiko.
//
// Run (nicht im Default-CI; post-merge / manuell mit Env + Creds):
//   set -a; source <(grep -E 'NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY' ../../../.env.local); set +a
//   RUN_FLAG_DRIFT_E2E=1 TEST_SV_PASSWORD='<stark>' TEST_ADMIN_TOTP_SECRET='<base32>' \
//   GOLDEN_APP_URL=https://app.staging.claimondo.de \
//   npx playwright test flag-drift-ad-hoc-doc-request --workers=1 --reporter=line

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.RUN_FLAG_DRIFT_E2E, 'set RUN_FLAG_DRIFT_E2E=1 (laeuft echt gegen staging/prod)')

const FALL = CLAIMS.c1
const createdAnfrageIds: string[] = []

/** lead_id der Fixture-Claim — die Anfrage haengt am Lead (nicht am Claim). */
async function fallLeadId(): Promise<string> {
  const { data, error } = await serviceClient()
    .from('claims')
    .select('lead_id')
    .eq('id', FALL)
    .maybeSingle()
  if (error || !data?.lead_id) {
    throw new Error(`lead_id fuer Claim ${FALL} nicht aufloesbar: ${error?.message ?? 'null'}`)
  }
  return data.lead_id as string
}

// Cleanup: die im Test erzeugten ad-hoc-Anfragen wieder entfernen (kein Test-Muell).
test.afterAll(async () => {
  if (createdAnfrageIds.length === 0) return
  await serviceClient().from('dokument_upload_anfragen').delete().in('id', createdAnfrageIds)
})

test('#4164 — Admin: Ad-hoc-Doc-Anforderung erzeugt dokument_upload_anfragen (status=gesendet)', async ({ browser }) => {
  test.setTimeout(90_000)
  const leadId = await fallLeadId()

  // Vorbestand merken, damit wir nur die NEU erzeugte Anfrage asserten.
  const before = await serviceClient()
    .from('dokument_upload_anfragen')
    .select('id')
    .eq('lead_id', leadId)
  const beforeIds = new Set<string>((before.data ?? []).map((r) => r.id as string))

  const ctx = await loginContextOrSkip(browser, 'admin')
  const page = await ctx.newPage()

  // 1. Interne Fallakte (Route-Key = claim_id). Admin sieht die FallActionBar.
  await page.goto(`${APP}/faelle/${FALL}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  skipIfAuthWall(page) // interne Rolle: an der 2FA-Wand skippen statt failen (aal1-Injection reicht nicht)

  // 2. "Dokument anfordern" (AdHocAnforderungsButton, unbedingt in FallActionBar) -> Modal.
  const opener = page.getByRole('button', { name: /Dokument anfordern/i }).first()
  await expect(opener, 'Ad-hoc-Anforderungs-Button sichtbar').toBeVisible({ timeout: 15_000 })
  await opener.click()

  // 3. Modal: Typ-Default (Mietwagen-Rechnung) ok; Kanal E-Mail (kein WA/SMS); absenden.
  await expect(page.getByText('Dokument beim Kunden anfordern')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'E-Mail', exact: true }).click()
  await page.getByRole('button', { name: /Anfrage senden/i }).click()

  // 4. Erfolg-Toast (der alte 'pending'-Bug haette hier einen Fehler-Toast gezeigt).
  await expect(page.getByText(/angefordert/i)).toBeVisible({ timeout: 15_000 })

  // 5. DB-Assert = der eigentliche Fix-Beweis: eine NEUE Row mit status='gesendet'.
  await expect
    .poll(
      async () => {
        const { data } = await serviceClient()
          .from('dokument_upload_anfragen')
          .select('id, status')
          .eq('lead_id', leadId)
          .eq('status', 'gesendet')
          .order('erstellt_am', { ascending: false })
        const fresh = (data ?? []).filter((r) => !beforeIds.has(r.id as string))
        for (const r of fresh) {
          const id = r.id as string
          if (!createdAnfrageIds.includes(id)) createdAnfrageIds.push(id)
        }
        return fresh.length
      },
      { timeout: 20_000, message: 'neue dokument_upload_anfragen-Row mit status=gesendet' },
    )
    .toBeGreaterThan(0)

  await ctx.close()
})

test('#4164 — SV: Fall-Detail rendert (toter durchgefuehrt-Filter entfernt)', async ({ browser }) => {
  test.setTimeout(60_000)
  test.skip(!process.env.TEST_SV_PASSWORD, 'TEST_SV_PASSWORD nicht gesetzt')
  const ctx = await loginContextOrSkip(browser, 'sv')
  const page = await ctx.newPage()

  await page.goto(`${APP}/gutachter/fall/${CLAIMS.c2}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  skipIfAuthWall(page)

  // Seite rendert (kein leerer notFound-Shell) — der aktive-Termin-Query darf nicht crashen.
  expect(new URL(page.url()).pathname, 'SV nicht an Auth-Wand / notFound').toContain('/gutachter/fall/')
  await expect(page.locator('body')).toContainText(/Termin|Fall|Gutachten|Auftrag/i, { timeout: 15_000 })

  await ctx.close()
})

test('#4164 — SV: Tagesvorbereitung-Export laeuft (toter durchgefuehrt-Filter entfernt)', async ({ browser }) => {
  test.setTimeout(60_000)
  test.skip(!process.env.TEST_SV_PASSWORD, 'TEST_SV_PASSWORD nicht gesetzt')
  const ctx = await loginContextOrSkip(browser, 'sv')
  const page = await ctx.newPage()

  await page.goto(`${APP}/gutachter/auftraege`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  skipIfAuthWall(page)

  const exportBtn = page.getByRole('button', { name: /Tagesvorbereitung CSV/i }).first()
  await expect(exportBtn, 'Export-Button sichtbar').toBeVisible({ timeout: 15_000 })

  // Klick loest exportTagesvorbereitung aus. Ergebnis: CSV-Download (Termine da) ODER
  // die "Keine Termine"-Meldung (leerer Zeitraum). Beides = die Query lief ohne Crash.
  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null)
  await exportBtn.click()
  const download = await downloadPromise
  if (!download) {
    await expect(
      page.getByText(/Keine Termine|Ungültiger Datums|Kein SV-Profil/i),
      'Export ohne Termine zeigt die erwartete Meldung (kein 500)',
    ).toBeVisible({ timeout: 8_000 })
  }

  await ctx.close()
})
