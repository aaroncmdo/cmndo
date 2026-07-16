# Design: KI-Wissensartikel LLM-wirksam machen (llms.txt · Sitemap · FAQPage · Crawl-Tuning)

- **Datum:** 2026-07-15
- **Status:** Design approved (Aaron), pre-Implementation
- **Basis:** `origin/main` @ `a865c24d6` (Feature liegt NUR auf main; Arbeits-Worktree `kitta/wissen-artikel-llm-wirksamkeit`)
- **Vorlauf:** Voll-Audit in `memory/COORDINATION-wissen-artikel-seo-geo-audit.md`

## 1. Kontext & Problem

Die `wissen_artikel`-Pipeline (`/admin/wissen-artikel` → `src/lib/wissen/*` → Cron `/api/cron/wissen-pipeline-b2b` → Render `claimondo-marketing/app/[locale]/wissen/[slug]`) erzeugt täglich KI-Artikel (Prod: 27 veröffentlicht, alle `ai_generated`). Der SEO-Metadaten-Layer ist **solide**: `meta_description` fehlt bei **0/27** (Generierung erzwingt+persistiert das Feld, Render hat Fallback-Kette). Die Artikel sind aber auf den entscheidenden Auffind-/Zitier-Surfaces **unsichtbar**:

1. **Nicht in `llms.txt`/`llms-full.txt`** → fehlen auf der LLM-Zitier-Surface UND im MCP `claimondo://wissensbasis` (= llms-full.txt).
2. **Nicht in der Sitemap** (nur der `/wissen`-Hub ist gelistet) → schwaches Crawl-/Freshness-Signal für Google/Bing.
3. **Kein FAQPage/speakable-Schema** — der `[slug]`-Render übergibt hand-`articleJsonLd`, wodurch der `autoSchemaGraph`-Zweig umgangen wird, obwohl jeder KI-Body eine `## Häufige Fragen`-Sektion hat.
4. **Operativ:** Der KI-Backstop rejected ~78% der Crawl-Themen (47 abgelehnt); frische News überleben selten, Evergreen-Filler füllt den Tages-Boden. Aaron: „die gecrawlten News sind besser" — er will mehr davon.

Zusätzlich: `last_modified` ist bei **19/27** NULL (Auto-Publish setzt es nie → schwaches Freshness-Signal).

## 2. Ziele / Nicht-Ziele

**Ziele:**
- Veröffentlichte `wissen_artikel` auf allen LLM-/SEO-Surfaces sichtbar machen (llms.txt, llms-full.txt → MCP, Sitemap, FAQPage-Schema).
- Freshness-Signal reparieren (`last_modified` bei Auto-Publish; per-URL lastmod in Sitemap).
- Mehr frische Crawl-News statt Evergreen-Filler (schärfere Quellen + höhere Crawl-Priorität).
- B2B-Fachartikel und Consumer-Ratgeber sauber getrennt auf der LLM-Surface präsentieren.

**Nicht-Ziele (YAGNI):**
- **Kein DDL, kein Prod-Daten-Write.** Kein Backfill der 19 Alt-`last_modified`-NULLs (Sitemap-Fallback deckt sie).
- Kein neuer LLM-Klassifikator vor der Generierung (Quellen-Schärfung löst das Kosten-/Relevanz-Problem hinreichend).
- Keine eigene B2B-Surface/Route (llms-b2b.txt) — Trennung erfolgt via Subsektionen im bestehenden File.
- Keine Twitter-Card / keyFacts-„At a glance"-Render (separat, nicht in diesem Paket).

## 3. Betroffene Dateien

**App `claimondo-marketing` (Domain claimondo.de) — PR-A:**
- `lib/wissen/db-articles.ts` — `audience`+`quelle` in Select+Type; neuer pure Helper für Audience-Gruppierung.
- `lib/wissen/llms-render.ts` *(neu)* — pure Render-Helfer (Index-Zeilen + Full-Dump), unit-testbar.
- `app/llms.txt/route.ts` — 2 Subsektionen einhängen.
- `app/llms-full.txt/route.ts` — Voll-Body-Dump einhängen.
- `app/sitemap.ts` — `async`, per-Artikel-Einträge anhängen.
- `app/[locale]/wissen/[slug]/page.tsx` — FAQPage/speakable via `autoSchemaGraph`.

**App `src` (Domain app.claimondo.de) — PR-B:**
- `lib/wissen/pipeline.ts` — `last_modified` bei Auto-Publish; Caps anheben.
- `lib/wissen/crawl/sources.ts` — Quellen schärfen (+ 1–2 verifizierte neue Feeds).

## 4. Lever 1 — llms.txt + llms-full.txt (2 Audience-Subsektionen)

### 4.1 Datenzugriff (`db-articles.ts`)
- `SELECT_COLUMNS` um `audience,quelle` erweitern; `WissenArtikel`-Type entsprechend (`audience: string`, `quelle: string`).
- Neuer pure Helper:
  ```ts
  export function groupByAudience(items: WissenArtikel[]): { consumer: WissenArtikel[]; b2b: WissenArtikel[] }
  ```
  (newest-first — `getPublishedArtikel()` sortiert bereits nach `last_modified`/`veroeffentlicht_am` desc.)

### 4.2 Pure Render-Helfer (`lib/wissen/llms-render.ts`, neu)
- `artikelIndexLine(a): string` → `- [${title}](https://claimondo.de/wissen/${slug}) — ${excerpt} (Stand: ${YYYY-MM-DD}) · Keyfacts: ${key_facts.join('; ')}`
- `artikelFullBlock(a): string` → `## ${title}`-Header + Meta-Zeile (URL, Stand, primary_keyword, quelle) + `body`-Markdown (mirror des bestehenden Asset-Dump-Formats in llms-full.txt).
- Rein, ohne IO → Tests in `llms-render.test.ts`.

### 4.3 llms.txt (`route.ts`)
Neue Top-Level-Sektion (nach „Sachverständige & Verbände", vor „Konversions-Seiten"), signalisiert Aktualität:
```
## Aktuelle Artikel & Fachbeiträge (redaktionell geprüft, KI-gestützt, tagesaktuell)

### Ratgeber für Geschädigte
<consumer-Artikel als Index-Zeilen>

### Fachartikel für die Branche (Sachverständige, Kanzleien, Werkstätten)
<b2b-Artikel als Index-Zeilen>
```
Leere Subsektion → wird ausgelassen (kein leerer Header).

### 4.4 llms-full.txt (`route.ts`)
Voll-Body-Dump derselben 2 Subsektionen. **Wachstums-Policy** (Datei-Größe bounded, evergreen-Ratgeber geschützt):
- **Alle** consumer-Artikel (wenige, hoher Evergreen-Wert).
- **Neueste `MAX_FULL_B2B = 40`** b2b-Artikel (news-y, zeitgebunden) — älteres wird ausgelassen; wenn gekappt, eine Hinweiszeile „(ältere Fachbeiträge unter /wissen)".

## 5. Lever 2 — Sitemap + last_modified

### 5.1 `app/sitemap.ts`
- Signatur → `export default async function sitemap(): Promise<MetadataRoute.Sitemap>`.
- Anhängen:
  ```ts
  ...(await getPublishedArtikel()).map((a) => ({
    url: `${SITE_URL}/wissen/${a.slug}`,
    lastModified: a.last_modified ? new Date(a.last_modified) : (a.veroeffentlicht_am ? new Date(a.veroeffentlicht_am) : now),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))
  ```
  B2B + Consumer beide rein (alle public). de-only (Body deutsch) → keine Locale-Alternates (konsistent mit `/wissen`-Hub).

### 5.2 `src/lib/wissen/pipeline.ts` (`generiereUndSpeichere`)
- Beim Insert `last_modified: v.autopublish ? now.slice(0, 10) : null` ergänzen (`now` ist bereits vorhanden). In-review-Artikel bekommen `last_modified` beim manuellen `publishArtikel` (bereits korrekt).

## 6. Lever 3 — FAQPage + speakable Schema

### `app/[locale]/wissen/[slug]/page.tsx`
- Imports ergänzen: `autoSchemaGraph` (`@/lib/seo/jsonld`), `extractFaqPairs` (`@/lib/content/claimondo-mdx`).
- `articleJsonLd`-Konstruktion ersetzen:
  ```ts
  const articleArgs = {
    headline: a.title, description: description ?? a.title,
    datePublished: dateIso, dateModified: dateIso,
    url: `${SITE_URL}/wissen/${slug}`,
    citation: extractCitations(a.body), authorName: FOUNDER_AARON_NAME,
  }
  const articleJsonLd = autoSchemaGraph(articleArgs, extractFaqPairs(a.body)) ?? JSON.stringify(articleSchema(articleArgs))
  ```
- Ergebnis-Graph: **Article (Person = Aaron) + citation (§§/BGH) + speakable + FAQPage**. `autoSchemaGraph` gibt `null` ohne FAQ-Paare → sauberer Fallback auf `articleSchema`. `ContentJsonLd` erhält den fertigen Graph als `schemaJson` (unverändert), Breadcrumbs separat. **Keine Änderung an geteilten Komponenten/`jsonld.ts`.**

## 7. Lever 4 — Crawl schärfen + Priorität hoch

### 7.1 `src/lib/wissen/crawl/sources.ts`
- **Entfernen:** `Rechtslupe` (allg. Rechtsnews, niedrigste Kfz-Schaden-Quote), `Pfefferminzia` (Leben/Rente-lastig).
- **Neue Reihenfolge (Kfz-Schaden zuerst):** `Captain-HUK` → `kfz-betrieb` → `KÜS` → `Versicherungsbote` → `AssCompact`.
- **+0–2 neue Feeds** (Kfz-Schaden/SV-Recht) — **live verifiziert vor Aufnahme** (HTTP 200 + parsebares RSS mit on-topic Items; mirror der 02.07.-Disziplin). Kandidaten in der Implementierung per WebFetch prüfen; nur aufnehmen, was verifiziert on-topic ist (0 ist ok, wenn keiner überzeugt).

### 7.2 `src/lib/wissen/pipeline.ts` — Caps
| Konstante | alt | neu | Grund |
|---|---|---|---|
| `DAILY_MAX` | 3 | **5** | mehr frische Crawl-News an News-reichen Tagen |
| `CRAWL_ATTEMPT_CAP` | 6 | **10** | mehr KI-Versuche für tagesaktuelle Themen |
| `PER_SOURCE_CAP` | 3 | **5** | Gold-Quellen (Captain-HUK: 12 on-topic/Tag) nicht aushungern |
| `CRAWL_CAP` | 12 | **16** | größeres Crawl-Budget/Lauf |
| `DAILY_MIN` | 2 | **2** *(unverändert)* | Evergreen-Boden bleibt; füllt nur wenn Crawl<2 |

Netto: Evergreen weicht an News-reichen Tagen automatisch zurück (`shouldStopEvergreen` stoppt bei `published>=DAILY_MIN`). Schärfere Quellen → höhere Relevanz → weniger verschwendete Sonnet-Calls.

## 8. Datenfluss & Caching

- `llms.txt`/`llms-full.txt` bleiben `force-static` + `revalidate=86400`. `getPublishedArtikel()` (Anon-Client) läuft zur (Re-)Validierung — bewährtes Muster (die Feed-Routen nutzen es bereits force-static). Neue Artikel erscheinen ≤24 h nach dem 04:00-Cron.
- MCP `claimondo://wissensbasis` liest llms-full.txt live (1-h-Cache) → zieht Artikel automatisch nach, **ohne MCP-Änderung**.
- `sitemap.ts` wird `async` (Next 15 unterstützt async Sitemap).

## 9. Testing

- `db-articles.test.ts`: `groupByAudience` (pure Mapping-Split).
- `llms-render.test.ts` *(neu)*: `artikelIndexLine`/`artikelFullBlock` (Format, Umlaute, leere key_facts, Stand-Datum-Fallback).
- Bestehende `relevance.test.ts`/`validate.test.ts`/`pipeline-plan.test.ts` bleiben grün (keine Relevanz-Terme angefasst, nur Quellen-Liste + Caps).
- `npm run build` in **beiden** Apps (Route-Changes → voller Build, AGENTS-Regel 1).
- **Prod-Smoke nach Deploy:** llms.txt/llms-full.txt enthalten die 2 Subsektionen · sitemap.xml enthält `/wissen/<slug>` · view-source eines Artikels zeigt `FAQPage`-JSON-LD · nächster Cron (oder manueller Trigger) publiziert Crawl-News mit `last_modified`.

## 10. PR-Split & Rollout

- **PR-A · `claimondo-marketing`:** Lever 1 (db-articles, llms-render, llms.txt, llms-full.txt) + Lever 2a (sitemap) + Lever 3 (FAQPage). Rein additive GEO-Surface/Schema-Wins → zuerst deployen.
- **PR-B · `src`:** Lever 2b (`last_modified`) + Lever 4 (sources + caps). Ändert Publish-Verhalten/Kosten → separat, beobacht-/tunebar.
- Beide off `origin/main`. Merge gegen `staging` (AGENTS-Regel 1), PR-Review, dann main.

## 11. Risiken & Mitigation

| Risiko | Schwere | Mitigation |
|---|---|---|
| Static-Route wird durch DB-Read dynamisch | niedrig | Muster bereits in Feed-Routen erprobt (force-static + Anon-Read); ISR bleibt |
| Sitemap async bricht Build | niedrig | Next 15 unterstützt async Sitemap; voller Build im Test |
| FAQPage-Schema-Fehler bricht Render | niedrig | `autoSchemaGraph` ist try/catch → `null` → Fallback |
| Lever 4: mehr Sonnet-Calls/Kosten + höhere Velocity | mittel | Separater PR (PR-B), beobachtbar; Caps rückstellbar |
| Quellen-Pruning verliert Einzel-Hits | niedrig | Bewusst gewählt („Quellen schärfen"); KI-Kaskoschaden matcht weiter via Kfz-Komposita |
| llms-full.txt-Wachstum | niedrig | `MAX_FULL_B2B=40`-Cap, consumer voll (wenige) |

## 12. Offene Punkte (in Implementierung zu klären)

- Konkrete neue Crawl-Feeds (Lever 4) — Live-Verifikation entscheidet.
- Exaktes Dump-Format in llms-full.txt an bestehendes Asset-Format angleichen (beim Implementieren die vorhandene Dump-Sektion spiegeln).
