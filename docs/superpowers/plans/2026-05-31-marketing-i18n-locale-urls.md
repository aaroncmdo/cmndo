# Marketing i18n — crawlbare Locale-URLs · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) oder subagent-driven-development. Steps nutzen Checkbox (`- [ ]`). Spec: `docs/superpowers/specs/2026-05-31-marketing-i18n-locale-urls-design.md`.

**Goal:** Die fertigen 6-Sprachen-Übersetzungen (in `i18n/messages/*.json`) über locale-präfixierte URLs (`/en/…`, `/tr/…`; `de` prefix-frei) crawlbar/indexierbar machen — 0 neue Übersetzung.

**Architecture:** next-intl v4 App-Router-Routing mit `localePrefix:'as-needed'`. Alle Marketing-Routen unter `app/[locale]/`, per-Locale prerendered. Host-Routing-middleware (Subdomains) mit next-intl-Locale-middleware komponiert. hreflang/sitemap auf echte Locale-URLs.

**Tech Stack:** Next 16.2.1, next-intl 4.9.1, Standalone-Build `claimondo-marketing/` (:3006). Verifikation: `npm run build` + curl-Smokes (Host/Cookie/Prefix) + Playwright-Screenshots (`C:/pwtool`). Kein Unit-Test-Framework für Pages — Build-grün + Smoke ist das Gate (Projekt-Muster).

**Branch:** frischer Branch off `origin/staging` im Worktree `wt-claimondo-marketing` (nur `claimondo-marketing/*`). PR `--base staging`. Deploy `deploy-marketing-update.py` (:3006, Aaron-Override).

---

## File Structure

- Create `claimondo-marketing/i18n/routing.ts` — `defineRouting` (Single Source: locales, defaultLocale, localePrefix).
- Create `claimondo-marketing/i18n/navigation.ts` — `createNavigation(routing)` → locale-aware `Link`/`redirect`/`usePathname`/`useRouter`.
- Modify `claimondo-marketing/i18n/request.ts` — Locale aus `requestLocale` (URL-Segment) statt Cookie.
- Modify `claimondo-marketing/middleware.ts` — Host-Routing × `createMiddleware(routing)` komponieren.
- Create `claimondo-marketing/app/[locale]/layout.tsx` — Provider + `setRequestLocale` + `generateStaticParams`; verschiebt die i18n/Tracking-Logik aus dem Root-Layout.
- Modify `claimondo-marketing/app/layout.tsx` — minimal (`<html><body>{children}` passthrough) ODER entfällt zugunsten `[locale]/layout`.
- Move `claimondo-marketing/app/<route>` → `claimondo-marketing/app/[locale]/<route>` (alle ~40 Marketing-Routen; NICHT `api/`, `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `feed*`, `llms*`, `manifest`, `favicon.ico` — die bleiben locale-frei im Root `app/`).
- Modify `claimondo-marketing/lib/seo/alternates.ts` — echte Locale-URLs statt alle-gleich.
- Modify `claimondo-marketing/app/sitemap.ts` — `langAlternates` → echte Prefix-URLs; (optional) Einträge × Locale.
- Modify `claimondo-marketing/components/.../LanguageSwitcher.tsx` — Navigation via locale-`usePathname`/`useRouter` statt `setLocaleAction`-Cookie.

---

## Task 1: Routing-Config (Single Source of Truth)

**Files:** Create `claimondo-marketing/i18n/routing.ts`, `claimondo-marketing/i18n/navigation.ts`.

- [ ] **Step 1: routing.ts schreiben**

```ts
import { defineRouting } from 'next-intl/routing'
import { LOCALES, DEFAULT_LOCALE } from './locales'

export const routing = defineRouting({
  locales: LOCALES,            // ['de','en','tr','ar','ru','pl']
  defaultLocale: DEFAULT_LOCALE, // 'de'
  localePrefix: 'as-needed',   // de prefix-frei, Rest /en /tr ...
  localeCookie: { name: 'claimondo-locale' }, // bestehender Cookie als Sekundaer-Signal
})
```

- [ ] **Step 2: navigation.ts schreiben**

```ts
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
```

- [ ] **Step 3: Build-Check (kompiliert)**

Run (im `claimondo-marketing/`): `npx tsc --noEmit`
Expected: keine neuen Fehler aus den 2 Files.

- [ ] **Step 4: Commit**

```bash
git add claimondo-marketing/i18n/routing.ts claimondo-marketing/i18n/navigation.ts
git commit -m "feat(i18n-seo): next-intl routing-config (as-needed) + navigation"
```

---

## Task 2: request.ts auf URL-Locale umstellen

**Files:** Modify `claimondo-marketing/i18n/request.ts`.

- [ ] **Step 1: request.ts ersetzen**

```ts
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import { isLocale } from './locales'

// Locale kommt aus dem [locale]-URL-Segment (requestLocale). Fallback auf
// defaultLocale ('de'). Cookie-Negotiation uebernimmt die next-intl-Middleware.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : routing.defaultLocale
  const messages = (await import(`./messages/${locale}.json`)).default
  return { locale, messages }
})
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add claimondo-marketing/i18n/request.ts
git commit -m "feat(i18n-seo): request.ts auf requestLocale (URL-Segment)"
```

---

## Task 3: Middleware-Komposition (Host-Routing × Locale)

**Files:** Modify `claimondo-marketing/middleware.ts`.

Behält die bestehende Subdomain-Host-Logik (de-only) und delegiert `claimondo.de`/`www` an next-intl.

- [ ] **Step 1: middleware.ts ersetzen** (bestehende SUBDOMAIN_LANDING-Logik beibehalten, next-intl davorschalten)

```ts
import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const MAIN_HOST = 'claimondo.de'
const SUBDOMAIN_LANDING: Record<string, string> = {
  'gutachter.claimondo.de': '/gutachter-partner',
  'makler.claimondo.de': '/makler/partner-werden',
  'kfzgutachter.claimondo.de': '/kfzgutachter-lp',
}

const intlMiddleware = createMiddleware(routing)

export default function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase()

  // Subdomains: de-only Host-Routing (KEINE Locale-Prefixe).
  const landing = SUBDOMAIN_LANDING[host]
  if (landing) {
    const { pathname, search } = req.nextUrl
    if (pathname === '/') return NextResponse.rewrite(new URL(`${landing}${search}`, req.url))
    if (pathname === landing) return NextResponse.redirect(new URL(`/${search}`, req.url), 301)
    return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301)
  }

  // claimondo.de / www: next-intl Locale-Routing (as-needed).
  return intlMiddleware(req)
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
}
```

- [ ] **Step 2: tsc** → keine Fehler.
- [ ] **Step 3: Commit**

```bash
git add claimondo-marketing/middleware.ts
git commit -m "feat(i18n-seo): middleware Host-Routing x next-intl Locale komponiert"
```

---

## Task 4: `app/[locale]/`-Restruktur

**Files:** Move ~40 Routen `app/<route>` → `app/[locale]/<route>`; Create `app/[locale]/layout.tsx`; Modify `app/layout.tsx`. NICHT verschieben (bleiben locale-frei im Root): `api/`, `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `favicon.ico`, `feed.json`, `feed.xml`, `feed/`, `llms.txt`, `llms-full.txt`, `manifest.*`, `globals.css`.

- [ ] **Step 1: Locale-Layout anlegen** (`app/[locale]/layout.tsx`) — die i18n/Tracking-Logik + Fonts aus dem heutigen Root-`layout.tsx` hierher ziehen (vollständigen Inhalt übernehmen), ergänzt um:

```tsx
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!routing.locales.includes(locale as never)) notFound()
  setRequestLocale(locale)
  // ... <html lang={locale}> + Fonts + NextIntlClientProvider + JSON-LD + Tracking
  //     (1:1 aus dem bisherigen Root-layout.tsx, getLocale() -> locale Param)
}
```

- [ ] **Step 2: Root-Layout minimieren** (`app/layout.tsx`) — auf reines Passthrough reduzieren (kein `<html>` mehr hier; das macht `[locale]/layout`):

```tsx
import type { ReactNode } from 'react'
export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
```
> Hinweis: Bei next-intl-as-needed liegt das `<html>` im `[locale]`-Layout. Falls Next ein Root-`<html>` erzwingt, stattdessen das `[locale]`-Layout als alleiniges Layout nutzen (Next 16 erlaubt `<html>` im Segment-Layout bei i18n-Routing — gegen die installierte next-Doku `node_modules/next/dist/docs` prüfen).

- [ ] **Step 3: Routen verschieben** (mechanisch, je Route `git mv`)

```bash
cd claimondo-marketing
for r in agb datenschutz impressum nutzungsbedingungen faq ueber-uns vorteile wie-es-funktioniert sa-volltext schadensreport-2026 \
         kfz-gutachter kfz-gutachter-koeln gutachter-finden gutachter-partner beratung-anfragen ersteinschaetzung \
         schaden-melden kfzgutachter-lp makler ratgeber decoder haftpflicht sachverstaendige versicherer \
         e-auto-gutachter gegnerische-versicherung-zahlt-nicht kosten-kfz-gutachten lkw-gutachter motorrad-gutachter \
         unfall-was-tun-als-geschaedigter unfallskizze unverschuldeter-unfall-rechte versicherung-schickt-gutachter kfz-haftpflicht-schaden; do
  [ -d "app/$r" ] && git mv "app/$r" "app/[locale]/$r"
done
# Die alte page.tsx (Landing) -> app/[locale]/page.tsx
git mv app/page.tsx "app/[locale]/page.tsx" 2>/dev/null || true
```
> Relative Imports innerhalb der Routen bleiben gültig (verschieben gemeinsam). `@/`-Imports unverändert. `kfz-gutachter-koeln` importiert `../kfz-gutachter/[stadt]/page` — bleibt korrekt (beide unter `[locale]`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: grün; Routen erscheinen als `/[locale]/...`; ~199×6 Seiten prerendert. Bei OOM → `NODE_OPTIONS=--max-old-space-size=8192` oder Locale-Prerender-Set vorerst auf `['de','en']` begrenzen (Rest dynamisch), in der Spec §8 notiert.

- [ ] **Step 5: MS1 + Commit**

```bash
grep -rq SUPABASE_SERVICE_ROLE_KEY .next/static/ && echo LEAK || echo OK
git add -A && git commit -m "feat(i18n-seo): Marketing-Routen unter app/[locale]/ + Locale-Layout"
```

---

## Task 5: hreflang/alternates auf echte Locale-URLs

**Files:** Modify `claimondo-marketing/lib/seo/alternates.ts`.

- [ ] **Step 1: `buildLanguageAlternates(path)` umbauen** — pro Locale die echte Prefix-URL (de prefix-frei):

```ts
import { SITE_URL } from './jsonld'
import { routing } from '@/i18n/routing'

const HREFLANG: Record<string, string> = {
  de: 'de-DE', en: 'en-US', tr: 'tr-TR', ar: 'ar', ru: 'ru-RU', pl: 'pl-PL',
}

function localeUrl(locale: string, path: string): string {
  const clean = path === '/' ? '' : path
  return locale === routing.defaultLocale ? `${SITE_URL}${clean || '/'}` : `${SITE_URL}/${locale}${clean || ''}`
}

export function buildLanguageAlternates(path: string = '/'): { languages: Record<string, string> } {
  const languages: Record<string, string> = { 'x-default': localeUrl(routing.defaultLocale, path) }
  for (const locale of routing.locales) languages[HREFLANG[locale]] = localeUrl(locale, path)
  return { languages }
}
```

- [ ] **Step 2: Build** → grün.
- [ ] **Step 3: Smoke** — `curl -s https://<dev-or-deployed>/en/vorteile | grep -o 'hreflang="[^"]*" href="[^"]*"'` zeigt 6 verschiedene URLs (nicht alle gleich).
- [ ] **Step 4: Commit** `git commit -am "feat(i18n-seo): hreflang echte Locale-URLs"`

---

## Task 6: Sitemap × Locales

**Files:** Modify `claimondo-marketing/app/sitemap.ts`.

- [ ] **Step 1: `langAlternates(path)` umbauen** — gleiche Logik wie Task 5 (echte Prefix-URLs) statt alle→gleich:

```ts
import { routing } from '@/i18n/routing'
const HREFLANG: Record<string,string> = { de:'de-DE', en:'en-US', tr:'tr-TR', ar:'ar', ru:'ru-RU', pl:'pl-PL' }
function langAlternates(path: string): Record<string, string> {
  const clean = path === '/' ? '' : path
  const u = (l: string) => l === routing.defaultLocale ? `${SITE_URL}${clean || '/'}` : `${SITE_URL}/${l}${clean || ''}`
  const r: Record<string,string> = { 'x-default': u(routing.defaultLocale) }
  for (const l of routing.locales) r[HREFLANG[l]] = u(l)
  return r
}
```
> Jeder bestehende Sitemap-Eintrag bekommt so `alternates.languages` mit echten URLs. (Optional Folgeschritt: Einträge auch × Locale als eigene `<url>` listen — `alternates` reicht aber für Google.)

- [ ] **Step 2: Build** → grün.
- [ ] **Step 3: Smoke** — `/sitemap.xml` enthält `xhtml:link rel="alternate" hreflang="en-US" href=".../en/..."`.
- [ ] **Step 4: Commit** `git commit -am "feat(i18n-seo): sitemap echte Locale-Alternates"`

---

## Task 7: Language-Switcher auf URL-Navigation

**Files:** Modify `claimondo-marketing/components/.../LanguageSwitcher.tsx` (Pfad via `grep -rl LanguageSwitcher`).

- [ ] **Step 1: Switcher auf locale-`useRouter`/`usePathname` umstellen** (statt `setLocaleAction`-Cookie):

```tsx
'use client'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useLocale } from 'next-intl'
// ...
const router = useRouter(); const pathname = usePathname(); const active = useLocale()
function switchTo(next: string) { router.replace(pathname, { locale: next }) }
```
> `setLocaleAction` bleibt als Datei (Cookie-Sekundär-Signal), wird vom Switcher aber nicht mehr primär gebraucht.

- [ ] **Step 2: Build** → grün.
- [ ] **Step 3: Commit** `git commit -am "feat(i18n-seo): LanguageSwitcher navigiert via Locale-URL"`

---

## Task 8: Verifikation + Deploy + Smoke

- [ ] **Step 1: Voller Build** `npm run build` grün, MS1 0, BOM 0.
- [ ] **Step 2: Lokaler Standalone-Smoke** (`node .next/standalone/server.js`, PORT=3099, Dummy-.env): 
  - `/vorteile` = 200 deutsch (kein Redirect), `/en/vorteile` = 200 englisch, `/tr/vorteile` = 200 türkisch (OHNE Cookie — Crawler-Sicht!).
  - Byte-Messung via `Out-String` (PowerShell `.Length` zählt sonst Zeilen — Lesson 31.05.).
- [ ] **Step 3: Deploy** `VPS_SSH_PASSWORD=… python scripts/deploy-marketing-update.py <geänderte Pfade…>` (oder Voll-Deploy-Script); Symlink `.next/standalone/.env.local` neu; `pm2 reload`.
- [ ] **Step 4: Live-Smoke + Screenshots** (Pflicht): `claimondo.de/vorteile` (de, unverändert), `claimondo.de/en/vorteile` (en), `/tr/…` — je Status 200 + Screenshot + hreflang-Check; Subdomains unverändert; `/sitemap.xml` enthält Locale-URLs; ein Funnel-Form-Submit (DB-Write ok).
- [ ] **Step 5: PR** `--base staging`, 7-Punkte-Audit im Body. NICHT mergen (keine Merge-Session).

---

## Self-Review

- **Spec-Coverage:** Routing (T1-3) ✓, [locale]-Restruktur (T4) ✓, hreflang (T5) ✓, sitemap (T6) ✓, Switcher (T7) ✓, de-prefix-frei (routing as-needed) ✓, Subdomains de-only (middleware Host-Zweig) ✓, alle Seiten (T4-Liste) ✓, .md-Body-de-Fallback (claimondo-mdx-Verhalten, unverändert) ✓, Akzeptanz/Smoke (T8) ✓.
- **Offene Verifikation beim Bau:** das `<html>`-Placement Root vs `[locale]`-Layout in Next 16 + next-intl 4 — gegen `node_modules/next/dist/docs` + next-intl-v4-Doku prüfen (Step 4.2 Hinweis). Build-OOM-Fallback notiert.
- **Mini-Refinements (in T4-Layout einfließen):** `<html lang={locale}>`, JSON-LD `inLanguage`, opengraph-image bleibt de (locale-frei, akzeptabel — oder späteres per-locale-OG als Folge-Ticket).
