/**
 * scripts/journey/03-button-audit.mjs — Button-Audit pro Portal
 *
 * Aaron-Brief: jeden Knopf ausprobieren — funktioniert er, gibt's ihn schon, soll er anders?
 *
 * Auditiert pro Rolle die zentralen Landingpages und schreibt PASS/SOFT-Findings:
 *   - Admin: /admin (Dashboard), /admin/faelle, /admin/leads (falls vorhanden)
 *   - Dispatch: /dispatch/dashboard, /dispatch/leads
 *   - SV: /gutachter/heute, /gutachter/auftraege, /gutachter/posteingang, /gutachter/profil
 *   - Kunde: /kunde, /kunde/faelle
 *
 * Cap pro Seite: 25 Buttons (verhindert Audit-Endlosschleife auf List-Pages mit 100+ Items).
 * Destruktive Buttons (Löschen, Stornieren, Abmelden) werden übersprungen.
 */

import { record, shoot, loginAs } from './_helpers.mjs'
import { auditPage } from './_button-audit.mjs'

const PHASE = 3
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

const ROUTES = {
  admin: ['/admin', '/admin/faelle'],
  dispatch: ['/dispatch/dashboard', '/dispatch/leads'],
  sv: ['/gutachter/heute', '/gutachter/auftraege', '/gutachter/posteingang', '/gutachter/profil'],
  kunde: ['/kunde', '/kunde/faelle'],
}

export async function runPhase3() {
  console.log('\n━━━ Phase 3: Button-Audit pro Portal ━━━\n')

  for (const [role, paths] of Object.entries(ROUTES)) {
    let page
    try {
      page = await loginAs(role)
    } catch (err) {
      record('SOFT', PHASE, `Login als ${role} fehlgeschlagen: ${err.message}`, `login-${role}`)
      continue
    }

    for (const path of paths) {
      try {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
        await page.waitForTimeout(2_500)

        // 404/Redirect-Check
        const finalPath = new URL(page.url()).pathname
        if (finalPath !== path) {
          record('INFO', PHASE, `Route ${role}:${path} redirected → ${finalPath}`, `redirect-${role}`)
        }

        await shoot(page, `audit-${role}-${path.replace(/\//g, '-')}`)
        await auditPage(page, {
          phase: PHASE,
          label: `${role}${path}`,
          max: 25,
        })
      } catch (err) {
        record('SOFT', PHASE, `Audit ${role}:${path} Fehler: ${err.message.slice(0, 100)}`, `audit-error`)
      }
    }
  }

  return { ok: true }
}
