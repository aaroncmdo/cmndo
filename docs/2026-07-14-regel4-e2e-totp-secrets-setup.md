# Regel-4 E2E-/Prod-Smoke: warum er skippte, was jetzt erledigt ist, was noch fehlt

**Stand 14.07.2026 (nach Umsetzung).** Der post-merge-E2E-Job lief zwar, aber **alle Tests mit internen
Rollen (admin/kb/dispatch/sv) SKIPPTEN** — er war *vakuum-grün*: 0 echte Assertions. Ursache gefunden,
Credentials-Seite komplett erledigt. Was noch fehlt, steht unten.

## Die Ursache (zwei unabhängige Defekte, beide bestätigt)

1. **`ci.yml` reichte die TOTP-Secrets nie durch.** Die Secrets `TEST_{ADMIN,KB,DISPATCH,SV}_TOTP_SECRET`
   **existierten** im Repo (gesetzt 07.–08.07.), waren aber **nicht** im `env:`-Block des E2E-Jobs. Ohne sie
   bleibt der Login **aal1** → interne 2FA-Pflicht (#3745) → Auth-Wall → `skipIfAuthWall()` → `test.skip()`.
2. **Die Prod-Test-Accounts existierten nicht mehr.** Der Go-Live-Cleanup vom **13.07.** hat sie gelöscht
   (157 Test-Accounts via `auth.admin.deleteUser`). Damit waren die vorhandenen TOTP-Secrets **verwaist** —
   sie zeigten auf MFA-Faktoren gelöschter User.

## ✅ Erledigt (14.07.)

- **Accounts neu angelegt** auf Prod (`paizkjajbuxxksdoycev`): `test-admin@`, `test-kb@`, `test-dispatch@`,
  `test-sv@claimondo.de` — Passwort `Test1234!`, `email_confirm` (⇒ **keine** Mail verschickt),
  **`telefon = NULL`** (⇒ keine echten SMS/WhatsApp), Rollen `admin` / `kundenbetreuer` / `dispatch` /
  `sachverstaendiger`. SV zusätzlich mit `sachverstaendige`-Row (`ist_testaccount=true`,
  `portal_zugang_freigeschaltet=true`, **ohne Geo/Isochrone** ⇒ bleibt aus dem Live-Dispatch raus).
- **TOTP-Faktoren frisch enrollt + verifiziert** (je genau 1 `totp:verified` pro Account).
- **GitHub-Secrets neu gesetzt**: `TEST_{ADMIN,KB,DISPATCH,SV}_TOTP_SECRET` + `TEST_ADMIN_PASSWORD`,
  `TEST_SV_PASSWORD`, `TEST_SV_EMAIL`. (`kb`/`dispatch` brauchen **kein** Passwort-Secret — sie fallen in
  `_golden-path-lib` sauber auf den Default `Test1234!` zurück. Ein Passwort-**Passthrough** wäre hier sogar
  schädlich: ein unbesetztes Secret rendert als `''`, und `?? 'Test1234!'` fängt `''` **nicht** ab.)
- **Beweis erbracht:** exakt der `_golden-path-lib`-Flow (password-grant → Challenge → TOTP-Verify) liefert
  für **4/4 Rollen** eine **`aal2`**-Session. Damit ist die Skip-Ursache beseitigt.
- **`ci.yml`-Passthrough** der 4 TOTP-Secrets ergänzt (in diesem PR).

## ⚠ Was noch fehlt — und warum der Smoke trotzdem erst mal ROT wird

Der E2E-Job testet gegen **`PLAYWRIGHT_BASE_URL: https://app.claimondo.de` = PROD**. Aber:

> **`main` (= Prod) hängt ~983 Commits hinter `staging`.**

Heißt: Die Features der letzten Wochen — inklusive der Portal-Header-Migration (#4230) — sind **nicht live**.
Sobald der TOTP-Passthrough greift, **laufen** die bisher skippenden Tests endlich wirklich — und melden dann
korrekt **ROT**, weil das getestete Prod die Features noch nicht hat.

**Das ist kein Regress, sondern die Wahrheit, die die Skips bisher verdeckt haben.** Vorher war der Smoke
grün, weil er nichts tat. Jetzt tut er was — und sagt, dass Prod hinterherhängt.

**Damit Regel 4 wirklich grün wird, braucht es beides:**
1. ✅ funktionierende Credentials (erledigt, s. o.) **und**
2. ⬜ **den Code auf Prod** → `staging` → `main` promoten (Release-Lane). Das ist eine Release-Entscheidung
   (983 Commits), keine Session-Aufgabe.

## Konsequenz-Warnung für die Release-/CI-Lane
Nach dem Merge dieses PRs werden **~dutzende bisher skippende E2E-Tests aktiv** und laufen gegen das alte
Prod. Rechne mit roten post-merge-E2E-Runs, bis Prod nachgezogen ist. Der E2E-Job ist laut `ci.yml` bewusst
**informativ** (`gated NICHT den Deploy`) — es blockt also nichts, es ist nur endlich ehrlich.

## Wartung
Die TOTP-Secrets sind an die **konkreten MFA-Faktoren** dieser vier Prod-User gebunden. Wird ein Account
gelöscht (z. B. beim nächsten Go-Live-Cleanup) oder sein Faktor entfernt, **verwaisen die Secrets erneut** und
alles skippt wieder still. Test-Accounts also von künftigen Cleanups **ausnehmen** — oder danach neu
provisionieren (Faktor löschen → neu enrollen → Secret neu setzen).
