# B2B Content-Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Täglicher Crawler zieht B2B-Quellen → AI verfasst daraus Original-Fachartikel → Validierungs-Gate → auto-live oder Admin-Freigabe → erscheinen im B2B-Community-Feed.

**Architecture:** Erweitert die bestehende AI-Redaktion (`wissen_themen → generate → wissen_artikel → publish`). Neu: B2B-System-Prompt, Crawler (RSS-Adapter), Validierungs-Gate, Pipeline-Cron, Admin-Retract. Haupt-App (`src/`), Cron service-role.

**Tech Stack:** Next.js 16 App-Router, Supabase (service-role via `createAdminClient`), `@anthropic-ai/sdk`, vitest.

## Global Constraints

- **DDL nur via Supabase-Plugin** (`apply_migration`), File == getrackte Version (Regel 2). `execute_sql` nur READ.
- **`'use server'`-Files exportieren nur async Funktionen** (keine Konstanten/Types — AAR-664). Types/Config in eigene `lib`-Files.
- **Server-Actions liefern `{ ok: boolean; error?: string }`** (kein throw); `revalidatePath` nach Mutation.
- **Cron-Routen CRON_SECRET-gated** (Header `Authorization: Bearer $CRON_SECRET` oder `?secret=`), sonst 401; service-role-Client.
- **UI-Strings Deutsch mit echten Umlauten**; `claimondo-*`-Tokens.
- **Legal (Spec):** Original-Synthese aus Fakten + Quell-Attribution + „keine Rechtsberatung"-Disclaimer; §§ statt geratener Az; kein Nachdruck.
- **Feed-Tag-Vokabular** (`claimondo-marketing/lib/community/tags.ts` `B2B_TAGS`): `Schadenregulierung`,`Recht & Urteile`,`Gutachten`,`Werkstatt`,`Versicherer`,`Markt & News`,`Tools`.

---

### Task 1: DB-Foundation (Migration via Plugin)

**Files:** Create `supabase/migrations/<version>_b2b_content_pipeline_foundation.sql` (Name nach `list_migrations`/schema_migrations-Version).

**DDL:**
```sql
-- wissen_themen: B2B-Audience + Crawl-Herkunft
alter table public.wissen_themen add column if not exists audience text not null default 'consumer' check (audience in ('consumer','b2b'));
alter table public.wissen_themen add column if not exists source_url text;
alter table public.wissen_themen add column if not exists source_name text;
alter table public.wissen_themen add column if not exists source_hash text;
-- quelle-Check um 'crawl' erweitern
alter table public.wissen_themen drop constraint if exists wissen_themen_quelle_check;
alter table public.wissen_themen add constraint wissen_themen_quelle_check check (quelle in ('ai_gap','manuell','crawl'));
-- Dedupe: ein Crawl-Item (source_hash) nur einmal
create unique index if not exists wissen_themen_source_hash_uidx on public.wissen_themen(source_hash) where source_hash is not null;
-- wissen_artikel: Quell-Attribution
alter table public.wissen_artikel add column if not exists source_url text;
```

**Steps:**
- [ ] `apply_migration({ name: 'b2b_content_pipeline_foundation', query: <DDL> })`.
- [ ] Version aus `select version from supabase_migrations.schema_migrations where name='b2b_content_pipeline_foundation' order by version desc limit 1` ablesen; Migration-File exakt so benennen.
- [ ] Verify (execute_sql READ): `select column_name from information_schema.columns where table_name='wissen_themen' and column_name in ('audience','source_url','source_name','source_hash')` → 4 Zeilen; quelle-Check enthält 'crawl'.
- [ ] Commit Migration-File.

**Interfaces — Produces:** `wissen_themen.audience/source_url/source_name/source_hash`, quelle 'crawl'; `wissen_artikel.source_url`.

---

### Task 2: B2B-System-Prompt + Generate-Erweiterung

**Files:** Modify `src/lib/wissen/generate.ts`; Test `src/lib/wissen/generate.test.ts`.

**Interfaces:**
- Consumes: bestehende `ThemaInput`, `ArtikelDraft`, `parseDraft`, `generateArtikelDraft`.
- Produces: `generateArtikelDraft(input, audience?: 'consumer' | 'b2b')` (default 'consumer' → unveränderter Pfad); `ArtikelDraft` bekommt `tags: string[]`; `buildB2BSystemPrompt(input)`.

**Details:**
- `ArtikelDraft` + Feld `tags: string[]`. `parseDraft`: optionales Meta-Feld `tags` (Array von Strings) parsen → wenn fehlt/leer → `[]`. Bestehender Consumer-Pfad bleibt (tags=[]).
- `buildB2BSystemPrompt(input)`: wie `buildSystemPrompt`, ABER:
  - Zielgruppe: „Fach-Leser: Kfz-Sachverständige, Rechtsanwälte/Kanzleien, Kfz-Werkstätten und Versicherungsmakler — KEIN Geschädigten-Du, sondern kollegialer Fachton."
  - „Nutze den Kurzbrief als Faktengrundlage. Wenn eine Quelle genannt ist, verfasse eine EIGENSTÄNDIGE Zusammenfassung/Analyse (kein Nachdruck) und schließe mit einer Zeile `**Quelle:** <name/url>`."
  - Meta-JSON zusätzlich Feld `"tags"`: 1–3 Werte NUR aus exakt dieser Liste: `Schadenregulierung, Recht & Urteile, Gutachten, Werkstatt, Versicherer, Markt & News, Tools`.
  - Gleiche Legal-Safeguards (§§-Pflicht wo juristisch; kein geratenes Az; RDG-Grenze; „keine Rechtsberatung"-Schluss).
- `generateArtikelDraft(input, audience = 'consumer')`: `const systemPrompt = audience === 'b2b' ? buildB2BSystemPrompt(input) : buildSystemPrompt(input)`. Rückgabe `data.tags` durchreichen (b2b: geparst; consumer: []).

**Steps (TDD):**
- [ ] Test: `parseDraft` mit Meta inkl. `"tags":["Recht & Urteile"]` → `data.tags` = `['Recht & Urteile']`; ohne tags → `[]`.
- [ ] Test: `buildB2BSystemPrompt({titel:'X'})` enthält „Sachverständige" + die Tag-Liste + „Quelle:".
- [ ] Implementieren; `npx tsc --noEmit` + `npx vitest run src/lib/wissen`.
- [ ] Commit.

---

### Task 3: Validierungs-Gate

**Files:** Create `src/lib/wissen/validate.ts`; Test `src/lib/wissen/validate.test.ts`.

**Interfaces — Produces:**
```ts
export function validateForAutoPublish(a: { body: string }): { autopublish: boolean; reason?: string }
```

**Regeln (autopublish=true nur wenn ALLE erfüllt; sonst false + reason):**
- Länge: `a.body.length >= 800 && a.body.length <= 15000` (sonst reason `'laenge'`).
- §§-Beleg: `/§\s?\d+/`.test(body) (sonst reason `'kein_paragraph'`).
- Disclaimer: `/keine\s+rechtsberatung/i`.test(body) (sonst reason `'kein_disclaimer'`).
- Kein unverifizierbares Gerichts-Az: `!/\b[IVX]{1,4}\s+(ZR|StR|ZB|AR)\s+\d+\/\d{2}\b/.test(body)` — wenn ein Az-Muster vorkommt → autopublish=false, reason `'az_review'` (Mensch prüft Zitat).

**Steps (TDD):**
- [ ] Tests: (a) valider Body (≥800, §§, Disclaimer, kein Az) → `{autopublish:true}`. (b) Body mit „VI ZR 123/22" → `{autopublish:false, reason:'az_review'}`. (c) ohne §§ → `'kein_paragraph'`. (d) ohne Disclaimer → `'kein_disclaimer'`. (e) 200 Zeichen → `'laenge'`.
- [ ] Implementieren; `npx vitest run src/lib/wissen/validate.test.ts` grün.
- [ ] Commit.

---

### Task 4: Crawler — Config + RSS-Adapter + Dedupe-Hash

**Files:** Create `src/lib/wissen/crawl/sources.ts`, `src/lib/wissen/crawl/rss.ts`, `src/lib/wissen/crawl/index.ts`; Test `src/lib/wissen/crawl/rss.test.ts`.

**Interfaces — Produces:**
```ts
// sources.ts
export type CrawlSource = { name: string; category: 'recht'|'versicherung'|'sv_verband'|'werkstatt'; kind: 'rss'; url: string }
export const B2B_CRAWL_SOURCES: CrawlSource[]
// rss.ts
export type CrawlItem = { title: string; summary: string; link: string; sourceName: string }
export function parseRssFeed(xml: string, sourceName: string): CrawlItem[]  // RSS <item> + Atom <entry>, title/description|summary/link|id
// index.ts
export function sourceHash(url: string): string   // sha256 hex (node:crypto)
export async function crawlSource(s: CrawlSource): Promise<CrawlItem[]>   // fetch(url) -> parseRssFeed; Fehler -> [] (resilient, console.error)
```

**Details:**
- `parseRssFeed`: tolerant beide Formate (RSS `<item><title><description><link>`, Atom `<entry><title><summary><link href>`). Entities dekodieren (`&amp;` etc.). Kein externes XML-Package nötig (Regex/DOMParser-frei; simple Tag-Extraktion reicht für Feeds) — ODER `fast-xml-parser` falls schon als dep vorhanden (prüfen; sonst regex-basiert bleiben, KEINE neue dep ohne Whitelist).
- `sourceHash`: `crypto.createHash('sha256').update(url).digest('hex')`.
- `B2B_CRAWL_SOURCES`: Seed mit je 1–2 Kandidaten-RSS pro Kategorie (echte Feeds; falls unklar, plausibelste offizielle Feed-URL — der Crawler ist resilient gegen tote Feeds). Kommentar: „Live-URLs im Prod-Smoke verifiziert; tote Feeds werden übersprungen."

**Steps (TDD):**
- [ ] Test `rss.test.ts`: Fixture-RSS-String (2 items) → `parseRssFeed` liefert 2 CrawlItems mit korrektem title/summary/link. Atom-Fixture → 1 entry.
- [ ] Test: `sourceHash('https://a')` deterministisch (64 hex chars), verschiedene URLs → verschiedene Hashes.
- [ ] Implementieren; `npx vitest run src/lib/wissen/crawl`.
- [ ] Commit.

---

### Task 5: Pipeline-Orchestrierung + Cron-Route

**Files:** Create `src/lib/wissen/pipeline.ts`; Create `src/app/api/cron/wissen-pipeline-b2b/route.ts`.

**Interfaces:**
- Consumes: Task 1 Spalten, Task 2 `generateArtikelDraft(_,'b2b')`, Task 3 `validateForAutoPublish`, Task 4 `B2B_CRAWL_SOURCES`/`crawlSource`/`sourceHash`.
- Produces: `export async function runB2BPipeline(): Promise<{ ok: boolean; crawled: number; generated: number; published: number; review: number; error?: string }>` (in `pipeline.ts` — NICHT `'use server'`, normale lib).

**`runB2BPipeline` (service-role via `createAdminClient`):**
1. **Crawl:** für jede `B2B_CRAWL_SOURCES` → `crawlSource` → je Item `hash=sourceHash(item.link)`; existiert `wissen_themen.source_hash=hash`? sonst insert `wissen_themen{ titel: item.title, kurzbrief: item.summary + '\n\nQuelle: ' + item.link, audience:'b2b', quelle:'crawl', source_url:item.link, source_name:item.sourceName, source_hash:hash, status:'freigegeben', cluster:item.sourceName }`. **Cap** gesamt 10 neue Themen/Lauf. Zähle `crawled`.
2. **Generate:** lade bis zu **3** `wissen_themen` mit `audience='b2b' and status='freigegeben'` ohne bereits existierenden Artikel (`not exists artikel where thema_id=…`), älteste zuerst. Für jedes: `generateArtikelDraft({titel,kurzbrief,...},'b2b')`. Bei `!ok` → skip (log). 
3. **Validate + Insert:** `const v = validateForAutoPublish({body: draft.body})`; insert `wissen_artikel{ thema_id, slug (23505→'-2'-Retry), title, body, excerpt, key_facts, meta_description, primary_keyword, cluster, tags: draft.tags, audience:'b2b', quelle:'crawl', source_url: <thema.source_url>, ai_model, ai_generated:true, author:'claimondo-redaktion', status: v.autopublish ? 'veroeffentlicht' : 'in_review', veroeffentlicht_am: v.autopublish ? now : null }`. Thema-Status → 'entwurf_erstellt'. Zähle `published`/`review`.
4. Return summary.

**Cron-Route:**
```ts
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const url = new URL(req.url)
  if (!secret || (auth !== `Bearer ${secret}` && url.searchParams.get('secret') !== secret)) {
    return new Response('Unauthorized', { status: 401 })
  }
  const r = await runB2BPipeline()
  return Response.json(r, { status: r.ok ? 200 : 500 })
}
```

**Steps:**
- [ ] `pipeline.ts` + Route implementieren.
- [ ] `npx tsc --noEmit` (Route/Server → wenn möglich `npm run build`).
- [ ] Commit. (Live-Smoke separat durch den Controller.)

---

### Task 6: Admin-Retract + Auto-Publish-Sichtbarkeit

**Files:** Modify `src/app/admin/wissen-artikel/actions.ts`; Modify `src/app/admin/wissen-artikel/page.tsx` (+ ggf. dessen Client-Komponente).

**Details:**
- `actions.ts` + `export async function zuruckziehenArtikel(id: string): Promise<{ ok: boolean; error?: string }>` — `requireRole(['admin'])`, `createAdminClient`, update `wissen_artikel set status='archiviert', updated_at=now() where id=…`, `revalidatePath('/admin/wissen-artikel')`. Muster wie `rejectArtikel`.
- `page.tsx`: veröffentlichte Artikel mit `quelle='crawl'` als „Auto-veröffentlicht (Crawl)" kennzeichnen (Badge) + „Zurückziehen"-Button (ruft `zuruckziehenArtikel`, `{ok}`-checked). Deutsch + Umlaute + claimondo-Tokens.

**Steps:**
- [ ] Implementieren; `npx tsc --noEmit`.
- [ ] Commit.

---

## Nach den Tasks (Controller)

- Whole-Branch-Review (opus): Legal-Safeguards, Cron-Gating (CRON_SECRET), service-role-Scope, kein `'use server'`-Non-async-Export, Validierungs-Gate-Korrektheit, kein PII im Crawl.
- **Prod-Smoke** (Controller): reale RSS-Feeds prüfen (welche liefern?) → `B2B_CRAWL_SOURCES` justieren → 1 Cron-Lauf gegen Prod (service-role) → Thema→Artikel→(publish|review) → Feed-Query zeigt ggf. den Artikel → Test-Artikel `archiviert`. Az-Gate-Beweis (Az-haltiger Output → in_review).
- PR gegen `staging` (stackt auf #3457). VPS-Crontab (täglich) = Aaron.
