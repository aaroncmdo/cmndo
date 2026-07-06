# prod-smoke — authentifizierter Prod-/Staging-Smoke per echtem Chromium

Ein geteiltes Harness für den org-weiten „smoke bis 1+ per Playwright"-Auftrag:
loggt sich als **Test-Account** ein (GoTrue password-grant), injiziert die Session
als `@supabase/ssr`-Cookie in einen echten Chromium-Kontext und rendert / bedient
authentifizierte Seiten — **mehr als curl-Status** (echtes SSR-Render, Layout,
Marker, Screenshots), ohne den Login-/2FA-UI-Flow zu durchlaufen.

Entstanden aus dem Doppel-UI-Prod-Smoke 05.-06.07.2026. Vollständiges Rezept +
Lehren: `docs/` bzw. Memory `reference-playwright-prod-smoke-recipe`.

## Voraussetzungen

- Playwright + Chromium installiert (`npx playwright install chromium`).
- Env: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (aus `.env.local`).
- Ein **Test-Account** (nie echte Partner/Kunden — es wird auf PROD getestet).

## Nutzung

```bash
# Render-Smoke mehrerer Seiten als test-dispatch (--env-file lädt NEXT_PUBLIC_SUPABASE_*):
node --env-file=.env.local scripts/prod-smoke/smoke.mjs \
  --app-url https://app.claimondo.de \
  --email test-dispatch@claimondo.de --password 'Test1234!' \
  --checks '[{"label":"dashboard","path":"/dispatch/dashboard","markers":["Abmelden","Dashboard"]}]'
```

`--checks` ist ein JSON-Array (inline oder `@pfad/zu/checks.json`), jeder Eintrag:
`{ "label", "path", "markers": ["sichtbarer Text", ...] }`.

Ausgabe je Check: `status`, `finalUrl`, `redirectedToLogin` (true = Auth
fehlgeschlagen), `markers` (Text vorhanden?), `shot` (Screenshot-Pfad).

Flags: `--app-url` (Default `$SMOKE_APP_URL`), `--out <dir>` (Screenshots, Default
`os.tmpdir()/prod-smoke`), `--cookie-domain` (Default: `.` + registrierbare
App-Domain), `--headed`. Passwort auch via `$SMOKE_PASSWORD`.

## Wichtig — Sicherheit

- **NUR Test-Accounts, NUR Test-Daten mutieren.** Es läuft gegen PROD.
- Bei interaktiven Smokes (Formular absenden): die Ziel-Zeile per **unique Text
  scopen und asserten BEVOR** geklickt wird — nie eine echte/fremde Zeile treffen.
- **DB-Verifikation** (der eigentliche Beweis) per `execute_sql` (READ) BEFORE/AFTER —
  UI-Status allein reicht nicht.
- Keine Secrets committen: Credentials kommen aus Env/Args, nie hardcoden.

## Erweiterung: interaktiv + DB-Check

Das Harness deckt Render-Smoke ab. Für Formular-Interaktion + DB-Delta die
`sessionToCookies()`-Funktion (`cookie.mjs`) in einem eigenen Playwright-Script
wiederverwenden und danach den DB-Zustand prüfen — Muster siehe Memory-Rezept.
