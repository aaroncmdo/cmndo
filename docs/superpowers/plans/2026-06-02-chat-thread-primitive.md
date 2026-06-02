# `<ChatThread>`-Primitive Implementation Plan (Chat-Inbox P2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle 5 lebenden Chat-Renderer auf einen headless `useChatThread`-Engine + 3 Layout-Shells + geteilte Parts kollabieren; `ChatChannel` (tot) löschen.

**Architecture:** Pure Layer (`src/lib/chat/thread/*`, vitest-getestet) trägt Scope-Logik, Realtime-Namen, Mark-Read-Spec, Send-Normalisierung + den reinen Message-Reducer. Der Client-Hook (`useChatThread`) verdrahtet Reducer ↔ Supabase (Load/Realtime/Send/MarkRead). Dünne Shells (`ChatThreadTabs/Timeline/Stream`) + Parts (`MessageBubble/ChatComposer/KanalTabBar/DateSeparator`) bauen die UI.

**Tech Stack:** Next 16 (App Router), React 19, `@supabase/supabase-js` (browser client via `@/lib/supabase/client`), vitest 4 (`environment: node`), Tailwind v4 + Claimondo-Tokens, `lucide-react`, `primitives.Button`.

**Spec:** `docs/superpowers/specs/2026-06-02-chat-thread-primitive-design.md`
**Branch:** `kitta/chat-inbox-thread-primitive` (already created, off `kitta/chat-inbox-threads` @ `1ca25d850`).
**Worktree:** `.claude/worktrees/chat-inbox-ssot` (run commands with cwd = worktree).

**Gate after every task:** `npx tsc --noEmit` green (the worktree build gate; `next build` OOMs nested). Commit per task.

**Konventionen aus der Map (Quellen zum Porten):**
- MultiChannelChat `src/components/chat/MultiChannelChat.tsx` (Tabs, 305 LOC)
- ChatTimelineView `src/components/chat/ChatTimelineView.tsx` (Timeline, 255)
- KundeKbChat `src/app/kunde/_components/KundeKbChat.tsx` (kanal+allowlist, 416)
- FokusChatPanel `src/app/gutachter/feldmodus/FokusChatPanel.tsx` (Sheet, 344)
- MaklerChatTab `src/components/makler/akte-detail/MaklerChatTab.tsx` (date-sep, 416)
- ChatChannel `src/components/ChatChannel.tsx` (TOT, 0 Mounts → löschen)
- Send: `src/lib/communications/send-chat.ts` (`sendChatMessage`, `markMessagesRead`), `src/app/kunde/_components/kb-chat-actions.ts` (`sendKundeChatMessage`, `markKundeChatMessagesRead`), `src/lib/actions/makler-send-message.ts` (`maklerSendMessage`)
- Registry: `src/lib/communications/channels.ts` (`ChatKanal`, `CHAT_KANAELE`, `getChannelDef`)

---

## Task 1: Pure Scope-Layer (`scope.ts`)

**Files:**
- Create: `src/lib/chat/thread/scope.ts`
- Test: `src/lib/chat/thread/scope.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chat/thread/scope.test.ts
import { describe, it, expect } from 'vitest'
import { buildThreadFilter, buildChannelName, matchesScope, type ChatScope } from './scope'

const fallOne: ChatScope = { kind: 'fall', fallIds: ['f1'], kanaele: ['whatsapp', 'chat_kunde_sv'] }
const fallMany: ChatScope = { kind: 'fall', fallIds: ['f1', 'f2'], kanaele: ['gruppenchat'] }
const allow: ChatScope = { kind: 'kanal-allowlist', kanal: 'chat_kb_kunde', senderAllowlist: ['u1', 'u2'] }

describe('buildThreadFilter', () => {
  it('single-fall: serverFilter on fall_id', () => {
    expect(buildThreadFilter(fallOne)).toEqual({ mode: 'fall', fallIds: ['f1'], kanaele: ['whatsapp', 'chat_kunde_sv'], serverFilter: 'fall_id=eq.f1' })
  })
  it('multi-fall: no serverFilter (client matchesScope filters)', () => {
    expect(buildThreadFilter(fallMany)).toEqual({ mode: 'fall', fallIds: ['f1', 'f2'], kanaele: ['gruppenchat'], serverFilter: null })
  })
  it('kanal-allowlist: serverFilter on kanal', () => {
    expect(buildThreadFilter(allow)).toEqual({ mode: 'kanal', kanal: 'chat_kb_kunde', serverFilter: 'kanal=eq.chat_kb_kunde' })
  })
})

describe('buildChannelName', () => {
  it('fall name includes ids + instanceId', () => {
    expect(buildChannelName(fallMany, 'i9', 'u1')).toBe('chat:fall:f1,f2:i9')
  })
  it('kanal name includes kanal + userId + instanceId', () => {
    expect(buildChannelName(allow, 'i9', 'u1')).toBe('chat:kanal:chat_kb_kunde:u1:i9')
  })
})

describe('matchesScope', () => {
  it('fall: matches fall_id in set AND kanal in set', () => {
    expect(matchesScope({ fall_id: 'f1', kanal: 'whatsapp', sender_id: 'x' }, fallOne)).toBe(true)
    expect(matchesScope({ fall_id: 'f9', kanal: 'whatsapp', sender_id: 'x' }, fallOne)).toBe(false)
    expect(matchesScope({ fall_id: 'f1', kanal: 'gruppenchat', sender_id: 'x' }, fallOne)).toBe(false)
  })
  it('kanal-allowlist: matches kanal AND sender in allowlist', () => {
    expect(matchesScope({ fall_id: null, kanal: 'chat_kb_kunde', sender_id: 'u2' }, allow)).toBe(true)
    expect(matchesScope({ fall_id: null, kanal: 'chat_kb_kunde', sender_id: 'u9' }, allow)).toBe(false)
    expect(matchesScope({ fall_id: null, kanal: 'gruppenchat', sender_id: 'u1' }, allow)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/chat/thread/scope.test.ts`
Expected: FAIL — `Cannot find module './scope'` then, after stub, behavioral fails.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/chat/thread/scope.ts
import type { ChatKanal } from '@/lib/communications/channels'

export type ChatScope =
  | { kind: 'fall'; fallIds: string[]; kanaele: ChatKanal[] }
  | { kind: 'kanal-allowlist'; kanal: ChatKanal; senderAllowlist: string[] }

export type ThreadFilter =
  | { mode: 'fall'; fallIds: string[]; kanaele: ChatKanal[]; serverFilter: string | null }
  | { mode: 'kanal'; kanal: ChatKanal; serverFilter: string }

export function buildThreadFilter(scope: ChatScope): ThreadFilter {
  if (scope.kind === 'fall') {
    const serverFilter = scope.fallIds.length === 1 ? `fall_id=eq.${scope.fallIds[0]}` : null
    return { mode: 'fall', fallIds: scope.fallIds, kanaele: scope.kanaele, serverFilter }
  }
  return { mode: 'kanal', kanal: scope.kanal, serverFilter: `kanal=eq.${scope.kanal}` }
}

export function buildChannelName(scope: ChatScope, instanceId: string, userId: string): string {
  if (scope.kind === 'fall') return `chat:fall:${scope.fallIds.join(',')}:${instanceId}`
  return `chat:kanal:${scope.kanal}:${userId}:${instanceId}`
}

type RowLite = { fall_id: string | null; kanal: string; sender_id: string | null }

export function matchesScope(row: RowLite, scope: ChatScope): boolean {
  if (scope.kind === 'fall') {
    return row.fall_id != null && scope.fallIds.includes(row.fall_id) && scope.kanaele.includes(row.kanal as ChatKanal)
  }
  return row.kanal === scope.kanal && row.sender_id != null && scope.senderAllowlist.includes(row.sender_id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/chat/thread/scope.test.ts` → Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/thread/scope.ts src/lib/chat/thread/scope.test.ts
git commit -m "feat(chat-thread): pure scope layer (filter/channel-name/matches) + tests"
```

---

## Task 2: Pure Mark-Read-Spec (`mark-read.ts`)

**Files:**
- Create: `src/lib/chat/thread/mark-read.ts`
- Test: `src/lib/chat/thread/mark-read.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chat/thread/mark-read.test.ts
import { describe, it, expect } from 'vitest'
import { buildMarkReadSpec } from './mark-read'
import type { ChatScope } from './scope'

describe('buildMarkReadSpec', () => {
  it('fall: keyed on fall_id+kanal, excludes own messages', () => {
    const scope: ChatScope = { kind: 'fall', fallIds: ['f1', 'f2'], kanaele: ['whatsapp'] }
    expect(buildMarkReadSpec(scope, 'me')).toEqual({ mode: 'fall', fallIds: ['f1', 'f2'], kanaele: ['whatsapp'], excludeSenderId: 'me' })
  })
  it('kanal-allowlist: keyed on kanal + empfaenger_id=me (KundeKbChat semantics)', () => {
    const scope: ChatScope = { kind: 'kanal-allowlist', kanal: 'chat_kb_kunde', senderAllowlist: ['a', 'b'] }
    expect(buildMarkReadSpec(scope, 'me')).toEqual({ mode: 'kanal-empfaenger', kanal: 'chat_kb_kunde', empfaengerId: 'me' })
  })
})
```

- [ ] **Step 2: Run** `npm test -- src/lib/chat/thread/mark-read.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/chat/thread/mark-read.ts
import type { ChatKanal } from '@/lib/communications/channels'
import type { ChatScope } from './scope'

export type MarkReadSpec =
  | { mode: 'fall'; fallIds: string[]; kanaele: ChatKanal[]; excludeSenderId: string }
  | { mode: 'kanal-empfaenger'; kanal: ChatKanal; empfaengerId: string }

export function buildMarkReadSpec(scope: ChatScope, userId: string): MarkReadSpec {
  if (scope.kind === 'fall') {
    return { mode: 'fall', fallIds: scope.fallIds, kanaele: scope.kanaele, excludeSenderId: userId }
  }
  return { mode: 'kanal-empfaenger', kanal: scope.kanal, empfaengerId: userId }
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(chat-thread): pure mark-read spec + tests"` (after `git add`).

---

## Task 3: `sendChatMessage` returns `messageId` + Send-Strategien

**Files:**
- Modify: `src/lib/communications/send-chat.ts` (the INSERT — add `.select('id').single()`, return `messageId`)
- Create: `src/lib/chat/thread/send-strategies.ts`
- Test: `src/lib/chat/thread/send-strategies.test.ts` (pure normalizer only)

- [ ] **Step 1: Failing test for the pure normalizer**

```ts
// src/lib/chat/thread/send-strategies.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeLegacyResult } from './send-strategies'

describe('normalizeLegacyResult', () => {
  it('maps {success:true, messageId} -> {ok:true, messageId}', () => {
    expect(normalizeLegacyResult({ success: true, messageId: 'm1' })).toEqual({ ok: true, messageId: 'm1' })
  })
  it('maps {success:false, error} -> {ok:false, error}', () => {
    expect(normalizeLegacyResult({ success: false, error: 'x' })).toEqual({ ok: false, error: 'x' })
  })
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — first extend the action (read `send-chat.ts` first; the INSERT currently does not `.select`):

```ts
// send-chat.ts — change the insert to capture the id, e.g.:
//   const { data: inserted, error } = await supabase.from('nachrichten').insert({...}).select('id').single()
//   ... return { success: true, messageId: inserted?.id as string | undefined }
// Keep the existing {success,error} shape (other callers unaffected).
```

```ts
// src/lib/chat/thread/send-strategies.ts
'use client'
import { sendChatMessage } from '@/lib/communications/send-chat'
import { sendKundeChatMessage } from '@/app/kunde/_components/kb-chat-actions'
import { maklerSendMessage } from '@/lib/actions/makler-send-message'
import type { ChatKanal } from '@/lib/communications/channels'

export type ChatSendInput = { fallId?: string | null; kanal: ChatKanal; nachricht: string; empfaengerId?: string | null }
export type ChatSendResult = { ok: boolean; error?: string; messageId?: string }
export type ChatSender = (input: ChatSendInput) => Promise<ChatSendResult>

export function normalizeLegacyResult(r: { success: boolean; error?: string; messageId?: string }): ChatSendResult {
  return r.success ? { ok: true, messageId: r.messageId } : { ok: false, error: r.error }
}

export const standardSender: ChatSender = async (input) =>
  normalizeLegacyResult(await sendChatMessage({ fallId: input.fallId ?? '', kanal: input.kanal, nachricht: input.nachricht, empfaengerId: input.empfaengerId ?? null }))

export const kundeSender: ChatSender = async (input) => {
  const r = await sendKundeChatMessage({ nachricht: input.nachricht, kanal: input.kanal, empfaengerId: input.empfaengerId ?? '', fallId: input.fallId ?? null })
  return r.ok ? { ok: true, messageId: r.messageId } : { ok: false, error: r.error }
}

export const maklerSender: ChatSender = async (input) =>
  normalizeLegacyResult(await maklerSendMessage({ fallId: input.fallId ?? '', inhalt: input.nachricht }))
```

> Note at execution: verify each action's exact param names/return against its source before wiring (the map gives signatures; confirm). Adapters are thin wiring — only `normalizeLegacyResult` is unit-tested; the rest is tsc + smoke.

- [ ] **Step 4: Run** `npm test -- src/lib/chat/thread/send-strategies.test.ts` → PASS; `npx tsc --noEmit` → green.
- [ ] **Step 5: Commit** `git commit -m "feat(chat-thread): send strategies (->{ok}) + sendChatMessage returns messageId"`.

---

## Task 4: Engine — pure reducer + `useChatThread` hook

**Files:**
- Create: `src/lib/chat/thread/reducer.ts` (pure) + `src/lib/chat/thread/reducer.test.ts`
- Create: `src/components/chat/thread/useChatThread.ts` (hook; wires reducer ↔ supabase)

### 4a — pure reducer (TDD)

- [ ] **Step 1: Failing test**

```ts
// src/lib/chat/thread/reducer.test.ts
import { describe, it, expect } from 'vitest'
import { chatReducer, type ChatMessage } from './reducer'

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, fall_id: 'f1', kanal: 'whatsapp', sender_id: 'other', nachricht: 'h', created_at: '2026-06-02T10:00:00Z', gelesen: false, ...over })

describe('chatReducer', () => {
  it('loaded replaces state sorted by created_at asc', () => {
    const s = chatReducer([], { type: 'loaded', rows: [msg('b', { created_at: '2026-06-02T11:00:00Z' }), msg('a', { created_at: '2026-06-02T10:00:00Z' })] })
    expect(s.map(m => m.id)).toEqual(['a', 'b'])
  })
  it('realtimeInsert appends + dedups by id', () => {
    const s0 = chatReducer([], { type: 'loaded', rows: [msg('a')] })
    const s1 = chatReducer(s0, { type: 'realtimeInsert', row: msg('b') })
    const s2 = chatReducer(s1, { type: 'realtimeInsert', row: msg('b') }) // dup
    expect(s2.map(m => m.id)).toEqual(['a', 'b'])
  })
  it('optimisticAdd then sendResolved swaps temp id -> real id', () => {
    const s0 = chatReducer([], { type: 'optimisticAdd', message: msg('temp-1', { sender_id: 'me', pending: true }) })
    const s1 = chatReducer(s0, { type: 'sendResolved', tempId: 'temp-1', realId: 'r1' })
    expect(s1.map(m => m.id)).toEqual(['r1'])
    expect(s1[0].pending).toBe(false)
  })
  it('sendResolved dedups when realtime echo already delivered the real id', () => {
    let s = chatReducer([], { type: 'optimisticAdd', message: msg('temp-1', { sender_id: 'me', pending: true }) })
    s = chatReducer(s, { type: 'realtimeInsert', row: msg('r1', { sender_id: 'me' }) })
    s = chatReducer(s, { type: 'sendResolved', tempId: 'temp-1', realId: 'r1' })
    expect(s.map(m => m.id)).toEqual(['r1']) // temp removed, no dupe
  })
  it('sendFailed removes the optimistic temp', () => {
    const s0 = chatReducer([], { type: 'optimisticAdd', message: msg('temp-1', { pending: true }) })
    const s1 = chatReducer(s0, { type: 'sendFailed', tempId: 'temp-1' })
    expect(s1).toEqual([])
  })
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/chat/thread/reducer.ts
export type ChatMessage = {
  id: string
  fall_id: string | null
  kanal: string
  sender_id: string | null
  sender_rolle?: string | null
  nachricht: string | null
  created_at: string
  gelesen: boolean | null
  empfaenger_id?: string | null
  richtung?: string | null
  is_system?: boolean | null
  hat_anhang?: boolean | null
  anhang_url?: string | null
  pending?: boolean
}

export type ChatAction =
  | { type: 'loaded'; rows: ChatMessage[] }
  | { type: 'realtimeInsert'; row: ChatMessage }
  | { type: 'optimisticAdd'; message: ChatMessage }
  | { type: 'sendResolved'; tempId: string; realId: string }
  | { type: 'sendFailed'; tempId: string }

const byTime = (a: ChatMessage, b: ChatMessage) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)

export function chatReducer(state: ChatMessage[], action: ChatAction): ChatMessage[] {
  switch (action.type) {
    case 'loaded':
      return [...action.rows].sort(byTime)
    case 'realtimeInsert':
      if (state.some(m => m.id === action.row.id)) return state
      return [...state, action.row].sort(byTime)
    case 'optimisticAdd':
      return [...state, action.message]
    case 'sendResolved': {
      const echoed = state.some(m => m.id === action.realId)
      return state
        .filter(m => !(echoed && m.id === action.tempId))
        .map(m => (m.id === action.tempId ? { ...m, id: action.realId, pending: false } : m))
    }
    case 'sendFailed':
      return state.filter(m => m.id !== action.tempId)
    default:
      return state
  }
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(chat-thread): pure message reducer (dedup/optimistic/rollback) + tests"`.

### 4b — `useChatThread` hook (wiring; tsc + smoke verified)

- [ ] **Step 6: Implement the hook**

Contract:
```ts
// src/components/chat/thread/useChatThread.ts  ('use client')
export type UseChatThreadOpts = {
  scope: ChatScope
  currentUserId: string | null
  send: ChatSender
  markReadOnView?: boolean          // default true
  markRead?: (scope: ChatScope, userId: string) => Promise<void>  // default: standardMarkRead
}
export type UseChatThread = {
  messages: ChatMessage[]
  sendMessage: (input: { kanal: ChatKanal; nachricht: string; fallId?: string | null; empfaengerId?: string | null }) => Promise<ChatSendResult>
  unreadByKanal: Record<string, number>
  endRef: RefObject<HTMLDivElement>   // auto-scroll anchor
  loading: boolean
}
export function useChatThread(opts: UseChatThreadOpts): UseChatThread
```

Wiring (port mechanics from the source renderers):
- `createClient()` from `@/lib/supabase/client` (browser).
- **Load:** build select from `buildThreadFilter(scope)` — `select(MSG_SELECT).order('created_at', {ascending:true}).limit(500)`; apply `.in('fall_id',fallIds).in('kanal',kanaele)` or `.eq('kanal',kanal)`; for multi-fall + allowlist, post-filter via `matchesScope`; dispatch `loaded`. `MSG_SELECT = 'id, fall_id, kanal, sender_id, sender_rolle, nachricht, created_at, gelesen, empfaenger_id, richtung, is_system, hat_anhang, anhang_url'`.
- **Realtime:** `const instanceId = useId()`; channel `buildChannelName(scope, instanceId, currentUserId ?? 'anon')`; `.on('postgres_changes', { event:'INSERT', schema:'public', table:'nachrichten', filter: buildThreadFilter(scope).serverFilter ?? undefined }, cb)`; in cb: `if (!matchesScope(row, scope)) return; dispatch realtimeInsert; if markReadOnView && row.sender_id !== currentUserId → markRead(scope,uid)`; cleanup `removeChannel`. Deps: serialize scope (e.g. `JSON.stringify(scope)`), `currentUserId`.
- **markRead-on-view:** default `markRead` = `standardMarkRead` (see Task 4c) gated by `buildMarkReadSpec`. Call on load when `markReadOnView`.
- **sendMessage:** create `tempId = 'temp-' + instanceId + '-' + (messages.length)`; dispatch `optimisticAdd` (sender_id=currentUserId, pending:true, created_at = new Date().toISOString()); `const res = await opts.send(input)`; on `res.ok && res.messageId` → `sendResolved(tempId, res.messageId)`, else on `!ok` → `sendFailed(tempId)` + return res.
- **unreadByKanal:** `useMemo` over messages: `!gelesen && sender_id !== currentUserId` grouped by `kanal`.
- **endRef + auto-scroll:** `useEffect(scrollIntoView, [messages.length])`.

> The hook is wiring; verify via `tsc` + the cross-portal smoke (Task 11). No supabase mock test (anti-pattern) — the logic is in the tested reducer/pure layer.

### 4c — mark-read executors

- [ ] **Step 7:** Create `src/components/chat/thread/mark-read-exec.ts` (`'use client'`): `standardMarkRead(scope,uid)` builds `buildMarkReadSpec` then browser-client UPDATE `gelesen:true` per mode (`fall`: `.in('fall_id').in('kanal').eq('gelesen',false).neq('sender_id',uid)`; `kanal-empfaenger`: `.eq('kanal').eq('empfaenger_id',uid).eq('gelesen',false)`). Kunde-Pfad uses the existing `markKundeChatMessagesRead` server action as its injected `markRead` (admin client).

- [ ] **Step 8: tsc + commit** `npx tsc --noEmit` → green; `git commit -m "feat(chat-thread): useChatThread engine + mark-read executors"`.

---

## Task 5: Shared parts

**Files (create):** `src/components/chat/thread/MessageBubble.tsx`, `ChatComposer.tsx`, `KanalTabBar.tsx`, `DateSeparator.tsx`

- [ ] **Step 1–4 (per part):** Implement from the source stylings (no new logic):
  - `MessageBubble`: props `{ message: ChatMessage; isOwn: boolean; variant: 'tint'|'avatar'|'plain'; senderLabel?: {name,rolle,avatarUrl} }`. `tint` ← MultiChannelChat bubble (`:230-297`, role-tinted + attachment link + `is_system` pill). `avatar` ← KundeKbChat/MaklerChat (avatar + role-label rows). `plain` ← Timeline/Fokus 2-tone. System message → centered pill (port `MultiChannelChat:230-238`). Attachment → port `MultiChannelChat:293-297`.
  - `ChatComposer`: props `{ value, onChange, onSend, sending, placeholder?, extras?: ReactNode }`. Textarea + `SendIcon` `primitives.Button`, Enter (no shift) → send. `extras` slot renders above/within composer (quick-replies / fall-picker).
  - `KanalTabBar`: props `{ kanaele: ChatKanal[]; active: ChatKanal; onSelect; unreadByKanal }`. Tabs from `getChannelDef(k)` (icon/label/color) + `DropletBadge` unread (port `MultiChannelChat` tab bar).
  - `DateSeparator`: props `{ label: string }` — centered date pill (port `MaklerChatTab` separator `:88`+).
- [ ] **Step 5: tsc + commit** `git commit -m "feat(chat-thread): shared parts (MessageBubble/Composer/KanalTabBar/DateSeparator)"`.

> Tokens only (no inline hex except the channel colors already in `CHAT_KANAELE`). Use `primitives.Button`. Run `npm run check:token-audit` before commit.

---

## Task 6: `<ChatThreadTabs>` + migrate MultiChannelChat (4 mounts) + delete

**Files:** Create `src/components/chat/thread/ChatThreadTabs.tsx`; Modify `ChatWindowPanel.tsx:104`, `app/faelle/[id]/_tabs/KommunikationTab.tsx:55`, `ChatWithFallSidebar.tsx:63`, `app/admin/nachrichten/NachrichtenInboxClient.tsx:107`; Delete `src/components/chat/MultiChannelChat.tsx`.

- [ ] **Step 1:** Build `ChatThreadTabs` — props identical to MultiChannelChat (`fallId, currentUserId, showInternalKbSvChat?, defaultKanal?, empfaengerHints?, visibleKanaele?, smartReplyDefault?`). Internally: derive `kanaele` (prop `visibleKanaele` else `CHAT_KANAELE.filter(visibleInInbox)` + `chat_kb_sv` when `showInternalKbSvChat`); `activeKanal` state; `scope:{kind:'fall', fallIds:[fallId], kanaele:[activeKanal]}` (per active tab) for `useChatThread`; render `<KanalTabBar>` + `<MessageBubble variant="tint">` list + `<ChatComposer>`; `send=standardSender`, empfaenger from `empfaengerHints?.[activeKanal]`. Port exact JSX shell from `MultiChannelChat.tsx`.
- [ ] **Step 2:** Replace the 4 mounts: swap `<MultiChannelChat .../>` → `<ChatThreadTabs .../>` (props unchanged) at the 4 sites.
- [ ] **Step 3:** Delete `MultiChannelChat.tsx`; grep `rg "MultiChannelChat" src/` → zero hits.
- [ ] **Step 4:** `npx tsc --noEmit` → green.
- [ ] **Step 5:** Commit `git commit -m "feat(chat-thread): ChatThreadTabs replaces MultiChannelChat (4 mounts) + delete"`.

---

## Task 7: `<ChatThreadTimeline>` + migrate ChatWithKundenSidebar + delete ChatTimelineView

**Files:** Create `ChatThreadTimeline.tsx`; Modify `ChatWithKundenSidebar.tsx:62`; Delete `ChatTimelineView.tsx`.

- [ ] **Step 1:** Build `ChatThreadTimeline` — props `{ fallOptions: {fallId,fallNummer}[], currentUserId, visibleKanaele }`. `scope:{kind:'fall', fallIds:fallOptions.map(f=>f.fallId), kanaele:visibleKanaele}`; one stream (`<MessageBubble variant="plain">` + per-message fall+kanal badge); reply-target = two selects (fall + kanal), smart default = last message's fall+kanal; `send=standardSender`. Port from `ChatTimelineView.tsx`.
- [ ] **Step 2:** Swap mount in `ChatWithKundenSidebar.tsx`.
- [ ] **Step 3:** Delete `ChatTimelineView.tsx`; `rg "ChatTimelineView" src/` → zero.
- [ ] **Step 4–5:** tsc green; commit `"feat(chat-thread): ChatThreadTimeline replaces ChatTimelineView + delete"`.

---

## Task 8: `<ChatThreadStream>` + migrate KundeKbChat (2 cards)

**Files:** Create `ChatThreadStream.tsx`; Modify `app/kunde/_components/KundenbetreuerCard.tsx:348`, `app/kunde/_components/GutachterCard.tsx:269`; Delete (or reduce to wrapper) `KundeKbChat.tsx`.

- [ ] **Step 1:** Build `ChatThreadStream` — props `{ scope: ChatScope, currentUserId, send: ChatSender, markRead?, markReadOnView?, bubbleVariant: 'tint'|'avatar'|'plain', withDateSeparators?: boolean, composerExtras?: ReactNode, senderLabels?, placeholder? }`. Single stream via `useChatThread`; renders date separators when `withDateSeparators`; `<ChatComposer extras={composerExtras}>`.
- [ ] **Step 2:** Replace KundeKbChat usage in both cards with `<ChatThreadStream scope={{kind:'kanal-allowlist', kanal, senderAllowlist:[currentUserId, partnerUserId, ...additional]}} bubbleVariant="avatar" send={kundeSender} markRead={markKundeChatMessagesRead-adapter} composerExtras={<FallPicker .../>} senderLabels={...} />`. Port the Bezug-fall-picker + senderLabels from `KundeKbChat.tsx`.
- [ ] **Step 3:** Delete `KundeKbChat.tsx` (or slim to nothing); `rg "KundeKbChat" src/` → zero.
- [ ] **Step 4–5:** tsc green; commit `"feat(chat-thread): ChatThreadStream + KundeKbChat -> stream (2 cards) + delete"`.

---

## Task 9: FokusChatPanel + MaklerChatTab inner → `<ChatThreadStream>`

**Files:** Modify `app/gutachter/feldmodus/FokusChatPanel.tsx`, `components/makler/akte-detail/MaklerChatTab.tsx`.

- [ ] **Step 1 (Fokus):** Keep the bottom-sheet chrome + quick-reply pills + ETA/status header + undo-toast behavior. Replace the inner message-list + composer with `<ChatThreadStream scope={{kind:'fall', fallIds:[fallId], kanaele:['chat_kunde_sv']}} bubbleVariant="plain" send={standardSender} composerExtras={<QuickReplies .../>} markReadOnView />` (note: this ENABLES mark-read — intended delta §5.2). Remove the panel's own load/realtime/mark-read code.
- [ ] **Step 2 (Makler):** Keep consent-gate + info-banner + SSR `initialMessages` seeding. Replace inner list+composer with `<ChatThreadStream scope={{kind:'fall', fallIds:[fallId], kanaele:['gruppenchat','chat_gruppe_mit_makler']}} bubbleVariant="avatar" withDateSeparators send={maklerSender} />`. Remove inline mark-read UPDATE + inline realtime.
- [ ] **Step 3:** `rg "MultiChannelChat|ChatTimelineView|KundeKbChat" src/` → zero (all gone). tsc green.
- [ ] **Step 4:** Commit `"feat(chat-thread): Fokus + Makler inner -> ChatThreadStream (mark-read on view in Fokus)"`.

---

## Task 10: Delete dead `ChatChannel` + knip baseline

- [ ] **Step 1:** `rg "ChatChannel\b" src/` → confirm only `ChatChannel.tsx` self + the unrelated `ChatChannelDef` type in channels.ts. Delete `src/components/ChatChannel.tsx`.
- [ ] **Step 2:** `npm run check:knip -- --update-baseline` (Boy-Scout; baseline drops). `npx tsc --noEmit` green.
- [ ] **Step 3:** Commit `"chore(chat-thread): delete dead ChatChannel + knip baseline"`.

---

## Task 11: Full verification

- [ ] **Step 1:** `npm test` → the new pure-layer + reducer tests green; no chat-related regressions (the 8 pre-existing unrelated fails — branding-sharp/CardLink/faelle — remain, document them).
- [ ] **Step 2:** `npx tsc --noEmit` → green.
- [ ] **Step 3:** `npm run check:component-set` + `npm run check:token-audit` + `npm run check:knip` → no new violations.
- [ ] **Step 4:** **Cross-portal smoke** (local dev server in the worktree against Prod DB — single dev server only, per Memory `feedback_supabase_connections`; reuse/extend `scripts/smoke-chat-inbox.mjs`). Capture screenshots into `docs/02.06.2026/smoke-chat-thread/`:
  - Admin `/admin/nachrichten` (Tabs renderer) · KB `/mitarbeiter/nachrichten` (Timeline) · Fallakte KommunikationTab (Tabs) · SV Feldmodus FokusChatPanel · Kunde `/kunde` (KB + SV cards, Stream) · Makler Akte (Stream + date-sep).
  - Per surface: renders, 0 console errors, send works (optimistic), realtime echo arrives, kanal visibility correct.
- [ ] **Step 5:** Update `docs/02.06.2026/HANDOFF-chat-inbox-konsolidierung.md` (P2 done) + write smoke MD. Commit.
- [ ] **Step 6:** Open PR `--base kitta/chat-inbox-threads` (stacked) with the 7-point audit body + smoke evidence.

---

## Self-Review notes
- Spec coverage: §3.1 scope→Task1; §3.2 realtime→Task1+4b; §3.3 mark-read→Task2+4c; §3.4 send→Task3; §3.5 unread→Task4b; parts→Task5; shells/consumers (§4 table)→Tasks6-9; ChatChannel delete→Task10; verification (§7)→Task11; deltas (§5)→Task4b(optimistic)/Task9(Fokus mark-read). All covered.
- Type consistency: `ChatScope`, `ChatMessage`, `ChatSender`, `ChatSendResult`, `MarkReadSpec`, `ThreadFilter` defined Tasks 1-4, reused verbatim downstream.
- Known deviation (deliberate): UI-shell JSX is ported from named source `file:line` at execution rather than transcribed here (executor has repo context); the engine/pure layer is full-code + TDD.
