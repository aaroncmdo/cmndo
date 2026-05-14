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

## Diagnose Run 2 (VPS-Inspektion 14.05.2026 21:03 UTC)

Live-Inspektion via `scripts/vps-ssh-exec.py` (Memory-Override `feedback_vps_claude_rolle.md`):

**nginx error.log — bestätigt den Hänger:**
```
20:31:47 — POST /login → upstream prematurely closed connection
20:52:26 — POST /login → upstream timed out (110: Connection timed out)
20:52:27 — POST /login → upstream timed out
20:59:46 — POST /login → upstream timed out
```

**Aber:** in den letzten 3 Minuten (21:00:10 - 21:03:01 UTC) zeigt `nginx access.log` **22 erfolgreiche** POST /login → HTTP **303 (Redirect)** vom selben Staging-Slot. Login funktioniert jetzt also einwandfrei.

**PM2-Logs zeigen die echte Erklärung:** im `error.log` loopt eine `PGRST201`-Exception aus `src/lib/dispatch/karte/get-termine-today.ts` — Supabase findet **vier** mögliche FK-Relationen zwischen `sachverstaendige` und `profiles` und kann nicht eindeutig embedden:

```
[karte] gutachter_termine query failed {
  code: 'PGRST201',
  message: "Could not embed because more than one relationship was found for 'sachverstaendige' and 'profiles'"
}
```

Diese Query läuft in einem Poller mit, der bei jedem Page-Request anstößt — sie blockiert den Node-Event-Loop für mehrere Sekunden pro Request und macht parallele Server-Actions (u.a. den Login) **stumm warten**. Sekundär dazu: ~14× wiederholtes `▲ Next.js 16.2.1 ✓ Ready in 0ms` im out.log → der Slot wurde mehrfach reloaded, jeder Reload triggert Turbopack-JIT-Compile.

**curl direkt auf VPS gegen `127.0.0.1:3001` (nach Recovery):**
- `/api/health` → 0.4s
- GET `/login` → 0.02s
- POST `/login` → 0.04s

Im Recovery-Zustand reagiert der Server sofort, kein Hang, kein nginx-Buffer-Issue.

## Auflösung (korrigiert nach Multi-Session-Inspektion via Hook-Markers)

**Root-Cause:** der PGRST201-FK-Disambiguierungs-Fehler in `src/lib/dispatch/karte/get-termine-today.ts` blockierte den Event-Loop des staging-Slots → POST /login-Server-Actions warteten still im Queue → nginx-Upstream-Timeout. Cold-Start nach PM2-Reload + Turbopack-JIT war die sichtbare Sekundär-Symptomatik, **nicht** der primäre Auslöser.

Über das Hook-Framework (`.claude/hooks/update-session-marker.mjs`) sehe ich die parallele Session `6edcdee7-…`, die den Hotfix bereits angelegt hat: `fix(dispatch-karte): FK-Disambiguierung sachverstaendige→profiles (PGRST201-Loop)` (Commit `bc3924f2`, Branch `kitta/karte-fk-disambig-hotfix`). Der Fix wählt den korrekten FK-Constraint explizit aus.

Sobald der Hotfix auf staging gemerged + der Slot reloaded ist, sollte der Login dauerhaft stabil sein.

**Konsequenz für Smoke-Strategie:** vor jedem Run mind. einen Warmup-Hit (`GET /api/health` + `GET /login`) gegen den Slot fahren — schützt gegen Turbopack-Compile-Latenz, aber das eigentliche Heilmittel ist der FK-Hotfix.

## Befund

**Zwei unabhängige Issues — eines davon mit eingehendem Hotfix:**

1. **Setup-Issue (Run 1, weiterhin offen):** Test-Aaron hat keine bestätigten Termine — selbst bei sauberem Login wäre der Modal-Flow nicht erreichbar
2. **Login-Hänger (Run 2, Root-Cause identifiziert):** PGRST201-Loop in der Dispatch-Karte-Query. Hotfix in Session `6edcdee7-…` (Branch `kitta/karte-fk-disambig-hotfix`, Commit `bc3924f2`) — wartet auf Merge nach staging + PM2-Reload.

## Nächste Schritte

### 1. (Optional) Smoke-Warmup-Hit einbauen

Cold-Start-Edge-Case verhindern. Spec könnte vor dem Login eine kurze Warmup-Sequence fahren:

```ts
await page.goto(`${BASE}/api/health`)
await page.goto(`${BASE}/login`)
// jetzt erst Form-Submit
```

Macht den Smoke robust gegen frische PM2-Reloads, ohne Server-Code zu ändern.

### 2. AAR-911-Setup nachziehen (Setup-Issue, weiterhin offen)

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
