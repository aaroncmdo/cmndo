# GEO-P3 Wertminderungs-Rechner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein interaktiver merkantiler Wertminderungs-Rechner, eingebettet in die bestehende (rankende) Seite `claimondo-marketing/.../kfz-gutachter/wertminderung`, der die seiten-eigene Faustregel personalisiert + Vorschäden berücksichtigt + WebApplication-Schema emittiert.

**Architecture:** Pure Calc (`lib/tools/wertminderung.ts`, unit-getestet) getrennt von der Live-Compute-Client-Component. Neuer `webApplicationSchema()`-Builder. Page mountet die Component nach der Faustregel-Tabelle. i18n über 6 Locales.

**Tech Stack:** Next.js (claimondo-marketing, eigenes Package), React Client-Component, next-intl, TypeScript, vitest (claimondo-marketing-eigen). Kein Backend, kein localStorage.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-03-geo-p3-wertminderung-rechner-design.md` (approved). Worktree `.claude/worktrees/geo-content-program`, Branch `kitta/geo-p3-wertminderung`. Alle Pfade relativ zu `claimondo-marketing/` (Sub-Package), sofern nicht anders angegeben.
- **Formel (SSoT):** `WM_FAKTOREN` = Alter 1→25 %, 2→20 %, 3→15 %, 4→10 %; ab 5 → `einzelfall`. Betrag = `round50(pct × Reparaturkosten)`. **Muss** die de.json-Faustregel spiegeln (Paritäts-Test).
- **Vorschaden** (`keine`|`repariert`|`erheblich`): `erheblich` → `einzelfall` (dominiert Alter); `repariert` → weicher Hinweis; `keine` → volle Faustregel.
- **Design-Tokens:** nur `claimondo-*` / `rounded-ios-*` — **nie raw Hex** (CI-Token-Audit). Komponenten: `@/components/shared/DataTable`, `@/components/landing/AnswerCapsule`. CTA = styled `next/link` (wie die Seite), **kein** Submit-Button (Live-Compute).
- **i18n:** neuer Namespace `wertminderung_rechner.*` in **allen 6** `i18n/messages/{de,en,tr,ar,ru,pl}.json` (Paritäts-Gate `check:i18n`). DE maßgeblich.
- **Umlaute:** alle nutzersichtbaren Strings mit echten Umlauten.
- **Regel 4 scharf** (nutzersichtbare Route/UI) → Prod-Render-Smoke (Task 7).

---

### Task 0: Setup & Infra-Klärung (claimondo-marketing)

**Ziel:** lokales Bauen/Testen ermöglichen + die drei offenen Infra-Fragen empirisch beantworten. Kein Code-Deliverable, aber blockiert alle Folge-Tasks (Test/Build).

- [ ] **Step 1: claimondo-marketing node_modules bereitstellen.** Das Sub-Package hat eigene Deps. Prüfen + junctionen (schnell) auf einen Worktree mit installierten Marketing-Deps, sonst `npm ci`:

```bash
cd "<worktree>/claimondo-marketing"
node -e "try{require.resolve('vitest');console.log('vitest OK')}catch{console.log('vitest FEHLT')}"
# falls FEHLT: Junction auf ein Worktree mit vorhandenem claimondo-marketing/node_modules (PowerShell):
#   New-Item -ItemType Junction -Path "<worktree>\claimondo-marketing\node_modules" -Target "<other-wt>\claimondo-marketing\node_modules"
# sonst: npm ci  (im claimondo-marketing-Verzeichnis)
```
Expected: `vitest OK` nach dem Setup.

- [ ] **Step 2: vitest-Lauf verifizieren** — `npx --no-install vitest run <irgendein bestehender *.test.ts>` in claimondo-marketing läuft grün (bestätigt das Test-Setup, bevor wir Tests hinzufügen). Falls es keinen bestehenden Test gibt: mit dem Task-1-Test in Step-4 verifizieren.

- [ ] **Step 3: CI-Abdeckung klären** — prüfen, ob `.github/workflows/*` einen Build/Test-Job für `claimondo-marketing` fährt (grep nach `claimondo-marketing` in `.github/workflows/`). Ergebnis im PR vermerken: **läuft die Marketing-vitest/Build in CI?** Falls NICHT → der lokale Build + der Regel-4-Prod-Smoke sind das Gate (explizit im PR notieren).

- [ ] **Step 4: Deploy-Pfad klären** — wie kommt claimondo-marketing auf Prod (`claimondo.de`)? (grep `.github/workflows/` nach `claimondo-marketing` / `deploy`; VPS `sites-enabled/claimondo`). Bestimmt, ob der Regel-4-Smoke in dieser Session (nach Merge+Deploy) oder als Marker-Handoff läuft. Ergebnis im PR.

- [ ] **Step 5: Commit** — keiner (reine Klärung; Ergebnisse fließen in den PR-Text).

---

### Task 1: Pure Calc `lib/tools/wertminderung.ts` + Test

**Files:**
- Create: `claimondo-marketing/lib/tools/wertminderung.ts`
- Test: `claimondo-marketing/lib/tools/wertminderung.test.ts`

**Interfaces:**
- Produces: `computeWertminderung(input: WmInput): WmResult`, `WM_FAKTOREN`, Typen `Vorschaden`/`WmInput`/`WmResult`.

- [ ] **Step 1: Failing test schreiben** — `claimondo-marketing/lib/tools/wertminderung.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeWertminderung, WM_FAKTOREN } from './wertminderung'

describe('computeWertminderung', () => {
  it('reproduziert die Tabellen-Beispiele (Alter 1, 10.000 EUR -> 2.500 EUR)', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 1 })
    expect(r).toMatchObject({ kind: 'schaetzung', betrag: 2500, pct: 0.25 })
  })
  it('Faktor je Alter (2->20%, 3->15%, 4->10%)', () => {
    expect(computeWertminderung({ reparaturkosten: 10000, alterJahre: 2 })).toMatchObject({ betrag: 2000 })
    expect(computeWertminderung({ reparaturkosten: 10000, alterJahre: 3 })).toMatchObject({ betrag: 1500 })
    expect(computeWertminderung({ reparaturkosten: 10000, alterJahre: 4 })).toMatchObject({ betrag: 1000 })
  })
  it('ab Jahr 5 -> einzelfall (kein Betrag)', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 6 })
    expect(r.kind).toBe('einzelfall')
    expect(r.hinweise).toContain('einzelfall_alter')
  })
  it('erheblicher Vorschaden -> einzelfall, dominiert selbst Alter 1', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 1, vorschaden: 'erheblich' })
    expect(r.kind).toBe('einzelfall')
    expect(r.hinweise).toContain('einzelfall_vorschaden')
  })
  it('reparierter Vorschaden -> schaetzung + Hinweis', () => {
    const r = computeWertminderung({ reparaturkosten: 10000, alterJahre: 1, vorschaden: 'repariert' })
    expect(r.kind).toBe('schaetzung')
    expect(r.hinweise).toContain('vorschaden_repariert')
  })
  it('fehlende Inputs -> unvollstaendig', () => {
    expect(computeWertminderung({ reparaturkosten: 0, alterJahre: 1 }).kind).toBe('unvollstaendig')
    expect(computeWertminderung({ reparaturkosten: 5000, alterJahre: NaN }).kind).toBe('unvollstaendig')
  })
  it('weiche Kontext-Hinweise (hohe km / kleiner Schaden)', () => {
    const r = computeWertminderung({ reparaturkosten: 4000, alterJahre: 2, km: 150000, wbw: 60000 })
    expect(r.hinweise).toEqual(expect.arrayContaining(['hohe_km', 'kleiner_schaden']))
  })
  it('rundet auf 50 EUR', () => {
    const r = computeWertminderung({ reparaturkosten: 3333, alterJahre: 1 }) // 25% = 833.25
    expect((r as { betrag: number }).betrag % 50).toBe(0)
  })
})

describe('Paritaet WM_FAKTOREN <-> de.json-Faustregel (Drift-Schutz)', () => {
  it('Faktoren stimmen mit der Tabelle ueberein', () => {
    const de = JSON.parse(readFileSync(new URL('../../i18n/messages/de.json', import.meta.url), 'utf8'))
    const rows = de.kfz_gutachter_wertminderung.faustregel as Array<{ jahr: string; faktor: string }>
    const numeric = rows
      .map((r) => ({ jahr: parseInt(r.jahr, 10), pct: r.faktor.includes('%') ? parseInt(r.faktor, 10) / 100 : null }))
      .filter((r) => r.pct != null)
    for (const row of numeric) {
      const f = WM_FAKTOREN.find((x) => x.maxJahr === row.jahr)
      expect(f?.pct, `Faktor fuer Jahr ${row.jahr}`).toBe(row.pct)
    }
    // "ab 5. Jahr" ist nicht-numerisch (Einzelfall) -> nicht in WM_FAKTOREN
    expect(rows.some((r) => !r.faktor.includes('%'))).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen — muss failen** — `cd claimondo-marketing && npx --no-install vitest run lib/tools/wertminderung.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung** — `claimondo-marketing/lib/tools/wertminderung.ts`:

```ts
export type Vorschaden = 'keine' | 'repariert' | 'erheblich'

export interface WmInput {
  reparaturkosten: number
  alterJahre: number
  km?: number
  wbw?: number
  vorschaden?: Vorschaden
}

export type WmResult =
  | { kind: 'unvollstaendig'; hinweise: string[] }
  | { kind: 'einzelfall'; hinweise: string[] }
  | { kind: 'schaetzung'; betrag: number; pct: number; hinweise: string[] }

// SSoT — MUSS die de.json-Faustregel-Tabelle (kfz_gutachter_wertminderung.faustregel) spiegeln.
// Ein Paritaets-Test in wertminderung.test.ts erzwingt das.
export const WM_FAKTOREN: { maxJahr: number; pct: number }[] = [
  { maxJahr: 1, pct: 0.25 },
  { maxJahr: 2, pct: 0.2 },
  { maxJahr: 3, pct: 0.15 },
  { maxJahr: 4, pct: 0.1 },
]

const round50 = (n: number) => Math.round(n / 50) * 50

export function computeWertminderung(input: WmInput): WmResult {
  const rep = Number(input.reparaturkosten)
  const alter = Number(input.alterJahre)
  const km = input.km != null ? Number(input.km) : undefined
  const wbw = input.wbw != null ? Number(input.wbw) : undefined
  const vorschaden: Vorschaden = input.vorschaden ?? 'keine'

  if (!Number.isFinite(rep) || rep <= 0 || !Number.isFinite(alter) || alter < 0) {
    return { kind: 'unvollstaendig', hinweise: [] }
  }
  // Reihenfolge wichtig: erheblicher Vorschaden dominiert das Alter.
  if (vorschaden === 'erheblich') {
    return { kind: 'einzelfall', hinweise: ['einzelfall_vorschaden'] }
  }
  if (alter >= 5) {
    return { kind: 'einzelfall', hinweise: ['einzelfall_alter'] }
  }
  const stufe = WM_FAKTOREN.find((f) => alter <= f.maxJahr) ?? WM_FAKTOREN[0]
  const betrag = round50(stufe.pct * rep)
  const hinweise: string[] = []
  if (vorschaden === 'repariert') hinweise.push('vorschaden_repariert')
  if (km != null && Number.isFinite(km) && km > 100000) hinweise.push('hohe_km')
  if (wbw != null && Number.isFinite(wbw) && wbw > 0 && rep < 0.1 * wbw) hinweise.push('kleiner_schaden')
  return { kind: 'schaetzung', betrag, pct: stufe.pct, hinweise }
}
```

- [ ] **Step 4: Test laufen — muss passen** — `npx --no-install vitest run lib/tools/wertminderung.test.ts` → PASS (8 Tests).

- [ ] **Step 5: Commit** — `git add claimondo-marketing/lib/tools/wertminderung.ts claimondo-marketing/lib/tools/wertminderung.test.ts && git commit -m "feat(geo-p3): pure Wertminderungs-Calc (Faustregel + Vorschaden, Paritaets-Test)"`

---

### Task 2: `webApplicationSchema()`-Builder + Test

**Files:**
- Modify: `claimondo-marketing/lib/seo/jsonld.ts` (neuer Export, ans Ende der Builder)
- Test: `claimondo-marketing/lib/seo/jsonld.webapp.test.ts`

**Interfaces:**
- Consumes: `SITE_URL` (bereits in jsonld.ts).
- Produces: `webApplicationSchema({ name, description, url }): object`.

- [ ] **Step 1: Failing test** — `claimondo-marketing/lib/seo/jsonld.webapp.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { webApplicationSchema, SITE_URL } from './jsonld'

describe('webApplicationSchema', () => {
  it('erzeugt einen validen WebApplication-Knoten (FinanceApplication, 0 EUR)', () => {
    const s = webApplicationSchema({
      name: 'Wertminderungs-Rechner',
      description: 'Interaktiver merkantiler Wertminderungs-Rechner.',
      url: `${SITE_URL}/kfz-gutachter/wertminderung`,
    })
    expect(s['@type']).toBe('WebApplication')
    expect(s.applicationCategory).toBe('FinanceApplication')
    expect(s.offers).toMatchObject({ price: '0', priceCurrency: 'EUR' })
    expect(s['@context']).toBe('https://schema.org')
  })
})
```

- [ ] **Step 2: Test laufen — muss failen** — `npx --no-install vitest run lib/seo/jsonld.webapp.test.ts` → FAIL (`webApplicationSchema` nicht exportiert).

- [ ] **Step 3: Builder ergänzen** — ans Ende von `claimondo-marketing/lib/seo/jsonld.ts` (Konvention wie `serviceSchema`/`stadtLegalServiceSchema`: `@context`+`@type`+`@id`, publisher `#organization`, Vorlage = autounfall `toolGraph`):

```ts
// WebApplication — für interaktive Rechner/Tools (GEO-P3). Vorlage: autounfall toolGraph.
// applicationCategory FinanceApplication + offers 0 EUR = AEO-Signal ("kostenloses Tool").
export function webApplicationSchema(opts: { name: string; description: string; url: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${opts.url}#rechner`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    inLanguage: 'de-DE',
    isAccessibleForFree: true,
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}
```

- [ ] **Step 4: Test laufen — muss passen** — `npx --no-install vitest run lib/seo/jsonld.webapp.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add claimondo-marketing/lib/seo/jsonld.ts claimondo-marketing/lib/seo/jsonld.webapp.test.ts && git commit -m "feat(geo-p3): webApplicationSchema()-Builder (WebApplication JSON-LD)"`

---

### Task 3: i18n-Keys `wertminderung_rechner.*` (alle 6 Locales)

**Files:**
- Modify: `claimondo-marketing/i18n/messages/{de,en,tr,ar,ru,pl}.json`

**Interfaces:**
- Produces: Namespace `wertminderung_rechner` mit Keys, die Task 4 (Component) via `useTranslations('wertminderung_rechner')` konsumiert.

- [ ] **Step 1: DE-Keys (maßgeblich)** in `de.json` als neuen Top-Level-Namespace `wertminderung_rechner` ergänzen:

```json
"wertminderung_rechner": {
  "titel": "Wertminderung mit deinen Werten berechnen",
  "intro": "Die Tabelle oben zeigt die Faustregel. Rechne hier mit deinen eigenen Zahlen:",
  "label_reparaturkosten": "Reparaturkosten (€)",
  "label_alter": "Fahrzeugalter (Jahre)",
  "label_km": "Laufleistung (km, optional)",
  "label_wbw": "Wiederbeschaffungswert (€, optional)",
  "label_vorschaden": "Vorschäden am Fahrzeug?",
  "vorschaden_keine": "Keine",
  "vorschaden_repariert": "Fachgerecht repariert",
  "vorschaden_erheblich": "Erheblich / unrepariert",
  "ergebnis_schaetzung": "Grobe Orientierung: {betrag} ({pct} der Reparaturkosten).",
  "ergebnis_einzelfall_alter": "Einzelfall: abhängig von Laufleistung & Marktwert. Der BGH lehnt starre Altersgrenzen ab (VI ZR 357/03) — auch ältere Fahrzeuge können Anspruch haben. Der belastbare Betrag kommt vom Gutachten.",
  "ergebnis_einzelfall_vorschaden": "Erhebliche Vorschäden mindern die merkantile Wertminderung deutlich. Die Höhe ist ein Einzelfall — den belastbaren Betrag ermittelt nur das Gutachten.",
  "ergebnis_unvollstaendig": "Bitte Reparaturkosten und Fahrzeugalter angeben.",
  "hinweis_vorschaden_repariert": "Fachgerecht reparierte Vorschäden mindern die Wertminderung leicht — die Faustregel ist hier eher eine Obergrenze.",
  "hinweis_hohe_km": "Bei hoher Laufleistung liegt die Wertminderung eher am unteren Rand.",
  "hinweis_kleiner_schaden": "Bei kleinem Schaden im Verhältnis zum Fahrzeugwert kann die Wertminderung gering ausfallen.",
  "disclaimer": "Faustregel-Orientierung, kein Ersatz fürs Gutachten. Den belastbaren Betrag ermittelt ein zertifizierter Sachverständiger (Sanden/Danner) — er berücksichtigt Laufleistung, Marktwert, Vorschäden und Reparaturqualität.",
  "cta": "Kostenlosen Gutachter beauftragen"
}
```

- [ ] **Step 2: Übersetzungen** in `en.json`, `tr.json`, `ar.json`, `ru.json`, `pl.json` — **denselben Key-Satz** (identische Keys, übersetzte Werte). EN-Beispiel (Rest analog übersetzen):

```json
"wertminderung_rechner": {
  "titel": "Calculate diminished value with your numbers",
  "intro": "The table above shows the rule of thumb. Calculate with your own figures here:",
  "label_reparaturkosten": "Repair costs (€)",
  "label_alter": "Vehicle age (years)",
  "label_km": "Mileage (km, optional)",
  "label_wbw": "Replacement value (€, optional)",
  "label_vorschaden": "Prior damage to the vehicle?",
  "vorschaden_keine": "None",
  "vorschaden_repariert": "Properly repaired",
  "vorschaden_erheblich": "Substantial / unrepaired",
  "ergebnis_schaetzung": "Rough guide: {betrag} ({pct} of repair costs).",
  "ergebnis_einzelfall_alter": "Individual case: depends on mileage & market value. German courts reject rigid age limits (BGH VI ZR 357/03). The binding figure comes from the expert report.",
  "ergebnis_einzelfall_vorschaden": "Substantial prior damage significantly reduces the diminished value. The amount is an individual case — only the expert report determines the binding figure.",
  "ergebnis_unvollstaendig": "Please enter repair costs and vehicle age.",
  "hinweis_vorschaden_repariert": "Properly repaired prior damage slightly reduces the diminished value — the rule of thumb is an upper bound here.",
  "hinweis_hohe_km": "With high mileage the diminished value tends to be at the lower end.",
  "hinweis_kleiner_schaden": "For small damage relative to vehicle value the diminished value can be low.",
  "disclaimer": "Rule-of-thumb guidance, not a substitute for an expert report. A certified expert (Sanden/Danner) determines the binding figure.",
  "cta": "Commission a free expert"
}
```
(`tr/ar/ru/pl` mit demselben Key-Satz übersetzen — der `check:i18n`-Paritäts-Gate erzwingt Vollständigkeit; fehlt ein Key in einer Locale, ist der Task nicht fertig.)

- [ ] **Step 3: Parität prüfen** — sofern vorhanden: `npm run check:i18n` (im claimondo-marketing- bzw. Repo-Kontext) → alle 6 Locales haben identische Keys. Sonst manuell diff-en, dass jede Datei den vollen `wertminderung_rechner`-Key-Satz hat.

- [ ] **Step 4: Commit** — `git add claimondo-marketing/i18n/messages/*.json && git commit -m "feat(geo-p3): i18n wertminderung_rechner (6 Locales)"`

---

### Task 4: Client-Component `WertminderungRechnerClient.tsx`

**Files:**
- Create: `claimondo-marketing/app/[locale]/kfz-gutachter/wertminderung/WertminderungRechnerClient.tsx`

**Interfaces:**
- Consumes: `computeWertminderung` (Task 1), Keys `wertminderung_rechner.*` (Task 3), `AnswerCapsule`.
- Produces: Default-Export `WertminderungRechnerClient` (Page mountet ihn in Task 5).

- [ ] **Step 1: Component schreiben** (Live-Compute via `useMemo`, kein Submit-Button; Tokens claimondo-*; Zahlen via `Intl.NumberFormat('de-DE')`):

```tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { computeWertminderung, type Vorschaden } from '@/lib/tools/wertminderung'

const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const inputCls =
  'mt-1 w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none'

export default function WertminderungRechnerClient() {
  const t = useTranslations('wertminderung_rechner')
  const [rep, setRep] = useState('')
  const [alter, setAlter] = useState('')
  const [km, setKm] = useState('')
  const [wbw, setWbw] = useState('')
  const [vorschaden, setVorschaden] = useState<Vorschaden>('keine')

  const result = useMemo(
    () =>
      computeWertminderung({
        reparaturkosten: parseFloat(rep),
        alterJahre: parseFloat(alter),
        km: km ? parseFloat(km) : undefined,
        wbw: wbw ? parseFloat(wbw) : undefined,
        vorschaden,
      }),
    [rep, alter, km, wbw, vorschaden],
  )

  return (
    <div className="mt-6 rounded-ios-md border border-claimondo-border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-claimondo-navy">{t('titel')}</h3>
      <p className="mt-1 text-sm text-claimondo-shield">{t('intro')}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_reparaturkosten')}
          <input type="number" inputMode="numeric" min={0} value={rep} onChange={(e) => setRep(e.target.value)} className={inputCls} placeholder="10000" />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_alter')}
          <input type="number" inputMode="numeric" min={0} value={alter} onChange={(e) => setAlter(e.target.value)} className={inputCls} placeholder="3" />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_km')}
          <input type="number" inputMode="numeric" min={0} value={km} onChange={(e) => setKm(e.target.value)} className={inputCls} placeholder="60000" />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_wbw')}
          <input type="number" inputMode="numeric" min={0} value={wbw} onChange={(e) => setWbw(e.target.value)} className={inputCls} placeholder="15000" />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy sm:col-span-2">
          {t('label_vorschaden')}
          <select value={vorschaden} onChange={(e) => setVorschaden(e.target.value as Vorschaden)} className={inputCls}>
            <option value="keine">{t('vorschaden_keine')}</option>
            <option value="repariert">{t('vorschaden_repariert')}</option>
            <option value="erheblich">{t('vorschaden_erheblich')}</option>
          </select>
        </label>
      </div>

      <div className="mt-5">
        <AnswerCapsule quelle="§251 BGB · BGH VI ZR 357/03">
          {result.kind === 'unvollstaendig' && <span>{t('ergebnis_unvollstaendig')}</span>}
          {result.kind === 'einzelfall' && (
            <span>{result.hinweise.includes('einzelfall_vorschaden') ? t('ergebnis_einzelfall_vorschaden') : t('ergebnis_einzelfall_alter')}</span>
          )}
          {result.kind === 'schaetzung' && (
            <span className="font-semibold text-claimondo-navy">
              {t('ergebnis_schaetzung', { betrag: eur(result.betrag), pct: `${Math.round(result.pct * 100)} %` })}
            </span>
          )}
        </AnswerCapsule>
        {result.kind === 'schaetzung' &&
          result.hinweise
            .filter((h) => h !== 'einzelfall_alter' && h !== 'einzelfall_vorschaden')
            .map((h) => (
              <p key={h} className="mt-2 text-xs text-claimondo-ondo">
                {t(`hinweis_${h}`)}
              </p>
            ))}
      </div>

      <p className="mt-4 text-xs text-claimondo-shield">{t('disclaimer')}</p>

      <Link
        href="/schaden-melden"
        className="mt-5 inline-flex items-center gap-2 rounded-ios-md bg-claimondo-ondo px-6 py-3 text-sm font-bold text-white hover:bg-claimondo-shield"
      >
        {t('cta')}
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: tsc/Lint-Check** — sofern lokal möglich: `npx tsc --noEmit` (claimondo-marketing) enthält keine neuen Fehler für diese Datei. (Voller Build kommt in Task 6.)

- [ ] **Step 3: Commit** — `git add claimondo-marketing/app/\[locale\]/kfz-gutachter/wertminderung/WertminderungRechnerClient.tsx && git commit -m "feat(geo-p3): WertminderungRechnerClient (Live-Compute, i18n, claimondo-Tokens)"`

---

### Task 5: Page-Edit — Component mounten + Schema

**Files:**
- Modify: `claimondo-marketing/app/[locale]/kfz-gutachter/wertminderung/page.tsx`

- [ ] **Step 1: Imports ergänzen** (oben): `import WertminderungRechnerClient from './WertminderungRechnerClient'` und `webApplicationSchema` zum bestehenden `@/lib/seo/jsonld`-Import hinzufügen.

- [ ] **Step 2: Schema ins JSON-LD-Array** — im `jsonLdScript([...])`-Aufruf (nach `serviceSchema(...)`) ergänzen:

```tsx
webApplicationSchema({
  name: 'Wertminderungs-Rechner',
  description: 'Interaktiver Rechner für die merkantile Wertminderung nach Unfall — Faustregel nach Fahrzeugalter, mit Vorschaden-Berücksichtigung. Kostenlos.',
  url: `${SITE_URL}/kfz-gutachter/wertminderung`,
}),
```

- [ ] **Step 3: Component mounten** — direkt nach der Faustregel-`DataTableContainer` + `faustregel_note`-`<p>` (aktuell Zeile ~157), vor der `sanden_danner_h2`-`<h2>`:

```tsx
<WertminderungRechnerClient />
```

- [ ] **Step 4: Verify** — die Faustregel-Tabelle bleibt (Referenz); der Rechner steht darunter; `faustregel_note` bleibt (rahmt die Tabelle bereits als „Orientierung").

- [ ] **Step 5: Commit** — `git add claimondo-marketing/app/\[locale\]/kfz-gutachter/wertminderung/page.tsx && git commit -m "feat(geo-p3): Wertminderungs-Rechner + WebApplication-Schema in die Seite einbetten"`

---

### Task 6: Build-Gate

- [ ] **Step 1: Voller Build** (sofern Deps lokal, s. Task 0) — `cd claimondo-marketing && npm run build` → grün (Next-15-Validator fängt Route/Server-Component-Fehler, die tsc allein nicht sieht). Bei fehlenden Deps: der CI-Build ist das Gate (Task-0-Step-3-Ergebnis beachten).
- [ ] **Step 2: vitest gesamt** — `npx --no-install vitest run lib/tools/ lib/seo/jsonld.webapp.test.ts` → alle grün.
- [ ] **Step 3: kein Commit** (Verifikation).

---

### Task 7: PR + Regel-4-Prod-Smoke

- [ ] **Step 1: Push + PR** gegen `staging`:

```bash
git push -u origin kitta/geo-p3-wertminderung
gh pr create --base staging --title "feat(geo-p3): interaktiver Wertminderungs-Rechner (claimondo.de)" --body "GEO-Programm P3 Sub-1, datengetrieben durch P1-Messung (t08). ..."
```

- [ ] **Step 2: Regel-4-Prod-Smoke** (nach Deploy — Pfad aus Task 0 Step 4). Prod-Render der Seite `https://claimondo.de/kfz-gutachter/wertminderung`:
  1. Seite rendert HTTP 200 + Rechner sichtbar (kein leerer Shell).
  2. Reparaturkosten=10000, Alter=1 → Ergebnis enthält „2.500 €" (25 % — matcht das Tabellen-Beispiel).
  3. Alter=6 → „Einzelfall"-Text; Vorschaden=erheblich → Vorschaden-Einzelfall-Text.
  (Playwright/webapp-testing oder — falls SSR den Rechner-Default-State rendert — curl auf das gerenderte HTML + Client-Interaktion via Playwright.)
- [ ] **Step 3: Rot → Fix-PR; nicht als erledigt markieren, solange der Prod-Smoke rot ist.** Deploy nicht in dieser Session → Smoke-Pflicht per Marker an die Deploy-Session übergeben.

---

## Self-Review

**1. Spec-Coverage:** Pure Calc + Vorschaden + Paritäts-Test → Task 1 ✓. webApplicationSchema → Task 2 ✓. i18n 6 Locales → Task 3 ✓. Client-Component (Live-Compute, Tokens, AnswerCapsule) → Task 4 ✓. Page-Embed + Schema + Faustregel bleibt → Task 5 ✓. Build → Task 6 ✓. Regel-4-Smoke → Task 7 ✓. Infra-Unbekannte (Deps/CI/Deploy) → Task 0 ✓.

**2. Placeholder-Scan:** Keine TBD im Code. „tr/ar/ru/pl analog übersetzen" (Task 3) ist ein Daten-Task mit hartem Gate (`check:i18n`), kein Code-Placeholder. Task-0-Klärungen sind bewusste empirische Investigations (Infra ist real unbekannt), keine Design-Lücken.

**3. Typ-Konsistenz:** `computeWertminderung`/`WmResult`/`Vorschaden` identisch in Task 1 (Def), Task 4 (Consumer). `webApplicationSchema({name,description,url})` identisch Task 2 (Def) ↔ Task 5 (Aufruf). i18n-Keys `wertminderung_rechner.*` identisch Task 3 (Def) ↔ Task 4 (`t('...')`). `hinweise`-Keys (`vorschaden_repariert`/`hohe_km`/`kleiner_schaden`/`einzelfall_*`) konsistent Calc↔Component↔i18n (`hinweis_${h}` / `ergebnis_einzelfall_*`). ✓
