# Werkstattbindung in Kasko-Tarifen — Implementierungsplan Phase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kunden im Kasko-Fall wählen Versicherer-Marke und Tarif; daraus wird `freie_werkstattwahl` abgeleitet, gebundene Kunden bekommen eine ehrliche Endseite statt Werkstatt-Vermittlung, die drei Umgehungen fragen dieselbe Frage, Dispatch sieht Tarif und Grund.

**Architecture:** Wissensbasis als drei Referenztabellen (Marken · Tarife · Konditionen, anon lesbar), geseedet aus einer versionierten JSON per Generator ohne UUIDs. Eine pure Ableitung `leiteWerkstattbindungAb` speist das bestehende Entscheidungsfeld `freie_werkstattwahl`; eine wiederverwendbare Client-Komponente `KaskoTarifFrage` sitzt im FlowLink-Step `werkstattbindung_check`, im Embed-Werkstatt-Finder und im Kunde-Portal. Alles Nachgelagerte (Quali-Outcome, Disqualifikation, Convert, Spiegel, Reminder) bleibt unverändert.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres, RLS, MCP `apply_migration`), TypeScript, vitest, Tailwind mit Claimondo-Tokens, `@/components/primitives`.

**Spec:** `docs/superpowers/specs/2026-09-04-werkstattbindung-kasko-tarife-design.md` · **Scan:** `docs/2026-09-03-werkstattbindung-kasko-tarife-scan.md`

## Global Constraints

- **Arbeitsort:** Worktree `.claude/worktrees/werkstattbindung-kasko-tarife`, Branch `kitta/werkstattbindung-kasko-tarife` (Basis `origin/staging`). NIEMALS im Haupt-Checkout arbeiten (963 Commits stale). PR gegen `staging`, nie auf `main` (AGENTS.md Regel 1).
- **Regel 2 (DDL):** ausschließlich `mcp__plugin_supabase_supabase__apply_migration` gegen Projekt `paizkjajbuxxksdoycev`, danach `list_migrations` → Version `<V>` ablesen → Datei `supabase/migrations/<V>_<name>.sql` **exakt** so benennen. `execute_sql` nur READ. Kein `db push`, kein Studio-DDL.
- **Regel 3:** kein unbegleiteter Stash am Session-Ende.
- **Server-Actions:** Datei-Level `'use server'`-Dateien exportieren NUR `export async function` und `export type`-DEKLARATIONEN (kein `export type { X }`-Re-Export, keine Konstanten). Result-Object `{ ok: boolean; error?: string }`, nie `throw`. Mutierende Actions rufen `revalidatePath`.
- **UI-Texte:** Deutsch mit echten Umlauten (ä ö ü ß). Neue Flow-Texte sind hardcodiert Deutsch (wie der ersetzte Step); keine neuen i18n-Keys in Phase 1.
- **Komponenten:** neue Buttons/Cards/Badges aus `@/components/primitives` (`Button` mit `variant`/`onClick`/`loading`, `Card`, `Badge` mit `tone`), Radien `rounded-ios-*`, Status-Farben `bg-success-soft`/`text-success-strong`/`bg-warning-soft`/`text-warning-strong`/`bg-info-soft`, keine raw Hex, keine Tailwind-Default-Radien.
- **Werkzeuge im Worktree:** `./node_modules/.bin/tsc`, `./node_modules/.bin/vitest` direkt aufrufen (nicht `npx`, das zieht fremde Versionen). Node-Scripts mit `node --env-file=.env.local …`.
- **Commits:** Format aus AGENTS.md (7-Punkte-Audit im Body, bei reinen Teil-Commits kurz mit „n/a"), Abschluss:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG`.
- **Bezeichner nachschlagen, nie raten** (Spaltennamen aus `information_schema`/Types, Routen aus `git ls-tree`).
- **Entscheidungsfeld bleibt `freie_werkstattwahl`** (`true` frei · `false` gebunden · `null` offen). Neue Felder liefern nur Herkunft und Kontext.

---

## Dateiübersicht

**Neu**
- `scripts/kasko-wb/wissensbasis-2026-07-20.json` — Quelle der Wissensbasis (72 Marken, Appendix A)
- `scripts/lib/kasko-wb-seed.mjs` — pure Generator-Logik (Expansion, Validierung, SQL)
- `scripts/lib/kasko-wb-seed.test.mjs` — vitest
- `scripts/kasko-wb/generate-seed-sql.mjs` — CLI: JSON → `scripts/kasko-wb/seed.generated.sql`
- `supabase/migrations/<V1>_kasko_wb_wissensbasis_tabellen.sql` · `<V2>_kasko_wb_wissensbasis_seed.sql` · `<V3>_kasko_wb_lead_claim_felder_trigger_feld.sql`
- `src/lib/kasko-wb/types.ts` — geteilte Typen (client-safe)
- `src/lib/kasko-wb/werkstattbindung.ts` + `__tests__/werkstattbindung.test.ts` — Ableitung
- `src/lib/kasko-wb/actions.ts` — `'use server'`: Marken/Tarife/Bindungs-Info laden
- `src/lib/kasko-wb/notify-kunde-werkstattbindung.ts` + `__tests__/notify-kunde-werkstattbindung.test.ts` — E6-Mail
- `src/lib/self-service/disqualifikation-patch.ts` + `__tests__/disqualifikation-patch.test.ts`
- `src/components/self-service/KaskoTarifFrage.tsx` · `KaskoBindungEndansicht.tsx` · `KaskoUnklarHinweis.tsx`
- `src/app/flow/[token]/FlowKaskoBindungGate.tsx` — Re-Visit-Gate für bereits disqualifizierte Bindungs-Leads
- `src/components/kunde/KaskoTarifCard.tsx` · `KaskoBindungCard.tsx` · `src/app/kunde/faelle/[id]/kasko-tarif-actions.ts`
- `src/app/dispatch/leads/[id]/_v2/DispatchKaskoTarifField.tsx`
- `src/app/admin/einstellungen/kasko-tarife/page.tsx` · `KaskoTarifeTable.tsx`

**Geändert**
- `src/app/flow/[token]/FlowWerkstattbindungStep.tsx` (ersetzt Inhalt) · `FlowQualiStep.tsx` (Phase `werkstattbindung`) · `FlowWizardKfz.tsx` (Gate + Prop-Typ) · `page.tsx` (Prop) · `self-service-actions.ts` (neue Action, Helper-Refactor)
- `src/lib/self-service/flow-kontext.ts` (+ `werkstattbindung_quelle`) · `src/lib/leads/spiegle-quali-auf-claim.ts` · `src/lib/leads/convert-lead-to-claim.ts`
- `src/lib/werkstatt/vermittlung-core.ts` (`BedarfRow.freie_werkstattwahl`) · `vermittlung-server.ts` (Guard) · `src/lib/claims/kunde-claim-view.ts` (Flags) · `src/components/kunde/claim-view/GeldZone.tsx`
- `src/app/embed/werkstatt-finder/_components/wizard-logic.ts` · `AbrechnungStep.tsx` · `WerkstattWizard.tsx` · `src/app/embed/werkstatt-finder/actions.ts` · `src/lib/werkstatt/embed-finder-core.ts`
- `src/app/dispatch/leads/[id]/DispatchGatesPanel.tsx` · `_v2/dispatch-field-override-keys.ts` · `_v2/dispatch-field-overrides.tsx` · `_actions/stammdaten.ts`
- `src/lib/supabase/database.types.ts` (regeneriert) · `scripts/lib/schema-snapshot.json` (regeneriert)

---

### Task 0: Arbeitsumgebung im Worktree

**Files:** keine Code-Änderung.

- [ ] **Step 1: Ins Worktree wechseln und Stand prüfen**

```bash
cd "/c/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/werkstattbindung-kasko-tarife"
git status --short && git log --oneline -1
```
Erwartet: `b6ef4a195 docs(kasko-wb): Scan …` (oder neuer), Working Tree clean.

- [ ] **Step 2: `.env.local` aus dem Haupt-Checkout kopieren (nicht committed, wird von Scripts gebraucht)**

```bash
cp "/c/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local" .env.local && grep -c "SUPABASE" .env.local
```
Erwartet: eine Zahl > 0.

- [ ] **Step 3: node_modules bereitstellen** — zuerst Junction auf einen frischen installierten Worktree versuchen, sonst `npm ci`:

```bash
cmd //c mklink //J node_modules "C:\Users\Aaron Sprafke\AppData\Local\Temp\claude\C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2\a42daf33-cfc0-44e1-beb7-48d1bdce8e1a\scratchpad\wt-lead-payload\node_modules" || npm ci
```

- [ ] **Step 4: Baseline grün beweisen**

```bash
./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run src/lib/self-service src/lib/werkstatt
```
Erwartet: `tsc` ohne Fehler; vitest „passed". Schlägt `tsc` mit fehlenden Modulen fehl, war die Junction stale → `cmd //c rmdir node_modules && npm ci`, dann wiederholen.

---

### Task 1: Seed-Generator (pure Logik + Test)

**Files:**
- Create: `scripts/lib/kasko-wb-seed.mjs`
- Test: `scripts/lib/kasko-wb-seed.test.mjs`

**Interfaces:**
- Produces: `expandTarife(marke)`, `validateSeed(data)`, `buildSeedSql(data)`, `sqlLit(s)`, `sqlTextArray(arr)` — genutzt von Task 2 (CLI) und Task 4 (Migration 2).
- JSON-Vertrag (Appendix A): `{ quelle, stand, default_konditionen, marken: Marke[] }` mit
  `Marke = { slug, marke, versicherung_name|null, wb_status, wb_zusaetze: {zusatz, umfang?, verlaesslichkeit?}[], wb_marker: string[], nicht_wb_marker: string[], linien: string[], linien_ohne_wb: string[], linien_nur_wb: string[], tarife_explizit?: {anzeigename, linie, wb_zusatz|null, wb, umfang?, verlaesslichkeit?}[], verlaesslichkeit_default?, hinweis|null, varianten_hinweis|null, check24_vertrieb, konditionen|null }`.

- [ ] **Step 1: Test schreiben**

```js
// scripts/lib/kasko-wb-seed.test.mjs
import { describe, it, expect } from 'vitest'
import { expandTarife, validateSeed, buildSeedSql, sqlLit, sqlTextArray } from './kasko-wb-seed.mjs'

const huk = {
  slug: 'huk-coburg', marke: 'HUK-COBURG', versicherung_name: 'HUK-COBURG-Allgemeine Versicherung AG',
  wb_status: 'optional', wb_zusaetze: [{ zusatz: 'SELECT' }], wb_marker: ['SELECT', 'Kasko SELECT'],
  nicht_wb_marker: ['Kasko PLUS'], linien: ['Basis', 'Classic', 'Classic Kasko PLUS'],
  linien_ohne_wb: [], linien_nur_wb: [], hinweis: null, varianten_hinweis: null, check24_vertrieb: 'L', konditionen: null,
}
const lvm = {
  slug: 'lvm', marke: 'LVM', versicherung_name: 'LVM Landwirtschaftlicher Versicherungsverein Münster a.G.',
  wb_status: 'keine', wb_zusaetze: [], wb_marker: [], nicht_wb_marker: ['mit LVM-SchadenService'],
  linien: [], linien_ohne_wb: ['AutoPlus', 'AutoPlus mit LVM-SchadenService'], linien_nur_wb: [],
  hinweis: 'Steuerungsangebot, keine Bindung', varianten_hinweis: null, check24_vertrieb: 'L', konditionen: null,
}
const vw = {
  slug: 'volkswagen-autoversicherung', marke: 'Volkswagen Autoversicherung', versicherung_name: null,
  wb_status: 'standard', wb_zusaetze: [{ zusatz: 'mit Werkstattbindung' }], wb_marker: ['mit Werkstattbindung'],
  nicht_wb_marker: [], linien: [], linien_ohne_wb: [], linien_nur_wb: ['Basis', 'Optimal', 'Premium'],
  hinweis: null, varianten_hinweis: null, check24_vertrieb: 'L', konditionen: null,
}
const signal = {
  ...huk, slug: 'signal-iduna', marke: 'Signal Iduna', linien: ['Basis', 'Premium'], nicht_wb_marker: [],
  wb_marker: ['Sorglos Kasko', 'Sorglos Kasko Glas'],
  wb_zusaetze: [{ zusatz: 'Sorglos Kasko', umfang: 'voll' }, { zusatz: 'Sorglos Kasko Glas', umfang: 'nur_glas' }],
}
const defaults = {
  nachlass_text: 'marktüblich 10–20 %', sanktion_modell: 'kuerzung_80', sanktion_text: 'GDV 80 %', gilt_fuer: 'VK+TK',
  ausnahmen_text: 'Haftpflicht', partnernetz: null, akb_fundstelle: 'A.2.5.2.5.2', quelle: 'GDV',
}
const data = { quelle: 'CHECK24 20.07.2026', stand: '2026-07-20', default_konditionen: defaults, marken: [huk, lvm, vw, signal] }

describe('expandTarife', () => {
  it('optional: je Linie eine freie Zeile und eine je WB-Zusatz', () => {
    const rows = expandTarife(huk)
    expect(rows.map((r) => r.anzeigename)).toEqual([
      'Basis', 'Basis SELECT', 'Classic', 'Classic SELECT', 'Classic Kasko PLUS', 'Classic Kasko PLUS SELECT',
    ])
    expect(rows.find((r) => r.anzeigename === 'Classic SELECT')).toMatchObject({
      linie: 'Classic', wb_zusatz: 'SELECT', hat_werkstattbindung: true, bindungsumfang: 'voll', verlaesslichkeit: 'belegt',
    })
    expect(rows.find((r) => r.anzeigename === 'Classic')).toMatchObject({ hat_werkstattbindung: false, bindungsumfang: 'keine' })
  })
  it('zwei Stufen (Signal Iduna): voll und nur_glas', () => {
    const rows = expandTarife(signal)
    expect(rows.map((r) => r.anzeigename)).toEqual([
      'Basis', 'Basis Sorglos Kasko', 'Basis Sorglos Kasko Glas', 'Premium', 'Premium Sorglos Kasko', 'Premium Sorglos Kasko Glas',
    ])
    expect(rows[2]).toMatchObject({ hat_werkstattbindung: true, bindungsumfang: 'nur_glas' })
  })
  it('keine: nur freie Zeilen · standard: nur gebundene Zeilen', () => {
    expect(expandTarife(lvm).every((r) => r.hat_werkstattbindung === false)).toBe(true)
    expect(expandTarife(lvm)).toHaveLength(2)
    const v = expandTarife(vw)
    expect(v.every((r) => r.hat_werkstattbindung === true)).toBe(true)
    expect(v.map((r) => r.anzeigename)).toEqual(['Basis mit Werkstattbindung', 'Optimal mit Werkstattbindung', 'Premium mit Werkstattbindung'])
  })
  it('tarife_explizit gewinnt (VRK-Schreibweise)', () => {
    const vrk = { ...huk, slug: 'vrk', tarife_explizit: [
      { anzeigename: 'Classic Kasko Plus', linie: 'Classic Kasko Plus', wb_zusatz: null, wb: false },
      { anzeigename: 'Classic Select Kasko Plus', linie: 'Classic Kasko Plus', wb_zusatz: 'Select', wb: true },
    ] }
    expect(expandTarife(vrk).map((r) => r.anzeigename)).toEqual(['Classic Kasko Plus', 'Classic Select Kasko Plus'])
  })
  it('verlaesslichkeit_default wird uebernommen', () => {
    const bgv = { ...huk, slug: 'bgv', verlaesslichkeit_default: 'abgeleitet' }
    expect(expandTarife(bgv).every((r) => r.verlaesslichkeit === 'abgeleitet')).toBe(true)
  })
  it('reihenfolge ist fortlaufend ab 10', () => {
    expect(expandTarife(huk).map((r) => r.reihenfolge)).toEqual([10, 20, 30, 40, 50, 60])
  })
})

describe('validateSeed', () => {
  it('gueltige Daten -> keine Fehler', () => {
    expect(validateSeed(data)).toEqual([])
  })
  it('doppelter Slug, optional ohne Marker, keine mit WB-Zeile -> Fehler', () => {
    const bad = { ...data, marken: [
      huk, { ...huk },
      { ...huk, slug: 'x', wb_marker: [], wb_zusaetze: [] },
      { ...lvm, slug: 'y', linien: ['A'], wb_zusaetze: [{ zusatz: 'Z' }] },
    ] }
    const errs = validateSeed(bad)
    expect(errs.some((e) => e.includes('doppelter slug'))).toBe(true)
    expect(errs.some((e) => e.includes('optional ohne wb_marker'))).toBe(true)
    expect(errs.some((e) => e.includes('keine mit WB-Zeile'))).toBe(true)
  })
  it('ungueltige Enum-Werte werden gemeldet', () => {
    const errs = validateSeed({ ...data, marken: [{ ...huk, wb_status: 'egal', check24_vertrieb: 'X' }] })
    expect(errs.some((e) => e.includes('wb_status'))).toBe(true)
    expect(errs.some((e) => e.includes('check24_vertrieb'))).toBe(true)
  })
})

describe('sql', () => {
  it('sqlLit escaped Hochkommata, null -> NULL', () => {
    expect(sqlLit("Brandgilde von 1691 VVaG 'a.G.'")).toBe("'Brandgilde von 1691 VVaG ''a.G.'''")
    expect(sqlLit(null)).toBe('NULL')
  })
  it('sqlTextArray', () => {
    expect(sqlTextArray([])).toBe("'{}'::text[]")
    expect(sqlTextArray(['SELECT', "O'Brien"])).toBe("ARRAY['SELECT','O''Brien']::text[]")
  })
  it('buildSeedSql ist idempotent (ON CONFLICT), koppelt per slug und backfillt den Rechtstraeger per Name', () => {
    const sql = buildSeedSql(data)
    expect(sql).toContain("INSERT INTO public.kasko_versicherer_marken")
    expect(sql).toContain("ON CONFLICT (slug) DO UPDATE")
    expect(sql).toContain("ON CONFLICT (marke_id, anzeigename) DO UPDATE")
    expect(sql).toContain("FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'")
    expect(sql).toContain("v.name = 'HUK-COBURG-Allgemeine Versicherung AG'")
    expect(sql).toContain("'__default__'")
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `./node_modules/.bin/vitest run scripts/lib/kasko-wb-seed.test.mjs`
Expected: FAIL („Failed to load … kasko-wb-seed.mjs" / Modul nicht gefunden).

- [ ] **Step 3: Implementierung**

```js
// scripts/lib/kasko-wb-seed.mjs
// Pure Generator der Kasko-Werkstattbindungs-Wissensbasis: JSON (scripts/kasko-wb/wissensbasis-*.json)
// -> idempotentes Upsert-SQL OHNE UUIDs (Marken per slug, Tarife per (slug, anzeigename), Rechtstraeger-FK
// per UPDATE ... FROM versicherungen v WHERE v.name = ...). Replay-fest, weil der versicherungen-Seed selbst
// nicht versioniert ist (Scan 03.09.: 55 von 97 Zeilen im Repo). Kein DB-Zugriff hier.

const WB_STATUS = new Set(['optional', 'standard', 'keine'])
const UMFANG = new Set(['keine', 'voll', 'nur_glas', 'unklar'])
const VERLAESSLICHKEIT = new Set(['belegt', 'abgeleitet', 'nicht_belegt'])
const VERTRIEB = new Set(['P', 'L'])
const SANKTION = new Set(['kuerzung_80', 'kuerzung_85', 'sonder_sb', 'deckelung', 'vollverweigerung', 'kuerzung_unbestimmt', 'keine', 'unbekannt'])

export function sqlLit(s) {
  if (s === null || s === undefined) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}

export function sqlTextArray(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]"
  return `ARRAY[${arr.map((s) => sqlLit(s)).join(',')}]::text[]`
}

function tarifZeile(linie, zusatz, wb, umfang, verlaesslichkeit, reihenfolge) {
  return {
    linie,
    wb_zusatz: zusatz ?? null,
    anzeigename: zusatz ? `${linie} ${zusatz}` : linie,
    hat_werkstattbindung: wb,
    bindungsumfang: wb ? umfang ?? 'voll' : 'keine',
    verlaesslichkeit,
    reihenfolge,
  }
}

/** Expandiert Linien x WB-Zusaetze zu Tarifzeilen. Reihenfolge = Anzeige-Reihenfolge (10, 20, ...). */
export function expandTarife(marke) {
  const vDefault = marke.verlaesslichkeit_default ?? 'belegt'
  const rows = []
  let n = 0
  const next = () => (n += 10)

  if (Array.isArray(marke.tarife_explizit) && marke.tarife_explizit.length > 0) {
    for (const t of marke.tarife_explizit) {
      rows.push({
        linie: t.linie,
        wb_zusatz: t.wb_zusatz ?? null,
        anzeigename: t.anzeigename,
        hat_werkstattbindung: t.wb,
        bindungsumfang: t.wb ? t.umfang ?? 'voll' : 'keine',
        verlaesslichkeit: t.verlaesslichkeit ?? vDefault,
        reihenfolge: next(),
      })
    }
    return rows
  }

  const zusaetze = marke.wb_zusaetze ?? []
  for (const linie of marke.linien ?? []) {
    if (marke.wb_status !== 'standard') rows.push(tarifZeile(linie, null, false, 'keine', vDefault, next()))
    if (marke.wb_status !== 'keine') {
      for (const z of zusaetze) rows.push(tarifZeile(linie, z.zusatz, true, z.umfang, z.verlaesslichkeit ?? vDefault, next()))
    }
  }
  for (const linie of marke.linien_ohne_wb ?? []) rows.push(tarifZeile(linie, null, false, 'keine', vDefault, next()))
  for (const linie of marke.linien_nur_wb ?? []) {
    for (const z of zusaetze) rows.push(tarifZeile(linie, z.zusatz, true, z.umfang, z.verlaesslichkeit ?? vDefault, next()))
  }
  return rows
}

/** Liefert eine Liste lesbarer Fehler; leer = gueltig. */
export function validateSeed(data) {
  const errs = []
  const slugs = new Set()
  const namen = new Set()
  if (!data || !Array.isArray(data.marken)) return ['marken fehlt oder ist kein Array']
  if (!data.default_konditionen) errs.push('default_konditionen fehlt')
  for (const m of data.marken) {
    const p = `[${m.slug ?? '?'}]`
    if (!m.slug || !/^[a-z0-9-]+$/.test(m.slug)) errs.push(`${p} slug fehlt oder nicht [a-z0-9-]`)
    if (slugs.has(m.slug)) errs.push(`${p} doppelter slug`)
    slugs.add(m.slug)
    if (!m.marke) errs.push(`${p} marke fehlt`)
    if (namen.has(m.marke)) errs.push(`${p} doppelte marke`)
    namen.add(m.marke)
    if (!WB_STATUS.has(m.wb_status)) errs.push(`${p} wb_status ungueltig: ${m.wb_status}`)
    if (m.check24_vertrieb != null && !VERTRIEB.has(m.check24_vertrieb)) errs.push(`${p} check24_vertrieb ungueltig: ${m.check24_vertrieb}`)
    if (m.verlaesslichkeit_default && !VERLAESSLICHKEIT.has(m.verlaesslichkeit_default)) errs.push(`${p} verlaesslichkeit_default ungueltig`)
    for (const z of m.wb_zusaetze ?? []) {
      if (!z.zusatz) errs.push(`${p} wb_zusatz ohne Text`)
      if (z.umfang && !UMFANG.has(z.umfang)) errs.push(`${p} umfang ungueltig: ${z.umfang}`)
    }
    const rows = expandTarife(m)

    if (m.wb_status === 'optional' && (m.wb_marker ?? []).length === 0) errs.push(`${p} optional ohne wb_marker`)
    if (m.wb_status === 'keine' && ((m.wb_zusaetze ?? []).length > 0 || (m.linien_nur_wb ?? []).length > 0)) errs.push(`${p} keine mit WB-Zeile`)
    if (m.wb_status === 'standard' && rows.some((r) => !r.hat_werkstattbindung)) errs.push(`${p} standard mit freier Zeile`)
    const anzeigen = new Set()
    for (const r of rows) {
      if (anzeigen.has(r.anzeigename)) errs.push(`${p} doppelter anzeigename ${r.anzeigename}`)
      anzeigen.add(r.anzeigename)
    }
    if (m.konditionen && !SANKTION.has(m.konditionen.sanktion_modell)) errs.push(`${p} sanktion_modell ungueltig`)
  }
  if (data.default_konditionen && !SANKTION.has(data.default_konditionen.sanktion_modell)) errs.push('default sanktion_modell ungueltig')
  return errs
}

function konditionenInsert(key, markeSlug, k) {
  const markeExpr = markeSlug ? `(SELECT id FROM public.kasko_versicherer_marken WHERE slug = ${sqlLit(markeSlug)})` : 'NULL'
  return `INSERT INTO public.kasko_wb_konditionen
  (key, marke_id, nachlass_text, sanktion_modell, sanktion_text, gilt_fuer, ausnahmen_text, partnernetz, akb_fundstelle, quelle)
VALUES (${sqlLit(key)}, ${markeExpr}, ${sqlLit(k.nachlass_text)}, ${sqlLit(k.sanktion_modell)}, ${sqlLit(k.sanktion_text)},
  ${sqlLit(k.gilt_fuer)}, ${sqlLit(k.ausnahmen_text)}, ${sqlLit(k.partnernetz)}, ${sqlLit(k.akb_fundstelle)}, ${sqlLit(k.quelle)})
ON CONFLICT (key) DO UPDATE SET marke_id = EXCLUDED.marke_id, nachlass_text = EXCLUDED.nachlass_text,
  sanktion_modell = EXCLUDED.sanktion_modell, sanktion_text = EXCLUDED.sanktion_text, gilt_fuer = EXCLUDED.gilt_fuer,
  ausnahmen_text = EXCLUDED.ausnahmen_text, partnernetz = EXCLUDED.partnernetz, akb_fundstelle = EXCLUDED.akb_fundstelle,
  quelle = EXCLUDED.quelle;`
}

/** Vollstaendiges, idempotentes Seed-SQL. */
export function buildSeedSql(data) {
  const errs = validateSeed(data)
  if (errs.length) throw new Error(`Seed ungueltig:\n${errs.join('\n')}`)
  const out = []
  out.push(`-- GENERIERT von scripts/kasko-wb/generate-seed-sql.mjs aus scripts/kasko-wb/wissensbasis-${data.stand}.json`)
  out.push(`-- Quelle: ${data.quelle}. Idempotent (Upserts), keine UUIDs, Rechtstraeger-FK per Name (versicherungen-Seed ist nicht versioniert).`)
  out.push('')
  data.marken.forEach((m, idx) => {
    out.push(`-- ${m.marke}`)
    out.push(`INSERT INTO public.kasko_versicherer_marken
  (slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, check24_vertrieb, quelle, stand, sortierung)
VALUES (${sqlLit(m.slug)}, ${sqlLit(m.marke)}, ${sqlLit(m.wb_status)}, ${sqlTextArray(m.wb_marker)}, ${sqlTextArray(m.nicht_wb_marker)},
  ${sqlLit(m.hinweis)}, ${sqlLit(m.varianten_hinweis)}, ${sqlLit(m.check24_vertrieb)}, ${sqlLit(data.quelle)}, ${sqlLit(data.stand)}::date, ${(idx + 1) * 10})
ON CONFLICT (slug) DO UPDATE SET marke = EXCLUDED.marke, wb_status = EXCLUDED.wb_status, wb_marker = EXCLUDED.wb_marker,
  nicht_wb_marker = EXCLUDED.nicht_wb_marker, hinweis = EXCLUDED.hinweis, varianten_hinweis = EXCLUDED.varianten_hinweis,
  check24_vertrieb = EXCLUDED.check24_vertrieb, quelle = EXCLUDED.quelle, stand = EXCLUDED.stand, sortierung = EXCLUDED.sortierung,
  aktualisiert_am = now();`)
    if (m.versicherung_name) {
      out.push(`UPDATE public.kasko_versicherer_marken m SET versicherung_id = v.id
FROM public.versicherungen v WHERE m.slug = ${sqlLit(m.slug)} AND v.name = ${sqlLit(m.versicherung_name)} AND m.versicherung_id IS NULL;`)
    }
    for (const t of expandTarife(m)) {
      out.push(`INSERT INTO public.kasko_tarife (marke_id, linie, wb_zusatz, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit, reihenfolge)
SELECT m.id, ${sqlLit(t.linie)}, ${sqlLit(t.wb_zusatz)}, ${sqlLit(t.anzeigename)}, ${t.hat_werkstattbindung}, ${sqlLit(t.bindungsumfang)}, ${sqlLit(t.verlaesslichkeit)}, ${t.reihenfolge}
FROM public.kasko_versicherer_marken m WHERE m.slug = ${sqlLit(m.slug)}
ON CONFLICT (marke_id, anzeigename) DO UPDATE SET linie = EXCLUDED.linie, wb_zusatz = EXCLUDED.wb_zusatz,
  hat_werkstattbindung = EXCLUDED.hat_werkstattbindung, bindungsumfang = EXCLUDED.bindungsumfang,
  verlaesslichkeit = EXCLUDED.verlaesslichkeit, reihenfolge = EXCLUDED.reihenfolge, aktiv = true;`)
    }
    if (m.konditionen) out.push(konditionenInsert(m.slug, m.slug, m.konditionen))
    out.push('')
  })
  out.push('-- Default-Konditionen (GDV-Muster) fuer alle Marken ohne belegte Werte')
  out.push(konditionenInsert('__default__', null, data.default_konditionen))
  out.push('')
  return out.join('\n')
}
```

- [ ] **Step 4: Test grün**

Run: `./node_modules/.bin/vitest run scripts/lib/kasko-wb-seed.test.mjs`
Expected: PASS (12 Tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/kasko-wb-seed.mjs scripts/lib/kasko-wb-seed.test.mjs
git commit -m "feat(kasko-wb): Seed-Generator fuer die Werkstattbindungs-Wissensbasis (pure, getestet)

Expandiert Tariflinien x WB-Zusaetze, validiert das JSON und baut idempotentes Upsert-SQL ohne UUIDs
(Marken per slug, Rechtstraeger-FK per Name). Vorbereitung fuer Migration 2.

Audit:
- Build: tsc n/a (mjs), vitest 12/12 gruen
- UI: n/a
- Redundanz: keine (erster Generator dieser Art; sf-versicherer.ts ist TS-Konstante ohne DB)
- Dead-Code: nichts
- Spec: §4.1 Seed-Regeln
- Inkonsistenz: n/a
- Regression: n/a (neue Datei)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 2: Wissensbasis-JSON und CLI

**Files:**
- Create: `scripts/kasko-wb/wissensbasis-2026-07-20.json` (Inhalt = **Appendix A** am Ende dieses Plans, 1:1 übernehmen)
- Create: `scripts/kasko-wb/generate-seed-sql.mjs`
- Output (committed): `scripts/kasko-wb/seed.generated.sql`

**Interfaces:**
- Consumes: `buildSeedSql`, `validateSeed` aus Task 1.
- Produces: `scripts/kasko-wb/seed.generated.sql` — exakt der Text, der in Task 4 per `apply_migration` appliziert wird.

- [ ] **Step 1: JSON anlegen** — Datei `scripts/kasko-wb/wissensbasis-2026-07-20.json` mit dem vollständigen Inhalt aus Appendix A (nicht kürzen, nicht umformatieren).

- [ ] **Step 2: CLI schreiben**

```js
#!/usr/bin/env node
// scripts/kasko-wb/generate-seed-sql.mjs
// JSON -> SQL. Ausgabe wird committed UND ist der Payload fuer apply_migration (Regel 2). Bei einer neuen
// CHECK24-Liste: neue JSON-Datei (Datum im Namen), STAND unten anpassen, neu generieren, neue Migration.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeedSql, validateSeed } from '../lib/kasko-wb-seed.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STAND = process.argv[2] ?? '2026-07-20'
const src = join(HERE, `wissensbasis-${STAND}.json`)
const out = join(HERE, 'seed.generated.sql')

const data = JSON.parse(readFileSync(src, 'utf8'))
const errs = validateSeed(data)
if (errs.length) {
  console.error(`✗ ${errs.length} Fehler in ${src}:\n  ${errs.join('\n  ')}`)
  process.exit(1)
}
const sql = buildSeedSql(data)
writeFileSync(out, sql, 'utf8')
const tarife = data.marken.reduce((n, m) => n + (m.linien?.length ?? 0), 0)
console.log(`✓ ${data.marken.length} Marken, ${sql.split('INSERT INTO public.kasko_tarife').length - 1} Tarifzeilen -> ${out}`)
console.log(`  (Linien: ${tarife}; Konditionen: ${data.marken.filter((m) => m.konditionen).length} + Default)`)
```

- [ ] **Step 3: Generieren und Plausibilität prüfen**

Run: `node scripts/kasko-wb/generate-seed-sql.mjs`
Expected: `✓ 72 Marken, N Tarifzeilen` mit N zwischen 380 und 460; keine Fehlerzeile.

Run: `grep -c "INSERT INTO public.kasko_versicherer_marken" scripts/kasko-wb/seed.generated.sql`
Expected: `72`.

Run: `grep -c "UPDATE public.kasko_versicherer_marken m SET versicherung_id" scripts/kasko-wb/seed.generated.sql`
Expected: `60` (Marken mit `versicherung_name`).

- [ ] **Step 4: Commit**

```bash
git add scripts/kasko-wb/wissensbasis-2026-07-20.json scripts/kasko-wb/generate-seed-sql.mjs scripts/kasko-wb/seed.generated.sql
git commit -m "feat(kasko-wb): Wissensbasis-JSON (72 Marken, CHECK24 20.07.2026) + Seed-SQL-Generator-CLI

Audit:
- Build: n/a (Daten + mjs), Generator laeuft fehlerfrei (72 Marken)
- UI: n/a
- Redundanz: keine
- Dead-Code: nichts
- Spec: §4.1 (Marken-Ebene, Expansion, Nicht-Marker als Hinweis)
- Inkonsistenz: Schreibweisen exakt aus der CHECK24-Liste uebernommen
- Regression: n/a

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 3: Migration 1 — Wissensbasis-Tabellen (Regel 2)

**Files:**
- Create: `supabase/migrations/<V1>_kasko_wb_wissensbasis_tabellen.sql` (Name erst nach `list_migrations`)

**Interfaces:**
- Produces: Tabellen `kasko_versicherer_marken`, `kasko_tarife`, `kasko_wb_konditionen` (Spalten wie unten) — genutzt von Task 4 (Seed), Task 7 (Actions), Task 18 (Admin).

- [ ] **Step 1: DDL per MCP applizieren** — `mcp__plugin_supabase_supabase__apply_migration` mit `project_id: "paizkjajbuxxksdoycev"`, `name: "kasko_wb_wissensbasis_tabellen"`, `query:` =

```sql
-- Wissensbasis "Werkstattbindung in Kasko-Tarifen" (Spec 2026-09-04, Aaron E1: eigene MARKEN-Ebene).
-- CHECK24 nennt Vertriebsmarken (HUK24, CosmosDirekt), public.versicherungen haelt BaFin-Rechtstraeger;
-- 1 Marke -> 2 Rechtstraeger (HUK) und 1 Rechtstraeger -> n Marken (RheinLand/rhion.digital) kommen beide vor.
-- versicherung_id ist deshalb ein optionaler Link (Hotline/Schaden-Mail), keine Identitaet.
-- Referenzdaten wie flow_szenarien/anspruch_config: anon+authenticated lesen (der /flow laeuft ohne Login),
-- schreiben nur service_role (Seed-Migrationen, kein Admin-Editor in Phase 1).

CREATE TABLE public.kasko_versicherer_marken (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  marke            text NOT NULL UNIQUE,
  versicherung_id  uuid REFERENCES public.versicherungen(id) ON DELETE SET NULL,
  wb_status        text NOT NULL,
  wb_marker        text[] NOT NULL DEFAULT '{}',
  nicht_wb_marker  text[] NOT NULL DEFAULT '{}',
  hinweis          text,
  varianten_hinweis text,
  check24_vertrieb text,
  quelle           text NOT NULL,
  stand            date NOT NULL,
  sortierung       integer NOT NULL DEFAULT 100,
  aktiv            boolean NOT NULL DEFAULT true,
  erstellt_am      timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kasko_versicherer_marken_wb_status_check CHECK (wb_status IN ('optional','standard','keine')),
  CONSTRAINT kasko_versicherer_marken_vertrieb_check CHECK (check24_vertrieb IS NULL OR check24_vertrieb IN ('P','L'))
);
COMMENT ON TABLE public.kasko_versicherer_marken IS
  'Kasko-Versicherer-MARKEN (CHECK24-Vertriebsnamen) mit Werkstattbindungs-Status. optional = WB ist waehlbare Variante (Marker im Tarifnamen), standard = alle Tarife gebunden, keine = kein WB-Tarif. versicherung_id = optionaler Link auf den Rechtstraeger (Hotline/Schaden-Mail).';
COMMENT ON COLUMN public.kasko_versicherer_marken.wb_marker IS 'Exakte Namenszusaetze, die die WB-Variante kennzeichnen (z.B. SELECT, mit Werkstattbonus). Fuer die Rueckfrage am Versicherungsschein.';
COMMENT ON COLUMN public.kasko_versicherer_marken.nicht_wb_marker IS 'Verwechsler ohne Bindungswirkung (Kasko Spezial, Kasko PLUS, Nix-Passiert, Vorkasse ...).';
CREATE INDEX kasko_versicherer_marken_aktiv_sort_idx ON public.kasko_versicherer_marken (aktiv, sortierung);

CREATE TABLE public.kasko_tarife (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marke_id             uuid NOT NULL REFERENCES public.kasko_versicherer_marken(id) ON DELETE CASCADE,
  linie                text NOT NULL,
  wb_zusatz            text,
  anzeigename          text NOT NULL,
  hat_werkstattbindung boolean NOT NULL,
  bindungsumfang       text NOT NULL DEFAULT 'keine',
  verlaesslichkeit     text NOT NULL DEFAULT 'belegt',
  reihenfolge          integer NOT NULL DEFAULT 100,
  aktiv                boolean NOT NULL DEFAULT true,
  CONSTRAINT kasko_tarife_marke_anzeige_unique UNIQUE (marke_id, anzeigename),
  CONSTRAINT kasko_tarife_umfang_check CHECK (bindungsumfang IN ('keine','voll','nur_glas','unklar')),
  CONSTRAINT kasko_tarife_verlaesslichkeit_check CHECK (verlaesslichkeit IN ('belegt','abgeleitet','nicht_belegt')),
  CONSTRAINT kasko_tarife_umfang_konsistent CHECK ((hat_werkstattbindung AND bindungsumfang <> 'keine') OR (NOT hat_werkstattbindung AND bindungsumfang = 'keine'))
);
COMMENT ON TABLE public.kasko_tarife IS 'Tariflinien je Marke, expandiert: eine Zeile ohne WB-Zusatz (frei) und je WB-Zusatz eine Zeile (gebunden). anzeigename = was auf dem Versicherungsschein steht. bindungsumfang nur_glas = Bindung nur fuer Glasschaeden (Signal Iduna Sorglos Kasko Glas).';
CREATE INDEX kasko_tarife_marke_idx ON public.kasko_tarife (marke_id, aktiv, reihenfolge);

CREATE TABLE public.kasko_wb_konditionen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text NOT NULL UNIQUE,
  marke_id        uuid UNIQUE REFERENCES public.kasko_versicherer_marken(id) ON DELETE CASCADE,
  nachlass_text   text,
  sanktion_modell text NOT NULL DEFAULT 'unbekannt',
  sanktion_text   text,
  gilt_fuer       text,
  ausnahmen_text  text,
  partnernetz     text,
  akb_fundstelle  text,
  quelle          text,
  CONSTRAINT kasko_wb_konditionen_sanktion_check CHECK (sanktion_modell IN
    ('kuerzung_80','kuerzung_85','sonder_sb','deckelung','vollverweigerung','kuerzung_unbestimmt','keine','unbekannt'))
);
COMMENT ON TABLE public.kasko_wb_konditionen IS 'Belegte Konditionen je Marke (Nachlass, Sanktion bei Reparatur ausserhalb des Netzes, Partnernetz, AKB-Fundstelle). key=__default__ mit marke_id NULL = GDV-Muster fuer alle uebrigen.';

ALTER TABLE public.kasko_versicherer_marken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasko_tarife ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasko_wb_konditionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY kasko_versicherer_marken_read ON public.kasko_versicherer_marken FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY kasko_tarife_read ON public.kasko_tarife FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY kasko_wb_konditionen_read ON public.kasko_wb_konditionen FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.kasko_versicherer_marken, public.kasko_tarife, public.kasko_wb_konditionen TO anon, authenticated;
```

- [ ] **Step 2: Version ablesen** — `mcp__plugin_supabase_supabase__list_migrations` (`project_id: "paizkjajbuxxksdoycev"`), letzte Zeile: `version=<V1>`, `name=kasko_wb_wissensbasis_tabellen`.

- [ ] **Step 3: Datei exakt nach der Version anlegen** — `supabase/migrations/<V1>_kasko_wb_wissensbasis_tabellen.sql` mit **identischem** SQL wie Step 1.

- [ ] **Step 4: Verifizieren (READ)** — `execute_sql`:

```sql
select table_name, count(*) as spalten from information_schema.columns
where table_schema='public' and table_name in ('kasko_versicherer_marken','kasko_tarife','kasko_wb_konditionen')
group by 1 order by 1;
```
Expected: `kasko_tarife 10`, `kasko_versicherer_marken 16`, `kasko_wb_konditionen 11`.

```sql
select tablename, policyname, roles from pg_policies where tablename like 'kasko_%' order by 1;
```
Expected: drei `*_read`-Policies mit `{anon,authenticated}`.

- [ ] **Step 5: Migration-File-Check + Commit**

Run: `node --env-file=.env.local scripts/check-migration-files.mjs`
Expected: keine Meldung zu `kasko_wb_wissensbasis_tabellen` (Datei == getrackte Version).

```bash
git add supabase/migrations/*_kasko_wb_wissensbasis_tabellen.sql
git commit -m "feat(kasko-wb): Migration 1 — Wissensbasis-Tabellen (Marken, Tarife, Konditionen) mit anon-Read-RLS

Regel 2: via apply_migration appliziert, File nach getrackter Version benannt.

Audit:
- Build: n/a (SQL); check:migration-files gruen
- UI: n/a
- Redundanz: keine — versicherungen bleibt Rechtstraeger, Marken sind neue Ebene (Spec E1)
- Dead-Code: nichts
- Spec: §4.1
- Inkonsistenz: Naming erstellt_am/aktualisiert_am wie versicherungen
- Regression: additiv, keine bestehende Tabelle geaendert

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---
### Task 4: Migration 2 — Seed der Wissensbasis (Regel 2)

**Files:**
- Create: `supabase/migrations/<V2>_kasko_wb_wissensbasis_seed.sql` (Inhalt = `scripts/kasko-wb/seed.generated.sql`)

**Interfaces:**
- Consumes: Tabellen aus Task 3, SQL aus Task 2.

- [ ] **Step 1: Seed per MCP applizieren** — `apply_migration` mit `name: "kasko_wb_wissensbasis_seed"` und `query:` = kompletter Inhalt von `scripts/kasko-wb/seed.generated.sql` (Datei lesen, 1:1 übergeben; ca. 60–90 KB).

- [ ] **Step 2: Version ablesen** — `list_migrations` → `<V2>`.

- [ ] **Step 3: Datei anlegen**

```bash
cp scripts/kasko-wb/seed.generated.sql "supabase/migrations/<V2>_kasko_wb_wissensbasis_seed.sql"
```

- [ ] **Step 4: Verifizieren (READ)**

```sql
select (select count(*) from kasko_versicherer_marken) as marken,
       (select count(*) from kasko_versicherer_marken where versicherung_id is not null) as marken_mit_rechtstraeger,
       (select count(*) from kasko_tarife) as tarife,
       (select count(*) from kasko_tarife where hat_werkstattbindung) as tarife_gebunden,
       (select count(*) from kasko_wb_konditionen) as konditionen,
       (select count(*) from kasko_versicherer_marken where wb_status='keine') as marken_keine,
       (select count(*) from kasko_versicherer_marken where wb_status='standard') as marken_standard;
```
Expected: `marken=72`, `marken_mit_rechtstraeger=60`, `tarife` zwischen 380 und 460, `tarife_gebunden` > 180, `konditionen=23` (22 Marken + Default), `marken_keine=4`, `marken_standard=1`.

```sql
select m.marke, t.anzeigename, t.hat_werkstattbindung, t.bindungsumfang
from kasko_tarife t join kasko_versicherer_marken m on m.id=t.marke_id
where m.slug in ('huk-coburg','signal-iduna','lvm') order by m.slug, t.reihenfolge;
```
Expected: HUK 6 Zeilen (Basis/Basis SELECT/Classic/Classic SELECT/Classic Kasko PLUS/Classic Kasko PLUS SELECT), Signal Iduna 6 Zeilen mit `nur_glas` bei „… Sorglos Kasko Glas", LVM 2 freie Zeilen.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_kasko_wb_wissensbasis_seed.sql
git commit -m "feat(kasko-wb): Migration 2 — Seed der Wissensbasis (72 Marken, Tarife, Konditionen; idempotent, ohne UUIDs)

Audit:
- Build: n/a (SQL); prod-verifiziert 72 Marken / 59 Rechtstraeger-Links
- UI: n/a
- Redundanz: keine
- Dead-Code: nichts
- Spec: §4.1
- Inkonsistenz: Upserts per slug/(slug,anzeigename); Re-Seed moeglich
- Regression: additiv

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 5: Migration 3 — Lead/Claim-Felder, Grants, QR-Trigger, Step-Bedingung, Dispatcher-Feld; Types + Snapshot

**Files:**
- Create: `supabase/migrations/<V3>_kasko_wb_lead_claim_felder_trigger_feld.sql`
- Regenerate: `src/lib/supabase/database.types.ts`, `scripts/lib/schema-snapshot.json`

**Interfaces:**
- Produces: Spalten `eigene_versicherung_marke_id`, `eigene_versicherung_name`, `eigene_kasko_tarif_id`, `eigene_kasko_tarif_name`, `werkstattbindung_quelle` auf `leads` und `claims`; Step-Bedingung `{"freie_werkstattwahl": null, "werkstattbindung_quelle": null}`; `onboarding_felder`-Zeile `eigene_kasko_tarif`.

- [ ] **Step 1: DDL per MCP applizieren** — `apply_migration`, `name: "kasko_wb_lead_claim_felder_trigger_feld"`, `query:` =

```sql
-- Kasko-Werkstattbindung Phase 1 (Spec 2026-09-04 §4.2–4.4): Herkunft + Kontext zum Entscheidungsfeld
-- freie_werkstattwahl. Der Name der EIGENEN Versicherung wurde bisher nirgends erfasst (eigene_versicherung
-- ist ja/nein). Kundensichtbar gegrantet (Kunde hat es selbst eingegeben) -> Claims-Column-Grants-Check gruen.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS eigene_versicherung_marke_id uuid REFERENCES public.kasko_versicherer_marken(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_versicherung_name text,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_id uuid REFERENCES public.kasko_tarife(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_name text,
  ADD COLUMN IF NOT EXISTS werkstattbindung_quelle text;
ALTER TABLE public.leads ADD CONSTRAINT leads_werkstattbindung_quelle_check
  CHECK (werkstattbindung_quelle IS NULL OR werkstattbindung_quelle IN ('tarif','marker','kunde','dispatcher','dokument','unbekannt'));

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS eigene_versicherung_marke_id uuid REFERENCES public.kasko_versicherer_marken(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_versicherung_name text,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_id uuid REFERENCES public.kasko_tarife(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_name text,
  ADD COLUMN IF NOT EXISTS werkstattbindung_quelle text;
ALTER TABLE public.claims ADD CONSTRAINT claims_werkstattbindung_quelle_check
  CHECK (werkstattbindung_quelle IS NULL OR werkstattbindung_quelle IN ('tarif','marker','kunde','dispatcher','dokument','unbekannt'));

COMMENT ON COLUMN public.leads.werkstattbindung_quelle IS 'Herkunft von freie_werkstattwahl: tarif (aus Wissensbasis), marker (Kunde bestaetigte Zusatz am Schein), kunde (manuell), dispatcher, dokument (OCR, spaeter), unbekannt (Kunde konnte nicht pruefen -> durchgelassen + Dispatch-Task).';
COMMENT ON COLUMN public.claims.werkstattbindung_quelle IS 'Siehe leads.werkstattbindung_quelle; Kopie bei Konversion, Nachzug via spiegle-quali-auf-claim.';
COMMENT ON COLUMN public.leads.eigene_kasko_tarif_name IS 'Anzeigename des gewaehlten Tarifs zum Zeitpunkt der Wahl (Historie, auch wenn der Tarif spaeter umbenannt wird).';

-- Kundensichtbar (Claims-Column-Grants-Cap, Mig 20260714220455): der Kunde hat diese Werte selbst eingegeben.
GRANT SELECT (eigene_versicherung_marke_id, eigene_versicherung_name, eigene_kasko_tarif_id, eigene_kasko_tarif_name, werkstattbindung_quelle)
  ON public.claims TO authenticated;

CREATE INDEX IF NOT EXISTS leads_eigene_versicherung_marke_idx ON public.leads (eigene_versicherung_marke_id);
CREATE INDEX IF NOT EXISTS claims_eigene_versicherung_marke_idx ON public.claims (eigene_versicherung_marke_id);
CREATE INDEX IF NOT EXISTS leads_eigene_kasko_tarif_idx ON public.leads (eigene_kasko_tarif_id);
CREATE INDEX IF NOT EXISTS claims_eigene_kasko_tarif_idx ON public.claims (eigene_kasko_tarif_id);

-- QR-Trigger (Umgehung c, Spec §4.4): Auto-Zuweisung der werbenden Werkstatt NUR bei unbekannter Bindung.
-- Bisher IS NOT TRUE -> auch bei false (gebunden!) zugewiesen. Rumpf sonst identisch zu 20260713161645.
CREATE OR REPLACE FUNCTION public.set_reparatur_werkstatt_from_qr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ws_email text;
  v_kunde_email text;
BEGIN
  IF NEW.werkstatt_id IS NOT NULL
     AND NEW.reparaturwunsch IS DISTINCT FROM 'fiktiv'
     AND NEW.reparatur_werkstatt_id IS NULL
     AND NEW.freie_werkstattwahl IS NULL
  THEN
    SELECT email INTO v_ws_email FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
    IF NEW.geschaedigter_user_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.profiles WHERE id = NEW.geschaedigter_user_id;
    END IF;
    IF v_kunde_email IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    IF public.ist_interne_email(v_ws_email) = public.ist_interne_email(v_kunde_email) THEN
      NEW.reparatur_werkstatt_id := NEW.werkstatt_id;
      NEW.reparatur_werkstatt_quelle := 'qr_referral';
      NEW.reparatur_werkstatt_zugewiesen_am := COALESCE(NEW.reparatur_werkstatt_zugewiesen_am, now());
      NEW.reparatur_vermittlung_status := 'vermittelt';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Flow-Step-Bedingung (Spec §4.3): nach 'unbekannt' (quelle gesetzt, freie_werkstattwahl bleibt NULL) nicht erneut fragen.
-- Kompatibel mit altem Code: dort ist werkstattbindung_quelle im Kontext undefined = leer -> Step erscheint wie bisher.
UPDATE public.flow_szenario_steps
SET bedingung = '{"freie_werkstattwahl": null, "werkstattbindung_quelle": null}'::jsonb
WHERE szenario_id = 'kasko' AND step_id = 'werkstattbindung_check';

-- Dispatcher-Feld (Spec §7): Rich-Override DispatchKaskoTarifField haengt an diesem feld_key. audience=dispatcher,
-- nur bei Eigenverschulden. db_target zeigt auf den Anzeigenamen; die Rich-Komponente schreibt alle Felder selbst.
INSERT INTO public.onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, optionen, db_target, conditional_on, audience, sektion)
SELECT p.id, 15, 'eigene_kasko_tarif', 'text', 'Eigene Kasko: Versicherer & Tarif',
       'Steuert die Werkstatt-Vermittlung: Tarif mit Werkstattbindung = keine Vermittlung.', NULL, false, NULL,
       '{"tabelle":"leads","spalte":"eigene_kasko_tarif_name"}'::jsonb,
       '{"feld":"schuldfrage","equals":"eigenverantwortung"}'::jsonb, 'dispatcher', 'schuld'
FROM public.onboarding_phasen p
WHERE p.flow_key = 'lead-erfassung' AND p.phase_key = 'schuld'
  AND NOT EXISTS (SELECT 1 FROM public.onboarding_felder f WHERE f.phase_id = p.id AND f.feld_key = 'eigene_kasko_tarif');
```

- [ ] **Step 2: Version ablesen** — `list_migrations` → `<V3>`; Datei `supabase/migrations/<V3>_kasko_wb_lead_claim_felder_trigger_feld.sql` mit identischem SQL anlegen.

- [ ] **Step 3: Verifizieren (READ)**

```sql
select c.table_name, c.column_name, has_column_privilege('authenticated','public.'||c.table_name, c.column_name,'SELECT') as auth_select
from information_schema.columns c where c.table_schema='public' and c.table_name in ('leads','claims')
  and c.column_name in ('eigene_versicherung_marke_id','eigene_versicherung_name','eigene_kasko_tarif_id','eigene_kasko_tarif_name','werkstattbindung_quelle')
order by 1,2;
```
Expected: 10 Zeilen; alle `claims`-Zeilen `auth_select=true`.

```sql
select bedingung from flow_szenario_steps where szenario_id='kasko' and step_id='werkstattbindung_check';
select feld_key, audience, sektion, conditional_on from onboarding_felder where feld_key='eigene_kasko_tarif';
select position('IS NULL' in pg_get_functiondef('public.set_reparatur_werkstatt_from_qr'::regproc)) > 0 as trigger_neu;
```
Expected: Bedingung mit beiden Keys; eine Feld-Zeile (`dispatcher`, `schuld`); `trigger_neu = true`.

- [ ] **Step 4: Types und Schema-Snapshot regenerieren**

`mcp__plugin_supabase_supabase__generate_typescript_types` (`project_id: "paizkjajbuxxksdoycev"`) → Ausgabe vollständig nach `src/lib/supabase/database.types.ts` schreiben (Datei ersetzen).

Run: `node --env-file=.env.local scripts/build-schema-snapshot.mjs`
Expected: Snapshot aktualisiert; `git diff --stat scripts/lib/schema-snapshot.json` zeigt Änderungen.

Run: `grep -c "kasko_versicherer_marken" src/lib/supabase/database.types.ts`
Expected: > 0.

- [ ] **Step 5: Gates laufen lassen**

Run: `node --env-file=.env.local scripts/check-claims-column-grants.mjs`
Expected: keine `NEUE_SPALTE`-Befunde für die fünf Spalten.

Run: `node --env-file=.env.local scripts/check-migration-files.mjs && ./node_modules/.bin/tsc --noEmit`
Expected: grün.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_kasko_wb_lead_claim_felder_trigger_feld.sql src/lib/supabase/database.types.ts scripts/lib/schema-snapshot.json
git commit -m "feat(kasko-wb): Migration 3 — Tarif-/Herkunftsfelder auf leads+claims (gegrantet), QR-Trigger nur bei unbekannter Bindung, Step-Bedingung, Dispatcher-Feld; Types+Snapshot

Audit:
- Build: tsc gruen; check:claims-column-grants + check:migration-files gruen
- UI: Dispatcher-Feld rendert bis Task 17 als Textfeld (harmlos)
- Redundanz: freie_werkstattwahl bleibt Entscheidungsfeld, keine Parallel-Wahrheit
- Dead-Code: nichts
- Spec: §4.2–4.4, §7
- Inkonsistenz: CHECK-Werte == TS-Union in Task 6
- Regression: Trigger-Bedingung enger (IS NULL statt IS NOT TRUE) — gewollt (Spec §4.4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 6: Typen und Ableitung `leiteWerkstattbindungAb`

**Files:**
- Create: `src/lib/kasko-wb/types.ts`
- Create: `src/lib/kasko-wb/werkstattbindung.ts`
- Test: `src/lib/kasko-wb/__tests__/werkstattbindung.test.ts`

**Interfaces:**
- Produces (client-safe): Typen `WbStatus`, `Bindungsumfang`, `Verlaesslichkeit`, `WerkstattbindungQuelle`, `MarkerAntwort`, `KaskoMarke`, `KaskoTarif`, `KaskoTarifAuswahl`, `KaskoBindungsInfo`, `WbErgebnis`; Funktion `leiteWerkstattbindungAb(input): WbErgebnis`.

- [ ] **Step 1: Typen**

```ts
// src/lib/kasko-wb/types.ts
// Geteilte Typen der Kasko-Werkstattbindungs-Wissensbasis (client-safe, keine Server-Imports).
// Enum-Werte spiegeln die CHECK-Constraints aus Migration 1/3 — bei Aenderung BEIDE Seiten anpassen.

export type WbStatus = 'optional' | 'standard' | 'keine'
export type Bindungsumfang = 'keine' | 'voll' | 'nur_glas' | 'unklar'
export type Verlaesslichkeit = 'belegt' | 'abgeleitet' | 'nicht_belegt'
export type WerkstattbindungQuelle = 'tarif' | 'marker' | 'kunde' | 'dispatcher' | 'dokument' | 'unbekannt'
export type MarkerAntwort = 'ja' | 'nein' | 'unbekannt'

export type KaskoMarke = {
  id: string
  slug: string
  marke: string
  wbStatus: WbStatus
  wbMarker: string[]
  nichtWbMarker: string[]
  hinweis: string | null
  variantenHinweis: string | null
  /** Anzahl aktiver Tarifzeilen — 0 bei Marken ohne CHECK24-Listung (z.B. HDI). */
  tarifAnzahl: number
}

export type KaskoTarif = {
  id: string
  markeId: string
  anzeigename: string
  hatWerkstattbindung: boolean
  bindungsumfang: Bindungsumfang
  verlaesslichkeit: Verlaesslichkeit
}

/** Was der Kunde gewaehlt hat — Rohinput fuer die Server-Actions. */
export type KaskoTarifAuswahl = {
  markeId: string | null
  /** Marke oder Freitext („Meine Versicherung ist nicht dabei"). */
  markeName: string | null
  tarifId: string | null
  tarifName: string | null
  markerAntwort: MarkerAntwort | null
}

export type WbGrund =
  | 'keine_wb_bei_marke'
  | 'standard_wb'
  | 'tarif_ohne_wb'
  | 'tarif_mit_wb'
  | 'nur_glas_karosserie'
  | 'marker_bestaetigt'
  | 'marker_verneint'
  | 'unbekannt'

export type WbErgebnis = {
  /** true = frei (wir vermitteln) · false = gebunden · null = unbekannt */
  freieWerkstattwahl: boolean | null
  quelle: WerkstattbindungQuelle
  grund: WbGrund
}

/** Alles, was die Endseite / Mail / Dispatch ueber die Bindung anzeigen. */
export type KaskoBindungsInfo = {
  markeName: string | null
  tarifName: string | null
  wbMarker: string[]
  nachlassText: string | null
  sanktionText: string
  ausnahmenText: string
  partnernetz: string | null
  verlaesslichkeit: Verlaesslichkeit
  bindungsumfang: Bindungsumfang
  hotline: string | null
  schadenEmail: string | null
  webseite: string | null
  /** Datum der Tarifliste (ISO yyyy-mm-dd). */
  stand: string
}
```

- [ ] **Step 2: Test schreiben**

```ts
// src/lib/kasko-wb/__tests__/werkstattbindung.test.ts
import { describe, it, expect } from 'vitest'
import { leiteWerkstattbindungAb } from '../werkstattbindung'

const frei = { hatWerkstattbindung: false, bindungsumfang: 'keine' as const }
const gebunden = { hatWerkstattbindung: true, bindungsumfang: 'voll' as const }
const nurGlas = { hatWerkstattbindung: true, bindungsumfang: 'nur_glas' as const }

describe('leiteWerkstattbindungAb', () => {
  it('Marke ohne WB-Angebot (LVM) -> frei, unabhaengig vom Rest', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'keine', tarif: null, markerAntwort: 'ja', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: true, quelle: 'tarif', grund: 'keine_wb_bei_marke' })
  })
  it('Marke mit Standard-WB (Volkswagen) -> gebunden', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'standard', tarif: null, markerAntwort: null, schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: false, quelle: 'tarif', grund: 'standard_wb' })
  })
  it('Tarif ohne WB -> frei; Tarif mit WB -> gebunden', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: frei, markerAntwort: null, schadenIstGlas: false }).freieWerkstattwahl).toBe(true)
    const g = leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: gebunden, markerAntwort: null, schadenIstGlas: false })
    expect(g).toEqual({ freieWerkstattwahl: false, quelle: 'tarif', grund: 'tarif_mit_wb' })
  })
  it('E7: nur_glas bei Karosserieschaden -> frei mit Grund; bei Glasschaden -> gebunden', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: nurGlas, markerAntwort: null, schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: true, quelle: 'tarif', grund: 'nur_glas_karosserie' })
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: nurGlas, markerAntwort: null, schadenIstGlas: true }).freieWerkstattwahl).toBe(false)
  })
  it('Tarif schlaegt Marker-Antwort', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: frei, markerAntwort: 'ja', schadenIstGlas: false }).freieWerkstattwahl).toBe(true)
  })
  it('ohne Tarif entscheidet die Marker-Antwort', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: null, markerAntwort: 'ja', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: false, quelle: 'marker', grund: 'marker_bestaetigt' })
    expect(leiteWerkstattbindungAb({ wbStatus: null, tarif: null, markerAntwort: 'nein', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: true, quelle: 'marker', grund: 'marker_verneint' })
  })
  it('E3: keine Antwort -> null / unbekannt', () => {
    expect(leiteWerkstattbindungAb({ wbStatus: 'optional', tarif: null, markerAntwort: 'unbekannt', schadenIstGlas: false }))
      .toEqual({ freieWerkstattwahl: null, quelle: 'unbekannt', grund: 'unbekannt' })
    expect(leiteWerkstattbindungAb({ wbStatus: null, tarif: null, markerAntwort: null, schadenIstGlas: false }).freieWerkstattwahl).toBeNull()
  })
})
```

- [ ] **Step 3: Test rot** — `./node_modules/.bin/vitest run src/lib/kasko-wb` → FAIL (Modul fehlt).

- [ ] **Step 4: Implementierung**

```ts
// src/lib/kasko-wb/werkstattbindung.ts
// Pure Ableitung (Spec §5): aus Marke/Tarif/Marker-Antwort wird das Entscheidungsfeld freie_werkstattwahl.
// Reihenfolge ist fachlich: Marken-Status (keine/standard) > gewaehlter Tarif > Marker am Schein > unbekannt.
import type { Bindungsumfang, MarkerAntwort, WbErgebnis, WbStatus } from './types'

export type WbAbleitungInput = {
  wbStatus: WbStatus | null
  tarif: { hatWerkstattbindung: boolean; bindungsumfang: Bindungsumfang } | null
  markerAntwort: MarkerAntwort | null
  /** Im Unfall-Flow immer false (Karosserie). Glas-Faelle kommen ueber andere Eingaenge. */
  schadenIstGlas: boolean
}

export function leiteWerkstattbindungAb(i: WbAbleitungInput): WbErgebnis {
  if (i.wbStatus === 'keine') return { freieWerkstattwahl: true, quelle: 'tarif', grund: 'keine_wb_bei_marke' }
  if (i.wbStatus === 'standard') return { freieWerkstattwahl: false, quelle: 'tarif', grund: 'standard_wb' }
  if (i.tarif) {
    if (!i.tarif.hatWerkstattbindung) return { freieWerkstattwahl: true, quelle: 'tarif', grund: 'tarif_ohne_wb' }
    // E7 (Aaron 04.09.): reine Glas-Bindung bindet den Karosserieschaden nicht.
    if (i.tarif.bindungsumfang === 'nur_glas' && !i.schadenIstGlas) {
      return { freieWerkstattwahl: true, quelle: 'tarif', grund: 'nur_glas_karosserie' }
    }
    return { freieWerkstattwahl: false, quelle: 'tarif', grund: 'tarif_mit_wb' }
  }
  if (i.markerAntwort === 'ja') return { freieWerkstattwahl: false, quelle: 'marker', grund: 'marker_bestaetigt' }
  if (i.markerAntwort === 'nein') return { freieWerkstattwahl: true, quelle: 'marker', grund: 'marker_verneint' }
  return { freieWerkstattwahl: null, quelle: 'unbekannt', grund: 'unbekannt' }
}

/** Kurztext fuer Badges/Logs. */
export function wbErgebnisLabel(r: WbErgebnis): string {
  if (r.freieWerkstattwahl === true) return 'freie Werkstattwahl'
  if (r.freieWerkstattwahl === false) return 'Werkstattbindung'
  return 'Werkstattbindung unklar'
}
```

- [ ] **Step 5: Test grün** — `./node_modules/.bin/vitest run src/lib/kasko-wb` → PASS (7 Tests). `./node_modules/.bin/tsc --noEmit` grün.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kasko-wb/types.ts src/lib/kasko-wb/werkstattbindung.ts src/lib/kasko-wb/__tests__/werkstattbindung.test.ts
git commit -m "feat(kasko-wb): Typen + pure Ableitung leiteWerkstattbindungAb (Marke > Tarif > Marker > unbekannt, E7 nur_glas)

Audit:
- Build: tsc gruen, vitest 7/7
- UI: n/a
- Redundanz: keine
- Dead-Code: nichts
- Spec: §5
- Inkonsistenz: Enum-Werte == CHECKs aus Mig 1/3
- Regression: n/a

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 7: Server-Actions der Wissensbasis (Laden)

**Files:**
- Create: `src/lib/kasko-wb/actions.ts`

**Interfaces:**
- Produces: `ladeKaskoMarken(): Promise<{ ok: true; marken: KaskoMarke[] } | { ok: false; error: string }>`,
  `ladeKaskoTarife(markeId): Promise<{ ok: true; tarife: KaskoTarif[] } | { ok: false; error: string }>`,
  `ladeKaskoBindungsInfo(markeId | null, tarifId | null, markeNameFallback?): Promise<{ ok: true; info: KaskoBindungsInfo } | { ok: false; error: string }>`.
- Muster: `src/lib/versicherungen/search-actions.ts` (Admin-Client, weil `/flow` und Embed anonym laufen; Tabellen sind reine Referenzdaten ohne PII).

- [ ] **Step 1: Implementierung**

```ts
'use server'

// Lade-Actions der Kasko-Werkstattbindungs-Wissensbasis (Spec 2026-09-04). Admin-Client wie
// versicherungen/search-actions.ts: der /flow und der Embed laufen ANON; die drei Tabellen sind
// oeffentliche Referenzdaten (anon-Read-RLS), enthalten keine Kundendaten.
// Datei-Level 'use server': NUR async functions + type-Deklarationen exportieren (check:use-server-exports).

import { createAdminClient } from '@/lib/supabase/admin'
import type { KaskoBindungsInfo, KaskoMarke, KaskoTarif } from './types'

type MarkeRow = {
  id: string
  slug: string
  marke: string
  wb_status: KaskoMarke['wbStatus']
  wb_marker: string[] | null
  nicht_wb_marker: string[] | null
  hinweis: string | null
  varianten_hinweis: string | null
  kasko_tarife: { count: number }[] | null
}

export async function ladeKaskoMarken(): Promise<{ ok: true; marken: KaskoMarke[] } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kasko_versicherer_marken')
    .select('id, slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, kasko_tarife(count)')
    .eq('aktiv', true)
    .order('marke', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const marken: KaskoMarke[] = ((data ?? []) as unknown as MarkeRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    marke: r.marke,
    wbStatus: r.wb_status,
    wbMarker: r.wb_marker ?? [],
    nichtWbMarker: r.nicht_wb_marker ?? [],
    hinweis: r.hinweis,
    variantenHinweis: r.varianten_hinweis,
    // Nested count kommt als Array mit einem Objekt (PostgREST) -> normalisieren.
    tarifAnzahl: Array.isArray(r.kasko_tarife) ? r.kasko_tarife[0]?.count ?? 0 : 0,
  }))
  return { ok: true, marken }
}

type TarifRow = {
  id: string
  marke_id: string
  anzeigename: string
  hat_werkstattbindung: boolean
  bindungsumfang: KaskoTarif['bindungsumfang']
  verlaesslichkeit: KaskoTarif['verlaesslichkeit']
}

export async function ladeKaskoTarife(markeId: string): Promise<{ ok: true; tarife: KaskoTarif[] } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kasko_tarife')
    .select('id, marke_id, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit')
    .eq('marke_id', markeId)
    .eq('aktiv', true)
    .order('reihenfolge', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const tarife: KaskoTarif[] = ((data ?? []) as unknown as TarifRow[]).map((r) => ({
    id: r.id,
    markeId: r.marke_id,
    anzeigename: r.anzeigename,
    hatWerkstattbindung: r.hat_werkstattbindung,
    bindungsumfang: r.bindungsumfang,
    verlaesslichkeit: r.verlaesslichkeit,
  }))
  return { ok: true, tarife }
}

type KonditionenRow = {
  nachlass_text: string | null
  sanktion_text: string | null
  ausnahmen_text: string | null
  partnernetz: string | null
}

const GDV_SANKTION =
  'Bis zur Reparatur in der vom Versicherer benannten Werkstatt wird die Erstattung auf 80 % der marktüblichen Reparaturkosten begrenzt, mindestens mit einer zusätzlichen Selbstbeteiligung von 100 € (GDV-Muster-AKB A.2.5.2.5.2). Servicebausteine wie Hol-/Bringservice, Ersatzwagen, Reinigung und Reparaturgarantie gibt es nur in der Partnerwerkstatt.'
const GDV_AUSNAHMEN = 'Haftpflichtschaden Dritter · Totalschaden · Reparatur im Ausland · keine erreichbare Partnerwerkstatt'

/**
 * Alles fuer Endseite, Mail und Dispatch: Marke (oder Freitext), Tarif, Marker, Konditionen (Marke oder
 * GDV-Default) und Kontakt des Rechtstraegers aus versicherungen. Fehlende Teile fallen auf Defaults —
 * die Endseite darf NIE leer sein.
 */
export async function ladeKaskoBindungsInfo(
  markeId: string | null,
  tarifId: string | null,
  markeNameFallback?: string | null,
): Promise<{ ok: true; info: KaskoBindungsInfo } | { ok: false; error: string }> {
  const admin = createAdminClient()
  let info: KaskoBindungsInfo = {
    markeName: markeNameFallback ?? null,
    tarifName: null,
    wbMarker: [],
    nachlassText: null,
    sanktionText: GDV_SANKTION,
    ausnahmenText: GDV_AUSNAHMEN,
    partnernetz: null,
    verlaesslichkeit: 'nicht_belegt',
    bindungsumfang: 'unklar',
    hotline: null,
    schadenEmail: null,
    webseite: null,
    stand: '2026-07-20',
  }
  if (markeId) {
    const { data: m, error } = await admin
      .from('kasko_versicherer_marken')
      .select('marke, wb_marker, stand, versicherung_id, kasko_wb_konditionen(nachlass_text, sanktion_text, ausnahmen_text, partnernetz)')
      .eq('id', markeId)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (m) {
      const row = m as unknown as {
        marke: string; wb_marker: string[] | null; stand: string; versicherung_id: string | null
        kasko_wb_konditionen: KonditionenRow | KonditionenRow[] | null
      }
      const k = Array.isArray(row.kasko_wb_konditionen) ? row.kasko_wb_konditionen[0] : row.kasko_wb_konditionen
      info = {
        ...info,
        markeName: row.marke,
        wbMarker: row.wb_marker ?? [],
        stand: row.stand,
        nachlassText: k?.nachlass_text ?? null,
        sanktionText: k?.sanktion_text?.trim() ? `${k.sanktion_text} Servicebausteine wie Hol-/Bringservice, Ersatzwagen oder Reparaturgarantie gibt es nur in der Partnerwerkstatt.` : GDV_SANKTION,
        ausnahmenText: k?.ausnahmen_text?.trim() ? k.ausnahmen_text : GDV_AUSNAHMEN,
        partnernetz: k?.partnernetz ?? null,
      }
      if (row.versicherung_id) {
        const { data: v } = await admin
          .from('versicherungen')
          .select('schaden_telefon, hotline_telefon, schaden_email, webseite')
          .eq('id', row.versicherung_id)
          .maybeSingle()
        if (v) {
          info.hotline = (v.schaden_telefon as string | null) ?? (v.hotline_telefon as string | null) ?? null
          info.schadenEmail = (v.schaden_email as string | null) ?? null
          info.webseite = (v.webseite as string | null) ?? null
        }
      }
    }
  }
  if (tarifId) {
    const { data: t } = await admin
      .from('kasko_tarife')
      .select('anzeigename, bindungsumfang, verlaesslichkeit')
      .eq('id', tarifId)
      .maybeSingle()
    if (t) {
      info.tarifName = t.anzeigename as string
      info.bindungsumfang = t.bindungsumfang as KaskoBindungsInfo['bindungsumfang']
      info.verlaesslichkeit = t.verlaesslichkeit as KaskoBindungsInfo['verlaesslichkeit']
    }
  }
  return { ok: true, info }
}
```

- [ ] **Step 2: Gates**

Run: `./node_modules/.bin/tsc --noEmit && node scripts/check-use-server-exports.mjs && node scripts/check-server-actions.mjs`
Expected: grün (nur Lese-Actions → kein revalidatePath nötig; Warnung R2 darf nicht erscheinen, weil kein Write).

Run: `node --env-file=.env.local scripts/check-query-drift.mjs`
Expected: keine NEUEN Findings für `kasko_*` (Types aus Task 5 kennen die Tabellen).

- [ ] **Step 3: Commit**

```bash
git add src/lib/kasko-wb/actions.ts
git commit -m "feat(kasko-wb): Lade-Actions fuer Marken, Tarife und Bindungs-Info (Admin-Client, anon-Flow)

Audit:
- Build: tsc + check:use-server-exports + check:server-actions + check:query-drift gruen
- UI: n/a
- Redundanz: Muster search-actions.ts wiederverwendet
- Dead-Code: nichts
- Spec: §6, §8 (Defaults, Endseite nie leer)
- Inkonsistenz: Nested-FK per Array.isArray normalisiert
- Regression: n/a

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---
### Task 8: Disqualifikations-Patch als geteilter Helper (Refactor, verhaltensneutral)

**Files:**
- Create: `src/lib/self-service/disqualifikation-patch.ts`
- Test: `src/lib/self-service/__tests__/disqualifikation-patch.test.ts`
- Modify: `src/app/flow/[token]/self-service-actions.ts` (Block in `speichereQualiFlow`, heute Zeilen ~168–185)

**Interfaces:**
- Produces: `DisqualifikationsGrundKey`, `DISQUALIFIKATION_GRUND_TEXT`, `buildDisqualifikationPatch(grundKey, nowIso): Record<string, unknown>` — genutzt von Task 11 (Flow) und Task 14 (Embed).

- [ ] **Step 1: Test**

```ts
// src/lib/self-service/__tests__/disqualifikation-patch.test.ts
import { describe, it, expect } from 'vitest'
import { buildDisqualifikationPatch, DISQUALIFIKATION_GRUND_TEXT } from '../disqualifikation-patch'

describe('buildDisqualifikationPatch', () => {
  it('werkstattbindung: Grund-Key, Text, Status und Zeitstempel', () => {
    expect(buildDisqualifikationPatch('werkstattbindung', '2026-09-04T10:00:00.000Z')).toEqual({
      disqualifiziert: true,
      disqualifiziert_am: '2026-09-04T10:00:00.000Z',
      disqualifiziert_grund_key: 'werkstattbindung',
      disqualifiziert_grund: DISQUALIFIKATION_GRUND_TEXT.werkstattbindung,
      status: 'disqualifiziert',
    })
  })
  it('eigenverschulden bleibt der bisherige Text', () => {
    expect(buildDisqualifikationPatch('eigenverschulden', 'x').disqualifiziert_grund).toContain('Eigenverschulden')
    expect(DISQUALIFIKATION_GRUND_TEXT.werkstattbindung).toContain('Werkstattbindung')
  })
})
```

- [ ] **Step 2: Test rot** — `./node_modules/.bin/vitest run src/lib/self-service/__tests__/disqualifikation-patch.test.ts` → FAIL.

- [ ] **Step 3: Helper**

```ts
// src/lib/self-service/disqualifikation-patch.ts
// Der EINE Ort fuer den Disqualifikations-Schreibsatz eines Leads (bisher inline in speichereQualiFlow).
// Phase 1 Kasko-WB: der Embed-Werkstatt-Finder disqualifiziert gebundene Kunden ebenfalls -> ohne Helper
// gaebe es zwei Kopien desselben Literals. Pure, client-safe (kein DB-Import).

export type DisqualifikationsGrundKey = 'eigenverschulden' | 'werkstattbindung'

// Texte bewusst byte-identisch zum bisherigen Inline-Stand (Dispatch-Notiz, kein UI-Text).
export const DISQUALIFIKATION_GRUND_TEXT: Record<DisqualifikationsGrundKey, string> = {
  werkstattbindung:
    'Kasko mit Werkstattbindung — Reparatur nur in der vom Versicherer vorgeschriebenen Werkstatt, keine Vermittlung moeglich (Self-Service-Quali)',
  eigenverschulden:
    'Eigenverschulden — Gutachterkosten nicht über die gegnerische Haftpflicht regulierbar (Self-Service-Quali)',
}

export function buildDisqualifikationPatch(grundKey: DisqualifikationsGrundKey, nowIso: string): Record<string, unknown> {
  return {
    disqualifiziert: true,
    disqualifiziert_am: nowIso,
    disqualifiziert_grund_key: grundKey,
    disqualifiziert_grund: DISQUALIFIKATION_GRUND_TEXT[grundKey],
    status: 'disqualifiziert',
  }
}
```

- [ ] **Step 4: `speichereQualiFlow` auf den Helper umstellen** — in `src/app/flow/[token]/self-service-actions.ts` Import ergänzen:

```ts
import { buildDisqualifikationPatch } from '@/lib/self-service/disqualifikation-patch'
```

und im Block `if (outcome.disqualifizieren) { … .update({ … }) }` die fünf Felder `disqualifiziert`, `disqualifiziert_am`, `disqualifiziert_grund_key`, `disqualifiziert_grund`, `status` ersetzen durch:

```ts
      .update({
        schuldfrage,
        // SP-B1: abrechnungsweg-Record (kasko). leads.abrechnungsweg type-lagged -> Cast unten.
        abrechnungsweg: outcome.abrechnungsweg,
        ...(freieWerkstattwahl !== undefined ? { freie_werkstattwahl: freieWerkstattwahl } : {}),
        // WS2 (Kasko-frei): Grund korrekt labeln — Schreibsatz aus dem geteilten Helper (Embed nutzt ihn auch).
        ...buildDisqualifikationPatch(outcome.disqualifikationsGrundKey ?? 'eigenverschulden', nowIso),
      } as never)
```

- [ ] **Step 5: Grün** — `./node_modules/.bin/vitest run src/lib/self-service && ./node_modules/.bin/tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/self-service/disqualifikation-patch.ts src/lib/self-service/__tests__/disqualifikation-patch.test.ts "src/app/flow/[token]/self-service-actions.ts"
git commit -m "refactor(self-service): Disqualifikations-Schreibsatz als geteilter Helper (verhaltensneutral)

Audit:
- Build: tsc + vitest gruen
- UI: n/a
- Redundanz: Literal jetzt an EINER Stelle (Embed folgt in Task 14)
- Dead-Code: nichts
- Spec: §6 (Embed disqualifiziert gebundene Kunden)
- Inkonsistenz: Texte byte-identisch
- Regression: speichereQualiFlow-Verhalten unveraendert (Test quali-flow-outcome unberuehrt)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 9: Komponente `KaskoTarifFrage` (Marke → Tarif → Marker)

**Files:**
- Create: `src/components/self-service/KaskoTarifFrage.tsx`

**Interfaces:**
- Consumes: `ladeKaskoMarken`, `ladeKaskoTarife` (Task 7), `leiteWerkstattbindungAb` (Task 6), `VersichererSelect` (`src/components/shared/VersichererSelect.tsx`, Props `{ value, onChange(id), versicherer: {id,name}[], placeholder, ariaLabel }`).
- Produces: `KaskoTarifFrage({ onErgebnis, busy?, kompakt?, schadenIstGlas? })`, ruft `onErgebnis(auswahl: KaskoTarifAuswahl, ergebnis: WbErgebnis)` genau einmal pro Abschluss. Testids: `kasko-tarif-marke`, `kasko-tarif-nicht-dabei`, `kasko-tarif-option` (je Tarif, Button-Name = Anzeigename), `kasko-tarif-unbekannt`, `kasko-marker-ja`, `kasko-marker-nein`, `kasko-marker-unbekannt`, `kasko-freitext-input`, `kasko-freitext-weiter`.

- [ ] **Step 1: Komponente**

```tsx
'use client'

// Kasko-Werkstattbindung Phase 1 (Spec 2026-09-04 §6): EINE Frage-Komponente fuer FlowLink, Embed-Werkstatt-Finder
// und Kunde-Portal. Drei Stufen: Marke -> Tarif (nur bei wb_status=optional mit Tarifen) -> Marker am Schein
// (Fallback). Die Entscheidung selbst rechnet leiteWerkstattbindungAb (pure); der Aufrufer persistiert.
// Texte hardcodiert Deutsch (wie der ersetzte FlowWerkstattbindungStep) — i18n ist Follow-up.

import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card } from '@/components/primitives'
import { VersichererSelect } from '@/components/shared/VersichererSelect'
import { ladeKaskoMarken, ladeKaskoTarife } from '@/lib/kasko-wb/actions'
import { leiteWerkstattbindungAb } from '@/lib/kasko-wb/werkstattbindung'
import type { KaskoMarke, KaskoTarif, KaskoTarifAuswahl, MarkerAntwort, WbErgebnis } from '@/lib/kasko-wb/types'

export type KaskoTarifFrageProps = {
  onErgebnis: (auswahl: KaskoTarifAuswahl, ergebnis: WbErgebnis) => void
  /** Aufrufer speichert gerade -> Buttons sperren. */
  busy?: boolean
  /** Embed: kleinere Ueberschriften, kein Seitentitel. */
  kompakt?: boolean
  schadenIstGlas?: boolean
}

type Stufe = 'laden' | 'marke' | 'freitext' | 'tarif' | 'marker'

const DISCLAIMER = 'Maßgeblich sind Ihr Versicherungsschein und Ihre Versicherungsbedingungen (AKB). Tarifstand: CHECK24-Liste vom 20.07.2026.'

function TarifBadge({ tarif }: { tarif: KaskoTarif }) {
  if (!tarif.hatWerkstattbindung) return <Badge tone="success" size="sm">freie Werkstattwahl</Badge>
  if (tarif.bindungsumfang === 'nur_glas') return <Badge tone="info" size="sm">Bindung nur bei Glas</Badge>
  return <Badge tone="warning" size="sm">Werkstattbindung</Badge>
}

export function KaskoTarifFrage({ onErgebnis, busy = false, kompakt = false, schadenIstGlas = false }: KaskoTarifFrageProps) {
  const [stufe, setStufe] = useState<Stufe>('laden')
  const [marken, setMarken] = useState<KaskoMarke[]>([])
  const [markeId, setMarkeId] = useState<string | null>(null)
  const [freitext, setFreitext] = useState('')
  const [tarife, setTarife] = useState<KaskoTarif[]>([])
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)

  const marke = useMemo(() => marken.find((m) => m.id === markeId) ?? null, [marken, markeId])
  const h = kompakt ? 'text-body font-bold text-claimondo-navy' : 'text-2xl font-semibold text-claimondo-navy mb-2 text-center'
  const p = kompakt ? 'mt-0.5 text-body-sm text-claimondo-shield/80' : 'text-claimondo-navy/60 text-sm mb-6 text-center'

  useEffect(() => {
    let alive = true
    ladeKaskoMarken().then((r) => {
      if (!alive) return
      if (r.ok && r.marken.length > 0) {
        setMarken(r.marken)
        setStufe('marke')
      } else {
        // Wissensbasis leer/nicht erreichbar: generische Marker-Frage statt leerem Screen (Spec §8).
        setLadeFehler(r.ok ? null : r.error)
        setStufe('freitext')
      }
    })
    return () => {
      alive = false
    }
  }, [])

  function abschluss(auswahl: KaskoTarifAuswahl, ergebnis: WbErgebnis) {
    onErgebnis(auswahl, ergebnis)
  }

  async function waehleMarke(id: string | null) {
    setMarkeId(id)
    if (!id) return
    const m = marken.find((x) => x.id === id)
    if (!m) return
    const basis: KaskoTarifAuswahl = { markeId: m.id, markeName: m.marke, tarifId: null, tarifName: null, markerAntwort: null }
    if (m.wbStatus === 'keine' || m.wbStatus === 'standard') {
      abschluss(basis, leiteWerkstattbindungAb({ wbStatus: m.wbStatus, tarif: null, markerAntwort: null, schadenIstGlas }))
      return
    }
    if (m.tarifAnzahl === 0) {
      setStufe('marker')
      return
    }
    const r = await ladeKaskoTarife(m.id)
    setTarife(r.ok ? r.tarife : [])
    setStufe(r.ok && r.tarife.length > 0 ? 'tarif' : 'marker')
  }

  function waehleTarif(t: KaskoTarif) {
    if (!marke) return
    abschluss(
      { markeId: marke.id, markeName: marke.marke, tarifId: t.id, tarifName: t.anzeigename, markerAntwort: null },
      leiteWerkstattbindungAb({
        wbStatus: marke.wbStatus,
        tarif: { hatWerkstattbindung: t.hatWerkstattbindung, bindungsumfang: t.bindungsumfang },
        markerAntwort: null,
        schadenIstGlas,
      }),
    )
  }

  function antworteMarker(antwort: MarkerAntwort) {
    const auswahl: KaskoTarifAuswahl = {
      markeId: marke?.id ?? null,
      markeName: marke?.marke ?? (freitext.trim() || null),
      tarifId: null,
      tarifName: null,
      markerAntwort: antwort,
    }
    abschluss(auswahl, leiteWerkstattbindungAb({ wbStatus: marke?.wbStatus ?? null, tarif: null, markerAntwort: antwort, schadenIstGlas }))
  }

  if (stufe === 'laden') {
    return <p className="text-body-sm text-claimondo-navy/60">Versicherer werden geladen …</p>
  }

  if (stufe === 'marke') {
    return (
      <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
        <div>
          <h2 className={h}>Bei welcher Versicherung ist Ihr Fahrzeug kaskoversichert?</h2>
          <p className={p}>
            Ob wir Ihnen eine Werkstatt vermitteln dürfen, hängt von Ihrem Kasko-Tarif ab. Manche Tarife schreiben eine
            Partnerwerkstatt des Versicherers vor.
          </p>
        </div>
        <div data-testid="kasko-tarif-marke">
          <VersichererSelect
            value={markeId}
            onChange={(id) => void waehleMarke(id)}
            versicherer={marken.map((m) => ({ id: m.id, name: m.marke }))}
            placeholder="Versicherung suchen …"
            ariaLabel="Kaskoversicherung wählen"
          />
        </div>
        <Button variant="bare" size="sm" onClick={() => setStufe('freitext')} disabled={busy}>
          <span data-testid="kasko-tarif-nicht-dabei">Meine Versicherung ist nicht dabei</span>
        </Button>
        <p className="text-caption text-claimondo-navy/50">{DISCLAIMER}</p>
      </div>
    )
  }

  if (stufe === 'freitext') {
    return (
      <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
        <div>
          <h2 className={h}>Wie heißt Ihre Kaskoversicherung?</h2>
          <p className={p}>
            {ladeFehler ? 'Die Tarifliste ist gerade nicht erreichbar. ' : ''}Wir prüfen die Werkstattbindung dann anhand Ihres
            Versicherungsscheins.
          </p>
        </div>
        <input
          data-testid="kasko-freitext-input"
          value={freitext}
          onChange={(e) => setFreitext(e.target.value)}
          placeholder="Name der Versicherung"
          className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none"
        />
        <div className="flex gap-2">
          {marken.length > 0 && (
            <Button variant="ghost" size="md" onClick={() => setStufe('marke')} disabled={busy}>
              Zurück zur Liste
            </Button>
          )}
          <Button variant="navy" size="md" onClick={() => setStufe('marker')} disabled={busy || freitext.trim().length < 2}>
            <span data-testid="kasko-freitext-weiter">Weiter</span>
          </Button>
        </div>
      </div>
    )
  }

  if (stufe === 'tarif' && marke) {
    return (
      <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
        <div>
          <h2 className={h}>Welchen Tarif haben Sie bei {marke.marke}?</h2>
          <p className={p}>
            Der Tarifname steht auf Ihrem Versicherungsschein.
            {marke.variantenHinweis ? ` ${marke.variantenHinweis}` : ''}
          </p>
          {marke.hinweis && <p className="text-caption text-warning-strong">{marke.hinweis}</p>}
        </div>
        <div className="flex flex-col gap-2">
          {tarife.map((t) => (
            <Card key={t.id} onPress={() => waehleTarif(t)} p={3} radius="lg" className="text-left hover:border-claimondo-ondo">
              <span className="flex items-center justify-between gap-3" data-testid="kasko-tarif-option">
                <span className="text-body-sm font-semibold text-claimondo-navy">{t.anzeigename}</span>
                <TarifBadge tarif={t} />
              </span>
              {t.verlaesslichkeit !== 'belegt' && (
                <span className="mt-1 block text-caption text-claimondo-navy/50">
                  {t.verlaesslichkeit === 'abgeleitet' ? 'Bindung aus der Bezeichnung abgeleitet – bitte im Schein prüfen.' : 'Nicht öffentlich belegt – bitte im Schein prüfen.'}
                </span>
              )}
            </Card>
          ))}
        </div>
        <Button variant="bare" size="sm" onClick={() => setStufe('marker')} disabled={busy}>
          <span data-testid="kasko-tarif-unbekannt">Ich weiß es nicht / mein Tarif steht nicht dabei</span>
        </Button>
        <p className="text-caption text-claimondo-navy/50">{DISCLAIMER}</p>
      </div>
    )
  }

  // stufe === 'marker'
  const markerListe = marke?.wbMarker ?? []
  return (
    <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
      <div>
        <h2 className={h}>
          {markerListe.length > 0 ? 'Steht auf Ihrem Versicherungsschein einer dieser Zusätze?' : 'Enthält Ihr Vertrag einen Werkstattbindungs-Baustein?'}
        </h2>
        <p className={p}>
          {markerListe.length > 0
            ? `Diese Zusätze kennzeichnen bei ${marke?.marke ?? 'Ihrer Versicherung'} die Werkstattbindung.`
            : 'Typische Bezeichnungen: „mit Werkstattbindung“, „Werkstattbonus“, „Werkstattservice“, „SELECT“.'}
        </p>
        {markerListe.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {markerListe.map((m) => (
              <Badge key={m} tone="navy">„{m}“</Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="navy" fullWidth onClick={() => antworteMarker('ja')} disabled={busy} loading={busy}>
          <span data-testid="kasko-marker-ja">Ja, das steht auf meinem Schein</span>
        </Button>
        <Button variant="ondo" fullWidth onClick={() => antworteMarker('nein')} disabled={busy}>
          <span data-testid="kasko-marker-nein">Nein, davon steht nichts drauf</span>
        </Button>
        <Button variant="ghost" fullWidth onClick={() => antworteMarker('unbekannt')} disabled={busy}>
          <span data-testid="kasko-marker-unbekannt">Ich kann das gerade nicht prüfen</span>
        </Button>
      </div>
      <p className="text-caption text-claimondo-navy/50">{DISCLAIMER}</p>
    </div>
  )
}
```

- [ ] **Step 2: Gates** — `./node_modules/.bin/tsc --noEmit && node scripts/check-component-set.mjs && node scripts/check-token-audit.mjs` → grün (keine neuen handgerollten Buttons/Cards außer dem `<input>`, das kein Ratchet-Ziel ist; Badge-Töne sind Tokens).

- [ ] **Step 3: Commit**

```bash
git add src/components/self-service/KaskoTarifFrage.tsx
git commit -m "feat(kasko-wb): KaskoTarifFrage — Marke, Tarif, Marker-Rueckfrage (wiederverwendbar fuer Flow, Embed, Portal)

Audit:
- Build: tsc, component-set, token-audit gruen
- UI: wird in Task 12/14/15 eingehaengt
- Redundanz: VersichererSelect + primitives wiederverwendet
- Dead-Code: nichts
- Spec: §6 Stufen 1–3, §8 Fallback bei leerer Wissensbasis
- Inkonsistenz: Umlaute, Tokens, rounded-ios
- Regression: n/a (noch kein Consumer)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 10: `KaskoBindungEndansicht` und `KaskoUnklarHinweis`

**Files:**
- Create: `src/components/self-service/KaskoBindungEndansicht.tsx`
- Create: `src/components/self-service/KaskoUnklarHinweis.tsx`

**Interfaces:**
- Produces: `KaskoBindungEndansicht({ info: KaskoBindungsInfo; onRueckruf?: () => Promise<{ ok: boolean; error?: string }>; kompakt? })`,
  `KaskoUnklarHinweis({ markeName: string | null; onWeiter: () => void; busy? })`. Testids `kasko-bindung-endansicht`, `kasko-bindung-rueckruf`, `kasko-unklar-weiter`.

- [ ] **Step 1: Endansicht**

```tsx
'use client'

// Ehrliche Endseite bei Kasko-Werkstattbindung (Spec §6, Aaron E2). Ersetzt fuer diesen Fall die
// KaskoEndansicht, die vom Gutachter/Haftpflicht spricht — fachlich falsch fuer die Bindung.
// Zeigt Marke/Tarif, Marker, Sanktion (Konditionen der Marke oder GDV-Default), naechste Schritte,
// Versicherer-Kontakt und optional den Rueckruf (bestehende Action des Aufrufers).

import { useState } from 'react'
import { Badge, Button, Card } from '@/components/primitives'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'

export function KaskoBindungEndansicht({
  info,
  onRueckruf,
  kompakt = false,
}: {
  info: KaskoBindungsInfo
  onRueckruf?: () => Promise<{ ok: boolean; error?: string }>
  kompakt?: boolean
}) {
  const [rueckruf, setRueckruf] = useState<'offen' | 'sendet' | 'fertig' | 'fehler'>('offen')
  const [fehler, setFehler] = useState<string | null>(null)
  const titel = kompakt ? 'text-body font-bold text-claimondo-navy' : 'text-2xl font-semibold text-claimondo-navy mb-2'
  const tarifZeile = [info.markeName, info.tarifName ? `Tarif „${info.tarifName}“` : null].filter(Boolean).join(' · ')

  async function anfordern() {
    if (!onRueckruf) return
    setRueckruf('sendet')
    const r = await onRueckruf()
    if (r.ok) setRueckruf('fertig')
    else {
      setRueckruf('fehler')
      setFehler(r.error ?? 'Der Rückruf konnte nicht angelegt werden.')
    }
  }

  return (
    <div className={kompakt ? 'flex flex-col gap-3' : 'max-w-md w-full flex flex-col gap-4'} data-testid="kasko-bindung-endansicht">
      <div>
        <h1 className={titel}>Ihr Kasko-Tarif enthält eine Werkstattbindung</h1>
        {tarifZeile && <p className="text-body-sm text-claimondo-navy/70">{tarifZeile}</p>}
        <p className="mt-2 text-body-sm text-claimondo-navy/80">
          Ihre Versicherung benennt die Reparaturwerkstatt. Eine Werkstatt-Vermittlung durch uns ist in diesem Fall nicht
          möglich – damit Ihnen keine Kürzung entsteht.
        </p>
        {info.wbMarker.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {info.wbMarker.map((m) => (
              <Badge key={m} tone="warning" size="sm">„{m}“</Badge>
            ))}
          </div>
        )}
      </div>

      <Card p={4} radius="lg" accentColor="warning">
        <p className="text-body-sm font-semibold text-claimondo-navy">Was das für Sie bedeutet</p>
        <p className="mt-1 text-body-sm text-claimondo-navy/80">{info.sanktionText}</p>
        {info.nachlassText && (
          <p className="mt-2 text-caption text-claimondo-navy/60">Dafür erhalten Sie den Beitragsnachlass: {info.nachlassText}.</p>
        )}
      </Card>

      <Card p={4} radius="lg">
        <p className="text-body-sm font-semibold text-claimondo-navy">So geht es weiter</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-body-sm text-claimondo-navy/80">
          <li>
            Melden Sie den Schaden Ihrer Versicherung
            {info.hotline ? <> – Schaden-Hotline <a className="font-semibold text-claimondo-ondo" href={`tel:${info.hotline.replace(/\s/g, '')}`}>{info.hotline}</a></> : null}
            {info.schadenEmail ? <> · <a className="font-semibold text-claimondo-ondo" href={`mailto:${info.schadenEmail}`}>{info.schadenEmail}</a></> : null}
            .
          </li>
          <li>Lassen Sie sich die Partnerwerkstatt benennen{info.partnernetz ? ` (${info.partnernetz})` : ''}.</li>
          <li>Ausnahmen, bei denen Sie frei wählen dürfen: {info.ausnahmenText}.</li>
        </ol>
      </Card>

      {onRueckruf && rueckruf !== 'fertig' && (
        <Button variant="ghost" fullWidth onClick={() => void anfordern()} loading={rueckruf === 'sendet'}>
          <span data-testid="kasko-bindung-rueckruf">Rückruf anfordern – wir beraten Sie zum weiteren Vorgehen</span>
        </Button>
      )}
      {rueckruf === 'fertig' && <p className="text-body-sm text-success-strong">Danke – wir rufen Sie zurück.</p>}
      {fehler && <p className="text-body-sm text-danger">{fehler}</p>}

      <p className="text-caption text-claimondo-navy/50">
        Maßgeblich sind Ihr Versicherungsschein und Ihre AKB. Diese Einschätzung beruht auf dem Tarifnamen (Stand {info.stand}
        {info.verlaesslichkeit !== 'belegt' ? '; Bindungscharakter nicht vollständig belegt' : ''}).
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Hinweis bei „unbekannt" (E3)**

```tsx
'use client'

// E3 (Aaron 04.09.): Konnte der Kunde die Bindung nicht klaeren, lassen wir ihn zur Werkstatt-Strecke durch,
// sagen ihm aber ehrlich, was er vorher pruefen soll. Der Dispatch bekommt parallel eine Aufgabe.

import { Button, Card } from '@/components/primitives'

export function KaskoUnklarHinweis({ markeName, onWeiter, busy = false }: { markeName: string | null; onWeiter: () => void; busy?: boolean }) {
  return (
    <div className="max-w-md w-full flex flex-col gap-4" data-testid="kasko-unklar-hinweis">
      <div>
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">Bitte prüfen Sie Ihren Versicherungsschein</h1>
        <p className="text-body-sm text-claimondo-navy/80">
          Wir konnten nicht klären, ob Ihr Kasko-Tarif{markeName ? ` bei ${markeName}` : ''} eine Werkstattbindung enthält. Wir zeigen
          Ihnen trotzdem passende Werkstätten – beauftragen Sie die Reparatur aber erst, wenn Sie das geprüft haben.
        </p>
      </div>
      <Card p={4} radius="lg" accentColor="info">
        <p className="text-body-sm text-claimondo-navy/80">
          Steht im Tarifnamen ein Zusatz wie „SELECT“, „mit Werkstattbonus“ oder „mit Werkstattservice“, benennt Ihre
          Versicherung die Werkstatt – bei freier Wahl droht eine Kürzung. Unser Team meldet sich dazu bei Ihnen.
        </p>
      </Card>
      <Button variant="navy" fullWidth onClick={onWeiter} loading={busy}>
        <span data-testid="kasko-unklar-weiter">Verstanden – weiter zur Werkstatt</span>
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Gates + Commit**

`./node_modules/.bin/tsc --noEmit && node scripts/check-component-set.mjs && node scripts/check-token-audit.mjs` → grün.

```bash
git add src/components/self-service/KaskoBindungEndansicht.tsx src/components/self-service/KaskoUnklarHinweis.tsx
git commit -m "feat(kasko-wb): ehrliche Endseite bei Werkstattbindung (Sanktion, Versicherer-Kontakt, Rueckruf) + Hinweis bei unklarer Bindung

Audit:
- Build: tsc, component-set, token-audit gruen
- UI: Consumer folgen in Task 12/14/15
- Redundanz: primitives Card/Button/Badge
- Dead-Code: nichts
- Spec: §6 Endseite, E2, E3
- Inkonsistenz: Umlaute, Status-Tokens (warning/info/success)
- Regression: n/a

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 11: Server-Action `speichereKaskoTarifFlow`, Mail (E6), Dispatch-Task (E3), Spiegel/Convert/Kontext

**Files:**
- Create: `src/lib/kasko-wb/notify-kunde-werkstattbindung.ts` + Test `src/lib/kasko-wb/__tests__/notify-kunde-werkstattbindung.test.ts`
- Modify: `src/app/flow/[token]/self-service-actions.ts` (zwei neue Actions)
- Modify: `src/lib/leads/spiegle-quali-auf-claim.ts` (`QUALI_FELDER`)
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (nach der `freie_werkstattwahl`-Zeile, ~555)
- Modify: `src/lib/self-service/flow-kontext.ts` + Test `src/lib/self-service/__tests__/flow-kontext.test.ts`

**Interfaces:**
- Produces: `speichereKaskoTarifFlow(token, auswahl): Promise<{ ok: true; ergebnis: 'weiter'|'abbruch'|'unklar'; freieWerkstattwahl: boolean|null; info: KaskoBindungsInfo|null } | { ok: false; error: string }>` und `ladeKaskoBindungsInfoFuerFlow(token)`; `buildWerkstattbindungEmailHtml`, `notifyKundeWerkstattbindung`.
- Consumes: `resolveFlowLead`, `speichereQualiFlow`, `spiegleQualiAufClaim` (bestehend), `createLinkedTask` (`@/lib/tasks/create-task`), `leiteWerkstattbindungAb`, `ladeKaskoBindungsInfo`.

- [ ] **Step 1: Mail-Test**

```ts
// src/lib/kasko-wb/__tests__/notify-kunde-werkstattbindung.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildWerkstattbindungEmailHtml, notifyKundeWerkstattbindung } from '../notify-kunde-werkstattbindung'
import type { KaskoBindungsInfo } from '../types'

const info: KaskoBindungsInfo = {
  markeName: 'HUK-COBURG', tarifName: 'Classic SELECT', wbMarker: ['SELECT'], nachlassText: 'bis 20 %',
  sanktionText: 'Kürzung auf 85 % <script>', ausnahmenText: 'Totalschaden', partnernetz: 'Die Partnerwerkstatt',
  verlaesslichkeit: 'belegt', bindungsumfang: 'voll', hotline: '09561 96 0', schadenEmail: 'schaden@huk.de', webseite: null, stand: '2026-07-20',
}

describe('buildWerkstattbindungEmailHtml', () => {
  it('enthaelt Marke, Tarif, Sanktion, Hotline und escaped HTML', () => {
    const html = buildWerkstattbindungEmailHtml({ vorname: 'Anna <b>', info })
    expect(html).toContain('Hallo Anna &lt;b&gt;,')
    expect(html).toContain('HUK-COBURG')
    expect(html).toContain('Classic SELECT')
    expect(html).toContain('Kürzung auf 85 % &lt;script&gt;')
    expect(html).toContain('09561 96 0')
    expect(html).toContain('schaden@huk.de')
    expect(html).not.toContain('<script>')
  })
})

describe('notifyKundeWerkstattbindung', () => {
  it('sendet nur mit E-Mail, non-fatal bei Fehler', async () => {
    const sendEmail = vi.fn(async () => undefined)
    const r1 = await notifyKundeWerkstattbindung({ kunde: { vorname: 'Anna', email: 'a@b.de' }, info }, { sendEmail })
    expect(r1.email).toBe(true)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.de', template: 'kasko_werkstattbindung_kunde', empfaengerTyp: 'kunde' }))
    const r2 = await notifyKundeWerkstattbindung({ kunde: { vorname: null, email: null }, info }, { sendEmail })
    expect(r2.email).toBe(false)
    const boom = vi.fn(async () => { throw new Error('smtp') })
    const r3 = await notifyKundeWerkstattbindung({ kunde: { vorname: null, email: 'x@y.de' }, info }, { sendEmail: boom })
    expect(r3.email).toBe(false)
  })
})
```

- [ ] **Step 2: Test rot** — `./node_modules/.bin/vitest run src/lib/kasko-wb` → FAIL (Modul fehlt).

- [ ] **Step 3: Mail-Modul**

```ts
// Token-Audit-Skip: Email-Template (inline-HTML) — raw Markenfarbe in style-Attributen,
//   wie alle Email-Generation-Files (Mail-Clients koennen kein Tailwind/CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// E6 (Aaron 04.09.): Zusammenfassungs-Mail nach Abbruch wegen Kasko-Werkstattbindung — der Kunde soll das
// „So geht es weiter" schwarz auf weiss haben (Sanktion, Versicherer-Kontakt, Ausnahmen). Muster wie
// src/lib/werkstatt/notify-kunde-vermittlung.ts (inline-branded HTML, injizierbare Deps, non-fatal).

import { sendEmail } from '@/lib/email/google/client'
import type { KaskoBindungsInfo } from './types'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export type WerkstattbindungMailDeps = { sendEmail: typeof sendEmail }
const defaultDeps: WerkstattbindungMailDeps = { sendEmail }

export function buildWerkstattbindungEmailHtml(args: { vorname: string | null | undefined; info: KaskoBindungsInfo }): string {
  const NAVY = '#0D1B3E'
  const BG = '#f8f9fb'
  const anrede = args.vorname?.trim() ? `Hallo ${escapeHtml(args.vorname.trim())},` : 'Hallo,'
  const i = args.info
  const tarif = [i.markeName, i.tarifName ? `Tarif „${i.tarifName}“` : null].filter(Boolean).map((s) => escapeHtml(String(s))).join(' · ')
  const kontakt = [
    i.hotline ? `Schaden-Hotline: ${escapeHtml(i.hotline)}` : null,
    i.schadenEmail ? `E-Mail: ${escapeHtml(i.schadenEmail)}` : null,
    i.webseite ? `Web: ${escapeHtml(i.webseite)}` : null,
  ].filter(Boolean).join('<br>')
  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;">Claimondo</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">${anrede}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Ihr Kasko-Tarif enthält eine Werkstattbindung${tarif ? ` (${tarif})` : ''}. Ihre Versicherung benennt die Reparaturwerkstatt – deshalb vermitteln wir Ihnen keine Werkstatt, damit Ihnen keine Kürzung entsteht.</p>
          <div style="background:${BG};border-radius:12px;padding:18px 20px;margin-bottom:16px;">
            <div style="font-weight:600;color:${NAVY};margin-bottom:6px;">Was das für Sie bedeutet</div>
            <div style="color:#4573A2;line-height:1.5;">${escapeHtml(i.sanktionText)}</div>
          </div>
          <div style="background:${BG};border-radius:12px;padding:18px 20px;margin-bottom:16px;">
            <div style="font-weight:600;color:${NAVY};margin-bottom:6px;">So geht es weiter</div>
            <ol style="margin:0;padding-left:20px;color:#4573A2;line-height:1.6;">
              <li>Schaden bei Ihrer Versicherung melden${kontakt ? `<br>${kontakt}` : ''}</li>
              <li>Partnerwerkstatt benennen lassen${i.partnernetz ? ` (${escapeHtml(i.partnernetz)})` : ''}</li>
              <li>Ausnahmen mit freier Wahl: ${escapeHtml(i.ausnahmenText)}</li>
            </ol>
          </div>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#4573A2;">Maßgeblich sind Ihr Versicherungsschein und Ihre AKB. Diese Einschätzung beruht auf dem Tarifnamen (Stand ${escapeHtml(i.stand)}).</p>
          <p style="margin:24px 0 0;font-size:15px;">Ihr Claimondo-Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function notifyKundeWerkstattbindung(
  args: { kunde: { vorname?: string | null; email?: string | null }; info: KaskoBindungsInfo },
  deps: WerkstattbindungMailDeps = defaultDeps,
): Promise<{ email: boolean }> {
  const email = args.kunde.email?.trim()
  if (!email) return { email: false }
  try {
    await deps.sendEmail({
      to: email,
      subject: 'Ihr Kasko-Tarif: Werkstattbindung – so geht es weiter',
      html: buildWerkstattbindungEmailHtml({ vorname: args.kunde.vorname, info: args.info }),
      template: 'kasko_werkstattbindung_kunde',
      empfaengerTyp: 'kunde',
      fallId: null,
    })
    return { email: true }
  } catch (err) {
    console.warn('[notifyKundeWerkstattbindung] Email fehlgeschlagen (non-fatal):', err)
    return { email: false }
  }
}
```

- [ ] **Step 4: Spiegel-Allowlist erweitern** — in `src/lib/leads/spiegle-quali-auf-claim.ts`:

```ts
export const QUALI_FELDER = [
  'schuldfrage',
  'abrechnungsweg',
  'reparaturwunsch',
  'eigene_versicherung',
  'freie_werkstattwahl',
  // Kasko-WB Phase 1 (Mig 3): identische Spalten/Typen auf leads und claims, CHECK auf werkstattbindung_quelle byte-gleich.
  'eigene_versicherung_marke_id',
  'eigene_versicherung_name',
  'eigene_kasko_tarif_id',
  'eigene_kasko_tarif_name',
  'werkstattbindung_quelle',
] as const
```

- [ ] **Step 5: Convert-Mapping** — in `src/lib/leads/convert-lead-to-claim.ts` direkt nach der `freie_werkstattwahl`-Zuweisung einfügen:

```ts
  // Kasko-WB Phase 1: Herkunft + Kontext der Werkstattbindung Lead -> Claim (Spec §4.2). Record-Cast wie oben.
  for (const feld of [
    'eigene_versicherung_marke_id',
    'eigene_versicherung_name',
    'eigene_kasko_tarif_id',
    'eigene_kasko_tarif_name',
    'werkstattbindung_quelle',
  ] as const) {
    ;(claimsInsert as Record<string, unknown>)[feld] = (lead[feld] as string | null) ?? null
  }
```

- [ ] **Step 6: Flow-Kontext** — in `src/lib/self-service/flow-kontext.ts`: `LeadFuerKontext` um `werkstattbindung_quelle?: string | null` ergänzen und im Rückgabeobjekt nach `freie_werkstattwahl: lead.freie_werkstattwahl ?? null,` einfügen:

```ts
    // Kasko-WB Phase 1: Step-Bedingung {"freie_werkstattwahl": null, "werkstattbindung_quelle": null} —
    // nach 'unbekannt' (quelle gesetzt, Entscheidung offen) wird nicht erneut gefragt (Spec §4.3).
    werkstattbindung_quelle: lead.werkstattbindung_quelle ?? null,
```

Test ergänzen in `src/lib/self-service/__tests__/flow-kontext.test.ts` (innerhalb `describe('bauFlowKontext'`):

```ts
  it('werkstattbindung_quelle wird roh durchgereicht (Step-Bedingung Kasko)', () => {
    expect(bauFlowKontext({ werkstattbindung_quelle: 'unbekannt' }, false).werkstattbindung_quelle).toBe('unbekannt')
    expect(bauFlowKontext({}, false).werkstattbindung_quelle).toBeNull()
  })
```

- [ ] **Step 7: Actions im Flow** — in `src/app/flow/[token]/self-service-actions.ts` Imports ergänzen:

```ts
import { leiteWerkstattbindungAb } from '@/lib/kasko-wb/werkstattbindung'
import { ladeKaskoBindungsInfo } from '@/lib/kasko-wb/actions'
import { notifyKundeWerkstattbindung } from '@/lib/kasko-wb/notify-kunde-werkstattbindung'
import { createLinkedTask } from '@/lib/tasks/create-task'
import type { Bindungsumfang, KaskoBindungsInfo, KaskoTarifAuswahl, WbStatus } from '@/lib/kasko-wb/types'
```

und nach `speichereQualiFlow` einfügen:

```ts
/**
 * Kasko-WB Phase 1 (Spec §6): Versicherer + Tarif des Kunden speichern, Bindung ableiten und ueber den
 * bestehenden Quali-Pfad entscheiden (frei -> Werkstatt-Strecke, gebunden -> Disqualifikation + Endseite +
 * Mail, unbekannt -> durchlassen + Dispatch-Task). Der Client liefert nur IDs — Marke/Tarif werden hier
 * aus der Wissensbasis nachgeladen (Trust-Boundary).
 */
export async function speichereKaskoTarifFlow(
  token: string,
  auswahl: KaskoTarifAuswahl,
): Promise<
  | { ok: true; ergebnis: 'weiter' | 'abbruch' | 'unklar'; freieWerkstattwahl: boolean | null; info: KaskoBindungsInfo | null }
  | { ok: false; error: string }
> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  let wbStatus: WbStatus | null = null
  let tarif: { hatWerkstattbindung: boolean; bindungsumfang: Bindungsumfang } | null = null
  let markeName = auswahl.markeName?.trim() || null
  let tarifName = auswahl.tarifName?.trim() || null
  if (auswahl.markeId) {
    const { data: m } = await admin.from('kasko_versicherer_marken').select('marke, wb_status').eq('id', auswahl.markeId).maybeSingle()
    if (m) {
      wbStatus = m.wb_status as WbStatus
      markeName = m.marke as string
    }
  }
  if (auswahl.tarifId) {
    const { data: t } = await admin
      .from('kasko_tarife')
      .select('anzeigename, hat_werkstattbindung, bindungsumfang')
      .eq('id', auswahl.tarifId)
      .maybeSingle()
    if (t) {
      tarif = { hatWerkstattbindung: t.hat_werkstattbindung as boolean, bindungsumfang: t.bindungsumfang as Bindungsumfang }
      tarifName = t.anzeigename as string
    }
  }
  // Unfall-Flow = Karosserieschaden (Spec §3 Annahmen).
  const ergebnis = leiteWerkstattbindungAb({ wbStatus, tarif, markerAntwort: auswahl.markerAntwort, schadenIstGlas: false })

  const tarifFelder: Record<string, unknown> = {
    eigene_versicherung_marke_id: auswahl.markeId,
    eigene_versicherung_name: markeName,
    eigene_kasko_tarif_id: auswahl.tarifId,
    eigene_kasko_tarif_name: tarifName,
    werkstattbindung_quelle: ergebnis.quelle,
  }
  const { error: updErr } = await admin.from('leads').update(tarifFelder).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  const spiegel = await spiegleQualiAufClaim(admin, leadId, tarifFelder)
  if (!spiegel.ok) console.error('[kasko-tarif] Spiegeln auf den Claim fehlgeschlagen:', spiegel.error)

  // Entscheidung ueber den bestehenden Quali-Pfad (Disqualifikation, Gutachter loesen, Reparaturwunsch, Spiegel).
  const quali = await speichereQualiFlow(token, 'eigenverantwortung', true, ergebnis.freieWerkstattwahl ?? undefined)
  if (!quali.ok) return { ok: false, error: quali.error ?? 'Speichern fehlgeschlagen.' }

  if (ergebnis.freieWerkstattwahl === false) {
    const infoRes = await ladeKaskoBindungsInfo(auswahl.markeId, auswahl.tarifId, markeName)
    const info = infoRes.ok ? infoRes.info : null
    if (info) {
      // E6: Zusammenfassung per Mail — non-critical.
      try {
        const { data: lead } = await admin.from('leads').select('vorname, email').eq('id', leadId).maybeSingle()
        await notifyKundeWerkstattbindung({ kunde: { vorname: (lead?.vorname as string | null) ?? null, email: (lead?.email as string | null) ?? null }, info })
      } catch (err) {
        console.error('[kasko-tarif] Bindungs-Mail fehlgeschlagen (non-critical):', err)
      }
    }
    revalidatePath(`/flow/${token}`)
    return { ok: true, ergebnis: 'abbruch', freieWerkstattwahl: false, info }
  }

  if (ergebnis.freieWerkstattwahl === null) {
    // E3: durchlassen, der Dispatch klaert — non-critical.
    try {
      await createLinkedTask({
        titel: 'Kasko: Werkstattbindung klären',
        beschreibung: `Der Kunde konnte die Werkstattbindung seines Kasko-Tarifs nicht angeben (Versicherer: ${markeName ?? 'unbekannt'}). Vor der Reparaturfreigabe klären, ob der Tarif eine Partnerwerkstatt vorschreibt.`,
        prioritaet: 'normal',
        entity_type: 'lead',
        entity_id: leadId,
        empfaenger_rolle: 'dispatch',
        task_code: 'kasko_werkstattbindung_klaeren',
        trigger_event: 'kasko_tarif_unbekannt',
        auto_erstellt: true,
      })
    } catch (err) {
      console.error('[kasko-tarif] Dispatch-Task fehlgeschlagen (non-critical):', err)
    }
    revalidatePath(`/flow/${token}`)
    return { ok: true, ergebnis: 'unklar', freieWerkstattwahl: null, info: null }
  }

  revalidatePath(`/flow/${token}`)
  return { ok: true, ergebnis: 'weiter', freieWerkstattwahl: true, info: null }
}

/** Re-Visit eines bereits wegen Bindung disqualifizierten Leads: Endseite braucht die Info erneut. */
export async function ladeKaskoBindungsInfoFuerFlow(
  token: string,
): Promise<{ ok: true; info: KaskoBindungsInfo } | { ok: false; error: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }
  const { data: lead } = await admin
    .from('leads')
    .select('eigene_versicherung_marke_id, eigene_kasko_tarif_id, eigene_versicherung_name')
    .eq('id', leadId)
    .maybeSingle()
  return ladeKaskoBindungsInfo(
    (lead?.eigene_versicherung_marke_id as string | null) ?? null,
    (lead?.eigene_kasko_tarif_id as string | null) ?? null,
    (lead?.eigene_versicherung_name as string | null) ?? null,
  )
}
```

- [ ] **Step 8: Grün** — `./node_modules/.bin/vitest run src/lib/kasko-wb src/lib/self-service src/lib/leads && ./node_modules/.bin/tsc --noEmit && node scripts/check-use-server-exports.mjs && node scripts/check-server-actions.mjs && node --env-file=.env.local scripts/check-query-drift.mjs` → PASS; keine neuen Drift-Findings (Spalten sind in den Types aus Task 5).

- [ ] **Step 9: Commit**

```bash
git add src/lib/kasko-wb/notify-kunde-werkstattbindung.ts src/lib/kasko-wb/__tests__/notify-kunde-werkstattbindung.test.ts src/lib/leads/spiegle-quali-auf-claim.ts src/lib/leads/convert-lead-to-claim.ts src/lib/self-service/flow-kontext.ts src/lib/self-service/__tests__/flow-kontext.test.ts "src/app/flow/[token]/self-service-actions.ts"
git commit -m "feat(kasko-wb): speichereKaskoTarifFlow (Ableitung -> Quali-Pfad), Bindungs-Mail (E6), Dispatch-Task bei unklar (E3), Spiegel/Convert/Kontext

Audit:
- Build: tsc, vitest, use-server-exports, server-actions, query-drift gruen
- UI: Consumer in Task 12
- Redundanz: Entscheidung laeuft ueber speichereQualiFlow (keine zweite Disqualifikations-Logik)
- Dead-Code: nichts
- Spec: §6 Ergebnis-Routing, §4.2 Spiegel/Convert, §4.3 Kontext
- Inkonsistenz: Result-Objects, revalidatePath, non-critical try/catch fuer Mail/Task/Spiegel
- Regression: speichereQualiFlow unveraendert genutzt; Convert additiv

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---
### Task 12: FlowLink — Step, Quali-Phase und Re-Visit-Gate auf die Tariffrage umstellen

**Files:**
- Modify (Inhalt ersetzen): `src/app/flow/[token]/FlowWerkstattbindungStep.tsx`
- Modify: `src/app/flow/[token]/FlowQualiStep.tsx` (Phase `werkstattbindung`, neue Phasen `abbruch_bindung`, `unklar`)
- Create: `src/app/flow/[token]/FlowKaskoBindungGate.tsx`
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (Gate bei `lead.disqualifiziert`, Prop-Typ) und `src/app/flow/[token]/page.tsx` (Prop durchreichen, falls das `lead`-Objekt explizit gebaut wird)

**Interfaces:**
- Consumes: `KaskoTarifFrage`, `KaskoBindungEndansicht`, `KaskoUnklarHinweis`, `speichereKaskoTarifFlow`, `ladeKaskoBindungsInfoFuerFlow`, `fordereRueckrufAn`, `erzeugeSelbstzahlerClaim` (bestehend).
- Step-ID `werkstattbindung_check` und Label „Werkstattwahl" bleiben — nur der Render-Inhalt wechselt (keine Config-Änderung außer Task 5).

- [ ] **Step 1: `FlowWerkstattbindungStep.tsx` komplett ersetzen**

```tsx
'use client'

// Kasko-Werkstattbindungs-Gate (Spec 2026-07-21 -> 2026-09-04 Phase 1): statt der binaeren Selbstauskunft
// fragt der Step Versicherer + Tarif (KaskoTarifFrage) und leitet die Bindung aus der Wissensbasis ab.
// Config-Bedingung {"freie_werkstattwahl": null, "werkstattbindung_quelle": null} (Mig 3). Ergebnisse:
//   frei      -> onWeiter (Werkstatt-Strecke)
//   gebunden  -> KaskoBindungEndansicht (ehrlich: Marke, Sanktion, Versicherer-Kontakt, Rueckruf)
//   unbekannt -> KaskoUnklarHinweis, dann onWeiter (E3: durchlassen, Dispatch klaert)

import { useState } from 'react'
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import { KaskoUnklarHinweis } from '@/components/self-service/KaskoUnklarHinweis'
import type { KaskoBindungsInfo, KaskoTarifAuswahl } from '@/lib/kasko-wb/types'
import { fordereRueckrufAn, speichereKaskoTarifFlow } from './self-service-actions'

type Phase = 'frage' | 'sende' | 'abbruch' | 'unklar' | 'fehler'

export function FlowWerkstattbindungStep({ token, onWeiter }: { token: string; onWeiter: () => void }) {
  const [phase, setPhase] = useState<Phase>('frage')
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  const [markeName, setMarkeName] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichere(auswahl: KaskoTarifAuswahl) {
    setPhase('sende')
    setFehler(null)
    setMarkeName(auswahl.markeName)
    try {
      const r = await speichereKaskoTarifFlow(token, auswahl)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.')
        return
      }
      if (r.ergebnis === 'abbruch') {
        setInfo(r.info)
        setPhase('abbruch')
        return
      }
      if (r.ergebnis === 'unklar') {
        setPhase('unklar')
        return
      }
      onWeiter()
    } catch {
      setPhase('fehler')
      setFehler('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.')
    }
  }

  if (phase === 'abbruch' && info) {
    return <KaskoBindungEndansicht info={info} onRueckruf={() => fordereRueckrufAn(token)} />
  }
  if (phase === 'unklar') {
    return <KaskoUnklarHinweis markeName={markeName} onWeiter={onWeiter} />
  }

  return (
    <div className="max-w-md w-full">
      <KaskoTarifFrage onErgebnis={(auswahl) => void speichere(auswahl)} busy={phase === 'sende'} />
      {phase === 'fehler' && fehler && <p className="mt-4 text-sm text-danger text-center">{fehler}</p>}
    </div>
  )
}
```

- [ ] **Step 2: `FlowQualiStep.tsx` — Phase `werkstattbindung` auf die Tariffrage umstellen**

Imports ergänzen:

```ts
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import { KaskoUnklarHinweis } from '@/components/self-service/KaskoUnklarHinweis'
import type { KaskoBindungsInfo, KaskoTarifAuswahl } from '@/lib/kasko-wb/types'
import { fordereRueckrufAn, speichereKaskoTarifFlow } from './self-service-actions'
```

Phase-Typ erweitern:

```ts
type Phase = 'frage' | 'versicherung' | 'werkstattbindung' | 'sende' | 'abbruch' | 'abbruch_bindung' | 'unklar' | 'selbstzahler' | 'fehler'
```

State ergänzen (neben `fehler`):

```ts
  const [bindungInfo, setBindungInfo] = useState<KaskoBindungsInfo | null>(null)
  const [markeName, setMarkeName] = useState<string | null>(null)
```

Aus `sende` den Weiter-Pfad ab `onSchuldfrage?.(schuldfrage)` in eine Funktion ziehen und von beiden Wegen nutzen — `sende` wird zu:

```ts
  async function nachQualiWeiter(schuldfrage: string, ueberEigeneVersicherung: boolean | undefined, abrechnungsweg: string | null | undefined) {
    // AAR-956 gegner-conditional: gewaehlte Schuldfrage an den Wizard melden.
    onSchuldfrage?.(schuldfrage)
    if (abrechnungsweg === 'selbstzahler' || abrechnungsweg === 'kasko') {
      setPhase('selbstzahler')
      const claimRes = await erzeugeSelbstzahlerClaim(token)
      if (!claimRes.ok) {
        setPhase('fehler')
        setFehler(claimRes.error)
        return
      }
      onSelbstzahler?.(claimRes.claimId)
      onSzenario?.(schuldfrage, ueberEigeneVersicherung ?? null)
      return
    }
    if (onSzenario) {
      onSzenario(schuldfrage, ueberEigeneVersicherung ?? null)
      return
    }
    onWeiter()
  }

  async function sende(schuldfrage: string, ueberEigeneVersicherung?: boolean, freieWerkstattwahl?: boolean) {
    setPhase('sende')
    setFehler(null)
    try {
      const r = await speichereQualiFlow(token, schuldfrage, ueberEigeneVersicherung, freieWerkstattwahl)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? t('errors.allgemein'))
        return
      }
      if (r.ergebnis === 'abbruch') {
        setPhase('abbruch')
        return
      }
      await nachQualiWeiter(schuldfrage, ueberEigeneVersicherung, r.abrechnungsweg)
    } catch {
      setPhase('fehler')
      setFehler(t('errors.unerwartet'))
    }
  }

  // Kasko-WB Phase 1: Versicherer + Tarif statt binaerer Bindungsfrage.
  async function sendeKaskoTarif(auswahl: KaskoTarifAuswahl) {
    setPhase('sende')
    setFehler(null)
    setMarkeName(auswahl.markeName)
    try {
      const r = await speichereKaskoTarifFlow(token, auswahl)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? t('errors.allgemein'))
        return
      }
      if (r.ergebnis === 'abbruch') {
        setBindungInfo(r.info)
        setPhase('abbruch_bindung')
        return
      }
      if (r.ergebnis === 'unklar') {
        setPhase('unklar')
        return
      }
      await nachQualiWeiter('eigenverantwortung', true, 'kasko')
    } catch {
      setPhase('fehler')
      setFehler(t('errors.unerwartet'))
    }
  }
```

Render-Zweige: vor `if (phase === 'abbruch') return <KaskoEndansicht />` einfügen

```tsx
  if (phase === 'abbruch_bindung' && bindungInfo) {
    return <KaskoBindungEndansicht info={bindungInfo} onRueckruf={() => fordereRueckrufAn(token)} />
  }
  if (phase === 'unklar') {
    return <KaskoUnklarHinweis markeName={markeName} onWeiter={() => void nachQualiWeiter('eigenverantwortung', true, 'kasko')} />
  }
```

und den gesamten Block `if (phase === 'werkstattbindung') { … }` ersetzen durch

```tsx
  if (phase === 'werkstattbindung') {
    // Kasko-WB Phase 1: Versicherer + Tarif (Wissensbasis) statt „Sind Sie an eine Werkstatt gebunden?".
    return (
      <div className="max-w-md w-full">
        <KaskoTarifFrage onErgebnis={(auswahl) => void sendeKaskoTarif(auswahl)} />
      </div>
    )
  }
```

Der Text des Buttons „Ja, ich habe eine Kaskoversicherung" behält seinen Hinweis; passe die Unterzeile an: `Eine kurze Rückfrage zu Versicherer und Tarif.`

- [ ] **Step 3: Re-Visit-Gate** — neue Datei `src/app/flow/[token]/FlowKaskoBindungGate.tsx`:

```tsx
'use client'

// Re-Visit eines wegen Kasko-Werkstattbindung disqualifizierten Leads: statt der generischen KaskoEndansicht
// (Gutachter/Haftpflicht-Text) die Bindungs-Endseite mit Info aus der Wissensbasis.
import { useEffect, useState } from 'react'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'
import { fordereRueckrufAn, ladeKaskoBindungsInfoFuerFlow } from './self-service-actions'

export function FlowKaskoBindungGate({ token }: { token: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  useEffect(() => {
    let alive = true
    ladeKaskoBindungsInfoFuerFlow(token).then((r) => {
      if (alive && r.ok) setInfo(r.info)
    })
    return () => {
      alive = false
    }
  }, [token])
  if (!info) return <p className="text-body-sm text-claimondo-navy/60">Wird geladen …</p>
  return <KaskoBindungEndansicht info={info} onRueckruf={() => fordereRueckrufAn(token)} />
}
```

- [ ] **Step 4: Wizard-Gate** — in `src/app/flow/[token]/FlowWizardKfz.tsx`: im `lead`-Prop-Typ neben `disqualifiziert?: boolean | null` ergänzen `disqualifiziert_grund_key?: string | null`; Import `import { FlowKaskoBindungGate } from './FlowKaskoBindungGate'`; den Block

```tsx
  if (istIncomplete && lead.disqualifiziert) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <KaskoEndansicht />
      </div>
    )
  }
```

ersetzen durch

```tsx
  // AAR-956 §3a + Kasko-WB Phase 1: bereits disqualifizierter Lead -> je nach Grund die passende Endseite.
  if (istIncomplete && lead.disqualifiziert) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        {lead.disqualifiziert_grund_key === 'werkstattbindung' ? <FlowKaskoBindungGate token={token} /> : <KaskoEndansicht />}
      </div>
    )
  }
```

In `src/app/flow/[token]/page.tsx` prüfen: `grep -n "disqualifiziert" "src/app/flow/[token]/page.tsx"`. Wird das `lead`-Objekt für den Wizard **explizit** zusammengesetzt (Feld für Feld), dort `disqualifiziert_grund_key: lead.disqualifiziert_grund_key ?? null` ergänzen; wird die Lead-Row (`select('*')`) direkt durchgereicht, ist nichts zu tun.

- [ ] **Step 5: Gates** — `./node_modules/.bin/tsc --noEmit && node scripts/check-component-set.mjs && ./node_modules/.bin/vitest run src/lib/self-service` → grün. Dev-Server-Smoke (lokal): einen Kasko-Lead per FlowLink öffnen (Quali → „Ich selbst" → „Ja, Kasko") — die Marken-Suche erscheint; HUK-COBURG → „Classic SELECT" → Endseite mit Hotline; Reload des Links → Endseite bleibt (Gate).

- [ ] **Step 6: Commit**

```bash
git add "src/app/flow/[token]/FlowWerkstattbindungStep.tsx" "src/app/flow/[token]/FlowQualiStep.tsx" "src/app/flow/[token]/FlowKaskoBindungGate.tsx" "src/app/flow/[token]/FlowWizardKfz.tsx" "src/app/flow/[token]/page.tsx"
git commit -m "feat(kasko-wb): FlowLink fragt Versicherer + Tarif statt binaerer Bindung; Bindungs-Endseite ersetzt den Gutachter-Text (auch beim Re-Visit)

Audit:
- Build: tsc, component-set, vitest gruen; lokaler Smoke Kasko HUK Classic SELECT -> Endseite
- UI: Step werkstattbindung_check (kasko, Pos. 3) + Quali-Phase + Re-Visit-Gate
- Redundanz: eine Frage-Komponente an drei Stellen; Weiter-Pfad in nachQualiWeiter zusammengezogen
- Dead-Code: alte Zwei-Button-Frage entfernt (beide Varianten); KaskoEndansicht bleibt fuer Eigenverschulden
- Spec: §6 Kundenweg, E2, E3
- Inkonsistenz: Umlaute, Result-Objects
- Regression: Selbstzahler-/Haftpflicht-Quali unveraendert (sende-Pfad identisch)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 13: Vermittlungskern — Bindung sperrt die Vermittlung (Defense in Depth)

**Files:**
- Modify: `src/lib/werkstatt/vermittlung-core.ts` (`BedarfRow`, `brauchtWerkstattVermittlung`)
- Modify: `src/lib/werkstatt/vermittlung-server.ts` (`assignReparaturWerkstatt`, Guard vor dem Write)
- Modify: `src/lib/claims/kunde-claim-view.ts` (`brauchtVermittlung`-Aufruf ~Zeile 470 + `claimExtraRes`-Select)
- Test: `src/lib/werkstatt/__tests__/vermittlung-core.test.ts` (ergänzen; existiert die Datei nicht, anlegen)

**Interfaces:**
- `BedarfRow` bekommt `freie_werkstattwahl?: boolean | null`; `brauchtWerkstattVermittlung(row)` liefert `false`, wenn `row.freie_werkstattwahl === false`.
- `assignReparaturWerkstatt` liefert `{ ok:false, error }` bei gebundenem Ziel.

- [ ] **Step 1: Test**

```ts
// src/lib/werkstatt/__tests__/vermittlung-core.test.ts (ergaenzen oder anlegen)
import { describe, it, expect } from 'vitest'
import { brauchtWerkstattVermittlung, pruefeWerkstattAuswahl } from '../vermittlung-core'

describe('brauchtWerkstattVermittlung — Kasko-Werkstattbindung', () => {
  const offen = { reparaturwunsch: 'reparatur', reparatur_werkstatt_id: null, werkstatt_id: null, reparatur_vermittlung_status: 'offen' }
  it('gebunden (false) -> keine Vermittlung', () => {
    expect(brauchtWerkstattVermittlung({ ...offen, freie_werkstattwahl: false })).toBe(false)
  })
  it('frei (true) oder offen (null/undefined) -> wie bisher', () => {
    expect(brauchtWerkstattVermittlung({ ...offen, freie_werkstattwahl: true })).toBe(true)
    expect(brauchtWerkstattVermittlung({ ...offen, freie_werkstattwahl: null })).toBe(true)
    expect(brauchtWerkstattVermittlung(offen)).toBe(true)
  })
  it('pruefeWerkstattAuswahl lehnt gebundene Auswahl ab, auch ohne reparaturwunsch', () => {
    expect(pruefeWerkstattAuswahl({ ...offen, reparaturwunsch: null, freie_werkstattwahl: false }).erlaubt).toBe(false)
  })
})
```

- [ ] **Step 2: Rot** — `./node_modules/.bin/vitest run src/lib/werkstatt/__tests__/vermittlung-core.test.ts` → FAIL (`false` erwartet, `true` erhalten).

- [ ] **Step 3: Kern**

```ts
// vermittlung-core.ts — BedarfRow erweitern:
export type BedarfRow = {
  reparaturwunsch?: string | null
  reparatur_werkstatt_id?: string | null
  werkstatt_id?: string | null
  reparatur_vermittlung_status?: string | null
  /** Kasko-WB Phase 1: false = Versicherer benennt die Werkstatt -> wir vermitteln NICHT. */
  freie_werkstattwahl?: boolean | null
}

// brauchtWerkstattVermittlung — erste Bedingung ergaenzen:
export function brauchtWerkstattVermittlung(row: BedarfRow): boolean {
  return (
    row.freie_werkstattwahl !== false &&
    (row.reparaturwunsch === 'reparatur' || row.reparaturwunsch === 'fiktiv') &&
    row.reparatur_werkstatt_id == null &&
    row.werkstatt_id == null &&
    (row.reparatur_vermittlung_status ?? 'offen') === 'offen'
  )
}
```

- [ ] **Step 4: Server-Guard** — in `assignReparaturWerkstatt` (`vermittlung-server.ts`) direkt vor `const table = input.target === 'lead' ? 'leads' : 'claims'` einfügen:

```ts
  // Kasko-WB Phase 1 (Spec §6): gebundener Kunde -> keine Zuweisung, egal wer sie versucht (Dispatch/KB/SV/Kunde).
  {
    const zielTabelle = input.target === 'lead' ? 'leads' : 'claims'
    const { data: ziel } = await admin.from(zielTabelle).select('freie_werkstattwahl').eq('id', input.id).maybeSingle()
    if ((ziel as { freie_werkstattwahl?: boolean | null } | null)?.freie_werkstattwahl === false) {
      return {
        ok: false,
        error: 'Kasko mit Werkstattbindung — der Versicherer benennt die Werkstatt. Eine Vermittlung ist hier nicht möglich.',
      }
    }
  }
```

- [ ] **Step 5: Kunde-Claim-View** — in `src/lib/claims/kunde-claim-view.ts`: (a) in der `claimExtraRes`-Query (`grep -n "claimExtraRes = \|claimExtraRes," src/lib/claims/kunde-claim-view.ts` → die zugehörige `.from('claims').select('…')`) die Spaltenliste um `, freie_werkstattwahl, werkstattbindung_quelle, eigene_versicherung_name, eigene_kasko_tarif_name` erweitern; (b) beim Aufruf `brauchtWerkstattVermittlung({ … })` (~Zeile 470) das Feld ergänzen:

```ts
    freie_werkstattwahl: (claimExtra?.freie_werkstattwahl as boolean | null | undefined) ?? null,
```

(c) im `flags`-Objekt (~Zeile 701) drei Flags ergänzen und den `KundeClaimViewModel`-Typ (dort, wo `istReparaturRoute: boolean` deklariert ist) entsprechend erweitern:

```ts
      // Kasko-WB Phase 1: Tariffrage vor dem Finder; gebunden -> Info statt Finder.
      kaskoBindungOffen: abrechnungsweg === 'kasko' && (claimExtra?.freie_werkstattwahl ?? null) === null && (claimExtra?.werkstattbindung_quelle ?? null) === null,
      kaskoGebunden: abrechnungsweg === 'kasko' && claimExtra?.freie_werkstattwahl === false,
      kaskoTarifName: (claimExtra?.eigene_kasko_tarif_name as string | null | undefined) ?? null,
```

- [ ] **Step 6: Grün** — `./node_modules/.bin/vitest run src/lib/werkstatt && ./node_modules/.bin/tsc --noEmit && node --env-file=.env.local scripts/check-query-drift.mjs` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/werkstatt/vermittlung-core.ts src/lib/werkstatt/vermittlung-server.ts src/lib/claims/kunde-claim-view.ts src/lib/werkstatt/__tests__/vermittlung-core.test.ts
git commit -m "feat(kasko-wb): Vermittlungskern respektiert die Werkstattbindung (Gate + Server-Guard), Kunde-View-Flags

Audit:
- Build: tsc, vitest, query-drift gruen
- UI: Flags fuer Task 15
- Redundanz: ein Gate (brauchtWerkstattVermittlung) + ein Guard (assignReparaturWerkstatt)
- Dead-Code: nichts
- Spec: §6 Umgehungen (Defense in Depth), G4/G7 aus dem Scan
- Inkonsistenz: Result-Object mit deutschem Fehlertext
- Regression: null/true verhalten sich exakt wie vorher (Test)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 14: Embed-Werkstatt-Finder — Tariffrage bei Kasko, keine Zuweisung bei Bindung

**Files:**
- Modify: `src/app/embed/werkstatt-finder/_components/wizard-logic.ts` (+ Test `__tests__/wizard-logic.test.ts`)
- Modify: `src/app/embed/werkstatt-finder/_components/AbrechnungStep.tsx`
- Modify: `src/app/embed/werkstatt-finder/_components/WerkstattWizard.tsx`
- Modify: `src/lib/werkstatt/embed-finder-core.ts` (+ Test `src/lib/werkstatt/__tests__/embed-finder-core.test.ts`, ergänzen/anlegen)
- Modify: `src/app/embed/werkstatt-finder/actions.ts`

**Interfaces:**
- `wizard-logic.ts`: `export type KaskoWbWahl = KaskoTarifAuswahl & WbErgebnis`; `WerkstattWizardState.kaskoWb: KaskoWbWahl | null`; `kannWeiter('abrechnung')` verlangt bei `kasko` eine Antwort.
- `embed-finder-core.ts`: `WerkstattFinderLeadInput.kaskoWb?: KaskoWbWahl | null`; Extra enthält die fünf Tariffelder + `freie_werkstattwahl`; **keine** Zuweisung und kein `reparaturwunsch` bei `freieWerkstattwahl === false`.
- `actions.ts`: Payload `kaskoWb?: KaskoWbWahl | null`; bei Bindung Lead disqualifizieren (`buildDisqualifikationPatch('werkstattbindung', nowIso)`), Mail (E6).

- [ ] **Step 1: Tests**

```ts
// src/app/embed/werkstatt-finder/_components/__tests__/wizard-logic.test.ts — ergaenzen:
import { WIZARD_INITIAL, kannWeiter } from '../wizard-logic'

describe('kannWeiter(abrechnung) — Kasko braucht die Tarifantwort', () => {
  const basis = { ...WIZARD_INITIAL, abrechnung: 'kasko' as const }
  it('kasko ohne Antwort -> false; mit Antwort -> true', () => {
    expect(kannWeiter('abrechnung', basis)).toBe(false)
    expect(kannWeiter('abrechnung', { ...basis, kaskoWb: { markeId: 'm', markeName: 'HUK', tarifId: null, tarifName: null, markerAntwort: 'nein', freieWerkstattwahl: true, quelle: 'marker', grund: 'marker_verneint' } })).toBe(true)
  })
  it('haftpflicht/selbstzahler brauchen keine Tarifantwort', () => {
    expect(kannWeiter('abrechnung', { ...WIZARD_INITIAL, abrechnung: 'selbstzahler' })).toBe(true)
  })
})
```

```ts
// src/lib/werkstatt/__tests__/embed-finder-core.test.ts — ergaenzen/anlegen:
import { describe, it, expect } from 'vitest'
import { buildWerkstattFinderLeadExtra } from '../embed-finder-core'

const base = { werkstattId: 'w1', werkstattEmail: 'ws@example.invalid', kundeEmail: 'k@example.invalid', schuldfrage: 'eigenverantwortung' as const, eigeneVersicherung: 'ja' as const }
const gebunden = { markeId: 'm1', markeName: 'HUK-COBURG', tarifId: 't1', tarifName: 'Classic SELECT', markerAntwort: null, freieWerkstattwahl: false as const, quelle: 'tarif' as const, grund: 'tarif_mit_wb' as const }
const frei = { ...gebunden, tarifId: 't2', tarifName: 'Classic', freieWerkstattwahl: true as const, grund: 'tarif_ohne_wb' as const }

describe('buildWerkstattFinderLeadExtra — Kasko-Werkstattbindung', () => {
  it('gebunden: Tariffelder + freie_werkstattwahl=false, KEINE Zuweisung, kein reparaturwunsch', () => {
    const extra = buildWerkstattFinderLeadExtra({ ...base, kaskoWb: gebunden })
    expect(extra).toMatchObject({ eigene_versicherung_marke_id: 'm1', eigene_kasko_tarif_name: 'Classic SELECT', freie_werkstattwahl: false, werkstattbindung_quelle: 'tarif' })
    expect(extra.reparatur_werkstatt_id).toBeUndefined()
    expect(extra.reparaturwunsch).toBeUndefined()
  })
  it('frei: Zuweisung wie bisher + freie_werkstattwahl=true', () => {
    const extra = buildWerkstattFinderLeadExtra({ ...base, kaskoWb: frei })
    expect(extra.reparatur_werkstatt_id).toBe('w1')
    expect(extra.freie_werkstattwahl).toBe(true)
  })
  it('unbekannt: Zuweisung erlaubt, freie_werkstattwahl bleibt weg, quelle=unbekannt', () => {
    const extra = buildWerkstattFinderLeadExtra({ ...base, kaskoWb: { ...frei, freieWerkstattwahl: null, quelle: 'unbekannt', grund: 'unbekannt' } })
    expect(extra.reparatur_werkstatt_id).toBe('w1')
    expect(extra.freie_werkstattwahl).toBeUndefined()
    expect(extra.werkstattbindung_quelle).toBe('unbekannt')
  })
})
```

- [ ] **Step 2: Rot** — `./node_modules/.bin/vitest run src/app/embed/werkstatt-finder src/lib/werkstatt/__tests__/embed-finder-core.test.ts` → FAIL.

- [ ] **Step 3: wizard-logic.ts**

```ts
// Imports oben ergaenzen:
import type { KaskoTarifAuswahl, WbErgebnis } from '@/lib/kasko-wb/types'

// Kasko-WB Phase 1: Antwort der Tariffrage im Wizard-State (Client rechnet die Ableitung nur fuer die UI;
// der Server leitet beim Speichern erneut ab — Trust-Boundary).
export type KaskoWbWahl = KaskoTarifAuswahl & WbErgebnis

// WerkstattWizardState ergaenzen:
  kaskoWb: KaskoWbWahl | null
// WIZARD_INITIAL ergaenzen:
  kaskoWb: null,

// kannWeiter: Fall 'abrechnung' ersetzen
    case 'abrechnung':
      return s.abrechnung != null && (s.abrechnung !== 'kasko' || s.kaskoWb != null)
```

- [ ] **Step 4: AbrechnungStep.tsx** — Props und Render erweitern:

```tsx
// Imports ergaenzen:
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import { Badge } from '@/components/primitives'
import type { KaskoWbWahl } from './wizard-logic'

export function AbrechnungStep({
  abrechnung,
  onChange,
  kaskoWb,
  onKaskoWb,
}: {
  abrechnung: Abrechnungswahl | null
  onChange: (w: Abrechnungswahl) => void
  kaskoWb: KaskoWbWahl | null
  onKaskoWb: (w: KaskoWbWahl | null) => void
}) {
  // ... bestehende Karten unveraendert; onClick zusaetzlich: onKaskoWb(null) wenn wert !== 'kasko'
```

Im `onClick` der Karten: `onClick={() => { onChange(wert); if (wert !== 'kasko') onKaskoWb(null) }}`. Nach der Karten-Liste (vor dem schließenden `</div>`) einfügen:

```tsx
      {abrechnung === 'kasko' && !kaskoWb && (
        <div className="rounded-ios-lg border border-claimondo-border bg-white p-4">
          <KaskoTarifFrage kompakt onErgebnis={(auswahl, ergebnis) => onKaskoWb({ ...auswahl, ...ergebnis })} />
        </div>
      )}
      {abrechnung === 'kasko' && kaskoWb && (
        <div className="flex items-center justify-between gap-3 rounded-ios-lg border border-claimondo-border bg-white p-4">
          <span className="text-body-sm text-claimondo-navy">
            {[kaskoWb.markeName, kaskoWb.tarifName].filter(Boolean).join(' · ') || 'Kasko-Tarif'}
          </span>
          {kaskoWb.freieWerkstattwahl === true && <Badge tone="success" size="sm">freie Werkstattwahl</Badge>}
          {kaskoWb.freieWerkstattwahl === false && <Badge tone="warning" size="sm">Werkstattbindung</Badge>}
          {kaskoWb.freieWerkstattwahl === null && <Badge tone="info" size="sm">Bindung unklar</Badge>}
          <button type="button" className="text-caption text-claimondo-ondo underline" onClick={() => onKaskoWb(null)}>ändern</button>
        </div>
      )}
      {abrechnung === 'kasko' && kaskoWb?.freieWerkstattwahl === false && (
        <p className="text-body-sm text-warning-strong">
          Ihr Tarif enthält eine Werkstattbindung – Ihre Versicherung benennt die Werkstatt. Wir vermitteln deshalb keine
          Werkstatt; im nächsten Schritt können Sie einen Rückruf anfordern.
        </p>
      )}
```

- [ ] **Step 5: WerkstattWizard.tsx** — Aufruf anpassen und Payload erweitern:

```tsx
      {step === 'abrechnung' && (
        <AbrechnungStep
          abrechnung={state.abrechnung}
          onChange={(w) => patch({ abrechnung: w })}
          kaskoWb={state.kaskoWb}
          onKaskoWb={(w) => patch({ kaskoWb: w })}
        />
      )}
```

Im Kontakt-Schritt die Unterzeile abhängig machen:

```tsx
            <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
              {state.kaskoWb?.freieWerkstattwahl === false
                ? 'Wir vermitteln in diesem Fall keine Werkstatt. Hinterlassen Sie Ihre Kontaktdaten für einen Rückruf und eine Zusammenfassung per E-Mail.'
                : 'Damit wir Ihre Werkstatt-Anfrage bestätigen können.'}
            </p>
```

In `absenden()` zum Payload ergänzen: `kaskoWb: state.kaskoWb,` und `werkstattId: state.kaskoWb?.freieWerkstattwahl === false ? null : selectedId,`.

- [ ] **Step 6: embed-finder-core.ts**

```ts
// Import ergaenzen:
import type { KaskoTarifAuswahl, WbErgebnis } from '@/lib/kasko-wb/types'

// WerkstattFinderLeadInput ergaenzen:
  /** Kasko-WB Phase 1: Antwort der Tariffrage (nur bei eigeneVersicherung='ja'). */
  kaskoWb?: (KaskoTarifAuswahl & WbErgebnis) | null

// buildWerkstattFinderLeadExtra — nach dem schuldfrage-Block, VOR der Zuweisung einfuegen:
  const gebunden = input.kaskoWb?.freieWerkstattwahl === false
  if (input.kaskoWb) {
    extra.eigene_versicherung_marke_id = input.kaskoWb.markeId
    extra.eigene_versicherung_name = input.kaskoWb.markeName
    extra.eigene_kasko_tarif_id = input.kaskoWb.tarifId
    extra.eigene_kasko_tarif_name = input.kaskoWb.tarifName
    extra.werkstattbindung_quelle = input.kaskoWb.quelle
    if (input.kaskoWb.freieWerkstattwahl !== null) extra.freie_werkstattwahl = input.kaskoWb.freieWerkstattwahl
  }
  // Umgehung (a) aus dem Scan: gebundener Kasko-Kunde bekommt KEINE Werkstatt zugewiesen.
  if (!gebunden && input.werkstattId && darfWerkstattZuweisen(input.kundeEmail, input.werkstattEmail)) {
    Object.assign(extra, buildZuweisungPatch(input.werkstattId, null, 'embed'), { reparaturwunsch: 'reparatur' })
  }
```

(die bisherige `if (input.werkstattId && …)`-Zuweisung durch die neue Zeile ersetzen).

- [ ] **Step 7: actions.ts** — Payload-Typ ergänzen `kaskoWb?: (KaskoTarifAuswahl & WbErgebnis) | null` (Imports `import type { KaskoTarifAuswahl, WbErgebnis } from '@/lib/kasko-wb/types'`, `import { buildDisqualifikationPatch } from '@/lib/self-service/disqualifikation-patch'`, `import { ladeKaskoBindungsInfo } from '@/lib/kasko-wb/actions'`, `import { notifyKundeWerkstattbindung } from '@/lib/kasko-wb/notify-kunde-werkstattbindung'`); an `buildWerkstattFinderLeadExtra({...})` `kaskoWb: payload.kaskoWb ?? null,` durchreichen. Nach dem Block, der `leadId` setzt (Re-Entry **und** Neu-Lead beide durch), vor dem Foto-Persist einfügen:

```ts
  // Kasko-WB Phase 1: gebundener Kunde -> Lead disqualifizieren (Grund werkstattbindung) + Zusammenfassungs-Mail (E6).
  // Ohne Disqualifikation zeigte der /flow dem Kunden den Werkstatt-Step (Step-Bedingung sieht false als Antwort).
  if (payload.kaskoWb?.freieWerkstattwahl === false && leadId) {
    const nowIso = new Date().toISOString()
    const { error: dqErr } = await admin.from('leads').update(buildDisqualifikationPatch('werkstattbindung', nowIso) as never).eq('id', leadId)
    if (dqErr) console.error('[werkstatt-finder] Disqualifikation (Werkstattbindung) fehlgeschlagen (non-fatal):', dqErr.message)
    try {
      const infoRes = await ladeKaskoBindungsInfo(payload.kaskoWb.markeId, payload.kaskoWb.tarifId, payload.kaskoWb.markeName)
      if (infoRes.ok) await notifyKundeWerkstattbindung({ kunde: { vorname: payload.vorname ?? null, email: payload.email }, info: infoRes.info })
    } catch (err) {
      console.error('[werkstatt-finder] Bindungs-Mail fehlgeschlagen (non-fatal):', err)
    }
  }
```

- [ ] **Step 8: Grün** — `./node_modules/.bin/vitest run src/app/embed src/lib/werkstatt && ./node_modules/.bin/tsc --noEmit && node scripts/check-use-server-exports.mjs && node scripts/check-component-set.mjs` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/embed/werkstatt-finder src/lib/werkstatt/embed-finder-core.ts src/lib/werkstatt/__tests__/embed-finder-core.test.ts
git commit -m "feat(kasko-wb): Embed-Werkstatt-Finder fragt bei Kasko Versicherer + Tarif; gebunden = keine Zuweisung, Lead disqualifiziert, Mail

Audit:
- Build: tsc, vitest, use-server-exports, component-set gruen
- UI: Tariffrage inline unter der Kasko-Karte; Kontakt-Schritt als Rueckruf-Formular bei Bindung
- Redundanz: KaskoTarifFrage + Disqualifikations-Helper wiederverwendet
- Dead-Code: nichts
- Spec: §6 Umgehung (a)
- Inkonsistenz: Umlaute, Badges als Tokens
- Regression: haftpflicht/selbstzahler-Pfad unveraendert (Test kannWeiter)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 15: Kunde-Portal — Tarif-Card vor dem Finder, Bindungs-Card statt Finder

**Files:**
- Create: `src/app/kunde/faelle/[id]/kasko-tarif-actions.ts`
- Create: `src/components/kunde/KaskoTarifCard.tsx`, `src/components/kunde/KaskoBindungCard.tsx`
- Modify: `src/components/kunde/claim-view/GeldZone.tsx`

**Interfaces:**
- `speichereKaskoTarifPortal(claimId, auswahl): Promise<{ ok: true; freieWerkstattwahl: boolean | null } | { ok: false; error: string }>` — Ownership via Kunde-RLS (`createClient`), Write via `createServiceClient` auf `claims` **und** (falls `lead_id`) `leads`; `werkstattbindung_quelle` aus der Ableitung; `revalidatePath('/kunde/faelle/${claimId}')`.
- `ladeKaskoBindungsInfoPortal(claimId)` → Info für die Bindungs-Card.

- [ ] **Step 1: Actions**

```ts
'use server'

// Kasko-WB Phase 1 — Kunde-Portal (Umgehung b aus dem Scan): Kasko-Claims aus der Schadenmeldung kannten die
// Bindung nie. Der Kunde beantwortet die Tariffrage jetzt VOR dem Finder. Muster wie werkstatt-finder-actions.ts:
// Ownership via Kunde-RLS, Write via Service-Client, Authz VOR dem Write.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { leiteWerkstattbindungAb } from '@/lib/kasko-wb/werkstattbindung'
import { ladeKaskoBindungsInfo } from '@/lib/kasko-wb/actions'
import type { Bindungsumfang, KaskoBindungsInfo, KaskoTarifAuswahl, WbStatus } from '@/lib/kasko-wb/types'

async function assertOwner(claimId: string): Promise<{ ok: true; leadId: string | null } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const { data: claim } = await supabase.from('claims').select('id, lead_id').eq('id', claimId).maybeSingle()
  if (!claim) return { ok: false, error: 'Vorgang nicht gefunden.' }
  return { ok: true, leadId: (claim.lead_id as string | null) ?? null }
}

export async function speichereKaskoTarifPortal(
  claimId: string,
  auswahl: KaskoTarifAuswahl,
): Promise<{ ok: true; freieWerkstattwahl: boolean | null } | { ok: false; error: string }> {
  const owner = await assertOwner(claimId)
  if (!owner.ok) return owner
  const svc = createServiceClient()

  let wbStatus: WbStatus | null = null
  let tarif: { hatWerkstattbindung: boolean; bindungsumfang: Bindungsumfang } | null = null
  let markeName = auswahl.markeName?.trim() || null
  let tarifName = auswahl.tarifName?.trim() || null
  if (auswahl.markeId) {
    const { data: m } = await svc.from('kasko_versicherer_marken').select('marke, wb_status').eq('id', auswahl.markeId).maybeSingle()
    if (m) { wbStatus = m.wb_status as WbStatus; markeName = m.marke as string }
  }
  if (auswahl.tarifId) {
    const { data: t } = await svc.from('kasko_tarife').select('anzeigename, hat_werkstattbindung, bindungsumfang').eq('id', auswahl.tarifId).maybeSingle()
    if (t) { tarif = { hatWerkstattbindung: t.hat_werkstattbindung as boolean, bindungsumfang: t.bindungsumfang as Bindungsumfang }; tarifName = t.anzeigename as string }
  }
  const ergebnis = leiteWerkstattbindungAb({ wbStatus, tarif, markerAntwort: auswahl.markerAntwort, schadenIstGlas: false })

  const patch: Record<string, unknown> = {
    eigene_versicherung_marke_id: auswahl.markeId,
    eigene_versicherung_name: markeName,
    eigene_kasko_tarif_id: auswahl.tarifId,
    eigene_kasko_tarif_name: tarifName,
    werkstattbindung_quelle: ergebnis.quelle,
    ...(ergebnis.freieWerkstattwahl !== null ? { freie_werkstattwahl: ergebnis.freieWerkstattwahl } : {}),
  }
  const { error } = await svc.from('claims').update(patch as never).eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  if (owner.leadId) {
    // Lead spiegeln (Reminder-Cron liest freie_werkstattwahl vom Lead) — non-critical.
    const { error: leadErr } = await svc.from('leads').update(patch as never).eq('id', owner.leadId)
    if (leadErr) console.error('[kasko-tarif-portal] Lead-Spiegel fehlgeschlagen (non-critical):', leadErr.message)
  }
  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true, freieWerkstattwahl: ergebnis.freieWerkstattwahl }
}

export async function ladeKaskoBindungsInfoPortal(
  claimId: string,
): Promise<{ ok: true; info: KaskoBindungsInfo } | { ok: false; error: string }> {
  const owner = await assertOwner(claimId)
  if (!owner.ok) return owner
  const svc = createServiceClient()
  const { data: c } = await svc
    .from('claims')
    .select('eigene_versicherung_marke_id, eigene_kasko_tarif_id, eigene_versicherung_name')
    .eq('id', claimId)
    .maybeSingle()
  return ladeKaskoBindungsInfo(
    (c?.eigene_versicherung_marke_id as string | null) ?? null,
    (c?.eigene_kasko_tarif_id as string | null) ?? null,
    (c?.eigene_versicherung_name as string | null) ?? null,
  )
}
```

- [ ] **Step 2: Cards**

```tsx
// src/components/kunde/KaskoTarifCard.tsx
'use client'

// Kasko-Claim ohne Bindungsantwort: Tariffrage VOR dem Werkstatt-Finder (Spec §6, Umgehung b).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheckIcon } from 'lucide-react'
import { Card } from '@/components/primitives'
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import type { KaskoTarifAuswahl } from '@/lib/kasko-wb/types'
import { speichereKaskoTarifPortal } from '@/app/kunde/faelle/[id]/kasko-tarif-actions'

export default function KaskoTarifCard({ claimId }: { claimId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function speichere(auswahl: KaskoTarifAuswahl) {
    setBusy(true)
    const r = await speichereKaskoTarifPortal(claimId, auswahl)
    setBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    if (r.freieWerkstattwahl === null) toast.message('Bitte prüfen Sie Ihren Versicherungsschein vor der Reparatur – unser Team meldet sich.')
    router.refresh()
  }

  return (
    <Card p={5} radius="lg">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheckIcon className="h-5 w-5 text-claimondo-ondo" aria-hidden />
        <h2 className="text-heading-sm text-claimondo-navy">Dein Kasko-Tarif</h2>
      </div>
      <KaskoTarifFrage kompakt onErgebnis={(auswahl) => void speichere(auswahl)} busy={busy} />
    </Card>
  )
}
```

```tsx
// src/components/kunde/KaskoBindungCard.tsx
'use client'

// Kasko-Claim mit Werkstattbindung: Info statt Finder (keine Vermittlung, Spec E2).
import { useEffect, useState } from 'react'
import { Card } from '@/components/primitives'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import type { KaskoBindungsInfo } from '@/lib/kasko-wb/types'
import { ladeKaskoBindungsInfoPortal } from '@/app/kunde/faelle/[id]/kasko-tarif-actions'

export default function KaskoBindungCard({ claimId }: { claimId: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  useEffect(() => {
    let alive = true
    ladeKaskoBindungsInfoPortal(claimId).then((r) => {
      if (alive && r.ok) setInfo(r.info)
    })
    return () => {
      alive = false
    }
  }, [claimId])
  if (!info) return null
  return (
    <Card p={5} radius="lg">
      <KaskoBindungEndansicht info={info} kompakt />
    </Card>
  )
}
```

- [ ] **Step 3: GeldZone** — Imports `import KaskoTarifCard from '@/components/kunde/KaskoTarifCard'` und `import KaskoBindungCard from '@/components/kunde/KaskoBindungCard'`; die Finder-Zeile und die Holding-Bedingung ersetzen:

```tsx
      {/* Kasko-WB Phase 1: erst Tariffrage, dann Finder; gebunden -> Info, keine Vermittlung. */}
      {flags.kaskoBindungOffen && flags.reparaturPhaseErreicht && <KaskoTarifCard claimId={vm.claimId} />}
      {flags.kaskoGebunden && <KaskoBindungCard claimId={vm.claimId} />}
      {!flags.kaskoBindungOffen && werkstatt.brauchtVermittlung && flags.reparaturPhaseErreicht && <WerkstattFinderCard claimId={vm.claimId} />}
```

und bei der Holding-Card: `flags.istReparaturRoute && flags.reparaturPhaseErreicht && !werkstatt.brauchtVermittlung && !werkstatt.data && !flags.kaskoGebunden && !flags.kaskoBindungOffen && <WerkstattVermittlungHoldingCard />`.

- [ ] **Step 4: Grün** — `./node_modules/.bin/tsc --noEmit && node scripts/check-use-server-exports.mjs && node scripts/check-server-actions.mjs && node scripts/check-component-set.mjs` → PASS. Lokaler Smoke: Kunde-Login (Test-Account, siehe Memory `reference-internal-test-account-logins`), Kasko-Claim ohne Bindung → Tarif-Card sichtbar, nach Antwort „Classic" erscheint der Finder; nach „Classic SELECT" die Bindungs-Card.

- [ ] **Step 5: Commit**

```bash
git add "src/app/kunde/faelle/[id]/kasko-tarif-actions.ts" src/components/kunde/KaskoTarifCard.tsx src/components/kunde/KaskoBindungCard.tsx src/components/kunde/claim-view/GeldZone.tsx
git commit -m "feat(kasko-wb): Kunde-Portal — Tariffrage vor dem Werkstatt-Finder, Bindungs-Card statt Finder bei Werkstattbindung

Audit:
- Build: tsc, use-server-exports, server-actions, component-set gruen; lokaler Smoke
- UI: GeldZone (Reparatur-Strecke) bei Kasko-Claims
- Redundanz: KaskoTarifFrage/KaskoBindungEndansicht wiederverwendet; Ownership-Muster aus werkstatt-finder-actions
- Dead-Code: nichts
- Spec: §6 Umgehung (b)
- Inkonsistenz: Result-Objects, revalidatePath, Umlaute
- Regression: Selbstzahler-Claims sehen den Finder unveraendert (kaskoBindungOffen nur bei kasko)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---
### Task 16: Dispatch — Warn-Badges und Abbruchgrund sichtbar

**Files:**
- Modify: `src/app/dispatch/leads/[id]/DispatchGatesPanel.tsx`

**Interfaces:**
- Liest aus `lead` (DB-Row): `abrechnungsweg`, `eigene_versicherung`, `freie_werkstattwahl`, `eigene_kasko_tarif_name`, `eigene_versicherung_name`, `disqualifiziert_grund_key`.

- [ ] **Step 1: Warnungen ergänzen** — nach der bestehenden Eigenverschulden-Warnung (`if (values.schuldfrage === 'eigenverantwortung') warnings.push(…)`) einfügen:

```ts
  // Kasko-WB Phase 1: Bindungsstatus sichtbar machen (Scan: der Dispatcher sah den Grund nie).
  const kaskoTarif = [str(lead.eigene_versicherung_name), str(lead.eigene_kasko_tarif_name)].filter(Boolean).join(' · ')
  const istKasko = values.schuldfrage === 'eigenverantwortung' && str(lead.eigene_versicherung) === 'ja'
  if (istKasko && lead.freie_werkstattwahl === false)
    warnings.push(`Kasko mit Werkstattbindung${kaskoTarif ? ` (${kaskoTarif})` : ''} — keine Werkstatt-Vermittlung, der Versicherer benennt die Werkstatt.`)
  if (istKasko && lead.freie_werkstattwahl == null)
    warnings.push(`Kasko — Werkstattbindung noch nicht geklärt${kaskoTarif ? ` (${kaskoTarif})` : ''}. Bitte Tarif erfassen oder mit dem Kunden klären.`)
```

- [ ] **Step 2: Grund-Badge** — direkt unter dem Block `{manuellDisqualifiziert && (…)}` einfügen:

```tsx
      {lead.disqualifiziert === true && str(lead.disqualifiziert_grund_key) && (
        <div className="rounded-ios-lg bg-warning-soft border border-warning/30 px-3 py-2 text-sm text-warning-strong">
          Disqualifiziert: {lead.disqualifiziert_grund_key === 'werkstattbindung' ? 'Kasko mit Werkstattbindung' : lead.disqualifiziert_grund_key === 'eigenverschulden' ? 'Eigenverschulden' : String(lead.disqualifiziert_grund_key)}
        </div>
      )}
```

- [ ] **Step 3: Gates + Commit** — `./node_modules/.bin/tsc --noEmit && node scripts/check-token-audit.mjs` → grün.

```bash
git add "src/app/dispatch/leads/[id]/DispatchGatesPanel.tsx"
git commit -m "feat(kasko-wb): Dispatch zeigt Werkstattbindungs-Status (gebunden/unklar) und den Disqualifikationsgrund

Audit:
- Build: tsc, token-audit gruen
- UI: DispatchGatesPanel (Lead-Detail)
- Redundanz: keine
- Dead-Code: nichts
- Spec: §7
- Inkonsistenz: Status-Tokens warning-soft/warning-strong
- Regression: bestehende Warnungen unveraendert

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 17: Dispatch — Rich-Feld „Eigene Kasko: Versicherer & Tarif" mit Override

**Files:**
- Create: `src/app/dispatch/leads/[id]/_v2/DispatchKaskoTarifField.tsx`
- Modify: `src/app/dispatch/leads/[id]/_v2/dispatch-field-override-keys.ts`, `_v2/dispatch-field-overrides.tsx`, `_actions/stammdaten.ts` (Allowlist)

**Interfaces:**
- `onboarding_felder`-Zeile `eigene_kasko_tarif` (Task 5) → Override rendert `DispatchKaskoTarifField`.
- Schreibt via `saveStammdaten(leadId, {...})`: `eigene_versicherung_marke_id`, `eigene_versicherung_name`, `eigene_kasko_tarif_id`, `eigene_kasko_tarif_name`, `freie_werkstattwahl`, `werkstattbindung_quelle: 'dispatcher'`.

- [ ] **Step 1: Allowlist** — in `_actions/stammdaten.ts` in `STAMMDATEN_ALLOWED_FIELDS` ergänzen:

```ts
  // Kasko-WB Phase 1: Dispatcher-Override von Versicherer/Tarif/Bindung (DispatchKaskoTarifField)
  'eigene_versicherung_marke_id', 'eigene_versicherung_name', 'eigene_kasko_tarif_id', 'eigene_kasko_tarif_name',
  'freie_werkstattwahl', 'werkstattbindung_quelle',
```

- [ ] **Step 2: Key registrieren** — in `dispatch-field-override-keys.ts` das Array um `'eigene_kasko_tarif',` ergänzen (Kommentar: `// Kasko-WB Phase 1: Versicherer/Tarif/Bindung als Rich-Feld`).

- [ ] **Step 3: Feld-Komponente**

```tsx
'use client'

// Kasko-WB Phase 1 (Spec §7): Dispatcher sieht und korrigiert Versicherer, Tarif und Bindung. Jede Aenderung
// schreibt werkstattbindung_quelle='dispatcher' — der manuelle Eingriff bleibt nachvollziehbar.

import { useEffect, useMemo, useState } from 'react'
import { VersichererSelect } from '@/components/shared/VersichererSelect'
import type { OnboardingFeld } from '@/components/onboarding/types'
import { ladeKaskoMarken, ladeKaskoTarife } from '@/lib/kasko-wb/actions'
import type { KaskoMarke, KaskoTarif } from '@/lib/kasko-wb/types'
import { saveStammdaten } from '../_actions/stammdaten'
import { OverrideFieldShell, type OverrideSaveStatus } from './OverrideFieldShell'

type Bindung = 'frei' | 'gebunden' | 'unbekannt'

export function DispatchKaskoTarifField({ feld, leadId, lead }: { feld: OnboardingFeld; leadId: string; lead: Record<string, unknown> }) {
  const [status, setStatus] = useState<OverrideSaveStatus>('idle')
  const [marken, setMarken] = useState<KaskoMarke[]>([])
  const [tarife, setTarife] = useState<KaskoTarif[]>([])
  const [markeId, setMarkeId] = useState<string | null>((lead.eigene_versicherung_marke_id as string | null) ?? null)
  const [tarifId, setTarifId] = useState<string | null>((lead.eigene_kasko_tarif_id as string | null) ?? null)
  const initialBindung: Bindung = lead.freie_werkstattwahl === true ? 'frei' : lead.freie_werkstattwahl === false ? 'gebunden' : 'unbekannt'
  const [bindung, setBindung] = useState<Bindung>(initialBindung)

  useEffect(() => {
    ladeKaskoMarken().then((r) => r.ok && setMarken(r.marken))
  }, [])
  useEffect(() => {
    if (!markeId) {
      setTarife([])
      return
    }
    ladeKaskoTarife(markeId).then((r) => setTarife(r.ok ? r.tarife : []))
  }, [markeId])

  const marke = useMemo(() => marken.find((m) => m.id === markeId) ?? null, [marken, markeId])

  async function persist(next: { markeId: string | null; tarifId: string | null; bindung: Bindung }) {
    setStatus('saving')
    const m = marken.find((x) => x.id === next.markeId) ?? null
    const t = tarife.find((x) => x.id === next.tarifId) ?? null
    const r = await saveStammdaten(leadId, {
      eigene_versicherung_marke_id: next.markeId,
      eigene_versicherung_name: m?.marke ?? ((lead.eigene_versicherung_name as string | null) ?? null),
      eigene_kasko_tarif_id: next.tarifId,
      eigene_kasko_tarif_name: t?.anzeigename ?? null,
      freie_werkstattwahl: next.bindung === 'frei' ? true : next.bindung === 'gebunden' ? false : null,
      werkstattbindung_quelle: 'dispatcher',
    })
    setStatus(r.success ? 'saved' : 'error')
  }

  function waehleTarif(id: string | null) {
    const t = tarife.find((x) => x.id === id) ?? null
    // Tarifwahl setzt die Bindung automatisch (Dispatcher kann sie darunter uebersteuern).
    const b: Bindung = t ? (t.hatWerkstattbindung && t.bindungsumfang !== 'nur_glas' ? 'gebunden' : 'frei') : bindung
    setTarifId(id)
    setBindung(b)
    void persist({ markeId, tarifId: id, bindung: b })
  }

  const radio = 'flex items-center gap-2 text-sm text-claimondo-navy'

  return (
    <OverrideFieldShell feld={feld} status={status}>
      <div className="flex flex-col gap-2 px-[22px]">
        <VersichererSelect
          value={markeId}
          onChange={(id) => {
            setMarkeId(id)
            setTarifId(null)
            void persist({ markeId: id, tarifId: null, bindung })
          }}
          versicherer={marken.map((m) => ({ id: m.id, name: m.marke }))}
          placeholder="Versicherer (Marke) wählen …"
          ariaLabel="Eigene Kaskoversicherung"
        />
        {marke && tarife.length > 0 && (
          <select
            value={tarifId ?? ''}
            onChange={(e) => waehleTarif(e.target.value || null)}
            className="rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy"
            aria-label="Kasko-Tarif"
          >
            <option value="">Tarif wählen …</option>
            {tarife.map((t) => (
              <option key={t.id} value={t.id}>
                {t.anzeigename} — {t.hatWerkstattbindung ? (t.bindungsumfang === 'nur_glas' ? 'Bindung nur Glas' : 'Werkstattbindung') : 'freie Wahl'}
              </option>
            ))}
          </select>
        )}
        <fieldset className="flex flex-wrap gap-4">
          <legend className="sr-only">Werkstattbindung</legend>
          {(['frei', 'gebunden', 'unbekannt'] as Bindung[]).map((b) => (
            <label key={b} className={radio}>
              <input
                type="radio"
                name={`bindung-${leadId}`}
                checked={bindung === b}
                onChange={() => {
                  setBindung(b)
                  void persist({ markeId, tarifId, bindung: b })
                }}
              />
              {b === 'frei' ? 'freie Werkstattwahl' : b === 'gebunden' ? 'Werkstattbindung' : 'unbekannt'}
            </label>
          ))}
        </fieldset>
        {marke?.wbMarker.length ? (
          <p className="text-caption text-claimondo-navy/60">Marker im Tarifnamen: {marke.wbMarker.map((m) => `„${m}“`).join(', ')}</p>
        ) : null}
      </div>
    </OverrideFieldShell>
  )
}
```

- [ ] **Step 4: Override verdrahten** — in `dispatch-field-overrides.tsx` Import `import { DispatchKaskoTarifField } from './DispatchKaskoTarifField'` und in `OVERRIDES` ergänzen:

```tsx
  // Kasko-WB Phase 1: Versicherer/Tarif/Bindung als Rich-Feld (nur bei schuldfrage=eigenverantwortung, siehe onboarding_felder).
  eigene_kasko_tarif: (feld, ctx) => <DispatchKaskoTarifField feld={feld} leadId={ctx.leadId} lead={ctx.lead} />,
```

- [ ] **Step 5: Gates + Smoke** — `./node_modules/.bin/tsc --noEmit && node scripts/check-component-set.mjs` (das `<select>`/Radio sind Formularelemente, kein Ratchet-Ziel). Lokal: Dispatch-Lead mit `schuldfrage=eigenverantwortung` öffnen → Feld sichtbar unter „Schuldfrage"; Marke HUK-COBURG, Tarif „Classic SELECT" → Radio springt auf „Werkstattbindung", Status „gespeichert ✓"; DB: `werkstattbindung_quelle='dispatcher'`, `freie_werkstattwahl=false`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/dispatch/leads/[id]/_v2/DispatchKaskoTarifField.tsx" "src/app/dispatch/leads/[id]/_v2/dispatch-field-override-keys.ts" "src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.tsx" "src/app/dispatch/leads/[id]/_actions/stammdaten.ts"
git commit -m "feat(kasko-wb): Dispatcher-Feld fuer Versicherer, Tarif und Bindung (Override, quelle=dispatcher)

Audit:
- Build: tsc, component-set gruen; lokaler Smoke
- UI: Lead-Detail, Sektion Schuldfrage, nur bei Eigenverschulden (onboarding_felder-Zeile aus Mig 3)
- Redundanz: VersichererSelect + Override-Muster (DispatchVersichererField)
- Dead-Code: nichts
- Spec: §7
- Inkonsistenz: Allowlist erweitert, Umlaute
- Regression: uebrige Overrides unveraendert (Record-Typ erzwingt Vollstaendigkeit)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 18: Admin — Read-only Liste der Wissensbasis

**Files:**
- Create: `src/app/admin/einstellungen/kasko-tarife/page.tsx`, `src/app/admin/einstellungen/kasko-tarife/KaskoTarifeTable.tsx`

**Interfaces:**
- Route `/admin/einstellungen/kasko-tarife`, admin-gated wie `anspruch-saetze/page.tsx`. Verlinkung: in der Einstellungs-Übersicht (`src/app/admin/einstellungen/page.tsx`, dort wo `anspruch-saetze` verlinkt ist) einen Eintrag „Kasko-Tarife (Werkstattbindung)" ergänzen — Muster des Nachbar-Links kopieren.

- [ ] **Step 1: Page**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KaskoTarifeTable, { type KaskoTarifeZeile } from './KaskoTarifeTable'

// Kasko-WB Phase 1 (Aaron E5): nur Liste, keine Pflege — die Wissensbasis wird per Seed-Generator aktualisiert.
export const dynamic = 'force-dynamic'

export default async function KaskoTarifePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const { data } = await supabase
    .from('kasko_versicherer_marken')
    .select('id, marke, slug, wb_status, wb_marker, hinweis, stand, versicherung_id, kasko_tarife(hat_werkstattbindung)')
    .order('marke')

  const zeilen: KaskoTarifeZeile[] = ((data ?? []) as unknown as {
    id: string; marke: string; slug: string; wb_status: string; wb_marker: string[] | null; hinweis: string | null
    stand: string; versicherung_id: string | null; kasko_tarife: { hat_werkstattbindung: boolean }[] | null
  }[]).map((m) => ({
    id: m.id,
    marke: m.marke,
    slug: m.slug,
    wbStatus: m.wb_status,
    marker: m.wb_marker ?? [],
    hinweis: m.hinweis,
    stand: m.stand,
    rechtstraegerVerknuepft: m.versicherung_id != null,
    tarifeFrei: (m.kasko_tarife ?? []).filter((t) => !t.hat_werkstattbindung).length,
    tarifeGebunden: (m.kasko_tarife ?? []).filter((t) => t.hat_werkstattbindung).length,
  }))

  return <KaskoTarifeTable zeilen={zeilen} />
}
```

- [ ] **Step 2: Tabelle** (Tabellen-Set aus `@/components/shared/DataTable`; bei abweichenden Export-Namen die Datei `src/components/shared/DataTable.tsx` öffnen und die dort exportierten Namen verwenden)

```tsx
'use client'

import { Badge } from '@/components/primitives'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

export type KaskoTarifeZeile = {
  id: string
  marke: string
  slug: string
  wbStatus: string
  marker: string[]
  hinweis: string | null
  stand: string
  rechtstraegerVerknuepft: boolean
  tarifeFrei: number
  tarifeGebunden: number
}

function StatusBadge({ s }: { s: string }) {
  if (s === 'keine') return <Badge tone="success" size="sm">keine Bindung</Badge>
  if (s === 'standard') return <Badge tone="warning" size="sm">immer gebunden</Badge>
  return <Badge tone="info" size="sm">optional</Badge>
}

export default function KaskoTarifeTable({ zeilen }: { zeilen: KaskoTarifeZeile[] }) {
  return (
    <div className="p-6">
      <PageHeader
        title="Kasko-Tarife · Werkstattbindung"
        description={`${zeilen.length} Versicherer-Marken (CHECK24-Tarifliste). Pflege über scripts/kasko-wb/ (Seed-Generator), nicht hier.`}
      />
      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Marke</Th><Th>Status</Th><Th>Marker im Tarifnamen</Th><Th>Tarife frei / gebunden</Th><Th>Rechtsträger</Th><Th>Stand</Th>
            </Tr>
          </Thead>
          <Tbody>
            {zeilen.map((z) => (
              <Tr key={z.id}>
                <Td>
                  <span className="font-semibold text-claimondo-navy">{z.marke}</span>
                  {z.hinweis && <span className="block text-caption text-warning-strong">{z.hinweis}</span>}
                </Td>
                <Td><StatusBadge s={z.wbStatus} /></Td>
                <Td>{z.marker.map((m) => `„${m}“`).join(', ') || '–'}</Td>
                <Td>{z.tarifeFrei} / {z.tarifeGebunden}</Td>
                <Td>{z.rechtstraegerVerknuepft ? 'verknüpft' : <span className="text-warning-strong">fehlt</span>}</Td>
                <Td>{z.stand}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
```

- [ ] **Step 3: Gates + Commit** — `./node_modules/.bin/tsc --noEmit && node scripts/check-component-set.mjs` → grün; `/admin/einstellungen/kasko-tarife` lokal als Admin öffnen: 72 Zeilen, HUK-COBURG „optional", Marker „SELECT", 3 / 3.

```bash
git add src/app/admin/einstellungen/kasko-tarife src/app/admin/einstellungen/page.tsx
git commit -m "feat(kasko-wb): Admin-Liste der Werkstattbindungs-Wissensbasis (read-only, E5)

Audit:
- Build: tsc, component-set gruen
- UI: /admin/einstellungen/kasko-tarife + Link in der Einstellungs-Uebersicht
- Redundanz: DataTable/PageHeader/Badge aus dem Komponenten-Set
- Dead-Code: nichts
- Spec: §7, E5
- Inkonsistenz: Umlaute, Tokens
- Regression: n/a

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG"
```

---

### Task 19: Verifikation, PR gegen `staging`, Regel-4-Smoke, Nachlese

**Files:** keine neuen Quelldateien; `docs/superpowers/specs/2026-09-04-werkstattbindung-kasko-tarife-design.md` (Status), Memory-Marker.

- [ ] **Step 1: Volle Gates**

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
npm run build
node scripts/check-use-server-exports.mjs && node scripts/check-server-actions.mjs
node scripts/check-component-set.mjs -- --ratchet && node scripts/check-token-audit.mjs && node scripts/check-knip.mjs -- --ratchet
node --env-file=.env.local scripts/check-query-drift.mjs -- --ratchet && node --env-file=.env.local scripts/check-query-parse.mjs -- --ratchet
node --env-file=.env.local scripts/check-claims-column-grants.mjs && node --env-file=.env.local scripts/check-migration-files.mjs
node scripts/check-i18n.mjs 2>/dev/null || npm run check:i18n
```
Expected: alles grün; `next build` Ausgabe nach „error" greppen (`npm run build 2>&1 | grep -ci "error"` → 0; der Exit-Code allein reicht nicht, siehe Memory „Wrapper-exit maskiert den echten exit").

- [ ] **Step 2: Session-Abschluss-Checkliste (AGENTS.md Regel 3)**

```bash
git status && git stash list && git log --branches --not --remotes --oneline
```
Expected: clean, kein Stash, alle Commits werden gleich gepusht.

- [ ] **Step 3: Push + PR gegen `staging`** (Body via `--body-file`, Backticks im Body sind sonst Shell-Ausführung)

```bash
git push -u origin kitta/werkstattbindung-kasko-tarife
cat > /tmp/pr-body.md <<'EOF'
## Werkstattbindung in Kasko-Tarifen — Phase 1

Wissensbasis (72 Marken, CHECK24 20.07.2026) in der DB; Kunde wählt im Kasko-Fall Versicherer + Tarif; `freie_werkstattwahl` wird abgeleitet (mit Herkunft); gebunden = ehrliche Endseite + Mail, keine Vermittlung; unklar = durchlassen + Dispatch-Task; Embed-Finder, Kunde-Portal und QR-Trigger fragen/respektieren die Bindung; Dispatch sieht Tarif, Status und Grund; Admin-Liste.

Spec: `docs/superpowers/specs/2026-09-04-werkstattbindung-kasko-tarife-design.md` · Scan: `docs/2026-09-03-werkstattbindung-kasko-tarife-scan.md` · Plan: `docs/superpowers/plans/2026-09-04-werkstattbindung-kasko-tarife-phase1.md`

### Migrationen (Regel 2, appliziert + getrackt)
1. Wissensbasis-Tabellen (RLS anon-read) · 2. Seed (idempotent, ohne UUIDs) · 3. Lead/Claim-Felder (gegrantet), QR-Trigger `IS NULL`, Step-Bedingung, Dispatcher-Feld

### Regel-4-Smoke (staging, nach Deploy)
- [ ] FlowLink Kasko → HUK-COBURG → „Classic SELECT" → Endseite mit Hotline + Rückruf; Mail kommt an
- [ ] FlowLink Kasko → „Classic" → Werkstatt-Strecke
- [ ] FlowLink Kasko → „weiß nicht" → Hinweis, Werkstatt-Strecke, Dispatch-Task „Kasko: Werkstattbindung klären"
- [ ] Re-Visit des Links nach Bindung → Bindungs-Endseite (nicht Gutachter-Text)
- [ ] Embed-Werkstatt-Finder Kasko gebunden → keine Werkstatt, Lead disqualifiziert (grund werkstattbindung)
- [ ] Kunde-Portal Kasko-Claim → Tarif-Card statt Finder; nach Bindung → Bindungs-Card
- [ ] Dispatch: Badge + Feld; Override auf „frei" macht die Vermittlung wieder möglich
- [ ] Admin `/admin/einstellungen/kasko-tarife`: 72 Zeilen

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01639P4PEAjWuDGmsXV4bBrG
EOF
gh pr create --base staging --title "feat(kasko-wb): Werkstattbindung in Kasko-Tarifen — Phase 1 (Wissensbasis, FlowLink, Umgehungen, Dispatch)" --body-file /tmp/pr-body.md
```

- [ ] **Step 4: Regel-4-Smoke auf staging** nach dem Deploy per UI durchführen (Checkliste im PR abhaken; Test-Accounts siehe Memory `reference-internal-test-account-logins`, Smoke-Leads mit `.invalid`-Domain). Befunde als Kommentar im PR.

- [ ] **Step 5: Nachlese** — Spec-Status auf „Phase 1 gemergt (PR #…)" setzen; Memory `COORDINATION-werkstattbindung-kasko-tarife-lane.md` aktualisieren (Stand, PR, offene Phase 2/3); MEMORY.md-Zeiger anpassen.

---

## Folgepläne (nicht Teil dieses Plans)

- **Phase 2 — Anspruchsprüfung:** `/check` Tier `kasko` → Folgefragen Versicherer/Tarif (Marketing-Build liest die drei Tabellen per Supabase-Client), Tier-Split `kasko_frei | kasko_gebunden | kasko`; Befund 4 (`selbst → eigenverantwortung` in `convert_anfrage_zu_lead`, Regel 2); `auswertung_unverbindlich.antworten` um Tarif/WB; API `pruefe-anspruch` Parameter `werkstattbindung`; neue Lookup-Route `GET /api/v1/kasko-werkstattbindung`; Foto-Tool-Hinweis bei `selbst`.
- **Phase 3 — Marketing/GEO:** Ratgeber „Werkstattbindung: Darf meine Versicherung die Werkstatt vorschreiben?", öffentliches Tarif-Check-Tool, 173 Stadtseiten + `llms.txt` mit Kasko-Vorbehalt, Versicherer-Seiten (`werkstattnetz` → Tarifdaten), autounfall-io `/werkstattwahl-recht`-FAQ korrigieren, Kölner Cluster-Absatz auf die anderen vier LPs.
- **Später:** i18n der neuen Flow-Texte (6 Sprachen), Admin-Bearbeitung der Tarife, OCR des Versicherungsscheins (`versicherungsschein_eigener`) → `werkstattbindung_quelle='dokument'`.

---
## Appendix A — `scripts/kasko-wb/wissensbasis-2026-07-20.json`

Vollständiger Dateiinhalt (Task 2). Schreibweisen exakt aus der CHECK24-Liste (Tabelle A der Quelle), Konditionen aus Tabelle B, Sanktionsmodelle aus Tabelle 4. `versicherung_name` = exakter `versicherungen.name` auf prod (Abgleich Scan §8); `null` = kein Rechtsträger in den Stammdaten.

```json
{
  "quelle": "CHECK24 Kfz-Versicherungstarife, Stand 20.07.2026 (71 Marken) + HDI (Broschüre); Auswertung 03.09.2026",
  "stand": "2026-07-20",
  "default_konditionen": {
    "nachlass_text": "marktüblich 10–20 % auf den Kaskobeitrag",
    "sanktion_modell": "kuerzung_80",
    "sanktion_text": "Bis zur Reparatur in der vom Versicherer benannten Werkstatt wird die Erstattung auf 80 % der marktüblich kalkulierten Reparaturkosten begrenzt, mindestens mit einer zusätzlichen Selbstbeteiligung von 100 € (GDV-Muster-AKB A.2.5.2.5.2).",
    "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas",
    "ausnahmen_text": "Haftpflichtschaden Dritter · Totalschaden · Reparatur im Ausland · keine erreichbare Partnerwerkstatt",
    "partnernetz": "jeweiliges Partnernetz (häufig Innovation Group, HUK-Netz, DEKRA)",
    "akb_fundstelle": "GDV-Muster-AKB A.2.5.2.5.1 / A.2.5.2.5.2",
    "quelle": "GDV-Muster-AKB; CHECK24"
  },
  "marken": [
    { "slug": "adac-autoversicherung", "marke": "ADAC Autoversicherung", "versicherung_name": "ADAC Autoversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbonus" }], "wb_marker": ["mit Werkstattbonus"], "nicht_wb_marker": ["(Mitglieder)"], "linien": ["Basis", "Komfort", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Der Zusatz „(Mitglieder)“ ändert nichts an der Werkstattwahl.", "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "20 %", "sanktion_modell": "kuerzung_unbestimmt", "sanktion_text": "Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter · für Leasing und Neuwagen nicht empfohlen", "partnernetz": "zertifizierte Partnerwerkstätten; Ersatzfahrzeug max. 7 Tage", "akb_fundstelle": null, "quelle": "adac.de (Magazin Werkstattbindung)" } },
    { "slug": "admiraldirekt", "marke": "AdmiralDirekt", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbonus" }], "wb_marker": ["mit Werkstattbonus"], "nicht_wb_marker": ["CHECK24-Sonderrabatt", "Junge Fahrer", "mit Vorkasse"], "linien": ["Basis", "Komfort", "Komfort smart", "Premium", "Premium smart"], "linien_ohne_wb": ["Basis mit Vorkasse"], "linien_nur_wb": [], "hinweis": "Vertriebsmarke (Risikoträger Itzehoer); kein eigener Rechtsträger in den Stammdaten.", "varianten_hinweis": "Zusätze wie „CHECK24-Sonderrabatt“ oder „Junge Fahrer“ ändern nichts an der Werkstattwahl.", "check24_vertrieb": "P", "konditionen": null },
    { "slug": "aig-europe", "marke": "AIG Europe", "versicherung_name": "Chartis Europe S.A.", "wb_status": "keine", "wb_zusaetze": [], "wb_marker": [], "nicht_wb_marker": [], "linien": [], "linien_ohne_wb": ["AIG Europe (Einzeltarif)"], "linien_nur_wb": [], "hinweis": "Kein Werkstattbindungs-Tarif im Angebot. Rechtsträger in den Stammdaten unter dem Altnamen Chartis Europe S.A.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "allianz", "marke": "Allianz", "versicherung_name": "Allianz Versicherungs-AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "WerkstattBonus" }], "wb_marker": ["WerkstattBonus"], "nicht_wb_marker": [], "linien": ["Komfort", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L",
      "konditionen": { "nachlass_text": "20 %", "sanktion_modell": "kuerzung_80", "sanktion_text": "Kürzung der Erstattung auf 80 % bei Reparatur außerhalb des Partnernetzes.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas (Voraussetzung TK oder VK)", "ausnahmen_text": "Haftpflichtschaden Dritter · Ausland", "partnernetz": "TÜV-/DEKRA-zertifizierte Allianz-Partnerwerkstätten; Glas: Carglass, Euromaster, junited, Wintec; Hol-/Bringservice, Reinigung, Ersatzwagen", "akb_fundstelle": "Allianz-AKB WerkstattBonus", "quelle": "allianz.de/auto/kfz-versicherung/werkstattbindung" } },
    { "slug": "allianz-direct", "marke": "Allianz Direct", "versicherung_name": "Allianz Direct", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": ["Vorkasse"], "linien": ["DIRECT", "DIRECT Plus"], "linien_ohne_wb": ["DIRECT Vorkasse"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "kuerzung_unbestimmt", "sanktion_text": "Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "Allianz-Netz", "akb_fundstelle": null, "quelle": "CHECK24" } },
    { "slug": "alte-leipziger", "marke": "Alte Leipziger", "versicherung_name": "Alte Leipziger Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Classic", "Comfort"], "linien_ohne_wb": ["Compact"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "autosan", "marke": "Autosan", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["Serie", "Komfort"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "avd", "marke": "AvD", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": ["(Mitglieder)"], "linien": ["Komfort", "Plus", "Select"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "„Select“ ist bei AvD ein Linienname, kein Werkstattbindungs-Marker (anders als bei HUK).", "varianten_hinweis": "Der Zusatz „(Mitglieder)“ ändert nichts an der Werkstattwahl.", "check24_vertrieb": "P", "konditionen": null },
    { "slug": "axa", "marke": "AXA", "versicherung_name": "AXA Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": ["mit Extraschutz"], "linien": ["easy mobil online S", "easy mobil online S Plus", "easy mobil online M", "easy mobil online L"], "linien_ohne_wb": ["easy mobil online", "easy mobil online mit Extraschutz"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "„attraktiver Nachlass“ (Höhe nicht belegt)", "sanktion_modell": "kuerzung_80", "sanktion_text": "Karosserie/Lack: Kürzung auf 80 %; Glas: zusätzliche Selbstbeteiligung von 300 €.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "ca. 3.000 DEKRA-geprüfte Partner; Glas über Innovation Group, riparo", "akb_fundstelle": "AXA-AKB Werkstattservice", "quelle": "axa.de; jdcnews.de" } },
    { "slug": "barmenia-direkt", "marke": "Barmenia Direkt", "versicherung_name": "Barmenia Allgemeine Versicherungs-AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Basis-Schutz", "Top-Schutz", "Premium-Schutz", "Premium Plus-Schutz"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "barmeniagothaer", "marke": "BarmeniaGothaer", "versicherung_name": "Gothaer Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Privat", "Privat Top-Schutz", "Privat Premium-Schutz"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Zweiter Rechtsträger: Barmenia Allgemeine Versicherungs-AG.", "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "kuerzung_unbestimmt", "sanktion_text": "Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "„Die Partnerwerkstatt“ (HUK-Netz)", "akb_fundstelle": null, "quelle": "CHECK24; handwerk-magazin.de" } },
    { "slug": "bavariadirekt", "marke": "BavariaDirekt", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": ["Elektro Paket", "Youngtimer", "Vorkasse"], "linien": ["Komfort S online", "Komfort M online", "Komfort M Plus online", "Komfort L online"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Zusätze „Elektro Paket“, „Youngtimer“ oder „Vorkasse“ ändern nichts an der Werkstattwahl.", "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "kuerzung_80", "sanktion_text": "Kürzung auf 80 %, mindestens 100 € zusätzliche Selbstbeteiligung (AKB Stand 30.09.2015); bei fiktiver Abrechnung laut LG Hildesheim 3 S 12/20 unwirksam.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "Partnernetz", "akb_fundstelle": "A.2.5.2.5.1 / A.2.5.2.5.2", "quelle": "bavariadirekt.de (AKB-PDF); von-boehn.de" } },
    { "slug": "bavariaprotect", "marke": "BavariaProtect", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": ["Elektro Paket"], "linien": ["Komfort S online", "Komfort M online", "Komfort M Plus online", "Komfort L online"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Der Zusatz „Elektro Paket“ ändert nichts an der Werkstattwahl.", "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "kuerzung_80", "sanktion_text": "Kürzung auf 80 %, mindestens 100 € zusätzliche Selbstbeteiligung (AKB-Systematik BavariaDirekt).", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "Partnernetz", "akb_fundstelle": "A.2.5.2.5.1 / A.2.5.2.5.2", "quelle": "bavariadirekt.de (AKB-PDF)" } },
    { "slug": "bgv", "marke": "BGV / Badische Versicherungen", "versicherung_name": "Badischer Gemeinde-Versicherungs-Verband", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Schadenservice Plus" }], "wb_marker": ["mit Schadenservice Plus"], "nicht_wb_marker": ["Elektro Plus"], "linien": ["Basis", "Klassik", "Exklusiv"], "linien_ohne_wb": [], "linien_nur_wb": [], "verlaesslichkeit_default": "abgeleitet", "hinweis": "Bindungscharakter aus der Bezeichnung abgeleitet – AKB prüfen. Zweiter Rechtsträger: Badische Allgemeine Versicherung AG.", "varianten_hinweis": "Der Zusatz „Elektro Plus“ ändert nichts an der Werkstattwahl.", "check24_vertrieb": "P", "konditionen": null },
    { "slug": "concordia", "marke": "Concordia", "versicherung_name": "Concordia Versicherungs-Gesellschaft a.G.", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Partner" }], "wb_marker": ["Partner"], "nicht_wb_marker": ["VollkaskoPlus", "oecodrive"], "linien": ["Premium", "Premium VollkaskoPlus"], "linien_ohne_wb": ["Classic", "Premium oecodrive", "Premium VollkaskoPlus oecodrive"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "cosmosdirekt", "marke": "CosmosDirekt", "versicherung_name": "Cosmos Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": ["inkl. Verkehrsrechtsschutz"], "linien": ["Basis", "Comfort"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Basis: frühere Recherche nannte die Werkstattbindung im Basis als Pflicht; CHECK24 listet Basis auch ohne – AKB prüfen.", "varianten_hinweis": "Der Zusatz „inkl. Verkehrsrechtsschutz“ ändert nichts an der Werkstattwahl.", "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "deckelung", "sanktion_text": "Erstattung nur bis zur Höhe der Kosten, die in der Partnerwerkstatt angefallen wären.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "DEKRA-Netz (Generali/Cosmos)", "akb_fundstelle": null, "quelle": "cosmosdirekt.de; CHECK24" } },
    { "slug": "da-direkt", "marke": "DA Direkt", "versicherung_name": "DA Deutsche Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["Basis", "Komfort Smart", "Komfort", "Premium"], "linien_ohne_wb": ["Komfort Plus"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "dbv", "marke": "DBV", "versicherung_name": "DBV Deutsche Beamten-Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["mobil kompakt Online", "mobil komfort Online", "mobil komfort Premium Online"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "AXA-Gruppe (Systematik wie AXA Werkstattservice).", "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "„attraktiver Nachlass“ (Höhe nicht belegt)", "sanktion_modell": "kuerzung_80", "sanktion_text": "Karosserie/Lack: Kürzung auf 80 %; Glas: zusätzliche Selbstbeteiligung von 300 € (AXA-Systematik).", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "ca. 3.000 DEKRA-geprüfte Partner; Glas über Innovation Group, riparo", "akb_fundstelle": "AXA-AKB Werkstattservice", "quelle": "axa.de; jdcnews.de" } },
    { "slug": "debeka", "marke": "Debeka", "versicherung_name": "Debeka Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Unfallreparatur-Service" }], "wb_marker": ["mit Unfallreparatur-Service"], "nicht_wb_marker": [], "linien": ["Comfort", "Comfort Plus"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "kuerzung_unbestimmt", "sanktion_text": "Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "„Die Partnerwerkstatt“ (HUK-Netz)", "akb_fundstelle": null, "quelle": "CHECK24; handwerk-magazin.de" } },
    { "slug": "devk", "marke": "DEVK", "versicherung_name": "DEVK Allgemeine Versicherungs-AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Kasko-Mobil" }], "wb_marker": ["Kasko-Mobil"], "nicht_wb_marker": ["ACV Mitglieder", "Vorkasse"], "linien": ["Basis-Schutz", "Komfort-Schutz", "Premium-Schutz", "DEVK Eisenbahn Basis", "DEVK Eisenbahn Komfort", "DEVK Eisenbahn Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Zusätze „ACV Mitglieder“ oder „Vorkasse“ ändern nichts an der Werkstattwahl.", "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "bis 20 % (Werbung; Website laut Recherche „bis 13 %“ – Stand prüfen)", "sanktion_modell": "kuerzung_85", "sanktion_text": "Kürzung um 15 %, mindestens 300 € zusätzliche Selbstbeteiligung.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter · bestimmte Hersteller-/Leasingfahrzeuge ausgeschlossen", "partnernetz": "über 4.000 Partnerbetriebe (ca. 70 % markengebunden); Glas: A.T.U., Carglass, junited, Wintec, Nobleglass; Hol-/Bringservice, Ersatzfahrzeug", "akb_fundstelle": "DEVK-AKB Kasko-Mobil", "quelle": "devk.de; sdrive-gutachter.de" } },
    { "slug": "dialog", "marke": "Dialog", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "WerkstattservicePLUS" }], "wb_marker": ["WerkstattservicePLUS"], "nicht_wb_marker": ["VollkaskoPLUS"], "linien": ["Premium", "Premium VollkaskoPLUS"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Generali-Gruppe; kein eigener Rechtsträger in den Stammdaten.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "die-bayerische", "marke": "Die Bayerische", "versicherung_name": "Bayerische Beamten Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": ["E-Drive"], "linien": ["Smart", "Komfort", "Prestige"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Der Zusatz „E-Drive“ ändert nichts an der Werkstattwahl.", "check24_vertrieb": "P", "konditionen": null },
    { "slug": "die-continentale", "marke": "Die Continentale", "versicherung_name": "Continentale Sachversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Sorglos-Kasko" }], "wb_marker": ["Sorglos-Kasko"], "nicht_wb_marker": [], "linien": ["Basis", "Komfort"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "die-lippische", "marke": "Die Lippische", "versicherung_name": "Lippische Landesbrandversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Werkstattservice" }], "wb_marker": ["Werkstattservice"], "nicht_wb_marker": [], "linien": ["AutoBasis", "AutoPlus"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "ergo", "marke": "ERGO", "versicherung_name": "ERGO Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbonus" }], "wb_marker": ["mit Werkstattbonus"], "nicht_wb_marker": ["Wertschutz24", "Wertschutz36", "ErsatzfahrzeugPlus"], "linien": ["Smart", "Best"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Zusätze „mit Wertschutz24/36“ oder „ErsatzfahrzeugPlus“ ändern nichts an der Werkstattwahl.", "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "10 %", "sanktion_modell": "kuerzung_unbestimmt", "sanktion_text": "Kürzung der Erstattung; der Selbstbeteiligungs-Vorteil entfällt.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "ERGO Premium-Partnerwerkstätten", "akb_fundstelle": null, "quelle": "ergo.de; CHECK24" } },
    { "slug": "europa", "marke": "Europa", "versicherung_name": "EUROPA Sachversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Spar-Kasko" }], "wb_marker": ["Spar-Kasko"], "nicht_wb_marker": [], "linien": ["Basis", "Komfort"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "europa-go", "marke": "EUROPA-go", "versicherung_name": "EUROPA Sachversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Spar-Kasko" }], "wb_marker": ["Spar-Kasko"], "nicht_wb_marker": [], "linien": ["Basis", "Komfort"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Online-Marke der EUROPA.", "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "fahrlehrerversicherung", "marke": "Fahrlehrerversicherung", "versicherung_name": "Fahrlehrerversicherung VaG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["B-Tarif Basis", "B-Tarif Komfort", "B-Tarif Premium", "P-Tarif Basis", "P-Tarif Komfort", "P-Tarif Premium", "X-Tarif Basis", "X-Tarif Komfort", "X-Tarif Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "feuersozietaet", "marke": "Feuersozietät", "versicherung_name": "Feuersozietät Berlin Brandenburg Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Vario", "Vario Kasko-Plus", "Vario Kasko-Plus mit Elektro/Hybrid"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "VKB-Gruppe.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "generali", "marke": "Generali", "versicherung_name": "Generali Deutschland Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["Optimal"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "gvv-direkt", "marke": "GVV Direkt", "versicherung_name": "GVV-Privatversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstatt Direkt" }], "wb_marker": ["mit Werkstatt Direkt"], "nicht_wb_marker": ["Kasko PLUS"], "linien": ["Classic", "Classic Kasko PLUS"], "linien_ohne_wb": ["Basis"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "hansemerkur", "marke": "HanseMerkur", "versicherung_name": "HanseMerkur Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["Drive Easy", "Drive Best"], "linien_ohne_wb": ["Drive Smart"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "helvetia-baloise", "marke": "Helvetia Baloise", "versicherung_name": "Helvetia Schweizerische Versicherungsgesellschaft AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Basis", "All-in"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Zweiter Rechtsträger: Baloise Sachversicherung AG Deutschland.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "huk-coburg", "marke": "HUK-COBURG", "versicherung_name": "HUK-COBURG-Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "SELECT" }], "wb_marker": ["SELECT", "Kasko SELECT"], "nicht_wb_marker": ["Kasko PLUS"], "linien": ["Basis", "Classic", "Classic Kasko PLUS"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Zweiter Rechtsträger: HUK-COBURG Haftpflicht-Unterstützungs-Kasse (öffentlicher Dienst).", "varianten_hinweis": null, "check24_vertrieb": "L",
      "konditionen": { "nachlass_text": "bis 20 %", "sanktion_modell": "vollverweigerung", "sanktion_text": "Altverträge: Kürzung auf 85 %. Verträge ab 2014: Die Erstattung kann vollständig verweigert werden (laut Fachpresse und Anwaltsberichten – am konkreten AKB-Stand prüfen); gilt auch bei fiktiver Abrechnung.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter · Notfall im Ausland", "partnernetz": "„Die Partnerwerkstatt“, über 1.800 Betriebe (DEKRA-geprüft); Glas: Carglass", "akb_fundstelle": "HUK-AKB Kasko SELECT (versionsabhängig)", "quelle": "huk.de; kfz-betrieb (Vogel); Versicherungsbote" } },
    { "slug": "huk24", "marke": "HUK24", "versicherung_name": "HUK24 AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "SELECT" }], "wb_marker": ["SELECT", "Kasko SELECT"], "nicht_wb_marker": ["Kasko PLUS"], "linien": ["Basis", "Classic", "Classic Kasko PLUS"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L",
      "konditionen": { "nachlass_text": "bis 20 %", "sanktion_modell": "vollverweigerung", "sanktion_text": "Altverträge: Kürzung auf 85 %. Verträge ab 2014: Die Erstattung kann vollständig verweigert werden (laut Fachpresse und Anwaltsberichten – am konkreten AKB-Stand prüfen); gilt auch bei fiktiver Abrechnung.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter · Notfall im Ausland", "partnernetz": "„Die Partnerwerkstatt“, über 1.800 Betriebe (DEKRA-geprüft); Glas: Carglass", "akb_fundstelle": "HUK-AKB Kasko SELECT (versionsabhängig)", "quelle": "huk.de; kfz-betrieb (Vogel); Versicherungsbote" } },
    { "slug": "inshared", "marke": "Inshared", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["Kfz-Versicherung", "Kfz-Versicherung mit Auslandsschadenschutz"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Achmea-Gruppe; kein eigener Rechtsträger in den Stammdaten.", "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "itzehoer", "marke": "Itzehoer", "versicherung_name": "Itzehoer Versicherung Brandgilde von 1691 VVaG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbonus" }], "wb_marker": ["mit Werkstattbonus"], "nicht_wb_marker": [], "linien": ["Comfort Drive", "TopDrive"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "janitos", "marke": "Janitos", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstatt-Management" }], "wb_marker": ["mit Werkstatt-Management"], "nicht_wb_marker": [], "linien": ["Compact", "Advanced"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "HDI-Gruppe; kein eigener Rechtsträger in den Stammdaten.", "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "kravag", "marke": "KRAVAG", "versicherung_name": "KRAVAG-ALLGEMEINE Versicherungs-AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice", "umfang": "voll" }, { "zusatz": "Glas", "umfang": "nur_glas", "verlaesslichkeit": "nicht_belegt" }], "wb_marker": ["mit Werkstattservice", "Glas"], "nicht_wb_marker": ["Kasko Spezial", "BleibMobil"], "linien": ["KfzPolice Kompakt", "KfzPolice Kompakt BleibMobil", "KfzPolice Exklusiv", "KfzPolice Exklusiv BleibMobil", "KfzPolice Exklusiv Kasko Spezial"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "„Glas“-Varianten vermutlich reine Glas-Bindung – nicht belegt, AKB prüfen. „Kasko Spezial“ und „BleibMobil“ sind keine Bindungs-Marker.", "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "kuerzung_85", "sanktion_text": "Glas: Kürzung auf 85 % bei Reparatur außerhalb des Netzes; übrige Schäden nicht belegt.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "R+V-Partnernetz (Innovation Group)", "akb_fundstelle": null, "quelle": "CHECK24; autoglaser.de" } },
    { "slug": "lvm", "marke": "LVM", "versicherung_name": "LVM Landwirtschaftlicher Versicherungsverein Münster a.G.", "wb_status": "keine", "wb_zusaetze": [], "wb_marker": [], "nicht_wb_marker": ["mit LVM-SchadenService"], "linien": [], "linien_ohne_wb": ["AutoPlus", "AutoPlus mit LVM-SchadenService"], "linien_nur_wb": [], "hinweis": "„mit LVM-SchadenService“ ist ein Steuerungsangebot, keine belegte vertragliche Bindung; LVM wirbt mit freier Werkstattwahl.", "varianten_hinweis": null, "check24_vertrieb": "L",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "keine", "sanktion_text": "Keine Werkstattbindung. Der LVM-SchadenService ist eine freiwillige Steuerung in eine Partnerwerkstatt (Abholung, Ersatzwagen, Reinigung).", "gilt_fuer": null, "ausnahmen_text": null, "partnernetz": "LVM-Partnerwerkstätten (Steuerungsquote über 25 %, 2021)", "akb_fundstelle": null, "quelle": "lvm.de; schaden.news 06.07.2022" } },
    { "slug": "mannheimer", "marke": "Mannheimer", "versicherung_name": "Mannheimer Versicherung AG", "wb_status": "keine", "wb_zusaetze": [], "wb_marker": [], "nicht_wb_marker": [], "linien": [], "linien_ohne_wb": ["Maximos"], "linien_nur_wb": [], "hinweis": "Kein Werkstattbindungs-Tarif im Angebot.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "mecklenburgische", "marke": "Mecklenburgische", "versicherung_name": "Mecklenburgische Versicherungs-Gesellschaft a.G.", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Partnerkasko" }], "wb_marker": ["mit Partnerkasko"], "nicht_wb_marker": [], "linien": ["Grunddeckung", "Komfortdeckung"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "muenchener-verein", "marke": "Münchener Verein", "versicherung_name": "Münchener Verein Allgemeine Versicherungs-AG", "wb_status": "keine", "wb_zusaetze": [], "wb_marker": [], "nicht_wb_marker": [], "linien": [], "linien_ohne_wb": ["Münchener Verein (Einzeltarif)"], "linien_nur_wb": [], "hinweis": "Kein Werkstattbindungs-Tarif im Angebot.", "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "neodigital", "marke": "Neodigital", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["NEO M", "NEO L", "NEO Select"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "„NEO Select“ ist ein Linienname, kein Werkstattbindungs-Marker. Kein Rechtsträger in den Stammdaten.", "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "oeffentliche-braunschweig", "marke": "Öffentliche Braunschweig", "versicherung_name": "Öffentliche Versicherung Braunschweig", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice Plus" }], "wb_marker": ["mit Werkstattservice Plus"], "nicht_wb_marker": [], "linien": ["Basis", "Komfort", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "oeffentliche-oldenburg", "marke": "Öffentliche Oldenburg", "versicherung_name": "Öffentliche Versicherung Oldenburg", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Komfort", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": ["Basis"], "hinweis": "Basis ist nur als Werkstattbindungs-Variante gelistet.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "oesa", "marke": "ÖSA", "versicherung_name": "Öffentliche Feuerversicherung Sachsen-Anhalt", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Basis", "Komfort", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "prokundo", "marke": "Prokundo", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstatt-Service" }], "wb_marker": ["mit Werkstatt-Service"], "nicht_wb_marker": [], "linien": ["EASY", "COMFORT", "BEST"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Kein Rechtsträger in den Stammdaten.", "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "provinzial", "marke": "Provinzial", "versicherung_name": "Provinzial Rheinland Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["AutoBasis", "AutoPlus", "Provinzial", "Plus-Paket Haftpflicht", "Plus-Paket Kasko", "Plus-Paket Kasko und Haftpflicht"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Zweiter Rechtsträger: Westfälische Provinzial Versicherung AG.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "provinzial-nord", "marke": "Provinzial Nord", "versicherung_name": "Provinzial Nord Brandkasse AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": ["Plus-Paket"], "linien": ["Provinzial Nord"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Zusätze „Plus-Paket Kfz-Haftpflicht/Kasko“ ändern nichts an der Werkstattwahl.", "check24_vertrieb": "L", "konditionen": null },
    { "slug": "r-plus-v", "marke": "R+V", "versicherung_name": "R+V Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": ["Kasko Spezial"], "linien": ["KfzPolice classic", "KfzPolice comfort", "KfzPolice premium", "KfzPolice premium Kasko Spezial"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "„Kasko Spezial“ ist KEIN Bindungs-Marker – existiert mit und ohne Werkstattservice.", "varianten_hinweis": null, "check24_vertrieb": "L",
      "konditionen": { "nachlass_text": null, "sanktion_modell": "kuerzung_85", "sanktion_text": "Glas: Kürzung auf 85 % bei Reparatur außerhalb des Netzes; übrige Schäden nicht belegt.", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "R+V-Partnernetz (Innovation Group)", "akb_fundstelle": null, "quelle": "CHECK24; autoglaser.de" } },
    { "slug": "rheinland", "marke": "RheinLand", "versicherung_name": "Rheinland Versicherungs AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Standard", "Plus", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "rhion-digital", "marke": "rhion.digital", "versicherung_name": "Rheinland Versicherungs AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Standard", "Plus", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Digitalmarke der RheinLand.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "saarland", "marke": "Saarland", "versicherung_name": "Saarland Feuerversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstatt Service" }], "wb_marker": ["mit Werkstatt Service"], "nicht_wb_marker": [], "linien": ["Vario", "Vario Kasko-Plus"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "VKB-Gruppe.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "signal-iduna", "marke": "Signal Iduna", "versicherung_name": "Signal Iduna Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Sorglos Kasko", "umfang": "voll" }, { "zusatz": "Sorglos Kasko Glas", "umfang": "nur_glas" }], "wb_marker": ["Sorglos Kasko", "Sorglos Kasko Glas"], "nicht_wb_marker": [], "linien": ["Basis", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Zwei Stufen: „Sorglos Kasko“ = Vollbindung, „Sorglos Kasko Glas“ = nur Glasschäden (Leasing-Variante).", "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "bis 15 %; Sorglos Kasko Glas bis 5 %", "sanktion_modell": "kuerzung_unbestimmt", "sanktion_text": "Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).", "gilt_fuer": "Sorglos Kasko: Vollkasko und Teilkasko inkl. Glas; Sorglos Kasko Glas: nur Glas", "ausnahmen_text": "Haftpflichtschaden Dritter · für Leasing wird die Glas-Variante angeboten", "partnernetz": "Signal-Iduna-Partnerwerkstätten", "akb_fundstelle": null, "quelle": "signal-iduna.de; asscompact.de" } },
    { "slug": "sparkassen-direkt", "marke": "Sparkassen Direkt", "versicherung_name": "Sparkassen DirektVersicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": ["Mobil", "Vorkasse", "(Sparkassenkunden)"], "linien": ["AutoBasis", "AutoBasis Mobil", "AutoPlusProtect", "AutoPlusProtect Mobil", "AutoPremium", "AutoPremium Mobil"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Vorkasse-Varianten ohne Werkstattbindung.", "varianten_hinweis": "Zusätze „(Sparkassenkunden)“ oder „Vorkasse“ ändern nichts an der Werkstattwahl; „Mobil“ ist der Schutzbrief.", "check24_vertrieb": "P", "konditionen": null },
    { "slug": "sv-sachsen", "marke": "SV Sachsen", "versicherung_name": "Sparkassen-Versicherung Sachsen", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstatt-Management" }], "wb_marker": ["mit Werkstatt-Management"], "nicht_wb_marker": ["KaskoPlus"], "linien": ["Kfz-Versicherung", "Kfz-Versicherung KaskoPlus"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "sv-sparkassenversicherung", "marke": "SV SparkassenVersicherung", "versicherung_name": "SV Sparkassen-Versicherung Holding AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": ["Top-Schutz"], "linien": ["Kfz-Versicherung", "Kfz-Versicherung Top-Schutz"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Stammdaten-Eintrag ist die Holding.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "universa", "marke": "uniVersa", "versicherung_name": "UniVersa Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstatt-Service" }], "wb_marker": ["mit Werkstatt-Service"], "nicht_wb_marker": [], "linien": ["FLEXXdrive"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "versicherungskammer-bayern", "marke": "Versicherungskammer Bayern", "versicherung_name": "Versicherungskammer Bayern", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": ["KaskoPLUS"], "linien": ["Vario", "Vario KaskoPLUS"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "verti", "marke": "Verti", "versicherung_name": "Verti Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Kasko Clever" }], "wb_marker": ["Kasko Clever"], "nicht_wb_marker": ["Nix-Passiert", "Vorkasse"], "linien": ["Basis", "Pur", "Klassik", "Premium", "PlusBONUS"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Zusätze „Nix-Passiert“ oder „Vorkasse“ ändern nichts an der Werkstattwahl.", "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "bis 15 %", "sanktion_modell": "deckelung", "sanktion_text": "Erstattung nur bis zur Höhe der Kosten der nächstgelegenen Partnerwerkstatt.", "gilt_fuer": "Vollkasko und Teilkasko (Glas ohne Hol-/Bringservice)", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "Verti/MAPFRE-Netz", "akb_fundstelle": null, "quelle": "verti.de; CHECK24" } },
    { "slug": "vgh", "marke": "VGH", "versicherung_name": "VGH Landschaftliche Brandkasse Hannover", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Basis", "Komfort", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "vhv", "marke": "VHV", "versicherung_name": "VHV Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Schadenservice PLUS mit Werkstattservice" }], "wb_marker": ["Schadenservice PLUS mit Werkstattservice"], "nicht_wb_marker": ["EXKLUSIV", "mit gesetzlicher Mindestdeckung"], "linien": ["Klassik-Garant 2.0", "Klassik-Garant 2.0 EXKLUSIV"], "linien_ohne_wb": ["Klassik-Garant 2.0 mit gesetzlicher Mindestdeckung"], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "15 %", "sanktion_modell": "unbekannt", "sanktion_text": "Kürzung bei Reparatur außerhalb des Netzes laut AKB (Höhe öffentlich nicht belegt).", "gilt_fuer": "Vollkasko und Teilkasko inkl. Glas", "ausnahmen_text": "Haftpflichtschaden Dritter", "partnernetz": "zertifizierte VHV-Partnerwerkstätten, Reparatur nach Herstellervorgaben; Zuweisung nur über die VHV-Steuerung", "akb_fundstelle": "VHV-AKB Werkstattbindung", "quelle": "vhv.de/auto-versicherung/ratgeber/werkstattbindung" } },
    { "slug": "voedag", "marke": "VÖDAG", "versicherung_name": null, "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Sorglos Kasko", "umfang": "voll" }, { "zusatz": "Sorglos Kasko Glas", "umfang": "nur_glas" }], "wb_marker": ["Sorglos Kasko", "Sorglos Kasko Glas"], "nicht_wb_marker": [], "linien": ["Basis", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Tarifsystematik identisch mit Signal Iduna. Kein Rechtsträger in den Stammdaten.", "varianten_hinweis": null, "check24_vertrieb": "P",
      "konditionen": { "nachlass_text": "bis 15 %; Sorglos Kasko Glas bis 5 %", "sanktion_modell": "kuerzung_unbestimmt", "sanktion_text": "Kürzung der Erstattung bei Reparatur außerhalb des Partnernetzes (Höhe laut AKB).", "gilt_fuer": "Sorglos Kasko: Vollkasko und Teilkasko inkl. Glas; Sorglos Kasko Glas: nur Glas", "ausnahmen_text": "Haftpflichtschaden Dritter · für Leasing wird die Glas-Variante angeboten", "partnernetz": "Signal-Iduna-Partnerwerkstätten", "akb_fundstelle": null, "quelle": "signal-iduna.de; asscompact.de" } },
    { "slug": "volkswagen-autoversicherung", "marke": "Volkswagen Autoversicherung", "versicherung_name": null, "wb_status": "standard", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": [], "linien_ohne_wb": [], "linien_nur_wb": ["Basis", "Optimal", "Premium"], "hinweis": "Alle gelisteten Tarife ausschließlich als Werkstattbindungs-Varianten. Kein Rechtsträger in den Stammdaten.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "volkswohl-bund", "marke": "Volkswohl-Bund", "versicherung_name": "VOLKSWOHL-BUND Sachversicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattservice" }], "wb_marker": ["mit Werkstattservice"], "nicht_wb_marker": [], "linien": ["Komfort", "KomfortPlus"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "vrk", "marke": "VRK", "versicherung_name": "Bruderhilfe Sachversicherung AG im Raum der Kirchen", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Select" }], "wb_marker": ["Select"], "nicht_wb_marker": ["Kasko Plus"], "linien": [], "linien_ohne_wb": [], "linien_nur_wb": [],
      "tarife_explizit": [
        { "anzeigename": "Basis", "linie": "Basis", "wb_zusatz": null, "wb": false },
        { "anzeigename": "Basis Select", "linie": "Basis", "wb_zusatz": "Select", "wb": true },
        { "anzeigename": "Classic", "linie": "Classic", "wb_zusatz": null, "wb": false },
        { "anzeigename": "Classic Select", "linie": "Classic", "wb_zusatz": "Select", "wb": true },
        { "anzeigename": "Classic Kasko Plus", "linie": "Classic Kasko Plus", "wb_zusatz": null, "wb": false },
        { "anzeigename": "Classic Select Kasko Plus", "linie": "Classic Kasko Plus", "wb_zusatz": "Select", "wb": true }
      ],
      "hinweis": "HUK-Systematik (Versicherer im Raum der Kirchen).", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "wgv", "marke": "WGV", "versicherung_name": "WGV-Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "Kasko SELECT" }], "wb_marker": ["Kasko SELECT"], "nicht_wb_marker": [], "linien": ["Basis", "Optimal", "Beamten Basis", "Beamten Optimal"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "P", "konditionen": null },
    { "slug": "wuerttembergische", "marke": "Württembergische", "versicherung_name": "Württembergische Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Schadenservice+" }], "wb_marker": ["mit Schadenservice+"], "nicht_wb_marker": [], "linien": ["KompaktSchutz", "PremiumSchutz"], "linien_ohne_wb": [], "linien_nur_wb": [], "verlaesslichkeit_default": "abgeleitet", "hinweis": "Bindungscharakter aus der Bezeichnung abgeleitet – AKB prüfen.", "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "wwk", "marke": "WWK", "versicherung_name": "WWK Allgemeine Versicherung AG", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattmanagement" }], "wb_marker": ["mit Werkstattmanagement"], "nicht_wb_marker": ["XtraSchutz"], "linien": ["KFZ Basis", "KFZ plus"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": "Der Zusatz „mit XtraSchutz“ ändert nichts an der Werkstattwahl.", "check24_vertrieb": "L", "konditionen": null },
    { "slug": "zurich", "marke": "Zurich", "versicherung_name": "Zurich Insurance plc", "wb_status": "optional", "wb_zusaetze": [{ "zusatz": "mit Werkstattbindung" }], "wb_marker": ["mit Werkstattbindung"], "nicht_wb_marker": [], "linien": ["Basis", "Top", "Premium"], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": null, "varianten_hinweis": null, "check24_vertrieb": "L", "konditionen": null },
    { "slug": "hdi", "marke": "HDI", "versicherung_name": "HDI Versicherung AG", "wb_status": "optional", "wb_zusaetze": [], "wb_marker": ["Werkstattbindung", "Partnerwerkstatt"], "nicht_wb_marker": ["Freie Werkstattwahl (nur für private Pkw)"], "linien": [], "linien_ohne_wb": [], "linien_nur_wb": [], "hinweis": "Nicht in der CHECK24-Liste. Werkstattbindungs-Baustein laut HDI-Broschüre vorhanden (Bezeichnung und Nachlass nicht belegt); Alternative „Freie Werkstattwahl (nur für private Pkw)“ = keine Bindung. Ohne Tarifliste – Rückfrage am Versicherungsschein.", "varianten_hinweis": null, "check24_vertrieb": null,
      "konditionen": { "nachlass_text": "„Sie sparen dabei“ (Höhe nicht belegt)", "sanktion_modell": "unbekannt", "sanktion_text": "Kürzung bei Reparatur außerhalb des Netzes laut AKB (Höhe öffentlich nicht belegt).", "gilt_fuer": "Kaskofall", "ausnahmen_text": "Alternative „Freie Werkstattwahl (nur für private Pkw)“ = keine Bindung", "partnernetz": "zertifizierte HDI-Partnerwerkstätten, Herstellergarantie bleibt erhalten", "akb_fundstelle": null, "quelle": "HDI-Broschüre Mobilität/Auto (hdi.de/kfz)" } }
  ]
}
```
