# Consent-CMP OSS-Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cookiebot (kostenpflichtig pro Domain, Subdomain-Banner kaputt) durch das gratis self-hosted `vanilla-cookieconsent` (orestbida v3) ersetzen — Google Consent Mode v2 bleibt 1:1 erhalten.

**Architecture:** Ein Client-`ConsentManager` initialisiert das OSS-CMP auf Marketing-Hosts, mappt Kategorien (analytics/ads) auf GCM-Signale und feuert `gtag('consent','update', …)`. Der server-gerenderte gtag-`consent default` (denied, 7 Signale) in `layout.tsx` bleibt unverändert. Consent-Quelle ist das OSS-Cookie `cc_cookie`; alle Consumer (`ClarityInit`, `ga4-conversions`) lesen es über `src/lib/analytics/consent.ts`. Consent-Nachweis landet in Supabase `consent_records`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, `vanilla-cookieconsent@3`, Google Consent Mode v2 (gtag), Supabase (Postgres), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-27-consent-cmp-oss-migration-design.md`

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/lib/analytics/consent.ts` | Consent-Helper (Host-Gating, Cookie-Parse, GCM-Mapping) — Cookiebot-frei | rewrite |
| `src/lib/analytics/__tests__/consent.test.ts` | Unit-Tests dafür | rewrite/extend |
| `src/lib/analytics/cookie-declaration.ts` | Gepflegte Cookie-Liste (Deklaration) | create |
| `src/components/analytics/ConsentManager.tsx` | OSS-CMP-Init + GCM-Update + Record-Write + Widerruf | create |
| `src/components/analytics/ClarityInit.tsx` | Clarity consent-gated | modify (event-Konstante) |
| `src/lib/analytics/ga4-conversions.ts` | server Conversion-Gate | modify (Cookie/Parse) |
| `src/app/api/consent/route.ts` | POST schreibt Consent-Record | create |
| `supabase/migrations/<ts>_consent_records.sql` | Tabelle `consent_records` | create |
| `src/app/layout.tsx` | Cookiebot-Script raus, ConsentManager mounten | modify |
| `src/app/kfzgutachter-lp/page.tsx` | LP nutzt geteiltes Consent (Cookiebot-Bezug raus) | modify |
| `src/content/legal/datenschutz.md` | CMP/Cookie-Deklaration/Widerruf | modify |
| `src/components/landing/LandingFooter.tsx` | „Cookie-Einstellungen"-Widerruf-Link | modify |
| `tests/e2e/consent-cmp.spec.ts` | Playwright-Smoke (Apex + kfzgutachter) | create |

**Migrations-Reihenfolge-Hinweis:** consent.ts (Task 1) definiert die Symbole, die alle Consumer importieren → zuerst. Danach Consumer (Tasks 3,5,6). Cookiebot-Entfernung (Task 5) erst NACHDEM der ConsentManager steht (Task 3), sonst ist die Seite kurz consent-los.

---

## Task 1: `consent.ts` Cookiebot-frei umschreiben

**Files:**
- Modify: `src/lib/analytics/consent.ts`
- Test: `src/lib/analytics/__tests__/consent.test.ts`

Aktuelle Exports (raus): `COOKIEBOT_CBID`, `COOKIEBOT_COOKIE_NAME`, `COOKIEBOT_CONSENT_EVENT`, `parseCookiebotConsent`, `isCookiebotHost`, `COOKIEBOT_HOSTS`. Bleiben: `isTrackingHost`. Neu: `CONSENT_COOKIE_NAME`, `CONSENT_CHANGED_EVENT`, `CONSENT_POLICY_VERSION`, `MARKETING_HOSTS`, `isMarketingHost`, `parseConsent`, `hasTrackingConsent` (liest `cc_cookie`), `categoriesToGcm`.

- [ ] **Step 1: Test schreiben** — `src/lib/analytics/__tests__/consent.test.ts` ersetzen:

```typescript
import { describe, it, expect } from 'vitest'
import {
  isMarketingHost, isTrackingHost, parseConsent, categoriesToGcm,
} from '../consent'

describe('isMarketingHost', () => {
  it('erlaubt Apex + www + LP-Subdomain', () => {
    for (const h of ['claimondo.de', 'www.claimondo.de', 'kfzgutachter.claimondo.de'])
      expect(isMarketingHost(h)).toBe(true)
  })
  it('blockt Portale', () => {
    for (const h of ['app.claimondo.de', 'gutachter.claimondo.de', 'makler.claimondo.de'])
      expect(isMarketingHost(h)).toBe(false)
  })
  it('schneidet Port ab + case-insensitive', () => {
    expect(isMarketingHost('Claimondo.de:443')).toBe(true)
  })
  it('null → false', () => { expect(isMarketingHost(null)).toBe(false) })
})

describe('parseConsent (cc_cookie JSON, url-encoded)', () => {
  const mk = (cats: string[]) => encodeURIComponent(JSON.stringify({ categories: cats }))
  it('liest analytics/ads aus categories', () => {
    expect(parseConsent(mk(['necessary', 'analytics']))).toEqual({ statistics: true, marketing: false })
    expect(parseConsent(mk(['necessary', 'analytics', 'ads']))).toEqual({ statistics: true, marketing: true })
  })
  it('leer/invalid → alles false', () => {
    expect(parseConsent(undefined)).toEqual({ statistics: false, marketing: false })
    expect(parseConsent('not-json')).toEqual({ statistics: false, marketing: false })
  })
})

describe('categoriesToGcm', () => {
  it('mappt analytics→analytics_storage, ads→ad_*', () => {
    expect(categoriesToGcm({ statistics: true, marketing: false })).toEqual({
      analytics_storage: 'granted', functionality_storage: 'granted',
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    })
  })
})
```

- [ ] **Step 2: Test laufen → FAIL**

Run: `npx vitest run src/lib/analytics/__tests__/consent.test.ts`
Expected: FAIL (`isMarketingHost`/`parseConsent`/`categoriesToGcm` nicht exportiert).

- [ ] **Step 3: `consent.ts` implementieren** — Datei-Inhalt ersetzen:

```typescript
// Shared Tracking-Consent + Host-Gating. Quelle: vanilla-cookieconsent (cc_cookie).
// Plain-Modul (kein 'use server'/'use client') → server+client importierbar.

export const CONSENT_COOKIE_NAME = 'cc_cookie'            // orestbida v3 default
export const CONSENT_CHANGED_EVENT = 'claimondo:consent-changed'
export const CONSENT_POLICY_VERSION = '2026-05-27'

/** GA4/Ads-Tracking-Hosts (gtag lädt nur hier). */
const TRACKING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de'])
/** Marketing-Hosts, auf denen das CMP/Banner läuft (breiter; LP inkl.). NICHT Portale. */
const MARKETING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de', 'kfzgutachter.claimondo.de'])

function matchHost(host: string | null | undefined, set: Set<string>): boolean {
  if (!host) return false
  const h = host.split(':')[0].toLowerCase()
  if (set.has(h)) return true
  if (process.env.NODE_ENV !== 'production' && (h === 'localhost' || h === '127.0.0.1')) return true
  return false
}

export function isTrackingHost(host: string | null | undefined): boolean { return matchHost(host, TRACKING_HOSTS) }
export function isMarketingHost(host: string | null | undefined): boolean { return matchHost(host, MARKETING_HOSTS) }

export type ConsentState = { statistics: boolean; marketing: boolean }

/** Parst das url-encodierte cc_cookie-JSON → { statistics, marketing }. */
export function parseConsent(cookieValue: string | null | undefined): ConsentState {
  if (!cookieValue) return { statistics: false, marketing: false }
  try {
    const data = JSON.parse(decodeURIComponent(cookieValue)) as { categories?: string[] }
    const cats = Array.isArray(data.categories) ? data.categories : []
    return { statistics: cats.includes('analytics'), marketing: cats.includes('ads') }
  } catch { return { statistics: false, marketing: false } }
}

/** Client: hat der User statistics (analytics) freigegeben? */
export function hasTrackingConsent(): boolean {
  if (typeof document === 'undefined') return false
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE_NAME + '=([^;]+)'))
  return parseConsent(m?.[1]).statistics
}

/** Kategorie-State → GCM-v2-Update-Payload. */
export function categoriesToGcm(c: ConsentState): Record<string, 'granted' | 'denied'> {
  return {
    analytics_storage: c.statistics ? 'granted' : 'denied',
    functionality_storage: c.statistics ? 'granted' : 'denied',
    ad_storage: c.marketing ? 'granted' : 'denied',
    ad_user_data: c.marketing ? 'granted' : 'denied',
    ad_personalization: c.marketing ? 'granted' : 'denied',
  }
}
```

- [ ] **Step 4: Test laufen → PASS**

Run: `npx vitest run src/lib/analytics/__tests__/consent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/consent.ts src/lib/analytics/__tests__/consent.test.ts
git commit -m "feat(consent): consent.ts auf vanilla-cookieconsent umstellen (Cookiebot raus)"
```

---

## Task 2: Cookie-Deklaration

**Files:** Create `src/lib/analytics/cookie-declaration.ts`

- [ ] **Step 1: Datei anlegen**

```typescript
// Gepflegte Cookie-/Storage-Deklaration (DSGVO). Bei neuen Tracking-Tools ergaenzen.
export type CookieRow = { name: string; provider: string; purpose: string; duration: string }
export const COOKIE_DECLARATION: Record<'necessary' | 'analytics' | 'ads', CookieRow[]> = {
  necessary: [
    { name: 'cc_cookie', provider: 'Claimondo', purpose: 'Speichert die Consent-Auswahl', duration: '6 Monate' },
  ],
  analytics: [
    { name: '_ga, _ga_*', provider: 'Google Analytics 4', purpose: 'Statistik/Reichweitenmessung', duration: 'bis 2 Jahre' },
    { name: '_clck, _clsk', provider: 'Microsoft Clarity', purpose: 'Session-Analyse/Heatmaps', duration: 'bis 1 Jahr' },
  ],
  ads: [
    { name: '_gcl_*', provider: 'Google Ads', purpose: 'Conversion-Messung', duration: 'bis 90 Tage' },
  ],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analytics/cookie-declaration.ts
git commit -m "feat(consent): Cookie-Deklarations-Liste"
```

---

## Task 3: ConsentManager (OSS-CMP-Init + GCM + Record)

**Files:**
- Create: `src/components/analytics/ConsentManager.tsx`
- Add dep: `vanilla-cookieconsent`

- [ ] **Step 1: Dependency installieren**

Run: `npm install vanilla-cookieconsent@^3`
Expected: in `package.json` unter dependencies.

- [ ] **Step 2: ConsentManager schreiben**

```tsx
'use client'

import { useEffect } from 'react'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import { CONSENT_CHANGED_EVENT, CONSENT_POLICY_VERSION, categoriesToGcm, type ConsentState } from '@/lib/analytics/consent'

declare global { interface Window { gtag?: (...args: unknown[]) => void } }

function currentState(): ConsentState {
  return { statistics: CookieConsent.acceptedCategory('analytics'), marketing: CookieConsent.acceptedCategory('ads') }
}

function applyConsent() {
  const state = currentState()
  // 1) GCM v2 update
  try { window.gtag?.('consent', 'update', categoriesToGcm(state)) } catch {}
  // 2) Consumer (ClarityInit etc.) benachrichtigen
  try { window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT)) } catch {}
  // 3) Consent-Record (fire-and-forget, darf nie brechen)
  try {
    void fetch('/api/consent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: ['necessary', state.statistics && 'analytics', state.marketing && 'ads'].filter(Boolean), policyVersion: CONSENT_POLICY_VERSION }),
      keepalive: true,
    })
  } catch {}
}

export function ConsentManager() {
  useEffect(() => {
    CookieConsent.run({
      guiOptions: { consentModal: { layout: 'box', position: 'bottom left' }, preferencesModal: { layout: 'box' } },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {},
        ads: {},
      },
      language: {
        default: 'de',
        translations: {
          de: {
            consentModal: {
              title: 'Wir verwenden Cookies',
              description: 'Wir nutzen Cookies fuer Statistik und Marketing. Notwendige Cookies sind immer aktiv. Du kannst frei waehlen und jederzeit widerrufen.',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Ablehnen',
              showPreferencesBtn: 'Einstellungen',
            },
            preferencesModal: {
              title: 'Cookie-Einstellungen',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Ablehnen',
              savePreferencesBtn: 'Auswahl speichern',
              sections: [
                { title: 'Notwendig', description: 'Fuer den Betrieb erforderlich.', linkedCategory: 'necessary' },
                { title: 'Statistik', description: 'Google Analytics, Microsoft Clarity.', linkedCategory: 'analytics' },
                { title: 'Marketing', description: 'Google Ads Conversion-Messung.', linkedCategory: 'ads' },
              ],
            },
          },
        },
      },
      onFirstConsent: applyConsent,
      onConsent: applyConsent,
      onChange: applyConsent,
    })
  }, [])
  return null
}

/** Fuer den Footer-Widerruf-Link. */
export function openConsentPreferences() { try { CookieConsent.showPreferences() } catch {} }
```

- [ ] **Step 3: Build-Check (Client-Komponente, kein isolierter Unit-Test sinnvoll)**

Run: `npx tsc --noEmit` (in den geaenderten Files 0 Fehler; transiente `sharp`/`@react-pdf`-TS2307 aus shared node_modules ignorieren)
Expected: keine Fehler in ConsentManager.tsx/consent.ts.

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/ConsentManager.tsx package.json package-lock.json
git commit -m "feat(consent): ConsentManager (vanilla-cookieconsent + GCM-update + record)"
```

---

## Task 4: consent_records-Tabelle + /api/consent

**Files:**
- Create migration via CLI (Regel-2): `npx supabase migration new consent_records`
- Create: `src/app/api/consent/route.ts`

- [ ] **Step 1: Migration anlegen + SQL schreiben** in die generierte Datei `supabase/migrations/<ts>_consent_records.sql`:

```sql
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  categories jsonb not null,
  policy_version text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
-- Insert-only, kein Lesen fuer anon/authenticated (Audit-Daten).
alter table public.consent_records enable row level security;
create policy consent_records_insert on public.consent_records for insert to anon, authenticated with check (true);
```

- [ ] **Step 2: Migration anwenden** (Regel-2, tracked)

Run: `npx supabase db push`
Expected: Migration applied (project paizkjajbuxxksdoycev). Verify: `select count(*) from consent_records;` → 0.

- [ ] **Step 3: API-Route schreiben** `src/app/api/consent/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { categories?: unknown; policyVersion?: unknown }
    const categories = Array.isArray(body.categories) ? body.categories.map(String) : []
    const policyVersion = typeof body.policyVersion === 'string' ? body.policyVersion : 'unknown'
    const ua = (req.headers.get('user-agent') ?? '').slice(0, 300)
    const supabase = createAdminClient()
    const { error } = await supabase.from('consent_records').insert({ categories, policy_version: policyVersion, user_agent: ua })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 200 })
  }
}
```

(Hinweis: bewusst kein 4xx — Consent-Logging ist best-effort, darf den Client nie stören. Keine IP gespeichert.)

- [ ] **Step 4: Verify build of route**

Run: `npx tsc --noEmit`
Expected: 0 Fehler in route.ts. Bestätige `createAdminClient`-Importpfad existiert: `grep -rn "export.*createAdminClient" src/lib/supabase/admin.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ src/app/api/consent/route.ts
git commit -m "feat(consent): consent_records-Tabelle + /api/consent insert-route"
```

---

## Task 5: layout.tsx — Cookiebot raus, ConsentManager rein

**Files:** Modify `src/app/layout.tsx`

- [ ] **Step 1: Cookiebot-Script entfernen.** Den Block ersetzen:

```tsx
// ALT (entfernen):
{shouldLoadCookiebot && (
  <Script id="Cookiebot" src="https://consent.cookiebot.com/uc.js"
    data-cbid={COOKIEBOT_CBID} data-blockingmode="auto" strategy="beforeInteractive" />
)}
```
→ ersatzlos streichen. Import `COOKIEBOT_CBID`/`isCookiebotHost` aus der `consent`-Import-Zeile entfernen; `isMarketingHost` ergänzen. `shouldLoadCookiebot` umbenennen zu `shouldShowConsent = isMarketingHost(host)`.

- [ ] **Step 2: ConsentManager mounten** (im `<body>`, nahe ClarityInit):

```tsx
import { ConsentManager } from '@/components/analytics/ConsentManager'
// ... im JSX, nur auf Marketing-Hosts:
{shouldShowConsent && <ConsentManager />}
```
Der gtag-`consent default`-Block (7 Signale, `shouldLoadGtag`) bleibt **unverändert**.

- [ ] **Step 3: Voller Build** (Root-Layout → Next-15-Validator)

Run: `npm run build`
Expected: grün. (Wenn EBUSY/.next-Flake auf Windows: `rm -rf .next` + retry; Node24: `--workers=1` falls vitest klemmt.)

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(consent): layout — Cookiebot-Script raus, ConsentManager mounten"
```

---

## Task 6: Consumer repointen (ClarityInit + ga4-conversions)

**Files:** Modify `src/components/analytics/ClarityInit.tsx`, `src/lib/analytics/ga4-conversions.ts`

- [ ] **Step 1: ClarityInit.tsx** — Import + Event-Konstante tauschen:

```tsx
// ALT: import { hasTrackingConsent, COOKIEBOT_CONSENT_EVENT } from '@/lib/analytics/consent'
import { hasTrackingConsent, CONSENT_CHANGED_EVENT } from '@/lib/analytics/consent'
// ... und beide Vorkommen von COOKIEBOT_CONSENT_EVENT → CONSENT_CHANGED_EVENT
//   window.addEventListener(CONSENT_CHANGED_EVENT, start)
//   return () => window.removeEventListener(CONSENT_CHANGED_EVENT, start)
```
`hasTrackingConsent()` bleibt (liest jetzt `cc_cookie`).

- [ ] **Step 2: ga4-conversions.ts** — Import + Parse tauschen:

```typescript
// ALT: import { COOKIEBOT_COOKIE_NAME, parseCookiebotConsent } from './consent'
import { CONSENT_COOKIE_NAME, parseConsent } from './consent'
// in getConsentedGaClientId():
//   const consent = parseConsent(store.get(CONSENT_COOKIE_NAME)?.value)
//   if (!consent.statistics) return null
```

- [ ] **Step 3: Grep — keine Cookiebot-Referenz mehr**

Run: `grep -rn "Cookiebot\|COOKIEBOT\|cookiebot\|parseCookiebotConsent" src/`
Expected: leer (nur evtl. datenschutz.md, das Task 8 erledigt).

- [ ] **Step 4: tsc + Commit**

Run: `npx tsc --noEmit` (0 Fehler in beiden Files)

```bash
git add src/components/analytics/ClarityInit.tsx src/lib/analytics/ga4-conversions.ts
git commit -m "feat(consent): ClarityInit + ga4-conversions auf neues Consent-Cookie/Event"
```

---

## Task 7: kfzgutachter-LP von Cookiebot entkoppeln

**Files:** Modify `src/app/kfzgutachter-lp/page.tsx`

- [ ] **Step 1:** Datei nach `Cookiebot`/`cd.js`/`isCookiebotHost`-Bezügen durchsuchen:

Run: `grep -n "Cookiebot\|cookiebot\|cd.js" src/app/kfzgutachter-lp/page.tsx`

- [ ] **Step 2:** Gefundene Cookiebot-Kommentare/Verweise streichen. Die LP-eigenen GTM/GA4-Scripts (`GTM-KZNCZB2Z`, `G-9YF2W9ZP2S`) + der LP-`consent default` bleiben — Consent kommt jetzt vom (auf `kfzgutachter.claimondo.de` via `isMarketingHost` gemounteten) globalen `ConsentManager`. Falls die LP eine eigene Cookiebot-`<Script>`-Einbindung hatte: entfernen.

- [ ] **Step 3: Commit**

```bash
git add src/app/kfzgutachter-lp/page.tsx
git commit -m "feat(consent): kfzgutachter-LP von Cookiebot entkoppeln (nutzt globalen ConsentManager)"
```

---

## Task 8: Datenschutz aktualisieren

**Files:** Modify `src/content/legal/datenschutz.md`

- [ ] **Step 1:** Den Cookiebot-Abschnitt (Cookiebot/`cd.js`/Cyberbot-Erwähnung) ersetzen durch: eingesetztes CMP (vanilla-cookieconsent, self-hosted, kein Drittland-Transfer durch das CMP selbst), die Kategorien (notwendig/Statistik/Marketing), die Cookie-Deklaration (aus `COOKIE_DECLARATION` — als Tabelle), und den **Widerruf-Hinweis** („Cookie-Einstellungen"-Link im Footer). GA4/Clarity/Ads-Abschnitte bleiben.

- [ ] **Step 2:** Grep: `grep -rni "cookiebot" src/content/` → leer.

- [ ] **Step 3: Commit**

```bash
git add src/content/legal/datenschutz.md
git commit -m "docs(consent): Datenschutz — CMP/Cookie-Deklaration/Widerruf statt Cookiebot"
```

---

## Task 9: Footer-Widerruf-Link

**Files:** Modify `src/components/landing/LandingFooter.tsx`

- [ ] **Step 1:** Im Footer einen Button „Cookie-Einstellungen" ergänzen (client-Komponente; falls Footer server ist → kleinen Client-Wrapper `ConsentSettingsLink.tsx` einsetzen):

```tsx
'use client'
import { openConsentPreferences } from '@/components/analytics/ConsentManager'
export function ConsentSettingsLink() {
  return <button type="button" onClick={openConsentPreferences} className="text-sm underline text-claimondo-navy">Cookie-Einstellungen</button>
}
```
und im Footer neben Impressum/Datenschutz einbinden.

- [ ] **Step 2: tsc + Commit**

```bash
git add src/components/landing/LandingFooter.tsx src/components/analytics/ConsentSettingsLink.tsx
git commit -m "feat(consent): Footer 'Cookie-Einstellungen'-Widerruf-Link"
```

---

## Task 10: Playwright-Smoke (Apex + kfzgutachter-Subdomain)

**Files:** Create `tests/e2e/consent-cmp.spec.ts`

- [ ] **Step 1: Test schreiben** (gegen die Deploy-URL; CI e2e läuft gegen Prod — siehe Memory `ci_e2e_tests_prod`. Lokal gegen `BASE_URL`):

```typescript
import { test, expect } from '@playwright/test'

const HOSTS = ['https://claimondo.de', 'https://kfzgutachter.claimondo.de']

for (const base of HOSTS) {
  test(`consent banner + GCM flip @ ${base}`, async ({ page }) => {
    const collects: string[] = []
    page.on('request', r => { if (r.url().includes('/g/collect')) collects.push(r.url()) })
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    // 1) Banner rendert
    await expect(page.locator('#cc-main, .cc-banner, [data-cc]')).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(3000)
    expect(collects.some(u => /gcs=G10/.test(u))).toBeTruthy() // denied pre-consent
    // 2) Akzeptieren → granted
    await page.getByRole('button', { name: /Alle akzeptieren/i }).click()
    await page.waitForTimeout(3000)
    expect(collects.some(u => /gcs=G1[01]1/.test(u))).toBeTruthy() // granted nach Accept
  })
}
```

- [ ] **Step 2: Lokaler Smoke-Lauf** (mit gesetzter `NEXT_PUBLIC_GA4_ID` + dev/preview):

Run: `npx playwright test tests/e2e/consent-cmp.spec.ts --workers=1` (Screenshot-Pflicht: `--trace on` bzw. `page.screenshot`)
Expected: Banner sichtbar, gcs denied→granted. **Screenshot im selben Turn auswerten** (Memory-Regel).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/consent-cmp.spec.ts
git commit -m "test(consent): e2e-Smoke Banner + GCM-Flip (Apex + kfzgutachter)"
```

---

## Task 11: Finale Verifikation + PR

- [ ] **Step 1: Voller Build + Tests + Token-Audit**

```bash
npm run build
npx vitest run src/lib/analytics/__tests__/consent.test.ts
npm run check:token-audit
```
Expected: alles grün.

- [ ] **Step 2: Dead-Code/Regression-Greps**

```bash
grep -rn "Cookiebot\|COOKIEBOT\|cookiebot\|react-cookie-consent" src/   # leer
grep -rn "cc_cookie\|ConsentManager\|hasTrackingConsent" src/ | head     # neue Verdrahtung da
```

- [ ] **Step 3: PR (Draft, --base staging)** mit 7-Punkt-Audit im Body (AGENTS.md). Rollout-Hinweis in den PR-Body: **Cookiebot-Abo erst NACH OSS-Go-Live + Prod-Smoke kündigen** (sonst Consent-Lücke). **DPO-Sign-off** auf Consent-Mode-only (kein Hard-Block) einholen.

```bash
gh pr create --draft --base staging --title "feat(consent): Cookiebot -> self-hosted OSS-CMP (vanilla-cookieconsent), GCM v2 erhalten"
```

---

## Self-Review (gegen Spec)

**Spec-Coverage:** CMP-Swap (Task 1,3,5) ✓ · GCM erhalten (Task 1 `categoriesToGcm` + Task 3 update + layout-default bleibt) ✓ · granulare Kategorien (Task 3) ✓ · Consent-Log (Task 4) ✓ · Cookie-Deklaration (Task 2,8) ✓ · Host-Rollout inkl. Subdomain (Task 1 `isMarketingHost`, Task 5 mount) ✓ · Widerruf (Task 9) ✓ · Consumer-Repoint (Task 6) ✓ · LP (Task 7) ✓ · Datenschutz (Task 8) ✓ · Smoke Apex+Subdomain (Task 10) ✓ · Rollout/Cookiebot-Kündigung + DPO (Task 11) ✓.
**Placeholder-Scan:** kein TODO/TBD; alle Code-Steps mit echtem Code. (Task 7/8 sind Inhalts-Edits an existierenden Files → präzise Anweisung statt Voll-Dump, da File-Inhalt vor Ort gelesen werden muss.)
**Typ-Konsistenz:** `ConsentState {statistics,marketing}`, `parseConsent`, `categoriesToGcm`, `CONSENT_COOKIE_NAME`, `CONSENT_CHANGED_EVENT` durchgängig identisch in Task 1/3/6.
**Offen (bewusst, kein Code):** DPO-Sign-off Consent-Mode-only; Cookiebot-Abo-Kündigung nach Go-Live; Banner-Styling-Feinschliff (Brand-Tokens).
