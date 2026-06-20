# TOTP als optionaler 2. Faktor (Design/Spec)

**Datum:** 2026-06-19
**Ticket:** AAR-939 (2FA-Erweiterung)
**Branch:** `kitta/aar-939-totp-spec`
**Kontext:** Phone-MFA (SMS, native Supabase-MFA) ist live + validiert auf prod (#2802 + Navfix #3016). Email-OTP retired (#3028) — Email ist kein nativer MFA-Faktor. TOTP soll als **optionaler** zweiter Faktor dazukommen (Aaron-Wunsch 18./19.06.: ein stärkerer/Backup-Faktor).

## Ziel & Nicht-Ziel

**Ziel:** User können **optional** eine Authenticator-App (TOTP) als 2FA-Faktor einrichten — nativ via `supabase.auth.mfa` (`factorType: 'totp'`), neben dem bestehenden SMS-Phone-Faktor. TOTP = offline, phishing-resistenter, kein SMS-Vendor/-Kosten/-Zustellbarkeitsrisiko.

**Nicht-Ziel:** TOTP **nicht** verpflichtend; SMS bleibt der Default-Kanal. Kein WebAuthn/Passkey (eigener Faktor-Typ → separates Ticket). Keine Migration (TOTP ist net-new, niemand wird umgestellt).

## Das Elegante: das Gate ändert sich NICHT

Das AAL-Gate (`lib/auth/mfa-gate.ts`) prüft `hatVerifiziertenFaktor()` = **jeder** verifizierte Faktor (typ-agnostisch, `status === 'verified'`) → `aal2`. Ein verifizierter TOTP-Faktor erfüllt das Gate **genauso** wie ein Phone-Faktor. Login-Routing (`entscheideLoginRouting`, `hasVerifiedFactor`) ebenso. → **Middleware + Gate + Routing-Logik: 0 Änderung.** Die Arbeit liegt nur in drei UI-/Wrapper-Surfaces.

## Die 3 Surfaces

### 1. Enroll (Einstellungen, opt-in)
Neuer Abschnitt „Authenticator-App" in den 2FA-Einstellungen:
- `mfa.enroll({ factorType: 'totp', friendlyName })` → liefert `{ id, totp: { qr_code, secret, uri } }`. `qr_code` ist bereits ein `data:image/svg+xml;utf-8,…` (auth-js prependet das) → direkt `<img src={qr_code}>`, kein eigenes QR-Rendering nötig. `secret` als Text-Fallback (manuelle Eingabe).
- User scannt in seine App → tippt den 6-stelligen Code → `mfa.challenge({ factorId })` + `mfa.verify({ factorId, challengeId, code })` → Faktor `verified`.
- Faktor erscheint in der Faktor-Liste, entfernbar (`mfa.unenroll`).

### 2. Login (/login/2fa)
User mit TOTP-Faktor → /login/2fa:
- TOTP-`challenge` sendet **kein SMS** (erzeugt nur die Challenge; der Code kommt aus der App). → Code-Input wird sofort gezeigt, **kein** „SMS gesendet"-Text, **kein** Resend-Cooldown.
- UI-Text: „Gib den Code aus deiner Authenticator-App ein."
- `mfa.verify` → `aal2` → Portal via `window.location.href` (wie der Navfix #3016).

### 3. Multi-Faktor-Wahl (DESIGN-ENTSCHEIDUNG)
Hat ein User **beide** (Phone + TOTP):
- **Option A (empfohlen):** TOTP bevorzugen (offline, kein SMS-Delay/-Cost), mit „Stattdessen SMS-Code"-Fallback-Link.
- **Option B:** Faktor-Picker (Tabs „App" / „SMS"), analog zum früheren SMS/Email-Toggle.

## Offene Entscheidungen (Aaron)

1. **Scope** — TOTP für ALLE (opt-in) oder nur **Admin/Staff** empfohlen/erzwungen? App-Zwang ist für Kunden mehr Friktion; Admin-/Finance-Accounts profitieren am meisten vom stärkeren Faktor. *Empfehlung:* allen opt-in anbieten, Admin/Staff aktiv empfehlen.
2. **Multi-Faktor-Login-UX** — A (TOTP bevorzugt + SMS-Fallback) vs. B (Picker). *Empfehlung:* A.
3. **Recovery-Codes** — TOTP-Best-Practice = Backup-Codes bei Geräteverlust. Supabase hat das **nicht** nativ. *Empfehlung:* erstmal **Admin-Faktor-Reset** (Support `unenroll` → User enrollt neu; Helper existiert sinngemäß via `entferneFaktor`/`clearTwoFa`), Recovery-Codes als Folge-Ticket (Custom, gehasht). Mitbauen nur wenn du's gleich willst.

## Blast-Radius (Files)

- `lib/auth/twofa/mfa.ts` — TOTP-Wrapper: `enrolleTotpFaktor()` (gibt `{ factorId, qrCode, secret }` zurück); `challenge`/`verify`/`unenroll` sind bereits generisch (factorId-basiert) → wiederverwendbar. `listePhoneFaktoren` → generalisieren auf `listeFaktoren()` (Typ mitgeben).
- `app/login/2fa/page.tsx` + `TwoFaClient.tsx` — Faktor-Typ-bewusst: TOTP-Faktor → Code-Input ohne SMS-Challenge-Text/Resend. Sauber: Faktor-Typ als Prop + `mode`-Erweiterung (z. B. `mode: 'challenge-sms' | 'challenge-totp' | 'enroll-sms'`), ODER ein generisches `challenge` mit `factorType`-Prop.
- Einstellungen — `TwoFaPhoneChange` zu einem **Faktor-Manager** generalisieren (`TwoFactorSettings`): Liste der Faktoren (Phone + TOTP) mit Add/Remove je Typ; TOTP-Enroll-Modal (QR + verify).
- `lib/auth/mfa-gate.ts` — **keine Änderung** (faktor-agnostisch). Unit-Tests bleiben grün.

## Testing — sauberer als der Phone-Smoke

TOTP-Codes lassen sich aus dem `secret` **berechnen** (z. B. `otplib`/`@otplib/preset-default`). → **Vollautomatischer E2E** ohne SMS/Twilio:
- Enroll: `mfa.enroll(totp)` → `secret` → `otplib.authenticator.generate(secret)` → `verify` → Faktor verifiziert.
- Login: User mit TOTP → /login/2fa → Code aus `secret` berechnen → eingeben → `aal2` → Portal.
- vitest: falls neue pure Routing-Logik (Faktor-Typ-Wahl) — abdecken.

## Effort & Rollout

**~1–1.5 Tage:** Enroll-UI (QR + verify) + Login-TOTP-Handling + Settings-Faktor-Liste + E2E. Kleiner als der ursprüngliche Phone-MFA-Umbau, weil Gate/Middleware/Routing/Migration schon stehen.

**Rollout:** additive Opt-in-Funktion, **kein** Migrations-/Lockout-Risiko (TOTP net-new, niemand wird gezwungen). Phone-MFA unberührt. Standard PR → staging → prod.

## Verwandt
- Phone-MFA-Strecke: `memory/COORDINATION-2fa-supabase-migration-brief.md`
- Navfix-Lehre (Hard-Navigate): #3016
