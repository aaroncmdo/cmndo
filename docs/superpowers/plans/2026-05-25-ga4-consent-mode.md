# GA4 + Consent-Mode v2 + Host-Gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Google-Tag (GA4 `G-CFMJHZM2NR`) auf claimondo.de aktivieren — consent-gated (Consent-Mode v2), nur auf der Marketing-Hauptdomain, Clarity auf Public-Seiten consent-gated.

**Architecture:** Eine Consent-Quelle (Cookie `claimondo-cookie-consent`) speist drei Consumer (server-gerendeter gtag-Block in `layout.tsx`, `CookieBanner`, `ClarityInit`). Geteilte Logik in neuem `src/lib/analytics/consent.ts`.

**Tech Stack:** Next.js 15 (App Router, async `headers()`/`cookies()`), `next/script`, react-cookie-consent@10, @microsoft/clarity, vitest.

**Spec:** `docs/superpowers/specs/2026-05-25-ga4-consent-mode-design.md`

**Hinweis TDD-Scope:** Nur `consent.ts` (reine Funktionen) wird unit-getestet. `layout.tsx`/`CookieBanner`/`ClarityInit` sind SSR-/Callback-/3rd-Party-Integration mit geringem Unit-Test-ROI → verifiziert via `tsc` + voller Build + manueller Smoke (Spec §Tests).

---

### Task 0: Worktree-Dependencies bereitstellen

**Files:** keine (Setup im Worktree `.claude/worktrees/ga4-consent-mode-v2`).

- [ ] **Step 1: Lockfile-Paritaet pruefen**

Run:
```bash
git diff --quiet 37d75a16 origin/kitta/doc38-hyperlocal-staedte -- package-lock.json package.json && echo PARITY || echo DIFF
```
- `PARITY` → node_modules des Haupt-Checkouts ist deps-identisch → Junction (schnell).
- `DIFF` → `npm ci` (korrekt fuer staging-Lockfile).

- [ ] **Step 2a (bei PARITY): node_modules junctionen (Windows, kein Admin noetig)**

Run (PowerShell):
```powershell
cmd /c mklink /J node_modules "C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\node_modules"
```
Expected: `Junction created for node_modules <<===>> ...`

- [ ] **Step 2b (bei DIFF, oder wenn Junction scheitert): sauber installieren**

Run: `npm ci`
Expected: exit 0.

- [ ] **Step 3: Test-Runner verifizieren**

Run: `npx vitest --version`
Expected: Versions-String (bestaetigt vitest vorhanden). Falls Fehler → `npm test --help` checken fuer den realen Runner.

---

### Task 1: `consent.ts` Shared-Modul (TDD)

**Files:**
- Create: `src/lib/analytics/consent.ts`
- Test: `src/lib/analytics/__tests__/consent.test.ts`

- [ ] **Step 1: Failing test schreiben**

Create `src/lib/analytics/__tests__/consent.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { isTrackingHost } from '../consent'

describe('isTrackingHost', () => {
  it('allows the marketing apex domain', () => {
    expect(isTrackingHost('claimondo.de')).toBe(true)
  })
  it('allows www', () => {
    expect(isTrackingHost('www.claimondo.de')).toBe(true)
  })
  it('strips a port before matching', () => {
    expect(isTrackingHost('claimondo.de:443')).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(isTrackingHost('Claimondo.DE')).toBe(true)
  })
  it('rejects portal + funnel subdomains', () => {
    for (const h of [
      'app.claimondo.de',
      'gutachter.claimondo.de',
      'makler.claimondo.de',
      'kfzgutachter.claimondo.de',
      'schaden.claimondo.de',
      'app.staging.claimondo.de',
    ]) {
      expect(isTrackingHost(h)).toBe(false)
    }
  })
  it('rejects null/undefined/empty', () => {
    expect(isTrackingHost(null)).toBe(false)
    expect(isTrackingHost(undefined)).toBe(false)
    expect(isTrackingHost('')).toBe(false)
  })
})

describe('isTrackingHost localhost dev-seam', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('allows localhost in non-production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(isTrackingHost('localhost:3000')).toBe(true)
    expect(isTrackingHost('127.0.0.1')).toBe(true)
  })
  it('rejects localhost in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isTrackingHost('localhost:3000')).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `npx vitest run src/lib/analytics/__tests__/consent.test.ts`
Expected: FAIL — `Failed to resolve import "../consent"` (Modul existiert noch nicht).

- [ ] **Step 3: `consent.ts` implementieren**

Create `src/lib/analytics/consent.ts`:
```ts
// Shared Tracking-Consent-Helpers (GA4/Ads/Clarity).
// Plain-Modul: von Server-Components (layout.tsx) UND Client-Components
// (CookieBanner, ClarityInit) importierbar. Bewusst KEIN 'use server'/'use
// client' — nur Konstanten + reine Funktionen (siehe AGENTS.md 'use server'-Falle).

/**
 * Cookie-Name aus react-cookie-consent (CookieBanner). Single-Source-of-Truth
 * fuer den Consent-State. Wert: 'true' (akzeptiert) | 'false' (abgelehnt).
 */
export const CONSENT_COOKIE_NAME = 'claimondo-cookie-consent'

/**
 * Window-Event, das der CookieBanner bei "Alle akzeptieren" feuert, damit
 * client-seitige Tracker (Clarity) live nachziehen ohne Reload.
 */
export const CONSENT_GRANTED_EVENT = 'claimondo:consent-granted'

/**
 * Marketing-Hauptdomain(s). Nur hier laedt der Google-Tag (GA4/Ads).
 * Portale + Funnel-Subdomains (app./gutachter./makler./kfzgutachter./schaden./
 * staging) bleiben tracking-frei, damit das GA4-Property nicht mit
 * Portal-Traffic verschmutzt wird.
 */
const TRACKING_HOSTS = new Set(['claimondo.de', 'www.claimondo.de'])

/**
 * Darf der Google-Tag auf diesem Host laden? Allow-list.
 * In Nicht-Production zaehlt localhost mit, damit der Consent-Flow lokal
 * smoke-bar ist (prod-Hosts greifen sonst nur live).
 */
export function isTrackingHost(host: string | null | undefined): boolean {
  if (!host) return false
  const hostname = host.split(':')[0].toLowerCase()
  if (TRACKING_HOSTS.has(hostname)) return true
  if (
    process.env.NODE_ENV !== 'production' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    return true
  }
  return false
}

/**
 * Client-seitig: hat der User Analytics/Marketing freigegeben?
 * Liest das react-cookie-consent-Cookie direkt aus document.cookie
 * (kein Lib-Import, robust gegen Package-Export-Pfade).
 */
export function hasTrackingConsent(): boolean {
  if (typeof document === 'undefined') return false
  const match = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE_NAME + '=([^;]+)'),
  )
  return match?.[1] === 'true'
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg verifizieren**

Run: `npx vitest run src/lib/analytics/__tests__/consent.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/consent.ts src/lib/analytics/__tests__/consent.test.ts
git commit -m "feat(analytics): consent.ts shared module (host allow-list + consent helpers)"
```

---

### Task 2: `layout.tsx` — Host-Gate + Consent-Mode-v2-Default

**Files:**
- Modify: `src/app/layout.tsx` (Imports ~Z.1-22; gtag-Block Z.153-190)

- [ ] **Step 1: Async-API der Next-Version verifizieren**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -1` (Baseline; merken ob clean)
Pruefen, dass `cookies()`/`headers()` aus `next/headers` ein Promise liefern (Next 15). Falls die Typen sync sind → `await` weglassen.

- [ ] **Step 2: Imports ergaenzen**

In `src/app/layout.tsx` nach `import Script from "next/script";` (Z.2) bzw. zu den `@/lib`-Imports hinzufuegen:
```ts
import { headers, cookies } from "next/headers";
import { isTrackingHost, CONSENT_COOKIE_NAME } from "@/lib/analytics/consent";
```

- [ ] **Step 3: gtag-Variablen-Block ersetzen (Z.153-157)**

Ersetze:
```tsx
  // GA4 + Google-Ads-Tracking — beide IDs teilen sich denselben gtag.js-Loader.
  // Hinweis: noch nicht consent-gated; CookieBanner-Integration ist offen.
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
  const gadsId = process.env.NEXT_PUBLIC_GADS_ID;
  const primaryGtagId = ga4Id ?? gadsId;
```
durch:
```tsx
  // GA4 + Google-Ads-Tracking — beide IDs teilen sich denselben gtag.js-Loader.
  // Consent-Mode v2 (DSGVO): Default denied, Upgrade erst nach CookieBanner-
  // "Alle akzeptieren". Host-gated: laedt nur auf der Marketing-Hauptdomain,
  // nicht auf Portalen/Funnel-Subdomains. Siehe src/lib/analytics/consent.ts.
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
  const gadsId = process.env.NEXT_PUBLIC_GADS_ID;
  const primaryGtagId = ga4Id ?? gadsId;

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const cookieStore = await cookies();
  const consentState =
    cookieStore.get(CONSENT_COOKIE_NAME)?.value === "true" ? "granted" : "denied";
  const shouldLoadGtag = isTrackingHost(host) && Boolean(primaryGtagId);
```

- [ ] **Step 4: gtag-Head-Block ersetzen (Z.174-190)**

Ersetze den `{primaryGtagId && ( … )}`-Block durch:
```tsx
        {shouldLoadGtag && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${primaryGtagId}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'default', {
                  ad_storage: '${consentState}',
                  ad_user_data: '${consentState}',
                  ad_personalization: '${consentState}',
                  analytics_storage: '${consentState}',
                  wait_for_update: 500
                });
                gtag('js', new Date());
                ${ga4Id ? `gtag('config', ${JSON.stringify(ga4Id)});` : ''}
                ${gadsId ? `gtag('config', ${JSON.stringify(gadsId)});` : ''}
              `}
            </Script>
          </>
        )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: keine NEUEN Fehler ggü. Baseline aus Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(analytics): consent-mode v2 default + host-gate gtag.js in root layout"
```

---

### Task 3: `CookieBanner.tsx` — Consent erteilen/widerrufen

**Files:**
- Modify: `src/components/CookieBanner.tsx`

- [ ] **Step 1: Import + Handler ergaenzen**

Nach den bestehenden Imports (Z.1-4) ergaenzen:
```ts
import { CONSENT_GRANTED_EVENT } from '@/lib/analytics/consent'
```

Vor der `CookieBanner`-Komponente (Modul-Scope) hinzufuegen:
```ts
// Consent-Mode-v2-Update. window.gtag ist optional (Script evtl. nicht geladen
// / host-gated) -> optional chaining. Bei Accept zusaetzlich ein Window-Event,
// damit client-seitige Tracker (Clarity) live nachziehen.
function grantConsent() {
  window.gtag?.('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  })
  window.dispatchEvent(new Event(CONSENT_GRANTED_EVENT))
}

function denyConsent() {
  window.gtag?.('consent', 'update', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  })
}
```

- [ ] **Step 2: Props verdrahten**

Am `<CookieConsent …>` (nach `enableDeclineButton`, Z.52) hinzufuegen:
```tsx
      onAccept={grantConsent}
      onDecline={denyConsent}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: keine neuen Fehler. (`window.gtag`-Typ: `src/types/gtag.d.ts` — `('consent','update', {...})` passt.)

- [ ] **Step 4: Commit**

```bash
git add src/components/CookieBanner.tsx
git commit -m "feat(analytics): wire CookieBanner accept/decline to consent-mode update"
```

---

### Task 4: `ClarityInit.tsx` — consent-gaten (Public-Seiten)

**Files:**
- Modify: `src/components/analytics/ClarityInit.tsx`

- [ ] **Step 1: Imports anpassen**

Z.3 `import { useEffect } from 'react'` → `import { useEffect, useRef } from 'react'`.
Neuen Import ergaenzen:
```ts
import { hasTrackingConsent, CONSENT_GRANTED_EVENT } from '@/lib/analytics/consent'
```

- [ ] **Step 2: Effect-Body durch consent-gated Variante ersetzen**

Ersetze die Komponente:
```tsx
export function ClarityInit() {
  const pathname = usePathname()
  const startedRef = useRef(false)
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_CLARITY_ID
    if (!projectId) return
    if (pathname && SKIP_ROUTES.some((r) => pathname.startsWith(r))) return

    const start = () => {
      if (startedRef.current) return
      startedRef.current = true
      Clarity.init(projectId)
    }

    // Consent-Gate: nur nach erteiltem Cookie-Consent initialisieren.
    // Liegt schon Consent vor (Wiederkehrer) -> sofort. Sonst auf das
    // "Alle akzeptieren"-Event warten, das der CookieBanner feuert.
    if (hasTrackingConsent()) {
      start()
      return
    }
    window.addEventListener(CONSENT_GRANTED_EVENT, start)
    return () => window.removeEventListener(CONSENT_GRANTED_EVENT, start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: keine neuen Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/ClarityInit.tsx
git commit -m "feat(analytics): consent-gate Clarity init on public pages"
```

---

### Task 5: `.env.example` dokumentieren

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Analytics-Block ergaenzen**

Nach dem `NEXT_PUBLIC_SENTRY_DSN=`-Block (oder ans Ende der `NEXT_PUBLIC_*`-Sektion) einfuegen:
```bash
# --- Analytics / Tracking (alle optional; nur gesetzt = aktiv) ---
# Google Analytics 4 Measurement-ID (Format G-XXXXXXXXXX). Aktiviert den
# gtag.js-Loader in src/app/layout.tsx — NUR auf claimondo.de/www, consent-gated.
NEXT_PUBLIC_GA4_ID=
# Google Ads Conversion-ID (Format AW-XXXXXXXXX). Teilt sich den gtag.js-Loader.
NEXT_PUBLIC_GADS_ID=
# Microsoft Clarity Project-ID (Session-Recording/Heatmaps). Consent-gated auf
# Public-Seiten (laedt erst nach "Alle akzeptieren").
NEXT_PUBLIC_CLARITY_ID=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document NEXT_PUBLIC_GA4_ID/GADS_ID/CLARITY_ID"
```

---

### Task 6: Voller Build (Audit-Punkt 1, Pflicht bei Layout-Change)

**Files:** keine.

- [ ] **Step 1: Build**

Run: `npm run build` (bei OOM: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`)
Expected: `Compiled successfully` / exit 0. (Memory: Win-Flakes → bei EBUSY `rm -rf .next` und erneut.)

- [ ] **Step 2: token-audit (CI-Gate lokal)**

Run: `npm run check:token-audit`
Expected: 0 Verstoesse (kein neuer Inline-Hex eingefuehrt).

---

### Task 7: Smoke-Verifikation (Spec §Tests)

**Files:** keine (Verifikation; Smoke-Protokoll → `docs/25.05.2026/ga4-consent-smoke.md`).

- [ ] **Step 1: Lokaler Positiv-Smoke**

`.env.local` temporaer: `NEXT_PUBLIC_GA4_ID=G-CFMJHZM2NR` (oder Test-Property). `npm run dev`, `http://localhost:3000` oeffnen.
Pruefen (DevTools Console):
```js
window.dataLayer.filter(a => a[0]==='consent')
```
Expected: erster Eintrag `['consent','default',{… analytics_storage:'denied' …}]`.
"Alle akzeptieren" klicken → erneut pruefen: zusaetzlich `['consent','update',{… 'granted' …}]`.
**Screenshot Pflicht** (Memory-Regel) — im selben Turn auswerten.

- [ ] **Step 2: Staging-Negativ-Smoke (nach PR-Merge auf staging)**

`https://app.staging.claimondo.de` → DevTools: KEIN `googletagmanager.com/gtag/js`-Request (Allow-list greift). CookieBanner accept/decline wirft nicht (Console clean). **Screenshot Pflicht.**

- [ ] **Step 3: Smoke-Doc schreiben**

`docs/25.05.2026/ga4-consent-smoke.md` mit Befunden + Screenshots, committen.

---

## PR + Rollout

- [ ] PR `--base staging` (`gh pr create --base staging`), Audit-Block (7 Punkte) im Body.
- [ ] Aaron testet staging → `staging→main` (durch die Merge-Session / Aaron).
- [ ] **DANN** VPS-ENV (build-time): `NEXT_PUBLIC_GA4_ID=G-CFMJHZM2NR` in `/etc/claimondo/.env.local` → prod-Rebuild → `pm2 reload claimondo-v2`. **OFFEN:** exakter prod-Deploy-Befehl (Aaron). NIE die ID setzen, solange ungegateter Code live ist.

## Self-Review (Plan ggü. Spec)

- **Spec-Coverage:** Host-Gate (T1/T2), Consent-Mode-Default (T2), Banner-Wiring (T3), Clarity-Gate (T4), .env.example (T5), Tests (T1/T7), Rollout (PR-Sektion). ✓ Alle Spec-Abschnitte haben eine Task.
- **Placeholder-Scan:** keine TBD/TODO; jeder Code-Step hat vollstaendigen Code. (Step-1-Import in T3 enthielt zunaechst einen falschen Pfad — korrekt ist `@/lib/analytics/consent`.)
- **Typ-Konsistenz:** `CONSENT_COOKIE_NAME`/`CONSENT_GRANTED_EVENT`/`isTrackingHost`/`hasTrackingConsent` identisch ueber T1→T2/T3/T4 benannt. ✓
