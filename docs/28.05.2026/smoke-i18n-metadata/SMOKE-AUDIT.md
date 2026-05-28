# Smoke-Audit — Marketing-Metadata-i18n (Doc 48, page_meta)

**Datum:** 2026-05-28 · **Branch:** `kitta/i18n-metadata` (gestackt auf `kitta/i18n-content-chrome` / PR #1915) · **Base:** `staging`
**Auftrag:** Aaron-Entscheid „Voll, alle ~24 (ueber-uns-Pattern)".

## Scope

24 öffentliche Marketing-/Content-Seiten von statischem `export const metadata` auf cookie-aware `export async function generateMetadata()` umgestellt (Muster aus `ueber-uns`):
- `title`/`description` (+ `og_title`/`og_description`/`twitter_*` nur wo abweichend) aus neuem **`page_meta`**-Namespace via `getTranslations('page_meta')`.
- `alternates` um `...buildLanguageAlternates(path)` ergänzt → **hreflang** (x-default + de-DE/en-US/ar/tr-TR/pl-PL/ru-RU), Team-GEO-Strategie (`src/lib/seo/alternates.ts`).
- `og:locale` bleibt `de_DE` (wie ueber-uns; Share-Bots sehen den de-Content via Cookie-Default).
- Strukturfelder (keywords, canonical, og.url/type/siteName/images, twitter.card/images) **unverändert**.

`page_meta`: **99 Keys** (24 Seiten), de mittig nach `content`, en/tr/ar/ru/pl subagent-übersetzt (programmatisch, 0 HTML-Entities, §/BGH/Köln/Claimondo/DAT/BVSK/Sanden-Danner + Zahlen verbatim).

**Seiten:** home, vorteile, faq, wie-es-funktioniert, gutachter-finden, beratung-anfragen, gutachter-partner, e-auto/lkw/motorrad-gutachter, kosten-kfz-gutachten, ersteinschaetzung, unfallskizze, schadensreport-2026, versicherung-schickt-gutachter, gegnerische-versicherung-zahlt-nicht, unfall-was-tun-als-geschaedigter, unverschuldeter-unfall-rechte, kfz-gutachter (hub/ablauf/kosten/online/wertminderung/vermittlungsportale-vergleich).

## Bewusst out of scope

- **Content-Hubs** decoder/haftpflicht/sachverstaendige (Body = Phase 2, noch deutsch) — Metadata später mit dem Body.
- **[slug]- + Cornerstone-Seiten** (decoder/[slug], haftpflicht/[slug], sachverstaendige/[slug], ratgeber, kfz-haftpflicht-schaden, kfz-gutachter-koeln) — Titel/Description stammen aus MDX-Content = Phase 2.
- **Legal** (agb/datenschutz/impressum/nutzungsbedingungen), **Auth/Utility** (login, schaden-melden/link-versendet), **Subdomain-LPs** (kfzgutachter-lp, makler/partner-werden — separate Surface).
- **Bereits lokalisiert:** kfz-gutachter/[stadt] (#1894), ueber-uns.

## Gates

- **Build:** `npm run build` → ✓ Compiled (63s) · ✓ TypeScript · ✓ Static-Gen **338/338** (validiert alle 24 `generateMetadata`-Exporte) · BUILD_ID geschrieben. **Standalone-Output-Copy** brach mit `EBUSY copyfile` auf `Geist-Regular.ttf` ab — bekannter **lokaler Windows-File-Lock-Flake** (`output: 'standalone'`-Post-Step), **CI/Linux unbetroffen**, für `next start`/Smoke irrelevant (serviert aus `.next`).
- **`tsc --noEmit`:** exit 0.
- **`check:i18n`:** 5/5 OK, je **1690 Keys** (1591 + 99), volle Parität.
- **HTML-Entity-Sweep** (`page_meta`, 6 Locales): 0.

## Smoke (`next start -p 3028`, Cookie `claimondo-locale`, curl)

Stichprobe `/`, `/vorteile`, `/kfz-gutachter`, `/e-auto-gutachter` × de/en/ar:

- **`<title>` lokalisiert** je Locale. Beispiele:
  - `/` — de „Kfz-Schaden digital geregelt — Gutachter, Anwalt & Auszahlung" · en „Car accident claim settled digitally — assessor, lawyer & payout" · ar „تسوية أضرار السيارات رقمياً …".
  - `/kfz-gutachter` — de „Kfz-Gutachter finden — Unabhängig, schnell, kostenfrei" · en „Find a car assessor — independent, fast, free".
- **`<meta description>` lokalisiert** (de/en verifiziert), `§249 BGB`/`0 €`/`€0` erhalten.
- **hreflang: exakt 7 `<link rel="alternate" hrefLang=…>` pro Seite** (x-default + 6 Sprachen), **keine Duplikate** (sauber gezählt über `hrefLang="…"`).
- **de byte-identisch:** Title-/Description-Strings 1:1 aus den Original-`metadata`-Consts nach `page_meta` verschoben; Template-Verhalten der Root-Layout (`title.template: "%s | Claimondo"`) unverändert.

## Bekannte (pre-existing, nicht eingeführt)

1. **Cookie-i18n-Reichweite:** Crawler/Share-Bots senden den Cookie nicht → sie sehen weiter **de**-Metadata. Nutzersichtbar lokalisiert ist v.a. der **Browser-Tab-Title** (+ in-Browser-Description). `hreflang` signalisiert die Übersetzungen (Team-Strategie). Echtes per-Sprache-Ranking bräuchte URL-Locales (`/en/…`) — separates Architektur-Projekt.
2. **Doppel-Suffix** „… · Claimondo | Claimondo" auf Seiten, deren Titel bereits „· Claimondo" enthält + Root-Template „%s | Claimondo". **Pre-existing** (bestand vor dieser Änderung; Titel-String unverändert). Cleanup = separater Mini-PR.

## Verdikt

Metadata-i18n erfüllt den Auftrag: 24 Seiten cookie-aware lokalisiert (Title/Description/OG + hreflang), de unverändert, en/ar/tr/ru/pl vollständig (check:i18n grün), Build-Validierung grün. **Bereit für Review-PR gegen `staging` (gestackt auf #1915, Merge via Merge-Watcher nach #1915, nicht selbst).**
