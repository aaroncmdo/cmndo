// 13.05.2026 — Smoke-Test für die 8 wiederhergestellten Fallakte-Cards
// (PRs #867 Kunde-Fallakte + #869 Admin/KB-Fallakte). Macht Screenshots vor
// und nach jedem relevanten Klick, damit visuell verifiziert werden kann
// dass die Cards rendern, die Modals öffnen und der Edit-Flow funktioniert.
//
// Verwendung:
//   node scripts/smoke-fallakte-restore.mjs                  # beide Rollen
//   node scripts/smoke-fallakte-restore.mjs --role=admin     # nur Admin
//   node scripts/smoke-fallakte-restore.mjs --role=kunde     # nur Kunde
//   node scripts/smoke-fallakte-restore.mjs --base=http://localhost:3000
//   node scripts/smoke-fallakte-restore.mjs --admin-fall=<uuid> --kunde-fall=<uuid>
//
// Defaults:
//   Base       = http://localhost:3000
//   Admin-User = test-admin@claimondo.de   / Test1234!
//   Kunde-User = test-kunde@claimondo.de   / Test1234!
//   Admin-Fall = 4ae54c7f-9425-4d3f-b214-26cbdf9f56a7  (gleicher wie smoke-stammdaten)
//   Kunde-Fall = via Auto-Detect (erster Fall auf /kunde nach Login)
//
// Output: tmp/smoke-fallakte-restore/<timestamp>/<rolle>/*.png + summary.json

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const arg = (k, def = undefined) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? def

const BASE_URL = arg('base', process.env.SMOKE_BASE_URL ?? 'https://app.staging.claimondo.de')
const ROLE = arg('role', 'beide') // 'admin' | 'kunde' | 'beide'
// Test-Fixture aus Supabase (lead/claim/fall/termin alle mit aaaa*-IDs, 13.05.2026)
const ADMIN_FALL_ID = arg('admin-fall', 'aaaa3333-0000-4000-8000-000000000003')
const KUNDE_FALL_ID = arg('kunde-fall', 'aaaa3333-0000-4000-8000-000000000003')
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'test-admin@claimondo.de'
const KUNDE_EMAIL = process.env.SMOKE_KUNDE_EMAIL ?? 'test-kunde@claimondo.de'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'Test1234!'
// Staging hat nginx Basic-Auth davor (User aaroncmdo). Per Env-Var setzen.
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASSWORD ?? null

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const ROOT_OUT = join('tmp', 'smoke-fallakte-restore', ts)
const VIEWPORT = { width: 1440, height: 900 }

const allShots = []
async function shoot(page, dir, name, opts = {}) {
  const file = join(dir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false })
  allShots.push({ rolle: opts.rolle, name, file, note: opts.note ?? '' })
  console.log(`    ✓ ${name}.png ${opts.note ? '— ' + opts.note : ''}`)
}

async function login(page, email) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const emailTab = page.locator('button:has-text("E-Mail")').first()
  if (await emailTab.isVisible({ timeout: 1500 }).catch(() => false)) {
    await emailTab.click().catch(() => {})
  }
  await page.locator('input#email, input[name="email"], input[type="email"]').first().fill(email)
  await page.locator('input#password, input[name="password"], input[type="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Anmelden")').first().click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })
}

async function freezeAnimations(page) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-duration:0s !important;transition-duration:0s !important;}`,
  }).catch(() => {})
}

async function scrollTo(page, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(200)
}

async function smokeAdmin(browser) {
  const dir = join(ROOT_OUT, 'admin')
  await mkdir(dir, { recursive: true })
  console.log(`\n=== Admin/KB-Fallakte (PR #869) ===`)
  console.log(`Out: ${dir}`)

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    ...(BASIC_PASS ? { httpCredentials: { username: BASIC_USER, password: BASIC_PASS } } : {}),
  })
  const page = await ctx.newPage()
  try {
    console.log('· Login als', ADMIN_EMAIL)
    await login(page, ADMIN_EMAIL)

    const url = `${BASE_URL}/faelle/${ADMIN_FALL_ID}`
    console.log('· Goto', url)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
    await freezeAnimations(page)
    await page.waitForTimeout(1000)

    // 01 — Full Page vor jeder Interaktion
    await shoot(page, dir, '01-fullpage-initial', {
      fullPage: true,
      note: 'Vor jeder Klick-Interaktion — alle 3 Cards (KanzleiSla / VsKorrespondenz / GutachtenOcr) müssen sichtbar sein',
      rolle: 'admin',
    })

    // 02 — KanzleiSlaStatusCard (Admin/KB; rendert auch wenn keine SLAs aktiv sind)
    const slaCard = page.locator('text=/SLA|Kanzlei.*[Ss]tatus|Anschlussschreiben|Rüge|Mahnung/').first()
    if (await slaCard.count().catch(() => 0)) {
      await scrollTo(page, slaCard)
      await shoot(page, dir, '02-kanzlei-sla-card', {
        note: 'KanzleiSlaStatusCard im Viewport — Text/Mahnungs-Stufen sichtbar',
        rolle: 'admin',
      })
    } else {
      console.log('  – KanzleiSlaStatusCard nicht erkannt')
    }

    // 03 — VsKorrespondenzCard mit „Kontakt erfassen"-Button
    const vsCard = page.locator('text=/VS.?Korrespondenz|Versicherung.*Kontakt/').first()
    if (await vsCard.count().catch(() => 0)) {
      await scrollTo(page, vsCard)
      await shoot(page, dir, '03-vs-korrespondenz-closed', {
        note: 'VsKorrespondenzCard geschlossen — Liste + „Kontakt erfassen"-Button',
        rolle: 'admin',
      })

      // 04 — KLICK auf „Kontakt erfassen" → Modal öffnen
      const erfassenBtn = page.locator('button:has-text("Kontakt erfassen"), button:has-text("erfassen")').first()
      if (await erfassenBtn.count().catch(() => 0)) {
        await erfassenBtn.click().catch(() => {})
        await page.waitForTimeout(500)
        await shoot(page, dir, '04-vs-modal-OPEN', {
          note: 'NACH KLICK „Kontakt erfassen" — leeres Form-Modal',
          rolle: 'admin',
        })

        // 05 — RICHTUNG-Select aendern (eingehend)
        const richtungSelect = page.locator('select').filter({
          has: page.locator('option', { hasText: /Eingehend/ }),
        }).first()
        if (await richtungSelect.count().catch(() => 0)) {
          await richtungSelect.selectOption({ index: 1 }).catch(() => {})
          await page.waitForTimeout(150)
          await shoot(page, dir, '05-vs-modal-RICHTUNG-eingehend', { note: 'Richtung-Select gewechselt', rolle: 'admin' })
        }

        // 06 — KANAL „Email" anklicken
        const emailToggle = page.locator('button:has-text("Email")').first()
        if (await emailToggle.count().catch(() => 0)) {
          await emailToggle.click().catch(() => {})
          await page.waitForTimeout(150)
          await shoot(page, dir, '06-vs-modal-KANAL-email', { note: 'Kanal-Toggle Email aktiviert', rolle: 'admin' })
        }

        // 07 — TEXT-Inputs alle fuellen
        const inputVers = page.locator('input[placeholder*="Allianz"]').first()
        if (await inputVers.count().catch(() => 0)) await inputVers.fill('Allianz Smoke')
        const inputAz = page.locator('input[placeholder*="VS-AZ"]').first()
        if (await inputAz.count().catch(() => 0)) await inputAz.fill('VS-SMK-' + ts.slice(0,10))
        const inputBetreff = page.locator('input[placeholder*="worum"]').first()
        if (await inputBetreff.count().catch(() => 0)) await inputBetreff.fill('Smoke-Erfassung via Playwright')
        const textareaNotiz = page.locator('textarea').first()
        if (await textareaNotiz.count().catch(() => 0)) await textareaNotiz.fill('Auto-Test ' + ts)
        await page.waitForTimeout(200)
        await shoot(page, dir, '07-vs-modal-ALL-FIELDS-FILLED', { note: '4 Form-Felder befuellt', rolle: 'admin' })

        // 08 — SUBMIT (Eintragen-Button)
        const submitBtn = page.locator('button:has-text("Eintragen")').first()
        if (await submitBtn.count().catch(() => 0)) {
          await submitBtn.click().catch(() => {})
          await page.waitForTimeout(1800)
          await shoot(page, dir, '08-vs-modal-AFTER-SUBMIT', { note: 'Nach Eintragen — Server-Action lief, Liste hat neuen Eintrag', rolle: 'admin' })
        }
      } else {
        console.log('  – „Kontakt erfassen"-Button nicht gefunden')
      }
    } else {
      console.log('  – VsKorrespondenzCard nicht erkannt')
    }

    // 06 — GutachtenOcrCard (admin-only)
    const ocrCard = page.locator('text=/Gutachten.?OCR|OCR.?Auswertung|Reparaturkosten/').first()
    if (await ocrCard.count().catch(() => 0)) {
      await scrollTo(page, ocrCard)
      await shoot(page, dir, '06-gutachten-ocr-closed', {
        note: 'GutachtenOcrCard read-mode — 30 OCR-Felder sichtbar (oder Empty-State falls noch keine OCR-Daten)',
        rolle: 'admin',
      })

      // 11 — KLICK auf „Bearbeiten" → Edit-Mode
      const editBtn = page.locator('button:has-text("Bearbeiten")').first()
      if (await editBtn.count().catch(() => 0)) {
        await editBtn.click().catch(() => {})
        await page.waitForTimeout(400)
        await shoot(page, dir, '11-ocr-edit-MODE', { note: 'Felder zu inputs', rolle: 'admin' })

        // 12 — Minderwert-Input aendern (450 → 600)
        const numInputs = page.locator('input[type="number"]')
        const n = await numInputs.count().catch(() => 0)
        if (n >= 3) {
          await numInputs.nth(2).fill('600') // grobe Heuristik: 3. Numeric ist Minderwert
          await page.waitForTimeout(150)
          await shoot(page, dir, '12-ocr-edit-FIELD-CHANGED', { note: 'Minderwert geaendert (450→600)', rolle: 'admin' })

          // 13 — SAVE
          const saveBtn = page.locator('button:has-text("Speichern")').first()
          if (await saveBtn.count().catch(() => 0)) {
            await saveBtn.click().catch(() => {})
            await page.waitForTimeout(1800)
            await shoot(page, dir, '13-ocr-edit-AFTER-SAVE', { note: 'Server-Action updateGutachtenOcrFelder lief', rolle: 'admin' })
          }
        }
      } else {
        console.log('  – „Bearbeiten"-Button auf GutachtenOcrCard nicht gefunden')
      }
    } else {
      console.log('  – GutachtenOcrCard nicht erkannt (admin-only — User korrekt admin?)')
    }

    // 99 — Final full page
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await shoot(page, dir, '99-fullpage-final', {
      fullPage: true,
      note: 'Nach allen Interaktionen — Page-State sauber, keine Modals/Stale-Inputs',
      rolle: 'admin',
    })
  } catch (err) {
    console.error('  ✗ Admin-Smoke-Fehler:', err.message)
    try { await page.screenshot({ path: join(dir, 'ERROR.png'), fullPage: true }) } catch {}
    throw err
  } finally {
    await ctx.close()
  }
}

async function smokeKunde(browser) {
  const dir = join(ROOT_OUT, 'kunde')
  await mkdir(dir, { recursive: true })
  console.log(`\n=== Kunde-Fallakte (PR #867) ===`)
  console.log(`Out: ${dir}`)

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    ...(BASIC_PASS ? { httpCredentials: { username: BASIC_USER, password: BASIC_PASS } } : {}),
  })
  const page = await ctx.newPage()
  try {
    console.log('· Login als', KUNDE_EMAIL)
    await login(page, KUNDE_EMAIL)

    // Auto-Detect Kunde-Fall-ID falls nicht vorgegeben
    let kundeFallId = KUNDE_FALL_ID
    if (!kundeFallId) {
      await page.goto(`${BASE_URL}/kunde`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(800)
      const m = page.url().match(/\/kunde\/faelle\/([0-9a-f-]{36})/)
      if (m) {
        kundeFallId = m[1]
        console.log(`  → Auto-detected fall: ${kundeFallId}`)
      } else {
        // Liste-Page → ersten Link anklicken
        const firstFallLink = page.locator('a[href*="/kunde/faelle/"]').first()
        if (await firstFallLink.count().catch(() => 0)) {
          const href = await firstFallLink.getAttribute('href')
          kundeFallId = href?.split('/').pop() ?? null
          console.log(`  → Auto-detected fall via Link: ${kundeFallId}`)
        }
      }
    }
    if (!kundeFallId) {
      throw new Error('Kein Kunde-Fall gefunden — --kunde-fall=<uuid> übergeben oder Test-Kunde mit Fall anlegen.')
    }

    const url = `${BASE_URL}/kunde/faelle/${kundeFallId}`
    console.log('· Goto', url)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
    await freezeAnimations(page)
    await page.waitForTimeout(1000)

    // 01 — Full Page vor jeder Interaktion
    await shoot(page, dir, '01-fullpage-initial', {
      fullPage: true,
      note: 'Vor jeder Interaktion — 5 Cards sichtbar (Abschluss / BetreuerStrip / GoogleReview / KanzleiPfad / Ausfall), je nach Fall-State',
      rolle: 'kunde',
    })

    // 02 — KundeAbschlussCard (gates intern auf abgeschlossen_am — bei laufendem Fall nicht sichtbar)
    const abschlussCard = page.locator('text=/Erledigt|Abschluss.*Aktion|PDF.*Gutachten|Reklamation/').first()
    if (await abschlussCard.count().catch(() => 0)) {
      await scrollTo(page, abschlussCard)
      await shoot(page, dir, '02-abschluss-card', {
        note: 'KundeAbschlussCard sichtbar (Fall ist abgeschlossen) — 3 CTAs',
        rolle: 'kunde',
      })
    } else {
      console.log('  – KundeAbschlussCard nicht sichtbar (Fall vermutlich nicht abgeschlossen)')
    }

    // 03 — KundeBetreuerStrip
    const strip = page.locator('text=/Ihr Kundenbetreuer|Ihr Sachverständiger/').first()
    if (await strip.count().catch(() => 0)) {
      await scrollTo(page, strip)
      await shoot(page, dir, '03-betreuer-strip', {
        note: 'KundeBetreuerStrip — KB + SV mit Avatar + Chat-Button. Mojibake-Check: ä/ö/ü müssen echte UTF-8 sein',
        rolle: 'kunde',
      })

      // 04 — KLICK auf Chat-Button (öffnet #chat-Anchor in der Page)
      const chatBtn = page.locator('a[href*="#chat"]').first()
      if (await chatBtn.count().catch(() => 0)) {
        await chatBtn.click().catch(() => {})
        await page.waitForTimeout(500)
        await shoot(page, dir, '04-chat-anchor', {
          note: 'NACH KLICK Chat-Button — Page scrollt zum Chat-Tab',
          rolle: 'kunde',
        })
      }
    } else {
      console.log('  – KundeBetreuerStrip nicht erkannt')
    }

    // 05 — Zurück nach oben, MeineKanzleiCard sichten (jetzt mit email/telefon/uebergebenAm)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    const kanzleiCard = page.locator('text=/Meine Kanzlei|Ihre Kanzlei/').first()
    if (await kanzleiCard.count().catch(() => 0)) {
      await scrollTo(page, kanzleiCard)
      await shoot(page, dir, '05-meine-kanzlei-card', {
        note: 'MeineKanzleiCard mit email/telefon/uebergebenAm (vorher hartcodiert null)',
        rolle: 'kunde',
      })
    }

    // 06 — KanzleiPfadCard (gates auf claim.kanzlei_wunsch — Frage/eigene/selbst)
    const pfadCard = page.locator('text=/Kanzlei.*Pfad|Wer.*kümmert.*Versicherung|Eigene Kanzlei|Selbst einreichen/').first()
    if (await pfadCard.count().catch(() => 0)) {
      await scrollTo(page, pfadCard)
      await shoot(page, dir, '06-kanzlei-pfad-card', {
        note: 'KanzleiPfadCard sichtbar — Frage/Optionen je nach kanzlei_wunsch',
        rolle: 'kunde',
      })
    } else {
      console.log('  – KanzleiPfadCard nicht sichtbar (kanzlei_wunsch=partnerkanzlei → Card rendert null)')
    }

    // 07 — KundeAusfallEntschaedigungCard (gates auf gutachten_ocr_processed_at)
    const ausfallCard = page.locator('text=/Mietwagen|Nutzungsausfall|Ausfallentschädigung/').first()
    if (await ausfallCard.count().catch(() => 0)) {
      await scrollTo(page, ausfallCard)
      await shoot(page, dir, '07-ausfall-card', {
        note: 'KundeAusfallEntschaedigungCard sichtbar — OCR verarbeitet, Schadenstyp klar',
        rolle: 'kunde',
      })
    } else {
      console.log('  – KundeAusfallEntschaedigungCard nicht sichtbar (ocrVerarbeitet=false oder unklarer Schadenstyp)')
    }

    // 99 — Final full page
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await shoot(page, dir, '99-fullpage-final', {
      fullPage: true,
      note: 'Final state nach allen Interaktionen',
      rolle: 'kunde',
    })
  } catch (err) {
    console.error('  ✗ Kunde-Smoke-Fehler:', err.message)
    try { await page.screenshot({ path: join(dir, 'ERROR.png'), fullPage: true }) } catch {}
    throw err
  } finally {
    await ctx.close()
  }
}

async function main() {
  await mkdir(ROOT_OUT, { recursive: true })
  console.log(`Base : ${BASE_URL}`)
  console.log(`Out  : ${ROOT_OUT}`)
  console.log(`Role : ${ROLE}`)

  const browser = await chromium.launch({ headless: true })
  try {
    if (ROLE === 'admin' || ROLE === 'beide') await smokeAdmin(browser)
    if (ROLE === 'kunde' || ROLE === 'beide') await smokeKunde(browser)

    await writeFile(join(ROOT_OUT, 'summary.json'), JSON.stringify({
      base: BASE_URL,
      role: ROLE,
      adminFallId: ADMIN_FALL_ID,
      kundeFallId: KUNDE_FALL_ID,
      viewport: VIEWPORT,
      timestamp: ts,
      shots: allShots,
    }, null, 2))
    console.log(`\n✓ Fertig — ${allShots.length} Screenshots in ${ROOT_OUT}`)
  } catch (err) {
    console.error('\n✗ Smoke-Test fehlgeschlagen:', err.message)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
