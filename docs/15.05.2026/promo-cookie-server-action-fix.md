# /schaden-melden APP-ROOT-CRASH bei valid Promo-Code — Cookie-Write als Server-Action

**Datum:** 2026-05-15
**Branch:** `kitta/aar-promo-cookie-server-action`
**Loop-Kontext:** E2E-Smoke Makler→Kunde Promo-Code-Flow

## Befund

Live-Smoke (Playwright gegen Staging) traf konsistent auf einen Server-Render-Crash bei `/schaden-melden?p=MK-SMKE` (jeder regex-valide Promo-Code). Screenshot zeigte die CMM-14-Diag-Page:

```
APP ROOT CRASH (CMM-14 diag)
Message: An error occurred in the Server Components render.
Digest: 890686022
```

PM2-stderr auf VPS:

```
⨯ Error: Cookies can only be modified in a Server Action or Route Handler.
   Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options
    at e (.next/server/chunks/ssr/[root-of-the-server]__0ml421m._.js:12:31067)
  digest: '890686022'
```

## Root-Cause

`src/app/schaden-melden/page.tsx:24` rief `writePromoCookie(p)` direkt aus dem async Server-Component-Body auf. `writePromoCookie` in `src/lib/flow/promo-attribution.ts` machte `cookies().set()` — was Next.js 15+ **nur in Server-Actions, Route-Handlers oder Middleware erlaubt**.

Vor diesem Audit war das Latent — der Smoke griff zufällig mit invalid Promo-Code (`SMOKE-MK-TEST`, scheitert an `isValidPromoCodeFormat`), `set()` wurde nie aufgerufen, kein Crash sichtbar. Mit jedem **gültigen** Promo-Code (`MK-XXXX`) trifft der Code den Pfad und crashed → der Promo-Code-Flow ist effektiv kaputt.

## Fix

`setPromoCookie` als echte Server-Action in neuer Datei `src/lib/flow/promo-cookie-action.ts`:

```ts
'use server'
import { cookies } from 'next/headers'
const COOKIE_NAME = 'claimondo_promo'
const TTL_DAYS = 30
export async function setPromoCookie(code: string): Promise<void> {
  const c = await cookies()
  c.set(COOKIE_NAME, code, { maxAge: TTL_DAYS * 24 * 60 * 60, path: '/',
    sameSite: 'lax', httpOnly: false, secure: process.env.NODE_ENV === 'production' })
}
```

Datei-Level `'use server'` instrumentiert den Export als Action — Aufruf aus dem Server-Component-Render-Pfad ist damit erlaubt.

`page.tsx` umgestellt auf die neue Action. `writePromoCookie` und `clearPromoCookie` aus `promo-attribution.ts` entfernt (write nur noch via Action, clear war ungenutzt). `readPromoCookie` und `isValidPromoCodeFormat` bleiben dort (read-only + sync).

## Verifikation lokal

```bash
# vor Fix (dev-Server lokal, valid Promo-Code):
#   APP ROOT CRASH (CMM-14 diag), digest 890686022 + PM2-stderr "Cookies can only be modified..."
node scripts/repro-promo-crash.mjs
# nach Fix:
#   status=200, crash=false  → Page rendert, kein Server-Crash mehr
```

Screenshot: `docs/15.05.2026/repro-promo-after-fix.png` zeigt Page-Load (Spinner, kein Crash).

## Folge-Befund (separate Untersuchung nötig)

Beim Initial-E2E-Smoke war `leads.promotion_code_id` selbst nach Submit `NULL`. Der Crash hat verhindert, dass `writePromoCookie` lief — also wurde **kein Cookie gesetzt** und `createLeadFromMiniWizard.readPromoCookie()` fand nichts. Mit diesem Fix sollte der gesamte Promo-Attribution-Pfad wieder funktionieren. Re-Smoke nach Merge bestätigt das Ende-zu-Ende.

## Test plan (post-merge auf Staging)

- [ ] `node scripts/smoke-makler-kunde-flow.mjs` (mit Promo-Code `MK-SMKE` seeded) — kein CMM-14-Crash, redirect zu `/schaden-melden/link-versendet`
- [ ] DB-Query: neuer Lead hat `promotion_code_id != NULL`
- [ ] Makler-Leads-Liste zeigt den neuen Lead in `/makler/leads`
