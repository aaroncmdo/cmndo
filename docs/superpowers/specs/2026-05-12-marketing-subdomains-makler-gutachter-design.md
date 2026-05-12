# Marketing-Subdomains: makler.claimondo.de + Angleichung gutachter.claimondo.de + app.claimondo.de-Bereinigung

**Datum:** 2026-05-12
**Status:** Design freigegeben — Implementierungsplan folgt

## Problem / Ziel

Die Makler-Marketing-Seite liegt heute unter `claimondo.de/makler/partner-werden`. Sie soll als eigenständige Subdomain `makler.claimondo.de` erreichbar und dort kanonisch sein — analog zum bestehenden `gutachter.claimondo.de`.

Im selben Zug:
- `gutachter.claimondo.de` an dasselbe Schema angleichen (Subdomain wird kanonisch statt Alias; Nav-/Logo-Klicks landen nicht mehr im 404).
- `app.claimondo.de` strikt zum Portal machen: keine Marketing-Seiten mehr (die Lücke `/makler/partner-werden`), das eingeloggte Makler-Portal `/makler/*` zieht von `claimondo.de` auf `app.claimondo.de` um, und die nackte App-Subdomain `app.claimondo.de/` führt direkt ins `/login`.
- `claimondo.de` bleibt reine Marketing-Domain.

## Ziel-Zustand der Hosts

| Host | Inhalt |
|---|---|
| `claimondo.de` | **Nur Marketing**: `/`, `/kfz-gutachter` (+ Subpaths), `/faq`, `/ueber-uns`, `/vorteile`, `/wie-es-funktioniert`, `/gutachter-finden`, `/schadensreport-2026`, Legal-Pages |
| `www.claimondo.de` | 301 → `claimondo.de` (kanonische Form) |
| `app.claimondo.de` | **Nur Portal**: `/admin`, `/dispatch`, `/gutachter/*`, `/kunde`, `/faelle`, `/flow`, `/upload`, `/sv`, `/kunde-termin`, `/ablehnen`, **`/makler/*` (neu hierher)**, `/login`, `/passwort-*`. `X-Robots-Tag: noindex` außer Login/Passwort. `/` → 307 → `/login`. Eigene `robots.txt` mit `Disallow: /` |
| `gutachter.claimondo.de` | Gutachter-Recruiting (`/gutachter-partner`), **kanonisch** auf `https://gutachter.claimondo.de/` |
| `makler.claimondo.de` (neu) | Makler-Marketing (`/makler/partner-werden`), **kanonisch** auf `https://makler.claimondo.de/` |

## Einheitliches Marketing-Subdomain-Schema (gutachter. + makler.)

Beide Subdomains verhalten sich identisch:

1. `/` → `NextResponse.rewrite` intern auf den Landingpage-Pfad (`/gutachter-partner` bzw. `/makler/partner-werden`). URL in der Adresszeile bleibt `/`. Kein Redirect-Loop (Rewrite triggert die Proxy-Function nicht erneut; Host bleibt gleich).
2. `=== <landingpath>` (z.B. jemand ruft direkt `makler.claimondo.de/makler/partner-werden` auf) → 301 → `/`. Hält genau eine kanonische URL pro Subdomain.
3. `/api/*` → durchreichen an `updateSession` (Webhook-/Health-Pfade nicht umschreiben).
4. Jeder andere Pfad (Logo-Link `/`, Nav-Links wie `/wie-es-funktioniert`, Legal-Links, der Cross-Link `/gutachter-partner` auf der Makler-Seite) → 301 → `claimondo.de/<pfad>`. Ersetzt das bisherige gutachter-Verhalten (Rewrite ins 404).

## `claimondo.de` ↔ Subdomain-Redirects

- `claimondo.de/gutachter-partner` → 301 → `https://gutachter.claimondo.de/`
- `claimondo.de/makler/partner-werden` → 301 → `https://makler.claimondo.de/`
- `claimondo.de/<app-route>` → 301 → `https://app.claimondo.de/<app-route>` (App-Routen siehe Tabelle; `APP_PREFIXES` wird um `/makler` erweitert)
- **Reihenfolge:** Der Subdomain-Landingpage-Check (`/makler/partner-werden`) muss VOR dem `APP_PREFIXES`-Check (`/makler`) greifen, sonst würde die Makler-Marketing-Seite fälschlich auf `app.claimondo.de` umgeleitet.

## `app.claimondo.de`-Logik

1. `/robots.txt` → `Disallow: /` (mit `Allow: /login`, `/passwort-vergessen`) — bleibt wie heute.
2. `/api/*` → `updateSession`.
3. `/` → 307 → `/login`.
4. Pfad ist eine Subdomain-Landingpage (`/gutachter-partner`, `/makler/partner-werden`) → 301 → die jeweilige Subdomain-Root. (Fängt z.B. `app.claimondo.de/makler/partner-werden` ab.)
5. Pfad ist eine Marketing-/Funnel-Route (`MARKETING_PREFIXES`) → 301 → `claimondo.de/<pfad>` (wie heute, nur dass `MARKETING_PREFIXES` erweitert wird — siehe unten). Bewusst konservativ (Prefix-Liste statt „alles-was-kein-App-Route-ist"), damit `/.well-known/acme-challenge/*` o.ä. nicht versehentlich umgeleitet werden.
6. Sonst (echte App-Route oder Unbekanntes) → `updateSession`; bei nicht-öffentlichen Pfaden zusätzlich `X-Robots-Tag: noindex, nofollow`.

`MARKETING_PREFIXES` wird im Zuge dessen vervollständigt um die öffentlichen Funnel-/Marketing-Routen, die heute fehlen: `/schaden-melden`, `/ersteinschaetzung`, `/beratung-anfragen`, `/sa-volltext` (Liste in der Plan-Phase final gegen `src/app/` abgleichen). `/gutachter-partner` wird aus `MARKETING_PREFIXES` *entfernt*, weil es über `SUBDOMAIN_LANDINGPAGES` zur Subdomain (nicht zur Hauptdomain) geleitet wird.

## Repo-Änderungen (Dateien)

1. **`src/proxy.ts`** — neu strukturiert:
   - Host-Konstanten (`HOST_MARKETING`, `HOST_WWW`, `HOST_APP`, `HOST_GUTACHTER`, `HOST_MAKLER`).
   - Zentrale `SUBDOMAIN_LANDINGPAGES: Record<string,string>`-Map (`'/gutachter-partner' → HOST_GUTACHTER`, `'/makler/partner-werden' → HOST_MAKLER`) + Helper `isSubdomainLandingPath(pathname)`.
   - `APP_PREFIXES` um `'/makler'` erweitert.
   - `MARKETING_PREFIXES` bleibt (für den app→main-Redirect), wird um die fehlenden Funnel-Routen erweitert; `/gutachter-partner` daraus entfernen (wird über die Subdomain-Map behandelt).
   - Marketing-Subdomain-Block (gutachter. + makler. gemeinsam, Schema oben).
   - `app.claimondo.de`-Block (Logik oben).
   - `www.` → 301.
   - `claimondo.de`-Block (Subdomain-Landingpages → Subdomain; App-Routen → app.).
   - Fallthrough: `updateSession` für localhost / Vercel-Previews / `*.staging.claimondo.de` (unverändert).
   - `config.matcher` unverändert.

2. **`src/lib/seo/jsonld.ts`** — `export const GUTACHTER_LANDING_URL = 'https://gutachter.claimondo.de'`, `export const MAKLER_LANDING_URL = 'https://makler.claimondo.de'`.

3. **`src/app/gutachter-partner/page.tsx`** — `alternates.canonical` → `` `${GUTACHTER_LANDING_URL}/` ``; `openGraph.url` → dito; `serviceSchema.url` + `breadcrumbsSchema`-Item (`Sachverständiger werden`) → dito; `buildLanguageAlternates('/gutachter-partner')` aus den `alternates` entfernen (Helper baut nur gegen `SITE_URL`; widerspräche dem neuen Canonical; B2B-Recruiting-Seite ist DE-only). Import `buildLanguageAlternates` ggf. entfernen.

4. **`src/app/makler/partner-werden/page.tsx`** — `alternates.canonical` (heute relativ `'/makler/partner-werden'`) → `` `${MAKLER_LANDING_URL}/` ``; `openGraph.url`, `serviceSchema.url`, `breadcrumbsSchema`-Item (`Makler Partner werden`) → dito; Inline-`<Link href="/gutachter-partner">` (CTA „Als Gutachter Partner werden", ~Z. 305) → `href="https://gutachter.claimondo.de"`.

5. **`src/app/sitemap.ts`** — `{ url: 'https://makler.claimondo.de/', changeFrequency: 'monthly', priority: 0.7 }` ergänzen; den `` `${SITE_URL}/gutachter-partner` ``-Eintrag entfernen (301t jetzt — Sitemaps listen nur 200-Canonicals); idealerweise `GUTACHTER_LANDING_URL`/`MAKLER_LANDING_URL`-Konstanten nutzen.

6. **`src/components/landing/LandingFooter.tsx`** — `<Link href="/gutachter-partner">` → `https://gutachter.claimondo.de`, `<Link href="/makler/partner-werden">` → `https://makler.claimondo.de` (vermeidet 301-Hop bei jedem Footer-Klick).

7. **`src/app/robots.ts`** (klein, optional) — `disallow` um `'/makler/'` ergänzen; `'/gutachter-partner/dashboard/'` ist mit dem 301 obsolet (kann bleiben). Nicht load-bearing.

8. **`scripts/smoke/marketing-i18n-smoke.mjs`** (nice-to-have) — Route `makler.claimondo.de/` analog zu `GUTACHTER_ROUTES` ergänzen.

**Kein Eingriff** in `src/lib/supabase/middleware.ts` (`updateSession`) — die `/makler/*`-Auth-Logik existiert bereits, läuft nach dem Umzug nur unter `app.claimondo.de` statt `claimondo.de` (gleiche Wildcard-Cookie-Domain, schon heute funktionierend).

## Infra-Handoff (VPS-Claude — kein Repo-Code)

1. **DNS**: `makler.claimondo.de` A-Record auf dieselbe VPS-IP wie `gutachter.claimondo.de` (ein neuer Record).
2. **nginx**: `gutachter.claimondo.de`-Server-Block kopieren → `makler.claimondo.de`, `proxy_pass` auf denselben Prod-Upstream, `proxy_set_header Host $host;` behalten (wichtig — sonst sieht Next die Subdomain nicht; vgl. Commit `12425a0f`).
3. **SSL**: `makler.claimondo.de` ins bestehende certbot-Zertifikat aufnehmen (`-d makler.claimondo.de` erweitern).
4. Keine nginx-Änderung für `app.` / `gutachter.` nötig — deren Verhalten ändert sich rein in `proxy.ts`.

**Reihenfolge-Abhängigkeit:** DNS + nginx + SSL für `makler.claimondo.de` müssen live sein, **bevor der PR gemerged wird** — sonst zeigt der neue 301 `claimondo.de/makler/partner-werden → makler.claimondo.de/` auf einen toten Host. Empfohlen: Infra zuerst (Subdomain liefert dann erst mal die Marketing-Startseite `/`, weil `proxy.ts` noch nicht rewritet), dann Code-Deploy.

## Edge-Cases / geprüft

- **Kein Redirect-Loop**: `claimondo.de/gutachter-partner` → 301 → `gutachter.claimondo.de/` → Rewrite (intern) → rendert `/gutachter-partner`. Rewrite re-triggert die Proxy-Function nicht. Analog makler.
- `claimondo.de/makler` (bare) → kein Landingpage-Match, aber `APP_PREFIXES`-Match → 301 → `app.claimondo.de/makler` → rendert `(shell)/page.tsx` (Auth-Gate greift dort).
- `app.claimondo.de/makler/partner-werden` → Landingpage-Match → 301 → `makler.claimondo.de/`.
- `app.claimondo.de/vorteile` → kein App-Route → 301 → `claimondo.de/vorteile`.
- `gutachter.claimondo.de/robots.txt` (+ `/sitemap.xml`) → kein `/`, kein `/gutachter-partner`, kein `/api/` → 301 → `claimondo.de/robots.txt`. Besser als der bisherige 404. Die kanonische `robots.txt`/`sitemap.xml` liegt ohnehin auf `claimondo.de` und erlaubt `/` → Subdomain-Root crawlbar.
- `breadcrumbsSchema` nimmt `item: url.startsWith('http') ? url : SITE_URL+url` — daher die Subdomain-URLs als absolute Strings übergeben.
- Email-/Notification-Links auf `claimondo.de/gutachter/...` bzw. `claimondo.de/makler/...` bleiben funktionsfähig (301 → `app.claimondo.de/...`). Direkt-auf-app-URLs in Templates wären sauberer, ist aber Folge-Arbeit, nicht Teil dieses Specs.
- `*.staging.claimondo.de` behält das aktuelle Verhalten (Fallthrough → `updateSession`); kein Subdomain-Split auf Staging.

## Bewusst NICHT im Scope (YAGNI)

- Kein Umzug von `/makler/onboarding`, `/makler/pending`, dem Bewerbungsformular-Backend auf eine eigene Subdomain — die liegen einfach mit unter `app.claimondo.de/makler/*`.
- Keine Supabase-Cookie-Domain-Änderung (`*.claimondo.de`-Wildcard existiert bereits, App-Auth läuft schon über `app.claimondo.de`).
- Kein separates Vercel-/Hosting-Projekt pro Subdomain.
- Keine Umstellung der ~40 `NEXT_PUBLIC_SITE_URL`-Konsumenten auf host-spezifische Helper (separates Thema, siehe Subdomain-Architektur-Memo).
- Keine Reklassifizierung von Funnel-Routen wie `/schaden-melden`, `/ersteinschaetzung`, `/beratung-anfragen` — bleiben wie heute (Fallthrough).

## Verifikation

- `npm run build` grün (vollständiger Build — `proxy.ts` + Route-Metadata, Next-15/16-Validator zur Build-Zeit).
- Lokal via Host-Header:
  - `curl -sI -H "Host: makler.claimondo.de" http://localhost:3000/` → 200, rendert Makler-Seite.
  - `curl -sI -H "Host: makler.claimondo.de" http://localhost:3000/makler/partner-werden` → 301 → `/`.
  - `curl -sI -H "Host: makler.claimondo.de" http://localhost:3000/faq` → 301 → `https://claimondo.de/faq`.
  - `curl -sI -H "Host: app.claimondo.de" http://localhost:3000/` → 307 → `/login`.
  - `curl -sI -H "Host: app.claimondo.de" http://localhost:3000/makler/partner-werden` → 301 → `https://makler.claimondo.de/`.
  - `curl -sI -H "Host: claimondo.de" http://localhost:3000/makler/partner-werden` → 301 → `https://makler.claimondo.de/`.
  - `curl -sI -H "Host: claimondo.de" http://localhost:3000/makler/akten` → 301 → `https://app.claimondo.de/makler/akten`.
  - `curl -sI -H "Host: gutachter.claimondo.de" http://localhost:3000/` → 200, rendert Gutachter-Seite; HTML enthält `<link rel="canonical" href="https://gutachter.claimondo.de/">`.
- `scripts/smoke/marketing-i18n-smoke.mjs` läuft durch (+ neue makler-Route).
- Post-Deploy Prod-Checks: `https://makler.claimondo.de` lädt · `claimondo.de/makler/partner-werden` 301t · `app.claimondo.de` → `/login` · `gutachter.claimondo.de` weiterhin ok + self-canonical · `claimondo.de/gutachter-partner` 301t auf die Subdomain.
- Post-Audit (7-Punkte) im Commit-Body.
