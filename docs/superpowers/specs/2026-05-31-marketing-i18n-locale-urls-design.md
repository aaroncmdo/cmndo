# Design · Marketing i18n — crawlbare Locale-URLs (GEO/SEO-wirksam)

**Datum:** 31.05.2026 · **Scope:** Standalone-Marketing-Build `claimondo-marketing/` (:3006, claimondo.de). · **Status:** Design approved (Aaron 31.05.).

## 1 · Problem & Ziel

Die Marketing-Seiten sind **bereits in 6 Sprachen übersetzt** — der komplette Seiten-Content (44 Sektionen: landing, faq, ueber-uns, alle kfz-gutachter-Seiten, wizard, vorteile, …) liegt in `i18n/messages/{de,en,tr,ar,ru,pl}.json` (ru.json 449KB). Verifiziert: `/vorteile` mit `claimondo-locale=en` rendert vollständig englisch.

**Aber:** die Locale wird **nur per Cookie** bestimmt (`i18n/request.ts` liest `claimondo-locale`, kein URL-Prefix). Crawler (Google, Bingbot, GPTBot, ClaudeBot, PerplexityBot …) setzen keinen Cookie → sie bekommen **immer Deutsch**. Die gesamte Übersetzungsarbeit ist **für SEO/GEO unsichtbar**, und das aktuelle hreflang zeigt alle 6 Sprachen auf **dieselbe** URL (technisch wertlos).

**Ziel:** crawlbare, locale-präfixierte URLs, damit jede Sprachversion indexierbar wird — **ohne neue Übersetzung** (Inhalte sind fertig). German-primary bleibt erhalten.

## 2 · Architektur

**next-intl App-Router-i18n mit `localePrefix: 'as-needed'`:**
- `de` = prefix-frei: `/vorteile`, `/haftpflicht/4-wochen-frist` (**unverändert** → 0 Redirects, keine SEO-Störung der bestehenden 199 indexierten DE-URLs).
- `en/tr/ar/ru/pl` = präfixiert: `/en/vorteile`, `/tr/vorteile`, `/ar/…`, `/ru/…`, `/pl/…` (rein additive neue URLs).
- Locale-Quelle: **URL-Prefix** (primär) → Cookie (sekundär, für de-Default + Switcher) → `de`.

**Datei-Restruktur** (next-intl-Konvention):
- Alle ~40 Marketing-Routen von `app/<route>` → `app/[locale]/<route>` verschieben.
- `app/[locale]/layout.tsx`: `NextIntlClientProvider` + `setRequestLocale(locale)` + `generateStaticParams` (alle 6 Locales). Root-`app/layout.tsx` wird minimal (`<html><body>`).
- `generateStaticParams` pro Route × `[locale]` → **statisches HTML pro Sprache** (Crawler bekommen fertig-gerenderte Sprachseiten, kein On-Demand).
- Konsequenz: ~199 Routen × 6 Locales ≈ **~1.200 prerenderte Seiten** → größerer Build (Memory/Zeit beachten; ggf. `experimental.staticGenerationMaxConcurrency` / Build-RAM).

**Middleware-Komposition (der kritische Teil):**
- Die bestehende `middleware.ts` macht **Host-Routing** für die Subdomains (gutachter/makler/kfzgutachter.claimondo.de → rewrite Landing / 301). Das bleibt.
- next-intl liefert eine eigene Locale-`createMiddleware`. Beide **komponieren**: 
  - Host ∈ {gutachter., makler., kfzgutachter.} → **Host-Logik** (de-only, KEIN Locale-Prefix).
  - Host ∈ {claimondo.de, www} → **next-intl-Locale-middleware** (as-needed).
- Matcher vereinen; Cookie-Handling von next-intl übernehmen.

## 3 · hreflang + Sitemap (das eigentliche SEO-Wirksame)

- `lib/seo/alternates.ts`: von „alle 6 → gleiche URL" auf **echte Locale-URLs pro Seite** umbauen (`de-DE`→`/vorteile`, `en-US`→`/en/vorteile`, …) + `x-default`→de.
- Jede Page setzt `alternates.canonical` (eigene Locale-URL) + `alternates.languages` (alle 6 + x-default).
- `app/sitemap.ts`: jede URL × 6 Locales (de prefix-frei) mit `<xhtml:link rel="alternate" hreflang>`-Alternates je Eintrag. Sitemap-Größe steigt ~6×.

## 4 · Bestätigte Entscheidungen

| Frage | Entscheidung |
|---|---|
| DE-URL-Schema | `as-needed` — de prefix-frei (bestehende URLs unverändert) |
| Welche Seiten | **alle ~40 Marketing-Seiten** kriegen Locale-URLs |
| Subdomains (gutachter/makler/kfzgutachter) | **de-only** (Single-LPs, keine Locale-URLs) |
| `.md`-Artikel-Bodies (90, nur 3 übersetzt) | unter `/en/` etc. rendert UI/Sektionen übersetzt (Katalog), Artikel-**Body** bleibt deutsch bis Doc-48/Übersetzung — bewusst akzeptiert |

## 5 · Edge-Cases

- **Cookie vs URL:** bei Locale-URL gewinnt die URL; der `claimondo-locale`-Cookie (jetzt `.claimondo.de`-scoped) bleibt für de-Default + den Language-Switcher (der navigiert künftig auf die Locale-URL statt nur Cookie zu setzen).
- **Language-Switcher** (`LanguageSwitcher.tsx`): von „Cookie setzen + revalidate" auf „auf Locale-URL navigieren" umstellen (router.replace auf die präfixierte URL).
- **Bestehende Stream-8-Redirects** (claimondo.de/login etc. → app) bleiben (greifen vor der Locale-middleware).
- **Funnel-Forms** (schaden-melden etc.): bekommen auch Locale-URLs; die Server-Actions sind locale-agnostisch (schreiben in die geteilte DB) — kein Eingriff nötig, aber Smoke.

## 6 · Akzeptanzkriterien

- `npm run build` grün; ~1.200 Seiten prerendert; MS1 (0 SERVICE_ROLE in static); BOM 0.
- `/vorteile` = 200 deutsch (unverändert, **kein Redirect**); `/en/vorteile` = 200 englisch; `/tr/vorteile` = 200 türkisch (Crawler-Sicht, kein Cookie).
- hreflang auf `/vorteile` listet `/vorteile`(de-DE,x-default) + `/en/vorteile`(en-US) + … (echte URLs, nicht alle gleich).
- `sitemap.xml` enthält alle Locale-URLs mit Alternates.
- Subdomains unverändert (de-only, 200).
- Language-Switcher wechselt via URL.
- Smoke: je Locale eine Seite (Screenshot) + ein Funnel-Form-Submit (DB-Write ok).

## 7 · Out of Scope

- Übersetzung der 87 noch-deutschen `.md`-Artikel-Bodies (separat: Doc-48-On-Demand-Loader `content_translations` oder Batch-Übersetzung).
- Portal-i18n (app.claimondo.de) — eigenes Vorhaben.
- P5 (Monolith-Abbau) — eigener Handoff.

## 8 · Risiko / Hinweise

- Größter Aufwand + Risiko: die **Restruktur ~40 Routen → `app/[locale]/`** + die **Middleware-Komposition** (Host-Routing × Locale). Reiner Marketing-Build (:3006), isoliert — keine Monolith-/App-Berührung.
- Build-RAM/-Zeit durch 6× Prerender — ggf. Locale-Set für Prerender begrenzen (de + meist-genutzte) und Rest On-Demand, falls Build OOMt.
- Deploy wie gehabt (`deploy-marketing-*.py` :3006, Aaron-Override).
