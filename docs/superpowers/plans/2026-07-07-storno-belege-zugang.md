# Storno-Belege zugänglich — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bei zurückgebuchten (stornierten) Partner-Provisionen sind Original- **und** Storno-Gutschrift herunterladbar (Admin-Cockpit + Partner-Portal), sichtbar verknüpft („Storno zu {Nr}").

**Architecture:** Ein reiner Helper baut aus den `partner_gutschriften`-Zeilen eine `gutschriftDocsByLedger`-Map (Original/Storno je Ledger + Bezug-Nr). `ladePartnerBilling` liefert diese Map statt der alten `gutschriftLedgerKeys`. Die Download-Action bekommt einen optionalen `typ`-Parameter. Das Admin-Panel rendert pro vorhandenem Beleg einen Button; das Portal labelt Storno-Zeilen.

**Tech Stack:** Next.js 15, TypeScript, Supabase (RLS-Reads + admin-client Signed-URLs), vitest.

## Global Constraints
- Server-Actions: **Result-Object** (`{ok:true,...} | {ok:false,error}`), kein `throw`. (AGENTS.md §Server-Actions)
- **Keine Typ-Exporte aus `'use server'`-Files** (AAR-664) → `LedgerGutschriftDocs` lebt in `src/lib/finance/partner-billing.ts` (kein `'use server'`).
- Frontend-Strings mit echten Umlauten (`ä/ö/ü/ß`). „Storno-Gutschrift", „Storno zu …".
- `betrag_brutto` ist in **Euro** gespeichert — **nicht** durch 100 teilen. Storno-Beträge sind negativ (korrekt via `Intl.NumberFormat`).
- **Kein DDL**, kein neuer Storage-Write. Reine Anzeige + Download.
- Komponenten: `@/components/primitives` `Button` + `@/components/shared/DataTable` (bereits genutzt).
- Branch `kitta/storno-belege-zugang`, gestackt auf `kitta/storno-gutschrift` (#3794). PR gegen `staging`.
- Tests laufen mit `npx vitest run <pfad>`. (Shared node_modules kann @react-pdf-Fehler werfen → CI autoritativ; die Tests hier ziehen kein @react-pdf.)

---

### Task 1: `LedgerGutschriftDocs` + `buildGutschriftDocsByLedger` (pure helper)

**Files:**
- Modify: `src/lib/finance/partner-billing.ts` (Typ + Helper anhängen)
- Test: `src/lib/finance/partner-billing.test.ts` (neu, falls nicht vorhanden → anlegen)

**Interfaces:**
- Produces:
  ```ts
  export type LedgerGutschriftDocs = {
    original?: { nr: string }
    storno?: { nr: string; bezugNr: string | null }
  }
  export type GutschriftRohzeile = {
    id: string
    gutschrift_nr: string
    typ: string
    bezug_gutschrift_id: string | null
    ledger_tabelle: string
    ledger_id: string
  }
  export function buildGutschriftDocsByLedger(
    rows: GutschriftRohzeile[],
  ): Record<string, LedgerGutschriftDocs>
  ```

- [ ] **Step 1: Write the failing test**

Neue Datei `src/lib/finance/partner-billing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildGutschriftDocsByLedger, type GutschriftRohzeile } from './partner-billing'

const base = { ledger_tabelle: 'makler_provisionen', ledger_id: 'led-1' }

describe('buildGutschriftDocsByLedger', () => {
  it('(a) original + storno für einen Ledger → beide + storno.bezugNr = Original-Nr', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 'o1', gutschrift_nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift', bezug_gutschrift_id: null, ...base },
      { id: 's1', gutschrift_nr: 'CMNDO-GS-2026-00002', typ: 'storno', bezug_gutschrift_id: 'o1', ...base },
    ]
    const map = buildGutschriftDocsByLedger(rows)
    expect(map['makler_provisionen:led-1']).toEqual({
      original: { nr: 'CMNDO-GS-2026-00001' },
      storno: { nr: 'CMNDO-GS-2026-00002', bezugNr: 'CMNDO-GS-2026-00001' },
    })
  })

  it('(b) nur original', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 'o1', gutschrift_nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift', bezug_gutschrift_id: null, ...base },
    ]
    expect(buildGutschriftDocsByLedger(rows)).toEqual({
      'makler_provisionen:led-1': { original: { nr: 'CMNDO-GS-2026-00001' } },
    })
  })

  it('(c) leer → {}', () => {
    expect(buildGutschriftDocsByLedger([])).toEqual({})
  })

  it('(d) storno mit unauffindbarem Bezug → bezugNr null', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 's1', gutschrift_nr: 'CMNDO-GS-2026-00002', typ: 'storno', bezug_gutschrift_id: 'missing', ...base },
    ]
    expect(buildGutschriftDocsByLedger(rows)['makler_provisionen:led-1'].storno).toEqual({
      nr: 'CMNDO-GS-2026-00002', bezugNr: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/partner-billing.test.ts`
Expected: FAIL — `buildGutschriftDocsByLedger is not a function`.

- [ ] **Step 3: Implement the helper**

Am Ende von `src/lib/finance/partner-billing.ts` anhängen:
```ts
export type LedgerGutschriftDocs = {
  original?: { nr: string }
  storno?: { nr: string; bezugNr: string | null }
}

export type GutschriftRohzeile = {
  id: string
  gutschrift_nr: string
  typ: string
  bezug_gutschrift_id: string | null
  ledger_tabelle: string
  ledger_id: string
}

/**
 * Baut aus den partner_gutschriften-Rohzeilen eines Partners eine Map
 * ledgerKey ("tabelle:id") -> { original?, storno? }. Der Storno-Bezug (Original-Nr)
 * wird aus derselben Zeilenmenge aufgeloest (id -> gutschrift_nr), kein Extra-Query.
 */
export function buildGutschriftDocsByLedger(
  rows: GutschriftRohzeile[],
): Record<string, LedgerGutschriftDocs> {
  const idToNr = new Map<string, string>()
  for (const r of rows) idToNr.set(r.id, r.gutschrift_nr)

  const map: Record<string, LedgerGutschriftDocs> = {}
  for (const r of rows) {
    const key = `${r.ledger_tabelle}:${r.ledger_id}`
    const entry = (map[key] ??= {})
    if (r.typ === 'storno') {
      entry.storno = {
        nr: r.gutschrift_nr,
        bezugNr: r.bezug_gutschrift_id ? idToNr.get(r.bezug_gutschrift_id) ?? null : null,
      }
    } else {
      entry.original = { nr: r.gutschrift_nr }
    }
  }
  return map
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/partner-billing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/partner-billing.ts src/lib/finance/partner-billing.test.ts
git commit -m "feat(finance): buildGutschriftDocsByLedger helper + LedgerGutschriftDocs type"
```

---

### Task 2: `getPartnerGutschriftDownloadUrl` — optionaler `typ`-Parameter

**Files:**
- Modify: `src/lib/finance/partner-billing-actions.ts:237-265` (`getPartnerGutschriftDownloadUrl`)
- Test: `src/lib/finance/partner-billing-actions.test.ts` (neu)

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: `getPartnerGutschriftDownloadUrl(ledgerTabelle: string, ledgerId: string, typ?: 'gutschrift' | 'storno')` — default `'gutschrift'` (bestehende 2-arg-Caller unverändert).

- [ ] **Step 1: Write the failing test**

Neue Datei `src/lib/finance/partner-billing-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// requireAdmin durchlassen
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }))

const eqCalls: Array<[string, string]> = []
const maybeSingleResult = { data: { pdf_storage_path: 'partner-gutschriften/2026/x.pdf' } as any }
const signedUrl = { data: { signedUrl: 'https://signed' }, error: null }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain: any = {
          eq: (c: string, v: string) => { eqCalls.push([c, v]); return chain },
          maybeSingle: async () => maybeSingleResult,
        }
        return chain
      },
    }),
    storage: { from: () => ({ createSignedUrl: async () => signedUrl }) },
  }),
}))

import { getPartnerGutschriftDownloadUrl } from './partner-billing-actions'

beforeEach(() => { eqCalls.length = 0 })

describe('getPartnerGutschriftDownloadUrl typ-Weiche', () => {
  it('default typ = gutschrift', async () => {
    const r = await getPartnerGutschriftDownloadUrl('makler_provisionen', 'led-1')
    expect(r).toEqual({ ok: true, url: 'https://signed' })
    expect(eqCalls).toContainEqual(['typ', 'gutschrift'])
  })
  it('typ = storno filtert typ=storno', async () => {
    await getPartnerGutschriftDownloadUrl('makler_provisionen', 'led-1', 'storno')
    expect(eqCalls).toContainEqual(['typ', 'storno'])
  })
})
```
> Hinweis: den echten Import-Pfad von `requireAdmin` beim Umsetzen per `grep -n "requireAdmin" src/lib/finance/partner-billing-actions.ts` verifizieren und im `vi.mock` exakt treffen.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/partner-billing-actions.test.ts`
Expected: FAIL — `typ='storno'` wird noch nicht gefiltert (`eqCalls` enthält es nicht) bzw. Signatur nimmt kein 3. Argument.

- [ ] **Step 3: Implement — typ-Param**

In `getPartnerGutschriftDownloadUrl` die Signatur + den Query erweitern:
```ts
export async function getPartnerGutschriftDownloadUrl(
  ledgerTabelle: string,
  ledgerId: string,
  typ: 'gutschrift' | 'storno' = 'gutschrift',
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  const admin = createAdminClient()

  // typ='gutschrift': Original; typ='storno': Korrekturbeleg. Nach einem Reversal existieren
  // zwei Zeilen je Ledger — typ macht die Auswahl eindeutig.
  const { data: g, error } = await admin
    .from('partner_gutschriften')
    .select('pdf_storage_path')
    .eq('ledger_tabelle', ledgerTabelle)
    .eq('ledger_id', ledgerId)
    .eq('typ', typ)
    .maybeSingle()
  // ... Rest unverändert (error-Check, pdf_storage_path-Check, createSignedUrl 300s)
}
```
> Der Block ab `if (error) return ...` bis `return { ok: true, url: signed.signedUrl }` bleibt wie gehabt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/partner-billing-actions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/partner-billing-actions.ts src/lib/finance/partner-billing-actions.test.ts
git commit -m "feat(finance): getPartnerGutschriftDownloadUrl optional typ param (gutschrift|storno)"
```

---

### Task 3: Admin-Migration `gutschriftLedgerKeys` → `gutschriftDocsByLedger` (atomar)

Diese 5 Datei-Änderungen müssen zusammen landen (Typ-Wechsel rippelt durch → tsc rot dazwischen).

**Files:**
- Modify: `src/lib/finance/partner-billing-actions.ts:274-343` (`ladePartnerBilling`)
- Modify: `src/components/shared/finance/PartnerBillingPanel.types.ts:20-25` (Prop)
- Modify: `src/components/shared/finance/PartnerBillingPanel.tsx` (`ZeilenAktionen` + Panel-Prop)
- Modify: `src/app/admin/makler/MaklerAdminClient.tsx:54,133,409`
- Modify: `src/app/admin/werkstaetten/WerkstaettenClient.tsx:67,91,776`
- Test: `src/components/shared/finance/PartnerBillingPanel.test.tsx` (neu, leichtgewichtig)

**Interfaces:**
- Consumes: `buildGutschriftDocsByLedger`, `LedgerGutschriftDocs` (Task 1); `getPartnerGutschriftDownloadUrl(_,_,typ)` (Task 2).
- Produces: `ladePartnerBilling` liefert `gutschriftDocsByLedger: Record<string, LedgerGutschriftDocs>` (statt `gutschriftLedgerKeys`). `PartnerBillingPanelProps.gutschriftDocsByLedger?: Record<string, LedgerGutschriftDocs>`.

- [ ] **Step 1: Write the failing test (Panel-Rendering)**

Neue Datei `src/components/shared/finance/PartnerBillingPanel.test.tsx` — prüft die reine Zeilen-Entscheidung ohne DOM (analog der No-DOM-Lehre: Element-Typ / gerenderte Button-Labels via react-test-renderer-frei über eine exportierte Hilfsfunktion). Dazu in `PartnerBillingPanel.tsx` eine **pure exportierte** Funktion `belegeFuerZeile(row, docs)` extrahieren:
```ts
import { describe, it, expect } from 'vitest'
import { belegeFuerZeile } from './PartnerBillingPanel'
import type { PartnerBillingRow } from '@/lib/finance/partner-billing'

const auszahlung = (status: string): PartnerBillingRow =>
  ({ richtung: 'auszahlung', status_norm: status, quelle_tabelle: 'makler_provisionen', quelle_id: 'led-1' } as any)

describe('belegeFuerZeile', () => {
  it('storniert + original+storno → beide Belege', () => {
    const docs = { 'makler_provisionen:led-1': { original: { nr: 'A' }, storno: { nr: 'B', bezugNr: 'A' } } }
    const b = belegeFuerZeile(auszahlung('storniert'), docs)
    expect(b.map((x) => x.typ)).toEqual(['gutschrift', 'storno'])
    expect(b.find((x) => x.typ === 'storno')?.bezugNr).toBe('A')
  })
  it('erledigt + nur original → ein Beleg', () => {
    const docs = { 'makler_provisionen:led-1': { original: { nr: 'A' } } }
    expect(belegeFuerZeile(auszahlung('erledigt'), docs).map((x) => x.typ)).toEqual(['gutschrift'])
  })
  it('forderung / offen → keine Belege', () => {
    expect(belegeFuerZeile({ richtung: 'forderung', status_norm: 'offen', quelle_tabelle: 'abrechnungen', quelle_id: 'x' } as any, {})).toEqual([])
  })
  it('kein Doc in der Map → leer (Alt-Storno/kein Beleg)', () => {
    expect(belegeFuerZeile(auszahlung('storniert'), {})).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/finance/PartnerBillingPanel.test.tsx`
Expected: FAIL — `belegeFuerZeile` existiert nicht.

- [ ] **Step 3a: `ladePartnerBilling` liefert die Map**

In `src/lib/finance/partner-billing-actions.ts`:
- Import ergänzen (oben, zu den bestehenden `import type`-Referenzen bzw. via inline-import wie bei `PartnerBillingRow`): den Helper `buildGutschriftDocsByLedger` + Typ `LedgerGutschriftDocs` aus `@/lib/finance/partner-billing`.
- Return-Typ: `gutschriftLedgerKeys: string[]` → `gutschriftDocsByLedger: Record<string, import('@/lib/finance/partner-billing').LedgerGutschriftDocs>`.
- `let gutschriftLedgerKeys: string[] = []` → `let gutschriftDocsByLedger: Record<string, ...LedgerGutschriftDocs> = {}`.
- Query + Map:
```ts
const { data: gs } = await admin
  .from('partner_gutschriften')
  .select('id, gutschrift_nr, typ, bezug_gutschrift_id, ledger_tabelle, ledger_id')
  .eq('partner_typ', partnerTyp)
  .eq('partner_id', partnerId)
const { buildGutschriftDocsByLedger } = await import('@/lib/finance/partner-billing')
gutschriftDocsByLedger = buildGutschriftDocsByLedger((gs ?? []) as any)
```
- Beide `return { ok: true, ... }`-Stellen: `gutschriftLedgerKeys` → `gutschriftDocsByLedger`.

- [ ] **Step 3b: Panel-Prop-Typ**

`src/components/shared/finance/PartnerBillingPanel.types.ts`: den `gutschriftLedgerKeys?: string[]`-Block ersetzen durch:
```ts
import type { PartnerBillingRow, PartnerBillingAggregat, LedgerGutschriftDocs } from '@/lib/finance/partner-billing'
export type { PartnerBillingRow, PartnerBillingAggregat, LedgerGutschriftDocs }
// ...
  /**
   * Map ledgerKey ("tabelle:id") -> { original?, storno? } der vorhandenen Belege.
   * Von ladePartnerBilling befuellt. Auszahlungszeilen (erledigt/storniert) zeigen
   * pro Beleg einen Download-Button ("Gutschrift ↓" / "Storno ↓").
   */
  gutschriftDocsByLedger?: Record<string, LedgerGutschriftDocs>
```

- [ ] **Step 3c: Panel — `belegeFuerZeile` + `ZeilenAktionen` + Panel-Prop**

`src/components/shared/finance/PartnerBillingPanel.tsx`:
- Import: `import type { PartnerBillingRow, LedgerGutschriftDocs } from '@/lib/finance/partner-billing'`.
- Pure Hilfsfunktion exportieren (oberhalb `ZeilenAktionen`):
```ts
export type ZeilenBeleg = { typ: 'gutschrift' | 'storno'; nr: string; bezugNr: string | null }

/** Welche Gutschrift-Belege sind für eine Zeile herunterladbar (Original + Storno). */
export function belegeFuerZeile(
  row: Pick<PartnerBillingRow, 'richtung' | 'status_norm' | 'quelle_tabelle' | 'quelle_id'>,
  docs: Record<string, LedgerGutschriftDocs>,
): ZeilenBeleg[] {
  if (row.richtung !== 'auszahlung') return []
  if (row.status_norm !== 'erledigt' && row.status_norm !== 'storniert') return []
  const entry = docs[`${row.quelle_tabelle}:${row.quelle_id}`]
  if (!entry) return []
  const out: ZeilenBeleg[] = []
  if (entry.original) out.push({ typ: 'gutschrift', nr: entry.original.nr, bezugNr: null })
  if (entry.storno) out.push({ typ: 'storno', nr: entry.storno.nr, bezugNr: entry.storno.bezugNr })
  return out
}
```
- `ZeilenAktionen`-Signatur: `gutschriftLedgerKeys: string[]` → `gutschriftDocsByLedger: Record<string, LedgerGutschriftDocs>`.
- Die `hatGutschrift`-Konstante + der `if (zeigeKeinAktion) { if (hatGutschrift) {...} }`-Block werden ersetzt. Neu: `const belege = belegeFuerZeile(row, gutschriftDocsByLedger)`. Im `zeigeKeinAktion`-Zweig:
```tsx
if (zeigeKeinAktion) {
  if (belege.length === 0) return <span className="text-xs text-claimondo-ondo/50">—</span>
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {belege.map((b) => (
        <Button
          key={b.typ}
          size="sm"
          variant="ghost"
          loading={isPending}
          title={b.typ === 'storno' && b.bezugNr ? `Storno zu ${b.bezugNr}` : undefined}
          onClick={() =>
            fuehreAus(async () => {
              const res = await getPartnerGutschriftDownloadUrl(quelle_tabelle, quelle_id, b.typ)
              if (res.ok) { window.open(res.url, '_blank'); return { ok: true } }
              return { ok: false, error: res.error }
            })
          }
        >
          {b.typ === 'storno' ? 'Storno ↓' : 'Gutschrift ↓'}
        </Button>
      ))}
      {meldung && !meldung.ok && <AktionMeldung {...meldung} />}
    </div>
  )
}
```
- Panel-Props (`PartnerBillingPanel(...)`): `gutschriftLedgerKeys = []` → `gutschriftDocsByLedger = {}`; die `<ZeilenAktionen row={row} gutschriftLedgerKeys={gutschriftLedgerKeys} />` → `gutschriftDocsByLedger={gutschriftDocsByLedger}`.

- [ ] **Step 3d: Consumer MaklerAdminClient + WerkstaettenClient**

Beide Files, je 3 identische Stellen (Zeilen siehe Files-Block):
- Lokaler `drawerData`-Typ: `gutschriftLedgerKeys: string[]` → `gutschriftDocsByLedger: Record<string, import('@/lib/finance/partner-billing').LedgerGutschriftDocs>`.
- `setDrawerData({ ..., gutschriftLedgerKeys: r.gutschriftLedgerKeys })` → `gutschriftDocsByLedger: r.gutschriftDocsByLedger`.
- JSX `gutschriftLedgerKeys={drawerData.gutschriftLedgerKeys}` → `gutschriftDocsByLedger={drawerData.gutschriftDocsByLedger}`.
> `KanzleiAbrechnungenClient`, `partner-abrechnungen/page.tsx`, `AbrechnungsTab.tsx` übergeben die Prop **nicht** → keine Änderung.

- [ ] **Step 3e: Verify — Test + tsc**

Run: `npx vitest run src/components/shared/finance/PartnerBillingPanel.test.tsx`
Expected: PASS (4 tests).
Run: `npx tsc --noEmit 2>&1 | grep -E "partner-billing|PartnerBillingPanel|MaklerAdminClient|WerkstaettenClient" || echo "clean"`
Expected: `clean` (keine Fehler in den berührten Files; `@react-pdf`-Env-Rauschen ignorieren).

- [ ] **Step 6: Commit**

```bash
git add src/lib/finance/partner-billing-actions.ts src/components/shared/finance/PartnerBillingPanel.tsx src/components/shared/finance/PartnerBillingPanel.types.ts src/components/shared/finance/PartnerBillingPanel.test.tsx src/app/admin/makler/MaklerAdminClient.tsx src/app/admin/werkstaetten/WerkstaettenClient.tsx
git commit -m "feat(finance): admin cockpit — download original + storno for reversed provisions"
```

---

### Task 4: Portal — Storno-Zeilen labeln + Bezug

**Files:**
- Modify: `src/lib/finance/eigene-gutschriften-actions.ts:10-19` (`getEigeneGutschriften` — select + bezug-Auflösung)
- Modify: `src/components/shared/finance/PartnerGutschriftenListe.tsx` (`EigeneGutschrift`-Typ + Label + Bezug-Zeile)
- Test: `src/lib/finance/eigene-gutschriften.test.ts` (neu — reine Auflöse-Hilfsfunktion)

**Interfaces:**
- Consumes: nichts.
- Produces: `EigeneGutschrift` erweitert um `typ: string` + `bezugNr: string | null`. Reine Hilfsfunktion `mapEigeneGutschriften(rows): EigeneGutschrift[]` (Bezug-Auflösung, testbar) in `PartnerGutschriftenListe.tsx` exportiert.

- [ ] **Step 1: Write the failing test**

Neue Datei `src/lib/finance/eigene-gutschriften.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mapEigeneGutschriften } from '@/components/shared/finance/PartnerGutschriftenListe'

describe('mapEigeneGutschriften', () => {
  it('löst Storno-Bezug (Original-Nr) auf + setzt typ', () => {
    const rows = [
      { id: 'o1', gutschrift_nr: 'A', betrag_brutto: 119, erstellt_am: '2026-07-05T10:00:00Z', status: 'storniert', typ: 'gutschrift', bezug_gutschrift_id: null },
      { id: 's1', gutschrift_nr: 'B', betrag_brutto: -119, erstellt_am: '2026-07-07T10:00:00Z', status: 'versendet', typ: 'storno', bezug_gutschrift_id: 'o1' },
    ]
    const out = mapEigeneGutschriften(rows as any)
    const storno = out.find((g) => g.id === 's1')!
    expect(storno.typ).toBe('storno')
    expect(storno.bezugNr).toBe('A')
    expect(out.find((g) => g.id === 'o1')!.bezugNr).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/eigene-gutschriften.test.ts`
Expected: FAIL — `mapEigeneGutschriften` existiert nicht.

- [ ] **Step 3: Implement**

`src/components/shared/finance/PartnerGutschriftenListe.tsx`:
- `EigeneGutschrift`-Typ erweitern:
```ts
export type EigeneGutschrift = {
  id: string
  gutschrift_nr: string
  betrag_brutto: number
  erstellt_am: string
  status: string
  typ: string
  bezugNr: string | null
}
export type EigeneGutschriftRoh = Omit<EigeneGutschrift, 'bezugNr'> & { bezug_gutschrift_id: string | null }

export function mapEigeneGutschriften(rows: EigeneGutschriftRoh[]): EigeneGutschrift[] {
  const idToNr = new Map(rows.map((r) => [r.id, r.gutschrift_nr]))
  return rows.map(({ bezug_gutschrift_id, ...r }) => ({
    ...r,
    bezugNr: bezug_gutschrift_id ? idToNr.get(bezug_gutschrift_id) ?? null : null,
  }))
}
```
- In der Tabelle: Titel-Spalte für `typ==='storno'` als „Storno-Gutschrift" labeln + Bezug-Zeile. Konkret die `gutschrift_nr`-Zelle (`<Td className="font-mono text-xs">{g.gutschrift_nr}</Td>`) ersetzen:
```tsx
<Td className="font-mono text-xs">
  {g.typ === 'storno' ? (
    <span className="flex flex-col">
      <span className="font-sans font-medium text-claimondo-navy">Storno-Gutschrift</span>
      <span>{g.gutschrift_nr}</span>
      {g.bezugNr && <span className="text-claimondo-shield">Storno zu {g.bezugNr}</span>}
    </span>
  ) : (
    g.gutschrift_nr
  )}
</Td>
```

`src/lib/finance/eigene-gutschriften-actions.ts` — `getEigeneGutschriften`:
```ts
import type { EigeneGutschrift, EigeneGutschriftRoh } from '@/components/shared/finance/PartnerGutschriftenListe'
// ...
export async function getEigeneGutschriften(): Promise<EigeneGutschrift[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partner_gutschriften')
    .select('id, gutschrift_nr, betrag_brutto, erstellt_am, status, typ, bezug_gutschrift_id')
    .order('erstellt_am', { ascending: false })
  if (error) console.error('[eigene-gutschriften] Laden fehlgeschlagen:', error.message)
  const { mapEigeneGutschriften } = await import('@/components/shared/finance/PartnerGutschriftenListe')
  return mapEigeneGutschriften((data ?? []) as EigeneGutschriftRoh[])
}
```
> `mapEigeneGutschriften` importiert die Server-Action dynamisch (kein Typ-Export-Problem — `mapEigeneGutschriften` ist eine Funktion, kein Typ; AAR-664 betrifft nur Exporte AUS `'use server'`, nicht Imports IN sie).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/eigene-gutschriften.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/eigene-gutschriften-actions.ts src/components/shared/finance/PartnerGutschriftenListe.tsx src/lib/finance/eigene-gutschriften.test.ts
git commit -m "feat(finance): portal — label Storno-Gutschrift rows + show bezug"
```

---

### Task 5: Gates, 7-Punkte-Audit, PR + opus-Review

**Files:** keine Code-Änderung (Verifikation + PR).

- [ ] **Step 1: Volle Test-Suite + Ratchets**

```bash
npx vitest run src/lib/finance src/components/shared/finance
npm run check:token-audit -- --ratchet
npm run check:component-set -- --ratchet
npm run check:status-registry -- --ratchet
```
Expected: alle grün / 0 neu. (Der neue Storno-Titel nutzt `text-claimondo-*` + `text-claimondo-shield` — keine raw Tailwind-Status/Accent-Scales → Status-/Accent-Ratchet 0 neu.)

- [ ] **Step 2: tsc (in Files)**

```bash
npx tsc --noEmit 2>&1 | grep -viE "@react-pdf|'sharp'" | grep -iE "partner-billing|PartnerBillingPanel|PartnerGutschriftenListe|eigene-gutschriften|MaklerAdminClient|WerkstaettenClient" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 3: 7-Punkte-Audit dokumentieren** (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression) — in der PR-Beschreibung + im Merge-Commit-Body. UI-Einstieg: Admin-Cockpit-Drawer (Makler/Werkstatt) + Portal „Meine Gutschriften". Dead-Code: `gutschriftLedgerKeys` vollständig entfernt (grep-verifiziert: `grep -rn "gutschriftLedgerKeys" src/` → 0 Treffer).

- [ ] **Step 4: Push + PR gegen staging**

```bash
git push -u origin kitta/storno-belege-zugang
gh pr create --base staging --head kitta/storno-belege-zugang --title "feat(finance): Storno-Belege zugänglich (Admin + Portal + Bezug)" --body-file <(...)
```
PR-Body: gestackt auf #3794 (zuerst mergen), Audit-Trailer, Screenshots/Beschreibung.

- [ ] **Step 5: Opus whole-branch review** dispatchen (Achsen: typ-Weiche korrekt, Bezug-Auflösung, kein Dead-Code, Umlaute, Regression der 3 nicht-berührten Panel-Consumer). Findings einarbeiten.

---

## Self-Review (gegen die Spec)

- **Spec §1 (Datenschicht/Map + Bezug):** Task 1 (Helper) + Task 3a (Query + Wiring). ✓
- **Spec §1 (ersetzen statt additiv, 3 Consumer):** Task 3b–3d + Task 5 Dead-Code-grep. ✓ (Consumer sind MaklerAdminClient + WerkstaettenClient; Kanzlei/Aggregat/SV übergeben die Prop nicht.)
- **Spec §2 (Download typ-Param):** Task 2. ✓
- **Spec §3 (Admin-UI beide Buttons + „Storno zu"):** Task 3c. ✓
- **Spec §4 (Portal Label + Bezug):** Task 4. ✓
- **Spec §5 (Result-Object, Umlaute, Euro, kein DDL):** Global Constraints + je Task. ✓
- **Spec §6 (Tests):** Task 1/2/3/4 je vitest. ✓
- **Type-Konsistenz:** `LedgerGutschriftDocs` (partner-billing.ts) einheitlich in Action-Return, Panel-Prop, Client-State; `belegeFuerZeile`/`buildGutschriftDocsByLedger`/`mapEigeneGutschriften` Namen konsistent zwischen Tasks. ✓
- **Placeholder-Scan:** keine TBD/TODO; jeder Code-Step zeigt Code. ✓
