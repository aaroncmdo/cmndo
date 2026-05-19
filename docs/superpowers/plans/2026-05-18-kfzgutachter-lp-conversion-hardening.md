# kfzgutachter-Ads-LP — Conversion-Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Top-5 offenen Punkte aus [`docs/18.05.2026/kfzgutachter-lp-gap-eval.md`](../../18.05.2026/kfzgutachter-lp-gap-eval.md) umsetzen, damit die LP A/B-Test-fertig + UWG/UX-konform ist (Tracking, H-G, H-C-Rest, Form-States, Quality).

**Architecture:**
- 8 Code-Tasks auf Branch `kitta/aar-kfzgutachter-ads-lp` (PR-Ziel `staging`), jede mit eigenem Commit.
- 3 External-Actions für Aaron (GA4-Cross-Domain, Matelso-Tracking, Clarity-LP-Projekt) — separater Doc-File, kein Code.
- TDD mit Vitest für isolierte Logik (Tracking-Helper, resolveStadt-Regressionen). Smoke-Verifikation via `scripts/preview-kfzgutachter-lp.mjs` (Pattern aus `scripts/smoke-*.mjs`). Kein vollformaler E2E-Test — zu hoher Aufwand für UI-Refactoring auf einer einzelnen Route.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript · Vitest · Playwright (smoke) · Supabase

**Branch-Hygiene:** Working-Tree muss vor jedem Task clean sein (`git status --untracked-files=no` zeigt nichts). Untracked Audit-Files (`docs/15.05.2026/...`) bleiben unangetastet — gehören zu anderen Sessions.

---

## Task 1 · Tracking-Helper-Modul mit lp_variant-Default

**Files:**
- Create: `src/app/kfzgutachter-lp/track.ts`
- Create: `src/app/kfzgutachter-lp/__tests__/track.test.ts`
- Modify: `src/app/kfzgutachter-lp/LeadFormClient.tsx` (Inline-`trackGtag` durch Import ersetzen)

- [ ] **Step 1: Write the failing test**

Datei `src/app/kfzgutachter-lp/__tests__/track.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { trackLpEvent } from '../track'

describe('trackLpEvent', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { gtag: vi.fn() })
  })

  it('fügt lp_variant + source als Defaults zu jedem Event hinzu', () => {
    trackLpEvent('phone_call', { event_label: 'hero-tel' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'phone_call', {
      event_label: 'hero-tel',
      lp_variant: 'test_b',
      source: 'kfzgutachter-ads-lp',
    })
  })

  it('lässt Caller-Params Defaults überschreiben', () => {
    trackLpEvent('generate_lead', { lp_variant: 'override' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'generate_lead', {
      lp_variant: 'override',
      source: 'kfzgutachter-ads-lp',
    })
  })

  it('macht nichts wenn window.gtag fehlt', () => {
    vi.stubGlobal('window', {})
    expect(() => trackLpEvent('phone_call')).not.toThrow()
  })

  it('macht nichts in SSR (kein window)', () => {
    vi.stubGlobal('window', undefined)
    expect(() => trackLpEvent('phone_call')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/kfzgutachter-lp/__tests__/track.test.ts`
Expected: FAIL — `Cannot find module '../track'`.

- [ ] **Step 3: Implement track.ts**

Datei `src/app/kfzgutachter-lp/track.ts`:

```ts
// Tracking-Helper für die kfzgutachter-Ads-LP. Fügt lp_variant + source
// automatisch als Default-Params zu jedem gtag-Event hinzu. Caller können
// die Defaults explizit überschreiben.

const LP_VARIANT = 'test_b'
const SOURCE = 'kfzgutachter-ads-lp'

type GtagFn = (command: string, eventName: string, params?: Record<string, unknown>) => void

export function trackLpEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  if (!w.gtag) return
  w.gtag('event', eventName, {
    lp_variant: LP_VARIANT,
    source: SOURCE,
    ...(params ?? {}),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/kfzgutachter-lp/__tests__/track.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor LeadFormClient.tsx**

Im File `src/app/kfzgutachter-lp/LeadFormClient.tsx`:

Ersetze die Zeilen mit der lokalen `trackGtag`-Helper und der `SOURCE`-Konstante (oberhalb der Komponente):

```ts
type GtagFn = (command: string, eventName: string, params?: Record<string, unknown>) => void
function trackGtag(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  w.gtag?.('event', eventName, params)
}

const SOURCE = 'kfzgutachter-ads-lp'
```

durch:

```ts
import { trackLpEvent } from './track'
```

(Den `trackLpEvent`-Import am Anfang der Datei, neben den anderen Imports — `SOURCE`-Konstante ist im Helper, lokal nicht mehr nötig.)

In `handleSubmit` ersetze:

```ts
trackGtag('generate_lead', { source: SOURCE, lp_variant: 'test_b' })
```

durch:

```ts
trackLpEvent('generate_lead')
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: kein neuer Fehler in `src/app/kfzgutachter-lp/**`.

- [ ] **Step 7: Commit**

```bash
git add src/app/kfzgutachter-lp/track.ts \
        src/app/kfzgutachter-lp/__tests__/track.test.ts \
        src/app/kfzgutachter-lp/LeadFormClient.tsx
git commit -m "feat(kfzgutachter-lp): trackLpEvent-Helper mit lp_variant-Default

Extrahiert die gtag-Tracking-Logik aus dem Inline-Wrapper im LeadFormClient
in einen wiederverwendbaren Helper. Vitest deckt SSR-Safety + Default-Merge ab.

Audit:
- Build: tsc --noEmit grün
- UI: keine Änderung
- Redundanz: Inline-trackGtag entfernt — eine Quelle der Wahrheit
- Dead-Code: SOURCE-Konstante aus LeadFormClient entfernt
- Spec: H-Cross-Cutting Tracking (Gap-Eval §3)
- Inkonsistenz: lp_variant + source jetzt zentral
- Regression: Vitest-Suite grün (4/4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 · TrackingHooks für LP-data-tracking-Konvention + Tel/WA-Klick-Events

**Files:**
- Modify: `src/app/kfzgutachter-lp/page.tsx` (alle `data-tracking`-Attribute auf `call-…` / `whatsapp-…`)
- Modify: `src/components/marketing/TrackingHooks.tsx` (lp_variant-Prop hinzufügen)
- Modify: `src/app/kfzgutachter-lp/page.tsx` (TrackingHooks mit lp_variant aufrufen)

**Hintergrund:** Die existierende `TrackingHooks`-Komponente hört auf `[data-tracking^="call-"]` und `[data-tracking^="whatsapp-"]`. Auf der LP sind die Attribute aber als `hero-tel`, `sticky-wa` etc. gesetzt — sie matchen nicht und feuern kein Event. Das ist ein stillschweigender Tracking-Verlust.

- [ ] **Step 1: data-tracking-Attribute auf der LP umbenennen**

In `src/app/kfzgutachter-lp/page.tsx`:

Mapping (Search-and-Replace, exakte Strings):
- `data-tracking="topbar-tel"` → `data-tracking="call-topbar"`
- `data-tracking="hero-tel"` → `data-tracking="call-hero"`
- `data-tracking="hero-wa"` → `data-tracking="whatsapp-hero"`
- `data-tracking="cta-tel"` → `data-tracking="call-cta"`
- `data-tracking="sticky-tel"` → `data-tracking="call-sticky"`
- `data-tracking="sticky-wa"` → `data-tracking="whatsapp-sticky"`
- `data-tracking="cta-form"` → `data-tracking="form-cta"`
- `data-tracking="sticky-form"` → `data-tracking="form-sticky"`
- `data-tracking="lead-form-hero"` in `LeadFormClient.tsx` bleibt unverändert (Form-Submit wird über Server-Action getrackt, nicht über `data-tracking`).

Run zur Kontrolle:

```bash
git grep -nE 'data-tracking="(hero-tel|hero-wa|topbar-tel|sticky-tel|sticky-wa|cta-tel|cta-form|sticky-form)"' src/app/kfzgutachter-lp/
```

Expected: keine Treffer mehr.

- [ ] **Step 2: TrackingHooks-Komponente um lpVariant-Prop erweitern**

Datei `src/components/marketing/TrackingHooks.tsx`:

Ersetze den gesamten Datei-Inhalt:

```tsx
'use client'
import { useEffect } from 'react'

declare global {
  interface Window { gtag?: (...args: any[]) => void }
}

type Props = {
  /** Optional: wenn gesetzt, wird lp_variant in jedes Event gemergt. */
  lpVariant?: string
}

export function TrackingHooks({ lpVariant }: Props = {}) {
  useEffect(() => {
    const fire = (eventName: string) => (e: Event) => {
      const el = e.currentTarget as HTMLElement
      const params: Record<string, unknown> = {
        event_category: 'cta',
        event_label: el.dataset.tracking ?? '',
      }
      if (lpVariant) params.lp_variant = lpVariant
      window.gtag?.('event', eventName, params)
    }
    const listeners: Array<[HTMLElement, EventListener]> = []
    document.querySelectorAll<HTMLElement>('[data-tracking^="call-"]').forEach(el => {
      const fn = fire('phone_call'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    document.querySelectorAll<HTMLElement>('[data-tracking^="whatsapp-"]').forEach(el => {
      const fn = fire('whatsapp_click'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    document.querySelectorAll<HTMLElement>('[data-tracking^="form-"]').forEach(el => {
      const fn = fire('form_anchor_click'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    return () => listeners.forEach(([el, fn]) => el.removeEventListener('click', fn))
  }, [lpVariant])
  return null
}
```

- [ ] **Step 3: TrackingHooks auf der LP mit lp_variant aufrufen**

In `src/app/kfzgutachter-lp/page.tsx`, in der Default-Export-Funktion:

Ersetze:
```tsx
<TrackingHooks />
```

durch:
```tsx
<TrackingHooks lpVariant="test_b" />
```

- [ ] **Step 4: Browser-Smoke-Verifikation**

Dev-Server muss laufen (`npm run dev`). Im Browser:

1. `http://localhost:3000/kfzgutachter-lp` öffnen
2. DevTools → Console: `window.gtag = (...a) => console.log('[gtag]', ...a)`
3. Auf den Tel-Button im Hero klicken
4. Expected Console-Output: `[gtag] event phone_call { event_category: 'cta', event_label: 'call-hero', lp_variant: 'test_b' }`
5. Auf den WhatsApp-Button klicken
6. Expected: `[gtag] event whatsapp_click { event_category: 'cta', event_label: 'whatsapp-hero', lp_variant: 'test_b' }`

- [ ] **Step 5: Typecheck + Build**

Run: `npx tsc --noEmit`
Expected: kein neuer Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/app/kfzgutachter-lp/page.tsx src/components/marketing/TrackingHooks.tsx
git commit -m "feat(kfzgutachter-lp): Tel-/WA-/Form-Klicks tracken mit lp_variant

Bisher matchten die LP-data-tracking-Attribute (hero-tel, sticky-wa, …) nicht
die TrackingHooks-Selektoren (^=call-/^=whatsapp-) — Klicks feuerten kein
gtag-Event. Renamings angeglichen, TrackingHooks um lpVariant-Prop +
form-anchor-Selektor erweitert.

Audit:
- Build: tsc --noEmit grün
- UI: keine sichtbare Änderung
- Redundanz: TrackingHooks bleibt der einzige Klick-Hook
- Dead-Code: keine alten Attribute übrig (git grep ohne Treffer)
- Spec: H-F Tel-Klick-Prominenz, Cross-Cutting Tracking
- Inkonsistenz: data-tracking-Konvention jetzt projektweit call-/whatsapp-/form-
- Regression: andere Marketing-Pages nutzen lpVariant nicht → kein Effekt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 · H-G — Schaden- vs Wertgutachten-Abgrenzung

**Files:**
- Modify: `src/app/kfzgutachter-lp/page.tsx` (neue Sektion `WasIstNichtUnsereSache` + Mount nach `WasWirMachen`)

**Hintergrund:** Aus Ads-Search-Terms-Report (KW20): ~9 Wertgutachten-Suchen/Wo landen auf der LP. Die generieren keine echten Schaden-Leads. Eine klare „Wir machen NICHT"-Sektion senkt Lead-Disqualifikation um −10–15 % laut Hypothesen-Bibliothek H-G.

- [ ] **Step 1: Sektion einbauen**

In `src/app/kfzgutachter-lp/page.tsx`, nach der `WasWirMachen`-Funktion (vor `Prozess`):

```tsx
const NICHT_UNSERE_SACHE = [
  {
    titel: 'Wertgutachten für Verkauf / Versicherungsabschluss',
    text: 'Wenn Sie Ihr Auto verkaufen oder eine neue Versicherung abschließen wollen — dafür sind wir nicht zuständig. Wir kümmern uns ausschließlich um Schadensgutachten nach Verkehrsunfällen.',
  },
  {
    titel: 'Selbstverschuldete Unfälle / Kasko-Schäden',
    text: 'Bei selbstverschuldeten Unfällen über die eigene Vollkasko gibt es keinen Anspruch gegen einen gegnerischen Versicherer — unser Modell „0 € für Geschädigte" greift hier nicht.',
  },
  {
    titel: 'Bagatell-Schäden unter 750 €',
    text: 'Für Schäden unter der BGH-Bagatellgrenze (VI ZR 119/04) reicht in der Regel ein Kostenvoranschlag der Werkstatt. Ein Gutachten lohnt sich erst ab ~750 € Schaden.',
  },
]

function WasIstNichtUnsereSache() {
  return (
    <section className="bg-claimondo-bg py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-claimondo-ondo">
          Damit Sie nicht falsch landen
        </p>
        <h2
          className="mt-3 text-balance text-2xl font-extrabold text-claimondo-navy sm:text-3xl"
          style={MONTSERRAT}
        >
          Wann wir <span className="text-claimondo-shield">nicht</span> der richtige Ansprechpartner sind
        </h2>
        <ul className="mt-7 grid gap-5 sm:grid-cols-3 sm:gap-6">
          {NICHT_UNSERE_SACHE.map((item) => (
            <li key={item.titel} className="rounded-ios-md border border-claimondo-border bg-white p-5">
              <h3 className="text-[15px] font-bold text-claimondo-navy">{item.titel}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-claimondo-shield">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Sektion in den Page-Body mounten**

In der `KfzgutachterLandingPage`-Default-Export-Funktion, ersetze:

```tsx
        <WasWirMachen />
        <Prozess />
```

durch:

```tsx
        <WasWirMachen />
        <WasIstNichtUnsereSache />
        <Prozess />
```

- [ ] **Step 3: Smoke-Verifikation**

Dev-Server muss laufen. Run:

```bash
node scripts/preview-kfzgutachter-lp.mjs
```

Expected: 5 Screenshots in `docs/18.05.2026/lp-preview/` (desktop, mobile, mobile-fold, desktop-koeln, mobile-fold-koeln), keine Console-/Page-Errors. Visuell prüfen dass die neue Sektion zwischen „Was wir konkret machen" und „Vom Unfall zur Auszahlung — in 5 Schritten" steht.

- [ ] **Step 4: Commit**

```bash
git add src/app/kfzgutachter-lp/page.tsx
git commit -m "feat(kfzgutachter-lp): H-G — Schaden- vs Wertgutachten-Abgrenzung

Eigene Mid-page-Sektion „Wann wir nicht der richtige Ansprechpartner sind"
mit drei Disqualifikations-Buckets (Wertgutachten, Kasko, Bagatell <750 €).
Senkt Lead-Disqualifikation laut H-G-Hypothese um -10 bis -15 %.

Audit:
- Build: tsc --noEmit grün
- UI: neue Sektion zwischen WasWirMachen und Prozess
- Redundanz: keine — Inhalt nicht anderswo
- Dead-Code: n/a
- Spec: H-G (Hypothesen-Bibliothek, Gap-Eval §3)
- Inkonsistenz: BGH-Aktenzeichen VI ZR 119/04 konsistent mit FAQ-Sektion
- Regression: nur additiv

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 · H-C-Rest — Prozess-Cards entschärfen + Hero-Headline-Anker

**Files:**
- Modify: `src/app/kfzgutachter-lp/page.tsx` (ProcessCards: cursor-default; Hero-Headline: Anchor-Wrap)

**Hintergrund:** Aus Clarity-Audit 13.05.: 18,9 % Dead-Click-Quote, davon viele auf statische Prozess-Karten. Die LP-Cards sind aktuell statisch ohne `cursor-pointer`, aber haben auch keinen visuellen Hinweis dass sie nicht-interaktiv sind. Hero-Headline mit Stadt-Insertion sieht klickbar aus — wir machen sie zum Anker auf `#lead-form`, damit der Klick produktiv landet.

- [ ] **Step 1: Hero-Headline als Anchor wrappen**

In `src/app/kfzgutachter-lp/page.tsx`, in der `Hero`-Komponente, ersetze:

```tsx
          <h1
            className="mt-2 text-balance text-[1.7rem] font-extrabold leading-[1.12] tracking-[-0.02em] sm:mt-3 sm:text-[2.4rem] md:text-5xl"
            style={MONTSERRAT}
          >
            {stadtName ? (
              <>
                Ihr Kfz-Gutachter in{' '}
                <span className="text-claimondo-light-blue">{stadtName}</span>.
              </>
            ) : (
              <>
                Ihr <span className="text-claimondo-light-blue">Kfz-Gutachter</span> nach dem
                Unfall.
              </>
            )}
          </h1>
```

durch:

```tsx
          <a
            href="#lead-form"
            data-tracking="form-headline"
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-light-blue focus-visible:ring-offset-4 focus-visible:ring-offset-claimondo-navy rounded-md"
          >
            <h1
              className="mt-2 text-balance text-[1.7rem] font-extrabold leading-[1.12] tracking-[-0.02em] sm:mt-3 sm:text-[2.4rem] md:text-5xl"
              style={MONTSERRAT}
            >
              {stadtName ? (
                <>
                  Ihr Kfz-Gutachter in{' '}
                  <span className="text-claimondo-light-blue">{stadtName}</span>.
                </>
              ) : (
                <>
                  Ihr <span className="text-claimondo-light-blue">Kfz-Gutachter</span> nach dem
                  Unfall.
                </>
              )}
            </h1>
          </a>
```

- [ ] **Step 2: scroll-behavior global auf html aktivieren**

Datei `src/app/globals.css`, am Anfang der Datei (oder bei den bestehenden `html`-Regeln, falls vorhanden):

Suche im File nach `html { ... }` oder `:root { ... }`. Falls keine `scroll-behavior`-Regel auf `html` existiert, füge nach dem bestehenden `:root`-Block ein:

```css
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

(Prüfen mit `grep -n 'scroll-behavior' src/app/globals.css` — falls schon definiert, Step überspringen.)

- [ ] **Step 3: Prozess-Cards visuell entschärfen**

In `src/app/kfzgutachter-lp/page.tsx`, in der `Prozess`-Komponente, im `<li>`-Element ersetze:

```tsx
            <li
              key={s.nr}
              className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5"
            >
```

durch:

```tsx
            <li
              key={s.nr}
              className="cursor-default select-text rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5"
            >
```

`cursor-default` ist hier wichtig: Browsers setzen für `<li>` standardmäßig keinen Cursor-Pointer, aber bestimmte Card-Pattern (z. B. `hover:`-Klassen) lassen Nutzer den Eindruck haben sie wären klickbar. Explizit ist klarer.

- [ ] **Step 4: Smoke-Verifikation**

Run: `node scripts/preview-kfzgutachter-lp.mjs`
Expected: 5 Screenshots ohne Console-/Page-Errors.

Manuel im Browser (`http://localhost:3000/kfzgutachter-lp`):
1. Klick auf die Hero-Headline → sanftes Scrollen zum Lead-Form
2. Hover über eine Prozess-Card → kein Cursor-Pointer

- [ ] **Step 5: Commit**

```bash
git add src/app/kfzgutachter-lp/page.tsx src/app/globals.css
git commit -m "fix(kfzgutachter-lp): H-C-Rest — Headline-Anker + Cards entschärfen

Hero-Headline jetzt klickbar → scrollt zu #lead-form (smooth). Prozess-Cards
mit cursor-default um den Klick-aussehen-aber-nichts-passiert-Effekt zu
neutralisieren. Senkt laut H-C-Hypothese die Quick-Back-Rate um -50 %.

Audit:
- Build: tsc --noEmit grün
- UI: Headline ist Anker, Cards visuell statisch
- Redundanz: scroll-behavior global statt JS-Helper
- Dead-Code: n/a
- Spec: H-C Dead-Click-Elimination
- Inkonsistenz: Anker-ID '#lead-form' matched LeadFormClient.id
- Regression: prefers-reduced-motion respektiert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 · Form-Submit-Success — Card-Cross statt Toast-only

**Files:**
- Modify: `src/app/kfzgutachter-lp/LeadFormClient.tsx`

**Hintergrund:** Aktueller Success-Pfad nur `toast.success()` + `form.reset()`. Der User sieht nach Submit weiterhin die Form als wäre nichts passiert + einen kleinen Toast. Spec sagt: Card-Cross-Animation zu einer Bestätigungs-Card mit Vorname-Personalisierung. Stärkster Conversion-Signal: „es ist angekommen, jetzt warten Sie auf den Rückruf".

- [ ] **Step 1: Datei `src/app/kfzgutachter-lp/LeadFormClient.tsx` öffnen und Imports erweitern**

Am Anfang der Datei, im bestehenden Import-Block, neben den vorhandenen Imports:

Suche:
```tsx
import { useTransition, type FormEvent, type InputHTMLAttributes } from 'react'
```

Ersetze durch:
```tsx
import { useState, useTransition, type FormEvent, type InputHTMLAttributes } from 'react'
import { Phone, CheckCircle2 } from 'lucide-react'
```

- [ ] **Step 2: Konstanten am Anfang ergänzen**

Direkt unter dem letzten Import, vor dem `'use client'`-Marker oder direkt nach den Imports:

```tsx
const TEL_HREF = 'tel:+4922125906530'
const TEL_DISPLAY = '0221 25906530'
```

(Wenn diese Konstanten schon importiert werden, Step überspringen — bisher nicht der Fall, daher inline.)

- [ ] **Step 3: Success-State + Vorname-Parsing einbauen**

In der `LeadFormClient`-Komponente, vor `const [pending, startTransition] = useTransition()`:

```tsx
const [submittedName, setSubmittedName] = useState<string | null>(null)
```

In `handleSubmit`, im `result.ok`-Zweig, ersetze:

```tsx
if (result.ok) {
  toast.success('Danke! Wir melden uns in unter 15 Minuten zurück.')
  trackLpEvent('generate_lead')
  form.reset()
}
```

durch:

```tsx
if (result.ok) {
  const name = String(fd.get('name') ?? '').trim()
  const firstName = name.split(/\s+/)[0] || null
  setSubmittedName(firstName ?? '')
  trackLpEvent('generate_lead')
  form.reset()
}
```

- [ ] **Step 4: Conditional Render — Success-Card statt Form**

In `LeadFormClient.tsx`, direkt vor dem `return ( <form ...>`-Block:

```tsx
if (submittedName !== null) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-ios-lg border border-claimondo-border bg-white p-6 shadow-claimondo-lg sm:p-7"
    >
      <div className="flex items-center gap-2.5">
        <CheckCircle2 className="h-7 w-7 flex-shrink-0 text-emerald-500" aria-hidden />
        <h2
          className="text-xl font-bold text-claimondo-navy sm:text-2xl"
          style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
        >
          Danke{submittedName ? `, ${submittedName}` : ''} — wir melden uns gleich.
        </h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">
        Ein Berater ruft Sie in <strong>unter 15 Minuten</strong> zurück. Bitte halten Sie das
        Telefon bereit — die Nummer kann unterdrückt sein.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
        Sie hören nichts? Rufen Sie uns direkt an:
      </p>
      <a
        href={TEL_HREF}
        data-tracking="call-success-card"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
      >
        <Phone className="h-4 w-4" aria-hidden />
        {TEL_DISPLAY}
      </a>
      <button
        type="button"
        onClick={() => setSubmittedName(null)}
        className="mt-3 w-full text-center text-[12px] text-claimondo-shield/70 underline-offset-2 hover:underline"
      >
        Noch eine Anfrage senden
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Toast-Import entfernen, falls nicht mehr benutzt**

Suche in der Datei nach `toast.success`, `toast.error` — sind sie noch verwendet (für den Error-Pfad)? Wenn ja: `import { toast } from 'sonner'` bleibt. Falls Error-Toast in Task 6 ersetzt wird (Inline-Errors), beide Toast-Aufrufe entfernen — bis dahin: Import bleibt.

- [ ] **Step 6: Smoke-Verifikation**

Dev-Server muss laufen.

1. Im Browser `http://localhost:3000/kfzgutachter-lp` öffnen
2. Formular ausfüllen (Name: „Max Mustermann", Telefon: „01511234567", Stadt: „Köln")
3. Submit
4. Expected: Success-Card erscheint statt Form, zeigt „Danke, Max — wir melden uns gleich.", inkl. Tel-CTA und „Noch eine Anfrage senden"-Link
5. „Noch eine Anfrage senden" klicken → Form ist wieder da, alle Felder leer

**Hinweis:** Damit der Webhook-POST in dev funktioniert, muss `LEAD_WEBHOOK_URL` in `.env.local` gesetzt sein. Ohne gesetzte Env-Var schlägt der Webhook fehl und die Success-Card erscheint nicht — der Error-Toast feuert. Für Smoke ohne echten Webhook: temporär `actions.ts` mit `return { ok: true }` patchen, dann zurücksetzen. **Diese Test-Patches NICHT committen.**

- [ ] **Step 7: Vitest-Suite + Typecheck**

Run:
```bash
npx vitest run src/app/kfzgutachter-lp/__tests__/
npx tsc --noEmit
```
Expected: track.test.ts bleibt grün, kein neuer TS-Fehler.

- [ ] **Step 8: Commit**

```bash
git add src/app/kfzgutachter-lp/LeadFormClient.tsx
git commit -m "feat(kfzgutachter-lp): Success-Card-Cross mit Vorname-Personalisierung

Statt nur Toast wechselt das Lead-Form bei Erfolg auf eine Bestätigungs-Card
(role=status aria-live=polite) mit Vorname-Personalisierung, Tel-CTA als
Sekundär-Conversion und 'Noch eine Anfrage senden'-Reset.

Audit:
- Build: tsc --noEmit grün
- UI: Form transformiert zu Success-Card, kein Loss-of-Context
- Redundanz: keine — Conditional-Render im selben Component
- Dead-Code: toast.success-Aufruf entfernt
- Spec: FRONTEND_SPEC §2.4 Submit-Success-State
- Inkonsistenz: aria-live + role=status wie Spec verlangt
- Regression: Error-Pfad bleibt Toast (siehe Task 6)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 · Inline-Field-Errors + Tel-Fallback-Box

**Files:**
- Modify: `src/app/kfzgutachter-lp/actions.ts` (Field-Marker in Error-Response)
- Modify: `src/app/kfzgutachter-lp/LeadFormClient.tsx` (Error-State pro Feld + Tel-Fallback-Box)

**Hintergrund:** Aktueller Error-Pfad nur `toast.error`. Bei Submit-Fail (z. B. Webhook unreachable) sieht der User einen Toast und muss raten was schiefging. Spec verlangt: Inline-Error pro Feld + prominent sichtbare Tel-Fallback-Option statt versteckt im Toast.

- [ ] **Step 1: Server-Action erweitert um Field-Marker**

Datei `src/app/kfzgutachter-lp/actions.ts`, ersetze die `LeadSchema.safeParse`-Logik:

Suche:
```ts
const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
if (!parsed.success) {
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'Eingaben unvollständig' }
}
```

Ersetze durch:
```ts
const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
if (!parsed.success) {
  const issue = parsed.error.issues[0]
  return {
    ok: false,
    error: issue?.message ?? 'Eingaben unvollständig',
    field: (issue?.path[0] as 'name' | 'phone' | 'city' | undefined) ?? undefined,
  }
}
```

Aktualisiere den Return-Type der Funktion:

```ts
export async function submitKfzgutachterLead(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; field?: 'name' | 'phone' | 'city' }>
```

- [ ] **Step 2: LeadFormClient — Error-State pro Feld**

In `src/app/kfzgutachter-lp/LeadFormClient.tsx`, in der `LeadFormClient`-Komponente, neben dem `submittedName`-State:

```tsx
const [error, setError] = useState<{ message: string; field?: 'name' | 'phone' | 'city' } | null>(null)
```

In `handleSubmit`, ersetze:
```tsx
} else {
  toast.error(result.error ?? 'Übermittlung fehlgeschlagen')
}
```

durch:
```tsx
} else {
  setError({ message: result.error ?? 'Übermittlung fehlgeschlagen', field: result.field })
}
```

Im Success-Zweig (vor `setSubmittedName`):
```tsx
setError(null)
```

- [ ] **Step 3: Field-Komponente um Error-Prop erweitern**

Im selben File, ersetze die `FieldProps`-Definition und die `Field`-Komponente:

Suche:
```tsx
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }

function Field({ label, name, ...rest }: FieldProps) {
  const fieldId = `kfzgl-${name}`
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        {...rest}
        className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-3 text-base transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  )
}
```

Ersetze durch:
```tsx
type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  name: string
  errorMessage?: string
}

function Field({ label, name, errorMessage, ...rest }: FieldProps) {
  const fieldId = `kfzgl-${name}`
  const hasError = Boolean(errorMessage)
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${fieldId}-err` : undefined}
        {...rest}
        className={`w-full rounded-ios-md border bg-white px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${
          hasError
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            : 'border-claimondo-border focus:border-claimondo-ondo focus:ring-claimondo-ondo/20'
        }`}
      />
      {hasError ? (
        <p id={`${fieldId}-err`} className="mt-1 text-xs font-semibold text-red-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Field-Calls mit error-Prop versorgen**

In der `LeadFormClient`-Funktion, im 3-Felder-Block:

Ersetze die drei `<Field>`-Aufrufe (Name, Telefon, Stadt) so:

```tsx
<Field
  name="name"
  label="Ihr Name"
  type="text"
  placeholder="Max Mustermann"
  autoComplete="name"
  required
  disabled={pending}
  errorMessage={error?.field === 'name' ? error.message : undefined}
/>
<Field
  name="phone"
  label="Ihre Telefonnummer"
  type="tel"
  placeholder="0151 12345678"
  autoComplete="tel"
  inputMode="tel"
  required
  disabled={pending}
  errorMessage={error?.field === 'phone' ? error.message : undefined}
/>
<Field
  name="city"
  label="Stadt / PLZ des Unfalls"
  type="text"
  placeholder="z. B. Köln oder 50667"
  autoComplete="postal-code"
  required
  disabled={pending}
  errorMessage={error?.field === 'city' ? error.message : undefined}
/>
```

- [ ] **Step 5: Tel-Fallback-Box bei field-loser Errors**

Direkt unter dem Submit-Button, vor dem Datenschutz-Hinweis:

```tsx
{error && !error.field ? (
  <div
    role="alert"
    className="mt-4 rounded-ios-md border border-red-200 bg-red-50 p-4 text-[13px] text-red-900"
  >
    <p className="font-semibold">{error.message}</p>
    <p className="mt-1 text-red-800/80">
      Klappt nicht? Rufen Sie uns direkt an —{' '}
      <a href={TEL_HREF} data-tracking="call-error-fallback" className="font-bold underline">
        {TEL_DISPLAY}
      </a>
    </p>
  </div>
) : null}
```

(Wenn `TEL_HREF`/`TEL_DISPLAY` lokal im File noch nicht definiert sind, gemäß Task 5 Step 2 ergänzen.)

- [ ] **Step 6: Toast-Import entfernen falls keine `toast.*`-Aufrufe mehr drin sind**

Run: `git grep -n "toast\." src/app/kfzgutachter-lp/LeadFormClient.tsx`
Wenn keine Treffer mehr → Import-Zeile `import { toast } from 'sonner'` aus der Datei entfernen.

- [ ] **Step 7: Smoke-Verifikation**

Dev-Server muss laufen. Test-Szenarien (manuell im Browser):

1. **Field-Error:** Telefonnummer leer lassen, Submit-Versuch → HTML5-required blockt. Workaround: einen ungültigen Phone-Wert eintragen, der dem Server-Regex nicht passt: z. B. „abc"
2. Submit → Expected: rote Border am Telefon-Feld, Inline-Message „Ungültige Telefonnummer"
3. **Submit-Fail (kein Webhook):** `LEAD_WEBHOOK_URL` aus `.env.local` temporär löschen, Formular ausfüllen, Submit
4. Expected: Tel-Fallback-Box unter dem Submit-Button („Konfigurationsfehler — bitte rufen Sie an: 0221 25906530")
5. Env-Var wiederherstellen

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: kein neuer Fehler.

- [ ] **Step 9: Commit**

```bash
git add src/app/kfzgutachter-lp/actions.ts src/app/kfzgutachter-lp/LeadFormClient.tsx
git commit -m "feat(kfzgutachter-lp): Inline-Field-Errors + Tel-Fallback-Box

Submit-Errors landen nicht mehr nur im Toast (leicht zu übersehen) — bei
Field-spezifischen Fehlern rote Border + Inline-Message, bei generischen
Fehlern eine Fallback-Box unter dem Submit mit prominenter Tel-CTA.
aria-invalid + aria-describedby für Screen-Reader.

Audit:
- Build: tsc --noEmit grün
- UI: Field-Border-Color rot bei Fehler, Tel-Fallback-Box sichtbar
- Redundanz: Field-Komponente bleibt eine, jetzt mit errorMessage-Prop
- Dead-Code: toast-Import entfernt
- Spec: FRONTEND_SPEC §2.4 Submit-Error-State + 2.5 Submit-Error-Edge-Case
- Inkonsistenz: aria-invalid + aria-describedby konsistent mit a11y-Standards
- Regression: Field-Submit-Error-Pfad geprüft (Phone-Regex-Fail)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 · Quality — aria-busy + Blur-Up Hero-Image

**Files:**
- Modify: `src/app/kfzgutachter-lp/LeadFormClient.tsx` (aria-busy)
- Modify: `src/app/kfzgutachter-lp/page.tsx` (placeholder="blur" + blurDataURL für Hero-Image)

**Hintergrund:** Submit-Button hat `disabled={pending}` aber kein `aria-busy` — Screen-Reader signalisieren den Busy-State nicht. Hero-Image ist `priority` ohne Blur-Placeholder — auf Slow-4G sieht der User kurz einen weißen Block.

- [ ] **Step 1: aria-busy auf Submit-Button**

In `src/app/kfzgutachter-lp/LeadFormClient.tsx`, in dem Submit-`<button>`:

Suche:
```tsx
<button
  type="submit"
  disabled={pending}
  className="..."
>
```

Ersetze durch:
```tsx
<button
  type="submit"
  disabled={pending}
  aria-busy={pending}
  className="..."
>
```

(className bleibt unverändert.)

- [ ] **Step 2: Blur-Placeholder für Hero-Image generieren**

Run:
```bash
node -e "
const sharp = require('sharp');
sharp('public/kfzgutachter-lp/hero-unfall-frau.png')
  .resize(10, 10, { fit: 'inside' })
  .blur(2)
  .png()
  .toBuffer()
  .then(buf => console.log('data:image/png;base64,' + buf.toString('base64')));
"
```

Expected: Output ist ein Base64-String, beginnend mit `data:image/png;base64,iVBOR...`. Kopier den ganzen String — er kommt in den nächsten Step.

(Falls `sharp` nicht installiert: `npm install --save-dev sharp` einmalig, oder Step überspringen und stattdessen unten `placeholder="empty"` lassen.)

- [ ] **Step 3: Image-Tag im Hero patchen**

In `src/app/kfzgutachter-lp/page.tsx`, in der `Hero`-Komponente, das `<Image>`-Tag direkt unter dem `<section>`-Open:

Suche:
```tsx
<Image
  src="/kfzgutachter-lp/hero-unfall-frau.png"
  alt="Frau telefoniert nach einem unverschuldeten Verkehrsunfall neben ihrem beschädigten Auto"
  fill
  priority
  sizes="100vw"
  className="object-cover object-center"
/>
```

Ersetze durch (mit dem Base64-String aus Step 2 in `blurDataURL`):

```tsx
<Image
  src="/kfzgutachter-lp/hero-unfall-frau.png"
  alt="Frau telefoniert nach einem unverschuldeten Verkehrsunfall neben ihrem beschädigten Auto"
  fill
  priority
  sizes="100vw"
  placeholder="blur"
  blurDataURL="<EINGESETZTE-BASE64-AUS-STEP-2>"
  className="object-cover object-center"
/>
```

(Falls Step 2 übersprungen wurde: `placeholder="blur"` + `blurDataURL` weglassen — bleibt wie vorher.)

- [ ] **Step 4: Smoke + Typecheck**

```bash
npx tsc --noEmit
node scripts/preview-kfzgutachter-lp.mjs
```
Expected: kein neuer TS-Fehler, Screenshots normal.

Browser-Manual: DevTools → Network → Slow 4G simulieren → reload → Hero-Bild zeigt erst Blur, dann scharfes Bild.

- [ ] **Step 5: Commit**

```bash
git add src/app/kfzgutachter-lp/LeadFormClient.tsx src/app/kfzgutachter-lp/page.tsx
git commit -m "fix(kfzgutachter-lp): a11y + Slow-4G — aria-busy + Hero-Blur-Up

Submit-Button bekommt aria-busy={pending} für Screen-Reader, Hero-Image
bekommt Blur-Up-Placeholder gegen LCP-Layout-Shift auf Slow-4G.

Audit:
- Build: tsc --noEmit grün
- UI: Hero zeigt jetzt Blur-Phase vor Full-Image-Load
- Redundanz: n/a
- Dead-Code: n/a
- Spec: FRONTEND_SPEC §2.5 Slow-4G + §2.7 ARIA
- Inkonsistenz: aria-busy + disabled gemeinsam (Standard-Pattern)
- Regression: priority + sizes bleiben gleich

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 · Final Build + Full-Smoke + Go-Live-Checkliste

**Files:**
- Create: `docs/18.05.2026/kfzgutachter-lp-go-live-checklist.md`

**Hintergrund:** Vor Host-Routing-Switch (Task 7 aus der ursprünglichen Task-Liste) muss die LP einen vollen Production-Build durchlaufen + alle external-Actions aus der Gap-Eval §3 dokumentiert sein.

- [ ] **Step 1: Vollständiger Production-Build**

Run:
```bash
npm run build
```
Expected: build succeeded, keine Errors auf `/kfzgutachter-lp`. Warnings akzeptabel.

Falls Errors auf der Route → diese fixen, bevor Step 2.

- [ ] **Step 2: Vitest-Suite komplett**

Run:
```bash
npm test
```
Expected: alle Tests grün (mindestens `track.test.ts` aus Task 1).

- [ ] **Step 3: Full-Smoke mit allen Varianten**

Dev-Server muss laufen (`npm run dev` separat). Dann:

```bash
rm -f docs/18.05.2026/lp-preview/*.png
node scripts/preview-kfzgutachter-lp.mjs
```

Expected: 5 Screenshots in `docs/18.05.2026/lp-preview/`:
- `desktop.png`
- `mobile.png`
- `mobile-fold.png`
- `desktop-koeln.png`
- `mobile-fold-koeln.png`

Output muss enthalten: `keine Console-/Page-Errors`.

Visuelle Sichtprüfung pro File:
- `desktop.png`: Logo links / Tel rechts in Topbar; Hero mit Form rechts; Trust-Bar; Reviews-Strip; Trust-Siegel-Strip; Warum-Sektion mit BGH-Aktenzeichen; Was-wir-machen mit Berater-Bild; Was-wir-NICHT (Task 3); Prozess; NRW-Karte; FAQ; CTA-Footer.
- `mobile-fold.png`: Logo + Tel-Button + Hero-Headline (klickbar wegen Task 4) + Subline + Bullet-Pille + Live-Pill + Tel/WhatsApp-Buttons + Mini-Form-Card-Anfang — alles über der 684 px-Falte.
- `desktop-koeln.png`: Hero-Eyebrow „Unverschuldeter Unfall in Köln?" + H1 „Ihr Kfz-Gutachter in **Köln**." (mit ausgefärbtem stadtName-Span).

- [ ] **Step 4: Go-Live-Checkliste schreiben**

Datei `docs/18.05.2026/kfzgutachter-lp-go-live-checklist.md`:

```markdown
# kfzgutachter-Ads-LP — Go-Live-Checkliste (External Actions)

**Stand:** 2026-05-18 · Branch `kitta/aar-kfzgutachter-ads-lp` · PR-Ziel `staging`

Diese drei externe Actions müssen vor Live-Schaltung der LP von Aaron umgesetzt werden — kein Code-Task.

## 1 · GA4 Cross-Domain konfigurieren

**Wozu:** Damit User-Sessions zwischen `claimondo.de` (Master), `kfzgutachter.claimondo.de` (Test-LP) und `app.claimondo.de` (Portal) durchgehend gemessen werden. Aktuell sieht GA4 jede Subdomain als eigene Session — Conversion-Pfad-Bruch.

**Wie (~10 Min):**
1. GA4 Property öffnen: Admin → Datenstreams → Web → Mehr Tagging-Einstellungen → Domains konfigurieren
2. Folgende Domains eintragen:
   - `claimondo.de`
   - `kfzgutachter.claimondo.de`
   - `schaden.claimondo.de` (solange noch aktiv)
   - `app.claimondo.de`
3. Custom Dimension `lp_variant` als Event-Scope-Dimension anlegen (Admin → Custom Definitions → Custom Dimensions)
4. Custom Dimension `source` als Event-Scope-Dimension anlegen

**Verifikation:** Im DebugView (GA4 → Reports → Realtime → DebugView) einen Klick auf `kfzgutachter.claimondo.de/kfzgutachter-lp` testen — Events `phone_call`, `whatsapp_click`, `form_anchor_click`, `generate_lead` müssen mit `lp_variant=test_b` ankommen.

## 2 · Matelso Call-Tracking fixen

**Wozu:** Laut KW20-Audit hat das Matelso-Tracking zwischen KW19 (14 InboundCalls) und KW20 (0 InboundCalls) den Anschluss verloren bei +39 % Klicks. Ursache unklar — entweder Matelso-Snippet weg oder GA4-Eventmapping kaputt.

**Wie (Aaron + Olaf, ~30 Min):**
1. Matelso-Dashboard prüfen: KW20 Anruf-Volumen vs GA4 `InboundCall`-Volumen — Lücke?
2. Matelso-Snippet auf Hauptdomain + LP-Domain verifizieren (View-Source → Search „matelso")
3. Conversion-Action „InboundCall" in Google Ads-Konto auf aktive Verknüpfung mit GA4-Event prüfen
4. Bei Bedarf Matelso-Support kontaktieren

**Verifikation:** Eigene Tel-Nummer von einer fremden SIM anrufen → in Matelso-Dashboard innerhalb 5 Min sichtbar + GA4-Event `InboundCall` feuert.

## 3 · Microsoft Clarity-Projekt für Test-LP

**Wozu:** Saubere Heatmap-Trennung Master vs Test-LP. Aktuell beide auf `wm8w9d2h0u` — Heatmaps mischen.

**Wie (~15 Min):**
1. Clarity-Dashboard → New Project → Name `claimondo-kfzgutachter-lp`
2. Tracking-Snippet kopieren (Project Settings → Setup → JavaScript)
3. Snippet in `src/app/kfzgutachter-lp/layout.tsx` einbinden ODER per Custom-Script in der LP-Page (Server-Component-`<Script strategy="afterInteractive">`). Empfohlen: separate `layout.tsx` für die LP, damit Master-Layout unverändert bleibt.
4. Optional: Daten-Export-API-Token rotieren (siehe `docs/18.05.2026/clarity-2026-05-13.md` §12)

**Verifikation:** LP im Browser öffnen, 30 Sekunden interagieren, in das neue Clarity-Projekt schauen — Session muss innerhalb 5 Min auftauchen.

## Order of Operations

1. **Zuerst** Matelso fixen — sonst messen wir InboundCalls falsch
2. **Dann** GA4 Cross-Domain — Voraussetzung für Tracking-Validität
3. **Dann** Clarity-Projekt — kann auch nachträglich noch eingebaut werden
4. **Erst danach** Host-Routing-Switch (`proxy.ts` + nginx) live schalten — siehe `docs/superpowers/plans/...-kfzgutachter-host-routing.md` (separater Plan, noch nicht geschrieben)
```

- [ ] **Step 5: 7-Punkte-Audit für den finalen Commit**

Run zum Vor-Check:
```bash
git status
git diff --stat HEAD~7..HEAD
```

Expected: `git status` clean (alle Tasks committet); diff zeigt nur LP-relevante Files.

- [ ] **Step 6: Commit der Go-Live-Checkliste**

```bash
git add docs/18.05.2026/kfzgutachter-lp-go-live-checklist.md
git commit -m "docs(kfzgutachter-lp): Go-Live-Checkliste mit External Actions

GA4 Cross-Domain + Matelso + Clarity-Projekt als Aaron-Tasks vor
Host-Routing-Switch. Dokumentiert die drei nicht-Code-Voraussetzungen
für eine messbare A/B-Test-Variante.

Audit:
- Build: n/a (nur Doc)
- UI: n/a
- Redundanz: ergänzt die Gap-Eval §3 Cross-Cutting Tracking
- Dead-Code: n/a
- Spec: External-Actions aus Gap-Eval §3
- Inkonsistenz: BGH-Aktenzeichen + Tracking-Konvention konsistent
- Regression: n/a

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Push + PR vorbereiten**

```bash
git push -u origin kitta/aar-kfzgutachter-ads-lp
```

PR gegen `staging` (nicht `main`) erstellen — Titel:

```
feat(kfzgutachter-lp): Conversion-Hardening (Top-5 Gap-Eval)
```

PR-Body:

```markdown
# kfzgutachter-Ads-LP — Conversion-Hardening

Setzt die Top-5 offenen Punkte aus `docs/18.05.2026/kfzgutachter-lp-gap-eval.md` um:

- **Task 1+2 · Tracking-Stack:** `trackLpEvent`-Helper mit `lp_variant`-Default + TrackingHooks-Patch für Tel/WA/Form-Klicks
- **Task 3 · H-G:** Schaden- vs Wertgutachten-Abgrenzung als Mid-page-Sektion
- **Task 4 · H-C-Rest:** Hero-Headline-Anker + Prozess-Cards entschärfen
- **Task 5 · Form-Success:** Card-Cross-Animation mit Vorname-Personalisierung
- **Task 6 · Form-Error:** Inline-Field-Errors + prominente Tel-Fallback-Box
- **Task 7 · Quality:** aria-busy + Hero-Blur-Up gegen Slow-4G LCP-Drift
- **Task 8 · Doku:** Go-Live-Checkliste (GA4-Cross-Domain, Matelso, Clarity)

Quelle: `docs/18.05.2026/kfzgutachter-lp-gap-eval.md` Top-5 + Hypothesen H-C/H-G.
Smoke: `docs/18.05.2026/lp-preview/*.png` (5 Screenshots: Desktop + Mobile + Köln-Variante).

External Actions vor Go-Live: siehe `docs/18.05.2026/kfzgutachter-lp-go-live-checklist.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Anhang · Zusammenfassung der Touchpoints

| File | Tasks | Art |
|---|---|---|
| `src/app/kfzgutachter-lp/track.ts` | T1 | NEU |
| `src/app/kfzgutachter-lp/__tests__/track.test.ts` | T1 | NEU |
| `src/app/kfzgutachter-lp/LeadFormClient.tsx` | T1, T5, T6, T7 | MODIFY |
| `src/app/kfzgutachter-lp/actions.ts` | T6 | MODIFY |
| `src/app/kfzgutachter-lp/page.tsx` | T2, T3, T4, T7 | MODIFY |
| `src/components/marketing/TrackingHooks.tsx` | T2 | MODIFY |
| `src/app/globals.css` | T4 | MODIFY (additive) |
| `docs/18.05.2026/kfzgutachter-lp-go-live-checklist.md` | T8 | NEU |

**Geschätzter Gesamt-Aufwand:** 5–7 h netto (Coding) + 30 Min Build/Smoke/Commit-Aufräumen.

---

## Anhang · Skipped from Gap-Eval (bewusste No-Op)

Aus Gap-Eval §4 „Bewusst nicht in Top-5" — diese Punkte werden in **diesem** Plan **nicht** umgesetzt:

- **Tablet-Breakpoint 768–1024 px** (Gap-Eval 2.1) — niedriges Volumen, Mobile + Desktop reichen für die A/B-Phase
- **`<CTAStack>`-Component-Extraktion** (2.3) — YAGNI, nur ein Consumer
- **Sticky-Mini-Form-Variante** (2.3 MiniLeadForm `sticky-bottom`) — Aufwand × Wirkung nicht im Top-5-Score
- **JS-off-HTML-Form-Fallback** (2.5) — Ads-Traffic hat JS, +1 h Aufwand unverhältnismäßig
- **TrustBar-Token-Normalisierung** (2.2 font-trust) — Claimondo-Tokens haben Vorrang
- **Tween-Animations für Hover-States** (2.6) — Spec-Empfehlung, kein Conversion-Hebel
