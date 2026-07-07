# Test-Fixtures-Provisioner (Ship-Safety P2 / SP1)

Idempotenter Provisioner, der den **kanonischen Test-Zustand auf Prod garantiert** —
7 Test-Accounts (entsperrt/aktiv) + einen kohärenten Stage-Claim-Seed-Graph, sodass
jede Rolle bis zu ihrer Kern-CTA smokebar ist. Erneutes Ausführen stellt den
Soll-Zustand wieder her (drift-fest). **Kein DDL**, nur `upsert`/`update` auf stabile
Test-UUIDs (Prefix `fb…`) + die bekannten Account-IDs — echte Entitäten werden nie berührt.

## Ausführen

```bash
# Env laden (Key NICHT ausgeben) + Dry-Run (zeigt Soll-Ist, KEINE Writes):
set -a; . .env.local; set +a
npx tsx scripts/test-fixtures/provision.ts --dry-run

# Echt-Lauf (schreibt die Fixtures):
npx tsx scripts/test-fixtures/provision.ts
```

Exit-Code 0 = alles ok, 1 = ≥1 Fixture-Fehler (Details im Report), 2 = Crash.

## Kanonische Test-Accounts

| Rolle | Email | Passwort |
|---|---|---|
| Admin | test-admin@claimondo.de | `Test1234!` |
| Dispatch | test-dispatch@claimondo.de | `Test1234!` |
| Kundenbetreuer | test-kb@claimondo.de | `Test1234!` |
| Kunde | test-kunde@claimondo.de | `Test1234!` |
| Makler | test-makler@claimondo.de | `Test1234!` |
| Kanzlei | test-kanzlei@claimondo.de | `Test1234!` |
| Sachverständiger | test-sv@claimondo.de | `Claimondo-SV-Smoke-2026` |

**Passwort-Grandfathering:** `Test1234!` ist bei den 6 Accounts historisch gültig
(HIBP-Leaked-Password-Schutz blockt es nur bei *neuen* Sets/Resets). test-sv wurde
resettet → **`Claimondo-SV-Smoke-2026`**. Der Provisioner setzt **keine** Passwörter
(kein Reset → kein HIBP-Trip → keine Kollision mit laufenden Smokes).

## Stage-Claims (Seed-Graph)

test-kunde ist auf allen die **geschädigte Partei**. Leads tragen interne
`@claimondo.de`-Identität (test-sv-guard: intern→Test-SV-Buchung erlaubt).

| Claim | `operative_status` | Smokebare Rolle → CTA |
|---|---|---|
| C1 `fbc10001…` | `ersterfassung` | **Dispatch** (assign-from-map, offener Fall) · **Kunde** (Fallakte + 3 Pflichtdok-Slots → Upload) · **Makler** (`makler_id`) |
| C2 `fbc10002…` | `sv-termin` | **SV** (Auftrag `fba00002…`, `technische_stellungnahme_status='angefordert'` → Stellungnahme-CTA #3729) · **KB** (`kundenbetreuer_id`) |
| C3 `fbc10003…` | `kanzlei-uebergeben` | **Kanzlei** (`kanzlei_faelle`-Row) |

test-sv entsperrt: `sachverstaendige 1da11741…` (`gesperrt_grund`/`deaktiviert_am` → null,
`ist_aktiv=true`, `ist_testaccount=true`).

## Roadmap

- **SP2** — Playwright-Golden-Path-Harness, die diese Fixtures je Rolle bis zur CTA fährt.
- **SP3** — Cleanup: die ~50 one-off `scripts/smoke-*.mjs` + stale `scripts/seed-test-data.ts`
  / `scripts/smoke-cj/*` durch die neue Harness ablösen.

Spec: `docs/superpowers/specs/2026-07-07-test-fixtures-provisioner-design.md`
Plan: `docs/superpowers/plans/2026-07-07-test-fixtures-provisioner.md`
