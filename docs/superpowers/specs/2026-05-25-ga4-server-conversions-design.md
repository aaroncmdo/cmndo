# Spec: Server-side GA4 Conversions (Measurement Protocol)

**Datum:** 2026-05-25
**Branch:** `kitta/ga4-conversions` (gestackt auf `kitta/ga4-consent-mode-v2` / PR #1709 — nutzt `consent.ts`)
**Status:** Foundation gebaut (Core), Hook-Wiring + Migration = Checkpoint ausstehend (Aaron)

## Ziel

Conversions server-seitig an GA4 melden (robust gegen Adblocker, attribuiert an die Web-Session/den Ads-Klick), consent-respektierend:

| Event | Wann | Hook-Punkt (verifiziert) | Schicht |
|---|---|---|---|
| `generate_lead` | Anfrage generiert | `lib/actions/gutachter-finder-actions.ts` (Anfrage-Insert) + Mini-Wizard | server MP |
| `flowlink_sent` | Flowlink/Magic-Link versandt | `lib/magic-link/dispatch-magic-link.ts` (zentral, `sent===true`) | server MP |
| `sa_signed` | SA-Unterschrift (= „Geld verdient") | `gutachter-finder-actions.ts:197` **und** `app/flow/[token]/actions.ts:754/779` | server MP |
| `phone_call` | Klick auf „Anrufen" | client `gtag('event','phone_call')` site-weit auf `a[href^="tel:"]` | client |

(matelso bewusst raus — Aaron: „scheiss auf matelso", der Klick zählt.)

## Architektur

- **`lib/analytics/ga4-mp.ts`** (FERTIG, getestet 7/7): `parseGaClientId(_ga)` + `sendGa4Event({clientId, events, consentGranted})` (fire-and-forget, graceful-skip ohne `GA4_MP_API_SECRET`/clientId).
- **client_id-Capture + Storage:** `_ga`-Cookie an den frühesten User-Touchpoints lesen → speichern. dispatchMagicLink arbeitet mit `leadId` → `leads.ga_client_id` ist der zentrale Lookup; `gutachter_finder_anfragen.ga_client_id` für die Pre-Lead-Stufe.
- **Consent-Trick (DSGVO):** client_id **nur speichern wenn Consent erteilt** (Consent-Cookie aus `consent.ts` serverseitig prüfen). Späteres Event: client_id vorhanden = Consent war da. Kein client_id = kein Send.

## Migration (Regel 2, supabase-CLI)

```
gutachter_finder_anfragen.ga_client_id text null
leads.ga_client_id text null
```
Additiv, nullable → metadata-only ALTER (kein Table-Rewrite, schnell auch unter Last). Propagation `anfrage.ga_client_id → leads.ga_client_id` in `createLead`/`konvertiereAnfrageZuFall`.

## Capture-Punkte (_ga lesen, server-seitig via cookies())

1. **gutachter-finder-Anfrage-Insert** → `gutachter_finder_anfragen.ga_client_id` + `generate_lead` feuern.
2. **Mini-Wizard-Submit** (`create-lead-from-mini-wizard`) → `leads.ga_client_id` + `generate_lead`.
3. **/flow-Seite** (Kunde signiert SA dort) → live `_ga` aus dem Request.

## Env / Rollout

- `GA4_MP_API_SECRET` (**server-only**, KEIN NEXT_PUBLIC) → runtime via dotenv, `pm2 reload --update-env` reicht (KEIN Rebuild). Setze ich beim Rollout via VPS.
- Stackt auf #1709 → merged danach.

## Offene Entscheidungen (Checkpoint)

1. **`sa_signed` value:** Aaron = „Geld verdient". Für value-based Bidding `value`+`currency` mitsenden? Fester Durchschnitts-Erlös (welcher €-Betrag?) oder erstmal ohne `value` (reines Conversion-Count)?
2. **flowlink_sent zentral in dispatchMagicLink** (jeder erfolgreiche Send = 1 Conversion) — ok?
3. **Migration jetzt** (DB unter Last, 7 Sessions) oder kurz vertagen/koordinieren?

## Status
- ✅ Core `ga4-mp.ts` + Tests (Commit `fb765a1a`).
- ⏳ Migration + Capture + 3 Hooks + client phone_call = nach Checkpoint.
