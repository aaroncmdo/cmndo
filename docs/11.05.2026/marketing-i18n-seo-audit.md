# Marketing-Strecke: i18n + SEO/LLM-Audit

**Datum:** 2026-05-12
**Scope:** claimondo.de + gutachter.claimondo.de (alle Top-Level-Marketing-Routen)
**Sprachen geprüft:** de, en, ar, pl, ru, tr

---

## Ampel-Übersicht

| Achse | Status | Kurzbefund |
|---|---|---|
| 1 — i18n-Vollständigkeit der Sprach-Files | 🔴 ROT | pl/ru/tr sind byte-identische Kopien von `de.json` (0 % übersetzt) |
| 2 — Marketing-Pages nutzen i18n | 🟡 GELB | 9 von ~15 Routes hardcoden Deutsch statt `useTranslations` |
| 3 — SEO + LLM-Readiness | 🟢 GRÜN | Strukturell solide, aber `hreflang` lückenhaft + kein `llms.txt` |

---

## Achse 1 — i18n-Vollständigkeit der Sprach-Files

**Files:** `src/i18n/messages/{de,en,ar,pl,ru,tr}.json`
**Source-of-Truth:** `de.json` (~513 Zeilen, 5 Top-Level-Namespaces: `landing`, `flow`, `common`, `ueber_uns`, `gutachter_finder`)

| Sprache | Status | Fehlende / unübersetzte Keys |
|---|---|---|
| `de` | ✅ Quelle | — |
| `en` | ✅ 100 % | 0 / ~500 |
| `ar` | ✅ 100 % | 0 / ~500 |
| `pl` | ❌ 0 % | ~500 / ~500 (exakte Kopie von DE) |
| `ru` | ❌ 0 % | ~500 / ~500 (exakte Kopie von DE) |
| `tr` | ❌ 0 % | ~500 / ~500 (exakte Kopie von DE) |

**Top-3 unübersetzte Keys** (in pl/ru/tr):
1. `landing.hero.headline` — „Unverschuldet im Blech? Claimondo regelt das."
2. `landing.hero.subheadline` — „Gutachten. Anwalt. Regulierung. Alles aus einer Hand."
3. `flow.step1.heading` — „Hergang des Unfalls" (gesamter Schaden-Melden-Flow)

**User-Impact:** Sprachschalter ist Fake-Multilingual — wer auf Polnisch/Russisch/Türkisch klickt, sieht weiter Deutsch.

---

## Achse 2 — Marketing-Pages: i18n-Nutzung

**Marketing-Routes** = alle Top-Level-Routen in `src/app/`, die NICHT zu den Portalen gehören (admin/dispatch/gutachter/kunde/mitarbeiter/faelle/flow/kanzlei/makler).

| Route | Metadata | i18n-Strings | Status |
|---|---|---|---|
| `/` (Homepage) | ✅ statisch hardcoded | ❌ keine Translations in `HauptseiteClient` | nur DE |
| `/ueber-uns` | ✅ `generateMetadata` + `getTranslations` | ✅ nutzt `ueber_uns.*` | 6 Sprachen |
| `/schaden-melden/*` (Flow) | ✅ | ✅ nutzt `flow.*` | 6 Sprachen |
| `/kfz-gutachter/[stadt]` | ✅ `generateMetadata` | ⚠️ teilweise i18n | teils übersetzt |
| `/gutachter-finden` | ✅ statisch + `buildLanguageAlternates` | ❌ UI-Text hardcoded | nur DE |
| `/faq` | ✅ statisch | ❌ `FAQ_GRUPPEN`-Array hardcoded (~50 Fragen) | nur DE |
| `/ersteinschaetzung` | ✅ statisch | ❌ Inhalte hardcoded | nur DE |
| `/beratung-anfragen` | ✅ statisch | ❌ Inhalte hardcoded | nur DE |
| `/vorteile` | ✅ statisch | ❌ Inhalte hardcoded | nur DE |
| `/agb` | ✅ statisch | ❌ Volltext hardcoded | nur DE |
| `/datenschutz` | ✅ statisch | ❌ Volltext hardcoded | nur DE |
| `/impressum` | ✅ statisch | ❌ Volltext hardcoded | nur DE |
| `/nutzungsbedingungen` | ✅ statisch | ❌ Volltext hardcoded | nur DE |

**Quote:** 6 von 15 Routes liefern echtes Multilingual aus, **9/15 sind Deutsch-only**, davon einige (`/`, `/faq`, AGB/DS/Impressum) extrem reichweitenrelevant.

### Subdomain `gutachter.claimondo.de`

- Wird in `src/app/sitemap.ts:118` referenziert.
- **Keine** Subdomain-Routing-Logik in `next.config.ts` oder `middleware.ts` — DNS-Alias auf dieselbe App.
- Effekt: identischer Content wie unter Pfad `/gutachter-partner`, also dieselben i18n-Lücken.

---

## Achse 3 — SEO + LLM-Readiness

### Was funktioniert

- **Metadata-Coverage:** 21/21 Marketing-Pages haben `metadata` oder `generateMetadata` mit `title`, `description`, `openGraph` + Twitter-Card.
- **`robots.ts`:** erlaubt explizit alle relevanten KI-Crawler — `PerplexityBot`, `ChatGPT-User`, `ClaudeBot`, `anthropic-ai`, `OAI-SearchBot` etc. Marketing-Pfade frei, Portale (`/admin/`, `/gutachter/`, `/dispatch/`, `/kunde/`, `/faelle/`) gesperrt.
- **`sitemap.ts`:** 20+ URLs inkl. Stadt-Landingpages `/kfz-gutachter/[stadt]` und Subdomain `gutachter.claimondo.de`.
- **JSON-LD via `src/lib/seo/jsonld.ts`** aktiv auf `/ueber-uns`, `/faq`, `/gutachter-finden`, `/kfz-gutachter/*` (`serviceSchema`, `personSchema`, `faqPageSchema`, `breadcrumbsSchema`, `organizationSchema`).
- **Semantic HTML:** Stichproben (`/ueber-uns`, `/faq`) zeigen saubere h1/h2-Hierarchie + `<article>`/`<section>` + `aria-labelledby`.

### Lücken

| Lücke | Impact | Aufwand |
|---|---|---|
| **13/21 Routes ohne `alternates.languages`** (z. B. `/agb`, `/beratung-anfragen`, `/ersteinschaetzung`, `/vorteile`) | Google erkennt keine `hreflang`-Verbindung zwischen Sprachvarianten → Duplicate-Content-Signal, falsche Canonical-Wahl | ~1 Tag |
| **Kein `public/llms.txt`** | KI-Crawler raten, welche Pages am wertvollsten sind. Standard für GEO/LLM-SEO seit Q3 2025. | <1 Tag |
| **Kein `public/ai.txt`** | Optional, gleiche Funktion wie `llms.txt`, anderer Vorschlag-Standard | <1 Tag |
| **JSON-LD fehlt** auf `/beratung-anfragen`, `/ersteinschaetzung`, `/vorteile` | Conversion-Pages ohne Structured Data → schlechtere Rich-Snippets | ~0.5 Tage |
| **`HauptseiteClient` ignoriert `getLocaleCookie()`** | Auch wenn pl/ru/tr übersetzt wären, würde die Homepage sie nicht ausspielen | ~1 Tag (Teil der i18n-Migration) |

---

## Top-3 dringendste Fixes (priorisiert)

### 1. Übersetzungen pl/ru/tr beauftragen — **KRITISCH**

`pl.json`, `ru.json`, `tr.json` sind byte-identische DE-Kopien. Solange das so ist, bringen alle Code-Fixes nichts.

**Optionen:**
- Übersetzer-Agentur (2–3 Wochen je Sprache)
- DeepL-Erstdraft + Native-Speaker-Review (1 Woche je Sprache)
- Hybrid: DeepL für Marketing, Profi für Legal-Pages (AGB/DS) wegen Haftung

### 2. Homepage + FAQ + Legal-Pages auf i18n migrieren — **3–4 Tage Dev**

Ohne diese Migration nutzen die Übersetzungen aus (1) auf den meistbesuchten Seiten nichts.

**Konkret:**
- `src/app/page.tsx` / `HauptseiteClient` → `useTranslations('landing')` für Hero/USP/Footer
- `src/app/faq/page.tsx` → `FAQ_GRUPPEN`-Array über i18n-Wrapper
- `/agb`, `/datenschutz`, `/impressum`, `/nutzungsbedingungen` → `generateMetadata` + Content via `getTranslations` (Pattern wie `/ueber-uns`)
- `/beratung-anfragen`, `/ersteinschaetzung`, `/vorteile`, `/gutachter-finden` UI-Text → `useTranslations`

### 3. `buildLanguageAlternates()` flächendeckend + `llms.txt` — **~1 Tag Dev, sofortiger SEO/GEO-Effekt**

- `alternates.languages` in `generateMetadata` aller 13 fehlenden Routes (Pattern-Reuse aus `/gutachter-finden`)
- `public/llms.txt` mit kurationiertem Page-Verzeichnis (Hero, FAQ, Pricing/Service-Beschreibung, Datenschutz)
- JSON-LD-Coverage erweitern auf `/beratung-anfragen`, `/ersteinschaetzung`, `/vorteile`

---

## Zusatz-Befunde

- **`gutachter.claimondo.de`-Subdomain** liefert keinen eigenen Content → entweder eigene Routing-Logik etablieren (Middleware-basiert) oder Subdomain auflösen / Redirect zur Hauptdomain
- **Locale-Cookie-Inkonsistenz:** `getLocaleCookie()` wird gelesen, aber nicht überall genutzt — beim Migrations-PR auch das mit-checken
- **Nested i18n-Namespaces:** Tiefe Verschachtelung (`landing.hero.trust_badge`) ist OK, aber Fallback-Strategie sollte explizit dokumentiert sein (was passiert bei missing key — DE-Default oder Key-String?)

---

## Geschätzter Gesamtaufwand bis „echtes Multilingual"

| Block | Aufwand |
|---|---|
| Übersetzungen pl/ru/tr (Agentur) | 2–3 Wochen extern |
| Code-Migration Marketing-Pages auf i18n | 3–4 Tage Dev |
| `hreflang` + `llms.txt` + JSON-LD-Lücken | ~1–1.5 Tage Dev |
| Subdomain `gutachter.claimondo.de` Strategie-Entscheidung + ggf. Routing | 0.5–2 Tage Dev je nach Entscheidung |
| **Gesamt Dev-Aufwand** | **~5–7 Tage** |
| **Gesamt + Übersetzung extern** | **~3 Wochen Lead-Time** |
