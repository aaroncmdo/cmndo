# CJ-Smoke-Framework — Three-Track-Sync-Barrier

**Stand:** 2026-05-13
**Ziel:** Vollständige Customer-Journey end-to-end testen (UI-Klicks + DB-Schema + Business-Logic) mit **deterministischer Drei-Track-Synchronisation** — wenn irgendeine Spur out-of-sync gerät, sofort abbrechen und von Step 0 neu starten.

## Architektur

```
                ┌─────────────────────────────────┐
                │     ORCHESTRATOR (EventBus)     │
                │  step:start / step:done /       │
                │  step:desync(track, reason)     │
                └────┬────────────┬────────────┬──┘
                     │            │            │
            ┌────────▼───┐  ┌─────▼────┐  ┌────▼────────┐
            │ UI-Driver  │  │ Watcher  │  │ Assertions  │
            │ Playwright │  │ Realtime │  │ erwartet vs.│
            │ Klicks +   │  │ DB-Inserts│ │ tatsächlich │
            │ Screenshots│  │ + Events │  │ Diff        │
            └────────────┘  └──────────┘  └─────────────┘
                     │            │            │
                     └─→ alle 3 müssen pro Step innerhalb
                         Barrier-Window (3 s) `step:done` melden
                         → sonst sofort kill + restart Iteration
```

## Sync-Barrier-Protokoll

Pro Step `N`:

1. `Orchestrator.emit('step:start', { n: N, definition })`
2. **UI-Driver** liest `definition.action` (z. B. `click button[data-testid="phase-1-weiter"]`), führt aus, screenshots → `emit('step:ui-done')`
3. **Watcher** liest `definition.expectedDbEvents` (z. B. `[{ table: 'faelle', column: 'status', from: 'neu', to: 'kunde-onboarding' }, { table: 'nachrichten', kind: 'insert', kanal: 'whatsapp' }]`), wartet auf passende Realtime-Events → `emit('step:db-done')` sobald komplett
4. **Assertion-Track** kreuzt UI-Marker + DB-Marker gegen die Spec-Map → `emit('step:assert-done')`
5. **Barrier:** wenn alle drei `done` innerhalb 3 s → `step:done` → nächster Step. Sonst `step:desync(step=N, track=X, reason=...)`

**Desync = Restart-Iteration** (nicht Step-Retry — sonst maskieren wir State-Leaks).

## Pre-Run-Reset (Idempotent Seeder)

`scripts/smoke-cj/seed-reset.mjs` — vor JEDEM Iter-Start:

- Test-Lead-ID + Test-Kunde-ID + Test-SV-ID (fixe UUIDs in `.env.test`)
- `faelle.status = 'neu'`, alle Phase-Flags `false`, FK-Cleanup
- `flow_links` für die Test-IDs: neuen Token, `verwendet_am = null`
- `nachrichten`, `gutachter_termine`, `claims`, `auftraege` für die IDs purgen
- Storage: `dokumente/<fallId>/*` löschen (Edge-Function oder Admin-API)
- `kunde.twofa_aktiviert = false`, `force_password_change = false` (siehe `e2e_test_users`-Memory)
- Exit-Code != 0 = Iter wird gar nicht gestartet (Schema-Drift-Guard schlägt sonst hier zu)

## Schema-Drift-Guard

Vor Seed:
```
npx supabase db diff --linked --schema public
```
Wenn Output != leer → `process.exit(2)` mit Hinweis: „Migrations applied via Mgmt-API oder Studio-Direct? AGENTS.md Regel 2."

## Assertion-Map-Struktur

`scripts/smoke-cj/assertion-map.mjs`:

```js
export const ASSERTIONS = {
  '01-lead-formular-submit': {
    ui: { url: '/', action: 'fillLeadForm + submit' },
    expectedDbEvents: [
      { table: 'leads', kind: 'insert', match: { email: TEST.kunde.email } },
      { table: 'nachrichten', kind: 'insert', match: { kanal: 'email', typ: 'lead-bestaetigung' } },
    ],
    expectedStatusTransition: null,  // Lead-Phase, noch kein Fall
    expectedRevalidatePaths: ['/admin/leads'],
    barrierMs: 3000,
  },
  '02-magic-link-phase-1': {
    ui: { url: 'flow_links.url', action: 'openMagicLink + acceptDsgvo + clickWeiter' },
    expectedDbEvents: [
      { table: 'flow_links', kind: 'update', match: { verwendet_am: 'NOT NULL' } },
      { table: 'faelle', kind: 'update', match: { status: 'kunde-onboarding' } },
    ],
    expectedStatusTransition: { from: 'neu', to: 'kunde-onboarding' },
    barrierMs: 5000,  // Magic-Link-Redirect braucht länger
  },
  // ... 03..NN
}
```

## Capture-Sets (pro Step automatisch)

In `<iter>/<NN>-<step>/`:

| Datei | Quelle |
|---|---|
| `screenshot.png` | `page.screenshot({ fullPage: true })` |
| `dom.html` | `page.content()` (nur bei desync) |
| `console.jsonl` | `page.on('console')` mit `level >= warn` |
| `pageerrors.jsonl` | `page.on('pageerror')` |
| `network-4xx-5xx.jsonl` | `page.on('response')` Filter `status >= 400` |
| `network-failed.jsonl` | `page.on('requestfailed')` |
| `db-events.jsonl` | Watcher-Realtime-Stream für diesen Step |
| `axe.json` | `@axe-core/playwright` `checkA11y()` |

Top-Level pro Iter:
- `iter-summary.json` (Steps, Status, Retries, Sentry-Delta, Total-Duration)
- `sentry-pre.json` / `sentry-post.json` (Sentry-API `issues?statsPeriod=1h`)
- `schema-diff-pre.sql` (von Drift-Guard)
- `mailtrap-inbox.json` (gesendete Emails im Iter-Window)

## Restart-Bedingungen

| Trigger | Verhalten |
|---|---|
| `step:desync` von einem Track | sofort `cancel()` an alle drei, Iter-Diagnostic dumpen, **Iter neu** (Retry-Counter +1) |
| Sentry-Delta > 0 (neue Issues) | Iter darf fertig laufen, Report markiert es als WARN |
| `pageerror` auf irgendeiner Page | sofort `step:desync(track=ui, reason=pageerror)` |
| Schema-Drift im Pre-Check | Iter wird gar nicht gestartet, Hard-Exit |
| Max-Retries (default 3) erreicht | Hard-Fail, GitHub-Issue auto-create mit `mailtrap` + `db-events` + screenshots als Anhang |

## Sicht des "Smoke-Claude"

1. Iter startet via `node scripts/smoke-cj/run.mjs --iter <name> --base staging`
2. Bei Erfolg: `docs/<datum>/smoke-claimondo-de/<iter>/PASS.md` mit grünen Haken pro Step + Dauer
3. Bei Hard-Fail: `docs/<datum>/smoke-claimondo-de/<iter>/FAIL.md` mit pivotalem Desync-Punkt, Screenshot des kaputten Steps und Vorschlag-Map "welche Datei wahrscheinlich kaputt"

## Was NICHT drin ist (bewusst)

- Pixel-Diff (zu flaky bei Cinematic-Status / Wetter-Particles)
- Lighthouse-Performance (eigener Cron-Job)
- Mobile-Viewport-Pass (eigene Iter)
- Multi-Mandant-Concurrency (V2 später)

## Implementierungs-Files

- `scripts/smoke-cj/run.mjs` — Entry, parsed Flags, startet Orchestrator
- `scripts/smoke-cj/orchestrator.mjs` — EventBus + Barrier + Retry-Loop
- `scripts/smoke-cj/ui-driver.mjs` — Playwright + Capture
- `scripts/smoke-cj/db-watcher.mjs` — Supabase-Realtime + Match-Engine
- `scripts/smoke-cj/assertion-map.mjs` — deklarative Step-Map
- `scripts/smoke-cj/seed-reset.mjs` — Pre-Run-Reset
- `scripts/smoke-cj/sentry.mjs` — Pre/Post-Issue-Diff
- `scripts/smoke-cj/reporter.mjs` — PASS.md / FAIL.md Writer
