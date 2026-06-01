# Smoke — Marketing i18n crawlbare Locale-URLs (31.05.2026)

Branch `kitta/marketing-i18n-locale-urls` (off `kitta/marketing-subdomains-makler-kfzgutachter`).
Standalone-Build `claimondo-marketing/` (:3099 lokal). Crawler-Sicht = ohne Cookie.

## Ergebnis: PASS

| Pfad | Status | lang | Befund |
|---|---|---|---|
| `/vorteile` | 200 | de | kein Redirect, kein Loop; canonical `/vorteile` |
| `/en/vorteile` | 200 | en | englischer Content ("Benefits — insurer deductions recovered"); canonical `/en/vorteile` |
| `/tr/vorteile` | 200 | tr | türkisch ("Avantajlar — Sigortacı kesintileri…") |
| `/ar/faq` | 200 | ar | arabisch + RTL (`dir="rtl"`) |
| `/de/vorteile` | 200 | de | canonical → `/vorteile` (Dedupe, keine Eigen-Indexierung) |
| `/kfz-gutachter`, `/faq`, `/unfallskizze` | 200 | de | prefix-frei 200 |
| `/en/kfz-gutachter`, `/en/schaden-melden` | 200 | en | Funnel + Hubs lokalisiert |
| Subdomain `gutachter.claimondo.de/` | 200 | de | rewrite → gutachter-partner (de-only) |
| `gutachter.claimondo.de/gutachter-partner` | 301 | — | → `/` (kanonische Form) |
| `/sitemap.xml` | 200 | — | 212 URLs, 13 versicherer-Einträge, 35 `/en/`-Alternates |

hreflang (auf jeder übersetzten Seite, Next rendert `hrefLang`): x-default + de-DE → `/vorteile`,
en-US → `/en/vorteile`, tr-TR → `/tr/vorteile`, ar → `/ar/vorteile`, ru-RU, pl-PL — echte Prefix-URLs.

Screenshots: `02-vorteile-en.png` (EN-Hero+Nav), `04-faq-ar.png` (RTL) etc. in diesem Ordner.

## Kern-Befund: eigene Middleware statt next-intl/middleware

next-intl `localePrefix:'as-needed'` funktioniert in diesem Next-16.2.1 / Turbopack /
`output:standalone`-Stack NICHT für die prefix-freien Default-Pfade:
- **localeDetection default:** `/vorteile` → 307-**Loop** (next-intl rewritet auf `/de/vorteile`,
  Next führt die Middleware auf dem internen Rewrite erneut aus, next-intl redirectet `/de/x`→`/x`).
- **localeDetection:false / pure next-intl:** `/vorteile` → **404** (gar kein Rewrite; Next routet
  `/vorteile` als `[locale]=vorteile` → notFound). `/de/vorteile` + `/en/vorteile` = 200.

Lösung: `middleware.ts` macht das as-needed-Routing **deterministisch selbst** — unpräfixiert →
intern `/de/<pfad>` rewriten, `/de/*` + `/<locale>/*` durchlassen (kein `/de`→`/`-Redirect →
loop-frei). Locale erreicht RSC via `setRequestLocale` ([locale]-Layout) + `X-NEXT-INTL-LOCALE`-
Header. Host-Routing der Subdomains bleibt davor. Build: 1332 Seiten, dynamisch (ƒ) gerendert
(headers()-Tracking) — Crawlability via SSR voll erhalten; echtes Static-Prerender wäre ein
Follow-up (Tracking client-seitig).
