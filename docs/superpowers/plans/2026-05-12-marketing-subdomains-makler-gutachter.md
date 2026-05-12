# Marketing-Subdomains (makler.claimondo.de + gutachter-Angleichung + app-Bereinigung) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `makler.claimondo.de` als kanonische Makler-Marketing-Subdomain (analog `gutachter.claimondo.de`), `gutachter.claimondo.de` an dasselbe Schema angleichen, `app.claimondo.de` strikt als Portal (Makler-Portal `/makler/*` zieht auf `app.`, nackte App-Subdomain → `/login`, keine Marketing-Seiten mehr).

**Architecture:** Die gesamte Host-Routing-Logik lebt in `src/proxy.ts` (Next.js-16-Middleware). Ein einheitlicher Marketing-Subdomain-Block behandelt `gutachter.` + `makler.` identisch: `/` → interner Rewrite auf die Landingpage, langer Pfad → 301 auf `/`, alles andere → 301 auf die Hauptdomain. `claimondo.de` redirectet die Landingpage-Pfade auf ihre Subdomains und App-Routen auf `app.claimondo.de`. SEO-Metadata der zwei Landingpages zeigt auf die Subdomain-Roots; `sitemap.ts`/`LandingFooter` werden nachgezogen. DNS/nginx/SSL für `makler.claimondo.de` macht der VPS-Claude (siehe Anleitung am Ende).

**Tech Stack:** Next.js 16 (Middleware via `proxy.ts`), TypeScript, `next/server` (`NextResponse.rewrite`/`.redirect`), Next Metadata API.

**Branch:** `kitta/aar-marketing-subdomains` (Spec-Commit `4d48c8d7` liegt schon drauf). Empfehlung: Implementierung in einem eigenen git-Worktree (parallele Agenten schalten sonst den Branch um — siehe `superpowers:using-git-worktrees`).

**Spec:** `docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md`

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/proxy.ts` | Host-basiertes Routing (Marketing-Subdomains, app., www., Hauptdomain) | Neu strukturieren |
| `src/lib/seo/jsonld.ts` | SEO-Konstanten | `GUTACHTER_LANDING_URL` + `MAKLER_LANDING_URL` ergänzen |
| `src/app/gutachter-partner/page.tsx` | Gutachter-Recruiting-Landingpage + Metadata | Canonical/OG/JSON-LD auf Subdomain |
| `src/app/makler/partner-werden/page.tsx` | Makler-Recruiting-Landingpage + Metadata | Canonical/OG/JSON-LD auf Subdomain; Cross-Link fixen |
| `src/app/sitemap.ts` | XML-Sitemap | Makler-Subdomain-Eintrag rein, `/gutachter-partner`-Eintrag raus |
| `src/components/landing/LandingFooter.tsx` | Globaler Marketing-Footer | Partner-Links auf Subdomain-URLs |
| `scripts/smoke/marketing-i18n-smoke.mjs` | Marketing-Smoke-Skript | `makler.claimondo.de/`-Route ergänzen (nice-to-have) |

**Kein Change:** `src/lib/supabase/middleware.ts` (`updateSession` behandelt `/makler/*`-Auth schon, läuft nach dem Umzug nur unter `app.claimondo.de`), `src/app/robots.ts` (die 301-Redirects regeln Crawler-Verhalten; `app.claimondo.de` hat eigene `Disallow: /`-robots.txt aus dem Proxy).

---

## Task 1: SEO-Landing-URL-Konstanten

**Files:**
- Modify: `src/lib/seo/jsonld.ts` (direkt unter `export const SITE_URL = 'https://claimondo.de'`)

- [ ] **Step 1: Konstanten ergänzen**

In `src/lib/seo/jsonld.ts`, direkt nach der Zeile `export const SITE_URL = 'https://claimondo.de'` einfügen:

```ts
// Marketing-Subdomains für B2B-Recruiting — kanonische Roots der jeweiligen Landingpages.
export const GUTACHTER_LANDING_URL = 'https://gutachter.claimondo.de'
export const MAKLER_LANDING_URL = 'https://makler.claimondo.de'
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seo/jsonld.ts
git commit -m "feat(seo): GUTACHTER_LANDING_URL + MAKLER_LANDING_URL Konstanten

Audit:
- Build: tsc --noEmit grün
- UI: n/a
- Redundanz: zentrale Konstanten statt String-Literale
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md
- Inkonsistenz: Umlaute n/a
- Regression: n/a (nur neue Exports)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `proxy.ts` — Host-Routing neu strukturieren

**Files:**
- Modify: `src/proxy.ts` (kompletter Datei-Inhalt wird ersetzt — siehe Step 1)

**Hinweis:** Es gibt keine Unit-Tests für die Middleware in diesem Repo (etablierter Stil — `proxy.ts` enthält Inline-Logik). Verifikation läuft über `npm run build` (Task 8) + curl-Matrix mit `Host`-Header (Task 8). Die curl-Matrix ist der „Test" für diese Task — sie steht bewusst gesammelt in Task 8, weil sie einen laufenden Dev-/Prod-Server braucht.

- [ ] **Step 1: `src/proxy.ts` komplett ersetzen**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

// 2026-05-12: Domain-Layout
//   claimondo.de            — nur Marketing
//   www.claimondo.de        — 301 → claimondo.de
//   app.claimondo.de        — nur Portal (noindex), nackte Subdomain → /login
//   gutachter.claimondo.de  — Recruiting-Landingpage /gutachter-partner (kanonisch)
//   makler.claimondo.de     — Recruiting-Landingpage /makler/partner-werden (kanonisch)
//
// Frühere Konsolidierung: 2026-05-09 Domain-Split, 2026-05-11 middleware.ts → proxy.ts.

// ─── Hosts ──────────────────────────────────────────────────────────────
const HOST_MARKETING = 'claimondo.de'
const HOST_WWW = 'www.claimondo.de'
const HOST_APP = 'app.claimondo.de'
const HOST_GUTACHTER = 'gutachter.claimondo.de'
const HOST_MAKLER = 'makler.claimondo.de'

// ─── Routen-Klassifizierung ─────────────────────────────────────────────
// Portal-/App-Routen — gehören auf app.claimondo.de.
const APP_PREFIXES = [
  '/admin', '/dispatch', '/gutachter/', '/kunde', '/faelle', '/flow',
  '/upload', '/sv', '/kunde-termin', '/ablehnen', '/makler',
  '/login', '/passwort-vergessen', '/passwort-zuruecksetzen', '/passwort-aendern',
]

// Öffentliche Marketing-/Funnel-Routen — bleiben auf claimondo.de.
// Werden auf app.claimondo.de per 301 zurück auf die Hauptdomain geschickt.
const MARKETING_PREFIXES = [
  '/vorteile', '/wie-es-funktioniert', '/faq', '/kfz-gutachter',
  '/gutachter-finden', '/ueber-uns',
  '/schaden-melden', '/ersteinschaetzung', '/beratung-anfragen', '/sa-volltext',
  '/impressum', '/datenschutz', '/agb', '/nutzungsbedingungen',
  '/schadensreport-2026',
]

// Marketing-Landingpages mit eigener Subdomain.
// claimondo.de/<pfad> → 301 auf <host>/   ·   <host>/ → rewrite intern auf <pfad>.
const SUBDOMAIN_LANDINGPAGES: Record<string, string> = {
  '/gutachter-partner': HOST_GUTACHTER,
  '/makler/partner-werden': HOST_MAKLER,
}
// Umkehrung: Subdomain-Host → Landingpage-Pfad.
const LANDINGPAGE_FOR_HOST: Record<string, string> = Object.fromEntries(
  Object.entries(SUBDOMAIN_LANDINGPAGES).map(([path, host]) => [host, path]),
)

function matchesAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
}

/** 301 auf denselben Pfad/Query unter anderem Host; mit `pathname` zusätzlich den Pfad ersetzen. */
function redirectToHost(request: NextRequest, hostname: string, pathname?: string): NextResponse {
  const url = new URL(request.url)
  url.hostname = hostname
  url.protocol = 'https:'
  url.port = ''
  if (pathname !== undefined) {
    url.pathname = pathname
    url.search = ''
  }
  return NextResponse.redirect(url, 301)
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname
  const isApi = pathname.startsWith('/api/')

  // ─── Marketing-Subdomains (gutachter. / makler.) ──────────────────────
  const subdomainLandingPath = LANDINGPAGE_FOR_HOST[hostname]
  if (subdomainLandingPath) {
    // /api/* unverändert durchreichen (Health-Checks etc. — nicht umschreiben).
    if (isApi) return await updateSession(request)
    // Root → intern die Landingpage rendern, Adresszeile bleibt "/".
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = subdomainLandingPath
      return NextResponse.rewrite(url)
    }
    // Direkter Aufruf des langen Pfads → auf die kanonische "/" umleiten.
    if (pathname === subdomainLandingPath) {
      return NextResponse.redirect(new URL('/', request.url), 301)
    }
    // Alles andere (Logo, Nav, Legal, Cross-Links) → zurück auf die Hauptdomain.
    return redirectToHost(request, HOST_MARKETING)
  }

  // ─── app.claimondo.de — nur Portal ────────────────────────────────────
  if (hostname === HOST_APP) {
    // Eigene robots.txt: App-Subdomain komplett aus dem Index halten.
    if (pathname === '/robots.txt') {
      return new NextResponse(
        'User-agent: *\nDisallow: /\nAllow: /login\nAllow: /passwort-vergessen\n',
        { status: 200, headers: { 'content-type': 'text/plain' } },
      )
    }
    if (isApi) return await updateSession(request)
    // Nackte App-Subdomain → direkt ins Login.
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Marketing-Landingpage versehentlich auf app.* → auf ihre eigene Subdomain.
    const landingHost = SUBDOMAIN_LANDINGPAGES[pathname]
    if (landingHost) return redirectToHost(request, landingHost, '/')
    // Sonstige Marketing-/Funnel-Routen → zurück auf die Hauptdomain.
    if (matchesAnyPrefix(pathname, MARKETING_PREFIXES)) {
      return redirectToHost(request, HOST_MARKETING)
    }
    // Echte App-Route (oder Unbekanntes): Session-Refresh + noindex (außer Login/Passwort).
    const isPublicAppPath = pathname === '/login' || pathname.startsWith('/passwort-')
    const response = await updateSession(request)
    if (!isPublicAppPath) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    }
    return response
  }

  // ─── www.claimondo.de → claimondo.de (kanonische Form) ────────────────
  if (hostname === HOST_WWW) {
    return redirectToHost(request, HOST_MARKETING)
  }

  // ─── claimondo.de (Hauptdomain, Marketing) ────────────────────────────
  if (hostname === HOST_MARKETING) {
    // Subdomain-Landingpages: alter Pfad → eigene Subdomain.
    // MUSS vor dem APP_PREFIXES-Check stehen — /makler/partner-werden matcht
    // sonst das /makler-App-Prefix und ginge fälschlich auf app.claimondo.de.
    const landingHost = SUBDOMAIN_LANDINGPAGES[pathname]
    if (landingHost) return redirectToHost(request, landingHost, '/')
    // App-/Portal-Routen → app.claimondo.de.
    if (!isApi && matchesAnyPrefix(pathname, APP_PREFIXES)) {
      return redirectToHost(request, HOST_APP)
    }
    return await updateSession(request)
  }

  // ─── localhost / Vercel-Previews / *.staging.claimondo.de ─────────────
  return await updateSession(request)
}

export const config = {
  // Vollständiger Exclusion-Katalog:
  // .glb → Mapbox 3D-Modell; .js/.json → sw.js + manifest.json;
  // .obj/.mtl → Three.js OBJLoader; Rest → Standard Next.js-Artefakte.
  // robots.txt und sitemap.xml MÜSSEN durch den Proxy (app.claimondo.de
  // braucht eine eigene robots.txt). txt/xml deshalb NICHT im Exclusion-Pattern.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|obj|mtl|hdr|ktx2|woff|woff2|mp4|webm|js|json)$).*)',
  ],
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler. (`Object.fromEntries` ist mit dem Repo-`tsconfig` verfügbar; falls ein Lib-Target-Fehler kommt, stattdessen die Map manuell bauen: `const LANDINGPAGE_FOR_HOST: Record<string,string> = {}; for (const [p, h] of Object.entries(SUBDOMAIN_LANDINGPAGES)) LANDINGPAGE_FOR_HOST[h] = p`.)

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(proxy): makler.claimondo.de + gutachter-Angleichung + app-Bereinigung

makler.claimondo.de spiegelt das gutachter.claimondo.de-Schema (Root rewritet
intern auf /makler/partner-werden, langer Pfad → 301 auf /, sonst → claimondo.de).
gutachter.claimondo.de wird identisch behandelt (vorher: unbekannte Pfade ins
404 gerewritet). app.claimondo.de: nackte Subdomain → /login, Marketing-Routen
+ /makler/partner-werden → 301 auf claimondo.de bzw. makler.claimondo.de;
/makler ist jetzt ein App-Prefix → claimondo.de/makler/* → app.claimondo.de.

Audit:
- Build: tsc --noEmit grün; npm run build in Task 8
- UI: n/a (Routing); Einstiegspunkte/Links in Folge-Tasks
- Redundanz: zentrale SUBDOMAIN_LANDINGPAGES-Map statt dupliziertem Block
- Dead-Code: alter gutachter-Inline-Block ersetzt
- Spec: docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md
- Inkonsistenz: Umlaute in Kommentaren ok
- Regression: app.claimondo.de robots.txt + Session-Pfad unverändert; www→main bleibt; staging/localhost Fallthrough unverändert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `gutachter-partner` Metadata auf Subdomain

**Files:**
- Modify: `src/app/gutachter-partner/page.tsx`

- [ ] **Step 1: Import anpassen**

Aktuell (Zeile ~1–6):
```ts
import type { Metadata } from 'next'
import {
  serviceSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import GutachterPartnerClient from './GutachterPartnerClient'
```

Ersetzen durch:
```ts
import type { Metadata } from 'next'
import {
  serviceSchema, breadcrumbsSchema,
  jsonLdScript, GUTACHTER_LANDING_URL,
} from '@/lib/seo/jsonld'
import GutachterPartnerClient from './GutachterPartnerClient'
```

(`SITE_URL` und `buildLanguageAlternates` werden hier nicht mehr gebraucht — die Recruiting-Subdomain ist DE-only, hreflang auf inhaltsgleiche URLs entfällt; `buildLanguageAlternates` baut ohnehin nur gegen `SITE_URL` und würde dem neuen Canonical widersprechen.)

- [ ] **Step 2: `alternates` ersetzen**

Aktuell:
```ts
  alternates: {
    canonical: `${SITE_URL}/gutachter-partner`,
    ...buildLanguageAlternates('/gutachter-partner'),
  },
```
Ersetzen durch:
```ts
  alternates: {
    canonical: `${GUTACHTER_LANDING_URL}/`,
  },
```

- [ ] **Step 3: `openGraph.url` ersetzen**

Aktuell: `url: \`${SITE_URL}/gutachter-partner\`,`
Ersetzen durch: `url: \`${GUTACHTER_LANDING_URL}/\`,`

- [ ] **Step 4: JSON-LD-URLs ersetzen**

Im `serviceSchema({ ... })`-Aufruf: `url: \`${SITE_URL}/gutachter-partner\`,` → `url: \`${GUTACHTER_LANDING_URL}/\`,`

Im `breadcrumbsSchema([...])`-Aufruf: `{ name: 'Sachverständiger werden', url: '/gutachter-partner' },` → `{ name: 'Sachverständiger werden', url: \`${GUTACHTER_LANDING_URL}/\` },`
(`breadcrumbsSchema` nimmt den `url`-Wert unverändert, wenn er mit `http` beginnt — sonst prependet es `SITE_URL`. Deshalb absolut übergeben.)

Den `{ name: 'Startseite', url: '/' }`-Eintrag NICHT ändern (zeigt korrekt auf `claimondo.de/`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (insb. kein „unused import" für `SITE_URL`/`buildLanguageAlternates`).

- [ ] **Step 6: Commit**

```bash
git add src/app/gutachter-partner/page.tsx
git commit -m "feat(gutachter-partner): Canonical/OG/JSON-LD auf gutachter.claimondo.de

Die Recruiting-Landingpage ist jetzt unter gutachter.claimondo.de/ kanonisch
(vorher Alias mit canonical auf claimondo.de). hreflang-Alternates entfernt
(DE-only B2B-Seite, baute ohnehin nur gegen SITE_URL).

Audit:
- Build: tsc --noEmit grün; npm run build in Task 8
- UI: n/a (Metadata)
- Redundanz: GUTACHTER_LANDING_URL-Konstante genutzt
- Dead-Code: ungenutzte Imports (SITE_URL, buildLanguageAlternates) entfernt
- Spec: docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md
- Inkonsistenz: Umlaute n/a
- Regression: claimondo.de/gutachter-partner 301t (proxy) → kein Duplicate-Content

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `makler/partner-werden` Metadata auf Subdomain + Cross-Link

**Files:**
- Modify: `src/app/makler/partner-werden/page.tsx`

- [ ] **Step 1: Import anpassen**

Aktuell (Zeile 8):
```ts
import { serviceSchema, breadcrumbsSchema, jsonLdScript, SITE_URL, PHONE_DISPLAY, CONTACT_EMAIL } from '@/lib/seo/jsonld'
```
Ersetzen durch:
```ts
import { serviceSchema, breadcrumbsSchema, jsonLdScript, MAKLER_LANDING_URL, GUTACHTER_LANDING_URL, PHONE_DISPLAY, CONTACT_EMAIL } from '@/lib/seo/jsonld'
```

(`SITE_URL` wird in dieser Datei sonst nicht mehr verwendet — Step 5 prüft das per Typecheck. `GUTACHTER_LANDING_URL` wird für den Cross-Link in Step 4 gebraucht.)

- [ ] **Step 2: `alternates.canonical` ersetzen**

Aktuell (Zeile ~24–26):
```ts
  alternates: {
    canonical: '/makler/partner-werden',
  },
```
Ersetzen durch:
```ts
  alternates: {
    canonical: `${MAKLER_LANDING_URL}/`,
  },
```

- [ ] **Step 3: `openGraph.url` + JSON-LD-URLs ersetzen**

- `openGraph.url` (Zeile ~31): `url: \`${SITE_URL}/makler/partner-werden\`,` → `url: \`${MAKLER_LANDING_URL}/\`,`
- `serviceSchema({ ... url: \`${SITE_URL}/makler/partner-werden\`, ... })` (Zeile ~102) → `url: \`${MAKLER_LANDING_URL}/\`,`
- `breadcrumbsSchema([...])` (Zeile ~104–107): `{ name: 'Makler Partner werden', url: '/makler/partner-werden' },` → `{ name: 'Makler Partner werden', url: \`${MAKLER_LANDING_URL}/\` },`
- `{ name: 'Startseite', url: '/' }` NICHT ändern.

- [ ] **Step 4: Cross-Link „Als Gutachter Partner werden" auf die Subdomain**

Aktuell (Zeile ~304–310):
```tsx
            <Link
              href="/gutachter-partner"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
            >
              Als Gutachter Partner werden
              <ChevronRight className="h-4 w-4" />
            </Link>
```
Ersetzen durch:
```tsx
            <Link
              href={GUTACHTER_LANDING_URL}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
            >
              Als Gutachter Partner werden
              <ChevronRight className="h-4 w-4" />
            </Link>
```

(Grund: dieser Link liegt auf `makler.claimondo.de`; `/gutachter-partner` würde per Proxy erst auf `claimondo.de`, dann auf `gutachter.claimondo.de` umgeleitet — zwei Hops. Direkt zur Subdomain.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (kein „unused import" für `SITE_URL`).

- [ ] **Step 6: Commit**

```bash
git add src/app/makler/partner-werden/page.tsx
git commit -m "feat(makler/partner-werden): Canonical/OG/JSON-LD auf makler.claimondo.de

Die Makler-Recruiting-Seite ist jetzt unter makler.claimondo.de/ kanonisch.
Cross-Link 'Als Gutachter Partner werden' zeigt direkt auf
gutachter.claimondo.de (kein 301-Doppel-Hop).

Audit:
- Build: tsc --noEmit grün; npm run build in Task 8
- UI: Cross-Link-Ziel angepasst; Marketing-Seite selbst unverändert
- Redundanz: MAKLER_LANDING_URL/GUTACHTER_LANDING_URL-Konstanten genutzt
- Dead-Code: ungenutzter SITE_URL-Import entfernt
- Spec: docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md
- Inkonsistenz: Umlaute ok
- Regression: claimondo.de/makler/partner-werden 301t (proxy) → makler.claimondo.de

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `sitemap.ts` — Makler-Subdomain rein, `/gutachter-partner` raus

**Files:**
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Import erweitern**

Aktuell (Zeile 2): `import { SITE_URL } from '@/lib/seo/jsonld'`
Ersetzen durch: `import { SITE_URL, GUTACHTER_LANDING_URL, MAKLER_LANDING_URL } from '@/lib/seo/jsonld'`

- [ ] **Step 2: Den `${SITE_URL}/gutachter-partner`-Block durch die beiden Subdomain-Roots ersetzen**

Aktuell (der Block mit Kommentar `// Gutachter-Partner-Recruiting (Marketing-Seite + Subdomain)`):
```ts
    // Gutachter-Partner-Recruiting (Marketing-Seite + Subdomain)
    {
      url: `${SITE_URL}/gutachter-partner`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
      alternates: { languages: langAlternates('/gutachter-partner') },
    },
    {
      url: 'https://gutachter.claimondo.de/',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
```
Ersetzen durch:
```ts
    // Recruiting-Subdomains — eigene kanonische URLs (claimondo.de/<pfad> 301t dorthin)
    {
      url: `${GUTACHTER_LANDING_URL}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${MAKLER_LANDING_URL}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
```

(Der `${SITE_URL}/gutachter-partner`-Eintrag fliegt raus, weil er per 301 weiterleitet — Sitemaps sollen nur 200-Canonicals listen.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/app/sitemap.ts
git commit -m "feat(sitemap): makler.claimondo.de aufnehmen, /gutachter-partner-Eintrag entfernen

claimondo.de/gutachter-partner 301t jetzt auf gutachter.claimondo.de — Sitemap
listet nur noch die kanonischen Subdomain-Roots beider Recruiting-Seiten.

Audit:
- Build: tsc --noEmit grün; npm run build in Task 8
- UI: n/a
- Redundanz: Konstanten genutzt
- Dead-Code: redirektender Sitemap-Eintrag entfernt
- Spec: docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md
- Inkonsistenz: Umlaute ok
- Regression: GSC sollte beide Subdomains verifiziert haben (gutachter war bereits drin)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `LandingFooter` — Partner-Links auf Subdomain-URLs

**Files:**
- Modify: `src/components/landing/LandingFooter.tsx` (Spalte „Partner", Zeilen ~78–87)

- [ ] **Step 1: Die zwei Partner-Links umstellen**

Aktuell:
```tsx
              <li>
                <Link href="/gutachter-partner" className="transition-colors hover:text-white">
                  Gutachter werden
                </Link>
              </li>
              <li>
                <Link href="/makler/partner-werden" className="transition-colors hover:text-white">
                  {t('partner.makler')}
                </Link>
              </li>
```
Ersetzen durch:
```tsx
              <li>
                <Link href="https://gutachter.claimondo.de" className="transition-colors hover:text-white">
                  Gutachter werden
                </Link>
              </li>
              <li>
                <Link href="https://makler.claimondo.de" className="transition-colors hover:text-white">
                  {t('partner.makler')}
                </Link>
              </li>
```

(Konsistent mit dem bereits vorhandenen `<Link href="https://app.claimondo.de/login">` in derselben Spalte. Damit landet „Makler werden" / „Gutachter werden" direkt auf der Subdomain statt über einen 301-Hop.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/LandingFooter.tsx
git commit -m "feat(landing-footer): Partner-Links direkt auf makler./gutachter.claimondo.de

'Makler werden' und 'Gutachter werden' im Footer zeigen jetzt direkt auf die
Subdomains (kein 301-Hop über claimondo.de).

Audit:
- Build: tsc --noEmit grün; npm run build in Task 8
- UI: Footer-Links — sichtbarer Einstiegspunkt unverändert, nur Ziel-URL
- Redundanz: n/a
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md
- Inkonsistenz: Umlaute ok; konsistent mit app.claimondo.de-Link daneben
- Regression: alte Pfade /gutachter-partner und /makler/partner-werden 301en weiterhin (proxy) — keine toten Bookmarks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Smoke-Skript — `makler.claimondo.de/`-Route ergänzen (nice-to-have)

**Files:**
- Modify: `scripts/smoke/marketing-i18n-smoke.mjs`

- [ ] **Step 1: Datei lesen und die gutachter-Stellen identifizieren**

Run: `grep -n "gutachter\|baseMain\|baseGutachter\|GUTACHTER_ROUTES\|report.results" scripts/smoke/marketing-i18n-smoke.mjs`

Relevante Stellen: die `baseGutachter`-Konstante (`baseMain.replace('://claimondo.de', '://gutachter.claimondo.de')`), das `GUTACHTER_ROUTES`-Array (`[{ path: '/', name: 'gutachter-b2b-landing' }]`), die for-Schleife die `smoke(...)` für jede gutachter-Route aufruft, und der Report-Summary-Filter (`r.area === 'gutachter'`).

- [ ] **Step 2: Makler-Pendant ergänzen**

Analog zu jeder gutachter-Stelle eine makler-Variante hinzufügen:
- Konstante: `const baseMakler = baseMain.replace('://claimondo.de', '://makler.claimondo.de')`
- Routen: `const MAKLER_ROUTES = [{ path: '/', name: 'makler-b2b-landing' }]`
- Schleife (direkt nach der gutachter-Schleife, gleiches Muster):
  ```js
  // ─── makler.claimondo.de (kein Sprachen-Switch) ────────────────
  const mDir = join(OUT_DIR, 'makler')
  // ... (mkdir wie bei gDir)
  for (const route of MAKLER_ROUTES) {
    const url = `${baseMakler}${route.path}`
    const screenshotPath = join(mDir, `${route.name}.png`)
    const r = await smoke(`makler${route.path}`, url, screenshotPath, null)
    report.results.push({ ...r, lang: 'de', area: 'makler', route: route.path })
  }
  ```
  (Die exakten Helfer-Namen `OUT_DIR`, `join`, `smoke`, `report` aus dem Umfeld der gutachter-Schleife übernehmen — Step 1 zeigt sie.)
- Summary: falls es einen `gRows = report.results.filter(r => r.area === 'gutachter')`-Block gibt, analog `mRows = ... 'makler'` ergänzen und in die Konsolen-Ausgabe aufnehmen.

- [ ] **Step 3: Syntax-Check**

Run: `node --check scripts/smoke/marketing-i18n-smoke.mjs`
Expected: kein Output (Syntax ok). (Den Smoke nicht ausführen — er braucht die Live-Subdomain, die erst nach dem Infra-Setup existiert.)

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke/marketing-i18n-smoke.mjs
git commit -m "test(smoke): makler.claimondo.de/ in den Marketing-Smoke aufnehmen

Audit:
- Build: node --check grün
- UI: n/a
- Redundanz: spiegelt das vorhandene gutachter-Muster
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md
- Inkonsistenz: Umlaute ok
- Regression: n/a (nur zusätzliche Smoke-Route)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Vollständiger Build + curl-Verifikations-Matrix

**Files:** keine — reine Verifikation.

- [ ] **Step 1: Voller Build**

Run: `npm run build`
Expected: Build grün, keine Next-Validator-Fehler (insb. Metadata-/Route-Validierung). Bei OOM lokal: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.

- [ ] **Step 2: Prod-Server starten**

Run (in einem zweiten Terminal, im Hintergrund lassen): `npm run start`
Expected: Server lauscht auf `http://localhost:3000`.

- [ ] **Step 3: curl-Matrix abarbeiten**

Jeden Befehl ausführen, Status + `location`-Header gegen die Erwartung prüfen (`curl -sS -o /dev/null -D -` zeigt die Header). Unter PowerShell alternativ `curl.exe` verwenden.

| Befehl | Erwartung |
|---|---|
| `curl -sS -o /dev/null -D - -H "Host: makler.claimondo.de" http://localhost:3000/` | `200` — und im Body (`curl -s -H "Host: makler.claimondo.de" http://localhost:3000/ \| grep -i 'rel="canonical"'`) steht `href="https://makler.claimondo.de/"` |
| `curl -sS -o /dev/null -D - -H "Host: makler.claimondo.de" http://localhost:3000/makler/partner-werden` | `301`, `location: https://makler.claimondo.de/` |
| `curl -sS -o /dev/null -D - -H "Host: makler.claimondo.de" http://localhost:3000/faq` | `301`, `location: https://claimondo.de/faq` |
| `curl -sS -o /dev/null -D - -H "Host: gutachter.claimondo.de" http://localhost:3000/` | `200`, Canonical `https://gutachter.claimondo.de/` |
| `curl -sS -o /dev/null -D - -H "Host: gutachter.claimondo.de" http://localhost:3000/wie-es-funktioniert` | `301`, `location: https://claimondo.de/wie-es-funktioniert` (vorher: 404) |
| `curl -sS -o /dev/null -D - -H "Host: app.claimondo.de" http://localhost:3000/` | `307`, `location: https://app.claimondo.de/login` (bzw. relativ `/login`) |
| `curl -sS -o /dev/null -D - -H "Host: app.claimondo.de" http://localhost:3000/makler/partner-werden` | `301`, `location: https://makler.claimondo.de/` |
| `curl -sS -o /dev/null -D - -H "Host: app.claimondo.de" http://localhost:3000/vorteile` | `301`, `location: https://claimondo.de/vorteile` |
| `curl -sS -o /dev/null -D - -H "Host: app.claimondo.de" http://localhost:3000/robots.txt` | `200`, Body beginnt `User-agent: *\nDisallow: /` |
| `curl -sS -o /dev/null -D - -H "Host: app.claimondo.de" http://localhost:3000/admin` | `307` → `/login` (von `updateSession`, da unauthentifiziert) und Response-Header `x-robots-tag: noindex, nofollow` |
| `curl -sS -o /dev/null -D - -H "Host: claimondo.de" http://localhost:3000/makler/partner-werden` | `301`, `location: https://makler.claimondo.de/` |
| `curl -sS -o /dev/null -D - -H "Host: claimondo.de" http://localhost:3000/gutachter-partner` | `301`, `location: https://gutachter.claimondo.de/` |
| `curl -sS -o /dev/null -D - -H "Host: claimondo.de" http://localhost:3000/makler/akten` | `301`, `location: https://app.claimondo.de/makler/akten` |
| `curl -sS -o /dev/null -D - -H "Host: claimondo.de" http://localhost:3000/admin` | `301`, `location: https://app.claimondo.de/admin` |
| `curl -sS -o /dev/null -D - -H "Host: claimondo.de" http://localhost:3000/` | `200` (Marketing-Startseite) |
| `curl -sS -o /dev/null -D - -H "Host: www.claimondo.de" http://localhost:3000/faq` | `301`, `location: https://claimondo.de/faq` |
| `curl -sS -o /dev/null -D - -H "Host: localhost:3000" http://localhost:3000/makler/partner-werden` | `200` (Fallthrough — Dev rendert die Seite direkt) |

- [ ] **Step 4: Server stoppen**

Den `npm run start`-Prozess beenden (Ctrl-C im zweiten Terminal).

- [ ] **Step 5: Kein Commit** — falls etwas nicht passt, zur betroffenen Task zurück, fixen, neu committen, Matrix erneut.

---

## Task 9: Push + Pull Request

**Files:** keine.

> **STOP — vor diesem Task Rücksprache mit Aaron.** Der PR darf erst gemerged werden, wenn DNS + nginx + SSL für `makler.claimondo.de` live sind (sonst zeigt der 301 `claimondo.de/makler/partner-werden → makler.claimondo.de/` auf einen toten Host). Siehe „Anleitung" unten.

- [ ] **Step 1: Branch pushen**

Run: `git push -u origin kitta/aar-marketing-subdomains`

- [ ] **Step 2: PR öffnen**

Run: `gh pr create --base main --title "Marketing-Subdomains: makler.claimondo.de + gutachter-Angleichung + app-Bereinigung" --body "<siehe unten>"`

PR-Body:
```
## Was

- **makler.claimondo.de** (neu): Root rewritet intern auf `/makler/partner-werden`; die Seite ist dort kanonisch. Langer Pfad → 301 auf `/`. Andere Pfade → 301 auf `claimondo.de`.
- **gutachter.claimondo.de**: an dasselbe Schema angeglichen — jetzt ebenfalls self-canonical, unbekannte Pfade 301en auf `claimondo.de` statt im 404 zu landen.
- **app.claimondo.de**: strikt Portal — nackte Subdomain → `/login`; Marketing-/Funnel-Routen und `/makler/partner-werden` → 301 (auf `claimondo.de` bzw. `makler.claimondo.de`); `/makler` ist jetzt ein App-Prefix, `claimondo.de/makler/*` → `app.claimondo.de/makler/*`.
- **claimondo.de**: `/gutachter-partner` und `/makler/partner-werden` → 301 auf ihre Subdomains; Footer-Links + JSON-LD/Canonical/OG + Sitemap entsprechend nachgezogen.

## Infra-Abhängigkeit (BLOCKIEREND vor Merge)

DNS + nginx-Server-Block + SSL für `makler.claimondo.de` müssen live sein (analog `gutachter.claimondo.de`), sonst zeigt der `claimondo.de/makler/partner-werden`-Redirect ins Leere. Details in `docs/superpowers/plans/2026-05-12-marketing-subdomains-makler-gutachter.md` → Abschnitt „Anleitung".

## Verifikation

`npm run build` grün + curl-Matrix mit `Host`-Header (siehe Plan, Task 8). Nach Deploy: Prod-Checks im Plan.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 3: PR-Link an Aaron melden** und auf Review + Infra-Bestätigung warten. **Nicht selbst mergen** (siehe Memory: Doppel-Production-Builds).

---

## Self-Review (vom Plan-Autor durchgeführt)

- **Spec-Coverage:** makler-Subdomain → Task 2 + 4. gutachter-Angleichung → Task 2 + 3. app=Portal/`/login`/`/makler`-Umzug → Task 2. Canonical-Flip → Task 3 + 4. Sitemap → Task 5. Footer-/Cross-Links („Makler werden" → makler.claimondo.de) → Task 4 + 6. SEO-Konstanten → Task 1. Smoke → Task 7. Build+curl → Task 8. PR + Infra-Handoff → Task 9 + Anleitung. Kein `robots.ts`/`supabase/middleware.ts`-Change — in der Spec als „kein Change nötig" begründet. ✓
- **Placeholder-Scan:** keine TBD/TODO; alle Code-Steps zeigen den konkreten Code; Task 7 referenziert vorhandene Helfer im File und sagt, wie man sie findet (Step 1). ✓
- **Typ-Konsistenz:** `GUTACHTER_LANDING_URL`/`MAKLER_LANDING_URL` (Task 1) werden in Task 2 (proxy nutzt eigene `HOST_*`-Strings, nicht die URL-Konstanten — bewusst, Middleware braucht nur Hostnamen), Task 3, 4, 5, 6 konsistent verwendet. `redirectToHost`, `matchesAnyPrefix`, `SUBDOMAIN_LANDINGPAGES`, `LANDINGPAGE_FOR_HOST` in Task 2 konsistent benannt. ✓

---

## Anleitung für Aaron / VPS-Claude

### Reihenfolge (wichtig)

1. **Zuerst Infra** (VPS-Claude) — Schritte A–C unten. Danach liefert `makler.claimondo.de` erst mal nur die Marketing-Startseite `/` (weil der Code-Rewrite noch nicht deployed ist) — das ist okay, kein toter Host.
2. **Dann Code-Merge + Deploy** (Aaron) — PR aus Task 9 reviewen, mergen, der Prod-Build zieht den Proxy + die Metadata-Änderungen. Ab dann rewritet `makler.claimondo.de/` auf die Makler-Seite und `claimondo.de/makler/partner-werden` 301t dorthin.
3. **Danach Prod-Smoke** (Schritt D).

### A — DNS

Einen Record für `makler.claimondo.de` anlegen, der auf dieselbe Stelle zeigt wie `gutachter.claimondo.de` (gleiche VPS-IP — `dig +short gutachter.claimondo.de` als Vorlage, dann denselben A-/AAAA-Record für `makler` setzen). Falls bereits ein `*.claimondo.de`-Wildcard existiert, ist nichts zu tun.

### B — nginx (auf dem VPS)

Den vorhandenen Server-Block für `gutachter.claimondo.de` kopieren, `server_name` auf `makler.claimondo.de` ändern, `proxy_pass` auf denselben Upstream lassen (der Prod-Next-Prozess, derselbe Port wie bei `claimondo.de`/`gutachter.claimondo.de`). **Wichtig:** `proxy_set_header Host $host;` muss drin sein — sonst sieht Next nicht `makler.claimondo.de` und der Proxy-Block greift nicht (vgl. der Reverse-Proxy-Host-Fix von 11.05.). Danach `nginx -t && systemctl reload nginx`.

### C — SSL

`makler.claimondo.de` ins bestehende Zertifikat aufnehmen, z.B. das Zertifikat um die Domain erweitern:
`certbot --nginx -d claimondo.de -d www.claimondo.de -d app.claimondo.de -d gutachter.claimondo.de -d makler.claimondo.de --expand`
(genaue Domain-Liste vorher mit `certbot certificates` prüfen — nur `makler.claimondo.de` ergänzen, Rest unverändert übernehmen).

Für `app.claimondo.de` und `gutachter.claimondo.de` ist **keine** nginx-/DNS-/SSL-Änderung nötig — deren neues Verhalten kommt rein aus dem `proxy.ts`-Code.

### D — Prod-Smoke nach dem Deploy (Aaron)

- `https://makler.claimondo.de` → lädt die Makler-Seite, `<link rel="canonical" href="https://makler.claimondo.de/">` im HTML.
- `https://claimondo.de/makler/partner-werden` → 301 → `https://makler.claimondo.de/`.
- `https://makler.claimondo.de/faq` → 301 → `https://claimondo.de/faq`.
- `https://app.claimondo.de` → 307 → `https://app.claimondo.de/login`.
- `https://app.claimondo.de/makler/akten` → ggf. nach Login das Makler-Portal (eingeloggt als Makler), Response-Header `x-robots-tag: noindex`.
- `https://gutachter.claimondo.de` → unverändert erreichbar, jetzt self-canonical.
- `https://claimondo.de/gutachter-partner` → 301 → `https://gutachter.claimondo.de/`.
- Optional: `node scripts/smoke/marketing-i18n-smoke.mjs` (falls Task 7 gemacht wurde) — makler-Route grün.
- Search Console: prüfen, dass `makler.claimondo.de` als Property verifiziert ist (für die Sitemap-Cross-Host-Einträge); `gutachter.claimondo.de` war es bereits.

### Was Aaron sonst tun muss

- Den PR (Task 9) reviewen und mergen — **erst nach** Schritt A–C.
- Falls Email-/WhatsApp-Templates irgendwo `claimondo.de/makler/...` als Portal-Link hart verdrahten: funktioniert weiter (301 → `app.claimondo.de`), aber bei Gelegenheit auf `app.claimondo.de` umstellen — nicht Teil dieses PRs.
