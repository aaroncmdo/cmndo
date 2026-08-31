# Test-Fixtures-Provisioner — Design (Ship-Safety P2, Sub-Projekt 1)

**Goal:** Ein idempotenter, on-demand ausführbarer Provisioner, der den kanonischen Test-Zustand auf Prod **garantiert** — die 7 Test-Accounts (Rolle/Status/Login-bar) + einen kohärenten Stage-Claim-Seed-Graph, sodass jede Rolle bis zu ihrer Kern-CTA smokebar ist. Erneutes Ausführen stellt den Soll-Zustand wieder her → **drift-fest**.

**Scope:** SP1 der „Voll-Konsolidierung" (Aaron 07.07.: Kanon-Provisioner + Golden-Path-Harness + Cleanup, P2+P3 verschmolzen). SP1 = die Fixtures-Grundlage, die alles konsumiert. **SP2** = Playwright-Golden-Path-Harness, die diese Fixtures fährt. **SP3** = Löschen/Merge der ~50 one-off `smoke-*.mjs` + stale Seeds. Jedes SP eigener Spec→Plan→Build-Zyklus.

## Problem / Kontext (Ist-Zustand, verifiziert 07.07.)

Die Test-Infra ist fragmentiert & gedriftet:
- `scripts/seed-test-data.ts` (KFZ-191) läuft noch auf **CMM-49-gedroppte `faelle`** + seedet **legacy user-ids** (dab47d30…), nicht die kanonischen `test-*@claimondo.de`-Accounts; hardcoded Passwort trippt HIBP.
- Weitere überlappende Seeds: `scripts/smoke-cj/seed-*.mjs`, `scripts/e2e-seed-fixtures.mjs`, `scripts/seed-staging-test-users.mjs` — kein gepflegter Single-Source-of-Truth.
- ~50 one-off `scripts/smoke-*.mjs` / `probe-*.mjs` (Graveyard).
- **test-sv@** ist gesperrt (`sachverstaendige`-Ebene, nicht `profiles.aktiv`) + hat 0 auftraege → SV-Flows (z. B. Stellungnahme-CTA #3729) NICHT live-smokebar.
- Passwörter teils gedriftet (<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD> HIBP-blockiert bei Reset; grandfatherte Accounts behalten es).

**`test-sv-guard.ts`** ist bewusste Laufzeit-Isolation am Buchungs-Chokepoint: blockt intern/Test-Lead→echter SV UND echter Kunde→Test-SV (Matrix in `entscheideTestSvGuard`). Intern→Test & Echt→Echt laufen durch. ⇒ Ein Test-SV ist nur buchbar, wenn der Lead **interne Identität** (`istInterneIdentitaet(email,name)`, z. B. `@claimondo.de`) trägt. Der Seed-Graph muss das respektieren.

## Architektur

`scripts/test-fixtures/` — **tsx + service-role-Client**, idempotenter `upsert` auf **stabilen Test-UUIDs**. **Kein DDL** (Regel 2 n/a — reuse bestehender Tabellen/Flags: `sachverstaendige.ist_testaccount`, `claims`, `claim_parties`, `auftraege`, `leads`, `gutachter_termine`, `pflichtdokumente`). Läuft on-demand gegen Prod (wie prod-smoke #3688):
```
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/test-fixtures/provision.ts [--dry-run]
```

**Design-Prinzip — nur Test-IDs, nie echte Entitäten:** Alles läuft über stabile, reservierte Test-UUIDs. Non-Test-Prod-Zeilen werden nie gelesen-zum-Schreiben oder angefasst. `upsert` auf fixe IDs → N-faches Ausführen = identischer Zustand, kein Duplikat.

### Komponenten (kleine, fokussierte Files)

1. **`ids.ts`** — alle stabilen Test-UUIDs als benannte Konstanten (Accounts, 3 Stage-Claims, deren Leads/Auftraege/Termine/Parties). Single-Source-of-Truth für Idempotenz; auch von SP2 (Harness) importierbar.

2. **`accounts.ts`** — `ensureAccounts(db)`: stellt die 7 Accounts sicher.
   - profiles-Row je Rolle vorhanden + `aktiv=true` (upsert auf bekannter ID).
   - `sachverstaendige`-Row für test-sv: `ist_testaccount=true`, **entsperrt**, verifiziert, buchbar (die konkreten Sperr-/Verifiziert-Spalten werden im Plan verifiziert).
   - **Passwort-Strategie (grandfathering):** funktionierende <PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>-Accounts NICHT anfassen (kein Reset → kein HIBP-Trip → keine Kollision mit den ~laufenden Session-Smokes). Nur test-sv (gedriftet) → ein dokumentierter Stark-Wert via `auth.admin.updateUserById`. Passwörter zentral in `README.md`.

3. **`seed-graph.ts`** — `ensureSeedGraph(db)`: die kanonischen Stage-Claims (idempotenter upsert), **test-kunde = geschädigter** (`claim_parties.user_id = <test-kunde>`, `rolle='geschaedigter'`) auf allen, Leads mit interner Identität (guard-konform):
   - **C1 @ `ersterfassung`** → **Dispatch** (assign-from-map: offener Lead) · **Kunde** (Fallakte + `pflichtdokumente`-Slots = Upload-CTA) · **Makler** (Attribution).
   - **C2 @ `sv-termin`** + `auftraege(sv_id=<test-sv-SV-id>, typ, status, technische_stellungnahme_status='angefordert')` + `gutachter_termine`(bestätigt) → **SV-CTA #3729** · **KB** (Zuweisung).
   - **C3 @ `kanzlei-uebergeben`** + Kanzlei-Mandat → **Kanzlei-Portal**.
   - (Admin sieht alles — kein eigener Seed.)

4. **`provision.ts`** — Orchestrator: `ensureAccounts` → `ensureSeedGraph`. `--dry-run` zählt Soll-Ist ohne Writes. Pro Schritt Result-Log; ein Fehler bricht den Rest **nicht** (continue + Sammel-Report am Ende), damit ein einzelner Seed-Fail nicht den ganzen Provisioner blockt.

5. **`README.md`** — kanonischer Soll-Zustand (Accounts + IDs + Passwörter), Run-/Dry-Run-Anleitung, Verweis auf SP2/SP3.

## Fehlerbehandlung
Jeder Ensure-Schritt fängt seinen Fehler, loggt `[ok]/[skip]/[fail] <entity>` und sammelt Fails. `provision.ts` gibt am Ende Exit≠0 bei ≥1 Fail (für spätere CI-Nutzung), aber führt alle Schritte aus. Kein `throw` das den Provisioner mitten abbricht.

## Testing
- **`--dry-run`** gegen Prod: zählt fehlende/vorhandene Fixtures ohne Writes (Soll-Ist-Diff).
- **Nach Lauf:** READ-Verifikation — die 7 Accounts login-bar (Account-Zustand), die 3 Stage-Claims + ihre Entities (auftraege.technische_stellungnahme_status='angefordert', Pflichtdok-Slots, Mandat) per Query bestätigt.
- **Idempotenz-Test:** 2× ausführen → 2. Lauf meldet alles `[skip]`, keine Duplikate.
- Reine Hilfsfunktionen (z. B. UUID-Konstanten-Vollständigkeit, guard-konforme Lead-Identität) unit-testbar.

## Verifizierte Fakten (Prod 07.07., für writing-plans)
- **7 Account-IDs:** admin `bdfe432b-250e-4dec-8bdd-f5d6ac04d910`, dispatch `7b0787fb-2da1-4f61-aa79-1e56a6d32bf2`, kanzlei `bbbb1111-0000-4000-8000-000000000010`, kb `59bdb155-e283-4fd1-a4ca-222f924a0efa`, kunde `113aebe5-0630-4753-809a-6756df5ba432`, makler `bbbb2222-0000-4000-8000-000000000020`, sv `25a8c28e-b85a-4769-94d4-920e47f64079`.
- **`claims.operative_status`-Werte (Ist):** `ersterfassung`, `sv-termin`, `kanzlei-uebergeben`, `abgeschlossen`.
- **`claim_parties`:** id, claim_id, `rolle` (text, 'geschaedigter'), **`user_id`** (Party-Link, NICHT email), quelle.
- **`auftraege`:** id, `sv_id` (→ sachverstaendige.id), typ, status, claim_id, `technische_stellungnahme_status`.
- **`leads`:** id, vorname, nachname, email, status (enum).
- **`profiles`** hat KEIN `ist_testaccount`/Sperr-Feld → Test-/Sperr-Flags liegen auf `sachverstaendige` (Link-Spalte ist NICHT `user_id` — im Plan auflösen: sachverstaendige.id ↔ test-sv).

## Was NICHT dazugehört (YAGNI / spätere SPs)
- **SP2** Playwright-Golden-Path-Harness (fährt die Fixtures bis zur CTA je Rolle) — eigener Zyklus.
- **SP3** Löschen/Merge der ~50 one-off `smoke-*.mjs` + stale `seed-test-data.ts`/`smoke-cj` — eigener Zyklus.
- **Kein CI-Auto-Run** (on-demand reicht; CI-Integration optionaler Folge-Schritt, Exit-Code ist dafür schon vorbereitet).
- **Keine neuen DDL/Marker-Tabellen** — bestehende Flags reichen.
