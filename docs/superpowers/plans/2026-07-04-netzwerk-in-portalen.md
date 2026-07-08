# „Netzwerk" — B2B-Community-Feed in den Portalen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SV-, Makler- und Werkstatt-Partner erreichen im eingeloggten Portal einen „Netzwerk"-Feed (Posts + b2b-Artikel), können posten/kommentieren/liken im X-/YouTube-Stil (Top-Kommentare + Top-Thread-Antworten default), plus ein kompaktes Dashboard-Widget.

**Architecture:** Ein geteiltes Modul — Datenschicht `src/lib/community/*` (portiert aus `claimondo-marketing/lib/community/*`, angepasst auf den authentifizierten App-SSR-Client + `42P01`-Guard) und UI `src/components/shared/netzwerk/*` — wird als dünne Seite in jedes der 3 Portale gemountet. **0 DB-Migration:** 100 % Reuse der existierenden RPCs (`create_community_post`, `create_community_comment`, `toggle_like`, `report_target`), alle `SECURITY DEFINER` + an `authenticated` granted.

**Tech Stack:** Next.js 15 (App Router, Server Components + Server Actions), Supabase (`@/lib/supabase/server`), TypeScript, vitest, App-Komponenten-Set (`@/components/primitives`, `@/components/shared/*`, `@/components/ui/Chip`), lucide-react.

## Global Constraints

- **Branch/Worktree:** `kitta/netzwerk-in-portalen` (off `origin/main`), Worktree `.claude/worktrees/netzwerk-in-portalen`. **Nie auf main pushen** (Regel 1). Merge-Target = `staging`.
- **0 DDL / 0 Migration** (Regel 2). Bestehende community-Migrationsfiles **nicht** anfassen. `execute_sql` nur READ.
- **Server-Actions:** `'use server'`, Rückgabe `{ ok: boolean; error?: string }` (kein `throw`), **nur async-Exports** (AAR-664, keine Konstanten/Types exportieren), jede Mutation `revalidatePath(...)`.
- **Komponenten-Set:** keine handgerollten Buttons/Cards — `@/components/primitives` (`Button`, `Card`, `Badge`), `@/components/shared/SectionCard`/`EmptyState`, `@/components/ui/Chip`. Ratchets `check:component-set`/`check:knip`/`check:token-audit` müssen 0 neue Verstöße zeigen.
- **Tokens:** `bg-claimondo-*`/`text-claimondo-*`, `rounded-ios-{sm,md,lg,xl}`, `text-body*`/`text-heading-*`, Status `bg-success`/`-warning`/`-danger`/`-info`. Kein Inline-Hex, keine raw Tailwind-Farbskalen/-Radien.
- **Umlaute:** alle nutzersichtbaren UI-Strings mit echten `ä/ö/ü/ß`.
- **RPC-Namen/Args (verbatim, Prod-verifiziert):** `create_community_post(p_body text, p_tags text[])` · `create_community_comment(p_target_kind text, p_target_id uuid, p_body text, p_parent_id uuid)` (`p_target_kind IN ('post','wissen')`; 2-Ebenen-Regel DB-erzwungen) · `toggle_like(p_target_kind text, p_target_id uuid)` (`IN ('post','wissen','comment')`) · `report_target(p_kind text, p_id uuid)` · `report_comment(p_comment_id uuid)`.
- **Kind-Mapping:** Feed-`kind` `'artikel'` ↔ RPC/Tabellen-`target_kind` `'wissen'`; `'post'` ↔ `'post'`.

---

## File Structure

**Neu — Datenschicht `src/lib/community/`:**
- `tags.ts` — `B2B_TAGS`, `isValidTag` (Port, pure).
- `feed.ts` — Typen (`FeedEntry`, `NetzwerkEntry`), `mergeFeed` (pure), `getNetzwerkFeed`, `getUserLikedKeys` (Port + Cookie-Client + `42P01`-Guard).
- `threads.ts` — `getThread`, `rankTopComments` (pure, NEU), `getTopCommentsPreview` (NEU).
- `actions.ts` — `'use server'`: `postBeitrag`, `postKommentar`, `toggleGefaelltMir`, `melden`, `ladeThread` (Port + Portal-`revalidatePath`).
- `tags.test.ts`, `feed.test.ts`, `threads.test.ts` — vitest.

**Neu — UI `src/components/shared/netzwerk/`:**
- `types.ts` — geteilte Client-Typen (kein 'use server').
- `LikeButton.tsx`, `PostComposer.tsx`, `CommentComposer.tsx`, `TopComments.tsx`, `CommentThread.tsx`, `FeedCard.tsx`, `NetzwerkFeed.tsx` (Client), `NetzwerkWidget.tsx` (Server).

**Neu — Portal-Mounts:**
- `src/app/gutachter/netzwerk/page.tsx`
- `src/app/makler/(shell)/netzwerk/page.tsx`
- `src/app/werkstatt/(shell)/netzwerk/page.tsx`

**Modifiziert — Nav + Dashboards:**
- `src/app/gutachter/GutachterShell.tsx` (Nav-Item; in gerenderte Section, nicht den `'Geschäft'`-Block).
- `src/components/makler/MaklerShell.tsx` (Nav-Item).
- `src/components/werkstatt/WerkstattShell.tsx` (Nav-Item).
- `src/app/makler/(shell)/page.tsx` (Widget-Mount).
- `src/app/werkstatt/(shell)/page.tsx` (Widget ersetzt Explainer-`<section>`).
- `src/app/werkstatt/(shell)/promo/page.tsx` (Explainer-Umzug).

**Port-Referenzen (im Worktree lesbar, NICHT importierbar — anderer Build):** `claimondo-marketing/lib/community/{community-queries,community-actions,tags,thread-loader}.ts` + `claimondo-marketing/components/community/{CommunityFeedClient,PostCard,PostComposer,PostComments,LikeButton}.tsx`.

---

### Task 1: `tags.ts` — B2B-Tag-Katalog

**Files:**
- Create: `src/lib/community/tags.ts`
- Test: `src/lib/community/tags.test.ts`

**Interfaces:**
- Produces: `B2B_TAGS: readonly string[]`, `type B2BTag`, `isValidTag(t: string): t is B2BTag`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/community/tags.test.ts
import { describe, it, expect } from 'vitest'
import { B2B_TAGS, isValidTag } from './tags'

describe('tags', () => {
  it('enthält die 7 B2B-Tags', () => {
    expect(B2B_TAGS).toContain('Recht & Urteile')
    expect(B2B_TAGS).toHaveLength(7)
  })
  it('isValidTag akzeptiert gültige und lehnt ungültige ab', () => {
    expect(isValidTag('Gutachten')).toBe(true)
    expect(isValidTag('Quatsch')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/community/tags.test.ts`
Expected: FAIL — cannot find module `./tags`.

- [ ] **Step 3: Write minimal implementation** (Port aus `claimondo-marketing/lib/community/tags.ts`)

```typescript
// src/lib/community/tags.ts
export const B2B_TAGS = [
  'Schadenregulierung',
  'Recht & Urteile',
  'Gutachten',
  'Werkstatt',
  'Versicherer',
  'Markt & News',
  'Tools',
] as const

export type B2BTag = (typeof B2B_TAGS)[number]

export function isValidTag(t: string): t is B2BTag {
  return (B2B_TAGS as readonly string[]).includes(t)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/community/tags.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/lib/community/tags.ts src/lib/community/tags.test.ts
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): B2B-Tag-Katalog (Port) + Test"
```

---

### Task 2: `feed.ts` — Feed-Query (Cookie-Client + Graceful Guard)

**Files:**
- Create: `src/lib/community/feed.ts`
- Test: `src/lib/community/feed.test.ts`

**Interfaces:**
- Consumes: `@/lib/supabase/server` `createClient`.
- Produces:
  - `type FeedEntry = { kind: 'artikel'|'post'; id: string; title: string|null; body: string; authorDisplay: string; isRedaktion: boolean; tags: string[]; createdAt: string; likeCount: number; commentCount: number; slug: string|null }`
  - `mergeFeed(a: FeedEntry[], b: FeedEntry[]): FeedEntry[]`
  - `getNetzwerkFeed(opts?: { tag?: string; limit?: number }): Promise<FeedEntry[]>`
  - `getUserLikedKeys(entries: FeedEntry[]): Promise<string[]>` (Keys `"${target_kind}:${id}"`, target_kind ∈ `wissen|post`)

- [ ] **Step 1: Write the failing test** (pure `mergeFeed` + Guard-Verhalten)

```typescript
// src/lib/community/feed.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mergeFeed, type FeedEntry } from './feed'

const mk = (id: string, createdAt: string, kind: FeedEntry['kind'] = 'post'): FeedEntry => ({
  kind, id, title: null, body: 'x', authorDisplay: 'A', isRedaktion: false,
  tags: [], createdAt, likeCount: 0, commentCount: 0, slug: null,
})

describe('mergeFeed', () => {
  it('sortiert nach createdAt desc', () => {
    const out = mergeFeed([mk('a', '2026-01-01T00:00:00Z')], [mk('b', '2026-02-01T00:00:00Z')])
    expect(out.map(e => e.id)).toEqual(['b', 'a'])
  })
  it('ist leer bei zwei leeren Eingaben', () => {
    expect(mergeFeed([], [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/community/feed.test.ts` → Expected: FAIL — module `./feed` not found.

- [ ] **Step 3: Write implementation** (Port aus `community-queries.ts`; **Änderungen ggü. Marketing:** (a) `createClient()` Cookie-Client statt Anon; (b) `opts.limit` slice; (c) `42P01`-Guard → `[]` bei fehlender Tabelle)

```typescript
// src/lib/community/feed.ts
import { createClient } from '@/lib/supabase/server'

export type FeedEntry = {
  kind: 'artikel' | 'post'
  id: string
  title: string | null
  body: string
  authorDisplay: string
  isRedaktion: boolean
  tags: string[]
  createdAt: string
  likeCount: number
  commentCount: number
  slug: string | null
}

// Pure: mergbar + testbar ohne DB.
export function mergeFeed(a: FeedEntry[], b: FeedEntry[]): FeedEntry[] {
  return [...a, ...b].sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
  )
}

// Graceful: fehlt eine community-Tabelle (Staging noch nicht migriert), Code 42P01 → leer.
function isMissingRelation(err: { code?: string } | null): boolean {
  return err?.code === '42P01'
}

function countById(rows: Array<{ target_id: string }> | null): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of rows ?? []) map[r.target_id] = (map[r.target_id] ?? 0) + 1
  return map
}

export async function getNetzwerkFeed(
  opts: { tag?: string; limit?: number } = {},
): Promise<FeedEntry[]> {
  const supabase = await createClient()
  const { tag, limit } = opts

  let artikelQuery = supabase
    .from('wissen_artikel')
    .select('id, title, body, excerpt, slug, tags, last_modified, veroeffentlicht_am, created_at')
    .eq('status', 'veroeffentlicht')
    .eq('audience', 'b2b')
    .order('last_modified', { ascending: false })
    .order('veroeffentlicht_am', { ascending: false })
  if (tag) artikelQuery = artikelQuery.contains('tags', [tag])

  let postsQuery = supabase
    .from('community_posts')
    .select('id, body, author_display, tags, created_at')
    .eq('status', 'sichtbar')
    .order('created_at', { ascending: false })
  if (tag) postsQuery = postsQuery.contains('tags', [tag])

  const [{ data: artikelData, error: artikelError }, { data: postsData, error: postsError }] =
    await Promise.all([artikelQuery, postsQuery])

  if (isMissingRelation(artikelError) || isMissingRelation(postsError)) return []
  if (artikelError) console.error('[netzwerk] feed artikel:', artikelError.message)
  if (postsError) console.error('[netzwerk] feed posts:', postsError.message)

  const artikelRows = (artikelData ?? []) as Array<{
    id: string; title: string; body: string; excerpt: string | null; slug: string
    tags: string[]; last_modified: string | null; veroeffentlicht_am: string | null; created_at: string | null
  }>
  const postRows = (postsData ?? []) as Array<{
    id: string; body: string; author_display: string; tags: string[]; created_at: string
  }>

  const artikelIds = artikelRows.map(r => r.id)
  const postIds = postRows.map(r => r.id)
  if (artikelIds.length + postIds.length === 0) return []

  const [{ data: artikelLikes }, { data: postLikes }] = await Promise.all([
    artikelIds.length ? supabase.from('community_likes').select('target_id').eq('target_kind', 'wissen').in('target_id', artikelIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_likes').select('target_id').eq('target_kind', 'post').in('target_id', postIds) : Promise.resolve({ data: [] }),
  ])
  const [{ data: artikelComments }, { data: postComments }] = await Promise.all([
    artikelIds.length ? supabase.from('community_comments').select('target_id').eq('target_kind', 'wissen').eq('status', 'sichtbar').in('target_id', artikelIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_comments').select('target_id').eq('target_kind', 'post').eq('status', 'sichtbar').in('target_id', postIds) : Promise.resolve({ data: [] }),
  ])

  const aLike = countById(artikelLikes as Array<{ target_id: string }> | null)
  const pLike = countById(postLikes as Array<{ target_id: string }> | null)
  const aCom = countById(artikelComments as Array<{ target_id: string }> | null)
  const pCom = countById(postComments as Array<{ target_id: string }> | null)

  const FALLBACK = '2024-01-01T00:00:00Z'
  const artikelEntries: FeedEntry[] = artikelRows.map(r => ({
    kind: 'artikel', id: r.id, title: r.title, body: r.excerpt ?? r.body,
    authorDisplay: 'Claimondo Redaktion', isRedaktion: true, tags: r.tags ?? [],
    createdAt: r.last_modified ?? r.veroeffentlicht_am ?? r.created_at ?? FALLBACK,
    likeCount: aLike[r.id] ?? 0, commentCount: aCom[r.id] ?? 0, slug: r.slug,
  }))
  const postEntries: FeedEntry[] = postRows.map(r => ({
    kind: 'post', id: r.id, title: null, body: r.body, authorDisplay: r.author_display,
    isRedaktion: false, tags: r.tags ?? [], createdAt: r.created_at,
    likeCount: pLike[r.id] ?? 0, commentCount: pCom[r.id] ?? 0, slug: null,
  }))

  const merged = mergeFeed(artikelEntries, postEntries)
  return limit ? merged.slice(0, limit) : merged
}

export async function getUserLikedKeys(entries: FeedEntry[]): Promise<string[]> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []
  const ids = entries.map(e => e.id)
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('community_likes').select('target_kind, target_id')
    .eq('user_id', auth.user.id).in('target_id', ids)
  if (isMissingRelation(error)) return []
  if (error) { console.error('[netzwerk] likedKeys:', error.message); return [] }
  return (data ?? []).map((r: { target_kind: string; target_id: string }) => `${r.target_kind}:${r.target_id}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/community/feed.test.ts` → Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/lib/community/feed.ts src/lib/community/feed.test.ts
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): Feed-Query (Cookie-Client + 42P01-Guard) + mergeFeed-Test"
```

---

### Task 3: `threads.ts` — Thread-Load + Top-Kommentar-Preview (NEU, X/YouTube)

**Files:**
- Create: `src/lib/community/threads.ts`
- Test: `src/lib/community/threads.test.ts`

**Interfaces:**
- Consumes: `@/lib/supabase/server` `createClient`; `FeedEntry` aus `./feed`.
- Produces:
  - `type CommentRow = { id: string; authorDisplay: string; authorKind: string; isRedaktion: boolean; body: string; parentId: string|null; createdAt: string; likeCount: number }`
  - `type CommentPreview = { comment: CommentRow; topReply: CommentRow | null; replyCount: number }`
  - `rankTopComments(top: CommentRow[], repliesByParent: Record<string, CommentRow[]>, maxComments?: number): CommentPreview[]` (pure)
  - `getThread(targetKind: 'post'|'wissen', targetId: string): Promise<{ top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }>`
  - `getTopCommentsPreview(entries: FeedEntry[]): Promise<Record<string, CommentPreview[]>>` (Key `"${kind}:${id}"`, kind = Feed-kind `artikel|post`)

- [ ] **Step 1: Write the failing test** (pure Ranking — Top-2 nach Likes, Tiebreak neueste; Top-Antwort nach Likes)

```typescript
// src/lib/community/threads.test.ts
import { describe, it, expect } from 'vitest'
import { rankTopComments, type CommentRow } from './threads'

const c = (id: string, likeCount: number, createdAt: string, parentId: string | null = null): CommentRow => ({
  id, authorDisplay: 'A', authorKind: 'partner', isRedaktion: false, body: id, parentId, createdAt, likeCount,
})

describe('rankTopComments', () => {
  it('nimmt Top-2 Kommentare nach Likes, Tiebreak neueste', () => {
    const top = [
      c('a', 1, '2026-01-01T00:00:00Z'),
      c('b', 5, '2026-01-01T00:00:00Z'),
      c('c', 5, '2026-02-01T00:00:00Z'),
    ]
    const out = rankTopComments(top, {})
    expect(out.map(p => p.comment.id)).toEqual(['c', 'b']) // 5&5 -> neuere zuerst, dann 'b'
  })
  it('wählt je Kommentar die Top-Antwort nach Likes + zählt Antworten', () => {
    const top = [c('a', 0, '2026-01-01T00:00:00Z')]
    const replies = { a: [c('r1', 2, '2026-01-02T00:00:00Z', 'a'), c('r2', 9, '2026-01-03T00:00:00Z', 'a')] }
    const out = rankTopComments(top, replies)
    expect(out[0].topReply?.id).toBe('r2')
    expect(out[0].replyCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/community/threads.test.ts` → Expected: FAIL — module `./threads` not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/community/threads.ts
import { createClient } from '@/lib/supabase/server'
import type { FeedEntry } from './feed'

export type CommentRow = {
  id: string; authorDisplay: string; authorKind: string; isRedaktion: boolean
  body: string; parentId: string | null; createdAt: string; likeCount: number
}
export type CommentPreview = { comment: CommentRow; topReply: CommentRow | null; replyCount: number }

function isMissingRelation(err: { code?: string } | null): boolean {
  return err?.code === '42P01'
}
// Sort desc nach Likes, Tiebreak neueste (createdAt desc).
function byTop(a: CommentRow, b: CommentRow): number {
  if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

// Pure: Top-N Kommentare + je Top-Antwort. Testbar ohne DB.
export function rankTopComments(
  top: CommentRow[],
  repliesByParent: Record<string, CommentRow[]>,
  maxComments = 2,
): CommentPreview[] {
  return [...top].sort(byTop).slice(0, maxComments).map(comment => {
    const replies = repliesByParent[comment.id] ?? []
    const topReply = replies.length ? [...replies].sort(byTop)[0] : null
    return { comment, topReply, replyCount: replies.length }
  })
}

const mapRow = (r: {
  id: string; author_display: string; author_kind: string; body: string
  parent_id: string | null; created_at: string
}, likeCount: number): CommentRow => ({
  id: r.id, authorDisplay: r.author_display, authorKind: r.author_kind,
  isRedaktion: r.author_kind === 'admin', body: r.body, parentId: r.parent_id,
  createdAt: r.created_at, likeCount,
})

async function loadCommentLikeCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  commentIds: string[],
): Promise<Record<string, number>> {
  if (!commentIds.length) return {}
  const { data } = await supabase
    .from('community_likes').select('target_id')
    .eq('target_kind', 'comment').in('target_id', commentIds)
  const m: Record<string, number> = {}
  for (const r of (data ?? []) as Array<{ target_id: string }>) m[r.target_id] = (m[r.target_id] ?? 0) + 1
  return m
}

export async function getThread(
  targetKind: 'post' | 'wissen',
  targetId: string,
): Promise<{ top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('community_comments')
    .select('id, author_display, author_kind, body, parent_id, created_at')
    .eq('target_kind', targetKind).eq('target_id', targetId).eq('status', 'sichtbar')
    .order('created_at', { ascending: true })
  if (isMissingRelation(error) || error) {
    if (error && !isMissingRelation(error)) console.error('[netzwerk] getThread:', error.message)
    return { top: [], repliesByParent: {} }
  }
  const rows = (data ?? []) as Array<{
    id: string; author_display: string; author_kind: string; body: string; parent_id: string | null; created_at: string
  }>
  const likeCounts = await loadCommentLikeCounts(supabase, rows.map(r => r.id))
  const top: CommentRow[] = []
  const repliesByParent: Record<string, CommentRow[]> = {}
  for (const r of rows) {
    const mapped = mapRow(r, likeCounts[r.id] ?? 0)
    if (r.parent_id === null) top.push(mapped)
    else (repliesByParent[r.parent_id] ??= []).push(mapped)
  }
  return { top, repliesByParent }
}

// Batch: pro Feed-Eintrag Top-2 Kommentare + Top-Antwort. Key "${kind}:${id}".
export async function getTopCommentsPreview(
  entries: FeedEntry[],
): Promise<Record<string, CommentPreview[]>> {
  const supabase = await createClient()
  const artikelIds = entries.filter(e => e.kind === 'artikel').map(e => e.id)
  const postIds = entries.filter(e => e.kind === 'post').map(e => e.id)
  if (!artikelIds.length && !postIds.length) return {}

  const [{ data: aData, error: aErr }, { data: pData, error: pErr }] = await Promise.all([
    artikelIds.length ? supabase.from('community_comments').select('id, target_kind, target_id, author_display, author_kind, body, parent_id, created_at').eq('target_kind', 'wissen').eq('status', 'sichtbar').in('target_id', artikelIds) : Promise.resolve({ data: [], error: null }),
    postIds.length ? supabase.from('community_comments').select('id, target_kind, target_id, author_display, author_kind, body, parent_id, created_at').eq('target_kind', 'post').eq('status', 'sichtbar').in('target_id', postIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (isMissingRelation(aErr) || isMissingRelation(pErr)) return {}

  const rows = [...(aData ?? []), ...(pData ?? [])] as Array<{
    id: string; target_kind: string; target_id: string; author_display: string
    author_kind: string; body: string; parent_id: string | null; created_at: string
  }>
  const likeCounts = await loadCommentLikeCounts(supabase, rows.map(r => r.id))

  // Gruppiere pro Feed-Key (kind:id). target_kind 'wissen' -> Feed-kind 'artikel'.
  const feedKind = (tk: string) => (tk === 'wissen' ? 'artikel' : 'post')
  const grouped: Record<string, { top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }> = {}
  for (const r of rows) {
    const key = `${feedKind(r.target_kind)}:${r.target_id}`
    ;(grouped[key] ??= { top: [], repliesByParent: {} })
    const mapped = mapRow(r, likeCounts[r.id] ?? 0)
    if (r.parent_id === null) grouped[key].top.push(mapped)
    else (grouped[key].repliesByParent[r.parent_id] ??= []).push(mapped)
  }
  const out: Record<string, CommentPreview[]> = {}
  for (const [key, { top, repliesByParent }] of Object.entries(grouped)) {
    out[key] = rankTopComments(top, repliesByParent)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/community/threads.test.ts` → Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/lib/community/threads.ts src/lib/community/threads.test.ts
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): Thread-Load + Top-Kommentar/Antwort-Ranking (X/YouTube) + Tests"
```

---

### Task 4: `actions.ts` — Server-Actions (RPC-Wrapper, Portal-Revalidate)

**Files:**
- Create: `src/lib/community/actions.ts`
- Test: `src/lib/community/actions.test.ts`

**Interfaces:**
- Consumes: `@/lib/supabase/server` `createClient`; `getThread` aus `./threads`.
- Produces (`'use server'`, nur async): `postBeitrag(body, tags)`, `postKommentar(targetKind, targetId, body, parentId?)`, `toggleGefaelltMir(targetKind, targetId)`, `melden(kind, id)`, `ladeThread(targetKind, targetId)`. Alle `{ ok, ... }`.

- [ ] **Step 1: Write the failing test** (Fehler-Mapping pure — via exportiertem Helper? Nein: nur async erlaubt. Stattdessen Verhaltens-Test mit gemocktem Supabase.)

```typescript
// src/lib/community/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { postBeitrag, toggleGefaelltMir } from './actions'

beforeEach(() => { rpc.mockReset(); getUser.mockReset() })

describe('netzwerk actions', () => {
  it('postBeitrag ohne Login → ok:false', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await postBeitrag('hi', [])).toEqual({ ok: false, error: 'Bitte zuerst anmelden.' })
  })
  it('postBeitrag mappt RPC-Fehler (entfernt P0001-Prefix)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    rpc.mockResolvedValue({ error: { message: 'P0001: Zu viele Beiträge in kurzer Zeit' } })
    expect(await postBeitrag('hi', [])).toEqual({ ok: false, error: 'Zu viele Beiträge in kurzer Zeit' })
  })
  it('toggleGefaelltMir liefert nowLiked', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await toggleGefaelltMir('post', 'p1')).toEqual({ ok: true, nowLiked: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/community/actions.test.ts` → Expected: FAIL — module `./actions` not found.

- [ ] **Step 3: Write implementation** (Port aus `community-actions.ts` + `thread-loader.ts`; **Änderung:** `revalidatePath('/')` → Portal-Routen. `mapRpcError` bleibt lokal, nicht exportiert.)

```typescript
// src/lib/community/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getThread } from './threads'
import type { CommentRow } from './threads'

const NETZWERK_ROUTES = ['/gutachter/netzwerk', '/makler/netzwerk', '/werkstatt/netzwerk', '/makler', '/werkstatt']
function revalidateNetzwerk() { for (const r of NETZWERK_ROUTES) revalidatePath(r) }

function mapRpcError(message: string): string {
  return message.replace(/^ERROR:\s+/i, '').replace(/^[A-Z0-9]{5}:\s+/i, '').trim()
}

export async function postBeitrag(body: string, tags: string[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  const { error } = await supabase.rpc('create_community_post', { p_body: body, p_tags: tags })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidateNetzwerk()
  return { ok: true }
}

export async function postKommentar(
  targetKind: string, targetId: string, body: string, parentId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  const { error } = await supabase.rpc('create_community_comment', {
    p_target_kind: targetKind, p_target_id: targetId, p_body: body, p_parent_id: parentId ?? null,
  })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidateNetzwerk()
  return { ok: true }
}

export async function toggleGefaelltMir(
  targetKind: string, targetId: string,
): Promise<{ ok: boolean; nowLiked?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  const { data, error } = await supabase.rpc('toggle_like', { p_target_kind: targetKind, p_target_id: targetId })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidateNetzwerk()
  return { ok: true, nowLiked: !!data }
}

export async function melden(kind: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden, um zu melden.' }
  // Kommentare via report_comment, Posts/Artikel via report_target.
  const { error } = kind === 'comment'
    ? await supabase.rpc('report_comment', { p_comment_id: id })
    : await supabase.rpc('report_target', { p_kind: kind, p_id: id })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  return { ok: true }
}

export async function ladeThread(
  targetKind: 'post' | 'wissen', targetId: string,
): Promise<{ top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }> {
  return getThread(targetKind, targetId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/community/actions.test.ts` → Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/lib/community/actions.ts src/lib/community/actions.test.ts
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): Server-Actions (RPC-Wrapper, Portal-Revalidate) + Tests"
```

---

### Task 5: `LikeButton.tsx` — optimistischer Like

**Files:**
- Create: `src/components/shared/netzwerk/LikeButton.tsx`
- Create: `src/components/shared/netzwerk/types.ts`

**Interfaces:**
- Consumes: `toggleGefaelltMir` aus `@/lib/community/actions`; `@/components/primitives` `Button`.
- Produces: `types.ts` → `type NetzwerkPortal = 'gutachter' | 'makler' | 'werkstatt'`. `LikeButton` Props `{ targetKind: 'post'|'wissen'|'comment'; targetId: string; initialCount: number; initiallyLiked: boolean }`.

- [ ] **Step 1: `types.ts` anlegen** (kein 'use server' — Typen frei exportierbar)

```typescript
// src/components/shared/netzwerk/types.ts
export type NetzwerkPortal = 'gutachter' | 'makler' | 'werkstatt'
export const NETZWERK_HREF: Record<NetzwerkPortal, string> = {
  gutachter: '/gutachter/netzwerk',
  makler: '/makler/netzwerk',
  werkstatt: '/werkstatt/netzwerk',
}
```

- [ ] **Step 2: LikeButton implementieren** (Port `claimondo-marketing/components/community/LikeButton.tsx`; App-`Button` `variant="bare"`, `HeartIcon` lucide, `useTransition`, optimistisch; bei `!ok` zurückrollen + `toast.error`)

```tsx
// src/components/shared/netzwerk/LikeButton.tsx
'use client'
import { useState, useTransition } from 'react'
import { HeartIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { toggleGefaelltMir } from '@/lib/community/actions'

export function LikeButton(props: {
  targetKind: 'post' | 'wissen' | 'comment'; targetId: string; initialCount: number; initiallyLiked: boolean
}) {
  const [liked, setLiked] = useState(props.initiallyLiked)
  const [count, setCount] = useState(props.initialCount)
  const [pending, start] = useTransition()
  function onClick() {
    const nextLiked = !liked
    setLiked(nextLiked); setCount(c => c + (nextLiked ? 1 : -1))
    start(async () => {
      const res = await toggleGefaelltMir(props.targetKind, props.targetId)
      if (!res.ok) { setLiked(!nextLiked); setCount(c => c + (nextLiked ? -1 : 1)); toast.error(res.error ?? 'Fehler') }
      else if (res.nowLiked !== undefined) setLiked(res.nowLiked)
    })
  }
  return (
    <Button variant="bare" size="sm" onClick={onClick} loading={pending} ariaLabel="Gefällt mir"
      iconLeft={<HeartIcon className={liked ? 'fill-current text-claimondo-ondo' : ''} size={16} />}>
      {count > 0 ? count : ''}
    </Button>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → Expected: keine Fehler in den neuen Files. (Prüfe `Button`-Props `variant`/`iconLeft`/`loading`/`ariaLabel` gegen `src/components/primitives/Button/Button.types.ts`; anpassen falls Namen abweichen.)

- [ ] **Step 4: Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/components/shared/netzwerk/types.ts src/components/shared/netzwerk/LikeButton.tsx
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): LikeButton (optimistisch) + Portal-Typen"
```

---

### Task 6: Kommentar-UI — `TopComments` + `CommentThread` + `CommentComposer`

**Files:**
- Create: `src/components/shared/netzwerk/CommentComposer.tsx`
- Create: `src/components/shared/netzwerk/CommentThread.tsx`
- Create: `src/components/shared/netzwerk/TopComments.tsx`

**Interfaces:**
- Consumes: `postKommentar`, `ladeThread` aus `@/lib/community/actions`; `CommentPreview`, `CommentRow` (aus `@/lib/community/threads` — reine Typen, importierbar); `LikeButton`; `@/components/shared/Avatar`; `@/components/primitives` `Button`, `Badge`.
- Produces:
  - `CommentComposer` Props `{ targetKind: 'post'|'wissen'; targetId: string; parentId?: string; mention?: string; onDone?: () => void }`.
  - `CommentThread` Props `{ targetKind: 'post'|'wissen'; targetId: string }` — lädt volle Thread via `ladeThread`, 2 Ebenen, Reply-auf-Reply setzt `parentId=Top-Kommentar` + `@mention`.
  - `TopComments` Props `{ targetKind: 'post'|'wissen'; targetId: string; previews: CommentPreview[]; totalCount: number }` — default sichtbar (Top-2 + Top-Antwort), „Alle N Kommentare anzeigen" toggelt `CommentThread`.

**Design-Vorgaben (Spec §5):** Kommentar-Block ist ein fester, sichtbarer Bereich (nicht eingeklappt). Autor-Zeile: `Avatar` + `authorDisplay` + (`isRedaktion` → `Badge` „Redaktion"). Interaktionszeile: `LikeButton` (targetKind `'comment'`) + „Antworten" + „Melden". Antwort-Vorschau eingerückt (`pl-*`/`ml-*` Layout-Utils erlaubt) + „N weitere Antworten" toggelt vollen Thread.

- [ ] **Step 1: `CommentComposer.tsx`** — Textarea (Token-Klassen) + `Button`; ruft `postKommentar(targetKind, targetId, body, parentId)`; bei `!ok` `toast.error`, sonst `router.refresh()` + `onDone`. `mention` wird als Präfix in den Body-Placeholder/Initialwert gesetzt (@Name). Port-Referenz: `PostComposer.tsx` (Marketing) für Textarea-Muster.

```tsx
// src/components/shared/netzwerk/CommentComposer.tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { postKommentar } from '@/lib/community/actions'

export function CommentComposer(props: {
  targetKind: 'post' | 'wissen'; targetId: string; parentId?: string; mention?: string; onDone?: () => void
}) {
  const [body, setBody] = useState(props.mention ? `@${props.mention} ` : '')
  const [pending, start] = useTransition()
  const router = useRouter()
  function submit() {
    const text = body.trim()
    if (!text) return
    start(async () => {
      const res = await postKommentar(props.targetKind, props.targetId, text, props.parentId)
      if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
      setBody(''); router.refresh(); props.onDone?.()
    })
  }
  return (
    <div className="flex flex-col gap-2">
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
        placeholder="Kommentar schreiben…" maxLength={2000}
        className="w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-light-blue" />
      <div className="flex justify-end">
        <Button variant="navy" size="sm" onClick={submit} loading={pending}>Kommentieren</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `CommentThread.tsx`** — lädt via `ladeThread` in `useEffect`/`useTransition`; rendert Top-Kommentare + Replies (2 Ebenen). Reply-Button an einem Reply öffnet `CommentComposer` mit `parentId=<Top-Kommentar-ID>` + `mention=<reply.authorDisplay>` (DB verbietet tiefere Ebene). Melden-Button → `melden('comment', id)`. Vollständige Umsetzung analog `PostComments.tsx` (Marketing) mit App-Tokens.

- [ ] **Step 3: `TopComments.tsx`** — rendert `previews` (Top-2 + je Top-Antwort) direkt sichtbar; darunter Button „Alle {totalCount} Kommentare anzeigen" → toggelt `<CommentThread />`. Immer sichtbarer `<CommentComposer targetKind targetId />` am Ende (präsent).

```tsx
// src/components/shared/netzwerk/TopComments.tsx
'use client'
import { useState } from 'react'
import { Avatar } from '@/components/shared/Avatar'
import { Badge } from '@/components/primitives'
import type { CommentPreview } from '@/lib/community/threads'
import { LikeButton } from './LikeButton'
import { CommentThread } from './CommentThread'
import { CommentComposer } from './CommentComposer'

export function TopComments(props: {
  targetKind: 'post' | 'wissen'; targetId: string; previews: CommentPreview[]; totalCount: number
}) {
  const [showAll, setShowAll] = useState(false)
  return (
    <div className="mt-3 space-y-3 border-t border-claimondo-border pt-3">
      {!showAll && props.previews.map(p => (
        <div key={p.comment.id} className="space-y-1">
          <div className="flex items-center gap-2">
            <Avatar name={p.comment.authorDisplay} size="sm" />
            <span className="text-body-sm font-semibold text-claimondo-navy">{p.comment.authorDisplay}</span>
            {p.comment.isRedaktion && <Badge tone="info" size="sm">Redaktion</Badge>}
          </div>
          <p className="text-body-sm text-claimondo-navy">{p.comment.body}</p>
          <LikeButton targetKind="comment" targetId={p.comment.id} initialCount={p.comment.likeCount} initiallyLiked={false} />
          {p.topReply && (
            <div className="ml-6 mt-1 border-l border-claimondo-border pl-3">
              <span className="text-body-xs font-semibold text-claimondo-navy">{p.topReply.authorDisplay}</span>
              <p className="text-body-xs text-claimondo-ondo">{p.topReply.body}</p>
            </div>
          )}
          {p.replyCount > (p.topReply ? 1 : 0) && (
            <button onClick={() => setShowAll(true)} className="ml-6 text-body-xs text-claimondo-light-blue hover:underline">
              {p.replyCount - (p.topReply ? 1 : 0)} weitere Antworten
            </button>
          )}
        </div>
      ))}
      {props.totalCount > 0 && !showAll && (
        <button onClick={() => setShowAll(true)} className="text-body-sm text-claimondo-light-blue hover:underline">
          Alle {props.totalCount} Kommentare anzeigen
        </button>
      )}
      {showAll && <CommentThread targetKind={props.targetKind} targetId={props.targetId} />}
      <CommentComposer targetKind={props.targetKind} targetId={props.targetId} />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck + Commit**

Run: `npx tsc --noEmit` (prüfe `Avatar`-Props `name`/`size`, `Badge`-`tone`/`size` gegen die echten Signaturen; anpassen).

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/components/shared/netzwerk/CommentComposer.tsx src/components/shared/netzwerk/CommentThread.tsx src/components/shared/netzwerk/TopComments.tsx
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): Kommentar-UI (Top-Kommentare + Top-Antwort default, 2-Ebenen-Thread)"
```

---

### Task 7: `PostComposer.tsx` — Beitrag verfassen

**Files:**
- Create: `src/components/shared/netzwerk/PostComposer.tsx`

**Interfaces:**
- Consumes: `postBeitrag` aus `@/lib/community/actions`; `B2B_TAGS` aus `@/lib/community/tags`; `@/components/ui/Chip` (`Chip`, `ChipRow`); `@/components/primitives` `Button`.
- Produces: `PostComposer` (keine Props) — Textarea + Multi-Tag-Chips + „Veröffentlichen".

- [ ] **Step 1: Implementieren** (Port `PostComposer.tsx` Marketing; Tags via `Chip variant="selected|default"` Toggle; `postBeitrag(body, selectedTags)`; bei `!ok` `toast.error`, sonst reset + `router.refresh()`).

- [ ] **Step 2: Typecheck + Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/components/shared/netzwerk/PostComposer.tsx
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): PostComposer (Beitrag + Tag-Auswahl)"
```

---

### Task 8: `FeedCard.tsx` — ein Feed-Eintrag

**Files:**
- Create: `src/components/shared/netzwerk/FeedCard.tsx`

**Interfaces:**
- Consumes: `FeedEntry` (`@/lib/community/feed`), `CommentPreview` (`@/lib/community/threads`); `SectionCard` (`@/components/shared/SectionCard`), `Badge` (`@/components/primitives`); `LikeButton`, `TopComments`.
- Produces: `FeedCard` Props `{ entry: FeedEntry; liked: boolean; previews: CommentPreview[] }`.

- [ ] **Step 1: Implementieren** — `SectionCard` mit: Kopf (Avatar + `authorDisplay` + `isRedaktion`→Badge „Redaktion" + relative Zeit), Titel (nur `kind==='artikel'`, Link `→ claimondo.de/wissen/${slug}` via `slug`), `body`, Tag-Badges, Interaktionszeile (`LikeButton` targetKind = `entry.kind==='artikel' ? 'wissen' : 'post'`) + `TopComments` (targetKind analog; `totalCount = entry.commentCount`). Artikel-Link öffnet extern in neuem Tab.

- [ ] **Step 2: Typecheck + Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/components/shared/netzwerk/FeedCard.tsx
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): FeedCard (Post/Artikel + Like + Kommentar-Preview)"
```

---

### Task 9: `NetzwerkFeed.tsx` — Vollseiten-Orchestrator

**Files:**
- Create: `src/components/shared/netzwerk/NetzwerkFeed.tsx`

**Interfaces:**
- Consumes: `FeedEntry`, `CommentPreview`, `B2B_TAGS`, `NetzwerkPortal`; `PostComposer`, `FeedCard`; `Chip`/`ChipRow`; `EmptyState` (`@/components/shared/EmptyState`).
- Produces: `NetzwerkFeed` Props `{ portal: NetzwerkPortal; entries: FeedEntry[]; likedKeys: string[]; previewsByKey: Record<string, CommentPreview[]> }`.

- [ ] **Step 1: Implementieren** — Header „Aus dem Netzwerk" + Subline; Tag-Filter (`ChipRow`, aktiver Tag → Client-Filter der `entries` nach `tags.includes`); Sort-Umschalter „Top | Neueste" (Top = `likeCount` desc, Neueste = `createdAt` desc); `PostComposer`; Liste `FeedCard` (`liked = likedKeys.includes(`${entry.kind==='artikel'?'wissen':'post'}:${entry.id}`)`, `previews = previewsByKey[`${entry.kind}:${entry.id}`] ?? []`); `EmptyState` bei 0 Einträgen (Composer trotzdem sichtbar).

- [ ] **Step 2: Typecheck + Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/components/shared/netzwerk/NetzwerkFeed.tsx
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): NetzwerkFeed-Orchestrator (Tag-Filter + Sort + Composer + Liste)"
```

---

### Task 10: `NetzwerkWidget.tsx` — Dashboard-Widget (Server-Component)

**Files:**
- Create: `src/components/shared/netzwerk/NetzwerkWidget.tsx`

**Interfaces:**
- Consumes: `getNetzwerkFeed` (`@/lib/community/feed`); `NETZWERK_HREF`, `NetzwerkPortal` (`./types`); `SectionCard`, `Badge`.
- Produces: `NetzwerkWidget` async Props `{ portal: NetzwerkPortal }`.

- [ ] **Step 1: Implementieren** — `const entries = await getNetzwerkFeed({ limit: 3 })`; `SectionCard` Titel „Aus dem Netzwerk"; 3 Einzeiler (Avatar/Firma bzw. „Redaktion"-Badge, `body`-Snippet gekürzt, `♥ likeCount · 💬 commentCount`); Footer-Link „Zum Netzwerk →" `href={NETZWERK_HREF[portal]}`. Bei leer: dezenter „Noch keine Beiträge — schreib den ersten."-Hinweis + Link. (Guard in `getNetzwerkFeed` sorgt für `[]` statt Crash.)

- [ ] **Step 2: Typecheck + Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/components/shared/netzwerk/NetzwerkWidget.tsx
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): NetzwerkWidget (kompakt, 3 Einträge, Zum-Netzwerk-Link)"
```

---

### Task 11: SV-Mount — Seite + Nav

**Files:**
- Create: `src/app/gutachter/netzwerk/page.tsx`
- Modify: `src/app/gutachter/GutachterShell.tsx` (Nav-Item; icon-Import)

**Interfaces:**
- Consumes: `getNetzwerkFeed`, `getUserLikedKeys` (`@/lib/community/feed`), `getTopCommentsPreview` (`@/lib/community/threads`), `NetzwerkFeed`.

- [ ] **Step 1: Seite anlegen**

```tsx
// src/app/gutachter/netzwerk/page.tsx
import { getNetzwerkFeed, getUserLikedKeys } from '@/lib/community/feed'
import { getTopCommentsPreview } from '@/lib/community/threads'
import { NetzwerkFeed } from '@/components/shared/netzwerk/NetzwerkFeed'

export const dynamic = 'force-dynamic'

export default async function GutachterNetzwerkPage() {
  const entries = await getNetzwerkFeed()
  const [likedKeys, previewsByKey] = await Promise.all([
    getUserLikedKeys(entries),
    getTopCommentsPreview(entries),
  ])
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <NetzwerkFeed portal="gutachter" entries={entries} likedKeys={likedKeys} previewsByKey={previewsByKey} />
    </div>
  )
}
```

- [ ] **Step 2: Nav-Item in GutachterShell** — Icon-Import ergänzen (`MessagesSquareIcon` zur lucide-Import-Gruppe ~Z.7-25) und in eine **gerenderte** Section von `NAV_SECTIONS_BASE` (z.B. „Tagesgeschäft") einen Eintrag ergänzen:

```ts
{ href: '/gutachter/netzwerk', label: 'Netzwerk', icon: MessagesSquareIcon },
```
NICHT über den `showCommunity`/`'Geschäft'`-Block (der rendert nicht). `/gutachter/community` (Leaderboard) bleibt unverändert.

- [ ] **Step 3: Build + Commit**

Run: `npm run build` (Route-Validator). Expected: grün.
```bash
git -C .claude/worktrees/netzwerk-in-portalen add src/app/gutachter/netzwerk/page.tsx src/app/gutachter/GutachterShell.tsx
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): SV-Portal — /gutachter/netzwerk + Sidebar-Nav"
```

---

### Task 12: Makler-Mount — Seite + Nav + Dashboard-Widget

**Files:**
- Create: `src/app/makler/(shell)/netzwerk/page.tsx`
- Modify: `src/components/makler/MaklerShell.tsx` (Nav-Item + Icon-Import)
- Modify: `src/app/makler/(shell)/page.tsx` (Widget unter `<MaklerDashboard/>`)

- [ ] **Step 1: Seite anlegen** — analog Task 11, `portal="makler"`.

- [ ] **Step 2: Nav-Item** — an `MAKLER_NAV_ITEMS` (`MaklerShell.tsx:36`) anhängen (ans Ende → nicht in Mobile-`slice(0,4)`):

```ts
{ href: '/makler/netzwerk', label: 'Netzwerk', icon: MessagesSquareIcon },
```

- [ ] **Step 3: Widget** — in `src/app/makler/(shell)/page.tsx` nach `<MaklerDashboard/>` einfügen:

```tsx
import { NetzwerkWidget } from '@/components/shared/netzwerk/NetzwerkWidget'
// … im return, nach <MaklerDashboard … />:
<div className="mt-6"><NetzwerkWidget portal="makler" /></div>
```

- [ ] **Step 4: Build + Commit**

```bash
git -C .claude/worktrees/netzwerk-in-portalen add "src/app/makler/(shell)/netzwerk/page.tsx" src/components/makler/MaklerShell.tsx "src/app/makler/(shell)/page.tsx"
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): Makler-Portal — Seite + Nav + Dashboard-Widget"
```

---

### Task 13: Werkstatt-Mount — Seite + Nav + Widget-Swap + Explainer-Umzug

**Files:**
- Create: `src/app/werkstatt/(shell)/netzwerk/page.tsx`
- Modify: `src/components/werkstatt/WerkstattShell.tsx` (Nav-Item + Icon-Import)
- Modify: `src/app/werkstatt/(shell)/page.tsx` (Explainer-`<section>` Z.81-105 → `<NetzwerkWidget/>`)
- Modify: `src/app/werkstatt/(shell)/promo/page.tsx` (Explainer-Inhalt hinzufügen)

> ⚠️ **Koordination:** Parallele Sessions (`werkstatt-qr-pool`, `aar-956`) fassen dieses Portal an. Dieses Task **zuletzt** ausführen; vor Push `git -C … fetch origin main && git -C … rebase origin/main`.

- [ ] **Step 1: Seite anlegen** — analog Task 11, `portal="werkstatt"`.

- [ ] **Step 2: Nav-Item** — an `WERKSTATT_NAV_ITEMS` (`WerkstattShell.tsx:32`) anhängen:

```ts
{ href: '/werkstatt/netzwerk', label: 'Netzwerk', icon: MessagesSquareIcon },
```

- [ ] **Step 3: Widget-Swap** — in `src/app/werkstatt/(shell)/page.tsx` die `<section>` „So funktioniert die Vermittlung" (Z.81-105) **ersetzen** durch:

```tsx
import { NetzwerkWidget } from '@/components/shared/netzwerk/NetzwerkWidget'
// … an Stelle der entfernten <section>:
<NetzwerkWidget portal="werkstatt" />
```

- [ ] **Step 4: Explainer-Umzug** — den 4-Schritt-`<ol>` (verbatim aus der entfernten Section, inkl. `EUR.format(werkstatt.provision_betrag_netto)`) in `src/app/werkstatt/(shell)/promo/page.tsx` als eigene Section einfügen. `EUR`-Formatter + `werkstatt.provision_betrag_netto` dort bereitstellen (Promo-Page lädt bereits die Werkstatt-Row; sonst `getWerkstattByUserId()` ergänzen). Umlaute erhalten.

- [ ] **Step 5: Build + Commit**

Run: `npm run build`. Expected: grün.
```bash
git -C .claude/worktrees/netzwerk-in-portalen add "src/app/werkstatt/(shell)/netzwerk/page.tsx" src/components/werkstatt/WerkstattShell.tsx "src/app/werkstatt/(shell)/page.tsx" "src/app/werkstatt/(shell)/promo/page.tsx"
git -C .claude/worktrees/netzwerk-in-portalen commit -m "feat(netzwerk): Werkstatt-Portal — Seite + Nav + Widget statt Vermittlungs-Explainer (Umzug nach /promo)"
```

---

### Task 14: Verifikation — Build, Ratchets, Prod-Smoke

**Files:** keine (Verifikation).

- [ ] **Step 1: Voller Build + Typecheck**

Run: `npm run build` → Expected: grün (Routen/Layouts/Server-Actions vom Next-Validator geprüft).

- [ ] **Step 2: Tests**

Run: `npx vitest run src/lib/community` → Expected: alle grün (tags/feed/threads/actions).

- [ ] **Step 3: Ratchets (0 neue Verstöße)**

Run: `npm run check:component-set` · `npm run check:knip` · `npm run check:token-audit`
Expected: keine NEUEN Verletzer (neue Files nutzen Komponenten-Set + Tokens). Neue `src/lib/community/*`-Files sind referenziert (kein knip-Dead-File).

- [ ] **Step 4: Prod-Smoke (nach Deploy, JWT je Rolle)** — dokumentieren, nicht automatisiert:
  - SV/Makler/Werkstatt: Nav „Netzwerk" sichtbar → Seite lädt (Feed + Top-Kommentar-Preview).
  - Posten → Eintrag erscheint (eigene Firma als Autor). Kommentieren → sichtbar. Antworten (2. Ebene, @mention). Liken (Post + Kommentar, Zähler ändert sich). Melden.
  - Makler-Dashboard: Widget zeigt 3 Einträge + „Zum Netzwerk". Werkstatt-Dashboard: Widget statt Explainer; Explainer nun auf `/werkstatt/promo`.

- [ ] **Step 5: PR gegen `staging`** (Regel 1) mit Audit-Block; Merge-Session promotet.

---

## Self-Review

**1. Spec coverage:**
- Vereinter Feed (Posts+Artikel) → Task 2, 8, 9. ✅
- „Netzwerk"-Route + Nav (3 Portale) → Task 11-13. ✅
- Posten/Kommentieren/Liken/Melden → Task 4, 5, 6, 7. ✅
- X/YouTube-Kommentare (Top-Kommentare + Top-Antwort default, 2 Ebenen, Top|Neueste) → Task 3 (`rankTopComments`), 6 (`TopComments`), 9 (Sort). ✅
- Dashboard-Widget (Makler + Werkstatt; WS ersetzt Explainer → /promo) → Task 10, 12, 13. ✅
- 0 Migration / RPC-Reuse / Graceful Guard → Task 2/3/4. ✅
- Moderation-Reuse → Task 4 (`melden`), bestehende Auto-Hide/Admin unverändert. ✅
- Merge-Target staging → Task 14 Step 5. ✅

**2. Placeholder scan:** UI-Tasks 6-Step2/7/8/9/10 beschreiben „Port aus X + App-Tokens" statt vollen Verbatim-Code — bewusst, da mechanischer Port mit vorliegender Referenz; Interfaces + Kernlogik (Ranking, Like, Composer, TopComments) sind auscodiert. Kein „TBD/handle edge cases".

**3. Type consistency:** `FeedEntry` (feed.ts) durchgängig; `CommentRow`/`CommentPreview` (threads.ts) in TopComments/FeedCard; Action-Namen `postBeitrag`/`postKommentar`/`toggleGefaelltMir`/`melden`/`ladeThread` konsistent Task 4↔5-9; Kind-Mapping `artikel↔wissen` überall gleich.

**Risiko/Prüfpunkt für den Executor:** App-Komponenten-Prop-Namen (`Button.variant/iconLeft/loading/ariaLabel`, `Avatar.name/size`, `Badge.tone/size`, `Chip.variant`) VOR Verwendung gegen die echten `.types.ts` verifizieren — Namen können abweichen; dann anpassen (Task 5/6 Typecheck-Steps).
