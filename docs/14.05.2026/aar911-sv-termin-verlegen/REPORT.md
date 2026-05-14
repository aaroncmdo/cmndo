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

## Ergebnis Run 1 (vor Login-Diagnose-Erweiterung)

| Schritt | Erwartung | Ist | Status |
|---|---|---|---|
| 1 Login | Redirect weg von `/login` | OK | ✅ |
| 2 /heute / Post-Login | SV-Layout geladen | OK | ✅ |
| 3 `/gutachter/kalender?view=liste` | Liste mit Fall-Links | **Keine Fall-Links** — Test-SV hat keine Termine | ⚠️ |
| 4-8 | Modal + Submit + Banner | nicht erreicht — Smoke endet bei Schritt 3 mit `[WARN]` | ⏸️ |

Sichtbar in `03-kalender-liste.png` + `03b-keine-faelle.png`: der Test-Aaron-Account hatte zum Zeitpunkt des ersten Runs keine bestätigten Termine in `/gutachter/kalender`.

## Ergebnis Run 2 (nach Login-Diagnose-Erweiterung)

In einem späteren Run-Versuch (Spec um Toast-/2FA-Detection erweitert + 8s-Wartepause direkt nach Submit + `02a-direkt-nach-click.png`) zeigt sich ein **zweiter, separater Befund**:

| Schritt | Beobachtung |
|---|---|
| 1 Login | Submit feuert, aber Button steht in `02a-direkt-nach-click.png` (8s nach Click) **immer noch** auf „Wird angemeldet…" — Spinner-Icon. `02-after-login.png` (nochmal 60s+ später) zeigt unverändert dieselbe Login-Page. Kein Toast-Error, kein 2FA-Field. |

**Vermutung:** die Login-Server-Action gegen den Staging-Slot **hängt** oder antwortet sehr langsam für `aaron.sprafke@claimondo.de`. Andere Möglichkeiten:

- Server-Action wirft 500 ohne Toast-Pipe
- Auth-Cookie wird gesetzt aber Client-Redirect-Trigger fehlt
- nginx-Buffer-Issue (Memory `feedback_nginx_proxy_buffer.md` — 502 auf POST /login bei zu kleinem `proxy_buffer_size`)

## Befund

**Zwei unabhängige Issues blockieren den Smoke:**

1. **Setup-Issue (Run 1):** Test-Aaron hat keine bestätigten Termine — selbst bei sauberem Login wäre der Modal-Flow nicht erreichbar
2. **Login-Latenz/Hänger (Run 2):** der Login geht nicht mehr durch — Spinner-Stuck. Diagnose-Schritte:
   - VPS PM2-Logs für `claimondo-v2-staging` (nach `[POST /login]`-Einträgen)
   - nginx `error.log` auf „upstream sent too big header" o.ä.
   - Sentry Server-Project nach Login-Action-Fehlern für die letzten Minuten
   - Direkter `curl -i` gegen `https://app.staging.claimondo.de/login` mit Basic-Auth + Form-Body um zu sehen ob die Action-URL überhaupt antwortet

## Nächste Schritte

### 1. Login-Hänger zuerst lösen (blockiert alles)

- [ ] VPS-Logs auswerten: `ssh aaron@212.132.119.110 'pm2 logs claimondo-v2-staging --lines 200 --nostream'` + nach `[POST /login]` filtern
- [ ] nginx-Logs: `sudo tail -200 /var/log/nginx/error.log` auf dem VPS — Memory `feedback_nginx_proxy_buffer.md` warnt vor 502 bei zu kleinem `proxy_buffer_size`
- [ ] Sentry Server-Project auf Login-Action-Fehler der letzten Stunde prüfen
- [ ] Falls nginx-Buffer schuld: PR mit `proxy_buffer_size 32k; proxy_buffers 8 32k;` für `app.staging.claimondo.de`-vhost
- [ ] Falls Server-Action selbst hängt: lokal mit echten Staging-DB-Creds reproduzieren

### 2. Sobald Login wieder geht — AAR-911-Setup nachziehen

- [ ] Test-Auftrag in der Staging-DB anlegen für Test-Aaron (`aaron.sprafke@claimondo.de`):
  - Lead anlegen + zuweisen
  - Termin auf `bestaetigt` setzen
  - Datum in der Zukunft (mind. 24h voraus, damit „Verlegen"-Button aktiv ist)
- [ ] Alternativ: `aar-cj-iter3-smoke` / `cj-smoke-framework`-Seeder ausfuehren — der legt Smoke-Fälle inkl. Termine an (siehe `docs/12.05.2026/cj-smoke-iteration-3/`)
- [ ] Smoke neu fahren — erwartet: Steps 1-8 alle grün, Banner sichtbar

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
