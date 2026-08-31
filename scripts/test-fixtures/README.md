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

Stand **20.08.2026** — jede Zeile ist ein echter Browser-Login gegen `app.claimondo.de`,
nicht abgeschrieben:

| Rolle | Email | Passwort | Landet auf |
|---|---|---|---|
| Admin | test-admin@claimondo.de | `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` | `/admin` |
| Dispatch | test-dispatch@claimondo.de | `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` | `/dispatch/dashboard` |
| Kundenbetreuer | test-kb@claimondo.de | `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` | `/mitarbeiter` |
| Kunde | **smoke**-kunde@claimondo.de | `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` | `/kunde` |
| Makler | test-makler@claimondo.de | *unbekannt* (s. u.) | — |
| Kanzlei | test-kanzlei@claimondo.de | `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` | `/kanzlei/mandate` |
| Sachverständiger | test-sv@claimondo.de | `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` | `/gutachter/heute` |

⚠ **Die frühere Angabe „`<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` ist bei den 6 Accounts historisch gültig" ist
widerlegt.** Sie gilt nur noch bei **test-dispatch@** — bei allen anderen scheitert der
Login. Ebenso ist das hier notierte `Claimondo-SV-Smoke-2026` für test-sv nicht mehr
gültig. Die Konten wurden offenbar gezogen, als GoTrue `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` per
pwned-Password-Policy ablehnte; die Doku ist nicht mitgewandert.

⭐ **Die eine Ausnahme (dispatch) wurde zur Regel verallgemeinert** — in `fixtures.ts`,
in `_golden-path-lib.ts` und in vier weiteren Specs stand `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` als Default für
*alle* Rollen. Wer eine Sonderregel abschreibt, schreibt oft die Sonderregel ab.

⚠ **test-makler@**: Das Konto existiert (bestätigt, letzter Login 15.07.), aber weder
`<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` noch `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` greifen. Das Passwort ist unbekannt — hier steht bewusst
*unbekannt* statt eines geratenen Werts, damit die nächste Suche nicht in die Irre läuft.

⚠ **test-kunde@ existiert nicht mehr** (Golive-Accounts-Cleanup, 17.07.). Das Kunden-Konto
ist **smoke-kunde@**. Alle sechs Konten haben `telefon = NULL` → ein Smoke löst keine
echten SMS/WhatsApp aus (Regel 4).

Der Provisioner setzt **keine** Passwörter (kein Reset → kein HIBP-Trip → keine Kollision
mit laufenden Smokes). Verbindliche Quelle für Test-Credentials in `tests/e2e` ist
`tests/e2e/flows/_golden-path-lib.ts` (`ROLES`) — neue Specs importieren von dort, statt
eigene Defaults zu schreiben.

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
