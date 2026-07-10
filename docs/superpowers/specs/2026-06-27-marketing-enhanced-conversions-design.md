# Enhanced Conversions für die Marketing-Lead-Forms — Design

**Branch:** `kitta/marketing-enhanced-conversions` (stacked auf #3221/`marketing-vitest` wegen vitest; nach #3221+#3197-Merge auf `staging` rebasen)
**Stand:** 2026-06-27
**Scope (Aaron):** komplett — Client (4 gtag-Forms) + Server (Mini-Wizard MP).

## Ziel
Bei `generate_lead` die ohnehin erfassten Form-Daten (Telefon/Name/E-Mail) als **gehashte** user-provided data mitsenden → bessere Match-Rates + Attribution in Google Ads (besonders unter Consent-Mode-Modeling). Genau der ROI-Hebel des P1-Tickets.

## Architektur

### Client (gtag.js — Home/Check/BeratungModal/StickyCallBar)
- Neuer Helper `claimondo-marketing/lib/analytics/user-data.ts` (plain module, wie `track-event.ts`):
  - `toE164(raw)` — DE-Telefon → E.164 (gespiegelt aus `value-model.ts`).
  - `splitName(name)` — „Max Mustermann" → `{first_name, last_name}`.
  - `buildUserData({name,phone,email})` → `{ phone_number, email?, address:{first_name,last_name} }` (rohe, normalisierte Werte) oder `null`.
  - `setUserData(input)` → `gtag('set','user_data', buildUserData(input))` (no-op ohne window/gtag/Daten).
- **gtag.js hasht client-seitig SHA-256** + Consent-Mode redacted `user_data` automatisch bei `ad_user_data=denied` → **kein Roh-PII ohne Einwilligung.**
- Aufruf **vor** `trackEvent('generate_lead')` in: HomeLeadFormClient (Tel+Name), CheckFunnelClient (Tel+Name), BeratungModal (Tel+Name+E-Mail), StickyCallBar (Tel+Name).

### Server (Measurement Protocol — Mini-Wizard `/schaden-melden`)
- Neuer Helper `claimondo-marketing/lib/analytics/user-data-mp.ts` (SERVER-ONLY, `node:crypto`):
  - `buildHashedUserData({email,phone,firstName,lastName})` → `{ sha256_email_address?, sha256_phone_number?, address:{sha256_first_name,sha256_last_name} }` (normalisiert → SHA-256 hex) oder `null`. Reuse `toE164` aus `user-data.ts`.
- `ga4-mp.ts` `sendGa4Event(opts)` → neues optionales `userData` → in MP-Body als `user_data`.
- `ga4-conversions.ts` `trackServerConversion(clientId, event, userData?)` → durchreichen.
- `createLeadFromMiniWizard`: hat E-Mail+Tel+Vor-/Nachname → `buildHashedUserData(...)` an `trackServerConversion`. Schließt die „Monika-UPD-Falle" (E-Mail = bester Match-Key).
- ⚠️ **MP-`user_data`-Shape** nach GA4-MP-UPD-Spec implementiert, aber **in GA4 DebugView verifizieren** (keine bestehende Referenz im Repo).

## Privacy / Consent
- Nur Hashes raus: client (gtag SHA-256) + server (`node:crypto` SHA-256). Kein Roh-PII an Google.
- Consent: client via Consent-Mode `ad_user_data` (automatisch redacted); server via `consent`-Feld im MP-Body (schon vorhanden) + client_id ist bereits consent-gated.
- ⚠️ **Konsole/Legal (Aaron):** (1) Ads → „Enhanced Conversions for Leads" aktivieren + Google-EC-Bedingungen akzeptieren; (2) GA4 → „User-provided data collection" an; (3) Datenschutzerklärung: EC/Google-User-Data-Verarbeitung erwähnen (DSB-Check).

## Tests (vitest)
- `user-data.test.ts`: toE164 (DE-Varianten), splitName, buildUserData (Felder/Weglassen).
- `user-data-mp.test.ts`: buildHashedUserData — deterministische SHA-256 (Normalisierung lowercase/E.164 vor Hash), Weglassen leerer Felder.

## Out of Scope
- GTM-basierte LPs (kfzgutachter-lp) — die hashen EC GTM-seitig (eigener Pfad).
- Ads-Offline-Conversion-Import (gclid-Webhook) — separat (`tracking-webhook-core.ts`).
- Adress-Felder über Name hinaus (Straße/PLZ) — die Forms erfassen sie nicht zuverlässig.
