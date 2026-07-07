# Golden-Path Deep-E2E — Design (Ship-Safety P2 / Sub-Projekt 2)

**Goal:** Eine Playwright-Deep-E2E-Harness, die die SP1-Test-Fixtures je Rolle im echten Browser bis zur Kern-CTA fährt — **klicken + Formular absenden + DB-Assert** — und so beweist, dass jede Rollen-Strecke end-to-end funktioniert (nicht nur erreichbar ist). Anker = die stabilen SP1-Stage-Claims.

**Scope:** SP2 der „Voll-Konsolidierung". **Stackt auf SP1** (PR #3804 — liefert `scripts/test-fixtures/`). **SP3** (folgt) konsolidiert die ~50 one-off `scripts/smoke-*.mjs` + stale golden-path-Specs in diese Harness. Deep-E2E für ALLE fixture-gedeckten Rollen (Aaron 07.07.).

## Kontext / Fundament (wir bauen darauf)

- **`tests/e2e/flows/golden-path-prod.spec.ts` existiert** — echtes UI-Login je Rolle (admin/dispatch/kunde/kb/sv), `@claimondo.de`-Guard-bewusst, opt-in (`RUN_GOLDEN_PATH_PROD=1`), serial, nie in CI. Aktuell **shallow** (Rolle landet im Portal + Marker) und erzeugt je Lauf einen frischen Funnel-Lead statt stabiler Fixtures. SP2 vertieft + verankert an Fixtures.
- **`scripts/prod-smoke/cookie.mjs`** (#3688) — `sessionToCookies(session, {projectRef, cookieDomain})`: GoTrue-Session → `sb-<ref>-auth-token` (chunked, `base64-`+base64url(JSON)). Diese Session ohne Login-/2FA-UI zu injizieren wurde diese Session bewiesen (authentifizierte interne Seiten rendern).
- **SP1-Fixtures** (`scripts/test-fixtures/ids.ts`): C1 `fbc10001` @ersterfassung · C2 `fbc10002` @sv-termin + auftrag `fba00002` (sv_id=`1da11741…`, `technische_stellungnahme_status='angefordert'` = SV-CTA #3729) · C3 `fbc10003` @kanzlei-uebergeben; test-kunde=geschädigter überall; 7 Accounts.
- **2FA-Fluss (im Umbruch):** eine Parallel-Session (`eaf5be72`) baut 2FA-TOTP-Test-Infra; test-admin hat `twofa_aktiviert=true`. Cookie-Injection sidesteppt die Login-/2FA-UI → SP2 ist davon unabhängig.

## Architektur (Playwright test-runner, self-contained — **kein shared-file-Touch**)

- **Auth = Cookie-Injection** (nicht das Real-Login der Bestands-Spec): GoTrue password-grant → `sessionToCookies` → `context.addCookies`. Robuster, schneller, 2FA-unabhängig.
- **Context:** pro Rolle ein isolierter Context mit **`serviceWorkers: 'block'`** (BROADCAST-Recipe: frische SW-freie Prod-Bundles) + kein `storageState`. Als Context-Option gesetzt → **kein `playwright.config`-Edit**.
- **Provision-first:** `test.beforeAll` spawnt `npx tsx scripts/test-fixtures/provision.ts` (child_process) → Fixtures auf Kanon zurück vor dem Lauf (deep mutiert sie). **Kein globalSetup-Config-Edit.**
- **Opt-in-Guard:** `test.skip(!process.env.RUN_GOLDEN_PATH_DEEP)` → in CI (kein env) skippen alle → **kein `testIgnore`-Edit nötig** (wie die Bestands-Spec).

### Files (fokussiert)

1. **`tests/e2e/flows/_golden-path-lib.ts`** — shared: `loginContext(browser, role)` (GoTrue-grant + `sessionToCookies` + isolierter SW-blockierter Context), `ROLES` (email/pass/host aus env mit Fixture-Defaults), `serviceClient()` (service-role, wie SP1 `lib.makeClient`), `assertRow(table, id, expected)` (DB-Assert nach UI-Aktion). Re-exportiert Fixture-IDs aus `scripts/test-fixtures/ids.ts`.
2. **`tests/e2e/flows/golden-path-deep-prod.spec.ts`** — die Deep-Flows (serial, opt-in). `beforeAll` = provision.
3. **`tests/e2e/fixtures/test-upload.pdf`** (klein) — für Upload-CTAs (SV-Stellungnahme, Kunde-Pflichtdok).

## Deep-Flows (login → Fixture-Claim → CTA klicken+absenden → DB-Assert)

| Rolle | Claim | Flow | DB-Assert |
|---|---|---|---|
| **SV** (Flagship) | C2 | `/gutachter/fall/{C2}` → Banner „Stellungnahme einreichen" → Upload + Notiz → absenden | `auftraege.{fba00002}.technische_stellungnahme_status='hochgeladen'` |
| Dispatch | C1 | Lead/Claim → SV zuweisen (test-sv) → bestätigen | `claims.{C1}.sv_id` gesetzt / `gutachter_termine` |
| Kunde | C1 | `/kunde/faelle/{C1}` → Pflichtdok-Upload | Pflichtdok-Status / Storage |
| Kanzlei | C3 | Mandat {C3} → Kanzlei-Aktion | `kanzlei_faelle`-Feld |
| KB | C2 | KB-Sicht C2 → KB-Aktion | Claim/Task-Feld |
| Admin | C1/C2 | Admin-Aktion auf Claim | Claim-Feld |

(Makler deferred — braucht makler.id-Refinement aus SP1.)

**Reset zwischen Deep-Flows:** Da die Flows denselben Fixture-Claim mutieren können, ist die Reihenfolge serial + der `provision`-Reset läuft einmal vor allen. Flows, die denselben Claim in einen Endzustand bringen (SV setzt hochgeladen), laufen nach den Flows, die den Ausgangszustand brauchen — ODER re-provisionieren gezielt. Details im Plan.

## Fehlerbehandlung / Residue

Deep mutiert Fixtures; `provision`-upsert resettet die gepinnten Felder je Lauf. Kind-Tabellen-Residue (Dokumente/Timeline/Storage) auf Test-Claims wird **toleriert** (isoliert auf `fb…`-Claims, dokumentiert). Gezieltes Teardown = YAGNI-Follow-up, nur falls Flakiness. Jeder Flow ist ein eigener `test()` → ein fehlschlagender Flow bricht die anderen nicht (Playwright isoliert; serial-Reihenfolge beibehalten).

## Testing / Verifikation

Die Harness IST der Test. Verifikation = ein echter Lauf gegen Prod: `RUN_GOLDEN_PATH_DEEP=1 TEST_SV_PASSWORD=… npx playwright test golden-path-deep-prod --workers=1 --reporter=line` → Flagship SV grün + DB-Assert bestätigt `hochgeladen`. Pure Helfer (`assertRow`-Shape) sind unit-testbar, aber der Kern ist der Live-Lauf.

## Build-Reihenfolge (echte UI-Interaktionen sind fragil → inkrementell)

1. **Framework:** `_golden-path-lib.ts` (loginContext + serviceClient + assertRow) + `beforeAll`-provision + SW-block.
2. **SV #3729 Flagship** — der belegte Wert; verifiziert früh, dass Cookie-Injection an der mfa-gate vorbeikommt.
3. Dann je Rolle ein eigener Flow-Task (Dispatch → Kunde → Kanzlei → KB → Admin).

## Was NICHT dazugehört (YAGNI)

- **CI-Integration** — bleibt opt-in/manuell (wie alle Live-Golden-Paths; Prod-Mutation gehört nie in CI).
- **Makler-Flow** — deferred (makler.id-Refinement).
- **Full-Teardown** der Residue — nur falls nötig.
- **playwright.config-/globalSetup-Änderungen** — bewusst vermieden (self-contained).

## Risiken

- **mfa-gate:** Falls die App eine cookie-injizierte Session für 2FA-pflichtige Rollen trotzdem an die 2FA-Gate schickt → Koordination mit `eaf5be72` (2fa-totp-test-infra). Flagship SV zuerst deckt das früh auf.
- **Selektor-Fragilität:** echte UI-Selektoren (Buttons/Uploads) werden im Plan gegen die echten Client-Komponenten (StellungnahmeClient etc.) verifiziert, nicht geraten.
- **Stack auf SP1:** SP2-Branch off `kitta/test-fixtures-provisioner`; PR nach SP1-Merge auf staging rebasen.
