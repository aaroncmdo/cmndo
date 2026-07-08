# 2FA optional + Passwordless Telefon-Login — Redesign

**Datum:** 2026-07-08
**Branch:** `kitta/2fa-optional-phone-login` (Worktree, Base `origin/staging`)
**Status:** Design — wartet auf Aaron-Review vor writing-plans
**Trigger:** Das 2FA-Hardening von heute (AAR-audit-2fa, "F3") hat Aaron (und faktisch alle internen Rollen) aus den Admin-Portalen ausgesperrt.

---

## 1. Problem

Zwei getrennte, aber verwandte Baustellen:

1. **2FA sperrt aus.** F3 machte 2FA fuer die internen Rollen `{admin, dispatch, kanzlei, kundenbetreuer}` **verpflichtend + nicht ueberspringbar**. Aarons Admin-Account (`lupus.674music@gmail.com`) hat **keinen MFA-Faktor** — der Login zwingt ihn deshalb in einen Enroll, der nur per SMS geht und in einer Sackgasse endet. Der Screen sagt "Code aus der 2FA-App", obwohl gar keine Authenticator-App existiert (es ist der SMS-Flow). Betrifft auch Nicolas (admin) + dispatch@.
2. **Telefon-Login funktioniert nicht "sauber".** Der passwordless Login per Handynummer (`signInWithOtp({phone})`) findet den Account nicht.

## 2. Root Causes (verifiziert gegen prod = `origin/main` + DB)

- **Enforcement an 3 Stellen** (nicht nur Middleware):
  - `src/app/login/actions.ts` → `entscheideLoginRouting` mit `rollePflicht` → `'enroll'`.
  - `src/app/login/2fa/page.tsx` → `pflicht = istZweiFaktorPflicht(rolle)` → `<TwoFaClient mode="enroll" mandatory>`.
  - `src/lib/auth/portal-guard.ts` → `requirePortalAccess`: `if (!isGoogleUser && istZweiFaktorPflicht(rolle) && !hatVerifiziertenFaktor(user.factors)) redirect('/login/2fa')`.
  - Die **Middleware** (`src/lib/supabase/middleware.ts`) laesst faktor-lose User dagegen durch (`entscheideMfaGate`: `!hasVerifiedFactor → 'allow'`). Der Zwang kommt also rein aus den 3 Rollen-Lesern.
- **Telefon-Login:** `supabase.auth.signInWithOtp({phone})` loest die Nummer gegen **`auth.users.phone`** auf. Die App speichert Nummern aber in **`profiles.telefon`** — `auth.users.phone` ist bei fast allen leer (nur 2 Accounts haben `phone_confirmed_at`). Darum "kein User mit dieser Nummer". Zusaetzlich teilen sich **18 Accounts** die Nummer `+4915562740016` (Test-Accounts) → Supabase erzwingt Eindeutigkeit von `auth.users.phone`.
- **SMS + TOTP funktionieren** (DB: heute 3 verifizierte TOTP-Faktoren via Settings, gestern 1 Phone-Faktor). Der Lockout kam NICHT von totem SMS-Versand, sondern vom erzwungenen SMS-Enroll ohne funktionierenden Ausgang.

## 3. Entscheidungen (Aaron, 2026-07-08)

| Frage | Entscheidung |
|---|---|
| Strenge | **2FA komplett optional / opt-in** (F3-Pflicht raus) |
| Methoden | Nutzer waehlt **TOTP-App ODER SMS-Nummer**, einmalig konfiguriert, kein erneutes Nummer-Eingeben beim Login |
| Erst-Login | 2FA **anbieten** (ueberspringbar), nicht erzwingen |
| Telefon-Login "Bedeutung" | **Passwordless Login per Handynummer** (eigener Login-Weg, ohne Passwort) |
| Telefon-Login-Scope | **Fuer alle Rollen** erlaubt (inkl. admin/dispatch) — Single-Faktor akzeptiert |
| Rollout | **Erst ganzes Design, dann alles bauen** — KEIN separater Emergency-Deploy |

## 4. Design — 3 trennbare Bausteine

### Baustein 0 — Pflicht raus, 2FA opt-in (= permanenter Lockout-Fix)

Entferne die F3-Pflicht an allen 3 Enforcement-Stellen; behalte die faktor-basierte Challenge (wer 2FA aktiviert HAT, wird beim Login gefordert):

- `mfa-gate.ts`:
  - `entscheideLoginRouting` → `rollePflicht`-Branch entfernen. Neu: `hasVerifiedFactor ? 'challenge' : 'portal'` (Legacy-`twofa_aktiviert`-Enroll-Zwang ebenfalls raus; Aktivierung passiert in Settings, nicht erzwungen am Login).
  - `entscheideMfaGate` bleibt unveraendert (`!hasVerifiedFactor → 'allow'`).
  - `istZweiFaktorPflicht` bleibt als Funktion erhalten, wird aber nur noch fuer einen **weichen Nudge** genutzt (Banner "2FA empfohlen"), nicht als harte Schranke.
- `login/2fa/page.tsx` → `pflicht`-Enroll-Branch entfernen. Kein Faktor + kein Legacy-Flag → `redirect(finalTarget)` (schon vorhanden). TOTP/Phone-Challenge bleibt.
- `portal-guard.ts` → den F3-`redirect('/login/2fa')`-Block ersatzlos entfernen. `force_password_change` + Rollen-Check bleiben.

**Ergebnis:** Kein erzwungener Enroll mehr. Admin ohne Faktor → direkt ins Portal. Wer 2FA aktiviert hat → wird beim Login gefordert. **Sperrt niemanden mehr aus.**

### Baustein 1 — 2FA opt-in konfigurieren (in `KontoSicherheitPanel`)

`src/components/auth/KontoSicherheitPanel.tsx` existiert bereits (Trusted-Device-Arbeit, in allen `*/konto`-Seiten eingebunden). Dort einen 2FA-Abschnitt ergaenzen:

- **"2FA aktivieren"** → Methodenwahl:
  - **Authenticator-App (TOTP)** — `supabase.auth.mfa.enroll({ factorType: 'totp' })` → QR + Secret anzeigen → 1x Code bestaetigen (`challenge` + `verify`) → Faktor `verified`. Offline, keine SMS-Abhaengigkeit → **empfohlene Default-Methode**.
  - **SMS an Handynummer** — Nummer bestaetigen (`mfa.enroll({ factorType: 'phone', phone })` → SMS → `verify`). Nummer wird als Faktor gespeichert **und** (Baustein 2) nach `auth.users.phone` gesynct.
  - Beide gleichzeitig moeglich (TOTP primaer + SMS-Fallback — die `waehleZweitFaktor`-Logik + `TotpChallengeClient` "Stattdessen SMS" existieren schon). Faktor jederzeit entfernbar.
- **Login-Challenge (bestehender Faktor):** unveraendert — `login/2fa/page.tsx` rendert `TotpChallengeClient` (App-Code) bzw. `TwoFaClient mode="challenge"` (Auto-SMS an die **gespeicherte** Nummer, kein erneutes Eingeben). "Diesem Geraet vertrauen (30 Tage)" bleibt.
- **Erst-Login-Nudge:** nach `force_password_change` (`/passwort-aendern`) optional ein "2FA einrichten?"-Schritt, **ueberspringbar** → Portal. (Reines UX-Add-on, kein Zwang.)

Server-Actions fuer enroll/verify liegen groesstenteils schon in `src/lib/auth/twofa/mfa.ts` (`enrollePhoneFaktor`, `challengePhoneFaktor`, `verifyPhoneFaktor`) — TOTP-Pendants ergaenzen.

### Baustein 2 — Passwordless Telefon-Login (sauber, alle Rollen)

- **Root-Fix:** die verifizierte Nummer nach `auth.users.phone` schreiben (verifiziert), damit `signInWithOtp` sie aufloest. Via Admin-API `supabase.auth.admin.updateUserById(id, { phone, phone_confirm: true })` — ausgeloest, wenn der User seine Nummer bestaetigt (in der 2FA-SMS-Einrichtung ODER einem dedizierten "Login per Handynummer aktivieren"-Toggle im KontoSicherheitPanel).
- **Eindeutigkeit erzwingen:** eine Nummer = ein Account. Beim Setzen pruefen, ob die Nummer schon auf einem anderen `auth.users.phone` liegt → ablehnen mit klarer Meldung.
- **LoginClient** (`src/app/login/LoginClient.tsx`) hat den `telefon`-Tab bereits (`signInWithOtp({ phone, shouldCreateUser: false })` → `verifyOtp({ phone, token, type: 'sms' })`). Sobald `auth.users.phone` gefuellt ist, funktioniert er. Fuer **alle Rollen**.
- **Interaktion mit 2FA:** Ein erfolgreicher Telefon-Login erzeugt eine `aal1`-Session. Hat der Account **zusaetzlich** einen separaten MFA-Faktor, wuerde die Middleware danach challengen. Da 2FA optional ist, haben die meisten Telefon-Login-Nutzer keinen zusaetzlichen Faktor → direkt ins Portal. Der seltene Fall (Telefon-Login **und** separater TOTP-Faktor) ist ein dokumentierter Sonderfall (die Nummer selbst ist bereits der Besitz-Nachweis).

## 5. Betroffene Files

| File | Aenderung |
|---|---|
| `src/lib/auth/mfa-gate.ts` | `entscheideLoginRouting` Pflicht/Legacy-Enroll raus; `istZweiFaktorPflicht` → nur Nudge |
| `src/app/login/actions.ts` | Pflicht-Routing raus (folgt aus mfa-gate) |
| `src/app/login/2fa/page.tsx` | `pflicht`-Enroll-Branch raus |
| `src/lib/auth/portal-guard.ts` | F3-`redirect('/login/2fa')`-Block raus |
| `src/components/auth/KontoSicherheitPanel.tsx` | 2FA-Methodenwahl (TOTP/SMS) + Telefon-Login-Toggle |
| `src/lib/auth/twofa/mfa.ts` | TOTP-enroll/verify ergaenzen; Nummer→`auth.users.phone`-Sync |
| `src/app/login/LoginClient.tsx` | Telefon-Tab bleibt; ggf. Fehlermeldungen schaerfen |
| (Migration/Script) | `auth.users.phone`-Sync + 18-Nummer-Bereinigung |

## 6. Daten

- **`auth.users.phone`-Sync:** fuer Accounts mit verifizierter, **eindeutiger** Nummer die `profiles.telefon` → `auth.users.phone` (confirmed) uebernehmen (nur bei aktivem Telefon-Login-Opt-in, nicht blind fuer alle).
- **18-Nummer-Bereinigung:** die Test-Accounts mit geteilter `+4915562740016` — genau EINER darf die Nummer in `auth.users.phone` besitzen (Login-faehig), der Rest bleibt ohne. Kein Prod-Risiko (Test-Daten), aber Migration muss den Konflikt sauber aufloesen.

## 7. Security-Trade-offs (bewusst, dokumentiert)

- **Optional 2FA** macht das heutige Hardening rueckgaengig: Admin-Zugaenge sind passwort-only, ausser der User aktiviert 2FA selbst. Gegenmassnahme: **weicher Nudge** ("2FA empfohlen") fuer interne Rollen, kein Zwang.
- **Passwordless Telefon-Login fuer alle** heisst: ein Admin-Login kann an reinem SMS-Besitz haengen (ein Faktor) und einen vorhandenen TOTP-Faktor faktisch umgehen. Von Aaron bewusst gewaehlt (Komfort > Strenge).
- Diese Punkte kollidieren mit dem urspruenglichen Sicherheits-Audit-Ziel ("interne Rollen 2FA-Pflicht"). Bewusste Produkt-Entscheidung.

## 8. Testing

- **Unit (`mfa-gate.test.ts`):** `entscheideLoginRouting` ohne Pflicht-Enroll (Admin ohne Faktor → `'portal'`); `entscheideMfaGate` unveraendert; `istZweiFaktorPflicht` nur noch Nudge.
- **Unit:** Nummer-Eindeutigkeit (Setzen einer bereits vergebenen Nummer → Fehler).
- **E2E (Playwright, golden-path-Harness):** (a) Admin ohne Faktor loggt ein → Portal, KEIN 2FA-Redirect (Lockout-Regression); (b) opt-in TOTP-Flow; (c) opt-in SMS-Flow; (d) Login-Challenge bei vorhandenem Faktor; (e) passwordless Telefon-Login.

## 9. Koordination & Risiken

- **⚠ Ueberlappung mit `kitta/trusted-device-management` (Session `eaf5be72`):** deren `KontoSicherheitPanel` + `remember-me`/`validate-remember-token` sind bereits in `staging` (Base dieses Worktrees). Baustein 1 **erweitert** dieselbe Datei — bei parallelen Aenderungen dort Rebase noetig. Zudem baute die Trusted-Device-Arbeit auf der 2FA-**Pflicht** auf; Baustein 0 macht 2FA optional → mit der Session abstimmen (Owner-Frage 2FA). **Aaron-Entscheid liegt vor (optional), das ist die Richtung.**
- **Branch:** bewusst NICHT auf `kitta/aar-956-*` (stale, pre-F3, 2 Kollisions-Sessions). Eigener Worktree ab `staging`.
- **Kein Emergency-Deploy** (Aaron): Aaron nutzt solange seinen SV-Account (nicht gegated). Sobald Baustein 0 live ist, sind Admin/dispatch entsperrt.

## 10. Offene Punkte

- Genaue Platzierung des Erst-Login-Nudge (eigener Schritt nach `/passwort-aendern` vs. Banner im Portal).
- Ob der Telefon-Login-Opt-in ein separater Toggle ist oder implizit mit der SMS-2FA-Einrichtung kommt.
- Migration-Mechanik der 18er-Nummer (welcher Account behaelt sie) — Test-Daten, unkritisch.
