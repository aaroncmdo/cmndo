# LinkedIn Auto-Posting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate LinkedIn post drafts from the marketing GEO feed, let an admin approve them in the portal, and publish them to the Claimondo company page via the official LinkedIn Posts API.

**Architecture:** A cron drip fetches the public `feed.json`, picks the newest un-posted item, composes a post (Claude + template fallback), and inserts it as an `entwurf` row. An admin reviews/approves it in `/admin/marketing/linkedin`; approval calls a pluggable `LinkedInPublisher` (official Posts API) using an OAuth org token stored in Supabase. App-side is fully decoupled from the LinkedIn approval gate.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + RLS, service-role admin client), `@anthropic-ai/sdk` ^0.80.0, vitest ^4.1.4, LinkedIn REST API (`/rest/posts`, OAuth2).

## Global Constraints

- **DDL only via Supabase-MCP `apply_migration`** — never raw `execute_sql`/CLI. After apply: `list_migrations` → read recorded version `<V>` → commit file as `supabase/migrations/<V>_<name>.sql` (Regel 2).
- **Never push to `main`.** Work on `kitta/linkedin-auto-posting` (own worktree, off `staging`). PR targets `staging` (Regel 1).
- **No unaccompanied stash at session end** (Regel 3).
- **Server Actions return `{ ok: boolean; error?: string }`** — never throw. Non-critical sub-ops (alerts) in local try/catch. Every mutation calls `revalidatePath(...)`.
- **UI strings in German with correct umlauts** (`ä/ö/ü/ß`). Code/comments/commits may be ASCII.
- **Components from `@/components/primitives/*` + `@/components/shared/*`** (Button `onClick`/`variant`/`loading`; SectionCard; StatusBadge; forms/*). No hand-rolled button/card markup. Status colors via tokens (`bg-success`/`text-success-strong`/`bg-danger-soft`…), never raw `bg-green-*`.
- **No raw inline brand hex** — use `claimondo-*` tokens or `var(--brand-*, #fb)`.
- **Test command:** `npx vitest run <path>`. Tests live in `src/lib/linkedin/__tests__/*.test.ts`.
- **Branch hygiene:** all new files; `AdminNav` change is a single additive nav item; `database.types.ts` regen is deferred — the linkedin lib carries local row types to avoid a hot-file merge conflict.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<V>_linkedin_posts.sql` | `linkedin_posts` table + RLS |
| `supabase/migrations/<V>_linkedin_oauth_tokens.sql` | `linkedin_oauth_tokens` table + RLS |
| `src/lib/linkedin/types.ts` | Shared types: feed item, publish input, `LinkedInPublisher`, row types, `PostStatus` |
| `src/lib/linkedin/feed-source.ts` | Fetch + parse `feed.json` → `LinkedInFeedItem[]` |
| `src/lib/linkedin/hashtags.ts` | assetType → hashtag set |
| `src/lib/linkedin/compose.ts` | `composeTemplate` (deterministic) + `composePost` (Claude + fallback) |
| `src/lib/linkedin/select-next.ts` | Pure: pick newest un-posted item given feed + seen guids |
| `src/lib/linkedin/token.ts` | `getValidLinkedInToken` (load + refresh + persist) |
| `src/lib/linkedin/oauth.ts` | `buildAuthorizeUrl`, `exchangeCode`, `fetchAdminOrgUrn` |
| `src/lib/linkedin/publisher.ts` | `LinkedInPublisher` + `PostsApiPublisher` |
| `src/app/api/cron/linkedin-drip/route.ts` | Cron: feed → select → compose → insert draft |
| `src/app/api/auth/linkedin/callback/route.ts` | OAuth callback → store token |
| `src/app/admin/marketing/page.tsx` | Marketing landing (links to LinkedIn) |
| `src/app/admin/marketing/linkedin/page.tsx` | Queue (server component) |
| `src/app/admin/marketing/linkedin/LinkedInQueueClient.tsx` | Client UI (edit/approve/skip) |
| `src/app/admin/marketing/linkedin/actions.ts` | Server actions (Result pattern) |
| `src/app/admin/_components/AdminNav.tsx` | +1 nav item „Marketing" |
| `.env.example` | LinkedIn ENV keys |
| `src/lib/linkedin/__tests__/*.test.ts` | Unit tests |

---

## Task 1: Database tables (`linkedin_posts`, `linkedin_oauth_tokens`)

**Files:**
- Create: `supabase/migrations/<V>_linkedin_posts.sql` (recorded version from MCP)
- Create: `supabase/migrations/<V>_linkedin_oauth_tokens.sql`

**Interfaces:**
- Produces: tables `public.linkedin_posts`, `public.linkedin_oauth_tokens` (columns per below). No code consumes these directly yet — Task 2 defines matching row types.

- [ ] **Step 1: Apply `linkedin_posts` migration via MCP**

Call `mcp__plugin_supabase_supabase__apply_migration` with `name: "linkedin_posts"` and this query:

```sql
create table public.linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  feed_guid text not null unique,
  feed_url text not null,
  title text not null,
  excerpt text,
  composed_text text not null,
  status text not null default 'entwurf'
    check (status in ('entwurf','veroeffentlicht','fehlgeschlagen','uebersprungen')),
  author_urn text not null,
  linkedin_post_urn text,
  scheduled_for timestamptz,
  published_at timestamptz,
  freigegeben_von uuid references public.profiles(id),
  freigegeben_am timestamptz,
  fehler text,
  erstellt_am timestamptz not null default now()
);
create index linkedin_posts_status_idx on public.linkedin_posts (status);
alter table public.linkedin_posts enable row level security;
create policy linkedin_posts_admin_all on public.linkedin_posts
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle = 'admin'));
```

- [ ] **Step 2: Apply `linkedin_oauth_tokens` migration via MCP**

Call `apply_migration` with `name: "linkedin_oauth_tokens"`:

```sql
create table public.linkedin_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_urn text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  connected_by uuid references public.profiles(id),
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
alter table public.linkedin_oauth_tokens enable row level security;
-- deny-all: no policy => only service_role (bypasses RLS) can read/write. Secrets.
```

- [ ] **Step 3: Read recorded versions**

Call `mcp__plugin_supabase_supabase__list_migrations`. Note the two recorded versions `<V1>`, `<V2>`.

- [ ] **Step 4: Write migration files named after recorded versions**

Create `supabase/migrations/<V1>_linkedin_posts.sql` and `supabase/migrations/<V2>_linkedin_oauth_tokens.sql` containing the exact DDL from Steps 1–2. (Filename == recorded version → no Twin-Drift.)

- [ ] **Step 5: Verify**

Call `execute_sql` (READ): `select column_name, data_type from information_schema.columns where table_name = 'linkedin_posts' order by ordinal_position;` — expect 15 columns. Repeat for `linkedin_oauth_tokens` (9 columns).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_linkedin_posts.sql supabase/migrations/*_linkedin_oauth_tokens.sql
git commit -m "feat(linkedin): linkedin_posts + linkedin_oauth_tokens tables (DDL via MCP)"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/linkedin/types.ts`

**Interfaces:**
- Produces: `LinkedInFeedItem`, `PostStatus`, `LinkedInPostRow`, `LinkedInPublishInput`, `LinkedInPublishResult`, `LinkedInPublisher`, `LinkedInTokenRow`.

- [ ] **Step 1: Write the types file**

```ts
// src/lib/linkedin/types.ts
// Local row types bridge the new tables until database.types.ts is regenerated
// (deferred to avoid a hot-file merge conflict during parallel sessions).

export type FeedAssetType =
  | 'Cornerstone' | 'Spoke' | 'Decoder' | 'Sachverständige' | 'Stadt' | 'Strategic'

/** Normalised item parsed from the public JSON Feed (claimondo.de/feed.json). */
export interface LinkedInFeedItem {
  guid: string        // JSON Feed item.id (canonical URL)
  url: string         // item.url
  title: string       // item.title
  excerpt: string     // item.summary
  keyFacts: string[]  // item._claimondo.keyFacts
  assetType: FeedAssetType | string
  datePublished: string // item.date_published (ISO)
}

export type PostStatus = 'entwurf' | 'veroeffentlicht' | 'fehlgeschlagen' | 'uebersprungen'

export interface LinkedInPostRow {
  id: string
  feed_guid: string
  feed_url: string
  title: string
  excerpt: string | null
  composed_text: string
  status: PostStatus
  author_urn: string
  linkedin_post_urn: string | null
  scheduled_for: string | null
  published_at: string | null
  freigegeben_von: string | null
  freigegeben_am: string | null
  fehler: string | null
  erstellt_am: string
}

export interface LinkedInTokenRow {
  id: string
  organization_urn: string
  access_token: string
  refresh_token: string | null
  expires_at: string
  scope: string | null
  connected_by: string | null
}

export interface LinkedInPublishInput {
  authorUrn: string   // urn:li:organization:<id>
  text: string        // commentary
  link: string        // canonical URL
  title: string
  description: string // article card description
}

export type LinkedInPublishResult =
  | { ok: true; postUrn: string }
  | { ok: false; error: string }

export interface LinkedInPublisher {
  publish(input: LinkedInPublishInput): Promise<LinkedInPublishResult>
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → Expected: no new errors referencing `src/lib/linkedin/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/linkedin/types.ts
git commit -m "feat(linkedin): shared types (feed item, row types, publisher interface)"
```

---

## Task 3: Feed source

**Files:**
- Create: `src/lib/linkedin/feed-source.ts`
- Test: `src/lib/linkedin/__tests__/feed-source.test.ts`

**Interfaces:**
- Consumes: `LinkedInFeedItem` (Task 2).
- Produces: `fetchFeedItems(feedUrl?: string): Promise<LinkedInFeedItem[]>`, `parseJsonFeed(json: unknown): LinkedInFeedItem[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/linkedin/__tests__/feed-source.test.ts
import { describe, it, expect } from 'vitest'
import { parseJsonFeed } from '../feed-source'

const SAMPLE = {
  version: 'https://jsonfeed.org/version/1.1',
  items: [
    {
      id: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      url: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      title: 'Online-Kfz-Gutachten',
      summary: 'Einordnung des LG-Bremen-Urteils.',
      date_published: '2026-05-25T00:00:00.000Z',
      tags: ['Strategic'],
      _claimondo: { assetType: 'Strategic', keyFacts: ['LG Bremen 9 O 1720/24'] },
    },
  ],
}

describe('parseJsonFeed', () => {
  it('maps JSON Feed items to LinkedInFeedItem', () => {
    const items = parseJsonFeed(SAMPLE)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      guid: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      url: 'https://claimondo.de/kfz-gutachter/online-kfz-gutachten',
      title: 'Online-Kfz-Gutachten',
      excerpt: 'Einordnung des LG-Bremen-Urteils.',
      keyFacts: ['LG Bremen 9 O 1720/24'],
      assetType: 'Strategic',
      datePublished: '2026-05-25T00:00:00.000Z',
    })
  })

  it('returns [] for malformed input', () => {
    expect(parseJsonFeed({})).toEqual([])
    expect(parseJsonFeed(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/linkedin/__tests__/feed-source.test.ts`
Expected: FAIL — `parseJsonFeed` not exported.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/linkedin/feed-source.ts
import type { LinkedInFeedItem } from './types'

const DEFAULT_FEED_URL = process.env.MARKETING_FEED_URL ?? 'https://claimondo.de/feed.json'

interface RawItem {
  id?: unknown; url?: unknown; title?: unknown; summary?: unknown
  date_published?: unknown; _claimondo?: { assetType?: unknown; keyFacts?: unknown }
}

export function parseJsonFeed(json: unknown): LinkedInFeedItem[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((raw: RawItem) => {
    if (typeof raw?.id !== 'string' || typeof raw?.url !== 'string') return []
    return [{
      guid: raw.id,
      url: raw.url,
      title: typeof raw.title === 'string' ? raw.title : '',
      excerpt: typeof raw.summary === 'string' ? raw.summary : '',
      keyFacts: Array.isArray(raw._claimondo?.keyFacts)
        ? (raw._claimondo!.keyFacts as unknown[]).filter((f): f is string => typeof f === 'string')
        : [],
      assetType: typeof raw._claimondo?.assetType === 'string' ? raw._claimondo!.assetType as string : 'Spoke',
      datePublished: typeof raw.date_published === 'string' ? raw.date_published : new Date(0).toISOString(),
    }]
  })
}

export async function fetchFeedItems(feedUrl: string = DEFAULT_FEED_URL): Promise<LinkedInFeedItem[]> {
  const res = await fetch(feedUrl, { headers: { accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`)
  return parseJsonFeed(await res.json())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/linkedin/__tests__/feed-source.test.ts` → Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/feed-source.ts src/lib/linkedin/__tests__/feed-source.test.ts
git commit -m "feat(linkedin): feed.json source parser + fetch"
```

---

## Task 4: Hashtags + template composer

**Files:**
- Create: `src/lib/linkedin/hashtags.ts`
- Create: `src/lib/linkedin/compose.ts` (template part only; LLM added in Task 5)
- Test: `src/lib/linkedin/__tests__/compose.test.ts`

**Interfaces:**
- Consumes: `LinkedInFeedItem` (Task 2).
- Produces: `hashtagsFor(assetType: string): string[]`, `composeTemplate(item: LinkedInFeedItem): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/linkedin/__tests__/compose.test.ts
import { describe, it, expect } from 'vitest'
import { composeTemplate } from '../compose'
import { hashtagsFor } from '../hashtags'
import type { LinkedInFeedItem } from '../types'

const ITEM: LinkedInFeedItem = {
  guid: 'https://claimondo.de/x', url: 'https://claimondo.de/x',
  title: 'Online-Kfz-Gutachten — was erlaubt ist',
  excerpt: 'Einordnung des LG-Bremen-Urteils für Geschädigte.',
  keyFacts: ['LG Bremen 9 O 1720/24', 'Vor-Ort-Besichtigung Pflicht', 'Hybride Modelle BGH-konform'],
  assetType: 'Strategic', datePublished: '2026-05-25T00:00:00.000Z',
}

describe('hashtagsFor', () => {
  it('returns 3–5 hashtags starting with #', () => {
    const tags = hashtagsFor('Strategic')
    expect(tags.length).toBeGreaterThanOrEqual(3)
    expect(tags.length).toBeLessThanOrEqual(5)
    expect(tags.every((t) => t.startsWith('#'))).toBe(true)
  })
  it('falls back for unknown assetType', () => {
    expect(hashtagsFor('Unknown').length).toBeGreaterThanOrEqual(3)
  })
})

describe('composeTemplate', () => {
  it('includes title, key facts, url and hashtags, keeps umlauts', () => {
    const text = composeTemplate(ITEM)
    expect(text).toContain('Online-Kfz-Gutachten')
    expect(text).toContain('• LG Bremen 9 O 1720/24')
    expect(text).toContain('https://claimondo.de/x')
    expect(text).toContain('#')
    expect(text).toContain('Geschädigte')
  })
  it('stays under the LinkedIn 3000-char commentary limit', () => {
    expect(composeTemplate(ITEM).length).toBeLessThanOrEqual(3000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/linkedin/__tests__/compose.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 3: Write `hashtags.ts`**

```ts
// src/lib/linkedin/hashtags.ts
const BASE = ['#KfzGutachten', '#Schadensregulierung', '#Verkehrsrecht']
const BY_TYPE: Record<string, string[]> = {
  Cornerstone: [...BASE, '#Kfz'],
  Spoke: [...BASE, '#Haftpflicht'],
  Decoder: [...BASE, '#Schadengutachten'],
  Sachverständige: ['#Sachverständiger', '#KfzGutachter', '#Verkehrsrecht'],
  Stadt: ['#KfzGutachter', '#Schadensregulierung', '#Unfall'],
  Strategic: [...BASE, '#Unfallregulierung'],
}
export function hashtagsFor(assetType: string): string[] {
  return BY_TYPE[assetType] ?? BASE
}
```

- [ ] **Step 4: Write `compose.ts` (template only)**

```ts
// src/lib/linkedin/compose.ts
import type { LinkedInFeedItem } from './types'
import { hashtagsFor } from './hashtags'

const MAX = 3000

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}

/** Deterministic fallback post (no LLM). Used when the LLM call fails. */
export function composeTemplate(item: LinkedInFeedItem): string {
  const facts = item.keyFacts.slice(0, 3).map((f) => `• ${f}`).join('\n')
  const tags = hashtagsFor(item.assetType).join(' ')
  const body = [
    item.title,
    '',
    item.excerpt,
    facts ? `\n${facts}` : '',
    '',
    `Mehr dazu: ${item.url}`,
    '',
    tags,
  ].filter((p) => p !== '').join('\n')
  return clamp(body, MAX)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/linkedin/__tests__/compose.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/linkedin/hashtags.ts src/lib/linkedin/compose.ts src/lib/linkedin/__tests__/compose.test.ts
git commit -m "feat(linkedin): hashtag map + deterministic template composer"
```

---

## Task 5: LLM composer + fallback

**Files:**
- Modify: `src/lib/linkedin/compose.ts` (add `composePost`)
- Test: `src/lib/linkedin/__tests__/compose-llm.test.ts`

**Interfaces:**
- Consumes: `composeTemplate` (Task 4), `LinkedInFeedItem`.
- Produces: `composePost(item: LinkedInFeedItem, deps?: { generate?: GenerateFn }): Promise<string>` where `type GenerateFn = (prompt: string) => Promise<string>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/linkedin/__tests__/compose-llm.test.ts
import { describe, it, expect } from 'vitest'
import { composePost } from '../compose'
import type { LinkedInFeedItem } from '../types'

const ITEM: LinkedInFeedItem = {
  guid: 'g', url: 'https://claimondo.de/x', title: 'T',
  excerpt: 'E', keyFacts: ['F1'], assetType: 'Spoke', datePublished: '2026-01-01T00:00:00.000Z',
}

describe('composePost', () => {
  it('uses the LLM output when generation succeeds', async () => {
    const text = await composePost(ITEM, { generate: async () => 'LLM-TEXT mit Link https://claimondo.de/x' })
    expect(text).toContain('LLM-TEXT')
    expect(text).toContain('https://claimondo.de/x')
  })
  it('appends the link if the LLM omitted it', async () => {
    const text = await composePost(ITEM, { generate: async () => 'Nur Text ohne Link' })
    expect(text).toContain('https://claimondo.de/x')
  })
  it('falls back to the template when generation throws', async () => {
    const text = await composePost(ITEM, { generate: async () => { throw new Error('LLM down') } })
    expect(text).toContain('• F1')
    expect(text).toContain('https://claimondo.de/x')
  })
  it('falls back when the LLM returns empty', async () => {
    const text = await composePost(ITEM, { generate: async () => '   ' })
    expect(text).toContain('• F1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/linkedin/__tests__/compose-llm.test.ts` → Expected: FAIL (`composePost` not exported).

- [ ] **Step 3: Extend `compose.ts`**

Append to `src/lib/linkedin/compose.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

export type GenerateFn = (prompt: string) => Promise<string>

function buildPrompt(item: LinkedInFeedItem): string {
  return [
    'Schreibe einen LinkedIn-Beitrag (Deutsch, korrekte Umlaute) für die Claimondo-Unternehmensseite.',
    'Claimondo ist eine digitale Kfz-Schadensregulierungs-Plattform. Ton: sachlich-kompetent, kein reißerischer Werbeslang (Rechts-Content).',
    'Struktur: starke erste Zeile (Hook), 2–3 prägnante Sätze Mehrwert, weicher CTA, dann die URL in eigener Zeile.',
    'Maximal ~1000 Zeichen. Keine erfundenen Fakten — nur die gegebenen.',
    '',
    `Titel: ${item.title}`,
    `Zusammenfassung: ${item.excerpt}`,
    `Key Facts:\n${item.keyFacts.map((f) => `- ${f}`).join('\n')}`,
    `URL: ${item.url}`,
  ].join('\n')
}

async function generateWithClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

/** LLM-composed post with deterministic template fallback. Never throws. */
export async function composePost(
  item: LinkedInFeedItem,
  deps: { generate?: GenerateFn } = {},
): Promise<string> {
  const generate = deps.generate ?? generateWithClaude
  try {
    const raw = (await generate(buildPrompt(item))).trim()
    if (!raw) return composeTemplate(item)
    const withLink = raw.includes(item.url) ? raw : `${raw}\n\n${item.url}`
    return clamp(withLink, MAX)
  } catch {
    return composeTemplate(item)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/linkedin/__tests__/compose-llm.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/compose.ts src/lib/linkedin/__tests__/compose-llm.test.ts
git commit -m "feat(linkedin): Claude composer with template fallback"
```

---

## Task 6: Next-unposted selection

**Files:**
- Create: `src/lib/linkedin/select-next.ts`
- Test: `src/lib/linkedin/__tests__/select-next.test.ts`

**Interfaces:**
- Consumes: `LinkedInFeedItem` (Task 2).
- Produces: `selectNextUnposted(items: LinkedInFeedItem[], seenGuids: Set<string>): LinkedInFeedItem | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/linkedin/__tests__/select-next.test.ts
import { describe, it, expect } from 'vitest'
import { selectNextUnposted } from '../select-next'
import type { LinkedInFeedItem } from '../types'

const mk = (guid: string, date: string): LinkedInFeedItem => ({
  guid, url: guid, title: guid, excerpt: '', keyFacts: [], assetType: 'Spoke', datePublished: date,
})

describe('selectNextUnposted', () => {
  it('picks the newest item not in seen', () => {
    const items = [mk('a', '2026-01-01'), mk('b', '2026-03-01'), mk('c', '2026-02-01')]
    expect(selectNextUnposted(items, new Set(['b']))?.guid).toBe('c') // newest unseen
  })
  it('returns null when all seen', () => {
    const items = [mk('a', '2026-01-01')]
    expect(selectNextUnposted(items, new Set(['a']))).toBeNull()
  })
  it('returns null for empty feed', () => {
    expect(selectNextUnposted([], new Set())).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/linkedin/__tests__/select-next.test.ts` → Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/linkedin/select-next.ts
import type { LinkedInFeedItem } from './types'

/** Newest un-posted item wins. `seenGuids` = every guid already in the ledger
 *  (any status, incl. uebersprungen/veroeffentlicht) so it is never re-drafted. */
export function selectNextUnposted(
  items: LinkedInFeedItem[],
  seenGuids: Set<string>,
): LinkedInFeedItem | null {
  const fresh = items.filter((i) => !seenGuids.has(i.guid))
  if (fresh.length === 0) return null
  return fresh.reduce((newest, i) =>
    new Date(i.datePublished).getTime() > new Date(newest.datePublished).getTime() ? i : newest,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/linkedin/__tests__/select-next.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/select-next.ts src/lib/linkedin/__tests__/select-next.test.ts
git commit -m "feat(linkedin): newest-unposted selection (pure)"
```

---

## Task 7: OAuth token store + refresh

**Files:**
- Create: `src/lib/linkedin/token.ts`
- Test: `src/lib/linkedin/__tests__/token.test.ts`

**Interfaces:**
- Consumes: `LinkedInTokenRow` (Task 2), `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `isExpired(expiresAt: string, now: number, bufferMs?: number): boolean`, `getValidLinkedInToken(): Promise<{ ok: true; token: string; orgUrn: string } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test (expiry logic)**

```ts
// src/lib/linkedin/__tests__/token.test.ts
import { describe, it, expect } from 'vitest'
import { isExpired } from '../token'

describe('isExpired', () => {
  const now = new Date('2026-06-29T12:00:00Z').getTime()
  it('true when past expiry', () => {
    expect(isExpired('2026-06-29T11:00:00Z', now)).toBe(true)
  })
  it('true when within the 5-min buffer', () => {
    expect(isExpired('2026-06-29T12:03:00Z', now)).toBe(true)
  })
  it('false when comfortably valid', () => {
    expect(isExpired('2026-06-29T13:00:00Z', now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/linkedin/__tests__/token.test.ts` → Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/linkedin/token.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { LinkedInTokenRow } from './types'

const BUFFER_MS = 5 * 60 * 1000

export function isExpired(expiresAt: string, now: number, bufferMs = BUFFER_MS): boolean {
  return new Date(expiresAt).getTime() - bufferMs <= now
}

async function refresh(row: LinkedInTokenRow): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!row.refresh_token) return { ok: false, error: 'Kein refresh_token — bitte LinkedIn neu verbinden.' }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
  })
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params,
  })
  if (!res.ok) return { ok: false, error: `Token-Refresh fehlgeschlagen: ${res.status}` }
  const j = await res.json() as { access_token: string; expires_in: number; refresh_token?: string }
  const admin = createAdminClient()
  await admin.from('linkedin_oauth_tokens').update({
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
    aktualisiert_am: new Date().toISOString(),
  }).eq('id', row.id)
  return { ok: true, token: j.access_token }
}

export async function getValidLinkedInToken():
  Promise<{ ok: true; token: string; orgUrn: string } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data } = await admin.from('linkedin_oauth_tokens')
    .select('*').order('erstellt_am', { ascending: false }).limit(1).maybeSingle()
  const row = data as LinkedInTokenRow | null
  if (!row) return { ok: false, error: 'LinkedIn nicht verbunden.' }
  if (!isExpired(row.expires_at, Date.now())) return { ok: true, token: row.access_token, orgUrn: row.organization_urn }
  const r = await refresh(row)
  if (!r.ok) return r
  return { ok: true, token: r.token, orgUrn: row.organization_urn }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/linkedin/__tests__/token.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/token.ts src/lib/linkedin/__tests__/token.test.ts
git commit -m "feat(linkedin): OAuth token store + refresh"
```

---

## Task 8: Posts API publisher

**Files:**
- Create: `src/lib/linkedin/publisher.ts`
- Test: `src/lib/linkedin/__tests__/publisher.test.ts`

**Interfaces:**
- Consumes: `LinkedInPublisher`, `LinkedInPublishInput`, `LinkedInPublishResult` (Task 2).
- Produces: `PostsApiPublisher` class (constructor `(token: string, deps?: { fetch?: typeof fetch })`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/linkedin/__tests__/publisher.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PostsApiPublisher } from '../publisher'

const INPUT = {
  authorUrn: 'urn:li:organization:123', text: 'Hallo Welt',
  link: 'https://claimondo.de/x', title: 'T', description: 'D',
}

describe('PostsApiPublisher', () => {
  it('POSTs correct shape and returns the post URN from x-restli-id', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 201, headers: { 'x-restli-id': 'urn:li:share:999' },
    }))
    const pub = new PostsApiPublisher('tok', { fetch: fetchMock as unknown as typeof fetch })
    const res = await pub.publish(INPUT)
    expect(res).toEqual({ ok: true, postUrn: 'urn:li:share:999' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.linkedin.com/rest/posts')
    expect((init as RequestInit).method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer tok')
    expect(headers['LinkedIn-Version']).toMatch(/^\d{6}$/)
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.author).toBe('urn:li:organization:123')
    expect(body.commentary).toBe('Hallo Welt')
    expect(body.content.article.source).toBe('https://claimondo.de/x')
    expect(body.lifecycleState).toBe('PUBLISHED')
  })

  it('maps API errors to { ok:false }', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 422 }))
    const pub = new PostsApiPublisher('tok', { fetch: fetchMock as unknown as typeof fetch })
    const res = await pub.publish(INPUT)
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/linkedin/__tests__/publisher.test.ts` → Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/linkedin/publisher.ts
import type { LinkedInPublisher, LinkedInPublishInput, LinkedInPublishResult } from './types'

const LINKEDIN_VERSION = '202505' // YYYYMM — bump to a currently-supported version at deploy time

export class PostsApiPublisher implements LinkedInPublisher {
  private fetchImpl: typeof fetch
  constructor(private token: string, deps: { fetch?: typeof fetch } = {}) {
    this.fetchImpl = deps.fetch ?? fetch
  }

  async publish(input: LinkedInPublishInput): Promise<LinkedInPublishResult> {
    const body = {
      author: input.authorUrn,
      commentary: input.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { article: { source: input.link, title: input.title, description: input.description } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }
    let res: Response
    try {
      res = await this.fetchImpl('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (e) {
      return { ok: false, error: `Netzwerkfehler: ${(e as Error).message}` }
    }
    if (res.status !== 201 && res.status !== 200) {
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `LinkedIn ${res.status}: ${detail.slice(0, 300)}` }
    }
    const urn = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id') ?? ''
    if (!urn) return { ok: false, error: 'Kein Post-URN in der Antwort.' }
    return { ok: true, postUrn: urn }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/linkedin/__tests__/publisher.test.ts` → Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/publisher.ts src/lib/linkedin/__tests__/publisher.test.ts
git commit -m "feat(linkedin): Posts API publisher (article-card post)"
```

---

## Task 9: Cron drip route

**Files:**
- Create: `src/app/api/cron/linkedin-drip/route.ts`

**Interfaces:**
- Consumes: `fetchFeedItems` (Task 3), `selectNextUnposted` (Task 6), `composePost` (Task 5), `createAdminClient`.
- Produces: `GET` route returning `{ ok, drafted: string | null }`.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/cron/linkedin-drip/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchFeedItems } from '@/lib/linkedin/feed-source'
import { selectNextUnposted } from '@/lib/linkedin/select-next'
import { composePost } from '@/lib/linkedin/compose'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const orgId = process.env.LINKEDIN_ORG_ID
  if (!orgId) return NextResponse.json({ error: 'LINKEDIN_ORG_ID fehlt' }, { status: 500 })
  const authorUrn = orgId.startsWith('urn:') ? orgId : `urn:li:organization:${orgId}`

  let items
  try {
    items = await fetchFeedItems()
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }

  const admin = createAdminClient()
  const { data: seenRows } = await admin.from('linkedin_posts').select('feed_guid')
  const seen = new Set((seenRows ?? []).map((r: { feed_guid: string }) => r.feed_guid))

  const next = selectNextUnposted(items, seen)
  if (!next) return NextResponse.json({ ok: true, drafted: null })

  const composed_text = await composePost(next)
  const { error } = await admin.from('linkedin_posts').insert({
    feed_guid: next.guid, feed_url: next.url, title: next.title, excerpt: next.excerpt,
    composed_text, status: 'entwurf', author_urn: authorUrn, scheduled_for: new Date().toISOString(),
  })
  // UNIQUE(feed_guid) guards against a race double-insert.
  if (error && !error.message.includes('duplicate')) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, drafted: next.guid })
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → Expected: clean. Run: `npm run build` → Expected: route compiles (it is a Route Handler — Next.js validates at build).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/linkedin-drip/route.ts
git commit -m "feat(linkedin): cron drip route (feed -> draft)"
```

---

## Task 10: OAuth helpers + callback route

**Files:**
- Create: `src/lib/linkedin/oauth.ts`
- Create: `src/app/api/auth/linkedin/callback/route.ts`
- Test: `src/lib/linkedin/__tests__/oauth.test.ts`

**Interfaces:**
- Produces: `buildAuthorizeUrl(state: string): string`, `exchangeCode(code: string): Promise<{ accessToken, refreshToken, expiresIn, scope }>`, `fetchAdminOrgUrn(token: string): Promise<string | null>`.

- [ ] **Step 1: Write the failing test (authorize URL)**

```ts
// src/lib/linkedin/__tests__/oauth.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { buildAuthorizeUrl } from '../oauth'

describe('buildAuthorizeUrl', () => {
  beforeEach(() => {
    process.env.LINKEDIN_CLIENT_ID = 'cid'
    process.env.LINKEDIN_REDIRECT_URI = 'https://app.claimondo.de/api/auth/linkedin/callback'
  })
  it('includes client_id, redirect_uri, state and org scopes', () => {
    const url = new URL(buildAuthorizeUrl('xyz'))
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('state')).toBe('xyz')
    expect(url.searchParams.get('scope')).toContain('w_organization_social')
    expect(url.searchParams.get('response_type')).toBe('code')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/linkedin/__tests__/oauth.test.ts` → Expected: FAIL.

- [ ] **Step 3: Write `oauth.ts`**

```ts
// src/lib/linkedin/oauth.ts
const SCOPES = 'openid profile email r_organization_social w_organization_social'

export function buildAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI ?? '',
    state,
    scope: SCOPES,
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${p.toString()}`
}

export async function exchangeCode(code: string) {
  const p = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI ?? '',
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
  })
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: p,
  })
  if (!res.ok) throw new Error(`Token-Tausch fehlgeschlagen: ${res.status}`)
  const j = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresIn: j.expires_in, scope: j.scope ?? null }
}

/** First org the authenticated user administers. */
export async function fetchAdminOrgUrn(token: string): Promise<string | null> {
  const res = await fetch(
    'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
    { headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': '202505', 'X-Restli-Protocol-Version': '2.0.0' } },
  )
  if (!res.ok) return null
  const j = await res.json() as { elements?: Array<{ organizationalTarget?: string }> }
  return j.elements?.[0]?.organizationalTarget ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/linkedin/__tests__/oauth.test.ts` → Expected: PASS.

- [ ] **Step 5: Write the callback route**

```ts
// src/app/api/auth/linkedin/callback/route.ts
import { NextResponse } from 'next/server'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCode, fetchAdminOrgUrn } from '@/lib/linkedin/oauth'

export async function GET(request: Request) {
  const { user } = await requirePortalAccess(['admin']) // redirects if not admin
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/admin/marketing/linkedin?error=no_code', request.url))

  try {
    const tok = await exchangeCode(code)
    const orgUrn = (process.env.LINKEDIN_ORG_ID
      ? (process.env.LINKEDIN_ORG_ID.startsWith('urn:') ? process.env.LINKEDIN_ORG_ID : `urn:li:organization:${process.env.LINKEDIN_ORG_ID}`)
      : await fetchAdminOrgUrn(tok.accessToken)) ?? ''
    if (!orgUrn) return NextResponse.redirect(new URL('/admin/marketing/linkedin?error=no_org', request.url))

    const admin = createAdminClient()
    await admin.from('linkedin_oauth_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await admin.from('linkedin_oauth_tokens').insert({
      organization_urn: orgUrn,
      access_token: tok.accessToken,
      refresh_token: tok.refreshToken,
      expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(),
      scope: tok.scope,
      connected_by: user.id,
    })
    return NextResponse.redirect(new URL('/admin/marketing/linkedin?connected=1', request.url))
  } catch (e) {
    return NextResponse.redirect(new URL(`/admin/marketing/linkedin?error=${encodeURIComponent((e as Error).message)}`, request.url))
  }
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: clean.

```bash
git add src/lib/linkedin/oauth.ts src/app/api/auth/linkedin/callback/route.ts src/lib/linkedin/__tests__/oauth.test.ts
git commit -m "feat(linkedin): OAuth authorize + callback (org token store)"
```

---

## Task 11: Admin server actions

**Files:**
- Create: `src/app/admin/marketing/linkedin/actions.ts`

**Interfaces:**
- Consumes: `getValidLinkedInToken` (Task 7), `PostsApiPublisher` (Task 8), `LinkedInPostRow` (Task 2), `buildAuthorizeUrl` (Task 10), `createAdminClient`, `requirePortalAccess`.
- Produces: `freigebenUndPosten(id)`, `entwurfBearbeiten(id, text)`, `ueberspringen(id)`, `linkedInTrennen()`, `startLinkedInConnect()` — all returning `{ ok: boolean; error?: string }` (except `startLinkedInConnect` which redirects).

- [ ] **Step 1: Write the actions file**

```ts
// src/app/admin/marketing/linkedin/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidLinkedInToken } from '@/lib/linkedin/token'
import { PostsApiPublisher } from '@/lib/linkedin/publisher'
import { buildAuthorizeUrl } from '@/lib/linkedin/oauth'
import type { LinkedInPostRow } from '@/lib/linkedin/types'

const QUEUE_PATH = '/admin/marketing/linkedin'

async function alertAdmins(titel: string, inhalt: string) {
  try {
    const admin = createAdminClient()
    const { data: admins } = await admin.from('profiles').select('id').eq('rolle', 'admin')
    if (admins && admins.length > 0) {
      const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
      await createMitteilungMulti(
        admins.map((a: { id: string }) => ({ id: a.id, rolle: 'admin' as const })),
        { kategorie: 'task', titel, inhalt, route_url: QUEUE_PATH, icon: 'bell', prioritaet: 'normal' },
      )
    }
  } catch (e) {
    console.error('[linkedin] admin alert failed:', e)
  }
}

export async function freigebenUndPosten(id: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['admin'])
  const admin = createAdminClient()
  const { data } = await admin.from('linkedin_posts').select('*').eq('id', id).maybeSingle()
  const row = data as LinkedInPostRow | null
  if (!row) return { ok: false, error: 'Entwurf nicht gefunden.' }
  if (row.status === 'veroeffentlicht') return { ok: false, error: 'Bereits veröffentlicht.' }

  const tok = await getValidLinkedInToken()
  if (!tok.ok) return { ok: false, error: tok.error }

  const publisher = new PostsApiPublisher(tok.token)
  const res = await publisher.publish({
    authorUrn: row.author_urn, text: row.composed_text, link: row.feed_url,
    title: row.title, description: row.excerpt ?? '',
  })

  if (!res.ok) {
    await admin.from('linkedin_posts').update({ status: 'fehlgeschlagen', fehler: res.error }).eq('id', id)
    await alertAdmins('LinkedIn-Post fehlgeschlagen', `„${row.title}" konnte nicht veröffentlicht werden: ${res.error}`)
    revalidatePath(QUEUE_PATH)
    return { ok: false, error: res.error }
  }

  await admin.from('linkedin_posts').update({
    status: 'veroeffentlicht', linkedin_post_urn: res.postUrn,
    published_at: new Date().toISOString(), freigegeben_von: user.id, freigegeben_am: new Date().toISOString(),
    fehler: null,
  }).eq('id', id)
  revalidatePath(QUEUE_PATH)
  return { ok: true }
}

export async function entwurfBearbeiten(id: string, text: string): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['admin'])
  if (!text.trim()) return { ok: false, error: 'Text darf nicht leer sein.' }
  const admin = createAdminClient()
  const { error } = await admin.from('linkedin_posts').update({ composed_text: text }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(QUEUE_PATH)
  return { ok: true }
}

export async function ueberspringen(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['admin'])
  const admin = createAdminClient()
  const { error } = await admin.from('linkedin_posts').update({ status: 'uebersprungen' }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(QUEUE_PATH)
  return { ok: true }
}

export async function linkedInTrennen(): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['admin'])
  const admin = createAdminClient()
  const { error } = await admin.from('linkedin_oauth_tokens').delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) return { ok: false, error: error.message }
  revalidatePath(QUEUE_PATH)
  return { ok: true }
}

export async function startLinkedInConnect(): Promise<void> {
  await requirePortalAccess(['admin'])
  redirect(buildAuthorizeUrl('claimondo-linkedin'))
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → Expected: clean (constants/types are NOT exported from this `'use server'` file — only async actions; per AAR-664).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/marketing/linkedin/actions.ts
git commit -m "feat(linkedin): admin server actions (approve/publish, edit, skip, connect)"
```

---

## Task 12: Admin UI pages + nav

**Files:**
- Create: `src/app/admin/marketing/page.tsx`
- Create: `src/app/admin/marketing/linkedin/page.tsx`
- Create: `src/app/admin/marketing/linkedin/LinkedInQueueClient.tsx`
- Modify: `src/app/admin/_components/AdminNav.tsx` (+1 nav item)

**Interfaces:**
- Consumes: actions (Task 11), `LinkedInPostRow` (Task 2), `createAdminClient`.

- [ ] **Step 1: Add the nav item**

In `src/app/admin/_components/AdminNav.tsx`: add `Share2Icon` to the lucide import, and add this entry to `NAV_ITEMS` after the Embed-Sites line:

```ts
  { href: '/admin/marketing', label: 'Marketing', icon: Share2Icon },
```

- [ ] **Step 2: Marketing landing page**

```tsx
// src/app/admin/marketing/page.tsx
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'

export default function MarketingPage() {
  return (
    <div className="space-y-6 py-6">
      <PageHeader title="Marketing" subtitle="Automatisierte Kanäle & Freigaben" />
      <Link href="/admin/marketing/linkedin" className="block">
        <SectionCard className="hover:bg-claimondo-bg/60 transition-colors">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">LinkedIn Auto-Posting</h2>
          <p className="text-body-sm text-claimondo-slate mt-1">
            Entwürfe aus dem Wissens-Feed prüfen und auf die Company-Page freigeben.
          </p>
        </SectionCard>
      </Link>
    </div>
  )
}
```

> If `PageHeader`/`SectionCard` import paths differ, resolve via `@/components/shared` barrel; keep the component-set rule (no hand-rolled card).

- [ ] **Step 3: Queue server component**

```tsx
// src/app/admin/marketing/linkedin/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeader } from '@/components/shared/PageHeader'
import { LinkedInQueueClient } from './LinkedInQueueClient'
import type { LinkedInPostRow } from '@/lib/linkedin/types'

export const dynamic = 'force-dynamic'

export default async function LinkedInQueuePage() {
  const admin = createAdminClient()
  const { data: posts } = await admin.from('linkedin_posts')
    .select('*').order('erstellt_am', { ascending: false }).limit(100)
  const { data: token } = await admin.from('linkedin_oauth_tokens')
    .select('organization_urn, expires_at').maybeSingle()

  return (
    <div className="space-y-6 py-6">
      <PageHeader title="LinkedIn" subtitle="Auto-Posting Freigabe-Queue" />
      <LinkedInQueueClient
        posts={(posts ?? []) as LinkedInPostRow[]}
        connection={token ? { orgUrn: token.organization_urn as string, expiresAt: token.expires_at as string } : null}
      />
    </div>
  )
}
```

- [ ] **Step 4: Queue client component**

```tsx
// src/app/admin/marketing/linkedin/LinkedInQueueClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { LinkedInPostRow } from '@/lib/linkedin/types'
import { freigebenUndPosten, entwurfBearbeiten, ueberspringen, linkedInTrennen, startLinkedInConnect } from './actions'

export function LinkedInQueueClient({
  posts, connection,
}: { posts: LinkedInPostRow[]; connection: { orgUrn: string; expiresAt: string } | null }) {
  const entwuerfe = posts.filter((p) => p.status === 'entwurf')
  const verlauf = posts.filter((p) => p.status !== 'entwurf')

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-body font-semibold text-claimondo-navy">Verbindung</h3>
            <p className="text-body-sm text-claimondo-slate">
              {connection
                ? `Verbunden: ${connection.orgUrn} · Token gültig bis ${new Date(connection.expiresAt).toLocaleDateString('de-DE')}`
                : 'Nicht verbunden.'}
            </p>
          </div>
          <form action={startLinkedInConnect}>
            <Button type="submit" variant={connection ? 'secondary' : 'primary'}>
              {connection ? 'Neu verbinden' : 'LinkedIn verbinden'}
            </Button>
          </form>
        </div>
      </SectionCard>

      <div className="space-y-4">
        <h3 className="text-heading-sm font-semibold text-claimondo-navy">Entwürfe ({entwuerfe.length})</h3>
        {entwuerfe.length === 0 && <p className="text-body-sm text-claimondo-slate">Keine offenen Entwürfe.</p>}
        {entwuerfe.map((p) => <EntwurfCard key={p.id} post={p} />)}
      </div>

      <div className="space-y-3">
        <h3 className="text-heading-sm font-semibold text-claimondo-navy">Verlauf</h3>
        {verlauf.map((p) => (
          <SectionCard key={p.id} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-claimondo-navy truncate">{p.title}</p>
              {p.fehler && <p className="text-body-xs text-danger-strong truncate">{p.fehler}</p>}
            </div>
            <StatusBadge status={p.status} />
          </SectionCard>
        ))}
      </div>
    </div>
  )
}

function EntwurfCard({ post }: { post: LinkedInPostRow }) {
  const [text, setText] = useState(post.composed_text)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn()
      if (r.ok) toast.success(okMsg)
      else toast.error(r.error ?? 'Fehler')
    })

  return (
    <SectionCard className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body font-semibold text-claimondo-navy">{post.title}</p>
        <StatusBadge status={post.status} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full rounded-ios-md border border-claimondo-border p-3 text-body-sm"
      />
      <p className="text-body-xs text-claimondo-slate truncate">{post.feed_url}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={pending}
          onClick={() => run(() => entwurfBearbeiten(post.id, text), 'Text gespeichert')}>
          Speichern
        </Button>
        <Button variant="primary" loading={pending}
          onClick={() => run(() => freigebenUndPosten(post.id), 'Veröffentlicht')}>
          Freigeben & posten
        </Button>
        <Button variant="ghost" loading={pending}
          onClick={() => run(() => ueberspringen(post.id), 'Übersprungen')}>
          Überspringen
        </Button>
      </div>
    </SectionCard>
  )
}
```

> **Component-set check at execution:** confirm exact import paths/props for `Button` (`@/components/primitives/Button` — `variant`: `primary|secondary|ghost`, `loading`, `onClick`), `SectionCard`, `StatusBadge`, `PageHeader` against the live barrels. `StatusBadge` may need a label/variant map for the four `PostStatus` values — add one if it doesn't accept a raw status string. Keep status colors on tokens (`text-danger-strong` etc.), never raw Tailwind scales.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` then `npm run build` → Expected: both clean (full build because routes/layouts changed).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/marketing src/app/admin/_components/AdminNav.tsx
git commit -m "feat(linkedin): admin Marketing section + LinkedIn freigabe queue UI"
```

---

## Task 13: ENV + crontab docs

**Files:**
- Modify: `.env.example` (append keys)
- Create: `docs/linkedin-auto-posting-setup.md` (Aaron's one-time steps)

- [ ] **Step 1: Append to `.env.example`**

```bash
# LinkedIn Auto-Posting (Company-Page)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ORG_ID=            # numeric id or urn:li:organization:<id>
LINKEDIN_REDIRECT_URI=https://app.claimondo.de/api/auth/linkedin/callback
MARKETING_FEED_URL=https://claimondo.de/feed.json
```

- [ ] **Step 2: Write `docs/linkedin-auto-posting-setup.md`**

Content: the 4 LinkedIn Developer Portal steps (create app, verify against Page as admin, request „Sign In with OpenID Connect" + „Community Management API", connect via `/admin/marketing/linkedin`), plus the crontab line:

```
0 7 * * 1,3,5 curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/linkedin-drip
```

- [ ] **Step 3: Run the full test suite + typecheck**

Run: `npx vitest run src/lib/linkedin` → Expected: all linkedin tests PASS.
Run: `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/linkedin-auto-posting-setup.md
git commit -m "docs(linkedin): ENV keys + one-time setup + crontab"
```

---

## Self-Review (completed during planning)

**Spec coverage:** §4 flow → Tasks 3/5/6/9 (drip) + 11 (approve/publish). §5.1 table → Task 1 (+ `excerpt` col). §5.2 token table → Task 1. §6 OAuth → Tasks 7/10. §7 composer → Tasks 4/5. §8 publisher → Task 8. §9 cron → Task 9. §10 admin UI → Tasks 11/12. §11 error/alerts → Task 11 (`alertAdmins`). §12 tests → Tasks 3–8/10. §13 ENV/setup → Task 13. ✅ all covered.

**Type consistency:** `LinkedInPostRow`/`LinkedInFeedItem`/`LinkedInPublishInput`/`LinkedInPublisher` defined in Task 2, consumed verbatim in 3/5/6/7/8/9/11/12. `getValidLinkedInToken` returns `{ token, orgUrn }` — consumed in Task 11. `PostsApiPublisher(token, {fetch})` — consumed in Task 11. ✅

**Open execution-time confirmations (flagged inline, not placeholders):** exact LinkedIn-Version month (Task 8); `StatusBadge`/`PageHeader`/`SectionCard` prop shapes (Task 12) — resolve against live barrels, the logic is complete.

## Risks / Notes

- **External blocker:** LinkedIn „Community Management API" approval (Aaron) gates *publish*, not the rest. Until then Tasks 1–7,9–13 run; only `freigebenUndPosten` returns the „nicht verbunden"/scope error.
- **database.types.ts** intentionally not regenerated (local row types) — schedule a regen follow-up once parallel sessions settle.
- **feed.json contract:** depends on `id/url/title/summary/date_published/_claimondo.keyFacts`. Coordinate with `kitta/marketing-feed-audit-fixes` if those fields move.
