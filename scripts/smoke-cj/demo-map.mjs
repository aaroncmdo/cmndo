// Schnupper-Map — nur Marketing-Page-Render + Map + CustomEvent-Demo.
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
    barrierMs: 18000,
  },
  {
    id: '02-map-rendered-screenshot',
    role: 'kunde',
    // 2 s warten damit Karte Tiles + Marker rendert, dann Screenshot
    ui: { action: 'wait', ms: 2500 },
    expectedDbEvents: [],
    barrierMs: 5000,
  },
  {
    id: '03-scroll-and-snap',
    role: 'kunde',
    ui: { action: 'scrollBy', y: 400 },
    expectedDbEvents: [],
    barrierMs: 3000,
  },
]
