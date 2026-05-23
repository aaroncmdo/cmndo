# CMM-44 SP-I2 PR2 — Portal-Smoke

**Datum:** 2026-05-23 · **Ziel:** `app.staging.claimondo.de` (PR1+PR2 gemergt) · **Script:** `scripts/smoke-cmm44-spi2.mjs` · Screenshots lokal (`docs/23.05.2026/cmm44-spi2-smoke/`, nicht committet).

## Ergebnis: HARD=0, SOFT=0, OK=7 ✅

| Check | Status | Befund |
|---|---|---|
| DB `kanzlei_faelle` SP-I2 + mandatsnummer | OK | `mandatsnummer=001Jz…` (12 backfilled), `anschlussschreiben_am=null` (cov=0) |
| Public `/` | OK | 200 |
| Admin `/faelle` (Hub) | OK | 200 — Fall-Nr-Label = `CLM-2026-…` (claim_nummer primär), keine SF-ID, kein undefined/Crash |
| Admin `/faelle/[id]` | OK | 200 — Fallakte rendert |
| Kanzlei `/kanzlei/mandate` | OK | 200 — rendert (Empty-State für test-kanzlei: 0 zugeordnete Komplett-Mandate) |
| Kanzlei `/kanzlei/kanban` | OK | 200 |
| Kunde `/kunde` | OK | 200 |

Detektoren je Seite: `pageerror` / `console.error` / HTTP≥500 — **0 Treffer**.

## Anmerkungen

- **SV-Fallseite übersprungen**: `test-sv` besitzt keinen Kanzlei-Phase-Fall (mandatsnummer gesetzt). Das `{svMandatsnummer && …}`-Gate ist tsc-verifiziert; der Embed/Deep-Link (CMM-23) ist bestehend.
- **Test-Daten-Limit**: die Test-User besitzen keinen der 12 mandatsnummer-Fälle → die mandatsnummer-Sekundär-Anzeige ist nicht visuell belegt, aber per `kanzlei_faelle(mandatsnummer)`-Embed-Query + tsc + 2-Stufen-Review abgesichert.
- **LexDrive-Embed-Spike** (separat, eingeloggt): iframe CSP-`frame-ancestors`-geblockt; Deep-Link rendert den vollen Mandatsverlauf. Details im Handoff `handoff-cmm44-spi2-abschluss.md`. (Spike-Screenshots mit PII gelöscht.)
