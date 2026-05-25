# Spec: GA4 + Google-Ads mit Consent-Mode v2 + Host-Gating

**Datum:** 2026-05-25
**Branch:** `kitta/ga4-consent-mode-v2` (PR `--base staging`)
**Status:** Design — Review ausstehend (Aaron)
**Trigger:** Google-Tag (GA4 `G-CFMJHZM2NR`) auf claimondo.de aktivieren.

## Problem / Ausgangslage

- gtag.js-Loader existiert bereits in `src/app/layout.tsx:153-190` (liest `NEXT_PUBLIC_GA4_ID` + `NEXT_PUBLIC_GADS_ID`), ist aber **nicht consent-gated** (Code-Kommentar: „noch nicht consent-gated; CookieBanner-Integration ist offen").
- `CookieBanner.tsx` (react-cookie-consent@10) hat „Alle akzeptieren"/„Nur notwendige", aber **keine** `onAccept`/`onDecline`-Verdrahtung → Klick setzt nur das Cookie, triggert kein Consent-Update.
- gtag.js würde heute auf **jedem** Host laden (auch app./gutachter./makler./kfzgutachter./staging) → GA4-Property-Pollution + DSGVO-Problem.
- Aktuell ist **keine** GA/Ads/Clarity-ID in `/etc/claimondo/.env.local` gesetzt (per VPS-Recon verifiziert) → es lädt heute nichts (keine Live-Verletzung). Die Lücke entstünde erst beim Setzen der ID.

## Ziele

1. GA4 (`G-CFMJHZM2NR`) + optional Google-Ads laden **nur** auf der Marketing-Hauptdomain (`claimondo.de`, `www.claimondo.de`).
2. **Consent-Mode v2**: Default `denied` für `ad_storage` / `ad_user_data` / `ad_personalization` / `analytics_storage` (+ `wait_for_update: 500`); Upgrade auf `granted` erst nach „Alle akzeptieren".
3. Wiederkehrer mit bereits erteiltem Consent: server-seitiger Default = `granted` (kein Flicker).
4. Microsoft Clarity (`ClarityInit`) auf Public-Seiten **consent-gaten**. Für den Anfang läuft Clarity primär auf Public-Seiten; keine Portal-Sonderbehandlung.
5. `.env.example` dokumentieren.

## Non-Goals

- Server-side Measurement Protocol (gepostetes MP-API-Secret bleibt außen vor — eigener Scope).
- Granulares Consent-UI (analytics vs. ads getrennt). Banner bleibt binär.
- GA4-Property Stream-Filter (Allow-list-only gewählt).
- Portal-Clarity (Onboarding-Consent-Pfad) — verschoben.

## Entscheidungen (aus Brainstorming, von Aaron bestätigt)

| Thema | Entscheidung | Begründung |
|---|---|---|
| Subdomain-Gate | **Host-Allow-list** `{claimondo.de, www.claimondo.de}` | Neue Subdomains nie versehentlich getrackt |
| Consent-Default-Quelle | **Server-Read** des Cookies (`cookies()` in layout) | Kein denied→granted-Flicker für Wiederkehrer |
| Script-Ordering | Consent-`default` **vor** `config` im selben inline-Script | Race-frei: dataLayer-Queue-Order garantiert |
| Clarity | **Reines Consent-Gate** auf Banner-Cookie/-Event, kein Host-Gate, kein Portal-Sonderfall | „Clarity erst mal nur public" |
| ENV | `NEXT_PUBLIC_GA4_ID` **build-time** auf VPS | NEXT_PUBLIC wird beim `npm run build` inlined |
| Test-Seam | in `NODE_ENV !== 'production'` zählt `localhost` als Tracking-Host | Positiv-Smoke lokal möglich |

## Architektur

Eine Consent-Quelle (Cookie `claimondo-cookie-consent` = `"true"`/`"false"`) → 3 Consumer:

1. **layout.tsx** (server) — rendert gtag-Block (host-gated) mit Consent-Default aus dem Cookie.
2. **CookieBanner** (client) — erteilt/widerruft Consent → `gtag('consent','update',…)` + feuert `CONSENT_GRANTED_EVENT`.
3. **ClarityInit** (client) — init nur bei Consent (sofort wenn Cookie=`true`, sonst auf Event).

Geteilte Logik in neuem Modul `src/lib/analytics/consent.ts` (Redundanz-Regel: 3 Consumer → Shared).

### Consent-Flow

- Request → layout liest `host` + Consent-Cookie.
- `host ∈ Allow-list ∧ GA-ID gesetzt` → gtag-Block rendern:
  - inline (synchron, eine Reihenfolge): `gtag('consent','default',{… : cookie==='true'?'granted':'denied', wait_for_update:500})` → `gtag('js', new Date())` → `gtag('config', GA4)` → `gtag('config', GADS)`
  - dann `<Script src=…/gtag/js?id=…>` (`afterInteractive`) → drained die Queue in Order → Default greift garantiert vor jedem Tag.
- CookieBanner (public, Banner sichtbar):
  - „Alle akzeptieren" → `consent update granted` + dispatch `CONSENT_GRANTED_EVENT`.
  - „Nur notwendige" → `consent update denied`.
  - Wiederkehrer-akzeptiert: react-cookie-consent feuert `onAccept` beim Mount → re-grant (idempotent) + Event.
- ClarityInit: `hasTrackingConsent()` → init; sonst Listener auf `CONSENT_GRANTED_EVENT` (once-Guard via ref).

### Error-Handling

- Alle `window.gtag?.()` optional-chained (Script evtl. noch nicht geladen / host-gated).
- `hasTrackingConsent()` guard auf `typeof document`.
- Host-Parsing guard für null / Port / Case.
- Clarity once-Guard gegen Doppel-Init.
- `consentState` ist immer literal `'granted'`/`'denied'` (aus Boolean abgeleitet → kein Injection-Vektor im inline-Script).

## Datei-für-Datei

1. **`src/lib/analytics/consent.ts`** (NEU)
   - `CONSENT_COOKIE_NAME = 'claimondo-cookie-consent'`
   - `CONSENT_GRANTED_EVENT = 'claimondo:consent-granted'`
   - `isTrackingHost(host: string | null | undefined): boolean` — Allow-list `{claimondo.de, www.claimondo.de}`, Port abschneiden, lowercase, + `NODE_ENV!=='production'`-localhost-Seam.
   - `hasTrackingConsent(): boolean` — liest `document.cookie` via Regex aus `CONSENT_COOKIE_NAME` (kein Lib-Import-Pfad-Risiko).
   - Plain-Modul (kein `'use server'`/`'use client'`) → von Server **und** Client importierbar; nur Konstanten + reine Funktionen.

2. **`src/app/layout.tsx`**
   - `import { headers, cookies } from 'next/headers'` (beide `await` — Next 15).
   - host + consent lesen; `shouldLoadGtag = isTrackingHost(host) && Boolean(primaryGtagId)`.
   - gtag-Block: Consent-`default` (state aus Cookie) **vor** `js`/`config`, im selben inline-Script. Block nur wenn `shouldLoadGtag`.
   - Hinweis: layout ist bereits dynamisch (`getLocale()` liest Cookie) → `headers()`/`cookies()` kosten keine Static-Regression.

3. **`src/components/CookieBanner.tsx`**
   - `onAccept` → `grantConsent()`; `onDecline` → `denyConsent()`.
   - Import `CONSENT_GRANTED_EVENT`. `window.gtag` optional-chained.
   - `isAuthenticatedRoute` bleibt privat/unverändert (Clarity nutzt es nicht).

4. **`src/components/analytics/ClarityInit.tsx`**
   - Consent-Gate: `hasTrackingConsent()` → init; sonst Listener `CONSENT_GRANTED_EVENT` (once-Guard).
   - `SKIP_ROUTES` bleibt.

5. **`.env.example`**
   - `NEXT_PUBLIC_GA4_ID=`, `NEXT_PUBLIC_GADS_ID=`, `NEXT_PUBLIC_CLARITY_ID=` mit Kommentaren.

6. **`src/lib/analytics/__tests__/consent.test.ts`** (NEU)
   - `isTrackingHost`: claimondo.de ✓, www ✓, app/gutachter/makler/kfzgutachter ✗, Port-Handling, null ✗, case-insensitive, localhost (dev ✓ / prod ✗).

## Tests

- **Unit (vitest):** `isTrackingHost` exhaustiv.
- **Lokaler Positiv-Smoke:** `.env.local` mit `NEXT_PUBLIC_GA4_ID=<test-id>`, dev-server, localhost → gtag lädt, Consent-Default `denied` (DevTools → `dataLayer`), „Alle akzeptieren" → `consent update granted`. Screenshot-Pflicht (Memory-Regel).
- **Staging-Negativ-Smoke:** app.staging.claimondo.de → **kein** gtag-Script (Allow-list); CookieBanner accept/decline wirft nicht. Screenshot.

## Rollout (Reihenfolge — kritisch)

1. Code → PR `--base staging`.
2. Aaron testet staging (Negativ-Pfad; Positiv lokal).
3. `staging → main`.
4. **DANN** VPS: `NEXT_PUBLIC_GA4_ID=G-CFMJHZM2NR` in `/etc/claimondo/.env.local` (**build-time**!) → prod **rebuild** → `pm2 reload claimondo-v2`.
   - ⚠️ NIE die ID setzen + rebuilden, solange der ungegatete Code live ist.
   - prod+staging teilen `/etc/claimondo/.env.local` → staging-Build inlined die ID auch, aber Host-Gate hält gtag von staging fern.
   - **OFFEN:** exakter prod-Deploy-Befehl (`/var/www/claimondo-v2` ist kein git-Repo, Build-Source `/root/cmndo-work`).

## Audit-Vorbereitung (7-Punkte, AGENTS.md)

- **Build:** voller `npm run build` (layout.tsx = Layout-Change → Next-15-Validator).
- **UI:** kein neuer Einstiegspunkt (Banner existiert); reine Consent-Verdrahtung.
- **Redundanz:** `consent.ts` Shared statt 3× inline.
- **Dead-Code:** keine.
- **Spec:** diese Datei.
- **Inkonsistenz:** Result-Pattern n/a (keine Server-Action); Brand-Tokens n/a.
- **Regression:** layout.tsx = root → Build-Gate + Portal-Smoke (Banner-Sichtbarkeit unverändert; authenticated-Routen weiter ohne Banner).

## Sicherheit (optionale Folgemaßnahme)

GH-Token in `cmndo-work` Remote-URL + Root-PW + MP-Secret liegen im Chat-Transkript → nach Abschluss rotieren (Aaron entscheidet).
