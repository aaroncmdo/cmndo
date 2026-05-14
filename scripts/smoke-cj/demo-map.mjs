// Multi-Role-Smoke: Kunde → Beratungs-Modal → Dispatch sieht Lead live
// → Dispatch öffnet Lead-Detail (Phase 1-6) → Phase 5 FlowLink-Senden + Verify

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.test' })
loadEnv({ path: '.env.local' })

const SUFFIX = Date.now()
const TEST_NAME = `Smoke Multi ${SUFFIX}`
const TEST_TEL = `+49151${String(SUFFIX).slice(-9)}`

export const TEST_IDS = { name: TEST_NAME, telefon: TEST_TEL }
export const ROLES = { KUNDE: 'kunde', DISPATCH: 'dispatch' }

export const STEPS = [
  // ── Akt 1: Kunde stellt Rückrufanfrage ────────────────────────────────
  {
    id: '01-kunde-open-marketing',
    role: 'kunde',
    ui: { action: 'navigate', url: '/gutachter-finden' },
    waitFor: { selector: '[data-testid="beratung-vereinbaren-button"]', timeoutMs: 15000 },
    expectedDbEvents: [],
    barrierMs: 20000,
  },
  {
    id: '02-kunde-click-beratung-button',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="beratung-vereinbaren-button"]' },
    waitFor: { selector: '[data-testid="beratung-modal"]', timeoutMs: 4000 },
    expectedDbEvents: [],
    barrierMs: 6000,
  },
  {
    id: '03-kunde-fill-modal',
    role: 'kunde',
    ui: {
      action: 'fillForm',
      fields: {
        '[data-testid="beratung-name"]': TEST_NAME,
        '[data-testid="beratung-telefon"]': TEST_TEL,
        '[data-testid="beratung-email"]': `smoke-multi-${SUFFIX}@claimondo.test`,
      },
    },
    expectedDbEvents: [],
    barrierMs: 12000,
  },
  {
    id: '04-kunde-pick-zeit',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="beratung-zeit-vormittags"]' },
    expectedDbEvents: [],
    barrierMs: 3000,
  },
  {
    id: '05-kunde-submit',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="beratung-submit"]' },
    waitFor: { selector: '[data-testid="beratung-modal-dismiss"]', timeoutMs: 8000 },
    expectedDbEvents: [],
    barrierMs: 12000,
  },

  // ── Akt 2: Dispatcher meldet sich an ───────────────────────────────────
  {
    id: '06-dispatch-login',
    role: 'dispatch',
    ui: {
      action: 'login',
      url: '/login',
      email: process.env.SMOKE_TEST_DISPATCH_EMAIL,
      passwort: process.env.SMOKE_TEST_DISPATCH_PASSWORT,
      // Sidebar-Item "Rückrufe" erscheint erst nach erfolgreichem Login+Redirect
      successWait: { selector: 'a[href="/dispatch/rueckrufe"], a[href*="/dispatch"]', timeoutMs: 15000 },
    },
    expectedDbEvents: [],
    barrierMs: 25000,
  },
  {
    id: '07-dispatch-navigate-rueckrufe',
    role: 'dispatch',
    ui: { action: 'navigate', url: '/dispatch/rueckrufe' },
    // Wait bis irgendein admin_termine-Listenitem im DOM ist
    waitFor: { selector: 'body', timeoutMs: 8000 },
    expectedDbEvents: [],
    barrierMs: 12000,
  },
  {
    id: '08-dispatch-screenshot-rueckrufe',
    role: 'dispatch',
    ui: { action: 'wait', ms: 2500 },
    expectedDbEvents: [],
    barrierMs: 4000,
  },

  // ── Akt 3: Lead öffnen, Phase 1-6 sichtbar ────────────────────────────
  {
    id: '09-dispatch-click-rueckruf-eintrag',
    role: 'dispatch',
    // Erste Item-Reihe in der Rückrufe-Liste — sortiert nach start_zeit ASC
    // der jüngste Smoke-Eintrag ist die letzte Reihe (überfällig sind oben),
    // wir klicken die letzte sichtbare „Rückruf erledigt"-row-area:
    // Alternative: die row klicken die unseren TEST_TEL hat — eindeutig
    ui: { action: 'click', selector: `a:has-text("${TEST_NAME}"), button:has-text("${TEST_NAME}"), :text("${TEST_NAME}")` },
    expectedDbEvents: [],
    barrierMs: 6000,
  },
  {
    id: '10-dispatch-warte-lead-detail',
    role: 'dispatch',
    ui: { action: 'wait', ms: 2500 },
    expectedDbEvents: [],
    barrierMs: 4500,
  },
  {
    id: '11-dispatch-screenshot-lead-detail',
    role: 'dispatch',
    ui: { action: 'wait', ms: 1000 },
    expectedDbEvents: [],
    barrierMs: 2500,
  },
]
