// Customer-Journey Step-Map — vollständige End-to-End-Strecke
// claimondo.de/gutachter-finden  →  app.claimondo.de Fallakte „abgeschlossen"
//
// Drei Domains, drei Rollen, ein deterministischer Lauf:
//   • Marketing-Domain (claimondo.de) — gutachter-finden + Lead-Form
//   • Kunde-Portal (app.claimondo.de/flow/<token>) — Magic-Link, Phasen 1–4
//   • SV-Portal (app.claimondo.de/gutachter) — Auftrags-Annahme, Termin, Gutachten
//   • Admin-Portal (app.claimondo.de/admin) — VS-Reaktion, Abrechnung
//
// Selektoren mit `TODO selector-verify` sind heuristische Erstschüsse. Erste
// Iteration ermittelt die echten — die Step-Definitionen (Action-Semantik +
// erwartete DB-Effekte) sind das Verlässliche.

export const TEST_IDS = {
  kundeEmail: process.env.SMOKE_TEST_KUNDE_EMAIL ?? 'smoke-kunde@claimondo.test',
  kundeUserId: process.env.SMOKE_TEST_KUNDE_USER_ID,
  svUserId: process.env.SMOKE_TEST_SV_USER_ID,
  svEmail: process.env.SMOKE_TEST_SV_EMAIL,
  svPasswort: process.env.SMOKE_TEST_SV_PASSWORT,
  adminEmail: process.env.SMOKE_TEST_ADMIN_EMAIL,
  adminPasswort: process.env.SMOKE_TEST_ADMIN_PASSWORT,
  // PLZ wird so gewählt, dass Test-SV im 50-km-Radius ist
  testPlz: process.env.SMOKE_TEST_PLZ ?? '50667',
}

// Drei Browser-Contexte für drei Rollen (keine Auth-Vermischung)
export const ROLES = {
  KUNDE: 'kunde',     // Marketing + /flow + /portal/kunde
  SV: 'sv',           // /gutachter (eingeloggt)
  ADMIN: 'admin',     // /admin (eingeloggt)
}

export const STEPS = [
  // ── Marketing-Domain: SV-Suche ────────────────────────────────────────
  {
    id: '01-gutachter-finden-open',
    role: ROLES.KUNDE,
    ui: { action: 'navigate', url: '/gutachter-finden' },
    waitFor: { selector: '.mapboxgl-canvas', timeoutMs: 45000 },
    expectedDbEvents: [],  // reine Read-Page, kein Side-Effect
    barrierMs: 50000,
  },
  {
    id: '02-wait-for-markers',
    role: ROLES.KUNDE,
    ui: { action: 'wait', ms: 2500 },
    waitFor: { selector: '.mapboxgl-marker', timeoutMs: 8000 },
    expectedDbEvents: [],
    barrierMs: 11000,
  },
  {
    id: '03-click-sv-marker',
    role: ROLES.KUNDE,
    ui: { action: 'click', selector: '.mapboxgl-marker' },
    waitFor: { selector: '.mapboxgl-popup-content', timeoutMs: 4000 },
    expectedDbEvents: [],
    barrierMs: 6000,
  },
  {
    id: '03b-click-anfrage-popup-button',
    role: ROLES.KUNDE,
    ui: { action: 'click', selector: '[data-testid="sv-anfrage-popup"]' },
    expectedDbEvents: [],
    barrierMs: 4000,
  },
  {
    id: '04-lead-form-submit',
    role: ROLES.KUNDE,
    ui: {
      action: 'fillForm',
      fields: {
        '[name="vorname"]': 'Smoke',
        '[name="nachname"]': 'Test',
        '[name="email"]': TEST_IDS.kundeEmail,
        '[name="telefon"]': '+4915112345678',
        '[name="plz"]': TEST_IDS.testPlz,
        '[name="schadens_typ"]': 'haftpflicht',
      },
      submit: '[data-testid="wizard-weiter"]',
    },
    expectedDbEvents: [
      { table: 'leads', kind: 'insert', match: { email: TEST_IDS.kundeEmail } },
      { table: 'flow_links', kind: 'insert', match: { kunde_email: TEST_IDS.kundeEmail } },
      { table: 'nachrichten', kind: 'insert', match: { kanal: 'email', typ: 'lead-bestaetigung' } },
    ],
    expectedRevalidatePaths: ['/admin/leads', '/dispatch/leads'],
    barrierMs: 8000,
  },

  // ── Magic-Link-Wechsel auf app-Domain ──────────────────────────────────
  {
    id: '05-magic-link-open',
    role: ROLES.KUNDE,
    ui: {
      action: 'openMagicLinkFromDb',
      tokenSource: { table: 'flow_links', match: { kunde_email: TEST_IDS.kundeEmail }, column: 'token' },
      pathTemplate: '/flow/{token}',
      domain: 'app',  // wechselt von claimondo.de auf app.(staging.)claimondo.de
    },
    expectedDbEvents: [
      { table: 'flow_links', kind: 'update', match: { verwendet_am: 'NOT NULL' } },
    ],
    barrierMs: 8000,
  },
  {
    id: '06-phase-1-dsgvo-stammdaten',
    role: ROLES.KUNDE,
    ui: {
      action: 'fillForm',
      preActions: [{ action: 'click', selector: '[data-testid="feld-dsgvo"]' }],
      fields: {
        '[name="strasse"]': 'Smoke-Straße 1',
        '[name="plz"]': TEST_IDS.testPlz,
        '[name="ort"]': 'Köln',
        '[name="geburtsdatum"]': '1990-01-15',
      },
      submit: '[data-testid="wizard-weiter"]',
    },
    expectedDbEvents: [
      { table: 'faelle', kind: 'insert', match: { kunde_email: TEST_IDS.kundeEmail } },
      { table: 'faelle', kind: 'update', match: { status: 'kunde-onboarding' } },
    ],
    expectedStatusTransition: { from: 'neu', to: 'kunde-onboarding' },
    barrierMs: 10000,
  },
  {
    id: '07-phase-2-schadenkonstellation',
    role: ROLES.KUNDE,
    ui: {
      action: 'fillForm',
      fields: {
        '[name="schadens_konstellation"]': 'haftpflicht-geschaedigt',
        '[name="schadens_datum"]': '2026-05-10',
        '[name="schadens_ort"]': 'Köln Innenstadt',
        '[name="hergang"]': 'Auffahrunfall an Ampel',
      },
      submit: '[data-testid="wizard-weiter"]',
    },
    expectedDbEvents: [
      { table: 'faelle', kind: 'update', match: { schadens_konstellation: 'haftpflicht-geschaedigt' } },
    ],
    barrierMs: 6000,
  },
  {
    id: '08-phase-3-versicherer-fahrzeug',
    role: ROLES.KUNDE,
    ui: {
      action: 'fillForm',
      fields: {
        '[name="vs_name_gegner"]': 'HUK24',
        '[name="vs_kennzeichen_gegner"]': 'K-AB-1234',
        '[name="kennzeichen"]': 'K-CD-5678',
        '[name="fahrzeug_marke"]': 'VW',
        '[name="fahrzeug_modell"]': 'Golf',
      },
      submit: '[data-testid="wizard-weiter"]',
    },
    expectedDbEvents: [
      // CMM-Phase-1.5 Sync-Trigger: faelle-Update → claims-Insert
      { table: 'claims', kind: 'insert', match: { kennzeichen: 'K-CD-5678' } },
    ],
    barrierMs: 8000,
  },
  {
    id: '09-phase-4-termin-vorschlag',
    role: ROLES.KUNDE,
    ui: {
      action: 'fillForm',
      fields: {
        '[name="besichtigungsort_strasse"]': 'Smoke-Straße 1',
        '[name="besichtigungsort_plz"]': TEST_IDS.testPlz,
        '[name="besichtigungsort_ort"]': 'Köln',
        '[name="wunschtermin"]': '2026-05-20T10:00',
      },
      submit: '[data-testid="wizard-weiter"]',
    },
    expectedDbEvents: [
      { table: 'gutachter_termine', kind: 'insert', match: { status: 'vorgeschlagen' } },
      { table: 'faelle', kind: 'update', match: { status: 'auftrag-offen' } },
    ],
    expectedStatusTransition: { from: 'kunde-onboarding', to: 'auftrag-offen' },
    barrierMs: 10000,
  },

  // ── Rollen-Switch: SV-Portal ───────────────────────────────────────────
  {
    id: '10-sv-login',
    role: ROLES.SV,
    ui: {
      action: 'login',
      url: '/login',
      email: TEST_IDS.svEmail,
      passwort: TEST_IDS.svPasswort,
      successWait: { selector: '[data-testid="gutachter-nav"]', timeoutMs: 8000 },
    },
    expectedDbEvents: [],
    barrierMs: 12000,
  },
  {
    id: '11-sv-auftrag-annehmen',
    role: ROLES.SV,
    ui: {
      action: 'goToFallakteAndClick',
      fallSource: { table: 'faelle', match: { kunde_email: TEST_IDS.kundeEmail }, column: 'id' },
      pathTemplate: '/gutachter/auftraege/{id}',
      clickSelector: '[data-testid="auftrag-annehmen"]',
    },
    expectedDbEvents: [
      { table: 'auftraege', kind: 'insert', match: { sv_user_id: TEST_IDS.svUserId } },
      { table: 'faelle', kind: 'update', match: { status: 'auftrag-vergeben' } },
    ],
    expectedStatusTransition: { from: 'auftrag-offen', to: 'auftrag-vergeben' },
    barrierMs: 8000,
  },
  {
    id: '12-sv-termin-bestaetigen',
    role: ROLES.SV,
    ui: { action: 'click', selector: '[data-testid="termin-bestaetigen"]' },
    expectedDbEvents: [
      { table: 'gutachter_termine', kind: 'update', match: { status: 'bestaetigt' } },
      { table: 'nachrichten', kind: 'insert', match: { kanal: 'email', typ: 'termin-bestaetigt' } },
    ],
    barrierMs: 6000,
  },
  {
    id: '13-sv-gutachten-upload',
    role: ROLES.SV,
    ui: {
      action: 'uploadFile',
      selector: '[data-testid="gutachten-upload"]',
      filePath: 'scripts/smoke-cj/fixtures/smoke-gutachten.pdf',
      submitAfter: '[data-testid="gutachten-finalisieren"]',
    },
    expectedDbEvents: [
      { table: 'dokumente', kind: 'insert', match: { typ: 'gutachten' } },
      { table: 'faelle', kind: 'update', match: { status: 'gutachten-fertig' } },
    ],
    expectedStatusTransition: { from: 'auftrag-vergeben', to: 'gutachten-fertig' },
    barrierMs: 15000,
  },
  {
    id: '14-sv-versand-versicherer',
    role: ROLES.SV,
    ui: { action: 'click', selector: '[data-testid="versand-vs-trigger"]' },
    expectedDbEvents: [
      { table: 'faelle', kind: 'update', match: { status: 'gutachten-versendet' } },
      { table: 'nachrichten', kind: 'insert', match: { kanal: 'email', empfaenger_typ: 'versicherer' } },
    ],
    expectedStatusTransition: { from: 'gutachten-fertig', to: 'gutachten-versendet' },
    barrierMs: 8000,
  },

  // ── Rollen-Switch: Admin-Portal ────────────────────────────────────────
  {
    id: '15-admin-login',
    role: ROLES.ADMIN,
    ui: {
      action: 'login',
      url: '/login',
      email: TEST_IDS.adminEmail,
      passwort: TEST_IDS.adminPasswort,
      successWait: { selector: '[data-testid="admin-nav"]', timeoutMs: 8000 },
    },
    expectedDbEvents: [],
    barrierMs: 12000,
  },
  {
    id: '16-admin-vs-reaktion-erfassen',
    role: ROLES.ADMIN,
    ui: {
      action: 'goToFallakteAndFill',
      fallSource: { table: 'faelle', match: { kunde_email: TEST_IDS.kundeEmail }, column: 'id' },
      pathTemplate: '/admin/faelle/{id}',
      preActions: [{ action: 'click', selector: '[data-testid="tab-vs-reaktion"]' }],
      fields: {
        '[name="vs_reaktion_status"]': 'anerkannt',
        '[name="vs_reaktion_betrag"]': '4250.00',
      },
      submit: '[data-testid="vs-reaktion-speichern"]',
    },
    expectedDbEvents: [
      { table: 'vs_reaktionen', kind: 'insert', match: { status: 'anerkannt' } },
    ],
    barrierMs: 8000,
  },
  {
    id: '17-admin-abrechnung-bezahlt',
    role: ROLES.ADMIN,
    ui: {
      action: 'goToFallakteAndClick',
      fallSource: { table: 'faelle', match: { kunde_email: TEST_IDS.kundeEmail }, column: 'id' },
      pathTemplate: '/admin/faelle/{id}',
      preActions: [{ action: 'click', selector: '[data-testid="tab-abrechnung"]' }],
      clickSelector: '[data-testid="abrechnung-bezahlt-markieren"]',
    },
    expectedDbEvents: [
      { table: 'abrechnungen', kind: 'update', match: { bezahlt: true } },
      { table: 'faelle', kind: 'update', match: { status: 'abgeschlossen' } },
    ],
    expectedStatusTransition: { from: 'gutachten-versendet', to: 'abgeschlossen' },
    barrierMs: 10000,
  },

  // ── Final-Assertion ────────────────────────────────────────────────────
  {
    id: '18-final-assert-fall-abgeschlossen',
    role: ROLES.ADMIN,
    ui: { action: 'noop' },
    expectedDbEvents: [],
    finalAssertion: {
      table: 'faelle',
      match: { kunde_email: TEST_IDS.kundeEmail },
      mustHave: { status: 'abgeschlossen' },
    },
    barrierMs: 3000,
  },
]

export function getStep(id) {
  return STEPS.find((s) => s.id === id)
}
