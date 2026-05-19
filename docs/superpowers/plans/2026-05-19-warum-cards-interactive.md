# Warum-Cards-Interactive — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die drei statischen „Warum unabhängiger Gutachter"-Karten auf der LP (`/kfzgutachter-lp`) zu klickbaren Reveal-Karten machen. Ganze Karte ist klickbar (kein „Mehr erfahren"-Button), Hover hebt visuell hervor, Click expandiert in-place mit Tiefen-Info + kontextbezogener Mini-CTA. Drei verschiedene CTAs für drei Conversion-Pfade.

**Architecture:** Section bleibt Server-Component (`WarumUnabhaengig` in `page.tsx`). Die 3 Karten wandern in eine neue Client-Component `WarumCardsClient.tsx`, die den Open-State (`Set<string>`) hält und Multi-Open erlaubt. CTAs feuern entweder einen Anchor-Scroll (`#lead-form`) oder ein Custom-Event (`open-popover`), das der bestehende `ScrollPopoverClient` listened (sauberer als sessionStorage-Hack). Tracking via `trackLpEvent` (Cards: `select_promotion` mit `warum-card-{slug}-expand|cta`).

**Tech Stack:**
- React 19 (useState + custom-event-dispatch)
- TypeScript strict
- Tailwind v4 mit Claimondo-Tokens (`bg-claimondo-bg`, `border-claimondo-border`, `text-claimondo-ondo`)
- `lucide-react` Icons (bestehend: `Scale`, `ShieldCheck`, `BadgeCheck`)
- `trackLpEvent` aus `./track`

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/app/kfzgutachter-lp/WarumCardsClient.tsx` | **NEU** — Client-Component, hält Open-State, rendert 3 Karten mit Tap-Expand, dispatch'd Tracking + CTA-Events |
| `src/app/kfzgutachter-lp/warum-cards-data.ts` | **NEU** — Pure Data-Konstante (collapsed-Text, expanded-bullets, stats, cta-config). Server-/Client-safe, kein `'use server'` |
| `src/app/kfzgutachter-lp/page.tsx` | **MODIFY** — Section ruft `<WarumCardsClient />` statt inline-`.map()` |
| `src/app/kfzgutachter-lp/ScrollPopoverClient.tsx` | **MODIFY** — Listener für `window`-Event `claimondo:open-popover` (mit optional `step`-Param) |

---

## Task 1: Data-Modul + Type

**Files:**
- Create: `src/app/kfzgutachter-lp/warum-cards-data.ts`

- [ ] **Step 1: Datei anlegen mit Type + Konstante**

```typescript
// src/app/kfzgutachter-lp/warum-cards-data.ts
//
// Inhalte der 3 "Warum unabhängiger Gutachter"-Karten in einer pure-data-
// Datei. Bewusst NICHT in 'use server' — sonst werden die Konstanten beim
// Client-Bundle zu undefined (AGENTS.md §use-server-Konstanten-Falle).
// Die page.tsx (Server) + WarumCardsClient.tsx (Client) importieren beide
// von hier.

import { Scale, ShieldCheck, BadgeCheck, type LucideIcon } from 'lucide-react'

export type WarumCtaKind = 'open-popover' | 'scroll-to-form'

export type WarumStatRow = { label: string; amount: string }

export type WarumCard = {
  slug: 'recht' | 'kuerzungen' | 'anwalt'
  Icon: LucideIcon
  titel: string
  /** Sichtbar im collapsed-State (1–3 Sätze). */
  text: string
  /** Sub-Label unter dem Text, BGH-Quellen. */
  quelle: string
  /** Expanded-State: kurze Bullet-Liste (jeweils 1 Satz). */
  bullets: string[]
  /** Optional: Tabellen-artige Stats für Karte 2 (Kürzungen). */
  stats?: WarumStatRow[]
  /** Abschluss-Hinweis vor dem CTA (kann fett oder neutral sein). */
  hinweis?: string
  cta: {
    label: string
    kind: WarumCtaKind
    /** Für open-popover: welche Step-Variante anpeilen. */
    popoverStep?: 1 | 2 | 3
  }
}

export const WARUM_CARDS: WarumCard[] = [
  {
    slug: 'recht',
    Icon: Scale,
    titel: 'Sie wählen Ihren Gutachter selbst',
    text:
      'Bei unverschuldetem Unfall bestimmen Sie nach §249 BGB den Sachverständigen Ihres Vertrauens — den Gutachter der gegnerischen Versicherung müssen Sie nicht akzeptieren.',
    quelle: '§249 BGB · BGH VI ZR 119/04',
    bullets: [
      'BGH-Bestätigung: Der Geschädigte hat das uneingeschränkte Wahlrecht des Sachverständigen (VI ZR 119/04).',
      'Versicherer schlagen oft eigene Gutachter vor — diese sind unverbindlich und müssen nicht akzeptiert werden.',
    ],
    cta: {
      label: 'Gutachter in Ihrer Region zeigen',
      kind: 'open-popover',
      popoverStep: 2,
    },
  },
  {
    slug: 'kuerzungen',
    Icon: ShieldCheck,
    titel: 'Versicherer-Prüfdienste kürzen systematisch',
    text:
      'Prüfdienstleister wie ControlExpert, K-Expert oder DEKRA arbeiten im Auftrag der Gegenseite und kürzen häufig Wertminderung, UPE-Aufschläge und Verbringung.',
    quelle: 'BGH VI ZR 65/18 · VI ZR 174/24',
    bullets: [],
    stats: [
      { label: 'Wertminderung', amount: '~750 €' },
      { label: 'UPE-Aufschläge', amount: '~280 €' },
      { label: 'Verbringungskosten', amount: '~180 €' },
    ],
    hinweis:
      '30–40 % davon holt unsere Partnerkanzlei BGH-konform zurück.',
    cta: {
      label: 'Schaden prüfen lassen',
      kind: 'scroll-to-form',
    },
  },
  {
    slug: 'anwalt',
    Icon: BadgeCheck,
    titel: 'Anwaltlich durchgesetzt — ohne Ihr Zutun',
    text:
      'Unsere Partnerkanzlei für Verkehrsrecht reguliert Reparaturkosten, Wertminderung, Mietwagen, Nutzungsausfall und Schmerzensgeld direkt gegen die gegnerische Versicherung. Sie bleiben außen vor.',
    quelle: 'BGH VI ZR 38/22 ff.',
    bullets: [
      'Reparaturkosten + UPE-Aufschläge',
      'Wertminderung (BGH VI ZR 38/22)',
      'Mietwagen oder Nutzungsausfall (BGH VI ZR 65/18)',
      'Schmerzensgeld bei Personenschaden',
    ],
    hinweis: 'Kostenfrei für Sie — die Anwaltskosten trägt die gegnerische Versicherung.',
    cta: {
      label: 'Rückruf in 15 Min',
      kind: 'open-popover',
      popoverStep: 3,
    },
  },
]
```

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```
Expected: 0 Errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/kfzgutachter-lp/warum-cards-data.ts
git -c commit.gpgsign=false commit -m "feat(kfzgutachter-lp): WARUM_CARDS Data-Modul für Reveal-Karten"
```

---

## Task 2: WarumCardsClient-Component

**Files:**
- Create: `src/app/kfzgutachter-lp/WarumCardsClient.tsx`

- [ ] **Step 1: Component anlegen**

```typescript
// src/app/kfzgutachter-lp/WarumCardsClient.tsx
'use client'

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { WARUM_CARDS, type WarumCard } from './warum-cards-data'
import { trackLpEvent } from './track'

// Reveal-Karten für die "Warum unabhängiger Gutachter"-Section.
// - Ganze Karte ist klickbar (kein "Mehr erfahren"-Button).
// - Hover: subtile Hebung + Border-Highlight + leichte Shadow.
// - Click: in-place Expand mit Bullets/Stats/CTA. Multi-Open erlaubt.
// - Keyboard: Enter/Space toggled, Esc kollabiert offene Karten.
// - CTA dispatch'd entweder Custom-Event 'claimondo:open-popover' oder
//   scrollt zu #lead-form. trackLpEvent loggt Expand + CTA-Click.

export function WarumCardsClient() {
  const [open, setOpen] = useState<Set<string>>(new Set())

  function toggle(slug: WarumCard['slug']) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
        trackLpEvent('select_promotion', {
          event_label: `warum-card-${slug}-expand`,
        })
      }
      return next
    })
  }

  function handleKey(
    event: ReactKeyboardEvent<HTMLDivElement>,
    slug: WarumCard['slug'],
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle(slug)
    }
    if (event.key === 'Escape') {
      setOpen(new Set())
    }
  }

  function handleCta(card: WarumCard, event: React.MouseEvent) {
    event.stopPropagation()
    trackLpEvent('select_promotion', {
      event_label: `warum-card-${card.slug}-cta`,
    })
    if (card.cta.kind === 'scroll-to-form') {
      const target = document.getElementById('lead-form')
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }
    if (card.cta.kind === 'open-popover') {
      window.dispatchEvent(
        new CustomEvent('claimondo:open-popover', {
          detail: { step: card.cta.popoverStep ?? 1, source: card.slug },
        }),
      )
    }
  }

  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-3 sm:gap-6">
      {WARUM_CARDS.map((card) => {
        const isOpen = open.has(card.slug)
        const { Icon } = card
        return (
          <div
            key={card.slug}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            aria-controls={`warum-card-${card.slug}-body`}
            onClick={() => toggle(card.slug)}
            onKeyDown={(e) => handleKey(e, card.slug)}
            className={`group cursor-pointer rounded-ios-lg border bg-white p-5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo focus-visible:ring-offset-2 sm:p-6 ${
              isOpen
                ? 'border-claimondo-ondo bg-gradient-to-b from-white to-claimondo-bg/30 shadow-claimondo-md'
                : 'border-claimondo-border hover:-translate-y-0.5 hover:border-claimondo-light-blue hover:shadow-claimondo-md'
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-claimondo-light-blue/12 text-claimondo-ondo">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 text-claimondo-ondo/60 transition-transform duration-300 ${
                  isOpen ? 'rotate-180' : 'group-hover:translate-y-0.5'
                }`}
              />
            </div>
            <h3 className="mt-4 text-base font-bold text-claimondo-navy">
              {card.titel}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">
              {card.text}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo/80">
              {card.quelle}
            </p>

            <div
              id={`warum-card-${card.slug}-body`}
              className={`grid overflow-hidden transition-all duration-300 ease-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100 mt-4 pt-4 border-t border-claimondo-border' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                {card.stats && card.stats.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-claimondo-navy">
                      Typische Kürzungen (Ø NRW-Netzwerk):
                    </p>
                    <ul className="mt-2 space-y-1">
                      {card.stats.map((s) => (
                        <li
                          key={s.label}
                          className="flex justify-between text-sm text-claimondo-navy"
                        >
                          <span>{s.label}</span>
                          <span className="font-bold text-claimondo-ondo">{s.amount}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {card.bullets.length > 0 && (
                  <ul className="space-y-2">
                    {card.bullets.map((b) => (
                      <li
                        key={b}
                        className="relative pl-4 text-sm leading-relaxed text-claimondo-shield before:absolute before:left-0 before:top-[0.55rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-claimondo-ondo"
                      >
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                {card.hinweis && (
                  <p className="mt-3 text-sm font-semibold text-claimondo-navy">
                    {card.hinweis}
                  </p>
                )}

                <button
                  type="button"
                  onClick={(e) => handleCta(card, e)}
                  data-tracking={`warum-card-${card.slug}-cta`}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-5 py-2.5 text-sm font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98]"
                >
                  {card.cta.label} →
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/kfzgutachter-lp/WarumCardsClient.tsx
git -c commit.gpgsign=false commit -m "feat(kfzgutachter-lp): WarumCardsClient — interaktive Reveal-Karten"
```

---

## Task 3: Section integrieren

**Files:**
- Modify: `src/app/kfzgutachter-lp/page.tsx`

- [ ] **Step 1: WarumUnabhaengig-Section reduzieren auf Header + Client-Wrapper**

```tsx
// page.tsx — WARUM-Konstante löschen (zieht in warum-cards-data.ts), Import
// dort weg, WarumCardsClient importieren, Function-Body neu.

import { WarumCardsClient } from './WarumCardsClient'
// (Icon-Imports Scale/ShieldCheck/BadgeCheck können bleiben wo sie genutzt
// werden — falls nur in WARUM, dann hier auch entfernen.)

function WarumUnabhaengig() {
  return (
    <section className="bg-claimondo-bg py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <h2
          className="text-balance text-2xl font-extrabold text-claimondo-navy sm:text-3xl"
          style={MONTSERRAT}
        >
          Warum ein unabhängiger Gutachter?
        </h2>
        <WarumCardsClient />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Alte WARUM-Konstante in page.tsx löschen**

Suche die `const WARUM: { Icon: LucideIcon; titel: string; ... }[] = [...]`-Block und entferne ihn. Tsc danach laufen lassen — wenn `Scale`/`ShieldCheck`/`BadgeCheck` unused werden, Import-Statement bereinigen (nicht `LucideIcon`-Typ entfernen falls anderswo verwendet).

- [ ] **Step 3: tsc + Build**

```bash
npx tsc --noEmit
npm run build
```
Expected: grün. Wenn `Scale`/`ShieldCheck`/`BadgeCheck` in lucide-Import nur noch hier waren → aus dem Import-Statement raus.

- [ ] **Step 4: Commit**

```bash
git add src/app/kfzgutachter-lp/page.tsx
git -c commit.gpgsign=false commit -m "refactor(kfzgutachter-lp): Warum-Section nutzt WarumCardsClient"
```

---

## Task 4: Popover-Listener für Custom-Event

**Files:**
- Modify: `src/app/kfzgutachter-lp/ScrollPopoverClient.tsx`

- [ ] **Step 1: Event-Listener in der Scroll-Effect-useEffect (oder eigene useEffect)**

```typescript
// Nach dem existing scroll-useEffect, eigene useEffect:
useEffect(() => {
  if (typeof window === 'undefined') return

  function onOpenRequest(e: Event) {
    const detail = (e as CustomEvent).detail as
      | { step?: 1 | 2 | 3; source?: string }
      | undefined
    setOpen(true)
    if (detail?.step === 2) setStep(2)
    else if (detail?.step === 3) setStep(3)
    else setStep(1)
    trackLpEvent('view_promotion', {
      event_label: `popover-open-via-${detail?.source ?? 'event'}`,
    })
  }

  window.addEventListener('claimondo:open-popover', onOpenRequest as EventListener)
  return () => {
    window.removeEventListener('claimondo:open-popover', onOpenRequest as EventListener)
  }
}, [])
```

**Hinweis:** Wenn Aaron auf Step 3 wechselt aber noch nichts in Step 1/2 angeklickt hat, sind `fahrzeug`/`standort` leer. Der Step 3 Submit handhabt das (defaults), aber das ist UX-suboptimal. Wenn Approval da: später Pre-Fill aus Hero-Form holen oder Hint-Banner zeigen.

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/kfzgutachter-lp/ScrollPopoverClient.tsx
git -c commit.gpgsign=false commit -m "feat(kfzgutachter-lp): Popover lauscht auf claimondo:open-popover-Event"
```

---

## Task 5: Visual-Smoke + Build

**Files:**
- Create: `docs/19.05.2026/warum-cards-smoke/`

- [ ] **Step 1: Dev-Server läuft (bereits aktiv auf :3000). Playwright-Smoke fahren:**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [['mobile', {width: 390, height: 844}], ['desktop', {width: 1440, height: 900}]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/kfzgutachter-lp', { waitUntil: 'networkidle', timeout: 60000 });
    // Scroll zum Warum-Section
    await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h2')).find(el => el.textContent?.includes('Warum'));
      h?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: \`docs/19.05.2026/warum-cards-smoke/\${name}-closed.png\`, fullPage: false });
    // Öffne die mittlere Karte
    const cards = await page.locator('[role=button][aria-expanded]').all();
    if (cards[1]) await cards[1].click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: \`docs/19.05.2026/warum-cards-smoke/\${name}-card-2-open.png\`, fullPage: false });
    // Öffne alle drei (Multi-Open)
    if (cards[0]) await cards[0].click();
    if (cards[2]) await cards[2].click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: \`docs/19.05.2026/warum-cards-smoke/\${name}-all-open.png\`, fullPage: false });
    // CTA-Klick auf Karte 1 → soll Popover öffnen
    await page.locator('[data-tracking=\"warum-card-recht-cta\"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: \`docs/19.05.2026/warum-cards-smoke/\${name}-cta-popover.png\`, fullPage: false });
    await ctx.close();
    console.log(\`\${name}: ok\`);
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
"
```

Expected: 4 Screenshots pro Viewport, Popover öffnet sich beim CTA-Click auf Karte 1 (recht-CTA mit `kind: 'open-popover'`).

- [ ] **Step 2: Vitest Full-Run als Regression-Gate**

```bash
npx vitest run src/app/kfzgutachter-lp src/app/api/kfzgutachter-lp
```
Expected: alle bestehenden 53 Tests bleiben grün (kein neuer Test in diesem Plan — Karten-Logic ist trivial genug, Visual-Smoke deckt es ab).

- [ ] **Step 3: Commit Screenshots**

```bash
git add docs/19.05.2026/warum-cards-smoke/
git -c commit.gpgsign=false commit -m "docs(kfzgutachter-lp): Warum-Cards Visual-Smoke Screenshots"
```

---

## Task 6: Push

- [ ] **Step 1: Branch-Sync (Worktree-Aktivität anderer Sessions)**

```bash
git fetch origin kitta/aar-dispatch-routing-followup
git rev-list --left-right --count HEAD...origin/kitta/aar-dispatch-routing-followup
```
Expected: `N	0` (lokal-ahead, kein remote-ahead).

- [ ] **Step 2: Push**

```bash
git push origin kitta/aar-dispatch-routing-followup
```

- [ ] **Step 3: PR #1455 aktualisiert sich automatisch**

PR-Body bei Bedarf um die Warum-Cards-Section ergänzen.

---

## Self-Review Checklist

**Spec-Coverage:**
- [x] Ganze Karte klickbar (kein „Mehr erfahren"-Button)
- [x] Hover-Highlight (translate-y + border-light-blue + shadow)
- [x] Click expandiert mit max-height/opacity-Transition (300 ms ease-out)
- [x] Multi-Open
- [x] Chevron als Affordance, rotiert beim Öffnen
- [x] 3 kontextbezogene CTAs (Popover/Hero-Form/Popover-Step-3)
- [x] Tracking-Events bei Expand + CTA-Click
- [x] a11y: role=button, aria-expanded, aria-controls, Enter/Space, Esc
- [x] Custom-Event statt sessionStorage-Hack für Popover-Trigger
- [x] Glass/Claimondo-Tokens, keine bracket-hex

**Placeholder-Scan:** keine TBD/TODO im Plan.

**Type-Konsistenz:** `WarumCard['slug']` ist Union (`'recht' | 'kuerzungen' | 'anwalt'`) — sowohl im Data-Modul als auch in der toggle-Function. CTA-Kind ebenfalls Union.

**Scope-Check:** kohärente Strecke (Data → Component → Section → Listener → Smoke → Push). Eine PR-Erweiterung an #1455.

---

## Execution Handoff

Plan unter `docs/superpowers/plans/2026-05-19-warum-cards-interactive.md`.

Zwei Optionen:
1. **Subagent-Driven** — Fresh Subagent pro Task + Two-Stage-Review
2. **Inline-Execution** — sequentiell in dieser Session

Sag, welcher Weg.
