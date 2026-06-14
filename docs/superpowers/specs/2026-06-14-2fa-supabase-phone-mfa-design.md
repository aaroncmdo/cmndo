# 2FA → Supabase native Phone-MFA (Design)

**Datum:** 2026-06-14
**Branch:** `kitta/aar-939-2fa-supabase-mfa` (Base: `origin/staging`)
**Ticket:** AAR-939 (Auth) — 2FA-Supabase-Migration
**Quelle:** Aaron-Entscheidung 2026-06-14 + Brief `memory/COORDINATION-2fa-supabase-migration-brief.md`

## Entscheidungen (Aaron, 2026-06-14)

1. **Modell:** Supabase-natives **Phone-MFA** (`supabase.auth.mfa`, `factorType: 'phone'`), AAL-basiertes Gating — **kein** Eigenbau-Cookie-Gate mehr.
2. **SMS-Provider:** **Twilio (Messaging-API)** als Supabase-SMS-Provider. Twilio bleibt als reine SMS-Pipe; unsere Custom-`verify-client.ts` (Twilio **Verify**) wird gelöscht. Supabase generiert/prüft den OTP selbst.
3. **Migration:** **Soft-Enroll + E-Mail-Escape** — niedrigstes Lockout-Risiko. Bestehende `twofa_aktiviert=true`-User werden beim nächsten Login auf eine Enroll-Seite geführt (Nummer vorausgefüllt); wer kein SMS bekommt, kommt per einmaligem E-Mail-OTP-Escape (bestehender Resend-Pfad) rein. E-Mail-OTP wird erst in einem Folge-Ticket retired.
4. **Config:** Ich setze die Supabase-Auth-Config per **Management-API** (`SUPABASE_ACCESS_TOKEN` + Twilio-Messaging-Service-SID von Aaron).

## Ziel & Nicht-Ziel

**Ziel:** Das zweite Faktor (nach Passwort-Login) läuft über Supabase-MFA. Der `claimondo_2fa_verified`-Cookie-Gate (Quelle des Reload-Loops) verschwindet; Gating über die Session-**AAL** (im JWT, refresht korrekt). SMS-Zustellung via Twilio-Messaging, in Supabase konfiguriert.

**Nicht-Ziel:** Kein TOTP/App (separates Folge-Ticket möglich). Keine Pflicht-2FA für alle (bleibt opt-in pro User wie heute). Twilio bleibt als Account/Pipe (`validate-signature`, `provision-kb-nummer`, SMS-Fallback in `sendNachricht` unberührt).

## Ist-Zustand (verifiziert gegen `origin/staging`, 2026-06-14)

- 2FA ist ein **Eigenbau-Gate**, kein Supabase-MFA. `supabase.auth.mfa` wird nirgends genutzt (grep: 0 Treffer).
- **Gate:** `middleware.ts:104-129` prüft `claimondo_2fa_verified`-Cookie (+ Google-/Remember-/Gutachter-Bypass).
- **Login:** `login/actions.ts` löscht den Cookie bei jedem Login, routet 2FA-User auf `/login/2fa`, setzt für Nicht-2FA-User einen 3-Tage-Cookie. Trägt `?continue=` über `safe-continue.ts`.
- **2FA-Page:** `login/2fa/page.tsx` rendert `TwoFaClient` (SMS+Email) oder `TwoFaSkipRedirect` (Bridge für Nicht-2FA-User — Loop ist auf staging **schon gefixt**).
- **SMS-2FA:** Twilio Verify via `lib/twilio/verify-client.ts` ← `send-code.ts` (`requestTwoFaCode`) + `verify-code.ts` (`verifyTwoFaCode`). In-Memory-Lockout (3×=5 Min). Setzt `claimondo_2fa_verified` (3 Tage).
- **Email-2FA (AAR-494):** Voll gebaut, Twilio-frei. `send-email-code.ts` (`requestEmailOtp`/`verifyEmailOtp`), `email_otp_codes`-Tabelle (sha256, 5 Min TTL, 3/h), Resend-Versand, `TwoFactorCode.tsx`. → bleibt als Migrations-Escape.
- **Flags (`profiles`):** `twofa_aktiviert` (SMS), `twofa_email_aktiviert`, `twofa_telefon`, `twofa_telefon_verifiziert_am`, `twofa_email_verifiziert_am`. Default 2FA = aus.
- **Generische Telefon-Verifizierung (NICHT 2FA):** `requestPhoneVerification`/`confirmPhoneVerification` (in send-code/verify-code) → genutzt von `PhoneVerificationModal` (SV-Profil) + `PhoneVerifyField` (Onboarding, + WhatsApp-Availability-Cache). Teilen die Twilio-Verify-Pipe.

## Ziel-Architektur

**Flows (alle über `supabase.auth.mfa`, SMS via Twilio-Messaging-in-Supabase):**

1. **Enroll** (Einstellungen / Soft-Enroll-Bridge): `mfa.enroll({factorType:'phone', phone})` → `mfa.challenge({factorId})` (sendet SMS) → User tippt Code → `mfa.verify({factorId, challengeId, code})` → Faktor `verified`. Spiegel-Update `profiles.twofa_telefon` für Anzeige.
2. **Login-Challenge** (`/login/2fa`): nach Passwort-Login (Session AAL1) → wenn verifizierter Phone-Faktor existiert → `mfa.challenge` (SMS) → `mfa.verify` → Session **AAL2** → Redirect ins Portal (`finalTarget`/`continue`).
3. **Gate** (`middleware.ts`): Ersetzt den Cookie-Check. `currentLevel==='aal2'` → durchlassen. Verifizierter Faktor vorhanden + `aal1` → `/login/2fa` (außer gültiger Remember-Token → Trusted-Device-Bypass). Kein Faktor → durchlassen (kein 2FA). AAL steckt im JWT → **kein separat ablaufender Cookie → Loop-Klasse strukturell weg.**

**Server-Action-Wrapper** (`lib/auth/twofa/mfa.ts`, neu): dünne `{ ok, ... }`-Wrapper um `mfa.enroll/challenge/verify/listFactors/unenroll` (Result-Object-Pattern, kein throw — AGENTS.md §Server-Actions).

## Datei-Plan (Blast-Radius)

**Neu:**
- `lib/auth/twofa/mfa.ts` — MFA-Wrapper (enroll/challenge/verify/list/unenroll) + Helper `hatVerifiziertenFaktor(user)`.
- `lib/auth/mfa-gate.ts` — **pure** Funktion `entscheideMfaGate({ aal, hasVerifiedFactor, hasRememberToken, isGoogle, isGutachterPath, path })` → `'allow' | 'challenge'`. Unit-getestet (vitest), middleware-importierbar.

**Geändert:**
- `lib/supabase/middleware.ts` — Cookie-Check → AAL-Gate (`getAuthenticatorAssuranceLevel` / JWT-`aal` + `user.factors`). Remember-Bypass bleibt.
- `app/login/actions.ts` — 2FA-Routing auf AAL/Faktor-Existenz statt `twofa_aktiviert`; Cookie-Set/-Clear raus. `?continue=` bleibt.
- `app/login/2fa/page.tsx` — Faktor-Liste statt Flag-Check; Soft-Enroll-Routing (Legacy-User ohne Faktor → Enroll). `TwoFaSkipRedirect` entfällt (AAL braucht keinen Skip-Cookie).
- `app/login/2fa/TwoFaClient.tsx` — `challenge`/`verify` statt `requestTwoFaCode`/`verifyTwoFaCode`. E-Mail-Zweig bleibt als Escape. Remember-Me bleibt.
- `components/auth/TwoFaPhoneChange.tsx` — Enroll/Re-Enroll (unenroll alt + enroll neu) statt Twilio-Verify-Change.
- `components/onboarding/fields/PhoneVerifyField.tsx` + `components/auth/PhoneVerificationModal.tsx` — generische Telefon-Verifizierung auf **Supabase-Phone-OTP** (`updateUser({phone})` → `verifyOtp({type:'phone_change'})`, gleiche Twilio-Messaging-Pipe) ODER auf gemeinsame neue Helper. Signaturen `requestPhoneVerification`/`confirmPhoneVerification` bleiben stabil → UI minimal angefasst. **[OFFEN — siehe unten]**

**Gelöscht (nach Cutover):**
- `lib/twilio/verify-client.ts` (Twilio Verify), 2FA-Teile von `send-code.ts`/`verify-code.ts`/`change-phone.ts`, `skip-cookie.ts` + `TwoFaSkipRedirect.tsx` (AAL macht sie obsolet). `TWILIO_VERIFY_SERVICE_SID` wird obsolet.

**DB:** Voraussichtlich **keine** neuen Spalten (Faktoren in Supabase-managed `auth.mfa_factors`; „hatte Legacy-2FA" = bestehende `twofa_*`-Flags). Falls die Middleware einen billigen „hat Faktor"-Hinweis ohne `user.factors` braucht → kleine `profiles.mfa_phone_enrolled boolean` (DDL via Supabase-Plugin, Regel 2). Entscheidung im Build (siehe Verifikations-Punkt 3).

## Migration / Lockout-Bridge (Soft-Enroll + E-Mail-Escape)

- Legacy-User (`twofa_aktiviert=true` **oder** `twofa_email_aktiviert=true`) ohne Supabase-Faktor → `/login/2fa` erkennt „Legacy, kein Faktor" → **Enroll-Schritt** (Nummer aus `twofa_telefon` vorausgefüllt) → nach `verify` hat der User einen Faktor → AAL2.
- **Escape:** Wer kein SMS bekommt → Button „Stattdessen E-Mail-Code" → bestehender `requestEmailOtp`/`verifyEmailOtp` → einmaliger Zugang, um die Nummer in den Einstellungen zu korrigieren/zu enrollen. Setzt **kein** AAL2-Bypass-Cookie dauerhaft — nur ein kurzlebiger „email-escape verified"-Marker für genau diese Session, eng gescoped.
- Neue/Nicht-2FA-User: Enroll ist **opt-in** in den Einstellungen (`TwoFaPhoneChange`). Kein Zwang → kein Lockout.
- E-Mail-OTP-Pfad bleibt bis „alle migriert" (Folge-Ticket Retire).

## OFFENE Sub-Entscheidung — generische Telefon-Verifizierung

`PhoneVerifyField` (Onboarding) + `PhoneVerificationModal` (Profil) verifizieren **Besitz** einer Nummer (kein 2FA-Zwang heute). Drei Optionen:
- **(A, empfohlen)** Auf **Supabase-Phone-OTP** migrieren (`updateUser({phone})`+`verifyOtp`), gleiche Signaturen → Besitz-Verifizierung bleibt, **kein** erzwungenes 2FA. Twilio-Verify voll löschbar.
- **(B)** Mit MFA-Enroll vereinheitlichen → Telefon-Verifizieren = 2FA-an. Einfachster Code, aber Verhaltensänderung (Onboarding aktiviert 2FA).
- **(C)** Vorerst auf Twilio-Verify lassen (nur 2FA-Login migrieren) → Twilio-Verify-Client bleibt, halbe Sache.

→ **Default = (A).** Aaron kann überstimmen.

## Config-Abhängigkeiten (Management-API + Twilio — Aaron-Input nötig)

In Supabase-Auth (`PATCH /v1/projects/paizkjajbuxxksdoycev/config/auth`):
1. **Phone-MFA-Faktor aktivieren** (`mfa_phone_enroll_enabled`/`mfa_phone_verify_enabled` o.ä. — exakte Keys beim Build verifizieren).
2. **SMS-Provider = Twilio (Messaging):** `sms_provider='twilio'`, `sms_twilio_account_sid`, `sms_twilio_auth_token`, `sms_twilio_message_service_sid`. → **Twilio-Messaging-Service-SID** muss Twilio-seitig existieren (heute nur Verify-Service). **[Aaron]**
3. **OTP-Template DE:** „Ihr Claimondo-Code: {{ .Code }}".
4. **MFA-/SMS-Rate-Limits** setzen (ersetzt unser `rateLimitMap`).
5. **Test-Phone + fixer OTP** für Playwright-E2E (Auth → „Test OTP").

Benötigt von Aaron: `SUPABASE_ACCESS_TOKEN` (Management) + Twilio-Messaging-Service-SID. (`TWILIO_ACCOUNT_SID`/`AUTH_TOKEN` sind in `.env.local` vorhanden.)

## Testing

- **vitest (pure):** `mfa-gate.ts` — alle Gate-Pfade (aal1/aal2 × Faktor ja/nein × Remember × Google × Gutachter × Pfad). Migrations-Routing (Legacy-ohne-Faktor → Enroll).
- **Playwright E2E** (gegen staging, Supabase-Test-Phone + fixer OTP): (1) frischer Enroll, (2) Login-Challenge→AAL2→Portal, (3) Legacy-Soft-Enroll, (4) E-Mail-Escape, (5) Remember-Device-Bypass, (6) Nicht-2FA-User kein Loop, (7) Google-User skip.
- **E2E-Fixtures** (`seed-*test-users`): Test-User ohne verifizierten Faktor → AAL-Gate lässt durch (= heutiges `twofa_aktiviert=false`). Doku in [[project_e2e_test_users]] nachziehen.

## Rollout / Sequencing

1. **Config zuerst** (Supabase-Auth Phone-MFA + Twilio-Messaging-Service live) — Code ohne Config = Enroll schlägt fehl.
2. Code-PR `--base staging`. **Kein Merge durch mich** (nicht die Merge-Session) — PR + Bericht.
3. 7-Punkte-Audit, `npm run build` grün, E2E grün.
4. Nach staging-Abnahme durch Aaron: staging→main via Merge-Session.

## Build-Zeit-Verifikationspunkte (vor Implementierung der jeweiligen Stelle prüfen)

1. **Enroll-Auto-Send:** Sendet `mfa.enroll({factorType:'phone'})` die SMS schon, oder erst `challenge`? (auth-js `GoTrueClient` lesen.)
2. **AAL lokal vs. Netzwerk:** Ist `getAuthenticatorAssuranceLevel()` ein lokaler JWT-Decode (gut für Middleware) oder ein GoTrue-Call? Sonst `aal`-Claim direkt aus dem Access-Token dekodieren.
3. **`user.factors` in Middleware:** Füllt `getUser()` `user.factors`? Wenn nein → `profiles.mfa_phone_enrolled`-Hinweis-Spalte (DDL via Plugin).
4. **Exakte Management-API-Keys** für Phone-MFA + Twilio-Messaging (`config/auth`-Schema).

## Risiken

- **Lockout** (primär) — durch Soft-Enroll + E-Mail-Escape + Opt-in-für-Neue minimiert. Hartes E2E vor Release.
- **SMS-Zustellung DE** — Twilio-Messaging-Service muss DE-fähig sein (Sender-ID/Alphanumeric-Regeln). Test-SMS an echte DE-Nummer vor Release (Aaron).
- **Remember-Device + AAL** — Supabase hält AAL2 nicht über neue Logins; „2FA pro Login" ist damit automatisch erfüllt. 30-Tage-Remember = bewusster Challenge-Skip via bestehenden `auth_remember_tokens`.
- **Andere Sessions** — keine berühren Auth/2FA/Login/Middleware (Stand 2026-06-14). Isolierter Worktree.
