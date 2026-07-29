// J7 — Storno / DSGVO-Löschung — Journey-Smoke (SKELETON)
//
// Journey-Spec: docs/fundament/journeys/j07-storno-dsgvo-loeschung.md
// B1-Oracle:    docs/fundament/journey-smokes.md  (J7 = die einzige echte Lücke)
//
// SKELETON mit begründetem Skip (B1-DoD: „übrige Journeys mindestens als Skeleton mit begründeten Skips"):
//   1. Läuft nur opt-in (RUN_STORNO_DSGVO_SMOKE=1) — wie golden-path-prod / reparatur-weg (CI/Prod-optin).
//   2. ⚠ Die DSGVO-Ausführung (fuehreLoeschungAus) ist IRREVERSIBEL → ausschließlich gegen ein
//      session-isoliertes Wegwerf-Konto (scripts/smoke/throwaway-account.mjs), NIE gegen echte Kundendaten
//      (Regel 4: telefon=NULL, @claimondo.test). Der Seed muss dieses Konto + einen stornierbaren Claim bauen.
//   3. Selektoren sind TODO — beim Lauffähig-Machen gegen die echte UI verifizieren (die Storno/DSGVO-
//      Actions sind per <form action={…}> verdrahtet, daher nicht per Grep auffindbar).
//
// Run (nach Seed + Umgebung): RUN_STORNO_DSGVO_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//   npx playwright test storno-dsgvo-smoke --project=chromium

import { test, expect } from '@playwright/test'

test.describe('J7 — Storno / DSGVO-Löschung', () => {
  // Zwei getrennte Ausstiege (J7-Soll): Storno = Fall beenden, Daten bleiben (Nachweis/Buchhaltung);
  // DSGVO-Löschung = personenbezogene Daten entfernen (Recht auf Vergessen).
  test.skip(!process.env.RUN_STORNO_DSGVO_SMOKE, 'SKELETON: Seed + Selektoren + Umgebung offen (s. journey-smokes.md)')

  test('A · Storno: Kunde storniert Fall → Status "storniert"', async () => {
    // Journey J7 · Ablauf A (stornoFall → markClaimAsStorniert, terminal)
    // Seed-Vorbedingung: Wegwerf-Kunde + Claim in einem STORNIERBAREN Status (vor Kanzlei-Übergabe, P2.4-Default).
    // 1. Login Wegwerf-Kunde (@claimondo.test).
    // 2. /kunde/faelle/[claimId] → Trigger „Fall stornieren" → Grund eingeben → bestätigen.
    // 3. UI-Assert: Fall zeigt „storniert" + Grund.
    // 4. DB-Assert (Seed --assert): claims.operative_status='storniert'.
    // ⚠ Fehlerfall-Guard (#4625-Klasse): der Storno-Write muss .select()+Row-Check machen — ein RLS-verworfenes
    //    UPDATE darf NICHT als Erfolg gewertet werden (vier Portale meldeten „storniert" bei unveränderter DB).
    expect(true).toBeTruthy() // TODO: echte Schritte
  })

  test('B · DSGVO-Löschung: Antrag → Bestätigung → Ausführung (2-Schritt-Prinzip)', async () => {
    // Journey J7 · Ablauf B (stelleLoeschAntrag → bestaetigeLoeschAntrag → fuehreLoeschungAus)
    // ⚠ IRREVERSIBEL — nur Wegwerf-Konto.
    // 1. Wegwerf-Kunde: Löschantrag stellen (stelleLoeschAntrag, optional Grund) → Status „beantragt".
    //    UI: vermutlich /kunde/einstellungen (Route beim Lauffähig-Machen verifizieren).
    // 2. Prüfung/Bestätigung (bestaetigeLoeschAntrag) — gesetzliche Aufbewahrung geprüft (kein Löschen
    //    laufender Regulierung/Buchhaltung → dann Sperrung statt Löschung).
    // 3. Ausführung (fuehreLoeschungAus) → personenbezogene Daten entfernt/anonymisiert + Bestätigung.
    // 4. Assert: Daten weg/anonymisiert; getMyLoeschAntrag zeigt „ausgeführt".
    // Variante: storniereLoeschAntrag (Rücknahme VOR Ausführung) — eigener Schritt.
    expect(true).toBeTruthy() // TODO: echte Schritte
  })
})
