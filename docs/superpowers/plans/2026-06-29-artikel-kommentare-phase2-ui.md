# Artikel-Kommentare — Plan 2: UI (Magic-Link-Auth + Posten + Anzeige)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Besucher können sich per E-Mail-Magic-Link anmelden, einmalig einen Nutzernamen setzen und unter einem Wissens-Artikel einen Kommentar posten; freigegebene Kommentare werden server-gerendert angezeigt.

**Architecture:** Marketing-App (`claimondo-marketing/`, Next 16, @supabase/ssr). Magic-Link-OTP-Auth NEU (heute hat Marketing keine Besucher-Auth). Kommentar-Posten/Lesen über RLS (Foundation aus Plan 1 ist live: `community_profiles` + `article_comments`, Insert erzwingt `status='pending'`). Anzeige nur `approved`.

**Tech Stack:** Next 16 App Router, @supabase/ssr, TypeScript, vitest. Plain `useState`+`useTransition`-Forms (kein react-hook-form), claimondo-Design-Tokens.

**Vorgänger:** Plan 1 (Foundation) DONE — Tabellen+RLS live (migration `20260629153932`), `lib/community/username.ts` (`validateUsername`) existiert.

## Global Constraints (verbatim)

- **Server-Actions:** `'use server'`, Result-Object `{ ok: true; … } | { ok: false; error: string }` — **nie** `throw`. Authenticated-Action → `createClient()` aus `@/lib/supabase/server` (cookie-basiert, respektiert RLS). `revalidatePath` nach Writes.
- **Nutzersichtbare Strings: Deutsch mit echten Umlauten** (`ä/ö/ü/ß`). de-only Feature: keine `localeAlternates`, kein i18n-Key — hardcoded DE (wie `/versicherer`, `/haftpflicht`). `MdxLanguageBanner` deckt Non-DE-Besucher schon ab.
- **RLS ist die Sicherheit:** Insert läuft als der eingeloggte User (`auth.uid()`), Policy erzwingt `status='pending'` + nicht-`is_blocked`. NIE `createAdminClient()` zum Posten nutzen (würde RLS umgehen).
- **Design-Tokens:** `claimondo-navy`/`-ondo`/`-border`/`-bg`/`-shield`, `rounded-ios-md/-lg`, `shadow-claimondo-md`. Komponenten aus `components/primitives/*` / `components/ui/textarea`.
- **Recht/DSGVO = Launch-Gate** (DSE-Update + DPIA + Consent-Checkbox) — Consent-Checkbox ist in diesem Plan (Task 5), DSE-Text/DPIA bleiben Plan 5/Launch.

## File Structure

- `claimondo-marketing/lib/community/comments.ts` — Daten-Layer: `listApprovedComments(slug)`, `getMyProfile()` (server, RLS).
- `claimondo-marketing/lib/community/actions.ts` — `'use server'`: `requestCommentLogin`, `ensureUsername`, `submitComment`.
- `claimondo-marketing/app/auth/callback/route.ts` — Magic-Link-Rücksprung (exchangeCodeForSession).
- `claimondo-marketing/components/community/ArticleComments.tsx` — Server-Component (Liste + Form-Host + Comment-Schema).
- `claimondo-marketing/components/community/CommentForm.tsx` — Client-Component (3-State: E-Mail → Username → Kommentar).
- Edit: `app/[locale]/haftpflicht/[slug]/page.tsx` (+ decoder/[slug], sachverstaendige/[slug], die Cornerstones) — `<ArticleComments articleSlug={slug} />` einhängen.

---

### Task 1: Daten-Layer (`lib/community/comments.ts`)

**Files:** Create `claimondo-marketing/lib/community/comments.ts` · Test `claimondo-marketing/lib/community/comments.test.ts`

**Interfaces:**
- Produces: `type CommentRow = { id: string; username: string; body: string; createdAt: string }`
- Produces: `listApprovedComments(slug: string): Promise<CommentRow[]>` — approved Kommentare eines Artikels (RLS-gated, server.ts-Client), join username.
- Produces: `getMyProfile(): Promise<{ userId: string; username: string } | null>` — Profil des eingeloggten Users oder null (kein User / kein Profil).

- [ ] **Step 1: Failing Test (pure mapping helper)**

Den DB-Call kapseln wir hinter einer reinen Map-Funktion, die testbar ist:

```ts
// comments.test.ts
import { describe, it, expect } from 'vitest'
import { mapCommentRows } from './comments'

describe('mapCommentRows', () => {
  it('mappt joined rows auf CommentRow', () => {
    const rows = [{ id: 'c1', body: 'Hallo', created_at: '2026-06-29T10:00:00Z', community_profiles: { username: 'max' } }]
    expect(mapCommentRows(rows)).toEqual([{ id: 'c1', username: 'max', body: 'Hallo', createdAt: '2026-06-29T10:00:00Z' }])
  })
  it('normalisiert fehlendes Profil zu "unbekannt"', () => {
    const rows = [{ id: 'c2', body: 'X', created_at: '2026-06-29T10:00:00Z', community_profiles: null }]
    expect(mapCommentRows(rows)[0].username).toBe('unbekannt')
  })
})
```

- [ ] **Step 2: Test laufen → FAIL** (`cd claimondo-marketing && npm run test` → "Cannot find module './comments'")

- [ ] **Step 3: Implementierung**

```ts
// claimondo-marketing/lib/community/comments.ts
import { createClient } from '@/lib/supabase/server'

export interface CommentRow {
  id: string
  username: string
  body: string
  createdAt: string
}

// Supabase select('a, profile(username)') liefert profile je nach Cardinality Objekt|Array|null
// -> defensiv normalisieren.
export function mapCommentRows(
  rows: Array<{ id: string; body: string; created_at: string; community_profiles: unknown }>,
): CommentRow[] {
  return rows.map((r) => {
    const p = Array.isArray(r.community_profiles) ? r.community_profiles[0] : r.community_profiles
    const username = (p as { username?: string } | null)?.username ?? 'unbekannt'
    return { id: r.id, username, body: r.body, createdAt: r.created_at }
  })
}

export async function listApprovedComments(slug: string): Promise<CommentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('article_comments')
    .select('id, body, created_at, community_profiles(username)')
    .eq('article_slug', slug)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return mapCommentRows(data as never)
}

export async function getMyProfile(): Promise<{ userId: string; username: string } | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data } = await supabase
    .from('community_profiles')
    .select('user_id, username')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  return data ? { userId: data.user_id, username: data.username } : null
}
```

- [ ] **Step 4: Test laufen → PASS**

- [ ] **Step 5: Commit** — `git commit -m "feat(comments): Daten-Layer listApprovedComments + getMyProfile + mapCommentRows"`

---

### Task 2: Auth — Magic-Link-Action + Callback-Route

**Files:** Create `claimondo-marketing/lib/community/actions.ts` (Teil 1) · Create `claimondo-marketing/app/auth/callback/route.ts`

**Interfaces:**
- Produces: `requestCommentLogin(formData: FormData): Promise<{ ok: boolean; error?: string }>` — sendet OTP-Magic-Link an die E-Mail, redirect zurück zum Artikel.
- Produces: Route `GET /auth/callback?code=…&next=…` — tauscht Code gegen Session, redirectet zu `next`.

- [ ] **Step 1: Action implementieren**

```ts
// claimondo-marketing/lib/community/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { SITE_URL } from '@/lib/seo/jsonld'
import { revalidatePath } from 'next/cache'
import { validateUsername } from './username'

function isEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
}

export async function requestCommentLogin(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const slug = String(formData.get('slug') ?? '')
  if (!isEmail(email)) return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
  const next = slug ? `/haftpflicht/${slug}` : '/'
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error) return { ok: false, error: 'Magic-Link konnte nicht gesendet werden. Bitte später erneut versuchen.' }
  return { ok: true }
}
```

> Hinweis: `next` zeigt vorerst auf `/haftpflicht/<slug>`; in Task 6 wird der echte Pfad (je Content-Typ) durchgereicht. Für den ersten Durchstich reicht das.

- [ ] **Step 2: Callback-Route**

```ts
// claimondo-marketing/app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'
  // nur same-site Pfade zulassen (Open-Redirect-Schutz)
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(new URL(safeNext, url.origin))
}
```

- [ ] **Step 3: Build-Check** — `cd claimondo-marketing && npm run typecheck` (nur Baseline-ENV-Noise erlaubt, keine neuen Fehler in den neuen Files).

- [ ] **Step 4: Commit** — `git commit -m "feat(comments): Magic-Link-Login-Action + /auth/callback-Route"`

---

### Task 3: Username-Setzen + Kommentar-Posten (Actions)

**Files:** Modify `claimondo-marketing/lib/community/actions.ts` (anhängen) · Modify `comments.ts` (rate-limit helper)

**Interfaces:**
- Consumes: `validateUsername` (Plan 1), `createClient` (server.ts).
- Produces: `ensureUsername(formData): Promise<{ ok; error? }>` — legt `community_profiles`-Zeile für `auth.uid()` an (RLS insert_own).
- Produces: `submitComment(formData): Promise<{ ok; error? }>` — Insert (RLS erzwingt pending), revalidate.

- [ ] **Step 1: `ensureUsername` + `submitComment` anhängen**

```ts
// ... in actions.ts ergänzen ...

export async function ensureUsername(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const v = validateUsername(String(formData.get('username') ?? ''))
  if (!v.ok) return { ok: false, error: v.error }
  const consent = formData.get('consent') === 'on'
  if (!consent) return { ok: false, error: 'Bitte den Hinweis zur Datenverarbeitung bestätigen.' }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst per E-Mail anmelden.' }
  const { error } = await supabase
    .from('community_profiles')
    .insert({ user_id: auth.user.id, username: v.username })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieser Nutzername ist bereits vergeben.' }
    return { ok: false, error: 'Nutzername konnte nicht gespeichert werden.' }
  }
  return { ok: true }
}

export async function submitComment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const body = String(formData.get('body') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  if (body.length < 1 || body.length > 2000) return { ok: false, error: 'Kommentar: 1–2000 Zeichen.' }
  if (!slug) return { ok: false, error: 'Artikel fehlt.' }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  // status NICHT setzen -> Default 'pending'; RLS erzwingt es ohnehin.
  const { error } = await supabase
    .from('article_comments')
    .insert({ author_id: auth.user.id, article_slug: slug, body })
  if (error) return { ok: false, error: 'Kommentar konnte nicht gespeichert werden.' }
  revalidatePath(`/haftpflicht/${slug}`)
  return { ok: true }
}
```

- [ ] **Step 2: Typecheck grün** (`npm run typecheck`).

- [ ] **Step 3: Commit** — `git commit -m "feat(comments): ensureUsername + submitComment Server-Actions (RLS, Consent, Result-Object)"`

> Rate-Limit (hash-ip) + Turnstile = Plan 4 (Anti-Spam). In diesem Plan bewusst NICHT, um den Durchstich klein zu halten — dokumentiert.

---

### Task 4: `CommentForm` (Client, 3-State)

**Files:** Create `claimondo-marketing/components/community/CommentForm.tsx`

**Interfaces:**
- Consumes: `requestCommentLogin`, `ensureUsername`, `submitComment` (Task 2/3).
- Props: `{ slug: string; isLoggedIn: boolean; hasUsername: boolean }` — bestimmt den Start-State.

- [ ] **Step 1: Implementierung**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { requestCommentLogin, ensureUsername, submitComment } from '@/lib/community/actions'

type Stage = 'email' | 'username' | 'comment' | 'sent' | 'posted'

export function CommentForm({ slug, isLoggedIn, hasUsername }: { slug: string; isLoggedIn: boolean; hasUsername: boolean }) {
  const initial: Stage = !isLoggedIn ? 'email' : !hasUsername ? 'username' : 'comment'
  const [stage, setStage] = useState<Stage>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData, onOk: () => void) {
    setError(null)
    start(async () => {
      const r = await action(fd)
      if (r.ok) onOk()
      else setError(r.error ?? 'Fehler')
    })
  }

  const input = 'w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2.5 text-sm focus:border-claimondo-ondo focus:outline-none'
  const btn = 'rounded-ios-md bg-claimondo-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-claimondo-shield disabled:opacity-60'

  if (stage === 'sent') return <p className="text-sm text-claimondo-shield">Wir haben dir einen Anmelde-Link per E-Mail geschickt. Bitte prüfe dein Postfach.</p>
  if (stage === 'posted') return <p className="text-sm text-claimondo-shield">Danke! Dein Kommentar wird nach kurzer Prüfung freigeschaltet.</p>

  return (
    <form
      className="mt-4 space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set('slug', slug)
        if (stage === 'email') run(requestCommentLogin, fd, () => setStage('sent'))
        else if (stage === 'username') run(ensureUsername, fd, () => setStage('comment'))
        else run(submitComment, fd, () => setStage('posted'))
      }}
    >
      {stage === 'email' && (
        <input name="email" type="email" required placeholder="Deine E-Mail (für den Anmelde-Link)" className={input} />
      )}
      {stage === 'username' && (
        <>
          <input name="username" required placeholder="Nutzername (3–24 Zeichen)" className={input} />
          <label className="flex items-start gap-2 text-[0.75rem] text-claimondo-shield">
            <input type="checkbox" name="consent" className="mt-0.5" />
            <span>Ich bin einverstanden, dass mein Nutzername und Kommentar gespeichert und öffentlich angezeigt werden.</span>
          </label>
        </>
      )}
      {stage === 'comment' && (
        <textarea name="body" required maxLength={2000} rows={3} placeholder="Deinen Kommentar schreiben …" className={input} />
      )}
      {error && <p className="text-[0.8125rem] text-danger-strong">{error}</p>}
      <button type="submit" disabled={pending} className={btn}>
        {stage === 'email' ? 'Anmelde-Link senden' : stage === 'username' ? 'Nutzername setzen' : 'Kommentar abschicken'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Typecheck grün.**
- [ ] **Step 3: Commit** — `git commit -m "feat(comments): CommentForm Client (3-State: Email -> Username -> Kommentar)"`

---

### Task 5: `ArticleComments` (Server) — Anzeige + Form-Host + Schema

**Files:** Create `claimondo-marketing/components/community/ArticleComments.tsx`

**Interfaces:**
- Consumes: `listApprovedComments`, `getMyProfile` (Task 1), `CommentForm` (Task 4).
- Props: `{ articleSlug: string }`.

- [ ] **Step 1: Implementierung**

```tsx
import { listApprovedComments, getMyProfile } from '@/lib/community/comments'
import { CommentForm } from './CommentForm'
import { jsonLdScript } from '@/lib/seo/jsonld'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export async function ArticleComments({ articleSlug }: { articleSlug: string }) {
  const [comments, profile] = await Promise.all([listApprovedComments(articleSlug), getMyProfile()])

  const schema = comments.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'Comment',
    // ItemList der Kommentare als CommentSection-Signal
    comment: comments.map((c) => ({ '@type': 'Comment', text: c.body, author: { '@type': 'Person', name: c.username } })),
  } : null

  return (
    <section id="kommentare" className="mt-14 border-t border-claimondo-border pt-8">
      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(schema)} />}
      <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
        Kommentare {comments.length > 0 && <span className="text-claimondo-shield">({comments.length})</span>}
      </h2>

      <CommentForm slug={articleSlug} isLoggedIn={!!profile || profile === null ? !!profile : false} hasUsername={!!profile?.username} />

      <ul className="mt-6 space-y-3.5">
        {comments.length === 0 && (
          <li className="text-sm text-claimondo-shield">Noch keine Kommentare — schreib den ersten.</li>
        )}
        {comments.map((c) => (
          <li key={c.id} className="rounded-ios-md border border-claimondo-border bg-white p-4">
            <div className="text-[0.8125rem] font-semibold text-claimondo-navy">{c.username}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-claimondo-shield">{c.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.75rem] text-claimondo-shield/70">
        Kommentare geben die Meinung der Verfasser:innen wieder, nicht die von Claimondo. Sie werden vor Veröffentlichung geprüft.
      </p>
    </section>
  )
}
```

> `isLoggedIn`-Berechnung vereinfachen: `getMyProfile()` liefert null wenn kein User ODER kein Profil. Für die korrekte 3-State-Logik braucht der Client „eingeloggt aber kein Profil". Daher in Task 1 zusätzlich exportieren: `getAuthState(): Promise<{ isLoggedIn: boolean; username: string | null }>` und hier statt `getMyProfile` nutzen. (Im Self-Review unten als Korrektur erfasst.)

- [ ] **Step 2: Korrektur Task-1-Interface** — `getAuthState()` in `comments.ts` ergänzen:

```ts
export async function getAuthState(): Promise<{ isLoggedIn: boolean; username: string | null }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { isLoggedIn: false, username: null }
  const { data } = await supabase.from('community_profiles').select('username').eq('user_id', auth.user.id).maybeSingle()
  return { isLoggedIn: true, username: data?.username ?? null }
}
```
…und in `ArticleComments` `getAuthState()` nutzen: `isLoggedIn={state.isLoggedIn} hasUsername={!!state.username}`.

- [ ] **Step 3: Typecheck grün. Commit** — `git commit -m "feat(comments): ArticleComments Server-Component (Anzeige + Form-Host + Comment-Schema)"`

---

### Task 6: Einhängen in die Artikel-Seiten

**Files:** Modify `app/[locale]/haftpflicht/[slug]/page.tsx` (+ `decoder/[slug]/page.tsx`, `sachverstaendige/[slug]/page.tsx`, die Cornerstone-Seiten)

- [ ] **Step 1: In `haftpflicht/[slug]/page.tsx`** — nach `<RelatedAssets current={a} />`, vor `</article>`:

```tsx
import { ArticleComments } from '@/components/community/ArticleComments'
// ...
            <RelatedAssets current={a} />
            <ArticleComments articleSlug={slug} />
          </article>
```

- [ ] **Step 2: Analog** in `decoder/[slug]`, `sachverstaendige/[slug]` (jeweils `articleSlug={slug}`) und den Cornerstone-Seiten (`articleSlug={a.slug}` bzw. den jeweiligen Slug).

- [ ] **Step 3: Voller Build** — `cd claimondo-marketing && npm run build` (Routen/Layout-Change → Next-16-Validator). Erwartet: grün (lokal evtl. ENV-limitiert → CI-Gate).

- [ ] **Step 4: Commit** — `git commit -m "feat(comments): ArticleComments in Haftpflicht/Decoder/SV/Cornerstone-Seiten eingehängt"`

---

## Self-Review (gegen Spec)

1. **Spec-Coverage:** Identität/Magic-Link → Task 2 ✓. Username-Wahl + Consent → Task 3+4 ✓. Posten (RLS pending) → Task 3 ✓. Anzeige approved + Schema + Kennzeichnung → Task 5 ✓. Einbindung → Task 6 ✓. *Nicht hier (spätere Pläne):* Moderation-UI/Admin-RLS (Plan 3), Rate-Limit/Turnstile + IndexNow (Plan 4), DSE-Text/DPIA (Plan 5).
2. **Platzhalter:** keiner — exakter Code je Step.
3. **Typ-Konsistenz:** `getAuthState()` in Task 5 Step 2 nachgezogen (statt `getMyProfile` für die 3-State-Logik) — Interface-Korrektur dokumentiert. `submitComment`/`ensureUsername`/`requestCommentLogin` alle `{ ok; error? }`. `slug` durchgängig.
4. **Sicherheit:** Posten über `createClient()` (RLS, als User) — nie Admin-Client. Open-Redirect-Schutz im Callback. Consent vor Username-Insert.

## Akzeptanz Plan 2

- [ ] `npm run test` grün (Daten-Layer-Mapping-Tests + Bestand).
- [ ] `npm run build` grün (CI).
- [ ] Manuell/E2E: E-Mail → Magic-Link → Username → Kommentar → erscheint nach Freigabe (Freigabe = Plan 3 / vorerst SQL).
- [ ] Kommentar-Sektion auf Haftpflicht/Decoder/SV/Cornerstone-Artikeln sichtbar, mit Kennzeichnung.

## Offen / Folge (für die nächsten Pläne)

- **Plan 3:** Admin-Portal-Moderation (approve/reject/hide/block) + Admin-RLS-Policies + trusted/auto-approve.
- **Plan 4:** Rate-Limit (hash-ip) + Turnstile + IndexNow-Ping on approve.
- **Plan 5:** DSE-Update + Netiquette-Page + DPIA-Kurzcheck (Launch-Gate).
- `next`-Pfad in `requestCommentLogin` pro Content-Typ generalisieren (aktuell `/haftpflicht/<slug>`).
