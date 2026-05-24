# SEO/GEO-Capability-Audit — claimondo.de (Prod)

**Datum:** 2026-05-24 · **Scope:** Verifikation, dass die Marketing-/Content-Strecke nach Abschluss von Doc-26-Stream-B SEO- **und** LLM/GEO-fähig ist. **Methode:** wiederholbarer Smoke-Test `scripts/seo-geo-smoke.mjs` gegen Prod.

## Verdikt: SEO + LLM/GEO-fähig ✅ — `74 PASS / 0 FAIL`

```
node scripts/seo-geo-smoke.mjs            # default: https://claimondo.de
BASE_URL=https://app.staging.claimondo.de node scripts/seo-geo-smoke.mjs
```
Exit 0 = alle harten Checks grün. Re-runbar (CI-fähig).

## 6 Dimensionen

| Dimension | Ergebnis |
|---|---|
| **AI-Crawl-Zugang** (robots.txt) | `Allow: /` explizit für GPTBot · ChatGPT-User · OAI-SearchBot · ClaudeBot · anthropic-ai · Claude-Web/SearchBot · PerplexityBot · Perplexity-User · Google-Extended · Bingbot · Applebot(-Extended) · Meta-ExternalAgent · Amazonbot · MistralAI · CCBot · Bytespider · Yandex · DuckDuckBot. Portale/privat (`/admin /dispatch /gutachter /kunde /makler /flow /upload …`) disallowed. `Sitemap:` deklariert. |
| **Discovery** (sitemap.xml) | HTTP 200, **177 URLs**, alle Konversions-/Pillar-Routen + Cornerstones + 57 Spokes + 10 Decoder + 8 SV-Spokes enthalten. |
| **AI-direkt** | `llms.txt` (~31 KB) + `llms-full.txt` (~742 KB) live (200). |
| **Erreichbarkeit** | Alle 15 geprüften Content-Routen liefern als GPTBot **200** (redirect=manual → kein 307-Trap). PDF-Vorlage `/downloads/unfallskizze-claimondo-vorlage.pdf` → 200 `application/pdf`. |
| **Structured Data** | **Valides JSON-LD auf jeder Schlüsselseite** (0 invalid). Typen je Seite korrekt: Org+WebSite+LegalService+Service+`potentialAction`-Suite site-wide · **FAQPage** flächendeckend (Princeton-GEO +40 % AI-Cite) · **HowTo** (`/unfallskizze`, Cornerstone, B.5) · **Article+Speakable+citation** (Spokes/Decoder) · BreadcrumbList (Konversions-Pages). |
| **Meta** | `<title>` + `meta description` + absoluter `canonical` + `og:title` auf jeder Seite. |

## Stand Content-Strecke
Doc-26-Stream-B komplett **gemergt + live**: B.1 Kosten-Hub · B.2 Misstrauens (3) · B.4 Fahrzeugtyp (3) · B.5 „Unfall was tun"-Pillar (+ `/ratgeber`→canonical-Konsolidierung) · B.6 Unfallskizze+PDF. B.3 bewusst gestrichen (Kannibalisierung — Spokes besetzen die Keywords).

## Offen / Empfehlungen
- **Authoritative GEO-Messung:** Der Smoke prüft *Crawlbarkeit + Schema* (die technische GEO-Fähigkeit), NICHT die tatsächliche Zitier-Rate in AI-Antworten. Dafür: Baseline-AI-Test (siehe `_specs/llm-visibility-sprint/ai-visibility-tag-0-ergebnis.md`) + idealerweise **Ahrefs Brand Radar** (AI-Response-Mentions) konfigurieren.
- **CI-Option:** `scripts/seo-geo-smoke.mjs` ließe sich als nightly/post-deploy-Check gegen Prod hängen (kein DB-Zugriff nötig, reine HTTP-Assertions).
- Kosmetik: einige `meta description` >160 Zeichen (SERP-Kürzung) — kein Capability-Problem.
