# Email-Template-System P1a — Tokens + Primitive-Set · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine token-gebundene, Outlook-sichere react-email-Komponentenbibliothek aufbauen, auf die später alle Mail-Typen umgestellt werden — ohne eine bestehende Mail zu verändern.

**Architecture:** Eine Token-Quelle (`src/lib/email/tokens.ts`) + presentational Primitives unter `src/lib/email/components/`, gerendert mit `@react-email/components` (tabellen-basiert, Inline-Styles, Outlook-safe). Jedes Primitive ist isoliert per `@react-email/render` testbar (Render-zu-HTML + Assert). Die Hero-**Bild**-Erzeugung (sharp/imagin/Storage) ist NICHT Teil dieses Plans → separater Plan P1b; das `Hero`-Primitive nimmt die fertige Bild-URL nur als Prop.

**Tech Stack:** TypeScript, React, `@react-email/components`, `@react-email/render`, vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-29-email-template-system-design.md` · **Mockup:** `docs/superpowers/specs/2026-05-29-email-template-v7-mockup.html`

**Branch:** `kitta/email-template-system` (off `staging`). Jede Task committen; am Ende ein PR `--base staging`.

---

## Dateistruktur (in diesem Plan angelegt)

- `src/lib/email/tokens.ts` — Farben/Spacing/Radien/Typo (eine Quelle).
- `src/lib/email/components/Layout.tsx` — `EmailShell` (Body + Mail-Hintergrund + Preheader + Dark-Mode-Meta), `Heading`, `Paragraph`.
- `src/lib/email/components/Button.tsx` — bulletproof CTA (VML für Outlook).
- `src/lib/email/components/Hero.tsx` — `Hero` (Logo-Chip + Gold-Akzent + Headline + Slot).
- `src/lib/email/components/VehicleCard.tsx` — `VehicleCard` (Glas-gefasste Fahrzeug-Grafik + Zeile).
- `src/lib/email/components/Stats.tsx` — `StatGrid`, `StatTile`, `StatusPill`.
- `src/lib/email/components/BeraterCard.tsx` — `BeraterCard`.
- `src/lib/email/components/Timeline.tsx` — `Timeline`.
- `src/lib/email/components/Blocks.tsx` — `Callout`, `Note`, `Trustbar`, `InfoRow`, `Footer`.
- `src/lib/email/components/index.ts` — Barrel-Export.
- `src/lib/email/components/__tests__/*.test.tsx` — Render-Tests.

> **Konvention:** Erste Zeile jeder `.tsx` ist der Token-Audit-Skip-Header (Emails rendern ohne Tailwind/CSS-Vars):
> ```
> // Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
> //   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
> ```

> **Test-Hilfe:** `@react-email/render` exportiert `render(element) => Promise<string>`. Tests: `const html = await render(<X .../>)` und auf Teilstrings prüfen. Einzeltest: `npx vitest run <pfad>`.

---

### Task 1: Token-Modul

**Files:**
- Create: `src/lib/email/tokens.ts`
- Test: `src/lib/email/__tests__/tokens.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/email/__tests__/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { email } from '../tokens'

describe('email tokens', () => {
  it('hat die Claimondo-Markenfarben', () => {
    expect(email.color.navy).toBe('#0D1B3E')
    expect(email.color.gold).toBe('#C9A84C')
    expect(email.color.cream).toBe('#F5F1E8')
  })
  it('hat Spacing- und Radien-Skala', () => {
    expect(email.space(4)).toBe('16px') // 4 * 4px
    expect(email.radius.xl).toBe(18)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/lib/email/__tests__/tokens.test.ts`
Expected: FAIL (`Cannot find module '../tokens'`).

- [ ] **Step 3: Implement**

```ts
// src/lib/email/tokens.ts
// Token-Audit-Skip: Email-Tokens für react-email/Resend (rendern ohne Tailwind/CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

/** Eine Quelle für alle Email-Styles. Keine Ad-hoc-Hexes/Größen in Templates. */
export const email = {
  color: {
    navy: '#0D1B3E',
    shield: '#1E3A5F',
    ondo: '#4573A2',
    lightBlue: '#7BA3CC',
    gold: '#C9A84C',
    goldOnLight: '#B68A2E',
    cream: '#F5F1E8',
    creamBorder: '#ece5d6',
    surface: '#f8f9fb',
    border: '#eef0f4',
    textBody: '#374151',
    textMuted: '#6b7280',
    success: '#1E7A46',
    footerDark: '#0a1429',
    white: '#ffffff',
  },
  /** Spacing-Skala: step * 4px. space(4) => '16px'. */
  space: (step: number): string => `${step * 4}px`,
  radius: { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 } as const,
  font: {
    stack: "Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontSize: 28, fontWeight: 800, lineHeight: '1.12', letterSpacing: '-0.6px' },
    h2: { fontSize: 20, fontWeight: 700, lineHeight: '28px' },
    label: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px' },
    body: { fontSize: 14, lineHeight: '22px' },
  },
  maxWidth: 600,
} as const
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run src/lib/email/__tests__/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/tokens.ts src/lib/email/__tests__/tokens.test.ts
git commit -m "feat(email): tokens.ts — eine Quelle für Email-Styles (P1a)"
```

---

### Task 2: EmailShell + Heading + Paragraph (Layout)

**Files:**
- Create: `src/lib/email/components/Layout.tsx`
- Test: `src/lib/email/components/__tests__/Layout.test.tsx`

Verhalten: Body mit Mail-weitem Hintergrund (Bild-URL optional → `backgroundColor` Navy-Fallback + `backgroundImage`), versteckter Preheader + Spacer, Dark-Mode-Meta (`color-scheme`), zentrierte Spalte `email.maxWidth`. `EmailBrand`-Typ aus dem Bestand wiederverwenden (re-export aus `../google/templates/layout` ist erlaubt, aber hier neu definieren um Kopplung zu vermeiden).

- [ ] **Step 1: Failing test**

```tsx
// src/lib/email/components/__tests__/Layout.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { EmailShell, Heading, Paragraph } from '../Layout'

describe('EmailShell', () => {
  it('rendert Preheader, Navy-Fallback und Dark-Mode-Meta', async () => {
    const html = await render(
      <EmailShell preview="Vorschautext" backgroundUrl="https://x/y.jpg">
        <Heading>Titel</Heading>
        <Paragraph>Text</Paragraph>
      </EmailShell>,
    )
    expect(html).toContain('Vorschautext')
    expect(html).toContain('#0D1B3E') // Navy-Fallback
    expect(html).toContain('color-scheme')
    expect(html).toContain('Titel')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/lib/email/components/__tests__/Layout.test.tsx`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement**

```tsx
// src/lib/email/components/Layout.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Html, Head, Body, Container, Text } from '@react-email/components'
import type { ReactNode } from 'react'
import { email } from '../tokens'

export type EmailBrand = {
  primary: string; secondary: string; logoUrl: string | null; firmenname: string | null
} | null | undefined

export function EmailShell({
  children, preview, backgroundUrl,
}: { children: ReactNode; preview?: string; backgroundUrl?: string | null }) {
  const bgStyle = backgroundUrl
    ? { backgroundColor: email.color.navy, backgroundImage: `url('${backgroundUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: email.color.surface }
  return (
    <Html lang="de">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{`body{font-family:${email.font.stack};} a{color:inherit;}`}</style>
      </Head>
      <Body style={{ margin: 0, padding: 0, ...bgStyle }}>
        {/* Preheader: versteckt + Spacer, damit kein Folgetext in die Inbox-Vorschau leakt */}
        <div style={{ display: 'none', overflow: 'hidden', lineHeight: '1px', maxHeight: 0, maxWidth: 0, opacity: 0 }}>
          {preview}{' ‌'.repeat(80)}
        </div>
        <Container style={{ maxWidth: email.maxWidth, margin: '0 auto', padding: `${email.space(7)} ${email.space(5)}` }}>
          {children}
        </Container>
      </Body>
    </Html>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={{ color: email.color.navy, margin: `0 0 ${email.space(4)}`, ...email.font.h2 }}>{children}</Text>
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={{ color: email.color.textBody, margin: `0 0 ${email.space(3)}`, ...email.font.body }}>{children}</Text>
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run src/lib/email/components/__tests__/Layout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/Layout.tsx src/lib/email/components/__tests__/Layout.test.tsx
git commit -m "feat(email): EmailShell + Heading/Paragraph, token-gebunden (P1a)"
```

---

### Task 3: Bulletproof Button

**Files:**
- Create: `src/lib/email/components/Button.tsx`
- Test: `src/lib/email/components/__tests__/Button.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/lib/email/components/__tests__/Button.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { Button } from '../Button'

describe('Button', () => {
  it('rendert Link mit href, Navy-Hintergrund und Outlook-VML', async () => {
    const html = await render(<Button href="https://app.claimondo.de/kunde">Zum Portal</Button>)
    expect(html).toContain('https://app.claimondo.de/kunde')
    expect(html).toContain('Zum Portal')
    expect(html).toContain('#0D1B3E')
    expect(html).toContain('v:roundrect') // VML-Fallback für Outlook
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/lib/email/components/__tests__/Button.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/lib/email/components/Button.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import type { ReactNode } from 'react'
import { email } from '../tokens'

/** Bulletproof CTA: VML-roundrect für Outlook (Desktop/Word), <a> für alle anderen. */
export function Button({ href, children, bg = email.color.navy }: { href: string; children: ReactNode; bg?: string }) {
  const label = typeof children === 'string' ? children : ''
  return (
    <div style={{ margin: `${email.space(5)} 0`, textAlign: 'center' as const }}>
      <div dangerouslySetInnerHTML={{ __html:
        `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="24%" fillcolor="${bg}" stroke="f"><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->` }} />
      <a href={href} style={{
        display: 'inline-block', backgroundColor: bg, color: email.color.white,
        padding: `${email.space(4)} ${email.space(8)}`, borderRadius: email.radius.md,
        fontSize: 15, fontWeight: 700, textDecoration: 'none',
        // mso-hide blendet den <a> in Outlook aus (dort greift VML)
        // @ts-expect-error nicht-standard mso-Property für Outlook
        msoHide: 'all',
      }}>{children}</a>
    </div>
  )
}
```

> Hinweis: react-email rendert `<a>` und das VML-Kommentar nebeneinander; Outlook zeigt nur VML, alle anderen nur den `<a>`. Den `<a>` in Outlook ausblenden via `mso-hide:all` — falls der inline-Style nicht greift, alternativ ein `<!--[if !mso]><!-->`-Wrapper um den `<a>`. Test prüft nur Vorhandensein beider Pfade.

- [ ] **Step 4: Run → pass** — `npx vitest run src/lib/email/components/__tests__/Button.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/Button.tsx src/lib/email/components/__tests__/Button.test.tsx
git commit -m "feat(email): bulletproof Button (VML/Outlook) (P1a)"
```

---

### Task 4: Hero + VehicleCard

**Files:**
- Create: `src/lib/email/components/Hero.tsx`, `src/lib/email/components/VehicleCard.tsx`
- Test: `src/lib/email/components/__tests__/Hero.test.tsx`

`Hero`: zentrierter Logo-Chip (weiß, gerundet) + Gold-Akzent-Linie + Headline (weiß) + optionaler Subtext + `children`-Slot (für VehicleCard). Sitzt auf dem Mail-Hintergrund (EmailShell `backgroundUrl`). `VehicleCard`: glas-gefasste Box mit Fahrzeug-`<img>` + Fußzeile (Label + Wert). Beide rein präsentational (Bild-URLs als Props).

- [ ] **Step 1: Failing test**

```tsx
// src/lib/email/components/__tests__/Hero.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { Hero } from '../Hero'
import { VehicleCard } from '../VehicleCard'

describe('Hero + VehicleCard', () => {
  it('rendert Logo, Headline und Fahrzeug-Karte', async () => {
    const html = await render(
      <Hero logoUrl="https://claimondo.de/claimondo-wortmarke.svg" headline="Willkommen, Max." subline="0 €">
        <VehicleCard imageUrl="https://cdn.imagin.studio/car.png" label="Ihr Fahrzeug" value="BMW 320d" />
      </Hero>,
    )
    expect(html).toContain('Willkommen, Max.')
    expect(html).toContain('claimondo-wortmarke.svg')
    expect(html).toContain('cdn.imagin.studio/car.png')
    expect(html).toContain('BMW 320d')
    expect(html).toContain('#C9A84C') // Gold-Akzent
  })
})
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/email/components/__tests__/Hero.test.tsx` → FAIL.

- [ ] **Step 3: Implement Hero**

```tsx
// src/lib/email/components/Hero.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Section, Img, Text } from '@react-email/components'
import type { ReactNode } from 'react'
import { email } from '../tokens'

export function Hero({
  logoUrl, headline, subline, children,
}: { logoUrl: string | null; headline: string; subline?: string; children?: ReactNode }) {
  return (
    <Section style={{ padding: `${email.space(2)} ${email.space(2)} ${email.space(4)}`, textAlign: 'center' as const }}>
      <span style={{ display: 'inline-block', backgroundColor: email.color.white, borderRadius: email.radius.pill, padding: '9px 16px' }}>
        {logoUrl
          ? <Img src={logoUrl} alt="Claimondo" height={20} style={{ height: 20, width: 'auto', display: 'block' }} />
          : <Text style={{ margin: 0, fontSize: 17, fontWeight: 800, color: email.color.navy }}>Claimondo</Text>}
      </span>
      <div style={{ height: 3, width: 52, backgroundColor: email.color.gold, borderRadius: 2, margin: `${email.space(4)} auto ${email.space(3)}` }} />
      <Text style={{ color: email.color.white, margin: 0, ...email.font.h1, textShadow: '0 2px 14px rgba(0,0,0,.45)' }}>{headline}</Text>
      {subline && <Text style={{ color: '#eaf1f8', margin: `${email.space(2)} auto 0`, maxWidth: 380, ...email.font.body, textShadow: '0 1px 10px rgba(0,0,0,.5)' }}>{subline}</Text>}
      {children}
    </Section>
  )
}
```

- [ ] **Step 4: Implement VehicleCard**

```tsx
// src/lib/email/components/VehicleCard.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Img, Text } from '@react-email/components'
import { email } from '../tokens'

/** Glas-gefasste Fahrzeug-Karte. imageUrl = generiertes/imagin-Render (P1b liefert die URL). */
export function VehicleCard({ imageUrl, label, value }: { imageUrl: string; label: string; value: string }) {
  return (
    <div style={{ maxWidth: 420, margin: `${email.space(3)} auto 0`, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: email.radius.xl + 4, padding: `${email.space(5)} ${email.space(5)} ${email.space(4)}` }}>
      <Img src={imageUrl} alt={value} width="100%" style={{ width: '100%', height: 'auto', display: 'block' }} />
      <table width="100%" style={{ borderCollapse: 'collapse', borderTop: '1px solid rgba(255,255,255,0.16)', marginTop: email.space(2), paddingTop: email.space(2) }}>
        <tbody><tr>
          <td style={{ color: email.color.white, fontSize: 13, fontWeight: 700 }}>{label}</td>
          <td style={{ color: '#dce7f4', fontSize: 13, textAlign: 'right' as const }}>{value}</td>
        </tr></tbody>
      </table>
    </div>
  )
}
```

> Hinweis Outlook: `rgba`-Glas + `border-radius` ignoriert Outlook (zeigt nichts/eckig). Das ist akzeptabel — in Produktion liefert P1b ein **bereits gebackenes** Hero-Bild inkl. Glas/Glow; `VehicleCard` ist die Web-Client-Veredelung mit Fallback (Bild bleibt sichtbar).

- [ ] **Step 5: Run → pass** — `npx vitest run src/lib/email/components/__tests__/Hero.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/components/Hero.tsx src/lib/email/components/VehicleCard.tsx src/lib/email/components/__tests__/Hero.test.tsx
git commit -m "feat(email): Hero + VehicleCard Primitives (P1a)"
```

---

### Task 5: StatGrid + StatTile + StatusPill

**Files:**
- Create: `src/lib/email/components/Stats.tsx`
- Test: `src/lib/email/components/__tests__/Stats.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/lib/email/components/__tests__/Stats.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { StatGrid, StatusPill } from '../Stats'

describe('Stats', () => {
  it('rendert 2x2-Kacheln und Status-Pill', async () => {
    const html = await render(
      <>
        <StatusPill>In Bearbeitung</StatusPill>
        <StatGrid items={[{ label: 'Fallnummer', value: 'CLM-1' }, { label: 'Versicherung', value: 'HUK' }]} />
      </>,
    )
    expect(html).toContain('In Bearbeitung')
    expect(html).toContain('Fallnummer')
    expect(html).toContain('CLM-1')
    expect(html).toContain('HUK')
  })
})
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/email/components/__tests__/Stats.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/lib/email/components/Stats.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import type { ReactNode } from 'react'
import { email } from '../tokens'

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span style={{ backgroundColor: '#eaf1f8', color: '#2c5d8f', fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: email.radius.pill }}>
      &#9679;&nbsp;{children}
    </span>
  )
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <td style={{ width: '50%', padding: 5, verticalAlign: 'top' as const }}>
      <div style={{ backgroundColor: email.color.surface, border: `1px solid ${email.color.border}`, borderRadius: email.radius.md, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: '#9aa3b2', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: email.color.navy, marginTop: 3 }}>{value}</div>
      </div>
    </td>
  )
}

/** 2-spaltiges Kachel-Raster (tabellen-basiert, Outlook-safe). Nur Items mit value werden gerendert. */
export function StatGrid({ items }: { items: { label: string; value: string | null | undefined }[] }) {
  const rows: { label: string; value: string }[][] = []
  const shown = items.filter((i): i is { label: string; value: string } => Boolean(i.value))
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2))
  return (
    <table width="100%" style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((pair, r) => (
          <tr key={r}>
            <StatTile label={pair[0].label} value={pair[0].value} />
            {pair[1] ? <StatTile label={pair[1].label} value={pair[1].value} /> : <td style={{ width: '50%' }} />}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run → pass** — `npx vitest run src/lib/email/components/__tests__/Stats.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/Stats.tsx src/lib/email/components/__tests__/Stats.test.tsx
git commit -m "feat(email): StatGrid/StatTile/StatusPill (datengetriebene Kacheln) (P1a)"
```

---

### Task 6: BeraterCard + Timeline

**Files:**
- Create: `src/lib/email/components/BeraterCard.tsx`, `src/lib/email/components/Timeline.tsx`
- Test: `src/lib/email/components/__tests__/BeraterTimeline.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/lib/email/components/__tests__/BeraterTimeline.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { BeraterCard } from '../BeraterCard'
import { Timeline } from '../Timeline'

describe('BeraterCard + Timeline', () => {
  it('rendert Berater mit Kontakt', async () => {
    const html = await render(<BeraterCard name="Jonas Berger" photoUrl="https://x/b.png" contact="WhatsApp · 0221" />)
    expect(html).toContain('Jonas Berger')
    expect(html).toContain('WhatsApp · 0221')
    expect(html).toContain('Ansprechpartner')
  })
  it('markiert den aktuellen Schritt', async () => {
    const html = await render(<Timeline steps={['Gutachten', 'Anwalt', 'Auszahlung']} currentIndex={1} />)
    expect(html).toContain('Gutachten')
    expect(html).toContain('Auszahlung')
    expect(html).toContain('#4573A2') // aktiver Schritt in ondo
  })
})
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/email/components/__tests__/BeraterTimeline.test.tsx` → FAIL.

- [ ] **Step 3: Implement BeraterCard**

```tsx
// src/lib/email/components/BeraterCard.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Img, Text } from '@react-email/components'
import { email } from '../tokens'

export function BeraterCard({ name, photoUrl, contact }: { name: string; photoUrl: string | null; contact: string }) {
  return (
    <div style={{ backgroundColor: email.color.cream, border: `1px solid ${email.color.creamBorder}`, borderRadius: email.radius.lg, padding: `${email.space(4)} ${email.space(4)}`, margin: `${email.space(5)} 0` }}>
      <table width="100%" style={{ borderCollapse: 'collapse' }}><tbody><tr>
        {photoUrl && (
          <td style={{ width: 54, verticalAlign: 'middle' as const }}>
            <Img src={photoUrl} alt={name} width={52} height={52} style={{ width: 52, height: 52, borderRadius: '50%', display: 'block' }} />
          </td>
        )}
        <td style={{ verticalAlign: 'middle' as const, paddingLeft: photoUrl ? email.space(4) : 0 }}>
          <Text style={{ margin: 0, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: email.color.goldOnLight, fontWeight: 700 }}>Ihr persönlicher Ansprechpartner</Text>
          <Text style={{ margin: '2px 0', fontSize: 16, fontWeight: 800, color: email.color.navy }}>{name}</Text>
          <Text style={{ margin: 0, fontSize: 13, color: email.color.textBody }}>{contact}</Text>
        </td>
      </tr></tbody></table>
    </div>
  )
}
```

- [ ] **Step 4: Implement Timeline**

```tsx
// src/lib/email/components/Timeline.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { email } from '../tokens'

/** Horizontale Fortschritts-Timeline; currentIndex = aktiver Schritt (ondo), erledigte = success, offene = muted. */
export function Timeline({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return (
    <table width="100%" style={{ borderCollapse: 'collapse', margin: `${email.space(4)} 0` }}>
      <tbody><tr>
        {steps.map((s, i) => {
          const color = i < currentIndex ? email.color.success : i === currentIndex ? email.color.ondo : '#c7cdd6'
          return (
            <td key={i} style={{ textAlign: 'center' as const, verticalAlign: 'top' as const }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color, margin: '0 auto 6px' }} />
              <div style={{ fontSize: 11, fontWeight: i === currentIndex ? 700 : 400, color: i === currentIndex ? email.color.navy : email.color.textMuted }}>{s}</div>
            </td>
          )
        })}
      </tr></tbody>
    </table>
  )
}
```

- [ ] **Step 5: Run → pass** — `npx vitest run src/lib/email/components/__tests__/BeraterTimeline.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/components/BeraterCard.tsx src/lib/email/components/Timeline.tsx src/lib/email/components/__tests__/BeraterTimeline.test.tsx
git commit -m "feat(email): BeraterCard + Timeline Primitives (P1a)"
```

---

### Task 7: Kleine Bausteine — Callout, Note, Trustbar, InfoRow, Footer

**Files:**
- Create: `src/lib/email/components/Blocks.tsx`
- Test: `src/lib/email/components/__tests__/Blocks.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/lib/email/components/__tests__/Blocks.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { Callout, Note, Trustbar, InfoRow, Footer } from '../Blocks'

describe('Blocks', () => {
  it('rendert alle kleinen Bausteine', async () => {
    const html = await render(
      <>
        <Callout>Wichtiger Hinweis</Callout>
        <Note>Kleingedrucktes</Note>
        <Trustbar items={['0 € bei Fremdverschulden', '§249 BGB']} />
        <InfoRow label="Portal" value="app.claimondo.de" />
        <Footer />
      </>,
    )
    expect(html).toContain('Wichtiger Hinweis')
    expect(html).toContain('Kleingedrucktes')
    expect(html).toContain('§249 BGB')
    expect(html).toContain('app.claimondo.de')
    expect(html).toContain('Impressum')
    expect(html).toContain('Datenschutz')
  })
})
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/lib/email/components/__tests__/Blocks.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/lib/email/components/Blocks.tsx
// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Text, Link } from '@react-email/components'
import type { ReactNode } from 'react'
import { email } from '../tokens'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div style={{ backgroundColor: email.color.surface, borderLeft: `3px solid ${email.color.ondo}`, borderRadius: email.radius.sm, padding: `${email.space(3)} ${email.space(4)}`, margin: `${email.space(4)} 0` }}>
      <Text style={{ margin: 0, color: email.color.textBody, ...email.font.body }}>{children}</Text>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={{ margin: `${email.space(2)} 0 0`, fontSize: 12, color: email.color.textMuted, fontStyle: 'italic' as const, lineHeight: '18px' }}>{children}</Text>
}

export function Trustbar({ items }: { items: string[] }) {
  return (
    <Text style={{ margin: `${email.space(4)} 0 0`, textAlign: 'center' as const, color: email.color.textMuted, fontSize: 12 }}>
      {items.map((it, i) => (
        <span key={i}>{i > 0 && ' · '}<span style={{ color: email.color.success, fontWeight: 700 }}>&#10003;</span> {it}</span>
      ))}
    </Text>
  )
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <table width="100%" style={{ borderCollapse: 'collapse', margin: '4px 0' }}><tbody><tr>
      <td style={{ width: 90, color: email.color.textMuted, fontSize: 13 }}>{label}</td>
      <td style={{ fontSize: 13, color: email.color.navy }}>{value}</td>
    </tr></tbody></table>
  )
}

export function Footer({ onDark = false }: { onDark?: boolean }) {
  const c = onDark ? '#8aa0bd' : email.color.textMuted
  return (
    <div style={{ textAlign: 'center' as const, padding: `${email.space(5)} ${email.space(3)} ${email.space(1)}` }}>
      <Text style={{ margin: 0, fontSize: 11, lineHeight: '18px', color: c }}>
        Claimondo GmbH &middot; <Link href={`${APP_URL}/impressum`} style={{ color: c, textDecoration: 'underline' }}>Impressum</Link> &middot; <Link href={`${APP_URL}/datenschutz`} style={{ color: c, textDecoration: 'underline' }}>Datenschutz</Link>
      </Text>
      <Text style={{ margin: '6px 0 0', fontSize: 11, color: c }}>Vollständige Schadensregulierung — auf Augenhöhe</Text>
    </div>
  )
}
```

- [ ] **Step 4: Run → pass** — `npx vitest run src/lib/email/components/__tests__/Blocks.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/Blocks.tsx src/lib/email/components/__tests__/Blocks.test.tsx
git commit -m "feat(email): Callout/Note/Trustbar/InfoRow/Footer Primitives (P1a)"
```

---

### Task 8: Barrel-Export + Kitchen-Sink-Smoke + Build-Gate

**Files:**
- Create: `src/lib/email/components/index.ts`
- Test: `src/lib/email/components/__tests__/kitchensink.test.tsx`

- [ ] **Step 1: Barrel**

```ts
// src/lib/email/components/index.ts
export * from './Layout'
export * from './Button'
export * from './Hero'
export * from './VehicleCard'
export * from './Stats'
export * from './BeraterCard'
export * from './Timeline'
export * from './Blocks'
```

- [ ] **Step 2: Kitchen-Sink-Smoke (rendert ALLE Primitives in einer Beispiel-Mail, prüft kein Throw + Kernschlüssel)**

```tsx
// src/lib/email/components/__tests__/kitchensink.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import {
  EmailShell, Hero, VehicleCard, StatGrid, StatusPill, BeraterCard, Timeline,
  Button, Callout, Note, Trustbar, Footer,
} from '../index'

describe('kitchensink', () => {
  it('rendert eine komplette Beispiel-Mail ohne Fehler', async () => {
    const html = await render(
      <EmailShell preview="Test" backgroundUrl="https://x/bg.jpg">
        <Hero logoUrl={null} headline="Willkommen, Max." subline="0 €">
          <VehicleCard imageUrl="https://x/car.png" label="Ihr Fahrzeug" value="BMW 320d" />
        </Hero>
        <StatusPill>In Bearbeitung</StatusPill>
        <StatGrid items={[{ label: 'Fallnummer', value: 'CLM-1' }, { label: 'Versicherung', value: null }]} />
        <Timeline steps={['Gutachten', 'Anwalt', 'Auszahlung']} currentIndex={0} />
        <BeraterCard name="Jonas Berger" photoUrl={null} contact="WhatsApp" />
        <Callout>Hinweis</Callout>
        <Button href="https://app.claimondo.de/kunde">Zum Portal</Button>
        <Trustbar items={['0 €', '§249 BGB']} />
        <Note>Fußnote</Note>
        <Footer />
      </EmailShell>,
    )
    expect(html).toContain('Willkommen, Max.')
    expect(html).toContain('Zum Portal')
    expect(html).not.toContain('Versicherung') // null-Wert wird ausgelassen (datengetrieben)
  })
})
```

- [ ] **Step 3: Run → pass** — `npx vitest run src/lib/email/components/__tests__/kitchensink.test.tsx` → PASS.

- [ ] **Step 4: Voller Test- + Typecheck-Lauf**

Run: `npx vitest run src/lib/email && npx tsc --noEmit`
Expected: alle Email-Tests grün, kein TS-Fehler. (Voller `npm run build` nicht nötig — keine Route/Server-Action geändert; reine Lib + Tests.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/index.ts src/lib/email/components/__tests__/kitchensink.test.tsx
git commit -m "feat(email): Barrel-Export + Kitchen-Sink-Smoke (P1a)"
```

---

## Abschluss

- [ ] **PR gegen staging** mit 7-Punkte-Audit im Body. Titel: `feat(email): P1a — Tokens + Primitive-Set (Fundament Email-System)`. Hinweis im Body: keine bestehende Mail geändert; Primitives noch unkonsumiert (Konsum ab P2).

## Self-Review (gegen Spec)

- **Spec §1 Tokens** → Task 1. **§1 Primitive-Set** → Tasks 2–8 (Layout, Button, Hero, VehicleCard, StatGrid/StatTile/StatusPill, BeraterCard, Timeline, Callout, Note, Trustbar, InfoRow, Footer). ✓
- **§2 datengetrieben** → StatGrid lässt leere Werte aus (Task 5/8-Assert), BeraterCard/VehicleCard optional. Tier-Logik (welches Template welche Primitives) ist **P2+**, nicht P1a. ✓
- **§3 Hero-Bild-Generierung** → bewusst **NICHT** hier (Plan P1b); `Hero`/`VehicleCard` nehmen URL als Prop. ✓
- **§4 Härtung:** Preheader+Spacer (Task 2), VML-Button (Task 3), Dark-Mode-Meta (Task 2) ✓. Plain-Text-Multipart + Bild:Text-Ratio → P4 (Render-/Versand-Pfad), nicht Primitive-Ebene.
- **§5 Trust:** Timeline + Trustbar ✓; Social-Proof-Badge + weißes Logo-Asset → offene Entscheidung/P4.
- **§6 Preview-Harness** (`react-email dev`) → P4 (kein Primitive). Kitchen-Sink-Test (Task 8) ist die P1a-QA.
- **Typ-Konsistenz:** `email`-Token-Objekt, `EmailBrand`-Typ, Prop-Namen (`logoUrl`, `imageUrl`, `currentIndex`, `items`) über Tasks hinweg konsistent verwendet. ✓
- **Keine Platzhalter:** jeder Step hat echten Code/Befehl. ✓

**Folgepläne:** P1b (Hero-Bild-Pipeline: sharp + imagin + Supabase Storage) · P2 (KundeWelcome-Flagship auf Primitives) · P3 (Template-Sweep nach Tier) · P4 (Plain-Text/Dark-Mode-Feinschliff + Preview-Harness).
