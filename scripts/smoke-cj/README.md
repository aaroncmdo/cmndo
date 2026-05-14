# CJ-Smoke — Three-Track-Sync-Barrier-Runner

Voll dokumentiert in `docs/13.05.2026/smoke-claimondo-de/CJ-SMOKE-FRAMEWORK.md`.

## Quickstart

```bash
# 1. .env.test anlegen mit Test-Mandant-IDs + Logins
SMOKE_TEST_KUNDE_USER_ID=<uuid>
SMOKE_TEST_KUNDE_EMAIL=smoke-kunde@claimondo.test
SMOKE_TEST_SV_USER_ID=<uuid>
SMOKE_TEST_SV_EMAIL=smoke-sv@claimondo.test
SMOKE_TEST_SV_PASSWORT=Test1234!
SMOKE_TEST_ADMIN_EMAIL=smoke-admin@claimondo.test
SMOKE_TEST_ADMIN_PASSWORT=Test1234!
SMOKE_TEST_PLZ=50667

# 2a. LIVE-Watch (Browser sichtbar, SlowMo, Step-HUD im Browser)
node scripts/smoke-cj/run.mjs --base staging --live

# 2b. LIVE + Pause zwischen Steps (Enter drücken)
node scripts/smoke-cj/run.mjs --base staging --live --pause

# 2c. Headless / CI mit Auto-Restart bei Desync
node scripts/smoke-cj/run.mjs --base staging

# 3. Output in docs/<datum>/smoke-claimondo-de/<iter>/
#    - PASS.md oder FAIL.md
#    - iter-summary.json
#    - <step-id>/screenshot.png, console.jsonl, db-events.jsonl, dom.html, ...
#    - trace-{kunde,sv,admin}.zip (Playwright-Trace pro Rolle)
#    - session-{kunde,sv,admin}.har
```

## Live-Modus

Während des Laufs:
- Browser bleibt sichtbar, SlowMo 400 ms, DevTools auf
- **Step-HUD oben rechts** in der Page zeigt aktuellen Step + Elapsed
- **Roter Outline-Flash** auf jedem Element 250 ms bevor geklickt wird
- Drei Browser-Fenster nacheinander (Kunde → SV → Admin) — eigener Context pro Rolle
- Bei Desync: **kein Auto-Restart**, Browser bleibt offen, du kannst DOM/State inspizieren, Ctrl+C zum Beenden

## Step-Strecke (18 Steps)

| # | Rolle | Domain | Was |
|---|---|---|---|
| 01–04 | Kunde | claimondo.de | gutachter-finden → SV pick → Anfrage → Lead-Form |
| 05 | Kunde | app.claimondo.de | Magic-Link öffnen |
| 06–09 | Kunde | app.claimondo.de | Phase 1–4 (Stammdaten, Schadenkonst., VS+Fahrzeug, Termin) |
| 10–14 | SV | app.claimondo.de | Login → Auftrag annehmen → Termin bestätigen → Gutachten upload → Versand an VS |
| 15–17 | Admin | app.claimondo.de | Login → VS-Reaktion → Abrechnung bezahlt |
| 18 | Assert | DB | `faelle.status === 'abgeschlossen'` |

## Sync-Garantie

Die drei Tracks (UI / DB / Assertion) müssen pro Step innerhalb des Barrier-Windows
(default 3 s, pro Step in `assertion-map.mjs` überschreibbar) alle `done` melden.
Wenn einer auf einen Fehler stößt oder das Window reißt:

1. Orchestrator wirft `desync(step, track, reason)`
2. Alle Tracks bekommen `cancel()` (Playwright zu, Realtime-Channel ab, Polling stop)
3. Iter wird von Step 0 nach Re-Seed neu gestartet (Retry-Counter +1)
4. Nach `MAX_RETRIES = 3` Hard-Fail mit Full-Diagnostic

## Backlog (nicht in v1)

- Pixel-Diff (zu flaky)
- Lighthouse-Performance (eigener Cron)
- Mobile-Viewport (eigene Iter)
- Mailtrap-Inbox-Polling (TODO in `seed-reset.mjs`)
- Sentry-Pre/Post-Diff
- Storage-Cleanup im Pre-Reset
- Steps 05..NN (Phase-2/3/4, Termin, Gutachten, VS, Abrechnung)
