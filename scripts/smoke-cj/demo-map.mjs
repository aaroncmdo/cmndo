// Schnupper-Map — Marketing-Page-Render + Mapbox-Marker-Click-Demo.
// Read-only gegen Prod claimondo.de, KEIN DB-Schreib-Effekt, kein Login.
// Beweist Framework + Live-HUD + Click-Flash + Multi-Track-Barrier.

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
    expectedDbEvents: [],
    barrierMs: 6000,
  },
  {
    id: '04-warte-auf-popup',
    role: 'kunde',
    ui: { action: 'wait', ms: 1800 },
    waitFor: { selector: '.mapboxgl-popup-content', timeoutMs: 4000 },
    expectedDbEvents: [],
    barrierMs: 8000,
  },
  {
    id: '05-klick-anfrage-button-im-popup',
    role: 'kunde',
    // Popup-Button hat onclick='document.dispatchEvent(new CustomEvent("claimondo:select-sv",...))'
    // wir matchen via Text — Playwright kann Text-Selektoren
    ui: { action: 'click', selector: '.mapboxgl-popup-content button' },
    expectedDbEvents: [],
    barrierMs: 6000,
  },
  {
    id: '06-warte-und-screenshot-detail-view',
    role: 'kunde',
    ui: { action: 'wait', ms: 2200 },
    expectedDbEvents: [],
    barrierMs: 5000,
  },
  {
    id: '07-scroll-zum-wizard',
    role: 'kunde',
    ui: { action: 'scrollBy', y: 200 },
    expectedDbEvents: [],
    barrierMs: 3000,
  },
]
