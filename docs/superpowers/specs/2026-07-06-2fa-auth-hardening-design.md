# Spec: 2FA-/Handy-Auth-Härtung

**Datum:** 2026-07-06
**Branch:** `worktree-kitta+2fa-auth-hardening` (off `origin/staging`)
**Auslöser:** Aaron — „audite die Authentifizierung mit dem Handy im Login" → „wir müssen all diese sauber fixen und lösen"
**Verwandt:** `[[coordination-2fa-auth-hardening]]`, AGENTS.md §Server-Actions, `src/lib/auth/mfa-gate.ts` (AAR-939)

---

## 1. Kontext & Motivation

Der Audit des Handy-/2FA-Login-Pfads (2FA-per-SMS-Gate **und** passwortloser Telefon-Login-Tab) ergab **1 CRITICAL, 2 HIGH, 2 MEDIUM, 2 LOW**. Kernproblem: Das „Trusted-Device"-Bypass des 2FA-Gates validiert das Remember-Token **gar nicht** — es prüft nur, ob das Cookie existiert.

**Wichtiger Ist-Zustand (per MCP verifiziert):**
- Systemweit existiert **genau 1 verifizierter MFA-Faktor**. Der CRITICAL-Bypass ist heute für fast alle Konten *moot* (das Gate lässt faktor-lose User ohnehin durch), wird aber **scharf in dem Moment, wo interne 2FA-Pflicht greift** — dann bekommt jeder interne User einen Faktor, und der Bypass würde für alle gelten.
- **`app_metadata.rolle` ist unzuverlässig:** Admins 0/5 gesetzt, kanzlei 0/2, kundenbetreuer 2/3. Ein Mandatory-Gate darf sich in der Middleware **nicht** darauf verlassen (verfehlt genau die Admins).

**Konsequenz für die Reihenfolge:** Bypass-Fix und Enforcement gehören in **denselben PR** — der Bypass muss geschlossen sein, bevor Pflicht-2FA ihn scharf schaltet.

---

## 2. Scope-Entscheidungen (Aaron, 2026-07-06)

| Thema | Entscheidung |
|---|---|
| **2FA-Pflicht** | Für **interne Rollen**: `admin`, `dispatch`, `kanzlei`, `kundenbetreuer`. `kunde`/`sachverstaendiger`/`makler`/`werkstatt` bleiben optional. |
| **SV-Portal-Exemption** (`/gutachter*`) | **Entfernen.** Enforcement folgt dem Faktor, nicht dem Pfad. |
| **Telefon-Login-Tab** | **Härten & behalten** (`shouldCreateUser:false`), nicht entfernen. |
| **Marketing-Middleware** | **Dokumentiertes Follow-up** — nicht in diesem PR (kein ausnutzbarer Pfad, s. §7). |
| **REVOKE anon** auf `auth_remember_tokens` | **Enthalten** (1 Plugin-Migration). |

---

## 3. Findings & Fixes

### F1 — CRITICAL: Remember-Token wird nicht validiert (2FA-Bypass)

**Ist:** `src/lib/supabase/middleware.ts` füttert das Gate mit
`hasRememberToken: !!request.cookies.get('claimondo_remember')?.value` — reine **Cookie-Präsenz**. Die korrekte `validateRememberToken()` (SHA-256 + DB-Lookup + `expires_at` + `revoked_am` + userId-Bindung) in `remember-me.ts` ist **toter Code** (0 Caller).

**Angriff:** Wer Passwort kennt → aal1-Session → `claimondo_remember=1` per DevTools/curl setzen → `entscheideMfaGate` → `allow`. Zweiter Faktor komplett übersprungen (OWASP A07:2025).

**Fix:**
- Neues Modul `src/lib/auth/twofa/remember-validate.ts` (kein `'use server'`, DI-fähig, Web-Crypto `crypto.subtle` SHA-256 → Edge+Node-agnostisch):
  ```
  validateRememberCookie(supabase, sessionUserId, cookieValue): Promise<boolean>
  ```
  - Parst `userId:rawToken`; erzwingt `cookieUserId === sessionUserId`.
  - Hasht `rawToken` (SHA-256 hex) und prüft `auth_remember_tokens` auf
    `token_hash` + `revoked_am IS NULL` + `expires_at > now()`.
  - **Jeder** Parse-/DB-/Format-Fehler → `false` (fail-closed).
- **RLS erlaubt den User-Client die eigene Zeile** (`USING (admin OR user_id = auth.uid())`, verifiziert) → **kein Service-Role, kein DDL** für den Core-Fix.
- Middleware ruft es **lazy** auf: nur wenn Cookie vorhanden **und** `hatVerifiziertenFaktor` **und** `aalCurrent !== 'aal2'` → kein DB-Hit im Normalfall (respektiert die Middleware-Perf-Philosophie AAR-622).
- Die tote `validateRememberToken` in `remember-me.ts` wird **entfernt** (Dead-Code, knip-freundlich).

**Akzeptanz:** Unit-Test RED→GREEN — Cookie präsent, aber keine passende (bzw. revoked/expired) DB-Zeile ⇒ `false` ⇒ Gate-Entscheidung `challenge`. Gültiges Token (matchender Hash, nicht revoked, nicht expired) ⇒ `true` ⇒ `allow`.

**Files:** NEU `remember-validate.ts` + `.test.ts`; `middleware.ts`; `remember-me.ts` (Dead-Code raus).

---

### F2 — HIGH: `/gutachter`-Exemption entfernen

**Ist:** `entscheideMfaGate` gibt bei `isGutachterPath` bedingungslos `allow` → ein SV **mit** aktiviertem Faktor wird im SV-Portal **nie** gechallenged.

**Fix:** `isGutachterPath`-Bypass aus `mfa-gate.ts` (Zeilen 59–60) **und** dem Middleware-Input entfernen. Ergebnis: SV **mit** Faktor → `challenge`; SV **ohne** Faktor → weiterhin `allow` (nicht mandatory, Soft-Enroll). Reload-Loop ist durch das AAL-Design strukturell ausgeschlossen.

**Akzeptanz:** `mfa-gate.test.ts` — bestehenden „gutachter → allow"-Test ersetzen durch „gutachter + verifizierter Faktor + aal1 → challenge". Feld `isGutachterPath` aus `MfaGateInput` entfernt.

**Files:** `mfa-gate.ts` (+ `.test.ts`); `middleware.ts`.

---

### F3 — HIGH: 2FA-Pflicht für interne Rollen

**Enforcement-Punkte** (an `profiles.rolle`-Lesern, **nicht** Middleware — `app_metadata.rolle` unzuverlässig):

1. **Neuer Pure-Helper** `istZweiFaktorPflicht(rolle): boolean` in `mfa-gate.ts` → `true` für `admin`/`dispatch`/`kanzlei`/`kundenbetreuer`.
2. **Login-Routing** (`entscheideLoginRouting`): neuer Input `rollePflicht`. Regel-Priorität: nach Google-Bypass — `if (rollePflicht && !hasVerifiedFactor) return 'enroll'` (überstimmt `portal`). `login/actions.ts` übergibt `istZweiFaktorPflicht(profile.rolle)`.
3. **`/login/2fa`-Page:** `pflicht = istZweiFaktorPflicht(profile.rolle)`. Enroll-Modus wenn kein verifizierter Faktor **und** (`legacyWanted || pflicht`). `mandatory={pflicht}` an `TwoFaClient`.
4. **`TwoFaClient`:** wenn `mandatory` → **„Später einrichten"-Button ausblenden** (non-skippable Enroll).
5. **Portal-Layout-Guard** (shared Helper, in `admin`/`dispatch`/`kanzlei`/`mitarbeiter`-Layout): Pflicht-Rolle **ohne** verifizierten Faktor → `redirect('/login/2fa')`. Schließt „Tab-schließen-Dodge" + bestehende Sessions **graceful** (nächste Portal-Navigation erzwingt Enroll) → **keine Zwangs-Logouts**.

**Loop-Sicherheit:** Page **und** Layout lesen dieselbe `profiles.rolle` → keine Disagreement-Schleife. Middleware bleibt für faktor-lose User weiterhin `allow` (kein Middleware-Rollen-Lookup nötig).

**Akzeptanz:** Tests für `istZweiFaktorPflicht` (4 interne → true, alle anderen → false) und `entscheideLoginRouting` (Pflicht-Rolle ohne Faktor → `enroll`; mit Faktor → `challenge`).

**Files:** `mfa-gate.ts` (+ `.test.ts`); `login/actions.ts`; `login/2fa/page.tsx`; `login/2fa/TwoFaClient.tsx`; NEU shared Guard-Helper; `admin/layout.tsx`, `dispatch/layout.tsx`, `kanzlei/layout.tsx`, `mitarbeiter/layout.tsx`.

---

### F4 — MEDIUM: Telefon-Login-Tab härten

**Ist:** `LoginClient.handlePhoneSend` ruft `signInWithOtp({ phone })` — Default `shouldCreateUser:true` → **Signup-Vektor**; zudem Single-Factor (SIM-Swap).

**Fix:** `signInWithOtp({ phone, options: { shouldCreateUser: false } })` → kein Auto-Signup. Der Single-Factor-Charakter bleibt akzeptiert: Phone-Login gibt nur `aal1`; ein enrollter (interner) User wird danach durch das Gate/den Layout-Guard ohnehin zum zweiten Faktor geführt.

**Akzeptanz:** Manueller Smoke (unbekannte Nummer → kein neues Konto, klare Fehlermeldung). Kein neuer Unit-Test (dünner SDK-Wrapper).

**Files:** `login/LoginClient.tsx`.

---

### F5 — MEDIUM: Rate-Limiting (Bestandsaufnahme, keine Security-Theater)

**Ist:** Der 60-s-Resend-Cooldown ist rein clientseitig. SMS-Sends (2FA-challenge/enroll **und** Phone-Login) laufen über **GoTrue, das server-seitig rate-limitet**.

**Fix:** Keine eigene (trivial umgehbare) Cookie-/Memory-Bremse bauen. Stattdessen: (a) GoTrue-SMS-Rate-Limits per MCP verifizieren/dokumentieren; (b) `shouldCreateUser:false` (F4) nimmt die Signup-Amplifikation. Client-Cooldown bleibt als UX. Ehrliche Doku statt Schein-Kontrolle.

**Akzeptanz:** Dokumentierte Bestätigung, dass GoTrue-SMS-Limits greifen. Kein Code über F4 hinaus.

---

### F6 — LOW: `clearTwoFa` entfernt den Faktor nicht

**Ist:** `clearTwoFa(targetUserId)` löscht nur `profiles.twofa_*`-Mirror + Remember-Tokens, aber **nicht** den echten `auth.mfa_factors`-Eintrag → Admin-„2FA zurücksetzen" sperrt einen ausgesperrten User nicht frei.

**Fix:** Zusätzlich die verifizierten Phone-Faktoren des Ziel-Users entfernen — via Admin-API (`supabase.auth.admin.mfa.deleteFactor({ id, userId })`) bzw. Service-Role-Delete auf `auth.mfa_factors` (DML, kein DDL). Idempotent (kein Faktor → no-op).

**Akzeptanz:** Nach `clearTwoFa` hat der Ziel-User 0 verifizierte Faktoren (per Admin-Lesung).

**Files:** `remember-me.ts` (wo `clearTwoFa` liegt) bzw. Verschiebung zu `twofa/mfa.ts` prüfen.

---

### F7 — LOW: `cm_remember`-Default invertiert

**Ist:** `middleware.ts:47` `remember = cookie?.value !== '0'` → fehlendes Cookie ⇒ `remember=true` ⇒ 1-Jahr-Persistenz (widerspricht „Default OFF").

**Fix:** `remember = cookie?.value === '1'`. Login setzt den Marker weiterhin explizit; nur Pre-Login-/Edge-Fälle betroffen (dann Session-Cookie — sicherer). Ggf. `server.ts`-Parität prüfen.

**Files:** `middleware.ts` (+ ggf. `supabase/server.ts`).

---

### F8 — Härtung: `REVOKE anon` auf `auth_remember_tokens`

**Ist:** Baseline hat `GRANT ALL ON public.auth_remember_tokens TO anon` — durch RLS gated (nicht ausnutzbar), aber unnötige Fläche.

**Fix:** Plugin-Migration (AGENTS Regel 2): `REVOKE ALL ON public.auth_remember_tokens FROM anon;` → apply_migration → list_migrations (getrackte Version ablesen) → Migration-File exakt danach benennen → `execute_sql` (READ) verifizieren.

**Akzeptanz:** `anon` hat 0 Privilegien auf der Tabelle (per `information_schema.role_table_grants`).

---

## 4. Betroffene Dateien (Touch-Liste)

**Neu:**
- `src/lib/auth/twofa/remember-validate.ts` (+ `remember-validate.test.ts`)
- shared Portal-2FA-Guard-Helper (z. B. `src/lib/auth/require-2fa-enrollment.ts`)
- `supabase/migrations/<version>_revoke_anon_auth_remember_tokens.sql`

**Geändert:**
- `src/lib/supabase/middleware.ts` (F1 Wiring, F2 Exemption, F7 Default)
- `src/lib/auth/mfa-gate.ts` + `mfa-gate.test.ts` (F2, F3, `istZweiFaktorPflicht`)
- `src/lib/auth/twofa/remember-me.ts` (F1 Dead-Code raus, F6 clearTwoFa)
- `src/app/login/actions.ts` (F3)
- `src/app/login/2fa/page.tsx` (F3)
- `src/app/login/2fa/TwoFaClient.tsx` (F3)
- `src/app/login/LoginClient.tsx` (F4)
- `src/app/{admin,dispatch,kanzlei,mitarbeiter}/layout.tsx` (F3 Guard)

---

## 5. Testing (TDD)

Kern-Beweis zuerst (RED→GREEN):
1. **Bypass-Test** (`remember-validate.test.ts`): Cookie präsent + keine/revoked/expired DB-Zeile ⇒ `false`. Gültiges Token ⇒ `true`. userId-Mismatch ⇒ `false`. Malformed Cookie ⇒ `false`.
2. **`entscheideMfaGate`**: gutachter+Faktor+aal1 → `challenge` (F2); Bypass nur bei echtem Token.
3. **`entscheideLoginRouting`**: Pflicht-Rolle ohne Faktor → `enroll` (F3).
4. **`istZweiFaktorPflicht`**: 4 interne → true; kunde/sv/makler/werkstatt → false.
5. **`clearTwoFa`**: 0 verbleibende verifizierte Faktoren (F6).

Vor jedem Commit: **7-Punkte-Audit** (AGENTS.md) + **4 Ratchets** (token-audit/component-set/knip/status) 0-neu + `tsc --noEmit` grün. Voller Build ist CI-autoritativ (shared node_modules lokal fragil — dokumentierte Lektion).

---

## 6. Rollout

- **~12 interne User** (5 admin, 2 dispatch, 2 kanzlei, 3 kundenbetreuer) richten beim nächsten Portal-Besuch 2FA ein (non-skippable Enroll). **Graceful** — keine Zwangs-Logouts (Layout-Guard fängt bestehende Sessions bei der nächsten Navigation).
- Der **1 bestehende verifizierte Faktor** bleibt unberührt.
- **Post-Merge-Smoke** (Prod, frischer SW-freier Browser — s. `[[broadcast-prod-smokes-fresh-sw-browser]]`):
  1. Passwort-Login + `claimondo_remember=1` fälschen → **muss** auf `/login/2fa` landen (Bypass zu).
  2. Interner Test-Account ohne Faktor → non-skippable Enroll.
  3. SV mit Faktor → wird im `/gutachter`-Portal gechallenged.
- **F8-Migration** wird per Plugin auf Prod appliziert (Regel 2) und das File exakt nach getrackter Version benannt.

---

## 7. Out of Scope (bewusst)

- **Marketing-Middleware** (`claimondo-marketing/lib/supabase/middleware.ts`): läuft auf alter 2FA-Logik (`claimondo_2fa_verified=1`-Cookie + gleiche Remember-Presence-Lücke), ist aber **nicht ausnutzbar** — Portale liegen auf `app.claimondo.de` (Haupt-App), nicht auf der Marketing-Domain. Eigener Build. → **Follow-up-Ticket:** toten 2FA/Admin-Zweig entfernen.
- **`app_metadata.rolle`-Backfill + Sync-Trigger** (würde die Middleware rollen-fähig machen und den fragilen Admin/Dispatch-Check reparieren) — größerer, separater Change (JWT-Claims, alle User).
- **`roleToPath`-Default `werkstatt → /admin`** — unrelated Latent-Bug, nicht Teil dieses PRs.

---

## 8. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Middleware-DB-Hit auf jedem Request | Lazy: nur bei Cookie-Präsenz + Faktor + nicht-aal2. Normalfall unberührt. |
| Reload-Loop durch Mandatory-Gate | Enforcement nur an `profiles.rolle`-Lesern; Page + Layout konsistent. |
| `/gutachter`-Exemption-Removal bricht SV-Flow | Nur SV **mit** Faktor betroffen (heute ≤1 User); AAL-Design schließt Loop aus. |
| Web-Crypto in Proxy-Runtime | `crypto.subtle` ist Edge+Node-verfügbar; kein Node-`crypto`-Import in der Middleware. |
| Shared node_modules bricht lokalen Build | CI-Build autoritativ; gegen letzten sauberen Build verifizieren. |
| Kollision mit Parallel-Sessions | Isolierter Worktree; Koordinations-Marker; middleware/mfa-gate/login werden laut Markern von niemandem sonst angefasst. |
