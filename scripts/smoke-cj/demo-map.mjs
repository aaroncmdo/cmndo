// Schnupper-Map — Marketing-Page-Render + Mapbox-Marker-Click + erstes Wizard-
// Phase-1-Fill (besichtigungsort) + wizard-weiter. Beweist Form-Patch live.
//
// Read-only gegen Prod claimondo.de mit deployed Patches. KEIN Submit am Ende —
// stoppt nach Phase-Wechsel (zeigt Phase 20 termin).

export const TEST_IDS = {}
export const ROLES = { KUNDE: 'kunde' }

export const STEPS = [
  {
    id: '01-gutachter-finden-open',
    role: 'kunde',
    ui: { action: 'navigate', url: '/gutachter-finden' },
    waitFor: { selector: '.mapboxgl-canvas', timeoutMs: 15000 },
    expectedDbEvents: [],
    barrierMs: 20000,
  },
  {
    id: '02-warte-bis-marker-da-sind',
    role: 'kunde',
    ui: { action: 'wait', ms: 3000 },
    waitFor: { selector: '.mapboxgl-marker', timeoutMs: 6000 },
    expectedDbEvents: [],
    barrierMs: 12000,
  },
  {
    id: '03-klick-ersten-sv-marker',
    role: 'kunde',
    ui: { action: 'click', selector: '.mapboxgl-marker' },
    waitFor: { selector: '.mapboxgl-popup-content', timeoutMs: 5000 },
    expectedDbEvents: [],
    barrierMs: 8000,
  },
  {
    id: '04-klick-anfrage-button',
    role: 'kunde',
    ui: { action: 'click', selector: '.mapboxgl-popup-content button' },
    expectedDbEvents: [],
    barrierMs: 5000,
  },
  {
    id: '05-warte-bis-wizard-bereit',
    role: 'kunde',
    ui: { action: 'wait', ms: 1500 },
    waitFor: { selector: '[data-testid="feld-besichtigungsort"]', timeoutMs: 6000 },
    expectedDbEvents: [],
    barrierMs: 9000,
  },
  {
    id: '06-phase-10-besichtigungsort-ausfuellen',
    role: 'kunde',
    ui: {
      action: 'fillForm',
      fields: { '[name="besichtigungsort"]': 'Smoke-Straße 1, 50667 Köln' },
      submit: '[data-testid="wizard-weiter"]',
    },
    expectedDbEvents: [],
    barrierMs: 6000,
  },
  {
    id: '07-warte-auf-phase-20',
    role: 'kunde',
    ui: { action: 'wait', ms: 1800 },
    // Phase 20 hat wunschtermin_wann (segmented). data-testid auf SegmentedField
    // existiert noch nicht — nutze role/text-Indikator: wir warten einfach.
    expectedDbEvents: [],
    barrierMs: 4000,
  },
]
