# CJ-Smoke — Three-Track-Sync-Barrier-Runner

Voll dokumentiert in `docs/13.05.2026/smoke-claimondo-de/CJ-SMOKE-FRAMEWORK.md`.

## Quickstart

```bash
# 1. .env.test anlegen mit Test-Mandant-IDs
SMOKE_TEST_KUNDE_USER_ID=<uuid>
SMOKE_TEST_KUNDE_EMAIL=smoke-kunde@claimondo.test
SMOKE_TEST_SV_USER_ID=<uuid>

# 2. Run gegen Staging
node scripts/smoke-cj/run.mjs --iter erste-iter --base staging

# 3. Output in docs/<datum>/smoke-claimondo-de/erste-iter/
#    - PASS.md oder FAIL.md
#    - iter-summary.json
#    - <step-id>/screenshot.png, console.jsonl, db-events.jsonl, ...
```

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
