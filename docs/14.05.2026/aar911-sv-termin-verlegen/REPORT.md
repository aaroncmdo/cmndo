# AAR-911 SV-Termin-Verlegen — Pre-Test-Smoke gegen Staging

**Datum:** 2026-05-14 · **Branch:** staging-HEAD · **Tester:** automatisiert via Playwright (`smoke-staging-sv-termin-verlegen.spec.ts`)

## Kontext

AAR-911 fügt im SV-Portal einen „Termin verlegen"-Button in den `AuftragHeaderPanel` ein. Der Flow:

1. SV öffnet einen bestätigten Termin in `/gutachter/fall/<id>`
2. Klickt „Termin verlegen" → `TerminVerlegenModal` öffnet
3. Modal lädt Top-3-Vorschläge aus dem SV-Verfügbarkeits-Cache
4. SV kann einen Vorschlag wählen **oder** über `<input type="datetime-local">` einen eigenen Slot setzen
5. Optional Grund eintragen (textarea)
6. „Verlegung beantragen" submit
7. Banner „Verlegung beantragt — Bestätigung ausstehend" auf Fall-Detail

## Was getestet

Spec: `tests/e2e/flows/smoke-staging-sv-termin-verlegen.spec.ts` (E2E gegen Staging via Basic-Auth, Login als `aaron.sprafke@claimondo.de` — auf Staging 2FA-frei, Aaron-Freigabe 14.05.2026)

| Schritt | Action |
|---|---|
| 1 | Login als Test-SV |
| 2 | `/gutachter/kalender?view=liste` öffnen |
| 3 | Ersten Fall-Link finden + navigieren |
| 4 | „Termin verlegen"-Button klicken |
| 5 | Eigener Slot via datetime-local (+7 Tage, 10:00) setzen |
| 6 | Grund-Textarea: „Smoke-Test AAR-911 — bitte ignorieren" |
| 7 | „Verlegung beantragen" submit |
| 8 | Banner-Check |

## Ergebnis (Pre-Test-Run gegen Staging)

| Schritt | Erwartung | Ist | Status |
|---|---|---|---|
| 1 Login | Redirect weg von `/login` | OK | ✅ |
| 2 /heute / Post-Login | SV-Layout geladen | OK | ✅ |
| 3 `/gutachter/kalender?view=liste` | Liste mit Fall-Links | **Keine Fall-Links** — Test-SV hat keine Termine | ⚠️ |
| 4-8 | Modal + Submit + Banner | nicht erreicht — Smoke endet bei Schritt 3 mit `[WARN]` | ⏸️ |

Sichtbar in `03-kalender-liste.png` + `03b-keine-faelle.png`: der Test-SV-Account (Test-Aaron) hat keine bestätigten Termine in `/gutachter/kalender`, weshalb das Smoke vor dem eigentlichen Modal-Flow abbricht.

## Befund

**Setup-Issue, kein Code-Bug:** Test-Aaron-Account hat keine Test-Daten. Damit AAR-911 verifiziert werden kann, muss vor dem Smoke ein Test-Auftrag mit bestätigtem Termin für den Test-Aaron-SV existieren.

## Nächste Schritte

- [ ] Test-Auftrag in der Staging-DB anlegen für Test-Aaron (`aaron.sprafke@claimondo.de`):
  - Lead anlegen + zuweisen
  - Termin auf `bestaetigt` setzen
  - Datum in der Zukunft (mind. 24h voraus, damit „Verlegen"-Button aktiv ist)
- [ ] Alternativ: `aar-cj-iter3-smoke` / `cj-smoke-framework`-Seeder ausfuehren — der legt Smoke-Fälle inkl. Termine an (siehe `docs/12.05.2026/cj-smoke-iteration-3/`)
- [ ] Smoke neu fahren — erwartet: Steps 4-8 alle grün, Banner sichtbar

## Hardening der Spec (in diesem Commit gefixt)

Die ursprüngliche Spec hatte hardcoded Default für die **Staging-Basic-Auth-PW** (`ClaimondoSuperuser123789!!`) im Source — der echte Schutz vor öffentlichem Zugriff auf den Staging-Slot. Das ist jetzt entfernt:

- `BASIC_USER` + `BASIC_PASS`: via `requireEnv()`, nur Pflicht wenn Base-URL `.staging.claimondo.de` enthält → wirft sofort bei fehlender ENV
- `SV_PASS`: Default `Test1234!` bleibt — das ist das öffentlich-dokumentierte Test-User-Passwort (siehe Memory `project_e2e_test_users.md`), kein Secret
- `SV_EMAIL`: Default `aaron.sprafke@claimondo.de` — Aarons Test-Konto auf Staging (2FA-frei, Aaron-Freigabe 14.05.2026)
- `BASE`/`PLAYWRIGHT_BASE_URL`: Default `https://app.staging.claimondo.de` (öffentlich)

## Reproduzieren

```bash
STAGING_BASE_URL='https://app.staging.claimondo.de' \
STAGING_BASIC_USER='<basic-user>' \
STAGING_BASIC_PASS='<basic-pw>' \
SV_PASS='<sv-pw>' \
npx playwright test tests/e2e/flows/smoke-staging-sv-termin-verlegen.spec.ts \
  --project=chromium --reporter=list --headed
```

Output landet in diesem Ordner.
