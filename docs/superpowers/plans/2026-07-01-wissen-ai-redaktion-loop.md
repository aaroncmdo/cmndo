# AI-Redaktions-Loop für /wissen — Implementierungs-Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Die manuell-getriggerte Pipeline end-to-end bauen — ein Thema anlegen → AI-Draft generieren → im Admin editieren/freigeben → live unter `/wissen/[slug]` → im GEO-Feed → kommentierbar. Beweist Datenmodell, Generierung, Legal-Gate, Render und Feed-Union mit einem echten Artikel.

**Architecture:** DB-Artikel (Supabase, shared). Generierung + Review = Haupt-App (`src/`). Render + Feed-Union = Marketing (`claimondo-marketing/`). Publishing = Status-Flip (kein Deploy/Artikel).

**Tech Stack:** Next.js 16 (beide Apps), Supabase (untypisierte Clients → kein Types-Regen), `src/lib/support/anthropic-client.ts`, Markdown-Render-Pipeline aus `lib/content/claimondo-mdx.ts`. Spec: `docs/superpowers/specs/2026-07-01-wissen-ai-redaktion-loop-design.md`.

## Global Constraints

- **Kein Auto-Publish** — jeder Artikel geht `entwurf`→`in_review`→(Admin)→`veroeffentlicht`. Der Review ist Pflicht.
- **Autor = `aaron-sprafke`** (Person-Schema). **Umlaut-Pflicht** in allen nutzersichtbaren Texten (Artikel-Body kommt aus AI; Admin-UI-Labels von Hand).
- **DDL nur via `mcp__plugin_supabase_supabase__apply_migration`** (Regel 2); Migration-File == getrackte Version; `execute_sql` nur READ.
- **Server-Actions:** `{ ok, error? }`, kein throw; `requireRole(['admin'])` + `createAdminClient()` (service-role) — exakt wie `src/app/admin/kommentare/`.
- **Tests (Repo-Pattern):** vitest für pure Logik (Generierungs-Prompt/Parse, Feed-Mapping). tsc + transaktionaler RLS-Smoke für Supabase-Glue (Actions/Render/DB) — vitest testet keine Supabase-Calls. Marketing-tsc-Baseline = ~8 ENV-Noise-Fehler (react-hook-form/remark in fremden Files); nur NEUE Fehler in eigenen Files zählen.
- **Branch:** `kitta/wissen-ai-redaktion`. **Abhängigkeit:** `/wissen/[slug]` importiert `ArticleComments` (Kommentar-Feature, unmerged). Task 6 baut das ein — falls Kommentare noch nicht auf staging sind, Import auskommentieren + TODO, nach Merge nachziehen (im Task vermerkt).

## File Structure

**Haupt-App (`src/`):**
- `supabase/migrations/<V>_wissen_ai_redaktion_foundation.sql` — 2 Tabellen + RLS.
- `src/lib/wissen/generate.ts` — Claude-Generierung (structured output) + `buildSystemPrompt`/`parseDraft`.
- `src/lib/wissen/generate.test.ts` — vitest (Prompt-Guardrails, Parse).
- `src/app/admin/wissen-artikel/actions.ts` — Themen-/Artikel-Actions.
- `src/app/admin/wissen-artikel/page.tsx` — Review-Portal (server).
- `src/app/admin/wissen-artikel/ThemaForm.tsx`, `DraftEditor.tsx` — Client-Komponenten.
- `src/app/admin/_components/AdminNav.tsx` — **EDIT** (Nav-Item).

**Marketing (`claimondo-marketing/`):**
- `lib/wissen/db-articles.ts` — `getPublishedArtikelBySlug`, `getPublishedArtikel`, `mapArtikelToFeedItem` (pure).
- `lib/wissen/db-articles.test.ts` — vitest (Feed-Mapping).
- `app/[locale]/wissen/[slug]/page.tsx` — Render-Route.
- `lib/feed/news-items.ts`, `lib/feed/katalog-items.ts` — **EDIT** (Union).

---

### Task 1: DB-Foundation (2 Tabellen + RLS)

**Files:** Create `supabase/migrations/<V>_wissen_ai_redaktion_foundation.sql`

**Interfaces — Produces:** Tabellen `wissen_themen`, `wissen_artikel`; RLS: anon liest nur `wissen_artikel where status='veroeffentlicht'`.

- [ ] **Step 1: DDL schreiben + via Plugin anwenden** (`apply_migration`, name `wissen_ai_redaktion_foundation`):

```sql
create table public.wissen_themen (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  kurzbrief text,
  begruendung text,
  primary_keyword text,
  cluster text,
  artikel_typ text,
  status text not null default 'vorgeschlagen'
    check (status in ('vorgeschlagen','freigegeben','abgelehnt','entwurf_erstellt')),
  quelle text not null default 'ai_gap' check (quelle in ('ai_gap','manuell')),
  entschieden_von uuid,
  entschieden_am timestamptz,
  created_at timestamptz not null default now()
);

create table public.wissen_artikel (
  id uuid primary key default gen_random_uuid(),
  thema_id uuid references public.wissen_themen(id) on delete set null,
  slug text unique not null check (slug ~ '^[a-z0-9-]{3,80}$'),
  title text not null,
  body text not null,
  excerpt text,
  key_facts text[] not null default '{}',
  meta_description text,
  primary_keyword text,
  cluster text,
  artikel_typ text,
  status text not null default 'entwurf'
    check (status in ('entwurf','in_review','veroeffentlicht','abgelehnt','archiviert')),
  author text not null default 'aaron-sprafke',
  ai_generated boolean not null default true,
  ai_model text,
  reviewed_von uuid,
  reviewed_am timestamptz,
  veroeffentlicht_am timestamptz,
  last_modified date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wissen_artikel_status_idx on public.wissen_artikel(status);
create index wissen_artikel_thema_idx on public.wissen_artikel(thema_id);

alter table public.wissen_themen enable row level security;
alter table public.wissen_artikel enable row level security;

-- Nur veroeffentlichte Artikel sind oeffentlich lesbar (Marketing-Render + Feed).
-- Draft-Lesen + alle Writes laufen ueber service-role (Admin-Actions) -> kein Policy noetig.
grant select on public.wissen_artikel to anon, authenticated;
create policy wissen_artikel_public_read on public.wissen_artikel
  for select to anon, authenticated using (status = 'veroeffentlicht');
-- wissen_themen: keine anon/authenticated-Policy -> nur service-role sieht sie.
```

- [ ] **Step 2: Getrackte Version ablesen** (`list_migrations`) und Migration-File exakt als `<V>_wissen_ai_redaktion_foundation.sql` committen (Regel 2, Twin-Drift vermeiden).

- [ ] **Step 3: RLS-Smoke** (`execute_sql`, transaktional, rolled back). Erwartung in Kommentaren:

```sql
begin;
insert into public.wissen_artikel (slug,title,body,status)
  values ('smoke-rls-test','T','B','entwurf');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
select count(*) as should_be_0 from public.wissen_artikel where slug='smoke-rls-test'; -- entwurf unsichtbar
reset role;
update public.wissen_artikel set status='veroeffentlicht' where slug='smoke-rls-test';
set local role authenticated;
select count(*) as should_be_1 from public.wissen_artikel where slug='smoke-rls-test'; -- jetzt sichtbar
rollback;
```
Erwartung: `should_be_0`=0, `should_be_1`=1. (Belegt: anon/authenticated sieht Drafts NICHT, veroeffentlichte JA.)

- [ ] **Step 4: Commit** `feat(wissen): DB-Foundation wissen_themen + wissen_artikel + RLS`.

---

### Task 2: Generierungs-Lib (Claude → strukturierter Draft)

**Files:** Create `src/lib/wissen/generate.ts`, `src/lib/wissen/generate.test.ts`

**Interfaces — Consumes:** `src/lib/support/anthropic-client.ts` (Client) — Pattern für structured output aus `src/lib/ai/briefing-structured.ts` lesen und spiegeln. **Produces:** `generateArtikelDraft(input): Promise<{ ok: true; data: ArtikelDraft } | { ok: false; error: string }>`, `buildSystemPrompt(input)`, `parseDraft(raw)`.

```ts
// generate.ts (Gerüst — Client-Call nach briefing-structured.ts-Pattern)
export type ThemaInput = { titel: string; kurzbrief?: string; primary_keyword?: string; cluster?: string; artikel_typ?: string }
export type ArtikelDraft = {
  slug: string; title: string; excerpt: string; keyFacts: string[]
  metaDescription: string; primaryKeyword: string; cluster: string; body: string
}

export function buildSystemPrompt(input: ThemaInput): string {
  return [
    'Du schreibst einen Wissens-Artikel fuer claimondo.de (Kfz-Schadenregulierung, unverschuldeter Unfall).',
    'HAUS-STIL: H1-Titel; direkt danach ein Blockquote "> **Kurz erklaert:** ..." (40-60 Woerter);',
    '  danach ## Sektionen; eine ## Haeufige Fragen Sektion (je **Frage?** + Antwort); Deutsch mit korrekten Umlauten.',
    'PFLICHT: belege mit ECHTEN BGH-Az. (Format "BGH VI ZR 123/45") und §§ (z.B. "§ 249 BGB").',
    '  Erfinde NIE ein Aktenzeichen. Bist du unsicher, schreibe die Aussage ohne Az. statt zu halluzinieren.',
    'VERBOT: keine konkrete Einzelfall-Handlungsempfehlung (RDG) — nur allgemeine Information.',
    'Schliesse mit einem Hinweis, dass dies allgemeine Information und keine Rechtsberatung ist.',
  ].join('\n')
}

// parseDraft: validiert die 8 Felder, wirft nie — liefert {ok,error} bei Schema-Verstoss.
// generateArtikelDraft: baut Prompt, ruft anthropic-client (structured/JSON), parsed, gibt {ok,data}.
```

- [ ] **Step 1: Failing test** `generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, parseDraft } from './generate'

describe('buildSystemPrompt', () => {
  it('enthaelt die Legal-Guardrails', () => {
    const p = buildSystemPrompt({ titel: 'Nutzungsausfall' })
    expect(p).toMatch(/RDG|Handlungsempfehlung/)
    expect(p).toMatch(/BGH/)
    expect(p).toMatch(/Erfinde NIE/)
    expect(p).toMatch(/keine Rechtsberatung/)
  })
})
describe('parseDraft', () => {
  it('akzeptiert vollstaendigen Draft', () => {
    const r = parseDraft(JSON.stringify({ slug:'x-y', title:'T', excerpt:'e'.repeat(120), keyFacts:['a','b','c'], metaDescription:'m', primaryKeyword:'k', cluster:'H3', body:'# T\n\n> **Kurz erklaert:** ...' }))
    expect(r.ok).toBe(true)
  })
  it('lehnt fehlende Felder ab (kein throw)', () => {
    expect(parseDraft('{"title":"T"}').ok).toBe(false)
    expect(parseDraft('nicht json').ok).toBe(false)
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/wissen/generate.test.ts` → FAIL.
- [ ] **Step 3:** `generate.ts` implementieren (buildSystemPrompt wie oben; parseDraft = JSON.parse in try/catch + Feld-/Längen-Checks; generateArtikelDraft ruft anthropic-client nach briefing-structured.ts-Pattern, `ai_model` mitgeben).
- [ ] **Step 4:** vitest → PASS. `npx tsc --noEmit` grün.
- [ ] **Step 5: Commit** `feat(wissen): Generierungs-Lib mit Legal-Guardrails + vitest`.

---

### Task 3: Admin-Actions

**Files:** Create `src/app/admin/wissen-artikel/actions.ts`

**Interfaces — Consumes:** `generateArtikelDraft` (Task 2), `requireRole`, `createAdminClient`. **Produces:** `createThema`, `approveThema`, `rejectThema`, `generateDraft`, `updateArtikel`, `publishArtikel`, `rejectArtikel` (alle `{ ok, error? }`).

Muster **exakt wie `src/app/admin/kommentare/actions.ts`** (requireRole(['admin']) → createAdminClient → mutate → revalidatePath('/admin/wissen-artikel')). Kernpunkte:
- `createThema(fd)`: insert `wissen_themen` (quelle='manuell', status='freigegeben' — manuell angelegte Themen sind sofort freigegeben).
- `generateDraft(themaId)`: Thema laden → `generateArtikelDraft` → bei ok: insert `wissen_artikel` (status='in_review', ai_model, thema_id) + Thema→'entwurf_erstellt'; bei !ok: `{ ok:false, error }`. Slug-Kollision (23505) → Slug mit `-2` Suffix retry ODER Fehler zurückgeben.
- `updateArtikel(id, fields)`: update title/body/excerpt/key_facts/meta_description/slug + `updated_at=now()`.
- `publishArtikel(id)`: update status='veroeffentlicht', veroeffentlicht_am=now(), reviewed_von=auth-user, reviewed_am=now(), last_modified=heute (`new Date().toISOString().slice(0,10)`).
- `rejectArtikel(id)` / `rejectThema(id)` / `approveThema(id)`: Status-Updates.

- [ ] **Step 1:** actions.ts schreiben (Muster kommentare/actions.ts). 
- [ ] **Step 2:** `npx tsc --noEmit` grün.
- [ ] **Step 3: Commit** `feat(wissen): Admin-Actions (Thema/Draft/Publish)`.

---

### Task 4: Admin-Review-Portal + Nav

**Files:** Create `src/app/admin/wissen-artikel/page.tsx`, `ThemaForm.tsx`, `DraftEditor.tsx`; **EDIT** `src/app/admin/_components/AdminNav.tsx`

Muster **wie `src/app/admin/kommentare/page.tsx`** (force-dynamic, `createAdminClient`, `DataTable`, Server-Component + Client-Actions).
- `page.tsx`: lädt Themen (status in vorgeschlagen/freigegeben) + Drafts (status='in_review') via createAdminClient. Rendert 2 Sektionen: **Themen** (Liste + `ThemaForm` zum manuellen Anlegen + „Draft generieren"-Button je freigegebenem Thema) + **Drafts in Review** (je Draft ein `DraftEditor`).
- `ThemaForm.tsx` (client): Felder titel/kurzbrief/primary_keyword/cluster → `createThema`.
- `DraftEditor.tsx` (client): editierbare Textareas (title/body/excerpt/meta_description/slug) + Buttons „Speichern" (`updateArtikel`), „Freigeben & veröffentlichen" (`publishArtikel`), „Ablehnen" (`rejectArtikel`). Body = große `<textarea>` (Markdown; Live-Preview = Phase 2).
- `AdminNav.tsx`: Nav-Item `{ href: '/admin/wissen-artikel', label: 'Wissen-Artikel', icon: <passendes Lucide-Icon> }` neben „Kommentare".

- [ ] **Step 1:** Komponenten + page + Nav-Edit schreiben.
- [ ] **Step 2:** `npm run build` (Route+Layout → voller Build, Audit-Punkt 1) grün.
- [ ] **Step 3: Commit** `feat(wissen): Admin-Review-Portal + Nav`.

---

### Task 5: Marketing-Queries + Feed-Mapping (pure, getestet)

**Files:** Create `claimondo-marketing/lib/wissen/db-articles.ts`, `db-articles.test.ts`

**Interfaces — Produces:** `getPublishedArtikelBySlug(slug): Promise<Artikel|null>`, `getPublishedArtikel(): Promise<Artikel[]>` (via marketing `@/lib/supabase/server`, anon, RLS-gated → liest nur veröffentlichte), `mapArtikelToFeedItem(a): FeedItem` (pure, testbar — Shape aus `lib/feed/types.ts`).

```ts
// mapArtikelToFeedItem: baut FeedItem { title, link:`/wissen/${slug}`, guid, excerpt, pubDate:last_modified|veroeffentlicht_am, keyFacts }
// Datum-Fallback wie claimondo-mdx (kein new Date() zur Build-Zeit).
```

- [ ] **Step 1: Failing test** `db-articles.test.ts`: `mapArtikelToFeedItem` mappt slug→`/wissen/<slug>`, nimmt last_modified als pubDate, überträgt excerpt/keyFacts. (Reine Funktion, kein DB-Mock.)
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3:** db-articles.ts implementieren (Query-Funktionen + `mapArtikelToFeedItem`). Marketing-Supabase-Client wie in `lib/community/comments.ts`.
- [ ] **Step 4:** vitest → PASS; tsc (nur eigene Files, gg. Baseline).
- [ ] **Step 5: Commit** `feat(wissen): Marketing-Queries + Feed-Mapping + vitest`.

---

### Task 6: Render-Route `/wissen/[slug]`

**Files:** Create `claimondo-marketing/app/[locale]/wissen/[slug]/page.tsx`

Muster **wie `app/[locale]/haftpflicht/[slug]/page.tsx`**, aber Asset aus `getPublishedArtikelBySlug(slug)` statt MDX; `notFound()` wenn null.
- Reuse `stripLeadingSnippet`/`stripSchemaSection`/`extractHeadings`/`extractSchemaJson`/`extractCitations`/`readingTimeMin` + `MarkdownRenderer` + `ContentJsonLd` (author = Aaron Person) + `AssetHero` + `TableOfContents` + `SpokeCtaBand` + `StickyCallBar`.
- `generateMetadata` (title/description/canonical `/wissen/<slug>`, og:type=article).
- **`ArticleComments articleSlug={`wissen/${slug}`}`** — falls Kommentar-Feature noch nicht auf staging: Import auskommentieren + `// TODO nach artikel-kommentare-Merge` (Render funktioniert ohne).

- [ ] **Step 1:** page.tsx schreiben.
- [ ] **Step 2:** `npx tsc --noEmit` (nur eigene Files gg. Baseline); wenn Kommentare gemergt: voller Marketing-`next build` der Route.
- [ ] **Step 3: Commit** `feat(wissen): Render-Route /wissen/[slug]`.

---

### Task 7: Feed-Union

**Files:** **EDIT** `claimondo-marketing/lib/feed/news-items.ts`, `claimondo-marketing/lib/feed/katalog-items.ts`

Nach dem bestehenden MDX-Asset-Mapping die veröffentlichten DB-Artikel via `getPublishedArtikel()` laden, mit `mapArtikelToFeedItem` mappen, in die Item-Liste mergen, nach Datum (desc) sortieren. News-Feed: neue Artikel → frisches Top-Item (löst H1). Katalog: analog.

- [ ] **Step 1:** falls sinnvoll, Union-Logik als kleine reine Funktion (`mergeAndSortItems(mdxItems, dbItems)`) faktorisieren + in `db-articles.test.ts` testen (Sortierung/Dedupe by guid).
- [ ] **Step 2:** news-items.ts + katalog-items.ts editieren (async: DB-Fetch + Merge).
- [ ] **Step 3:** vitest grün; tsc eigene Files.
- [ ] **Step 4: Commit** `feat(wissen): Feed-Union DB-Artikel in News+Katalog`.

---

### Task 8 (optional): /wissen-Hub listet DB-Artikel

**Files:** **EDIT** `claimondo-marketing/lib/feed/wissen.ts` (getWissenData)

Veröffentlichte DB-Artikel in eine eigene Gruppe „Redaktion / Neu" der Hub-Übersicht aufnehmen (damit sie auch menschenlesbar gelistet sind, nicht nur im Maschinen-Feed).

- [ ] **Step 1:** getWissenData um DB-Artikel-Gruppe erweitern.
- [ ] **Step 2:** tsc/build grün.
- [ ] **Step 3: Commit** `feat(wissen): DB-Artikel im /wissen-Hub`.

---

## Nach Phase 1

**Ende-zu-Ende-Smoke (manuell, nach Deploy):** Thema anlegen → „Draft generieren" → Draft im Portal editieren → veröffentlichen → `/wissen/<slug>` lädt → im `/feed.xml` als frisches Item → Kommentar möglich.

**Phase 2 (Folgeplan):** Themen-Vorschlag-Cron (Gap-Analyse über Bestandstitel) + Draft-Scheduler scharfschalten; echte Ahrefs/GSC-Keyword-Daten; Audit-Log-Tabelle `wissen_artikel_versionen`; Live-Preview im DraftEditor. **DPIA-Kurz-Doc** (Launch-Gate, Datenschutz-Risiko gering/kein PII — s. Spec §10) vor Live.

## Self-Review-Notiz (Autor)

Spec-Abdeckung: §1 DB→T1, §3 Generierung→T2, §6 Admin→T3+T4, §4 Render→T6, §5 Feed→T5+T7, Hub→T8. Typen konsistent (`ArtikelDraft`-Felder = `wissen_artikel`-Spalten = `mapArtikelToFeedItem`-Input). Kein Auto-Publish (T3 publish nur via Admin-Action). Test-Realismus: vitest nur für pure Logik (T2/T5/T7), Supabase-Glue via tsc+RLS-Smoke (T1) — Repo-Pattern.
