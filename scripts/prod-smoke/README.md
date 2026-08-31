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
  --email test-dispatch@claimondo.de --password '<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>' \
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

## Weitere Harness-Scripts (2026-07)

Alle nutzen dasselbe `cookie.mjs`-Login und lesen Creds aus `$SMOKE_EMAIL`/`$SMOKE_PASSWORD`
(keine hardcoded Secrets). Aufruf: `MSYS_NO_PATHCONV=1 SMOKE_EMAIL=… SMOKE_PASSWORD=… node --env-file=.env.local scripts/prod-smoke/<script>`.

- **`route-sweep.mjs`** — Route-Health-Sweep über eine Liste (`--checks @datei.json`, `--role <name>`).
  Erfasst Status/Redirect/console-error/API-4xx-5xx/Error-Boundary (sichtbarer Body, nicht HTML).
  `domcontentloaded` + Settle statt `networkidle` (Realtime-Websockets). Basis der Error-Bestandsaufnahme
  `docs/2026-07-14-prod-error-inventory.md`.
- **`chat-smoke.mjs`** — sendet eine Chat-Nachricht (`--claim --path [--tab] --text [--expect]`), prüft
  Ankunft + Persistenz-nach-Reload + Cross-User. Sendet per Enter-Keystroke (React-State-safe).
- **`chat-verify.mjs`** — read-only: misst, WANN erwartete Marker sichtbar werden (Realtime vs. Reload).
- **`copilot-smoke.mjs`** — Claim-AI-Panel: Frage stellen, Streaming-Antwort + Persistenz prüfen.
- **`create-testfall.mjs`** — legt via `/admin/faelle/anlegen` (Admin-UI) einen Testfall an
  (Test-Email `@claimondo.test` → istTestKunde-Guard unterdrückt Zustellung).
