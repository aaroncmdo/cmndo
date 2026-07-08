import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './redirect-stub-scan.mjs'

describe('scanContent (Redirect-Stub-Detektor)', () => {
  it('flaggt reinen sync Redirect-Stub', () => {
    const src = `import { redirect } from 'next/navigation'
export default function Page() { redirect('/woanders') }`
    expect(scanContent(src)).not.toBeNull()
  })

  it('flaggt async data-driven Redirect-Router (mehrere conditional redirects, KEIN Content-return)', () => {
    const src = `import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
export default async function Page() {
  const u = await getUser()
  if (!u) redirect('/login')
  if (u.done) redirect('/dashboard')
  redirect('/onboarding')
}`
    expect(scanContent(src)).not.toBeNull()
  })

  it('flaggt permanentRedirect-Stub', () => {
    const src = `import { permanentRedirect } from 'next/navigation'
export default function Page() { permanentRedirect('/neu') }`
    expect(scanContent(src)).not.toBeNull()
  })

  it('flaggt reinen Stub auch wenn die redirect-Ziel-URL "return" enthaelt (String gestript)', () => {
    const src = `import { redirect } from 'next/navigation'
export default function Page() { redirect('/return-to-sender') }`
    expect(scanContent(src)).not.toBeNull()
  })

  it('flaggt `return redirect(...)` (immer noch reiner Stub, kein Content)', () => {
    const src = `import { redirect } from 'next/navigation'
export default function Page() { return redirect('/x') }`
    expect(scanContent(src)).not.toBeNull()
  })

  it('Kommentar-"return" maskiert einen echten Stub NICHT', () => {
    const src = `import { redirect } from 'next/navigation'
// this page does not return anything — it just redirects
export default function Page() { redirect('/x') }`
    expect(scanContent(src)).not.toBeNull()
  })

  it('flaggt KEINE Content-Seite mit Auth-Guard (redirect + return JSX)', () => {
    const src = `import { redirect } from 'next/navigation'
export default async function Page() {
  const u = await getUser()
  if (!u) redirect('/login')
  return <div>Inhalt</div>
}`
    expect(scanContent(src)).toBeNull()
  })

  it('flaggt KEINE normale Content-Seite (kein redirect)', () => {
    const src = `export default function Page() { return <main>Hallo</main> }`
    expect(scanContent(src)).toBeNull()
  })

  it('flaggt KEINE Seite die redirect NICHT aus next/navigation importiert', () => {
    const src = `import { redirect } from '@/lib/local-redirect'
export default function Page() { redirect('/x') }`
    expect(scanContent(src)).toBeNull()
  })
})

describe('diffBaseline', () => {
  it('added = neue, removed = behobene', () => {
    const d = diffBaseline(['a', 'c'], ['a', 'b'])
    expect(d.added).toEqual(['c'])
    expect(d.removed).toEqual(['b'])
  })
})
