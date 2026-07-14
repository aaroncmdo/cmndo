# Regel-4 E2E-/Prod-Smoke grün bekommen — TOTP-Secrets + Test-Accounts

**Status 14.07.2026:** Der post-merge-E2E-Job **läuft**, aber **alle Tests mit internen Rollen
(admin/kb/dispatch/sv) SKIPPEN** — es fehlen die TOTP-Secrets. Das ist der Grund, warum „Regel 4"
(grüner Prod-Playwright-Smoke) aktuell für keine interne-Rollen-Seite erfüllbar ist. Diese Checkliste
schließt die Lücke. **Nur Aaron kann Schritt 1 + 3 machen** (Secrets/Accounts); Schritt 2 (CI-Wiring)
ist bereits erledigt.

## Warum es skippt (Ursache)

1. Interne Rollen haben seit #3745 **2FA-Pflicht**. `_golden-path-lib.ts` macht Password-Grant → aal1,
   und schließt MFA **nur** ab, wenn ein `TEST_<ROLE>_TOTP_SECRET` (base32) im Env liegt
   (`completeMfa()` → challenge → verify mit frisch gerechnetem TOTP-Code → aal2).
2. Ohne das Secret bleibt die Session **aal1** → die Seite zeigt die Auth-Wall → `skipIfAuthWall()`
   ruft `test.skip()`. Ergebnis: **grün-aussehender Run, aber 0 echte Assertions** = kein Smoke.
3. Der E2E-Job läuft bewusst **nur post-merge** (`ci.yml`: `if: github.event_name != 'pull_request'`),
   gegen den **deployten** Stand (`PLAYWRIGHT_BASE_URL: https://app.claimondo.de`). Auf PRs skippt er
   per Design (sonst dauerrot bei 13 Parallel-Sessions).

## Was der E2E-Job VORHER hatte vs. jetzt

`.github/workflows/ci.yml` (E2E-Job `env:`) hatte nur `TEST_ADMIN_PASSWORD` + `TEST_SV_*` — **kein
TOTP, nichts für KB/Dispatch**. Dieser PR ergänzt das **TOTP-Passthrough** (echter no-op solange die
Secrets leer sind — `undefined` → MFA-Skip):

```
TEST_ADMIN_TOTP_SECRET, TEST_KB_TOTP_SECRET, TEST_DISPATCH_TOTP_SECRET, TEST_SV_TOTP_SECRET
```

## Checkliste zum Grün-Schalten

### Schritt 1 — GitHub-Repo-Secrets setzen (nur Aaron)
`Repo → Settings → Secrets and variables → Actions → New repository secret`. Pro interner Rolle das
**base32-TOTP-Secret** des verifizierten Authenticator-Faktors des Test-Accounts:

| Secret | für |
|---|---|
| `TEST_ADMIN_TOTP_SECRET` | test-admin@claimondo.de |
| `TEST_KB_TOTP_SECRET` | test-kb@claimondo.de |
| `TEST_DISPATCH_TOTP_SECRET` | test-dispatch@claimondo.de |
| `TEST_SV_TOTP_SECRET` | test-sv@claimondo.de |

**Nur die TOTP-Secrets** — die Passwörter werden für KB/Dispatch **bewusst NICHT** durchgereicht.
Grund: ein unbesetztes GitHub-Secret rendert als leerer String `''`, und `_golden-path-lib.ts` nutzt
`?? 'Test1234!'` (nullish) — das fängt `''` **nicht** ab, würde den Default also überschreiben und den
Login trotz gesetztem TOTP scheitern lassen. Ohne Passthrough greift der grandfatherte Default
`Test1234!`. → **Die Prod-Test-Accounts müssen das Passwort `Test1234!` haben** (admin/sv nutzen die schon
oben in ci.yml verdrahteten `TEST_ADMIN_PASSWORD`/`TEST_SV_PASSWORD`). Weicht ein KB/Dispatch-Passwort ab,
sag mir Bescheid — dann verdrahte ich es sauber mit `|| 'Test1234!'`-Fallback statt `??`.
E-Mails sind in `ROLES` hardcodet (`test-<rolle>@claimondo.de`).

### Schritt 2 — CI-Passthrough (✅ erledigt in diesem PR)
`ci.yml` reicht die Secrets jetzt an den E2E-Job durch. Sobald Schritt 1 gesetzt ist, greift es
automatisch — **kein weiterer Code-Change nötig.**

### Schritt 3 — Prod-Test-Accounts + TOTP-Faktoren verifizieren (nur Aaron)
⚠ Der **Prod-Go-Live-Cleanup vom 13.07.** hat 157 Test-Accounts gelöscht. Vor dem Grün-Schalten prüfen,
dass es auf **Prod** noch gibt:
- `test-admin@ / test-kb@ / test-dispatch@ / test-sv@claimondo.de` (in `auth.users`),
- je einen **verifizierten TOTP-Faktor** (`auth.mfa_factors`, `status='verified'`), dessen base32-Secret
  == das GitHub-Secret aus Schritt 1,
- die passenden `profiles.rolle` + Portalzugang.
Fehlt ein Account/Faktor → neu anlegen + Authenticator einrichten, dann das base32-Secret als GitHub-Secret
hinterlegen. **Test-Accounts immer `telefon = NULL`** (keine echten SMS/WA/Mails).

### Schritt 4 — verifizieren
Nach dem nächsten Merge auf staging/main den E2E-Job in Actions öffnen → die
`portal-header-phase2.spec.ts`-Zeilen dürfen **nicht** mehr „skipped" sein, sondern **passed**. Erst dann
ist Regel 4 für die migrierten admin/kb/dispatch-Seiten wirklich erfüllt.

## Betroffene Specs (profitieren sofort)
Alle internen-Rollen-Smokes, u.a.: `portal-header-phase2.spec.ts` (dieser Portal-Header-Sweep),
`pageheader-floating-card.spec.ts`, `2fa-*.spec.ts`, `admin-nachrichten.spec.ts`, `lead-to-fall.spec.ts` …
— sie alle skippen heute an derselben Wurzel.
