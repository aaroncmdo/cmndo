# §A7 Reader-Repoint (#2131) — UI-Smoke-Ergebnis

**Datum:** 31.05.2026 · gegen `npm run dev` :3942 (NODE_ENV=development, keine Secure-Cookies), Prod-Supabase.

## Verifikation

- **`npx tsc --noEmit`** → EXIT 0.
- **Filter-Äquivalenz (Live-DB `v_claim_full`):** `old_active=74` vs `new_active=75` → 1 divergente Zeile = `CLM-2026-00155` (`fall_id` NULL, faelle-loser komplett-Claim). Gewollte claims-SSoT-Korrektur (das alte `fall_status`-Filter versteckte faelle-lose aktive Claims per NULL-Logik). Fixt Drift in beide Richtungen.
- **UI-Smoke (Playwright, Login smoke-admin):** alle 5 repointeten-File-Seiten rendern, **0 Console/Page-Errors**, kein `/faelle/null`-Crash:
  - `/admin/team` ✅
  - `/admin/team/[id]` (KB Anna Weber / kb@claimondo.de): **„Aktive Fälle: 1"** = der Repoint zählt den faelle-losen Claim als aktiv (unter altem Filter wäre es **0** gewesen) ✅ — visueller Beweis des Bugfix.
  - `/mitarbeiter` ✅ · `/mitarbeiter/performance` ✅ · `/mitarbeiter/isochrone` ✅
- **Crons** (vs-timer, vollmacht-/sa-/pflichtdokumente-reminder) **bewusst NICHT gecurlt** — Side-Effects (Reminder-Mitteilungen, **WhatsApp**) gegen Prod-Daten würden echte User spammen. Ihre repointete Query ist identisch zum verifizierten Dashboard-Pattern + DB-äquivalenz-geprüft.

## Ergebnis

**PASS — nichts zu fixen.** Der Filter-Swap `fall_status` → `main_phase` ist verhaltens-korrekt (1 verstandene, gewollte Divergenz) und crash-frei.

Screenshots: `01-mitarbeiter.png`, `02-performance.png`, `03-isochrone.png`, `04-admin-team.png`, `05-admin-team-kb.png`.
Tooling: `scripts/smoke-prep-readers.mjs` (Passwort-Prep, reversibel), `scripts/smoke-readers-playwright.mjs`.
