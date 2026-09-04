// Regel-4-Prod-Smoke — ZB1-Batch-Fahrzeuganlage (PR #4408), app.claimondo.de
//
// Flows (aus dem PR-Body):
//   1. Flottenmanager /flotte/flotte -> "Mehrere Fahrzeuge per ZB1 scannen" -> Scan -> Review
//      (Felder manuell setzen; OCR-Trefferquote ist NICHT Smoke-Scope) -> "Alle anlegen" ->
//      Ergebnis "Angelegt" -> DB: vehicles.fahrzeugklasse + flotten_fahrzeuge-Bind.
//   3. Duplikat: gleiche FIN erneut -> Ergebnis "Aktualisiert" (testet live den Review-Fix:
//      bind laeuft IMMER, 23505 -> bereitsVorhanden; kein stiller Skip) + Bind-Count bleibt 1.
//   2. Admin /admin/vertrieb/firmen-flotte/[id] -> "Mehrere per ZB1 scannen" -> zweite FIN ->
//      "Angelegt" -> DB-Asserts.
//   4. Teilfehler: auf live nicht deterministisch provozierbar (Lib robust; OCR-Fehlbild
//      erzeugt ok:false schon beim SCAN, nicht beim Anlegen) -> durch 2 non-atomar-Unit-Tests
//      abgedeckt (zb1-batch-anlage.test.ts). Im Marker dokumentiert.
//
// ISOLATION: Test-Firma "Test-Flotte GmbH (Smoke)" (dafc57ee), Konten flotte.test@ +
// test-admin@ (telefon=NULL, 0 Faktoren). Der Anlage-Pfad schreibt NUR vehicles +
// flotten_fahrzeuge -- keine Comms, kein Versicherer, kein Cron. Marker-FINs WSMKE0000009xx
// (FIN_REGEX-konform, kein I/O/Q) -> --clean findet sie 100% wieder.
//
// Nutzung (aus dem Worktree-Root):
//   node scripts/smoke/zb1-batch-smoke.mjs            # voller Smoke (3 Flows + DB-Asserts)
//   node scripts/smoke/zb1-batch-smoke.mjs --clean    # nur aufraeumen (Binds + vehicles der Marker-FINs)
//   HEADED=1 ... # sichtbarer Browser zum Debuggen

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

// ── env (READ-only aus dem Haupt-Repo; Worktree hat kein .env.local) ─────────
const ENV_CANDIDATES = [
  process.env.CLAIMONDO_ENV_FILE,
  new URL('../../.env.local', import.meta.url), // Repo-Root (Haupt-Checkout)
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local', // Worktree-Fallback (kein eigenes .env.local)
].filter(Boolean)
let envRaw = null
for (const p of ENV_CANDIDATES) {
  try { envRaw = readFileSync(p, 'utf8'); break } catch { /* next */ }
}
if (!envRaw) throw new Error('.env.local nicht gefunden (CLAIMONDO_ENV_FILE setzen)')
const env = {}
for (const line of envRaw.split('\n')) {
  const l = line.replace(/\r$/, '')
  if (!l.includes('=') || l.trimStart().startsWith('#')) continue
  const i = l.indexOf('=')
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Konstanten ────────────────────────────────────────────────────────────────
const BASE = 'https://app.claimondo.de'
const FIRMA_ID = 'dafc57ee-0d27-4d7e-8e1a-4a11edd6f713' // Test-Flotte GmbH (Smoke)
const FLOTTE_LOGIN = { email: 'flotte.test@claimondo.de', pw: (process.env.TEST_PASSWORT ?? '') }
const ADMIN_LOGIN = { email: 'test-admin@claimondo.de', pw: (process.env.TEST_PASSWORT ?? '') }
const FIN1 = 'WSMKE000000000901' // Flow 1 + 3 (17 Zeichen, kein I/O/Q)
const FIN2 = 'WSMKE000000000902' // Flow 2 (Admin)
const KZ1 = 'B-ZB 901'
const KZ2 = 'B-ZB 902'
const CLEAN = process.argv.includes('--clean')
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '.zb1-smoke-shots')
mkdirSync(SHOTS, { recursive: true })

const log = (...a) => console.log(...a)
const fail = (msg) => { console.error('\n❌ SMOKE ROT:', msg); process.exit(1) }
const ok = (msg) => log('  ✓', msg)

// ── Cleanup (Marker-FINs) ─────────────────────────────────────────────────────
async function cleanup() {
  const { data: vehs, error } = await db.from('vehicles').select('id, fin').in('fin', [FIN1, FIN2])
  if (error) throw new Error('cleanup vehicles select: ' + error.message)
  for (const v of vehs ?? []) {
    const { error: e1 } = await db.from('flotten_fahrzeuge').delete().eq('vehicle_id', v.id)
    if (e1) throw new Error('cleanup bind delete: ' + e1.message)
    const { error: e2 } = await db.from('vehicles').delete().eq('id', v.id)
    if (e2) throw new Error('cleanup vehicle delete: ' + e2.message)
    log('  geloescht:', v.fin, v.id)
  }
  log(`Cleanup fertig (${vehs?.length ?? 0} Fahrzeuge).`)
}
if (CLEAN) { await cleanup(); process.exit(0) }

// ── Testbild: ZB1-artiger gedruckter Text (Vision braucht nur IRGENDEINEN Text;
//    die Felder setzen wir deterministisch im Review — OCR-Treffer sind kein Scope). ──
async function makeTestImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620">
    <rect width="900" height="620" fill="#f4f1e8"/>
    <text x="40" y="60" font-family="Arial" font-size="28" fill="#1a3a1a">ZULASSUNGSBESCHEINIGUNG TEIL 1</text>
    <text x="40" y="110" font-family="Arial" font-size="20" fill="#222">SMOKE-TEST CLAIMONDO ZB1-BATCH</text>
    <text x="40" y="170" font-family="Arial" font-size="22" fill="#222">A: B-SM 9999</text>
    <text x="40" y="210" font-family="Arial" font-size="22" fill="#222">Pruefziffern-Zeile ohne echte Fahrzeugdaten</text>
    <text x="40" y="250" font-family="Arial" font-size="22" fill="#222">Dieses Bild existiert nur fuer den Prod-Smoke.</text>
  </svg>`
  const file = path.join(SHOTS, 'zb1-testbild.jpg')
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(file)
  return file
}

// ── UI-Helfer ────────────────────────────────────────────────────────────────
async function login(page, { email, pw }) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pw)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 })
}

/** Drawer-Scope: die Seite HINTER dem Drawer (FlotteClient "Fahrzeug hinzufuegen") hat
 *  identische Placeholder -> ungescoped ist getByPlaceholder eine strict-mode-Kollision. */
const drawerOf = (page) => page.locator('[aria-label="Fahrzeuge per ZB1 scannen"]')

/** Scan-Phase: Bild hochladen (Galerie-Input = file-input OHNE capture) und warten,
 *  bis die Zeile in "Gescannte Karten (n)" auftaucht (OCR-Roundtrip 2-8s). */
async function uploadBild(page, imgFile, erwarteteAnzahl) {
  const drawer = drawerOf(page)
  await drawer.locator('input[type="file"]:not([capture])').setInputFiles(imgFile)
  await drawer.getByText(`Gescannte Karten (${erwarteteAnzahl})`).waitFor({ timeout: 45000 })
}

/** Review-Felder deterministisch setzen (Placeholder sind stabil aus Zb1BatchScanner.tsx). */
async function fuelleReview(page, { kz, fin, hersteller, modell, klasse }) {
  const drawer = drawerOf(page)
  await drawer.getByPlaceholder('z. B. K-AB 123').fill(kz)
  await drawer.getByPlaceholder('17-stellig').fill(fin)
  await drawer.getByPlaceholder('z. B. VW').fill(hersteller)
  await drawer.getByPlaceholder('z. B. Golf').fill(modell)
  await drawer.getByPlaceholder('z. B. M1').fill(klasse)
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false })
}

// ── DB-Asserts ────────────────────────────────────────────────────────────────
async function assertVehicle(fin, klasse) {
  const { data: v, error } = await db.from('vehicles').select('id, fahrzeugklasse').eq('fin', fin).maybeSingle()
  if (error) fail('DB vehicles select: ' + error.message)
  if (!v) fail(`vehicles-Row fuer ${fin} fehlt`)
  if (v.fahrzeugklasse !== klasse) fail(`fahrzeugklasse ${fin}: erwartet ${klasse}, ist ${v.fahrzeugklasse}`)
  const { data: binds, error: e2 } = await db.from('flotten_fahrzeuge').select('id').eq('firma_id', FIRMA_ID).eq('vehicle_id', v.id)
  if (e2) fail('DB bind select: ' + e2.message)
  if ((binds?.length ?? 0) !== 1) fail(`Bind-Count ${fin}: erwartet 1, ist ${binds?.length}`)
  return v.id
}

// ── Lauf ─────────────────────────────────────────────────────────────────────
log('ZB1-Batch Prod-Smoke gegen', BASE)
log('Vorab-Cleanup (Reste frueherer Laeufe) ...')
await cleanup()
const img = await makeTestImage()
ok('Testbild generiert: ' + img)

const browser = await chromium.launch({ headless: !process.env.HEADED })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()

try {
  // ══ FLOW 1: Flottenmanager — Scan -> Review -> Anlegen ══
  log('\n[Flow 1] Flottenmanager-Anlage')
  await login(page, FLOTTE_LOGIN)
  ok('Login flotte.test')
  await page.goto(`${BASE}/flotte/flotte`, { waitUntil: 'domcontentloaded' })
  const zb1Btn = page.getByRole('button', { name: 'Mehrere Fahrzeuge per ZB1 scannen' })
  await zb1Btn.waitFor({ timeout: 20000 })
  ok('Einstiegs-Button sichtbar (/flotte/flotte)')
  await zb1Btn.click()
  await drawerOf(page).getByText('Schritt 1 von 3').waitFor({ timeout: 10000 })
  await shot(page, '01-drawer-scannen.png')
  await uploadBild(page, img, 1)
  ok('Scan ok — Zeile in Liste (OCR-Roundtrip)')
  await shot(page, '02-zeile-gescannt.png')
  await drawerOf(page).getByRole('button', { name: /Zum Review \(1\)/ }).click()
  await drawerOf(page).getByText('Schritt 2 von 3').waitFor({ timeout: 10000 })
  await fuelleReview(page, { kz: KZ1, fin: FIN1, hersteller: 'Smoke', modell: 'ZB1-Test', klasse: 'M1' })
  await shot(page, '03-review-gefuellt.png')
  await drawerOf(page).getByRole('button', { name: 'Alle anlegen' }).click()
  await drawerOf(page).getByText('Schritt 3 von 3').waitFor({ timeout: 30000 })
  await drawerOf(page).getByText('1 angelegt').waitFor({ timeout: 5000 })
  ok('Ergebnis: "1 angelegt"')
  await shot(page, '04-ergebnis-angelegt.png')
  await drawerOf(page).getByRole('button', { name: 'Fertig' }).click()
  await page.getByText(KZ1).first().waitFor({ timeout: 20000 })
  ok(`Flotten-Liste zeigt ${KZ1}`)
  const veh1 = await assertVehicle(FIN1, 'M1')
  ok(`DB: vehicles(${FIN1}).fahrzeugklasse=M1 + genau 1 Bind (vehicle ${veh1})`)

  // ══ FLOW 3: Duplikat — gleiche FIN -> "Aktualisiert" (Live-Test des Review-Fixes) ══
  log('\n[Flow 3] Duplikat -> aktualisiert (bind->23505-Pfad)')
  await page.getByRole('button', { name: 'Mehrere Fahrzeuge per ZB1 scannen' }).click()
  await drawerOf(page).getByText('Schritt 1 von 3').waitFor({ timeout: 10000 })
  await uploadBild(page, img, 1)
  await drawerOf(page).getByRole('button', { name: /Zum Review \(1\)/ }).click()
  await drawerOf(page).getByText('Schritt 2 von 3').waitFor({ timeout: 10000 })
  await fuelleReview(page, { kz: KZ1, fin: FIN1, hersteller: 'Smoke', modell: 'ZB1-Test', klasse: 'M1' })
  await drawerOf(page).getByRole('button', { name: 'Alle anlegen' }).click()
  await drawerOf(page).getByText('Schritt 3 von 3').waitFor({ timeout: 30000 })
  await drawerOf(page).getByText('1 aktualisiert').waitFor({ timeout: 5000 })
  ok('Ergebnis: "1 aktualisiert" (kein Doppel-Bind, kein stiller Skip)')
  await shot(page, '05-ergebnis-aktualisiert.png')
  await drawerOf(page).getByRole('button', { name: 'Fertig' }).click()
  await assertVehicle(FIN1, 'M1') // Bind-Count muss 1 BLEIBEN
  ok('DB: Bind-Count unveraendert 1')

  // ══ FLOW 2: Admin — staff-Einstieg an der Firmen-Flotte-Akte ══
  log('\n[Flow 2] Admin-Anlage (staff)')
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const admin = await ctx2.newPage()
  await login(admin, ADMIN_LOGIN)
  ok('Login test-admin')
  await admin.goto(`${BASE}/admin/vertrieb/firmen-flotte/${FIRMA_ID}`, { waitUntil: 'domcontentloaded' })
  const adminBtn = admin.getByRole('button', { name: 'Mehrere per ZB1 scannen' })
  await adminBtn.waitFor({ timeout: 20000 })
  ok('Admin-Einstiegs-Button sichtbar')
  await adminBtn.click()
  await drawerOf(admin).getByText('Schritt 1 von 3').waitFor({ timeout: 10000 })
  await uploadBild(admin, img, 1)
  await drawerOf(admin).getByRole('button', { name: /Zum Review \(1\)/ }).click()
  await drawerOf(admin).getByText('Schritt 2 von 3').waitFor({ timeout: 10000 })
  await fuelleReview(admin, { kz: KZ2, fin: FIN2, hersteller: 'Smoke', modell: 'ZB1-Admin', klasse: 'N1' })
  await drawerOf(admin).getByRole('button', { name: 'Alle anlegen' }).click()
  await drawerOf(admin).getByText('Schritt 3 von 3').waitFor({ timeout: 30000 })
  await drawerOf(admin).getByText('1 angelegt').waitFor({ timeout: 5000 })
  ok('Ergebnis: "1 angelegt"')
  await shot(admin, '06-admin-angelegt.png')
  // DIREKTER Fertig-Klick = Regressionsbeweis fuer PR #4434 (Chat-Band 940-955 unter Drawer-1000).
  // Vor dem Fix fing der Posteingang-FAB (z-9990) diesen Klick ab (57 Retries, ESC-Workaround).
  await drawerOf(admin).getByRole('button', { name: 'Fertig' }).click()
  ok('Fertig DIREKT klickbar (FAB faengt nicht mehr ab — PR #4434 wirksam)')
  await admin.getByText(KZ2).first().waitFor({ timeout: 20000 })
  ok(`Fahrzeug-Tabelle zeigt ${KZ2}`)
  const veh2 = await assertVehicle(FIN2, 'N1')
  ok(`DB: vehicles(${FIN2}).fahrzeugklasse=N1 + genau 1 Bind (vehicle ${veh2})`)
  // FAB-Funktionscheck (PR #4434): auf z-950 muss der Posteingang weiter oeffnen (kein Drawer offen).
  const fab = admin.getByRole('button', { name: 'Posteingang öffnen' })
  await fab.waitFor({ timeout: 10000 })
  await fab.click()
  await admin.locator('[aria-label="Posteingang öffnen"][aria-expanded="true"]').waitFor({ timeout: 10000 })
  ok('FAB funktioniert weiter (Posteingang oeffnet, aria-expanded=true)')
  await ctx2.close()

  log('\n✅ SMOKE GRUEN — alle 3 Live-Flows + DB-Asserts bestanden.')
  log('   (Flow 4 Teilfehler: nicht live provozierbar, unit-getestet — s. Header.)')
  log('   Aufraeumen mit: node scripts/smoke/zb1-batch-smoke.mjs --clean')
} catch (err) {
  await shot(page, '99-FEHLER.png').catch(() => {})
  fail(err instanceof Error ? err.message : String(err))
} finally {
  await browser.close()
}
