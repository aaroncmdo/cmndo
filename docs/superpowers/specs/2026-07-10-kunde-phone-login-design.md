# Kunde Telefon-Login als First-Class-Registrierungs-Option (v1)

**Datum:** 2026-07-10
**Status:** Design approved (Aaron), Spec-Review ausstehend
**Autor-Session:** eaf5be72 (2FA-/Auth-Lane)
**Vorarbeit:** [[coordination-phone-login-collision-note]] (#4030), B2-Phone-Login #3902

## Problem

Der Telefon-Login (`LoginClient` „Telefon"-Tab) macht `supabase.auth.signInWithOtp({ phone, shouldCreateUser:false })` → loest gegen **`auth.users.phone`** auf (UNIQUE, kanonisch E.164), NICHT gegen `profiles/leads.telefon`. `auth.users.phone` wird aber nur von `merkeTwofaTelefon` (SMS-2FA-Einrichtung, B2 #3902) als Nebeneffekt gesetzt — **keine Registrierung** setzt es. Konsequenz: frisch registrierte Kunden koennen sich NICHT per Telefonnummer anmelden, obwohl der Login-Tab existiert. Kunden loggen sich heute per Email-Magic-Link ein; das Telefon waere fuer sie (mobil-first, oft ohne Passwort) die natuerlichere Identitaet.

## Entschiedener Scope (aus Brainstorming Q&A mit Aaron)

1. **Rolle:** Kunde zuerst (Makler = Phase 2, eigener Spec).
2. **Vertrauen/Verifikation:** Auto ab Konto-Erstellung — `auth.users.phone` wird aus der Flow-Nummer gesetzt, ohne zusaetzlichen OTP-Schritt. Begruendung: SMS-OTP beim Login ist selbstschuetzend (nur der physische Nummern-Besitzer kann den Login abschliessen); Kunde-Risikoprofil moderat (sieht nur den eigenen Claim).
3. **Backfill:** NUR neue Konten (kein Bulk-Backfill, kein Lazy-Backfill in v1). Bestehende Kunden = Follow-up.
4. **Discoverability:** Willkommens-Nachricht weist auf Telefon-Login hin — **konditional** (nur wenn der Enroll wirklich griff).

## Nicht-Ziele (v1, bewusst raus)

- Kein Backfill bestehender Kunde-Konten (weder Migration noch lazy).
- Kein Makler/SV/Werkstatt (Kunde-only; Makler = Phase 2).
- Kein zusaetzlicher In-Flow-OTP-Verify-Schritt (Auto-Trust gewaehlt).
- Keine Aenderung an der Login-Seite selbst (`LoginClient`-Phone-Tab existiert + funktioniert bereits, sobald `auth.users.phone` gesetzt ist — nur verifizieren, dass kein Kunde-Gate im Weg steht).

## Design

### Komponente 1 — Shared Helper `enablePhoneLogin` (NEU, kollisionsfrei)

`src/lib/auth/phone-login.ts`:

```ts
// Setzt auth.users.phone (E.164, confirmed) fuer einen User -> aktiviert passwordless
// Telefon-Login (signInWithOtp loest dagegen auf). FAIL-SAFE + kollisionssicher:
// auth.users.phone ist UNIQUE -> bei Kollision (Nummer bereits auf anderem Konto)
// schlaegt updateUserById fehl; wir fangen das ab, das aeltere Konto behaelt die
// Nummer, dieses Konto faellt auf Email/Magic-Link zurueck. Gibt zurueck, ob es griff.
export async function enablePhoneLogin(
  admin: AdminClient,
  userId: string,
  phone: string | null,
): Promise<boolean> {
  const e164 = toE164(phone ?? '')
  if (!e164) return false
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      phone: e164,
      phone_confirm: true,
    })
    if (error) { console.warn('[phone-login] auth.users.phone-Sync uebersprungen:', error.message); return false }
    return true
  } catch (err) {
    console.warn('[phone-login] auth.users.phone-Sync Ausnahme:', err)
    return false
  }
}
```

- **Testbar isoliert** (pure-ish; nur Admin-Client-Dependency).
- **DRY-Perspektive:** `merkeTwofaTelefon` (mfa.ts, B2-Lane) enthaelt heute dieselbe Logik inline — es KANN diesen Helper spaeter adoptieren (koordiniert mit B2; nicht Teil von v1, um die dormante B2-Datei nicht anzufassen). Wiederverwendbar fuer Makler (Phase 2) + Lazy-Backfill (Follow-up).

### Komponente 2 — Integration in `createKundeAccount`

`src/app/flow/[token]/actions.ts` (heisses aar-956-File → minimaler Touch):
- **Nur im Neu-Konto-Zweig** (der `createUser`-Pfad, nicht der Relink-Pfad): `enablePhoneLogin(admin, authUser.user.id, telefon)` aufrufen. Der Relink-Pfad (existierender Kunde) bleibt unberuehrt → honoriert „nur neue Konten". Der genaue Einhaengepunkt (siehe Sequencing) haengt vom konditionalen Hinweis ab.
- **Sequencing fuer den konditionalen Hinweis:** der Enroll muss laufen, BEVOR die Willkommens-Nachricht komponiert wird, damit die Nachricht das Ergebnis spiegeln kann. Umsetzung (im Impl-Plan finalisiert): entweder (a) `isNew`-Flag + `enablePhoneLogin`-Aufruf in `finalizeKundeSetup` VOR `sendWelcomeWithLogin` (nur wenn `isNew`), Ergebnis-Bool an die Welcome-Sends durchreichen; oder (b) Enroll im Neu-Zweig vor dem Welcome-Send. Praeferenz (a) — Enroll + Messaging colocated.

### Komponente 3 — Discoverability (konditional)

- **Primaer:** die Kunde-Willkommens-Email (`sendKundeWelcome`, `lib/email/google/flows.ts`) bekommt bei `phoneLoginAktiviert===true` eine Zeile „Du kannst dich kuenftig auch direkt mit deiner Telefonnummer anmelden".
- **Optional additiv:** die Self-Service-Willkommens-WhatsApp (flow/[token]/actions.ts, Z.~676ff) — geht an genau die Nummer, die zur Login-Identitaet wird → ideale Bestaetigungs-Flaeche. Kann in v1 oder als Mini-Follow-up.
- **Konditional** = kein Hinweis, wenn der Enroll (Kollision) nicht griff → kein verwirrendes „log dich per Telefon ein", das dann fehlschlaegt.

### Login-Seite

Unveraendert. `LoginClient` „Telefon"-Tab macht bereits `signInWithOtp`→`verifyOtp`→`finalisierePhoneLogin`. **Zu verifizieren (kein erwarteter Change):** kein rollen-spezifisches Gate blockiert Kunde; `finalisierePhoneLogin` (setzt `auth_provider='phone'`, `force_password_change=false`) + `roleToPath('kunde')` fuehren korrekt ins Kunde-Portal.

## Invarianten (Sicherheit)

1. **Nie stehlen:** `updateUserById({phone})` failt bei UNIQUE-Kollision → das aeltere Konto behaelt die Nummer. Keine Login-Uebernahme moeglich.
2. **SMS-OTP selbstschuetzend:** nur der physische Besitzer der Nummer kann den Login abschliessen.
3. **Account-Erstellung bricht NIE** an einer Telefon-Kollision (Enroll ist best-effort/non-fatal, getrennt vom `createUser`).
4. **Posture:** passwordless-SMS ist fuer Kunde ein primaerer Weg, besitz-basiert vergleichbar mit dem bestehenden Email-Magic-Link. Restrisiko getippte/falsche Nummer = UX-Fallback auf Email, kein Breach.

## Testing

- **Mechanismus-Smoke (automatisierbar, Prod):** ein neu via `createKundeAccount` erzeugtes Kunde-Konto hat `auth.users.phone` gesetzt (Admin-API-Check, analog den bestehenden 2FA-Smokes; Test-Isolation via telefon=Test-Nummer). Kollisions-Fall: zweites Konto mit gleicher Nummer → `auth.users.phone` bleibt beim ersten, Account-Erstellung erfolgreich.
- **Helper-Unit-Test:** `enablePhoneLogin` — E.164-Normalisierung, Erfolg=true, Kollision/Fehler=false (mit gemocktem Admin-Client).
- **Ehrliche Grenze:** der volle SMS-OTP-Login ist NICHT e2e-automatisierbar (echter SMS-Empfang). Absicherung = Mechanismus-Smoke + die bestehenden, bereits verifizierten Login-Bausteine.

## Koordination

- `phone-login.ts` = neue Datei → 0 Kollision.
- `createKundeAccount` / `finalizeKundeSetup` = **heisses aar-956-File** (bis zu 7 Sessions gleichzeitig). Touch minimal halten (1 Aufruf + ggf. 1 Flag-Param); **Broadcast an die aar-956-Lane** vor dem Merge, damit sie beim Guard/Top-Konflikt rebasen. Bodies unberuehrt.
- `sendKundeWelcome` (`flows.ts`) = additive Zeile.
- Marker: `coordination-kunde-phone-login`.

## Dateien (erwartet)

| Datei | Aenderung |
|---|---|
| `src/lib/auth/phone-login.ts` | NEU — `enablePhoneLogin` Helper |
| `src/lib/auth/phone-login.test.ts` | NEU — Unit-Test |
| `src/app/flow/[token]/actions.ts` | +Enroll-Aufruf im Neu-Zweig (+ ggf. `isNew`-Flag durch `finalizeKundeSetup`) |
| `src/lib/email/google/flows.ts` | konditionale Telefon-Login-Zeile in `sendKundeWelcome` |
| `tests/e2e/flows/kunde-phone-enroll-smoke.spec.ts` | NEU — Mechanismus-Smoke (opt-in) |
