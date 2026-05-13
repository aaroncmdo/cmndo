// Deklarative Step-Map: UI-Aktion ↔ erwartete DB-Events ↔ erwartete Status-Transition.
// Single Source of Truth für die Customer-Journey. Watcher matched dagegen,
// UI-Driver liest `ui.action` daraus. Map-Reihenfolge = Step-Reihenfolge.

export const TEST_IDS = {
  // Fixe UUIDs aus .env.test — Seed-Reset purged genau diese Sätze.
  kundeUserId: process.env.SMOKE_TEST_KUNDE_USER_ID,
  kundeEmail: process.env.SMOKE_TEST_KUNDE_EMAIL ?? 'smoke-kunde@claimondo.test',
  svUserId: process.env.SMOKE_TEST_SV_USER_ID,
  // Lead-ID wird im Reset neu erzeugt, fallId folgt aus Phase-1
}

export const STEPS = [
  {
    id: '01-lead-formular-submit',
    ui: {
      url: '/',
      action: 'fillLeadForm',
      payload: { vorname: 'Smoke', nachname: 'Test', email: TEST_IDS.kundeEmail, schadens_typ: 'haftpflicht' },
    },
    expectedDbEvents: [
      { table: 'leads', kind: 'insert', match: { email: TEST_IDS.kundeEmail } },
      { table: 'nachrichten', kind: 'insert', match: { kanal: 'email', typ: 'lead-bestaetigung' }, optional: false },
    ],
    expectedStatusTransition: null,
    expectedRevalidatePaths: ['/admin/leads'],
    barrierMs: 5000,
  },
  {
    id: '02-magic-link-phase-1-start',
    ui: {
      action: 'openMagicLinkFromDb',
      tokenSource: { table: 'flow_links', match: { kunde_email: TEST_IDS.kundeEmail }, column: 'token' },
    },
    expectedDbEvents: [
      { table: 'flow_links', kind: 'update', match: { verwendet_am: 'NOT NULL' } },
    ],
    expectedStatusTransition: null,
    barrierMs: 5000,
  },
  {
    id: '03-phase-1-dsgvo-accept',
    ui: { action: 'clickCheckbox', selector: '[data-testid="dsgvo-accept"]' },
    expectedDbEvents: [],
    barrierMs: 2000,
  },
  {
    id: '04-phase-1-stammdaten',
    ui: {
      action: 'fillForm',
      fields: {
        '[name="strasse"]': 'Smoke-Straße 1',
        '[name="plz"]': '50667',
        '[name="ort"]': 'Köln',
        '[name="telefon"]': '+4915112345678',
      },
      submit: '[data-testid="phase-1-weiter"]',
    },
    expectedDbEvents: [
      { table: 'faelle', kind: 'insert', match: { kunde_email: TEST_IDS.kundeEmail } },
      { table: 'faelle', kind: 'update', match: { status: 'kunde-onboarding' } },
    ],
    expectedStatusTransition: { from: 'neu', to: 'kunde-onboarding' },
    expectedRevalidatePaths: ['/admin/faelle'],
    barrierMs: 6000,
  },
  // TODO: 05..NN — Phase-2 (Schadenkonstellation), Phase-3 (Versicherer-Daten),
  // Phase-4 (Termin-Vorschlag), SV-Annahme, Termin-Bestätigung, Gutachten-Upload,
  // VS-Reaktion, Abrechnung. Erste Iter: nur 01-04, dann iterativ erweitern.
]

// Hilfs-Lookup: kennst du den Step → kennst du die erwarteten Effekte
export function getStep(id) {
  return STEPS.find((s) => s.id === id)
}
