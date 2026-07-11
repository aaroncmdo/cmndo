# Telefon-Login für alle (Phase 2) — Design

**Datum:** 2026-07-10
**Status:** Design approved (Aaron), Spec-Review ausstehend
**Autor-Session:** eaf5be72 (2FA-/Auth-Lane)
**Vorarbeit:** Kunde Telefon-Login v1 ([[coordination-kunde-phone-login]], #4054 gemergt → `enablePhoneLogin` liegt auf staging), B2 Phone-Login #3902, Kollisions-Note #4030.

## Problem

Zwei Lücken bleiben nach Kunde-v1:

1. **Partner-Registrierung setzt `auth.users.phone` nicht.** `anlegeMaklerKern` (Self-Signup + Admin-createMakler) und der generische `anlegePartnerKern` (Lead-Konversion für makler/werkstatt/SV) legen den Auth-User email-only an. Frische Partner können sich nicht per Telefon einloggen (identische Lücke wie Kunde vor v1).
2. **Telefon-Login kommt heute NUR als Nebeneffekt der SMS-2FA-Einrichtung.** `merkeTwofaTelefon` (im 2FA-Flow) ist der einzige Pfad, der `auth.users.phone` für bestehende Nutzer setzt. Da 2FA **optional** ist, hat jeder, der 2FA überspringt, keinen Telefon-Login — und es gibt keinen Weg, ihn **ohne** 2FA zu aktivieren.

Der Telefon-Login (`LoginClient` Phone-Tab) löst via `signInWithOtp({shouldCreateUser:false})` gegen **`auth.users.phone`** auf und ist rollen-agnostisch — er funktioniert für jede Rolle, sobald die Spalte gesetzt ist. Die Spalte zu füllen ist die ganze Aufgabe.

## Entschiedener Scope (Brainstorming-Q&A mit Aaron)

1. **Verifikation Registrierung:** Auto-Enroll wie Kunde — `auth.users.phone` aus der Partner-Nummer, ohne extra OTP-Schritt, **kein Outbound** (`phone_confirm:true` = silent).
2. **Scope Registrierung:** **Alle Partner-Rollen** (Makler + Werkstatt + SV) — dieselbe Lücke, derselbe Helper, Auto-Enroll = kein Outbound für keine Rolle.
3. **„Phone-Login für alle verfügbar, wie optional 2FA":** ein **Selbst-Service-Weg in den Konto-Einstellungen für JEDE Rolle** (auch bestehende Konten, auch interne Rollen), **entkoppelt von der 2FA-Einrichtung**, **mit SMS-Bestätigung**.

## Teil 1 — Registrierungs-Auto-Enroll (alle Partner-Rollen)

`enablePhoneLogin(admin, userId, telefon)` (existiert bereits, Kunde-v1, `@/lib/auth/phone-login`) an den zwei Partner-Anlage-Chokepoints aufrufen — jeweils direkt nach erfolgreichem `createUser`:

* **`src/lib/makler/anlege-makler.ts`** — `anlegeMaklerKern`, nach `createUser` (~Z.60, `userId` gesetzt). Deckt Makler Self-Signup (`app/makler/registrieren/actions.ts`) + Admin-`createMakler` (`app/admin/makler/actions.ts`).
* **`src/lib/partner/anlege-partner.ts`** — `anlegePartnerKern`, nach `createUser` (~Z.71, `userId` gesetzt). **Unbedingt für alle Rollen** (makler/werkstatt/SV) — kein Rollen-Guard. Deckt die Lead-Konversion aller Partner (`convertPartnerLead`).

Eigenschaften (vom Helper): E.164-Normalisierung via `toE164`, best-effort `updateUserById({phone, phone_confirm:true})` in try/catch, **kein Outbound-SMS**, **fail-safe/kollisionssicher** (UNIQUE → klaut nie eine Nummer, Account-Anlage bricht nie), gibt `boolean` zurück (hier ignoriert — kein Welcome-Hinweis in v1). **New-only per Konstruktion** (beide Kerns laufen nur bei Anlage; kein Relink-Pfad).

Ergebnis: zusammen mit Kunde-v1 hat **jedes neu angelegte Konto** (Kunde + alle Partner) Telefon-Login ab Anlage.

## Teil 2 — Selbst-Service „Telefon-Login"-Karte (jede Rolle, SMS-bestätigt)

### Platzierung
Neue Client-Komponente **`PhoneLoginCard`** in `src/components/auth/`, gerendert in **`KontoSicherheitPanel`** (`src/components/auth/KontoSicherheitPanel.tsx`) — dem geteilten Sicherheits-Panel, das für **alle Rollen** mountet (admin/dispatch/kanzlei/makler/mitarbeiter/kunde/gutachter-SV). Ein Card-Render dort ⇒ automatisch für jede Rolle **und** bestehende Konten verfügbar.

Das Panel holt `user` bereits via `supabase.auth.getUser()`; es reicht `user.phone` (die aktuelle `auth.users.phone`) als Prop an `PhoneLoginCard` durch → Status-Anzeige „aktiv (••• maskiert)" vs „nicht aktiv" ohne Extra-Query. Eigene Karten-Überschrift „Telefon-Login" + kurzer Text — **visuell/semantisch entkoppelt** vom 2FA-Framing des Panels (Aaron: „entkoppelt von 2FA").

### Ablauf (zwei Stufen, analog `TwoFaPhoneChange`)
1. Nummer eingeben → SMS-Code anfordern.
2. Code eingeben → bestätigen → `auth.users.phone` gesetzt (bestätigt), **ohne** MFA-Faktor.

### Mechanismus — Supabase-natives `phone_change`
Gekapselt in **neuen** Server-Actions `src/lib/auth/phone-login-actions.ts` (`'use server'`, SSR-User-Session via `createClient()` — **`mfa.ts`/B2 unberührt**):

* `starteTelefonLoginVerify(phone)`: `toE164` → `supabase.auth.updateUser({ phone: e164 })` → Supabase sendet einen **phone_change**-OTP per SMS. Result-Object (`{ ok, error? }`).
* `bestaetigeTelefonLoginVerify(phone, code)`: `supabase.auth.verifyOtp({ phone: e164, token: code, type: 'phone_change' })` → `auth.users.phone` gesetzt + bestätigt. Result-Object.

**Validierungs-Gate (Planung):** `phone_change` ist Supabase-nativ, aber in diesem Projekt noch ungenutzt — **früh in der Planung an einem Test-Account gegen Prod verifizieren** (updateUser→OTP→verifyOtp-Kette).
**Fallback** (falls `phone_change` im Projekt nicht greift): MFA-enroll→verify→`enablePhoneLogin`(admin, setzt phone)→`entferneFaktor` (Faktor wieder entfernen, damit 2FA NICHT aktiviert wird) — alles bewährte Primitive aus `mfa.ts` + der neue Helper.

### Verhalten
* SMS ist **user-initiiert** (eine SMS pro „Code anfordern"-Klick) — **kein automatischer Blast**; derselbe Verify-Typ wie die bestehende 2FA-Nummer-Karte. Fällt unter „Fix-bestehender = ok" (Outbound-Konvention).
* **Kollision** (Nummer bereits auf anderem Konto, UNIQUE): `updateUser`/`verifyOtp` liefert einen Fehler → Karte zeigt „Diese Nummer ist bereits einem anderen Konto zugeordnet" (analog #4030-Note). Klaut nie.
* Setzt **nur** `auth.users.phone`, keinen MFA-Faktor → Telefon-Login vollständig von 2FA entkoppelt.

## Invarianten

1. **Ein Ziel `auth.users.phone`.** Teil 1 (admin `updateUserById`), Teil 2 (`phone_change`) und der bestehende `merkeTwofaTelefon`-Pfad schreiben dieselbe Spalte harmonisch (last-write-wins, idempotent).
2. **Nie stehlen** (UNIQUE + fail-safe fallback in beiden Teilen).
3. **Login-Seite unverändert** — der Phone-Tab existiert + ist rollen-agnostisch.
4. **Kein DDL** (`auth.users.phone` = Supabase-built-in, bereits UNIQUE).
5. **2FA-Entkopplung:** Teil 2 aktiviert Telefon-Login ohne 2FA-Faktor; 2FA bleibt optional + unabhängig.

## Testing

* **Teil 1:** `enablePhoneLogin`-Unit existiert (Kunde-v1). Mechanismus-Smoke (`scripts/smoke/phone-login-mechanism.mjs`) um einen Partner-Rollen-Fall erweitern (createUser email-only → enablePhoneLogin → `auth.users.phone` gesetzt), empirisch gegen Prod, self-cleaning.
* **Teil 2:** Server-Actions-Unit (`starte/bestaetigeTelefonLoginVerify` — E.164, Result-Shape, Fehlerpfade, gemockte Supabase-Auth). Playwright-Smoke-Muster wie `2fa-enroll-smoke` deckt die Card-UI; **voller SMS-OTP-Round-Trip nicht e2e-automatisierbar** (echter SMS-Empfang) → Card-/Mechanismus-Test + manueller/Prod-Smoke der `phone_change`-Kette. Ehrliche Grenze wie v1.

## Nicht-Ziele (v1, bewusst raus)

* Kein Partner-Welcome-Mail-Hinweis (Discoverability via Karte + Login-Phone-Tab; Follow-up).
* Kein „Telefon-Login deaktivieren" (nur aktivieren/ändern; Follow-up).
* Kein Force-Backfill bestehender Konten — **die Karte IST der „für alle"-Weg** (opt-in statt erzwungen).

## Koordination

Rein additive Touches: `anlege-makler.ts` + `anlege-partner.ts` (je 1 Aufruf), `KontoSicherheitPanel.tsx` (1 Card + 1 Prop-Durchreichung), neue Files (`PhoneLoginCard.tsx` + `phone-login-actions.ts`). **`mfa.ts` / `TwoFaPhoneChange` / B2-Lane unberührt.** Niedrige Kollision (aar-956 = Kunde-Reservierung-Flow, nicht Partner-Anlage/Settings). Marker: `coordination-phone-login-for-all`.

## Dateien (erwartet)

| Datei | Änderung |
|---|---|
| `src/lib/makler/anlege-makler.ts` | +`enablePhoneLogin`-Aufruf nach createUser |
| `src/lib/partner/anlege-partner.ts` | +`enablePhoneLogin`-Aufruf nach createUser (alle Rollen) |
| `src/lib/auth/phone-login-actions.ts` | **NEU** — `starte/bestaetigeTelefonLoginVerify` (phone_change) |
| `src/lib/auth/phone-login-actions.test.ts` | **NEU** — Unit-Test der Actions |
| `src/components/auth/PhoneLoginCard.tsx` | **NEU** — Selbst-Service-Karte (2-Stufen) |
| `src/components/auth/KontoSicherheitPanel.tsx` | +`PhoneLoginCard` + `user.phone`-Prop |
| `scripts/smoke/phone-login-mechanism.mjs` | +Partner-Rollen-Fall (Teil-1-Beweis) |
