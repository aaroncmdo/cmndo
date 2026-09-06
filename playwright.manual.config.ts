// Lauf-Konfiguration fuer die MANUELLEN Regel-4-Smokes (die aus MANUELLE_LIVE_SMOKES).
//
// Warum es sie braucht: Diese Specs stehen bewusst in MANUELLE_LIVE_SMOKES der
// playwright.config.ts, damit sie nie in CI laufen — sie schreiben echte Leads auf prod
// und loesen echte Mails aus. Deren testIgnore greift AUCH, wenn man die Datei explizit
// auf der Kommandozeile nennt: der Lauf meldet dann "0 tests" statt zu laufen, und ein
// stiller Skip sieht aus wie ein gruener Lauf.
//
// ⚠ GENAU DAS IST AM 06.09.2026 EINGETRETEN, und zwar an einer Spec, deren Startbefehl in
// einem PR, einem Marker und einer Uebergabe an die naechste Session stand: der
// Kasko-Zustellnachweis. Der dokumentierte Befehl `npx playwright test <datei>` lieferte
// "No tests found". Die Spec war korrekt gebaut, korrekt abgesichert — und fuer niemanden
// startbar. Die Absicherung gegen CI war zugleich das Ausschlusskriterium fuer den Menschen,
// der sie fahren sollte (Memory: broadcast-erfolgsmarker-als-ausschlusskriterium).
//
// Vorher war diese Datei auf GENAU EINE Spec fest verdrahtet
// (`testMatch: '**/unfallguide-strecke-prod.spec.ts'`). Wer eine zweite manuelle Spec
// anlegte, hatte keinen Weg, sie zu starten, und merkte es erst beim Versuch.
//
// Aufruf — die Spec wird per MANUAL_SPEC benannt (ohne Pfad, ohne `.spec.ts`):
//
//   MANUAL_SPEC=kasko-e6-mail-zustellnachweis \
//     PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//     npx playwright test --config=playwright.manual.config.ts
//
//   RUN_UNFALLGUIDE_SMOKE=1 MANUAL_SPEC=unfallguide-strecke-prod \
//     npx playwright test --config=playwright.manual.config.ts
//
// ⚠ KEIN Default fuer MANUAL_SPEC, und das ist Absicht. Ein Default wuerde bei einem Tippfehler
// still die FALSCHE Spec fahren — und diese Specs schreiben auf prod. Fail-closed: fehlt die
// Variable, bricht der Lauf mit einer Meldung ab, statt etwas Unerwartetes zu tun.
//
// Kein webServer: das Ziel ist prod, kein lokaler Server.
import { defineConfig, devices } from '@playwright/test'

const SPEC = (process.env.MANUAL_SPEC ?? '').trim()
if (!SPEC) {
  throw new Error(
    'MANUAL_SPEC fehlt. Nenne die Spec ohne Pfad und ohne Endung, z.B.\n' +
      '  MANUAL_SPEC=kasko-e6-mail-zustellnachweis npx playwright test --config=playwright.manual.config.ts\n' +
      'Die manuellen Smokes stehen in MANUELLE_LIVE_SMOKES (playwright.config.ts).',
  )
}
// Nur ein Dateiname, kein Pfad und kein Glob: sonst koennte ein '*' versehentlich mehrere
// prod-schreibende Specs auf einmal einsammeln.
if (!/^[a-z0-9-]+$/i.test(SPEC)) {
  throw new Error(`MANUAL_SPEC "${SPEC}" ist kein einfacher Dateiname (nur a-z, 0-9, Bindestrich).`)
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: `**/${SPEC}.spec.ts`,
  timeout: 8 * 60_000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
