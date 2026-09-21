import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import os from 'node:os'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { serviceClient } from './_golden-path-lib'
import { basicAuthFuerZiel, basicAuthFehlt } from '../lib/ziel'

// Regel-4-Prod-Smoke: „Ein Gutachter legt sich selbst an — und der Admin muss nichts tun."
//
// Aaron am 21.09.2026: „das onboarding bitte operativ smoken per playwright … bitte mit account
// anlage durchspielen - so dass der admin eigentl.ich nichts machen muss soll es sein."
//
// Das ist der Bogen zurück zu seinem Auftrag vom 19.09.: „Wir gehen jetzt nochmal das komplette
// Sachverständige-Onboarding von überall durch … ob die Freischaltung automatisch passiert."
// Die Schwester-Spec sv-onboarding-auto-freischaltung-prod.spec.ts misst denselben Wizard, setzt
// das Konto aber per Seed. HIER beginnt der Weg beim leeren Registrierungsformular.
//
// Soll (aus der Fachlogik, nicht aus dem Code):
//   1. Gutachter trägt sich auf /sv/registrieren selbst ein
//   2. hat danach ein Konto — ohne dass jemand es anlegt oder freigibt
//   3. meldet sich an, setzt sein Passwort, landet in der Einrichtung
//   4. durchläuft sie bis zum Ende
//   5. ist danach freigeschaltet, auffindbar und buchbar
//   6. und in der Aufgabenliste des Admins liegt NICHTS
//
// Die letzte Zeile ist Aarons eigentliche Frage.
//
// ⚠ ZWEI EHRLICHE EINSCHRÄNKUNGEN, beide im Bericht vermerkt:
//   * Das Einmalpasswort geht per E-Mail raus. Der Smoke liest keinen Posteingang; er weist den
//     Versand über `email_log` nach und setzt dann per Service-Client ein bekanntes Passwort.
//     Der Schritt „Gutachter erhält Zugangsdaten" ist damit gemessen, nicht übersprungen —
//     ersetzt ist nur der Briefkasten.
//   * Die Telefonnummer ist im Formular Pflicht. Der Smoke trägt eine nicht zustellbare Nummer
//     ein (lauter Nullen). Die Registrierung versendet nachweislich keine SMS
//     (registriereSvBasicNeu ruft keinen Sendeweg), es geht also nichts an eine reale Nummer.
//
// Lauf:
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/sv-onboarding-ab-registrierung-prod.spec.ts --workers=1
// Aufräumen (immer, auch nach rotem Lauf):
//   node --env-file=<abs>/.env.local scripts/smoke/sv-onboarding-ab-registrierung-cleanup.mjs

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SHOTS = process.env.ABNAHME_SHOTS_DIR ?? join(os.tmpdir(), 'abnahme-sv-registrierung')
const LAUF_DATEI = join(os.tmpdir(), 'sv-onboarding-ab-registrierung-lauf.json')

// Pellworm: weit weg von jedem echten Gutachter. Ein Wegwerf-Konto dort zieht keine echten
// Leads an, und kein echter Gutachter gerät in die Messung.
const ORT = {
  adresse: 'Uthlandestraße 2, 25849 Pellworm',
  plz: '25849',
  lat: 54.5206,
  lng: 8.6494,
}
// Nicht zustellbar und niemandem zugeteilt. Die Aktion prüft nur die Länge.
const TELEFON = '+49 000 0000000'

// Der erste Wizard-Schritt verlangt eine bestätigte Telefonnummer per SMS. In der
// Supabase-Auth-Konfiguration liegt dafür eine Testnummer mit festem Code — dieselbe, die der
// Telefon-Login-Smoke nutzt. Fehlt sie, setzt der Lauf die Bestätigung per Service-Client und
// weist das offen aus, statt eine echte SMS zu schicken.
const TEST_NUMMER = process.env.SMOKE_PHONE_TEST_NUMBER ?? ''
const TEST_OTP = process.env.SMOKE_PHONE_OTP_CODE ?? ''

// Minimal gültiges PDF — reicht dem Slot-Katalog (application/pdf, < 15 MB).
const MINI_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n' +
    '0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n',
)

type Lauf = { runId: string; email: string; passwort: string; svId: string; uid: string }

function laufLesen(): Lauf | null {
  try {
    return JSON.parse(readFileSync(LAUF_DATEI, 'utf8')) as Lauf
  } catch {
    return null
  }
}

function laufSchreiben(l: Lauf) {
  writeFileSync(LAUF_DATEI, JSON.stringify(l, null, 2))
}

async function beleg(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {})
}

async function neuerKontext(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    baseURL: APP,
    viewport: { width: 1440, height: 1200 },
    serviceWorkers: 'block',
    httpCredentials: basicAuthFuerZiel(),
  })
  return { ctx, page: await ctx.newPage() }
}

async function weiter(page: Page) {
  const btn = page.getByTestId('wizard-weiter')
  await expect(btn).toBeEnabled({ timeout: 20_000 })
  await btn.click()
}

async function unterschreiben(page: Page) {
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signatur-Canvas ohne BoundingBox')
  const cy = box.y + box.height / 2
  await page.mouse.move(box.x + 30, cy)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, cy - 20, { steps: 8 })
  await page.mouse.move(box.x + box.width * 0.7, cy + 15, { steps: 8 })
  await page.mouse.move(box.x + box.width - 30, cy - 5, { steps: 8 })
  await page.mouse.up()
}

test.describe.configure({ mode: 'serial' })
test.beforeEach(() => {
  test.skip(basicAuthFehlt(), 'Ziel ist staging, aber STAGING_BASIC_AUTH_USER/PASS fehlen')
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// N1 · Der Gutachter legt sich selbst an — das leere Formular, echt ausgefüllt.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('N1 · Registrierung per Formular legt ein Konto an, ohne dass jemand eingreift', async ({ browser }) => {
  test.setTimeout(4 * 60_000)

  const runId = Math.random().toString(36).slice(2, 10)
  const email = `e2e-svreg-${runId}@claimondo.de`
  const db = serviceClient()

  const { ctx, page } = await neuerKontext(browser)
  try {
    await page.goto('/sv/registrieren', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByRole('heading', { name: 'Als Sachverständiger registrieren' })).toBeVisible({ timeout: 30_000 })

    // Der Weg beginnt mit der Bestandssuche. Ein neuer Betrieb steht dort nicht — also „Neu eintragen".
    await page.getByRole('button', { name: 'Neu eintragen' }).click()
    await expect(page.getByRole('heading', { name: 'Neu registrieren' })).toBeVisible({ timeout: 20_000 })

    await page.getByPlaceholder('Max').fill('Smoke')
    await page.getByPlaceholder('Mustermann').fill(`Selbstanlage-${runId}`)
    await page.getByPlaceholder('Ihre@email.de').fill(email)
    await page.getByPlaceholder('+49 151 12345678').fill(TELEFON)

    // Die Adresse ist ein Feld mit Vorschlagsliste. Ein Vorschlag liefert saubere Koordinaten —
    // und die entscheiden später über die Freischaltung: ohne sie greift der Geo-Guard und legt
    // eine Admin-Aufgabe an, statt freizuschalten.
    const adressfeld = page.getByRole('combobox', { name: /^Adresse/ })
    await adressfeld.fill(ORT.adresse)
    await page.waitForTimeout(1_800)
    const vorschlag = page.getByRole('option').first()
    if (await vorschlag.isVisible().catch(() => false)) {
      console.log(`[N1] Adress-Vorschlag: ${(await vorschlag.innerText()).replace(/\s+/g, ' ').trim()}`)
      await vorschlag.click()
      await page.waitForTimeout(600)
    } else {
      console.log('[N1] keine Adress-Vorschläge — der Server geocodiert den getippten Text')
    }

    // „42103" steckt auch im Platzhalter des Adressfeldes. Deshalb über die Rolle, nicht über
    // den Platzhalter (Substring-Falle, am 21.09. eingefahren).
    await page.getByRole('textbox', { name: /^PLZ/ }).fill(ORT.plz)
    await beleg(page, 'n1-formular-ausgefuellt')

    // Basic ist der Weg ohne Zahlung — den hat Aaron gemeint.
    await page.getByRole('button', { name: /^Basic gratis/ }).click()
    await page.getByRole('button', { name: 'Registrierung absenden' }).click()

    // Der Folgezustand steht in der Datenbank, nicht im Toast.
    await expect
      .poll(
        async () => {
          const { data } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
          return data?.id ?? null
        },
        { timeout: 60_000, message: 'Konto entsteht aus dem Formular' },
      )
      .not.toBeNull()
    // Der Bestätigungsschirm sagt, ob die Zugangsdaten rausgingen. Ohne sie käme ein echter
    // Gutachter nicht in sein Konto — dann müsste doch jemand eingreifen.
    await expect(page.getByRole('heading', { name: 'Fast geschafft!' })).toBeVisible({ timeout: 45_000 })
    await page.waitForTimeout(500)
    await beleg(page, 'n1-nach-absenden')

    const linkVersandt = await page
      .getByText(/Wir haben Ihnen einen Link an/)
      .isVisible()
      .catch(() => false)
    const versandFehlte = await page
      .getByText(/konnte gerade nicht zugestellt werden/)
      .isVisible()
      .catch(() => false)
    console.log(`[N1] Bestätigungsschirm: Link verschickt = ${linkVersandt}, Versand fehlgeschlagen = ${versandFehlte}`)
    expect(
      versandFehlte,
      'der Gutachter bekommt seine Zugangsdaten — sonst käme er ohne fremde Hilfe nicht ins Konto',
    ).toBe(false)

    const { data: prof } = await db
      .from('profiles')
      .select('id, rolle, force_password_change, telefon')
      .eq('email', email)
      .single()
    expect(prof, 'Profil gelesen').not.toBeNull()
    expect(prof!.rolle, 'Rolle Sachverständiger').toBe('sachverstaendiger')
    expect(prof!.force_password_change, 'erster Login verlangt ein eigenes Passwort').toBe(true)

    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id, paket, portal_zugang_freigeschaltet, ist_aktiv, verifiziert, standort_lat, standort_lng, onboarding_quelle')
      .eq('profile_id', prof!.id)
      .single()
    expect(sv, 'SV-Zeile gelesen').not.toBeNull()
    expect(sv!.paket, 'Basic gewählt').toBe('basic')
    expect(sv!.onboarding_quelle, 'als Selbstregistrierung erfasst').toBe('self_service_neu')
    expect(
      sv!.portal_zugang_freigeschaltet,
      'vor dem Wizard noch nicht freigeschaltet — das passiert am Ende der Einrichtung',
    ).toBeFalsy()

    // Die Adresse wird beim Anlegen geocodiert. Ohne Koordinaten ist der Gutachter später weder
    // auf der Karte noch im Matching — das wäre ein Befund, kein Testproblem.
    expect(sv!.standort_lat, 'Adresse wurde geocodiert (sonst später unsichtbar)').not.toBeNull()
    expect(sv!.standort_lng, 'Adresse wurde geocodiert').not.toBeNull()

    // Die Zugangsdaten gehen per E-Mail raus. Der Smoke liest keinen Posteingang — er misst den
    // Bestätigungsschirm (oben) und setzt danach ein bekanntes Passwort, um weiterzukommen.
    //
    // ⚠ Die folgende Zeile bleibt für Testadressen LEER, und das ist richtig so: Adressen auf
    // der eigenen Domain (@claimondo.de) fängt die Send-Isolation ab, bevor protokolliert wird
    // („ein Versand, den es nie gab, gehört nicht ins Versandprotokoll", client.ts). Echte
    // Gutachter bekommen ihre Mail — am 21.09. mit drei zugestellten Einträgen belegt.
    // Wer hier eine Null sieht, hat KEINEN Befund gefunden.
    const { data: mails } = await db
      .from('email_log')
      .select('empfaenger, status, template')
      .eq('empfaenger', email)
      .limit(5)
    console.log(`[N1] E-Mails an den neuen Gutachter: ${(mails ?? []).length} ${JSON.stringify(mails ?? [])}`)

    const passwort = `E2eReg-${runId}-Neu1!`
    const { error: pwErr } = await db.auth.admin.updateUserById(prof!.id, { password: passwort })
    expect(pwErr, 'Passwort für den Smoke gesetzt (ersetzt nur den Posteingang)').toBeNull()

    laufSchreiben({ runId, email, passwort, svId: sv!.id, uid: prof!.id })
  } finally {
    await ctx.close()
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// N3–N6 · Anmelden, eigenes Passwort setzen, Einrichtung bis zum Ende.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('N3–N6 · Erster Login, eigenes Passwort, Einrichtung bis zum Abschluss', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  const lauf = laufLesen()
  test.skip(!lauf, 'N1 hat kein Konto hinterlassen')

  const db = serviceClient()
  const { ctx, page } = await neuerKontext(browser)
  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"], input[name="email"]').first().fill(lauf!.email)
    await page.locator('input[type="password"]').first().fill(lauf!.passwort)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/gutachter|\/passwort-aendern/, { timeout: 45_000 })

    // Das Einmalpasswort muss ersetzt werden — ein echter Schritt des Nutzerwegs.
    const eigenes = `${lauf!.passwort}-Eigen1!`
    if (/\/passwort-aendern/.test(page.url())) {
      await page.getByPlaceholder('Mindestens 12 Zeichen').fill(eigenes)
      await page.getByPlaceholder('Passwort wiederholen').fill(eigenes)
      await page.getByRole('button', { name: 'Passwort ändern' }).click()
      await page.waitForURL(/\/gutachter/, { timeout: 45_000 })
      laufSchreiben({ ...lauf!, passwort: eigenes })
    }
    await beleg(page, 'n3-nach-login')

    await page.goto('/gutachter/willkommen', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Willkommen bei Claimondo')).toBeVisible({ timeout: 30_000 })

    let dokumentHochgeladen = false
    let telefonPerUi = false
    let fertig = false
    for (let i = 0; i < 12 && !fertig; i += 1) {
      if (await page.getByText('Geschafft!').isVisible().catch(() => false)) {
        fertig = true
        break
      }
      const text = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ')

      // Jeder Schritt wird an dem erkannt, was es NUR dort gibt — nie an „Weiter"/„Zurück".
      const codeSenden = page.getByRole('button', { name: 'Code senden' })
      if (await codeSenden.isVisible().catch(() => false)) {
        // Telefon bestätigen — der einzige Pflichtschritt, der eine echte SMS auslösen könnte.
        // Erst der echte Weg, mit der in Supabase hinterlegten Testnummer.
        if (TEST_NUMMER && TEST_OTP) {
          await page.getByPlaceholder('+49 151 12345678').fill(TEST_NUMMER)
          await codeSenden.click()
          const codefeld = page.getByPlaceholder('123456')
          await expect(codefeld, 'Code-Eingabe erscheint').toBeVisible({ timeout: 30_000 })
          // Nach dem Senden zeichnet die Komponente neu. Ein zu frühes fill() geht dabei
          // verloren — am 21.09. stand beim Bestätigen ein leeres Feld und die Seite meldete
          // „Bitte den 6-stelligen Code eingeben". Also: warten, füllen, den Wert PRÜFEN.
          await page.waitForTimeout(1_200)
          await codefeld.fill(TEST_OTP)
          await expect(codefeld, 'der Code steht wirklich im Feld').toHaveValue(TEST_OTP, { timeout: 10_000 })
          await page.getByRole('button', { name: 'Bestätigen' }).click()
          await page.waitForTimeout(4_000)

          const { data: nachher } = await db
            .from('profiles')
            .select('twofa_telefon_verifiziert_am')
            .eq('id', lauf!.uid)
            .maybeSingle()
          telefonPerUi = !!nachher?.twofa_telefon_verifiziert_am
          if (!telefonPerUi) {
            // ⭐ BEFUND, am 21.09.2026 auf prod gemessen: Die in der Supabase-Auth hinterlegte
            // Testnummer mit festem Code gilt für den Telefon-LOGIN (signInWithOtp), aber NICHT
            // für diese Bestätigung — sie läuft über den MFA-Faktor (mfa.enroll + challenge),
            // einen anderen Codepfad. Die Seite meldet „Ungültiger oder abgelaufener Code".
            // Folge: dieser eine Schritt ist per Playwright nicht klickbar, ohne eine echte SMS
            // an eine echte Nummer zu schicken. Alles davor und danach bleibt echter Klick.
            const fehlertext = await page
              .getByText(/Ungültiger|abgelaufen|Code/)
              .first()
              .innerText()
              .catch(() => '(kein Text)')
            console.warn(
              `[N4] BEFUND: Das Test-Einmalkennwort greift bei der Telefonbestätigung nicht — "${fehlertext.replace(/\s+/g, ' ').trim()}". ` +
                'Der Schritt wird gesetzt statt geklickt; siehe Abnahmebericht.',
            )
            await beleg(page, 'n4-otp-abgelehnt')
          } else {
            await beleg(page, 'n4-telefon-bestaetigt')
          }
        }

        if (!telefonPerUi) {
          // Ohne gültigen Testcode ginge eine echte SMS an eine echte Nummer — das verbietet
          // Regel 4. Die Bestätigung wird gesetzt, die Auslassung offen ausgewiesen.
          const { error } = await db
            .from('profiles')
            .update({ twofa_telefon_verifiziert_am: new Date().toISOString() })
            .eq('id', lauf!.uid)
            .select('id')
          expect(error, 'Telefonbestätigung gesetzt').toBeNull()
          await page.reload({ waitUntil: 'domcontentloaded' })
          await page.waitForLoadState('networkidle').catch(() => {})
        }
        await page.waitForTimeout(1_200)
        continue
      }

      const kurzbeschreibung = page.getByPlaceholder('Worauf sind Sie spezialisiert?')
      if (await kurzbeschreibung.isVisible().catch(() => false)) {
        await kurzbeschreibung.fill(
          `E2E-Wegwerf-Gutachter (Selbstanlage ${lauf!.runId}) — prüft, ob die Freischaltung ohne Admin läuft.`,
        )
        await expect(kurzbeschreibung).toHaveValue(/E2E-Wegwerf-Gutachter/)
        await weiter(page)
      } else if (/Kalender verbinden/.test(text)) {
        await page.getByText('Ich nutze keines dieser Tools').first().click()
        await page.getByRole('button', { name: 'Weiter ohne Kalender' }).click()
        await weiter(page)
      } else if (/Ihr Widget/.test(text)) {
        await page.getByPlaceholder('z. B. Kfz-Gutachter Müller').fill(`E2E Widget ${lauf!.runId}`)
        await page.getByRole('button', { name: 'Ich habe noch keine Website' }).click()
        await expect(page.getByTestId('wizard-weiter')).toBeEnabled({ timeout: 30_000 })
        await weiter(page)
      } else if (/Ihre Dokumente/.test(text)) {
        await expect(page.getByText('Alles optional')).toBeVisible()
        await expect(page.getByTestId('wizard-weiter'), 'der Schritt blockiert nie').toBeEnabled()
        await page
          .locator('input[aria-label="Berufshaftpflicht hochladen"]')
          .setInputFiles({ name: 'berufshaftpflicht.pdf', mimeType: 'application/pdf', buffer: MINI_PDF })
        await expect(page.locator('[data-slot-zustand="aktiv"]').first()).toBeVisible({ timeout: 30_000 })
        dokumentHochgeladen = true
        await beleg(page, 'n5-dokumentenschritt')
        await weiter(page)
      } else if (/Vertrag/.test(text) && (await page.locator('canvas').count()) > 0) {
        await unterschreiben(page)
        await weiter(page)
        const geschafft = page.getByText('Geschafft!')
        try {
          await expect(geschafft).toBeVisible({ timeout: 45_000 })
        } catch {
          await page.goto('/gutachter/willkommen', { waitUntil: 'domcontentloaded' })
          await expect(geschafft).toBeVisible({ timeout: 45_000 })
        }
        fertig = true
      } else if (/Ihr Standort/.test(text)) {
        await weiter(page)
      } else {
        await page.waitForTimeout(1_500)
      }
      await page.waitForTimeout(800)
    }

    console.log(`[N4] Telefonbestätigung per UI geklickt: ${telefonPerUi ? 'ja' : 'nein (gesetzt, siehe Warnung oben)'}`)
    expect(fertig, 'die Einrichtung erreicht ihren Abschluss').toBe(true)
    expect(dokumentHochgeladen, 'der Dokumentenschritt war da und nahm einen Upload an').toBe(true)
    await expect(page.getByText('Ihr Profil ist freigeschaltet')).toBeVisible({ timeout: 30_000 })
    await beleg(page, 'n6-freigeschaltet')

    const { data: sv } = await db
      .from('sachverstaendige')
      .select('portal_zugang_freigeschaltet, ist_aktiv, verifiziert, verifiziert_am, vertrag_unterschrieben, basic_onboarding_abgeschlossen_am, isochrone_polygon')
      .eq('id', lauf!.svId)
      .single()
    expect(sv!.portal_zugang_freigeschaltet, 'Portalzugang offen').toBe(true)
    expect(sv!.ist_aktiv, 'aktiv').toBe(true)
    expect(sv!.verifiziert, 'Siegel gesetzt — ohne Admin-Klick').toBe(true)
    expect(sv!.verifiziert_am, 'Zeitpunkt festgehalten').toBeTruthy()
    expect(sv!.vertrag_unterschrieben, 'Partnervertrag unterschrieben').toBe(true)
    expect(sv!.basic_onboarding_abgeschlossen_am, 'Einrichtung abgeschlossen').toBeTruthy()

    const { data: vertrag } = await db
      .from('vertraege_unterzeichnet')
      .select('vorlage_typ, pdf_storage_path')
      .eq('sv_id', lauf!.svId)
      .maybeSingle()
    expect(vertrag?.vorlage_typ, 'Vertragszeile angelegt').toBe('sv_basic_partnervertrag')
    expect(vertrag?.pdf_storage_path, 'Vertrags-PDF abgelegt').toBeTruthy()
  } finally {
    await ctx.close()
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// N7–N9 · Die eigentliche Frage: sichtbar, buchbar — und nichts für den Admin zu tun.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('N7–N9 · Auffindbar, buchbar, und in der Admin-Aufgabenliste liegt nichts', async ({ browser }) => {
  test.setTimeout(5 * 60_000)
  const lauf = laufLesen()
  test.skip(!lauf, 'N1 hat kein Konto hinterlassen')

  const db = serviceClient()

  // N9 zuerst — das ist Aarons Frage. Eine offene Aufgabe wäre der Befund.
  const { data: tasks, error: taskErr } = await db
    .from('tasks')
    .select('id, typ, titel, status')
    .eq('entity_id', lauf!.svId)
    .in('status', ['offen', 'in-bearbeitung'])
  expect(taskErr, 'Aufgabenliste lesbar').toBeNull()
  expect(
    tasks ?? [],
    'keine Admin-Aufgabe: weder „freigeben" noch „Dokument prüfen" — der Admin muss nichts tun',
  ).toEqual([])

  // N8 — buchbar? Derselbe Filter, den die Zuteilung nutzt.
  const { data: dispatchbar } = await db
    .from('sachverstaendige')
    .select('id')
    .eq('id', lauf!.svId)
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .eq('ist_testaccount', false)
    .is('gesperrt_seit', null)
    .is('geloescht_am', null)
  expect(dispatchbar ?? [], 'steht dem Dispatch zur Verfügung').toHaveLength(1)

  // N7a — sieht ihn ein nicht angemeldeter Besucher? Das ist die Kundensicht auf der Karte.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { persistSession: false } },
  )
  const { data: anonRows, error: anonErr } = await anon
    .from('sachverstaendige')
    .select('id')
    .eq('id', lauf!.svId)
  expect(anonErr, 'anon-Leseweg funktioniert').toBeNull()
  expect(anonRows?.length, 'ein nicht angemeldeter Besucher sieht den neuen Gutachter').toBe(1)

  // N7b — und die Suche, über die ein Kunde (oder eine KI) ihn findet.
  //
  // Die Route liefert Tier-1 bewusst OHNE id (Datensparsamkeit: Stadt, Initiale,
  // Spezialisierungen, Entfernung). Der Nachweis läuft deshalb über die Entfernung: Pellworm hat
  // keinen anderen Partner-Gutachter, ein Tier-1-Treffer unter 5 km ist unserer.
  // ⚠ Die Route hält ihr Ergebnis fünf Minuten im Prozess — deshalb pollen, nicht einmal fragen.
  const { ctx, page } = await neuerKontext(browser)
  try {
    // Das Antwortfeld heißt sv_liste. Tier 1 = Partner-Gutachter; Pellworm hat genau einen,
    // und das ist unserer — erkennbar an der Initiale des Vornamens („Smoke").
    // Die Entfernung misst vom PLZ-Mittelpunkt, nicht von seiner Adresse: die echte Anschrift
    // liegt gut fünf Kilometer daneben. Deshalb zehn Kilometer als Schwelle — der nächste
    // Nicht-Partner steht erst bei 19 km.
    const frist = Date.now() + 5 * 60_000
    let gefunden = false
    let letzterStand = ''
    while (Date.now() < frist && !gefunden) {
      const antwort = await page.request.get(`${APP}/api/v1/sv-in-naehe?plz=${ORT.plz}&radius=60`, {
        failOnStatusCode: false,
      })
      const daten = (await antwort.json().catch(() => ({}))) as {
        sv_liste?: Array<{ tier?: number; entfernung_km?: number; stadt?: string; vorname_initiale?: string }>
        anzahl_treffer?: number
      }
      const liste = daten.sv_liste ?? []
      const unserer = liste.filter(
        (s) => s.tier === 1 && (s.entfernung_km ?? 999) <= 10 && /Pellworm/i.test(s.stadt ?? ''),
      )
      letzterStand = `Status ${antwort.status()}, Treffer gesamt ${daten.anzahl_treffer ?? liste.length}, Partner am Ort: ${unserer.length}${
        unserer[0] ? ` (Initiale ${unserer[0].vorname_initiale}, ${unserer[0].entfernung_km} km)` : ''
      }`
      if (unserer.length > 0) gefunden = true
      else await page.waitForTimeout(20_000)
    }
    console.log(`[N7] ${letzterStand}`)
    expect(gefunden, `der frisch angelegte Gutachter ist auffindbar (${letzterStand})`).toBe(true)
  } finally {
    await ctx.close()
  }
})


test.afterAll(async () => {
  // Die Lauf-Datei bleibt liegen, damit das Cleanup-Skript sie findet — Playwright bricht bei
  // einem Timeout den Test-Body ab, ein Aufräumen im finally liefe dann nicht.
  if (existsSync(LAUF_DATEI)) {
    console.log(`[Aufräumen] node --env-file=<abs>/.env.local scripts/smoke/sv-onboarding-ab-registrierung-cleanup.mjs`)
  }
})

