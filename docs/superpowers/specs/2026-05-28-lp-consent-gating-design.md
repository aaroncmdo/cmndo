# Spec: kfzgutachter-LP — alle Tracking-Tags hinter Google Consent Mode v2

**Datum:** 2026-05-28
**Branch:** `kitta/lp-consent-gating` (PR `--base staging`)
**Status:** Design → direkt Umsetzung (Aaron: „leg los, vorher saubere Spec")
**Trigger:** Externer Audit: auf der LP feuern Clarity/GTM-Tags ohne Consent; „DSGVO"-Trustsiegel auf der LP → Abmahnrisiko. Folge-Arbeit zur Cookiebot→OSS-CMP-Migration (die nur Banner + gtag-Pfad abdeckte).

## Problem / Ist-Zustand (verifiziert im Code)

`src/app/kfzgutachter-lp/page.tsx` lädt **drei** Tag-Surfaces, alle via `<Script strategy="afterInteractive">`:
1. **GTM `GTM-KZNCZB2Z`** (`gtm-head`-Snippet) — lädt `gtm.js`. Der `consent default` wird erst **später** im `ga4-lp-init` gepusht → **GTM init sieht den Default nicht** → GTM-Tags (`G-2F57383L0S`, Ads `AW-…`) laufen ungated.
2. **Microsoft Clarity** (`ms-clarity`-Roh-Snippet, Project `wtz8c2161v`) — lädt **unconditional, ohne Consent-Check**.
3. **LP-GA4 `G-9YF2W9ZP2S`** (`ga4-lp` + `ga4-lp-init`) — gtag mit `consent default` **vor** `config` → DIESER Tag ist consent-korrekt (Prod-Smoke: `gcs G100→G111`). ✓

**NICHT betroffen (verifiziert):**
- **claimondo.de + Haupt-Marketing-Seiten:** kein GTM; GA4 via gtag mit `consent default` vor `config` (Root-Layout), `ClarityInit` consent-gated (`hasTrackingConsent()`). Prod-Smoke bestätigt. → **keine Änderung nötig.**
- **Matelso:** server-side (Webhook `api/webhooks/matelso` + `lib/matelso/process-call`), **kein Client-Pixel** → kein Client-Consent-Gate nötig. Seiten-Phone-Tracking läuft über gtag (gated).

## Ziele
1. Auf der LP: `consent default` (denied, 7 Signale) **vor `gtm.js`** in den dataLayer → GTM-GCM greift.
2. Auf der LP: **Microsoft Clarity nur bei statistics-Consent** laden (statt unconditional).
3. **GTM-Container `GTM-KZNCZB2Z`**: GA4-/Ads-Tags an Consent-Checks binden — **GTM-UI** (Checkliste für Aaron, kein Code).
4. Empirisch belegen: vor Consent feuert auf der LP **nichts** ungated (Clarity lädt nicht; GTM-GA4 nur cookieless `gcs=G100`); nach Accept → granted.

## Non-Goals
- claimondo.de / Haupt-Seiten anfassen (schon korrekt).
- Matelso (server-side).
- Hard-Blocking (Consent-Mode-only bleibt die Linie wie beim CMP).

## Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| consent-default-Ordering LP | `consent default` als **erste Aktion im `gtm-head`-Snippet** pushen (`dataLayer.push(['consent','default',{…}])` vor `gtm.start`) | Next 15: `beforeInteractive` nur im Root-Layout erlaubt, nicht in Pages → Default in den GTM-Snippet ziehen ist der Standard-GCM-Weg + garantiert „vor gtm.js" |
| Clarity-Gate LP | `ClarityInit` um optionalen `projectId`-Prop erweitern; LP rendert `<ClarityInit projectId="wtz8c2161v" />` **statt** Roh-`ms-clarity`-Script; Root-`ClarityInit` SKIPpt `/kfzgutachter-lp` weiterhin | DRY (ein gated Loader), kein Doppel-Init, Clarity nur bei `hasTrackingConsent()` |
| GTM-interne Tags | GTM-UI-Checkliste (Aaron) | Tag-Consent-Settings leben im Container, nicht im Repo |
| ga4-lp-init default | redundanten `gtag('consent','default',…)` entfernen (Default kommt jetzt aus dem gtm-head-Snippet, im selben dataLayer) | eine Quelle, kein doppelter Default |

## Datei-für-Datei

1. **`src/components/analytics/ClarityInit.tsx`** — Signatur `ClarityInit({ projectId }: { projectId?: string } = {})`; `const id = projectId ?? process.env.NEXT_PUBLIC_CLARITY_ID`. Rest unverändert (Consent-Gate via `hasTrackingConsent()` + `CONSENT_CHANGED_EVENT`-Listener bleibt). SKIP_ROUTES bleibt (greift nur für die env-getriebene Root-Instanz; eine explizit mit `projectId` gerenderte Instanz ist immer die LP-eigene). **Wichtig:** SKIP-Logik so anpassen, dass sie nur greift, wenn `projectId` NICHT explizit gesetzt ist (sonst würde die LP-Instanz sich selbst skippen).
2. **`src/app/kfzgutachter-lp/page.tsx`**
   - `gtm-head`-Snippet: als ERSTE Zeile im IIFE `w[l]=w[l]||[]; w[l].push(['consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500}]);` **vor** dem `gtm.start`-Push.
   - **Roh-`ms-clarity`-`<Script>` entfernen**, stattdessen `<ClarityInit projectId="wtz8c2161v" />` rendern (Client-Component, gated). Import ergänzen.
   - `ga4-lp-init`: die `gtag('consent','default',…)`-Zeile entfernen (Default steht schon im dataLayer aus gtm-head); `gtag('js', …)` + `gtag('config', LP_GA4_ID)` bleiben.
3. **GTM-UI (kein Code — Checkliste in PR-Body + Handoff):** Container `GTM-KZNCZB2Z` → Consent Mode aktiv; GA4-Config/Event-Tags „Require additional consent for tag to fire" = `analytics_storage`; Ads-Tags = `ad_storage` (+`ad_user_data`/`ad_personalization`); „Consent Initialization"-Trigger vorhanden.

## Tests / Verifikation
- **Vorher-Smoke (Ist-Zustand belegen):** Playwright auf `kfzgutachter.claimondo.de` (prod) + lokal — protokollieren, welche Requests **vor** Consent feuern: `clarity.ms` (lädt?), `/g/collect` für `G-2F57383L0S` (GTM-GA4) mit welchem `gcs`. Screenshot.
- **Nachher-Smoke (lokal, nach Fix):** vor Consent → **kein `clarity.ms`-Request**; GTM-GA4 `/g/collect` (falls überhaupt) nur `gcs=G100`; `consent default` ist im dataLayer **vor** `gtm.js`. Nach „Alle akzeptieren" → Clarity lädt, `gcs=G111`. Screenshot-Pflicht.
- **Playwright-Hinweis:** vanilla-cookieconsent v3 `hideFromBots` → `navigator.webdriver=false`-Override + `--disable-blink-features=AutomationControlled`.
- `npm run build` grün; `tsc` app-clean; token-audit 0.

## Rollout
1. Vorher-Smoke (Beleg). 2. Code-Fixes + Nachher-Smoke. 3. PR `--base staging`. 4. Aaron: GTM-UI-Checkliste abarbeiten (der Code-Default-vor-gtm.js + Container-GCM zusammen = vollständige Gating). 5. staging→main. 6. Prod-Re-Smoke.

## Audit-Mapping
- Audit-Punkt 1 (default vor gtm.js) → Fix 2 (gtm-head-Snippet). 
- Audit-Punkt 2 (GTM-Tag-Trigger ohne Wartebedingung) → Fix 3 (GTM-UI) + Fix 2 (Default da). 
- Audit-Punkt 3 (Clarity/Matelso/Ads ungated) → Clarity: Fix 1+2; Ads: Fix 3 (GTM-UI); Matelso: n/a (server-side). 
- Audit-Punkt 4 (DSGVO-Claim/Abmahn) → durch 1–3 + Datenschutz (bereits in der CMP-Migration aktualisiert) gedeckt.
