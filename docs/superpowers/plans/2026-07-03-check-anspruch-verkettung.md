# Verkettung /check → Foto-Anspruch-Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im `/check`-Ergebnis (nur bei echtem Anspruch, Tier voll/quote) einen prominenten CTA ins bestehende Foto-Anspruch-Tool (`app.claimondo.de/embed/anspruch-pruefen`) einbauen — behebt den Reachability-Gap (Foto-Tool live, aber 0 Einstiegspunkt → 0 Adoption).

**Architecture:** Cross-Domain-Link von claimondo.de/check → app.claimondo.de-Embed, Attribution (utm_*, Ads-Click-IDs, Makler-Code `m`) verlustfrei durchgereicht. Ziel-URL-Bau als pure, getestete Funktion; CTA als eigene Client-Component; Integration in `CheckFunnelClient` showRanges-gated mit Rückruf-Formular sekundär.

**Tech Stack:** Next.js 16 (claimondo-marketing STANDALONE-Build), React 19, next-intl, Tailwind v4, vitest.

## Global Constraints

- **Nur `claimondo-marketing/`** wird angefasst (STANDALONE-Build). Die App-Ratchets (component-set/knip/token-audit) scannen `src/**` und erfassen Marketing NICHT — kein `primitives/*`-Zwang; handgerolltes Tailwind mit `claimondo-*`-Tokens ist hier Standard (Vorbild: `InlineCheckCta`).
- **UI-Umlaute Pflicht** (deutsche Strings): echte `ä/ö/ü/ß`, kein ASCII-Ersatz.
- **Farben:** nur `claimondo-*`-Tokens (kein raw hex), z. B. `claimondo-navy`/`-ondo`/`-shield`/`-bg`. Radien `rounded-ios-*` / `rounded-full`.
- **Embed-Origin:** `process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'` (identisch zu `GutachterFindenSection`).
- **Attribution-Allowlist** (verbatim wie `CheckFunnelClient` sie selbst sammelt): `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `gbraid`, `wbraid`, `gclsrc`, `m`.
- **Keine Regression** des bestehenden Rückruf-Lead-Pfads (`submitCheckLead` / Felder Name/Phone/City / `handleSubmit`).
- **Commits** mit 7-Punkte-Audit-Block + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. PR gegen `staging` (Regel 1).

---

### Task 0: Worktree-Setup (node_modules)

**Files:** keine (Setup)

- [ ] **Step 1: Marketing-Dependencies installieren**

`claimondo-marketing` ist ein STANDALONE-Package mit eigenen node_modules (nicht Root-geteilt). Der frische Worktree hat sie nicht.

Run: `cd claimondo-marketing && npm install`
Expected: `added N packages` ohne Fehler; danach existiert `claimondo-marketing/node_modules/`.

- [ ] **Step 2: Baseline-Gates grün?**

Run (in `claimondo-marketing/`): `npm run typecheck && npm run test`
Expected: tsc 0 Fehler; vitest alle bestehenden Tests grün. (Bestätigt sauberen Ausgangspunkt.)

---

### Task 1: Pure Funktion `buildFotoCheckUrl` (TDD)

**Files:**
- Create: `claimondo-marketing/lib/check/foto-check-url.ts`
- Test: `claimondo-marketing/lib/check/foto-check-url.test.ts`

**Interfaces:**
- Produces: `buildFotoCheckUrl(embedOrigin: string, search: string): string` — baut die Foto-Tool-Ziel-URL, reicht nur die Attribution-Allowlist durch.

- [ ] **Step 1: Failing test schreiben**

`claimondo-marketing/lib/check/foto-check-url.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildFotoCheckUrl } from './foto-check-url'

const ORIGIN = 'https://app.claimondo.de'

describe('buildFotoCheckUrl', () => {
  it('liefert die Basis-URL ohne Params', () => {
    expect(buildFotoCheckUrl(ORIGIN, '')).toBe('https://app.claimondo.de/embed/anspruch-pruefen')
  })

  it('reicht utm, Ads-Click-IDs und Makler-Code durch, filtert Fremd-Params', () => {
    const url = buildFotoCheckUrl(ORIGIN, '?utm_source=google&gclid=abc123&m=NICOLAS10&foo=bar')
    const u = new URL(url)
    expect(u.pathname).toBe('/embed/anspruch-pruefen')
    expect(u.searchParams.get('utm_source')).toBe('google')
    expect(u.searchParams.get('gclid')).toBe('abc123')
    expect(u.searchParams.get('m')).toBe('NICOLAS10')
    expect(u.searchParams.get('foo')).toBeNull()
  })

  it('ignoriert leere Werte', () => {
    expect(buildFotoCheckUrl(ORIGIN, '?utm_source=&m=')).toBe('https://app.claimondo.de/embed/anspruch-pruefen')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run (in `claimondo-marketing/`): `npx vitest run lib/check/foto-check-url.test.ts`
Expected: FAIL — „Cannot find module './foto-check-url'".

- [ ] **Step 3: Implementierung schreiben**

`claimondo-marketing/lib/check/foto-check-url.ts`:
```ts
// Baut die Ziel-URL fuer den Foto-Anspruch-Check aus dem /check-Kontext.
// Reicht Attribution-Params verlustfrei an das Foto-Tool durch, damit die
// Attribution ueber den Domain-Wechsel (claimondo.de -> app.claimondo.de)
// erhalten bleibt. Allowlist identisch zu CheckFunnelClient (utm_* + m) plus
// die Ads-Click-IDs, die der Finder-Embed auswertet.
const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'gclsrc',
  'm',
] as const

export function buildFotoCheckUrl(embedOrigin: string, search: string): string {
  const inParams = new URLSearchParams(search)
  const out = new URLSearchParams()
  for (const key of ATTRIBUTION_KEYS) {
    const v = inParams.get(key)
    if (v) out.set(key, v)
  }
  const qs = out.toString()
  return `${embedOrigin}/embed/anspruch-pruefen${qs ? `?${qs}` : ''}`
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npx vitest run lib/check/foto-check-url.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/lib/check/foto-check-url.ts claimondo-marketing/lib/check/foto-check-url.test.ts
git commit -m "feat(anspruch): buildFotoCheckUrl — Attribution-durchreichende Foto-Tool-URL (TDD)"
```

---

### Task 2: i18n-Keys (de/en/tr)

**Files:**
- Modify: `claimondo-marketing/i18n/messages/de.json` (im `check`-Objekt)
- Modify: `claimondo-marketing/i18n/messages/en.json`
- Modify: `claimondo-marketing/i18n/messages/tr.json`

**Interfaces:**
- Produces: i18n-Keys `check.foto_check.heading`, `check.foto_check.text`, `check.foto_check.button`, `check.lead_heading_alt`.

- [ ] **Step 1: de.json — Keys ins `check`-Objekt einfügen**

Im `check`-Objekt von `claimondo-marketing/i18n/messages/de.json` ergänzen (neben den bestehenden `q1_*`/`result_*`/`range_*`-Keys):
```json
"foto_check": {
  "heading": "Wie viel ist Ihr Schaden konkret wert?",
  "text": "Laden Sie ein Foto Ihres Schadens hoch und erhalten Sie in unter einer Minute eine konkrete, unverbindliche Einschätzung Ihrer Ansprüche — kostenlos.",
  "button": "Schaden per Foto prüfen"
},
"lead_heading_alt": "Lieber persönlich? Rückruf anfordern"
```

- [ ] **Step 2: en.json — gleiche Keys, englisch**

```json
"foto_check": {
  "heading": "What is your damage actually worth?",
  "text": "Upload a photo of your damage and get a concrete, non-binding estimate of your claims in under a minute — free of charge.",
  "button": "Check damage by photo"
},
"lead_heading_alt": "Prefer a call? Request a callback"
```

- [ ] **Step 3: tr.json — gleiche Keys, türkisch**

```json
"foto_check": {
  "heading": "Hasarınız gerçekte ne kadar değerinde?",
  "text": "Hasarınızın bir fotoğrafını yükleyin ve bir dakikadan kısa sürede taleplerinizin somut, bağlayıcı olmayan bir tahminini ücretsiz alın.",
  "button": "Hasarı fotoğrafla kontrol et"
},
"lead_heading_alt": "Telefonu mu tercih edersiniz? Geri arama talep edin"
```

- [ ] **Step 4: JSON-Validität + Vollständigkeit prüfen**

Run (in `claimondo-marketing/`): `node -e "for (const l of ['de','en','tr']) { const m=require('./i18n/messages/'+l+'.json'); if(!m.check.foto_check.button || !m.check.lead_heading_alt) throw new Error('missing '+l); } console.log('ok')"`
Expected: `ok` (alle 3 Sprachen haben die Keys, JSON parst).

- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/i18n/messages/de.json claimondo-marketing/i18n/messages/en.json claimondo-marketing/i18n/messages/tr.json
git commit -m "feat(anspruch): i18n-Keys check.foto_check.* + lead_heading_alt (de/en/tr)"
```

---

### Task 3: Component `AnspruchFotoCheckCta`

**Files:**
- Create: `claimondo-marketing/components/check/AnspruchFotoCheckCta.tsx`

**Interfaces:**
- Consumes: `buildFotoCheckUrl` (Task 1), i18n `check.foto_check.*` (Task 2).
- Produces: `<AnspruchFotoCheckCta />` — prominenter CTA-Block (Client-Component).

- [ ] **Step 1: Component schreiben**

`claimondo-marketing/components/check/AnspruchFotoCheckCta.tsx`:
```tsx
'use client'

import { useTranslations } from 'next-intl'
import { Camera, ChevronRight } from 'lucide-react'
import { buildFotoCheckUrl } from '@/lib/check/foto-check-url'

const EMBED_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

/**
 * Prominenter Foto-Check-CTA im /check-Ergebnis (nur bei echtem Anspruch,
 * Tier voll/quote). Verkettet den qualitativen Schuld-Check mit dem
 * quantitativen Foto-Wert-Check. Reicht die Attribution ueber den
 * Domain-Wechsel durch (buildFotoCheckUrl).
 */
export function AnspruchFotoCheckCta() {
  const t = useTranslations('check')
  const href =
    typeof window !== 'undefined'
      ? buildFotoCheckUrl(EMBED_ORIGIN, window.location.search)
      : `${EMBED_ORIGIN}/embed/anspruch-pruefen`

  return (
    <div className="mt-5 rounded-ios-lg border border-claimondo-ondo/30 bg-gradient-to-br from-claimondo-navy to-claimondo-shield p-6 shadow-claimondo-md">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/15" aria-hidden>
          <Camera className="h-6 w-6 text-white" />
        </span>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white">{t('foto_check.heading')}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-white/85">{t('foto_check.text')}</p>
          <a
            href={href}
            data-tracking="cta-check-foto-tool"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-claimondo-navy transition hover:bg-claimondo-bg"
          >
            {t('foto_check.button')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run (in `claimondo-marketing/`): `npm run typecheck`
Expected: 0 Fehler.

- [ ] **Step 3: Commit**

```bash
git add claimondo-marketing/components/check/AnspruchFotoCheckCta.tsx
git commit -m "feat(anspruch): AnspruchFotoCheckCta — prominenter Foto-Check-CTA-Block"
```

---

### Task 4: Integration in CheckFunnelClient

**Files:**
- Modify: `claimondo-marketing/app/[locale]/check/CheckFunnelClient.tsx`

**Interfaces:**
- Consumes: `<AnspruchFotoCheckCta />` (Task 3), i18n `check.lead_heading_alt` (Task 2).

- [ ] **Step 1: Import ergänzen**

Nach den bestehenden Imports (nach Zeile 10, `import { buildCheckResult, ... }`):
```tsx
import { AnspruchFotoCheckCta } from '@/components/check/AnspruchFotoCheckCta'
```

- [ ] **Step 2: CTA nach der €-Ranges-Box einfügen (showRanges-gated)**

Direkt **nach** dem schließenden `) : null}` der €-Größenordnungen-Box (aktuell ~Zeile 229) und **vor** dem Insights-Block (`{result.insightKeys.length > 0 ...}`) einfügen:
```tsx
          {/* Foto-Check-Verkettung: prominenter Upgrade-Pfad, nur bei echtem Anspruch */}
          {result.showRanges ? <AnspruchFotoCheckCta /> : null}
```

- [ ] **Step 3: Rückruf-Formular sekundär framen (bei echtem Anspruch)**

Das Lead-Formular-Heading (aktuell `<h3 className="text-lg font-bold text-claimondo-navy">{t('lead_heading')}</h3>`, ~Zeile 247) so ersetzen, dass es bei `showRanges` zurücktritt (dezenteres Heading + alternativer Text):
```tsx
            <h3 className={result.showRanges ? 'text-base font-semibold text-claimondo-shield' : 'text-lg font-bold text-claimondo-navy'}>
              {result.showRanges ? t('lead_heading_alt') : t('lead_heading')}
            </h3>
```
(Die Felder, `handleSubmit`, `submitCheckLead` und der Submit-Button bleiben unverändert — keine Regression.)

- [ ] **Step 4: Typecheck + Build**

Run (in `claimondo-marketing/`): `npm run typecheck && npm run build`
Expected: tsc 0 Fehler; `next build` grün (Route `/[locale]/check` kompiliert).

- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/app/[locale]/check/CheckFunnelClient.tsx
git commit -m "feat(anspruch): Foto-Check-CTA im /check-Ergebnis (voll/quote) + Rueckruf sekundaer"
```

---

### Task 5: Gates + PR + Prod-Smoke

**Files:** keine (Verifikation)

- [ ] **Step 1: Volle Marketing-Gates**

Run (in `claimondo-marketing/`): `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: alle grün (tsc 0, eslint 0, vitest inkl. neuem foto-check-url-Test grün, build grün).

- [ ] **Step 2: 7-Punkte-Audit dokumentieren + PR gegen staging**

Run: `git push -u origin kitta/anspruch-check-verkettung` und PR gegen `staging` erstellen (`gh pr create --base staging`). PR-Body enthält den 7-Punkte-Audit (Build grün / UI: CTA im /check-Ergebnis / Redundanz: /check-vs-Foto abgegrenzt, buildFotoCheckUrl wiederverwendet Allowlist-Muster / Dead-Code: keins / Spec: showRanges-Gating + Foto primär erfüllt / Inkonsistenz: claimondo-Tokens + Umlaute ok / Regression: Lead-Pfad unverändert).

- [ ] **Step 3: Prod-Smoke nach Deploy** (manuell, nach Merge+Deploy)

1. `/check` durchklicken mit Antwort „Der Gegner ist schuld" (→ Tier `voll`) → Ergebnis-Screen zeigt den prominenten Foto-Check-CTA über dem (dezenteren) Rückruf-Formular.
2. Klick auf „Schaden per Foto prüfen" → landet auf `app.claimondo.de/embed/anspruch-pruefen` (mit etwaigen `?utm_*`/`?m=`-Params in der URL).
3. Gegenprobe: `/check` mit „Ich bin selbst schuld" (→ Tier `kasko`) → **kein** Foto-CTA, Rückruf-Formular mit Original-Heading.
4. Rückruf-Formular absenden → Lead landet weiterhin in `anfragen`/`leads` (keine Regression).
5. Nach ein paar echten Durchläufen: `select count(*) from anspruch_schaetzungen where erstellt_am > '2026-07-03'` auf prod (paizkjajbuxxksdoycev) → echte neue Sessions bestätigen den geschlossenen Funnel.

---

## Self-Review

**Spec coverage:** Verkettung-CTA (Task 3+4) ✓ · showRanges-Gating (Task 4 Step 2) ✓ · Foto primär / Rückruf sekundär (Task 4 Step 3) ✓ · Attribution-Durchreichung inkl. Makler-`m` (Task 1) ✓ · i18n de/en/tr (Task 2) ✓ · MVP-Scope, kein Home-Section/Wrapper ✓ · Gates + Prod-Smoke (Task 5) ✓.

**Offener Spec-Punkt (bewusst nicht im MVP):** Ob das Foto-Tool den Makler-Code `m` serverseitig verarbeitet (Attribution-Aufnahme), ist separat zu verifizieren — das Durchreichen (Task 1) ist verlustfrei und schadet nicht; die Aufnahme im Foto-Tool wäre ein Follow-up, falls sie fehlt.

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Step zeigt vollständigen Code.

**Typ-Konsistenz:** `buildFotoCheckUrl(embedOrigin, search)` identisch in Task 1 (Def), Task 3 (Consumer). i18n-Keys `check.foto_check.*` + `check.lead_heading_alt` konsistent Task 2 (Def) → Task 3/4 (Consumer).
