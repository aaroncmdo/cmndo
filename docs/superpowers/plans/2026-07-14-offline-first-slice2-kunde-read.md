# Offline-First Slice 2 (Kunde Roadside — Offline-READ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a customer re-open `/flow/[token]` OFFLINE (after opening it online once) and see their flow — via a CMM-14-safe, network-first service-worker navigation cache — without changing the flow page itself.

**Architecture:** `public/sw.js` gains two new fetch branches: a cache-first branch for `/_next/static/*` (so a cached flow HTML can hydrate offline) and a network-first branch for HARD `/flow/*` document navigations (`request.mode === 'navigate'`, `?_rsc=` hard-excluded) that tees the SSR HTML into a cache and serves it when offline. Online behavior is byte-identical (network-first — the SW just clones a copy). Two tiny config changes ship the SW promptly. No changes to `page.tsx`/`FlowWizardKfz`.

**Tech Stack:** Service Worker (classic script, browser APIs), Next.js 16, Playwright (offline smoke).

## Global Constraints

- Branch `kitta/offline-first-slice2-kunde` (off Slice 0 `kitta/offline-first-field-cache`); PR against the Slice 0 branch (stacked) or `staging` noting #4194. Never `main` (Regel 1).
- **No Postgres DDL.** Client SW + config only.
- **CMM-14 safety invariant (non-negotiable):** the SW must only ever `respondWith` for `/flow/*` requests that are HARD document navigations (`request.mode === 'navigate'`, GET, same-origin) and MUST NEVER touch `?_rsc=` / `RSC: 1` / `Next-Router-Prefetch` requests. Those stay on the existing pass-through. The `/flow/*` branch is network-FIRST (cache only on `fetch` throw) so online behavior is unchanged.
- **Behavior-preserving online:** an online `/flow` load still does a real network fetch; the SW only clones the response into a cache. The existing static-assets branch + pass-through are unchanged. The 3-second registration delay (`ServiceWorkerBoot`) and `skipWaiting()`/`clients.claim()` stay as-is.
- `public/sw.js` is OUTSIDE `src/**` → the token-audit / component-set / status-registry ratchets do NOT scan it (they scan `src/**`). Inline hex in the offline-fallback HTML is therefore allowed (and legitimate — it renders before any Tailwind/branding).
- **Umlauts** in the user-visible offline-fallback string (`ä/ö/ü/ß`).
- **Verification gate:** a real OFFLINE SMOKE is MANDATORY before merge (build/tsc does NOT catch a CMM-14 regression — same as the Redirect-Stub-Gate). Full build/`next start` OOMs locally → the smoke runs against the PR **preview deploy** (or is handed to Aaron / run on prod post-merge, coordinated).
- Spec: `docs/superpowers/specs/2026-07-14-offline-first-slice2-kunde-read-design.md`.

## File Structure
- Modify: `public/sw.js` — new constants + `isHardFlowDocument` + `evictFlowDocs` + `OFFLINE_FALLBACK_HTML`; 2 new fetch branches; activate-allowlist bump.
- Modify: `next.config.ts` — `headers()` entry for `/sw.js`.
- Modify: `src/lib/offline/register-sw.ts` — `updateViaCache: 'none'`.

---

## Task 1: Service-worker navigation cache (`public/sw.js`)

**Files:** Modify `public/sw.js`.

**Interfaces — Produces:** the SW caches `/flow/*` hard-nav HTML into `claimondo-flow-docs-v1` and `/_next/static/*` into `claimondo-next-static-v1`; serves them offline.

- [ ] **Step 1: Read the current `public/sw.js`** (know the exact current `install`/`activate`/`fetch` handlers + the existing constants `CACHE_NAME`/`TTS_CACHE`/`TILE_CACHE`/`STATIC_ASSETS`).

- [ ] **Step 2: Add the new constants + helpers** near the top, after the existing `TILE_HOSTS` const (before the `install` listener):

```js
// Slice 2 (Kunde Offline-READ): eigene Caches für /flow-Dokumente + Next-Static-Chunks.
const FLOW_DOCS_CACHE = 'claimondo-flow-docs-v1'
const NEXT_STATIC_CACHE = 'claimondo-next-static-v1'
const FLOW_DOCS_MAX = 5

// CMM-14-sicher: NUR harte Dokument-Navigationen zu /flow/*. ?_rsc=/RSC-Streams sind
// NIE mode==='navigate' -> fallen automatisch auf den Pass-Through; die extra Checks
// sind zusätzliche Absicherung.
function isHardFlowDocument(request, url) {
  return (
    request.method === 'GET' &&
    request.mode === 'navigate' &&
    !url.searchParams.has('_rsc') &&
    request.headers.get('RSC') !== '1' &&
    !request.headers.has('Next-Router-Prefetch') &&
    url.pathname.startsWith('/flow/') &&
    url.origin === self.location.origin
  )
}

// Count-bounded: behält nur die neuesten FLOW_DOCS_MAX Flow-Dokumente. Cache.keys()
// liefert Insertion-Order -> die ältesten zuerst löschen (kein echtes LRU nötig,
// wenige Tokens pro Gerät).
async function evictFlowDocs(cache, max) {
  const keys = await cache.keys()
  if (keys.length <= max) return
  for (const key of keys.slice(0, keys.length - max)) {
    await cache.delete(key)
  }
}

// Minimale, branded Offline-Fallback-Seite wenn ein /flow-Link offline geöffnet wird,
// der NIE online geladen wurde (nichts gecached). Inline-Styles/Hex sind hier ok:
// public/ wird von keinem Token-Ratchet gescannt + es rendert vor jedem Tailwind/Branding.
const OFFLINE_FALLBACK_HTML =
  '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline — Claimondo</title>' +
  '<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0D1B3E;color:#fff;' +
  'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}' +
  'div{max-width:22rem}h1{font-size:1.15rem;margin:0 0 .5rem}p{opacity:.85;font-size:.92rem;line-height:1.5}</style>' +
  '</head><body><div><h1>Keine Internetverbindung</h1>' +
  '<p>Bitte öffnen Sie Ihren Link einmal mit Internet — danach ist er auch offline verfügbar.</p>' +
  '</div></body></html>'
```

- [ ] **Step 3: Add the new caches to the `activate` cleanup allowlist.** In the `activate` listener's `.filter(...)`, extend the keep-list:

```js
keys
  .filter(
    (k) =>
      k !== CACHE_NAME &&
      k !== TTS_CACHE &&
      k !== TILE_CACHE &&
      k !== FLOW_DOCS_CACHE &&
      k !== NEXT_STATIC_CACHE,
  )
  .map((k) => caches.delete(k)),
```

- [ ] **Step 4: Replace the `fetch` listener body** with the 4-branch version (order matters — new branches BEFORE the static-assets branch; pass-through last, unchanged):

```js
self.addEventListener('fetch', (event) => {
  // Nur GET.
  if (event.request.method !== 'GET') return

  const req = event.request
  const url = new URL(req.url)

  // Slice 2: /_next/static/* cache-first (content-gehashte immutable Chunks) —
  // damit gecachtes /flow-HTML offline hydrieren kann. Self-warming beim Online-Besuch.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(NEXT_STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
    return
  }

  // Slice 2: /flow/* HARTE Navigation — network-first mit Cache-Fallback.
  // Online = byte-identisch (echter fetch, SW klont nur). Offline = gecachtes HTML.
  if (isHardFlowDocument(req, url)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(FLOW_DOCS_CACHE)
          cache.put(req, res.clone())
          void evictFlowDocs(cache, FLOW_DOCS_MAX)
          return res
        } catch {
          const cached = await caches.match(req)
          return (
            cached ||
            new Response(OFFLINE_FALLBACK_HTML, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
          )
        }
      })(),
    )
    return
  }

  // Bestehend (CMM-14): Statische Assets cache-first.
  if (STATIC_ASSETS.some((a) => url.pathname === a) || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req)))
    return
  }

  // Bestehend: alles andere explizit pass-through — insbesondere RSC-Streams (?_rsc=),
  // Auth-Routes und API. SW garantiert keine Interferenz.
  event.respondWith(fetch(req))
})
```

- [ ] **Step 5: Syntax-check the SW** (catches typos; it's plain JS):

Run: `node --check public/sw.js`
Expected: no output, exit 0.

- [ ] **Step 6: Static self-check** — confirm the file still contains the pass-through + both new branches + the discriminator:

Run (PowerShell): `Select-String -Path public/sw.js -Pattern "isHardFlowDocument|/_next/static/|event.respondWith\(fetch\(req\)\)|FLOW_DOCS_CACHE" | Measure-Object | Select-Object -ExpandProperty Count`
Expected: a count >= 5 (constants + predicate def + predicate use + static branch + final pass-through).

- [ ] **Step 7: Commit**

```bash
git add public/sw.js
git commit -m "feat(offline): CMM-14-safe SW navigation cache for /flow (offline-read) + /_next/static cache-first"
```

---

## Task 2: Ship the updated SW promptly (`next.config.ts` + `register-sw.ts`)

**Files:** Modify `next.config.ts` (add a `/sw.js` headers entry); Modify `src/lib/offline/register-sw.ts` (`updateViaCache: 'none'`).

- [ ] **Step 1: Read `next.config.ts` `headers()`** (it starts at ~line 116, `async headers()`, returning an array of `{ source, headers: [{ key, value }] }` objects). Identify the array so you can add one more entry.

- [ ] **Step 2: Add a `/sw.js` no-store header entry** to the array returned by `headers()` (place it alongside the other entries; do NOT remove any existing entry):

```ts
{
  source: '/sw.js',
  headers: [
    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
  ],
},
```

- [ ] **Step 3: Add `updateViaCache: 'none'` to the SW registration.** In `src/lib/offline/register-sw.ts` (~line 25), change:

```ts
const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
```
to:
```ts
const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
```

- [ ] **Step 4: Scoped typecheck** — `register-sw.ts` is in `src/`. Create a temp `tsconfig.sw-check.json` (`extends ./tsconfig.json`, `noEmit`, include `src/lib/offline/**/*.ts`), run `npx tsc --noEmit -p tsconfig.sw-check.json` → 0 errors; delete the temp tsconfig (don't commit it). (`next.config.ts` is validated by the full build on CI.)

- [ ] **Step 5: Commit**

```bash
git add next.config.ts src/lib/offline/register-sw.ts
git commit -m "chore(offline): ship SW updates promptly (no-store on /sw.js + updateViaCache none)"
```

---

## Task 3: Verification (build + ratchets + MANDATORY offline smoke) + PR

**Files:** none (verification) + a Playwright smoke spec (optional, if driving the smoke via code).

- [ ] **Step 1: Ratchets** — `npm run check:knip -- --ratchet`, `npm run check:token-audit`, `npm run check:component-set -- --ratchet`, `npm run check:status-registry -- --ratchet` → all 0-new. (Expected trivially green: the only `src/` change is a 1-option addition in `register-sw.ts`; `public/sw.js` + `next.config.ts` are not ratchet-scanned.)

- [ ] **Step 2: Full unit suite** — `npm test`; confirm no NEW failures vs the known pre-existing env-flaky set (the offline suite is unchanged by this slice).

- [ ] **Step 3: Build is CI-authoritative** — note in the PR that `next build` (which validates `next.config.ts` `headers()`) runs on CI (local build OOMs). Do NOT claim build-green locally.

- [ ] **Step 4: MANDATORY OFFLINE SMOKE (the real gate — build does NOT catch CMM-14).** Run against the PR **preview deploy URL** (or a local prod build if the box allows; or hand to Aaron / run on prod post-merge). Procedure — via the webapp-testing / playwright-cli skill against a real browser context:
  1. Obtain a valid `/flow/<token>` test link (create a flow link via the app / a test account; the link must be openable).
  2. **Warm:** open `/flow/<token>` ONLINE, wait > 4s (SW registers after a 3s delay), reload once so the SW is active and has cached the HTML + `/_next/static/*` chunks.
  3. **Offline read:** `context.setOffline(true)` → HARD reload `/flow/<token>` → ASSERT the page RENDERS + HYDRATES from cache (a known flow element is visible; NOT a white page, NOT the browser error page). If nothing was cached, assert the branded "Keine Internetverbindung" fallback (not a raw browser error).
  4. **CMM-14 regression (online):** with the new SW active, ONLINE, exercise a `?_rsc=` soft-navigation (a client-side nav / login-redirect) → ASSERT no white page — it works exactly as before. This is the load-bearing safety check.
  5. **Online byte-identical:** a normal online `/flow` load behaves unchanged.
  Document the smoke result (screenshots/asserts) in the PR. **Without a green offline smoke: no merge.**

- [ ] **Step 5: Push + PR** stacked on Slice 0:
```bash
git push -u origin kitta/offline-first-slice2-kunde
gh pr create --base kitta/offline-first-field-cache --title "feat(offline): Slice 2 - Kunde offline-read (/flow SW navigation cache)" --body-file <body>
```
(Retarget to staging after #4194 merges. The PR body must state the offline-smoke result + that build is CI-authoritative.)

---

## Self-Review (plan author)

- **Spec coverage:** §3.1 discriminator → Task 1 Step 2 (`isHardFlowDocument`). §3.2 three branches → Task 1 Step 4. §3.3 cache mgmt (new caches + evict + allowlist) → Task 1 Steps 2/3. §3.4 SW delivery (no-store + updateViaCache) → Task 2. §5 CMM-14 safety → encoded in the discriminator + network-first + Global Constraints. §7 mandatory offline smoke → Task 3 Step 4. §8 files (sw.js + next.config + register-sw) → Tasks 1/2. Non-goals (no page.tsx/FlowWizardKfz change) honored. ✓
- **Placeholder scan:** every code step shows complete code. The `<token>`/`<body>` placeholders are runtime values (a real test token; a PR body path), not code gaps.
- **Type consistency:** cache names `claimondo-flow-docs-v1`/`claimondo-next-static-v1` + `FLOW_DOCS_CACHE`/`NEXT_STATIC_CACHE`/`FLOW_DOCS_MAX`/`isHardFlowDocument`/`evictFlowDocs`/`OFFLINE_FALLBACK_HTML` are consistent between the constants (Step 2), the activate allowlist (Step 3), and the fetch branches (Step 4).
- **Risk note:** the SW is browser-integration code with no unit test — the offline smoke (Task 3 Step 4) is the correctness gate, exactly as the spec mandates. The `node --check` + static self-check (Task 1 Steps 5-6) catch syntax/structure regressions cheaply.
