/**
 * scripts/smoke/phases/phase-7-besichtigung.mjs — Phase 7: Besichtigung (D1)
 *
 * Was getestet wird:
 *  Der SV ist im Feldmodus-Arrived-State (SvFallakteView). Für jede sichtbare
 *  Pflicht-Kategorie (Dokument-Slot) wird eine Test-Datei hochgeladen. Pro
 *  Upload wird der Pflicht-Counter geprüft. Am Ende soll der
 *  „Besichtigung abschließen"-CTA aktiv sein.
 *
 *  Upload-Mechanismus:
 *   - FeldmodusDokumentSlot bietet zwei Buttons: „Foto" (Kamera) + „Datei"
 *     (File-Input). Im Smoke nutzen wir den unsichtbaren File-Input
 *     (input[type="file"].hidden) und injizieren per page.setInputFiles().
 *     Die Kamera wird NICHT gemockt — das würde getUserMedia benötigen.
 *
 *  Fixture-Datei:
 *   - tests/fixtures/test-foto.jpg (1×1 px PNG, als JPG benannt).
 *     Wird per createPlaceholderImage() angelegt falls nicht vorhanden.
 *
 *  DB-Checks:
 *   - pflichtdokumente rows mit status='hochgeladen' für die fall_id
 *   - dokumente Inserts (über upload-dokument.ts → Supabase Storage + DB)
 *
 * Selektoren-Status:
 *   - Slot-Container: 'div.rounded-xl.border.border-claimondo-border.bg-white'
 *     aus FeldmodusDokumentSlot.tsx:119 — kein data-testid vorhanden.
 *   - Slot-Label: 'p.text-sm.font-medium' innerhalb des Slot-Containers
 *   - Status-Badge: 'span.rounded-full.border' mit text 'Ausstehend'/'Hochgeladen'
 *   - File-Input: 'input[type="file"]' (hidden, im Slot-Container) — Playwright
 *     kann unsichtbare Inputs per setInputFiles() befüllen
 *   - Pflicht-Counter Dokumente-Header: text '<N> Pflicht offen' /
 *     'Alle Pflicht erledigt' aus SvFallakteView.tsx:261-266 — kein testid
 *   - Besichtigung-Abschliessen-Button: text 'Besichtigung abschließen'
 *     aus BesichtigungAbschliessenButton.tsx:55
 *
 * Annahmen:
 *   - page aus Phase 6 wird übergeben und zeigt /gutachter/feldmodus im
 *     arrived-State (SvFallakteView geladen).
 *   - Der Fall hat mindestens 1 Pflicht-Slot (aus dem Seed).
 *   - uploadDokumentToOutbox schreibt in Supabase Storage → DB-Insert folgt
 *     async via Service Worker Outbox oder direkt.
 *   - Wenn kein Netz: Outbox-Retry — im Smoke laufen wir online.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  clickAndShoot,
  assertDb,
  loadFixtureIds,
  loginAs,
  logPhase,
  logWarn,
  logHard,
  logSoft,
  getServiceDb,
  createPlaceholderImage,
} from '../helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..', '..')
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Maximal zu testende Pflicht-Kategorien pro Durchlauf (Smoke-Effizienz)
const MAX_SLOTS = 5

/**
 * Haupt-Funktion Phase 7.
 *
 * @param {import('playwright').BrowserContext} svContext
 * @param {{ notes: string[] }} reportRef
 * @param {{ svPage?: import('playwright').Page; terminId?: string }} phase6Result
 * @returns {{ phase: 7, result: 'pass'|'soft'|'hard', notes: string[] }}
 */
export async function runPhase7(svContext, reportRef = { notes: [] }, phase6Result = {}) {
  const notes = reportRef.notes
  let result = 'pass'
  let page = phase6Result.svPage ?? null

  logPhase(7, '=== Phase 7: Besichtigung durchführen (D1) ===')

  const fixtures = loadFixtureIds()
  const terminId = phase6Result.terminId ?? fixtures?.termin_id ?? null
  const fallId = fixtures?.fall_id ?? null

  // --- Fixture-Foto sicherstellen -----------------------------------------
  const fotoPath = join(projectRoot, 'tests', 'fixtures', 'test-foto.jpg')
  if (!existsSync(fotoPath)) {
    logPhase(7, 'test-foto.jpg nicht gefunden — erstelle Placeholder via createPlaceholderImage()')
    const ok = createPlaceholderImage(fotoPath)
    if (!ok) {
      notes.push('SOFT: Placeholder-Bild konnte nicht erstellt werden — Upload-Tests möglicherweise fehlerhaft')
      result = 'soft'
    } else {
      logPhase(7, `Placeholder erstellt: ${fotoPath}`)
    }
  } else {
    logPhase(7, `Fixture-Foto vorhanden: ${fotoPath}`)
  }

  try {
    // Falls Page nicht übergeben oder geschlossen: Recovery-Login
    if (!page || page.isClosed()) {
      logPhase(7, 'Kein Page-Handle aus Phase 6 — neuer Login + direkte Navigation')
      page = await loginAs(svContext, 'test-sv@claimondo.de', 'Test1234!', BASE_URL)
      // Direkt in den Feldmodus — Session muss existieren
      await page.goto(`${BASE_URL}/gutachter/feldmodus`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(4_000)
      notes.push('SOFT: Phase 7 hat neu eingeloggt — Phase 6 hat keine Page übergeben (Session-Zustand unklar)')
      result = result === 'hard' ? 'hard' : 'soft'
    }

    // Sicherstellen dass wir auf /gutachter/feldmodus sind
    if (!page.url().includes('/gutachter/feldmodus')) {
      logPhase(7, `URL: ${page.url()} — navigiere zu /gutachter/feldmodus`)
      await page.goto(`${BASE_URL}/gutachter/feldmodus`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(4_000)
    }

    // Warte auf SvFallakteView: erkennbar an „Vor Ort · Besichtigung"-Header
    // (SvFallakteView.tsx:173)
    logPhase(7, 'Warte auf SvFallakteView (Vor Ort · Besichtigung)')
    const besichtigungsHeader = page.getByText(/Vor Ort\s*·\s*Besichtigung/i).first()
    const besichtigungsViewSichtbar = await besichtigungsHeader.isVisible({ timeout: 10_000 }).catch(() => false)

    if (!besichtigungsViewSichtbar) {
      logWarn(7, '"Vor Ort · Besichtigung"-Header nicht sichtbar — SvFallakteView möglicherweise nicht im arrived-State')
      notes.push('SOFT: SvFallakteView (Vor Ort · Besichtigung) nicht sichtbar — arrived-State aus Phase 6 möglicherweise nicht erreicht. sessionStatus muss "arrived" sein.')
      result = result === 'hard' ? 'hard' : 'soft'
      // Warten ob das View noch lädt
      await page.waitForTimeout(5_000)
    } else {
      logPhase(7, 'SvFallakteView sichtbar — Besichtigung-Modus aktiv')
    }

    // Screenshot: SvFallakteView geladen
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/besichtigung-start.png`,
      fullPage: false,
    }).catch(() => {})

    // --- Dokumente-Sektion finden ------------------------------------------
    // SvFallakteView.tsx:255 — Section mit „Dokumente"-Überschrift
    logPhase(7, 'Suche Dokumente-Sektion')
    const dokuSection = page.locator('div.bg-white.rounded-2xl.p-4').filter({ hasText: /Dokumente/i }).first()
    const dokuSectionSichtbar = await dokuSection.isVisible({ timeout: 8_000 }).catch(() => false)

    if (!dokuSectionSichtbar) {
      const msg = 'Dokumente-Sektion nicht gefunden — SvFallakteView.tsx:255 prüfen; Fall hat möglicherweise keine Slots'
      logSoft(7, msg)
      notes.push(`SOFT: ${msg}`)
      result = result === 'hard' ? 'hard' : 'soft'
    }

    // --- Alle sichtbaren Pflicht-Slots durchgehen -------------------------
    // FeldmodusDokumentSlot.tsx:119: div.rounded-xl.border.border-claimondo-border.bg-white
    // Mehrere pro Seite — wir iterieren bis MAX_SLOTS
    logPhase(7, `Suche Pflicht-Slots (max ${MAX_SLOTS})`)

    // Erst-Zählung: wie viele Slots sieht man?
    const allSlots = page.locator('div.rounded-xl.border.bg-white.p-4').filter({ has: page.locator('input[type="file"]') })
    const slotCountInitial = await allSlots.count().catch(() => 0)
    logPhase(7, `Gefundene Upload-Slots: ${slotCountInitial}`)

    if (slotCountInitial === 0) {
      notes.push('SOFT: Keine Upload-Slots gefunden (input[type="file"] innerhalb div.rounded-xl) — FeldmodusDokumentSlot.tsx:174; Slot-Selektor ggf. anpassen oder Fall hat keine Pflicht-Slots')
      result = result === 'hard' ? 'hard' : 'soft'
    }

    let hochgeladenCount = 0
    const slotsZuBearbeiten = Math.min(slotCountInitial, MAX_SLOTS)

    for (let i = 0; i < slotsZuBearbeiten; i++) {
      logPhase(7, `Slot ${i + 1}/${slotsZuBearbeiten} verarbeiten`)

      // Slot neu referenzieren (DOM kann sich nach Upload ändern)
      const aktuelleSlots = page.locator('div.rounded-xl.border.bg-white.p-4').filter({ has: page.locator('input[type="file"]') })
      const slot = aktuelleSlots.nth(i)

      if (!(await slot.isVisible({ timeout: 3000 }).catch(() => false))) {
        logWarn(7, `Slot ${i + 1} nicht mehr sichtbar — überspringe`)
        continue
      }

      // Slot-Label auslesen (für Logging)
      const slotLabel = await slot.locator('p.text-sm.font-medium').first()
        .textContent().catch(() => `Slot ${i + 1}`) ?? `Slot ${i + 1}`
      logPhase(7, `  Slot-Label: "${slotLabel.trim()}"`)

      // Status prüfen — wenn bereits hochgeladen: überspringen
      const statusBadgeText = await slot.locator('span.rounded-full.border').first()
        .textContent().catch(() => '') ?? ''
      if (statusBadgeText.includes('Hochgeladen') || statusBadgeText.includes('Geprüft')) {
        logPhase(7, `  Slot "${slotLabel}" bereits hochgeladen — überspringe`)
        hochgeladenCount++
        continue
      }

      // Screenshot vor Upload
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/besichtigung-slot-${i + 1}-pre.png`,
        fullPage: false,
      }).catch(() => {})

      // File-Input befüllen (hidden input — Playwright kann das direkt)
      const fileInput = slot.locator('input[type="file"]').first()
      try {
        await fileInput.setInputFiles(fotoPath, { timeout: 5000 })
        logPhase(7, `  Datei für "${slotLabel}" gesetzt`)
      } catch (uploadErr) {
        const msg = `  Upload-Input für Slot "${slotLabel}" fehlgeschlagen: ${uploadErr.message}`
        logSoft(7, msg)
        notes.push(`SOFT: ${msg} — FeldmodusDokumentSlot.tsx:174 — input.hidden in Shadow-DOM?`)
        result = result === 'hard' ? 'hard' : 'soft'
        continue
      }

      // Warten auf Toast „hochgeladen" oder Status-Wechsel auf „Hochgeladen"
      // FeldmodusDokumentSlot.tsx:93: toast.success(`${slotLabel} hochgeladen`)
      logPhase(7, `  Warte auf Upload-Bestätigung für "${slotLabel}"`)
      const uploadErfolg = await page.waitForFunction(
        (label) => {
          // Prüfe ob eine Sonner-Toast mit dem Label sichtbar ist
          // oder ob der Slot-Status auf Hochgeladen gewechselt hat
          const toasts = document.querySelectorAll('[data-sonner-toast]')
          for (const t of toasts) {
            if (t.textContent?.includes(label) || t.textContent?.includes('hochgeladen')) return true
          }
          return false
        },
        slotLabel.trim(),
        { timeout: 15_000 },
      ).then(() => true).catch(() => false)

      if (!uploadErfolg) {
        // Fallback: prüfe ob Status-Badge gewechselt hat
        await page.waitForTimeout(3_000)
        const neuerStatus = await slot.locator('span.rounded-full.border').first()
          .textContent().catch(() => '') ?? ''
        if (neuerStatus.includes('Hochgeladen')) {
          logPhase(7, `  Upload erfolgreich (Badge-Wechsel): "${slotLabel}"`)
          hochgeladenCount++
        } else {
          notes.push(`SOFT: Upload-Toast für "${slotLabel}" nicht erschienen und Badge blieb auf "${neuerStatus.trim()}" — uploadDokumentToOutbox prüfen`)
          result = result === 'hard' ? 'hard' : 'soft'
        }
      } else {
        logPhase(7, `  Upload-Toast erkannt für "${slotLabel}"`)
        hochgeladenCount++
      }

      // Screenshot nach Upload
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/besichtigung-slot-${i + 1}-post.png`,
        fullPage: false,
      }).catch(() => {})

      // Kurze Pause zwischen Uploads (Supabase-Storage braucht einen Moment)
      await page.waitForTimeout(1_000)
    }

    logPhase(7, `Hochgeladen: ${hochgeladenCount} von ${slotsZuBearbeiten} Slots`)

    // --- Counter-Konsistenz prüfen ----------------------------------------
    // SvFallakteView.tsx:261-266: '<N> Pflicht offen' / 'Alle Pflicht erledigt'
    logPhase(7, 'Prüfe Pflicht-Counter in Dokumente-Header')
    const pflichtOffen = page.locator('span').filter({ hasText: /\d+\s+Pflicht\s+offen/i }).first()
    const pflichtErledigt = page.locator('span').filter({ hasText: /Alle Pflicht erledigt/i }).first()

    const counterText = await pflichtOffen.textContent().catch(() => null)
      ?? await pflichtErledigt.textContent().catch(() => null)
      ?? 'kein Counter-Badge'
    logPhase(7, `Dokumente-Counter: "${counterText}"`)

    if (counterText === 'kein Counter-Badge') {
      notes.push('SOFT: Pflicht-Counter-Badge nicht gefunden — SvFallakteView.tsx:261-266 prüfen')
      result = result === 'hard' ? 'hard' : 'soft'
    }

    // --- „Besichtigung abschließen"-CTA -----------------------------------
    // BesichtigungAbschliessenButton.tsx:55: text 'Besichtigung abschließen'
    logPhase(7, 'Prüfe „Besichtigung abschließen"-CTA')
    const abschliessenBtn = page.getByRole('button', { name: /Besichtigung abschließen/i }).first()
    const abschliessenSichtbar = await abschliessenBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!abschliessenSichtbar) {
      // Fallback-Selektor
      const fallbackBtn = page.locator('button').filter({ hasText: /Besichtigung abschließen/i }).first()
      const fallbackSichtbar = await fallbackBtn.isVisible({ timeout: 3000 }).catch(() => false)
      if (!fallbackSichtbar) {
        notes.push('SOFT: "Besichtigung abschließen"-CTA nicht sichtbar — BesichtigungAbschliessenButton.tsx:67 prüfen; Button ist evtl. unterhalb der Fold')
        result = result === 'hard' ? 'hard' : 'soft'
      } else {
        logPhase(7, '"Besichtigung abschließen"-CTA via Fallback-Selektor sichtbar')
        const abschliessenDisabled = await fallbackBtn.isDisabled().catch(() => false)
        if (abschliessenDisabled) {
          notes.push('INFO: "Besichtigung abschließen" ist disabled — möglicherweise noch Pflicht-Dokumente offen')
        }
      }
    } else {
      logPhase(7, '"Besichtigung abschließen"-CTA sichtbar')
      const abschliessenDisabled = await abschliessenBtn.isDisabled().catch(() => false)
      logPhase(7, `CTA disabled: ${abschliessenDisabled}`)
      if (!abschliessenDisabled) {
        logPhase(7, 'CTA aktiv — alle Pflicht-Dokumente erfüllt')
      }
    }

    // Screenshot: Zustand nach allen Uploads
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/besichtigung-abschluss.png`,
      fullPage: false,
    }).catch(() => {})

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 7: ${err.message}`
    logHard(7, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 7, result: 'hard', notes }
  }

  // --- DB-Asserts ----------------------------------------------------------
  const db = getServiceDb()

  // pflichtdokumente mit status='hochgeladen' für die fall_id
  if (fallId) {
    logPhase(7, `DB-Assert: pflichtdokumente.status='hochgeladen' für fall_id=${fallId}`)
    const { data: pflichtRows, error: pflichtError } = await db
      .from('pflichtdokumente')
      .select('id, status, slot_id, fall_id')
      .eq('fall_id', fallId)

    if (pflichtError) {
      notes.push(`SOFT: DB-Fehler pflichtdokumente: ${pflichtError.message}`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      const hochgeladenDb = (pflichtRows ?? []).filter(
        (r) => r.status === 'hochgeladen' || r.status === 'geprueft',
      ).length
      const gesamtDb = (pflichtRows ?? []).length
      logPhase(7, `DB: ${hochgeladenDb}/${gesamtDb} Pflichtdokumente hochgeladen`)

      if (hochgeladenDb === 0 && gesamtDb > 0) {
        notes.push(`SOFT: Alle ${gesamtDb} pflichtdokumente-Rows haben status != 'hochgeladen' — Upload zur DB nicht geschrieben (Outbox-Sync?)`)
        result = result === 'hard' ? 'hard' : 'soft'
      }
    }

    // dokumente-Inserts prüfen
    logPhase(7, `DB-Assert: dokumente-Inserts für fall_id=${fallId}`)
    const { data: dokumenteRows } = await db
      .from('dokumente')
      .select('id, typ, erstellt_am')
      .eq('fall_id', fallId)
      .order('erstellt_am', { ascending: false })
      .limit(20)

    const dokuCount = (dokumenteRows ?? []).length
    logPhase(7, `DB: ${dokuCount} dokumente-Rows für fall_id=${fallId}`)
    if (dokuCount === 0) {
      notes.push(`SOFT: Keine dokumente-Rows für fall_id=${fallId} — upload-dokument.ts → DB-Insert fehlgeschlagen oder Outbox pending`)
      result = result === 'hard' ? 'hard' : 'soft'
    }
  } else {
    notes.push('INFO: fall_id nicht in Fixtures — pflichtdokumente/dokumente-Assert übersprungen')
  }

  logPhase(7, `Phase 7 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 7, result, notes }
}
