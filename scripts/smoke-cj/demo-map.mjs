// Vollständiger /gutachter-finden-Wizard end-to-end: Phase 10 → 30, jede Phase
// mit allen Pflichtfeldern + wizard-weiter. Letzter Step ist `Termin buchen`.
// Schreibt Lead in gutachter_finder_anfragen — wird im Anschluss in der DB
// verifiziert.

const EMAIL = `cj-smoke-${Date.now()}@claimondo.test`

export const TEST_IDS = { email: EMAIL }
export const ROLES = { KUNDE: 'kunde' }

export const STEPS = [
  // ── Phase 10: Standort ────────────────────────────────────────────────
  {
    id: '01-open-wizard',
    role: 'kunde',
    ui: { action: 'navigate', url: '/gutachter-finden' },
    waitFor: { selector: '[data-testid="feld-besichtigungsort"]', timeoutMs: 15000 },
    expectedDbEvents: [],
    barrierMs: 18000,
  },
  {
    id: '02-phase-10-fill-and-next',
    role: 'kunde',
    ui: {
      action: 'fillForm',
      fields: { '[name="besichtigungsort"]': 'Smoke-Straße 1, 50667 Köln' },
      submit: '[data-testid="wizard-weiter"]',
    },
    expectedDbEvents: [],
    barrierMs: 8000,
  },

  // ── Phase 20: Termin ──────────────────────────────────────────────────
  {
    id: '03-phase-20-wait',
    role: 'kunde',
    ui: { action: 'wait', ms: 1500 },
    waitFor: { selector: '[data-testid="feld-wunschtermin_wann-opt-tage"]', timeoutMs: 8000 },
    expectedDbEvents: [],
    barrierMs: 10000,
  },
  {
    id: '04-phase-20-wann-tage',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="feld-wunschtermin_wann-opt-tage"]' },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
  {
    id: '05-phase-20-pick-day',
    role: 'kunde',
    // Erster freier Tag
    ui: { action: 'click', selector: '[data-testid^="feld-wunschtermin-tag-"][data-frei="true"]' },
    expectedDbEvents: [],
    barrierMs: 5000,
  },
  {
    id: '06-phase-20-pick-slot',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid^="feld-wunschtermin-slot-"]' },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
  {
    id: '07-phase-20-next',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="wizard-weiter"]' },
    expectedDbEvents: [],
    barrierMs: 6000,
  },

  // ── Phase 25: Service ─────────────────────────────────────────────────
  {
    id: '08-phase-25-wait',
    role: 'kunde',
    ui: { action: 'wait', ms: 1200 },
    waitFor: { selector: '[data-testid^="feld-service_typ-opt-"]', timeoutMs: 6000 },
    expectedDbEvents: [],
    barrierMs: 8000,
  },
  {
    id: '09-phase-25-pick-service',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="feld-service_typ-opt-vollstaendig"]' },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
  {
    id: '10-phase-25-next',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="wizard-weiter"]' },
    expectedDbEvents: [],
    barrierMs: 6000,
  },

  // ── Phase 27: Kanzlei ─────────────────────────────────────────────────
  {
    id: '11-phase-27-wait',
    role: 'kunde',
    ui: { action: 'wait', ms: 1200 },
    waitFor: { selector: '[data-testid^="feld-kanzlei_wunsch-opt-"]', timeoutMs: 6000 },
    expectedDbEvents: [],
    barrierMs: 8000,
  },
  {
    id: '12-phase-27-pick-kanzlei',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="feld-kanzlei_wunsch-opt-partnerkanzlei"]' },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
  {
    id: '13-phase-27-next',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="wizard-weiter"]' },
    expectedDbEvents: [],
    barrierMs: 6000,
  },

  // ── Phase 30: Kontakt + DSGVO + Unterschrift ─────────────────────────
  {
    id: '14-phase-30-wait',
    role: 'kunde',
    ui: { action: 'wait', ms: 1500 },
    waitFor: { selector: '[data-testid="feld-vorname"]', timeoutMs: 6000 },
    expectedDbEvents: [],
    barrierMs: 8000,
  },
  {
    id: '15-phase-30-fill-kontakt',
    role: 'kunde',
    ui: {
      action: 'fillForm',
      fields: {
        '[name="vorname"]': 'Smoke',
        '[name="nachname"]': 'Test',
        '[name="telefon"]': '+4915112345678',
        '[name="email"]': EMAIL,
      },
    },
    expectedDbEvents: [],
    barrierMs: 6000,
  },
  {
    id: '16-phase-30-pick-kanal',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="feld-bevorzugter_kanal-opt-email"]' },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
  {
    id: '17-phase-30-tick-dsgvo',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="feld-dsgvo_zustimmung"]' },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
  {
    id: '18-phase-30-sign',
    role: 'kunde',
    ui: { action: 'signCanvas', selector: '[data-testid="feld-unterschrift"]' },
    expectedDbEvents: [],
    barrierMs: 5000,
  },
  {
    id: '19-phase-30-submit',
    role: 'kunde',
    ui: { action: 'click', selector: '[data-testid="wizard-weiter"]' },
    expectedDbEvents: [],
    barrierMs: 10000,
  },
  {
    id: '20-final-wait',
    role: 'kunde',
    ui: { action: 'wait', ms: 2500 },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
]
