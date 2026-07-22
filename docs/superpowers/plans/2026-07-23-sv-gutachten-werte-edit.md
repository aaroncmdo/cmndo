# SV-Gutachten-Werte-Bearbeitung (S2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Sachverständige kann die fünf Bewertungs-Kernwerte seines Gutachtens in der Fallakte selbst eingeben/korrigieren (heute OCR-read-only); die bestätigten Werte werden als „vom Gutachter geprüft" markiert.

**Architecture:** Eine neue editierbare `GutachtenWerteCard` (SV-Fallakte) übernimmt die Bewertungs-Kernwerte (der read-only-Block wandert aus `GutachtenCard`). Der Write geht über eine neue SV-ownership-gated Server-Action, die die **bestehende** `apply_gutachten_ocr`-RPC wiederverwendet (identisch zur Admin-Korrektur) und `gutachten_ocr_manuell_ueberschrieben=true` setzt — dieses Flag ist zugleich das Marker-Signal (bereits in `v_gutachten_werte` projiziert, kein Schema-Change).

**Tech Stack:** Next.js (App Router, Server Actions), Supabase (`apply_gutachten_ocr`-RPC via Admin-Client), React (`'use client'`-Card), `@/components/shared/SectionCard`, `@/components/primitives` Button, vitest (pure-logic-Tests), Playwright (Regel-4 Prod-Smoke).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-22-sv-gutachten-werte-edit-design.md` (Aaron-freigegeben).
- **Umlaute:** Alle nutzersichtbaren Strings mit echten `ä/ö/ü/ß`. SV-Portal ist inline-Deutsch (kein `t()`); die **Kunde**-`SaeuleMeinGeld` ist i18n'd → Kunde-Badge braucht Key in **allen 6 Locales**.
- **Server-Action-Shape:** `ActionResult` (`{ success?: boolean; error?: string }`) — Datei-Konsistenz mit `src/app/gutachter/fall/[id]/actions.ts` (NICHT `{ ok }`).
- **Keine Konstanten/Types aus `'use server'`-Files exportieren** → Whitelist/Feldliste leben in einem separaten pure Module.
- **Design-Tokens:** `SectionCard` + `bg-claimondo-*`/`text-claimondo-*`/`rounded-ios-*`/`text-body-*` — kein raw hex, keine raw Tailwind-Scales (token-audit + component-set grün).
- **Keine DB-Migration** — alle Spalten existieren; `manuell_ueberschrieben` ist in `v_gutachten_werte`.
- **Result-Object statt throw** in der Action; Non-critical Sub-Ops (timeline) in `try/catch`.
- **Regel 4:** nach Prod-Deploy vollständiger Playwright-Smoke (Wegwerf-SV, `telefon=NULL`).
- **Koordination:** `page.tsx` (Lane 63fe43f9) + `FallDetailClient.tsx` (S1 #4705) werden von anderen angefasst — disjunkte Regionen halten.

---

### Task 1: Pure Feld-/Whitelist-Module + Test

**Files:**
- Create: `src/lib/gutachter/gutachten-werte-felder.ts`
- Test: `src/lib/gutachter/gutachten-werte-felder.test.ts`

**Interfaces:**
- Produces: `SV_WERTE_FELDER: WerteFeld[]`, `type WerteFeld = { key: string; label: string; typ: 'eur' | 'int' | 'bool' }`, `filterWerteFelder(patch: Record<string, unknown>): Record<string, string | number | boolean | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/gutachter/gutachten-werte-felder.test.ts
import { describe, it, expect } from 'vitest'
import { filterWerteFelder, SV_WERTE_FELDER } from './gutachten-werte-felder'

describe('filterWerteFelder', () => {
  it('lässt nur Whitelist-Felder durch', () => {
    const out = filterWerteFelder({ minderwert: 500, status: 'x', claim_id: 'y' })
    expect(out).toEqual({ minderwert: 500 })
  })
  it('mappt leeren String auf null (Feld löschen)', () => {
    expect(filterWerteFelder({ restwert: '' })).toEqual({ restwert: null })
  })
  it('lässt boolean totalschaden zu', () => {
    expect(filterWerteFelder({ totalschaden: true })).toEqual({ totalschaden: true })
  })
  it('SV_WERTE_FELDER enthält die 5 Kernwerte + totalschaden', () => {
    const keys = SV_WERTE_FELDER.map((f) => f.key)
    for (const k of ['reparaturkosten_netto', 'reparaturkosten_brutto', 'minderwert', 'wiederbeschaffungswert', 'restwert', 'totalschaden']) {
      expect(keys).toContain(k)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gutachter/gutachten-werte-felder.test.ts`
Expected: FAIL (`Cannot find module './gutachten-werte-felder'`).

- [ ] **Step 3: Write the module**

```ts
// src/lib/gutachter/gutachten-werte-felder.ts
// S2: Editierbare Gutachten-Bewertungswerte (SV). Pure Module (KEIN 'use server') —
// Feldliste + Whitelist-Filter werden von der Action, der Card UND dem Test geteilt.

export type WerteFeldTyp = 'eur' | 'int' | 'bool'
export type WerteFeld = { key: string; label: string; typ: WerteFeldTyp }

// Reihenfolge = Anzeige-Reihenfolge in der GutachtenWerteCard.
export const SV_WERTE_FELDER: WerteFeld[] = [
  { key: 'reparaturkosten_netto', label: 'Reparaturkosten netto', typ: 'eur' },
  { key: 'reparaturkosten_brutto', label: 'Reparaturkosten brutto', typ: 'eur' },
  { key: 'minderwert', label: 'Wertminderung', typ: 'eur' },
  { key: 'wiederbeschaffungswert', label: 'Wiederbeschaffungswert', typ: 'eur' },
  { key: 'restwert', label: 'Restwert', typ: 'eur' },
  { key: 'nutzungsausfall_tage', label: 'Nutzungsausfall (Tage)', typ: 'int' },
  { key: 'gutachten_nutzungsausfall_tagessatz_eur', label: 'Nutzungsausfall-Tagessatz', typ: 'eur' },
  { key: 'wiederbeschaffungsdauer_tage', label: 'Wiederbeschaffungsdauer (Tage)', typ: 'int' },
  { key: 'totalschaden', label: 'Totalschaden', typ: 'bool' },
]

const ERLAUBT = new Set(SV_WERTE_FELDER.map((f) => f.key))

/** Filtert einen Patch auf die Whitelist; leerer String -> null (Feld löschen). */
export function filterWerteFelder(
  patch: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const cleaned: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!ERLAUBT.has(k)) continue
    cleaned[k] = v === '' ? null : (v as string | number | boolean | null)
  }
  return cleaned
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gutachter/gutachten-werte-felder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gutachter/gutachten-werte-felder.ts src/lib/gutachter/gutachten-werte-felder.test.ts
git commit -m "feat(sv-werte): Whitelist-Module fuer editierbare Gutachten-Werte (S2 T1)"
```

---

### Task 2: SV-Action `updateGutachtenWerteSv`

**Files:**
- Modify: `src/app/gutachter/fall/[id]/actions.ts` (neue Export-Function ans Datei-Ende; Import ergänzen)

**Interfaces:**
- Consumes: `filterWerteFelder` (Task 1); vorhandene `createClient`, `createAdminClient`, `getGutachterForUser`, `revalidatePath`, `ActionResult` (alle bereits in der Datei importiert/genutzt).
- Produces: `updateGutachtenWerteSv(fallId: string, patch: Record<string, string | number | boolean | null>): Promise<ActionResult>`.

- [ ] **Step 1: Import ergänzen** (oben in `actions.ts`, bei den übrigen Imports)

```ts
import { filterWerteFelder } from '@/lib/gutachter/gutachten-werte-felder'
```

- [ ] **Step 2: Action anhängen** (ans Ende von `actions.ts`)

```ts
// S2: SV editiert/korrigiert die Gutachten-Bewertungswerte. Ownership-Gate identisch zu
// saveFinVinGutachter (faelle_claim_bridge + claims.sv_id). Schreibt über die BESTEHENDE
// apply_gutachten_ocr-RPC (wie die Admin-Korrektur) + manuell_ueberschrieben=true (schützt vor
// OCR-Re-Run UND ist das "vom Gutachter geprüft"-Marker-Signal; in v_gutachten_werte projiziert).
export async function updateGutachtenWerteSv(
  fallId: string,
  patch: Record<string, string | number | boolean | null>,
): Promise<ActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) return { error: 'Kein Sachverständigen-Profil gefunden' }

  const { data: fall } = await supabase
    .from('faelle_claim_bridge')
    .select('claim_id, claims:claims!fk_bridge_claim!inner(sv_id)')
    .eq('fall_id', fallId)
    .eq('claims.sv_id', sv.id)
    .single()
  if (!fall) return { error: 'Fall nicht gefunden' }
  const claimId = (fall.claim_id as string | null) ?? null
  if (!claimId) return { error: 'Fall hat keinen verknüpften Claim' }

  const cleaned = filterWerteFelder(patch)
  if (Object.keys(cleaned).length === 0) return { error: 'Keine zulässigen Werte im Patch' }
  cleaned.gutachten_ocr_manuell_ueberschrieben = true

  const admin = createAdminClient()
  const { error } = await admin.rpc('apply_gutachten_ocr', { p_claim_id: claimId, p_values: cleaned })
  if (error) return { error: error.message }

  // Non-critical: Audit-Timeline darf den Save nicht kippen.
  try {
    await admin.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: 'Gutachten-Werte vom Gutachter aktualisiert',
      erstellt_von: user.id,
    })
  } catch (e) {
    console.error('[updateGutachtenWerteSv] timeline insert', e)
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath(`/kunde/faelle/${claimId}`)
  return { success: true }
}
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: EXIT 0. (Verifiziert Signaturen von `apply_gutachten_ocr`-Call, `ActionResult`, Bridge-Select.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/gutachter/fall/[id]/actions.ts"
git commit -m "feat(sv-werte): updateGutachtenWerteSv Action (reuse apply_gutachten_ocr) (S2 T2)"
```

---

### Task 3: `GutachtenWerteCard` (editierbare Karte)

**Files:**
- Create: `src/app/gutachter/fall/[id]/_components/GutachtenWerteCard.tsx`

**Interfaces:**
- Consumes: `SV_WERTE_FELDER`, `WerteFeld` (Task 1); `updateGutachtenWerteSv` (Task 2); `berechneGutachtenAnomalien` from `@/lib/qc/anomalien`; `SectionCard`, `Button`.
- Produces: `type GutachtenWerte = Record<string, number | boolean | null>` (values keyed by `SV_WERTE_FELDER[].key`); `GutachtenWerteCard({ fallId, werte, manuellUeberschrieben }: { fallId: string; werte: GutachtenWerte; manuellUeberschrieben: boolean })`.

- [ ] **Step 1: Card schreiben**

```tsx
'use client'

// S2: SV editiert die Gutachten-Bewertungswerte (Reparaturkosten/Minderwert/WBW/Restwert/
// Nutzungsausfall + Totalschaden). Ersetzt den read-only-"erkannt"-Block, der aus der
// GutachtenCard rauswandert. OCR füllt vor; der SV ist die Autorität. Validierung (anomalien.ts)
// inline + advisory (nicht blockierend). "bestätigt"-Badge, wenn ein Mensch die Werte geprüft hat.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { PencilIcon, CheckIcon, AlertTriangleIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { berechneGutachtenAnomalien } from '@/lib/qc/anomalien'
import { SV_WERTE_FELDER, type WerteFeld } from '@/lib/gutachter/gutachten-werte-felder'
import { updateGutachtenWerteSv } from '../actions'

export type GutachtenWerte = Record<string, number | boolean | null>

function fmtEur(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}
function fmtDisplay(f: WerteFeld, v: number | boolean | null): string {
  if (v === null) return '—'
  if (f.typ === 'bool') return v ? 'Ja' : 'Nein'
  if (f.typ === 'int') return String(v)
  return fmtEur(v as number)
}

export function GutachtenWerteCard({
  fallId,
  werte,
  manuellUeberschrieben,
}: {
  fallId: string
  werte: GutachtenWerte
  manuellUeberschrieben: boolean
}) {
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<GutachtenWerte>(werte)
  const [saving, startSaving] = useTransition()

  // Advisory-Validierung auf dem aktuellen Draft (gutachten_fin=null -> FIN-Regel greift nicht).
  const anomalien = berechneGutachtenAnomalien({
    reparaturkosten_netto: (draft.reparaturkosten_netto as number | null) ?? null,
    wiederbeschaffungswert: (draft.wiederbeschaffungswert as number | null) ?? null,
    restwert: (draft.restwert as number | null) ?? null,
    minderwert: (draft.minderwert as number | null) ?? null,
    totalschaden: (draft.totalschaden as boolean | null) ?? null,
    gutachten_fin: null,
  })

  function setFeld(f: WerteFeld, raw: string | boolean) {
    setDraft((d) => ({
      ...d,
      [f.key]: f.typ === 'bool' ? (raw as boolean) : raw === '' ? null : Number(raw),
    }))
  }

  function handleSave() {
    startSaving(async () => {
      const res = await updateGutachtenWerteSv(fallId, draft as Record<string, string | number | boolean | null>)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Gutachten-Werte gespeichert.')
        setEditMode(false)
      }
    })
  }

  return (
    <SectionCard bodyClassName="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          Gutachten-Werte
        </h3>
        {manuellUeberschrieben && !editMode && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success-strong">
            <CheckIcon className="w-3 h-3" /> vom Gutachter bestätigt
          </span>
        )}
      </div>

      {editMode ? (
        <>
          <div className="grid grid-cols-1 gap-2">
            {SV_WERTE_FELDER.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-claimondo-ondo">{f.label}</span>
                {f.typ === 'bool' ? (
                  <input
                    type="checkbox"
                    checked={!!draft[f.key]}
                    onChange={(e) => setFeld(f, e.target.checked)}
                    className="h-4 w-4 rounded border-claimondo-border"
                  />
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={draft[f.key] === null || draft[f.key] === undefined ? '' : String(draft[f.key])}
                    onChange={(e) => setFeld(f, e.target.value)}
                    className="w-32 bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-2 py-1 text-right text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
                  />
                )}
              </label>
            ))}
          </div>

          {anomalien.length > 0 && (
            <div className="rounded-ios-lg bg-warning-soft border border-warning/30 p-2 space-y-1">
              {anomalien.map((a) => (
                <p key={a.code} className="flex items-start gap-1.5 text-[11px] text-warning-strong">
                  <AlertTriangleIcon className="w-3 h-3 mt-0.5 shrink-0" /> {a.text}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="navy" size="sm" loading={saving} onClick={handleSave}>Speichern</Button>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setDraft(werte); setEditMode(false) }}>Abbrechen</Button>
          </div>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            {SV_WERTE_FELDER.filter((f) => werte[f.key] !== null && werte[f.key] !== undefined).map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-claimondo-ondo">{f.label}</dt>
                <dd className="text-claimondo-navy text-right font-medium">{fmtDisplay(f, werte[f.key] ?? null)}</dd>
              </div>
            ))}
          </dl>
          <Button variant="ghost" size="sm" iconLeft={<PencilIcon className="w-3.5 h-3.5" />} onClick={() => setEditMode(true)}>
            Werte bearbeiten
          </Button>
        </>
      )}
    </SectionCard>
  )
}
```

- [ ] **Step 2: Typecheck + component-set + token-audit**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run check:component-set --silent && npm run check:token-audit --silent`
Expected: tsc EXIT 0; component-set EXIT 0 (SectionCard genutzt, kein neuer Drift); token-audit EXIT 0.

> Note: `success-strong`/`warning-soft`/`warning-strong` sind sanktionierte Status-Tokens (NoticeBox nutzt sie). Falls component-set die Checkbox/Input als Handroll flaggt: das sind Form-Primitives (kein Button/Card) — der Scanner flaggt nur Buttons/Cards/Tables. Verifiziert: `<input>` ist nicht betroffen.

- [ ] **Step 3: Commit**

```bash
git add "src/app/gutachter/fall/[id]/_components/GutachtenWerteCard.tsx"
git commit -m "feat(sv-werte): GutachtenWerteCard (editierbar, advisory-Validierung, Badge) (S2 T3)"
```

---

### Task 4: SV-Wiring — page.tsx-Read erweitern, GutachtenCard-Werteblock raus, Card rendern

**Files:**
- Modify: `src/app/gutachter/fall/[id]/page.tsx` (v_gutachten_werte-Select + gutachtenWerte-Objekt erweitern)
- Modify: `src/app/gutachter/fall/[id]/_components/GutachtenCard.tsx` (Werteblock 273-332 auf Datum+Honorar reduzieren; `GutachtenExtractedWerte` bleibt)
- Modify: `src/app/gutachter/fall/[id]/FallDetailClient.tsx` (GutachtenWerteCard nach GutachtenCard rendern)

**Interfaces:**
- Consumes: `GutachtenWerteCard`, `GutachtenWerte` (Task 3).
- Produces: `props.gutachtenWerte` erhält zusätzlich `totalschaden`, `gutachten_nutzungsausfall_tagessatz_eur`, `wiederbeschaffungsdauer_tage`, `manuell_ueberschrieben`.

- [ ] **Step 1: page.tsx — Select + Objekt erweitern** (`src/app/gutachter/fall/[id]/page.tsx`)

Den `.select(...)` auf `v_gutachten_werte` (aktuell ~Z.511) um die vier Felder erweitern:

```ts
// vorher:
'gutachten_datum, reparaturkosten_netto, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert, nutzungsausfall_tage, gutachten_sv_honorar_brutto',
// nachher:
'gutachten_datum, reparaturkosten_netto, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert, nutzungsausfall_tage, gutachten_sv_honorar_brutto, gutachten_nutzungsausfall_tagessatz_eur, wiederbeschaffungsdauer_tage, totalschaden, gutachten_ocr_manuell_ueberschrieben',
```

Den Typ von `gutachtenWerte` (Z.497-506) + das Objekt-Mapping (Z.517+) um die vier Felder ergänzen:

```ts
// Typ ergänzen:
    gutachten_nutzungsausfall_tagessatz_eur: number | null
    wiederbeschaffungsdauer_tage: number | null
    totalschaden: boolean | null
    gutachten_ocr_manuell_ueberschrieben: boolean | null
// Mapping ergänzen (Number()-Wrap für numeric, wie die Nachbarfelder):
        gutachten_nutzungsausfall_tagessatz_eur: cw.gutachten_nutzungsausfall_tagessatz_eur !== null ? Number(cw.gutachten_nutzungsausfall_tagessatz_eur) : null,
        wiederbeschaffungsdauer_tage: cw.wiederbeschaffungsdauer_tage !== null ? Number(cw.wiederbeschaffungsdauer_tage) : null,
        totalschaden: (cw.totalschaden as boolean | null) ?? null,
        gutachten_ocr_manuell_ueberschrieben: (cw.gutachten_ocr_manuell_ueberschrieben as boolean | null) ?? null,
```

- [ ] **Step 2: GutachtenCard — Werteblock auf Datum + Honorar reduzieren** (`_components/GutachtenCard.tsx`, Block Z.273-332)

Die fünf Bewertungs-Zeilen (Reparatur netto/brutto, Minderwert, Wiederbeschaffung, Restwert, Nutzungsausfall) aus dem `<dl>` **entfernen**; nur **Datum** + **SV-Honorar brutto** bleiben. Den `extracted && (…)`-Gate-Ausdruck (Z.273) + `hatExtractedWerte` (Z.83-88) auf die verbleibenden Felder umstellen und den italic-Footer „Falsch? … Stellungnahme" **entfernen** (die Korrektur ist jetzt die GutachtenWerteCard). Resultierender Block:

```tsx
{extracted && (extracted.gutachten_datum !== null || extracted.gutachten_sv_honorar_brutto !== null) && (
  <div className="pt-3 border-t border-claimondo-border">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-2">
      Gutachten-Metadaten
    </p>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
      {extracted.gutachten_datum && (
        <>
          <dt className="text-claimondo-ondo">Datum</dt>
          <dd className="text-claimondo-navy text-right font-medium">{fmtDate(extracted.gutachten_datum)}</dd>
        </>
      )}
      {extracted.gutachten_sv_honorar_brutto !== null && (
        <>
          <dt className="text-claimondo-ondo">SV-Honorar brutto</dt>
          <dd className="text-claimondo-navy text-right font-medium">{fmtEur(extracted.gutachten_sv_honorar_brutto)}</dd>
        </>
      )}
    </dl>
  </div>
)}
```

Und `hatExtractedWerte` (Z.83-88) auf `extracted.gutachten_sv_honorar_brutto !== null || extracted.gutachten_datum !== null` umstellen (damit die Render-Gate-Semantik der GutachtenCard erhalten bleibt). `GutachtenExtractedWerte`-Type unverändert lassen (die 5 Felder werden nur nicht mehr gerendert — sie fließen jetzt in die GutachtenWerteCard).

- [ ] **Step 3: FallDetailClient — GutachtenWerteCard rendern** (`FallDetailClient.tsx`, direkt nach `<GutachtenCard … />` Z.457)

Import ergänzen (bei den `_components`-Imports):

```tsx
import { GutachtenWerteCard } from './_components/GutachtenWerteCard'
```

Nach dem `<GutachtenCard … />`-Block (nach Z.457) einfügen — nur rendern, wenn Werte vorliegen ODER der SV ab „Gutachten erstellen" ist (dieselbe Sichtbarkeit wie die GutachtenCard-Werte). `props.gutachtenWerte` liefert die Werte:

```tsx
{props.gutachtenWerte && (
  <GutachtenWerteCard
    fallId={fall.id as string}
    werte={{
      reparaturkosten_netto: props.gutachtenWerte.reparaturkosten_netto,
      reparaturkosten_brutto: props.gutachtenWerte.reparaturkosten_brutto,
      minderwert: props.gutachtenWerte.minderwert,
      wiederbeschaffungswert: props.gutachtenWerte.wiederbeschaffungswert,
      restwert: props.gutachtenWerte.restwert,
      nutzungsausfall_tage: props.gutachtenWerte.nutzungsausfall_tage,
      gutachten_nutzungsausfall_tagessatz_eur: props.gutachtenWerte.gutachten_nutzungsausfall_tagessatz_eur,
      wiederbeschaffungsdauer_tage: props.gutachtenWerte.wiederbeschaffungsdauer_tage,
      totalschaden: props.gutachtenWerte.totalschaden,
    }}
    manuellUeberschrieben={props.gutachtenWerte.gutachten_ocr_manuell_ueberschrieben ?? false}
  />
)}
```

> Der `FallDetailClient`-Props-Typ für `gutachtenWerte` (Definition oben in der Datei) muss die vier neuen Felder ebenfalls tragen — beim Typecheck fällt auf, wenn nicht; dann den Props-Typ analog zu page.tsx erweitern.

- [ ] **Step 4: Full build (Route betroffen)**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: EXIT 0 (SV-Route `/gutachter/fall/[id]` kompiliert; keine Validator-Fehler).

- [ ] **Step 5: Commit**

```bash
git add "src/app/gutachter/fall/[id]/page.tsx" "src/app/gutachter/fall/[id]/_components/GutachtenCard.tsx" "src/app/gutachter/fall/[id]/FallDetailClient.tsx"
git commit -m "feat(sv-werte): Werte-Read erweitern, GutachtenCard-Werteblock raus, GutachtenWerteCard rendern (S2 T4)"
```

---

### Task 5: Kunde-Marker „vom Gutachter geprüft" (i18n, 6 Locales)

**Files:**
- Modify: `src/lib/claims/kunde-claim-view.ts` (`KundeGutachtenWerte` + Read um `manuellUeberschrieben` ergänzen; ~Z.32-36 Typ, ~Z.488 Mapping)
- Modify: `src/components/kunde/SaeuleMeinGeld.tsx` (Badge im „ausGutachten"-Block; Prop ergänzen)
- Modify: `src/i18n/messages/{de,en,pl,ru,tr,ar}.json` (Key `kunde.fall.meinGeld.vomGutachterGeprueft`)

**Interfaces:**
- Consumes: `manuell_ueberschrieben` aus dem bestehenden `v_gutachten_werte`-Read in `kunde-claim-view.ts`.
- Produces: `KundeGutachtenWerte.manuellUeberschrieben: boolean | null`; `SaeuleMeinGeld` neue optionale Prop `svGeprueft?: boolean`.

- [ ] **Step 1: kunde-claim-view.ts — Flag mitführen**

Im `v_gutachten_werte`-`.select(...)` von `kunde-claim-view.ts` (die Query, deren `gwRes` in `gutachtenWerte` gemappt wird, ~Z.480-490) `gutachten_ocr_manuell_ueberschrieben` ergänzen. Den `KundeGutachtenWerte`-Type um `manuellUeberschrieben: boolean | null` erweitern und im Objekt-Mapping (~Z.489) setzen:

```ts
        manuellUeberschrieben: (gw.gutachten_ocr_manuell_ueberschrieben as boolean | null) ?? null,
```

Sicherstellen, dass `manuellUeberschrieben` bis zum `SaeuleMeinGeld`-Consumer durchgereicht wird (GeldZone → `gutachtenWerte`-Prop). Beim Typecheck fällt auf, wo die Kette bricht.

- [ ] **Step 2: i18n-Key in de.json** (unter `kunde.fall.meinGeld`)

```json
"vomGutachterGeprueft": "Vom Gutachter geprüft"
```

- [ ] **Step 3: Key in den 5 weiteren Locales** (Parität — `check:i18n` verlangt es)

```
en: "Verified by the appraiser"
pl: "Zweryfikowane przez rzeczoznawcę"
ru: "Проверено экспертом"
tr: "Bilirkişi tarafından doğrulandı"
ar: "تم التحقق منه بواسطة الخبير"
```

- [ ] **Step 4: SaeuleMeinGeld — Badge rendern** (`SaeuleMeinGeld.tsx`, im `gutachtenWerte?.ocr_processed_at`-Block, nach der `ausGutachten`-Überschrift Z.91-93)

Prop-Typ um `svGeprueft?: boolean` erweitern; Badge einfügen:

```tsx
{svGeprueft && (
  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success-strong">
    <CheckIcon className="w-3 h-3" /> {t('vomGutachterGeprueft')}
  </span>
)}
```

(`import { CheckIcon } from 'lucide-react'` ergänzen.) Den Caller (GeldZone) `svGeprueft={gutachtenWerte?.manuellUeberschrieben ?? false}` übergeben lassen.

- [ ] **Step 5: Checks**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run check:i18n --silent`
Expected: tsc EXIT 0; i18n Parität grün (alle 6 Locales gleich viele Keys).

- [ ] **Step 6: Commit**

```bash
git add src/lib/claims/kunde-claim-view.ts src/components/kunde/SaeuleMeinGeld.tsx src/i18n/messages/de.json src/i18n/messages/en.json src/i18n/messages/pl.json src/i18n/messages/ru.json src/i18n/messages/tr.json src/i18n/messages/ar.json
git commit -m "feat(sv-werte): Kunde-Marker 'vom Gutachter geprueft' (i18n 6 Locales) (S2 T5)"
```

---

### Task 6: Post-Task-Audit, Full-Build, PR

**Files:** keine Code-Änderung (Verifikation + PR).

- [ ] **Step 1: Alle Gates**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build
npx vitest run src/lib/gutachter/gutachten-werte-felder.test.ts
npm run check:token-audit --silent && npm run check:component-set --silent && npm run check:knip -- --ratchet && npm run check:i18n --silent
```
Expected: alle grün (build EXIT 0; vitest PASS; ratchets 0 neu).

- [ ] **Step 2: 7-Punkte-Audit im Kopf durchgehen** (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression) — Ergebnis in die PR-Body-Audit-Sektion.

- [ ] **Step 3: Push + PR nach staging**

```bash
git push -u origin kitta/sv-gutachten-werte-edit
gh pr create --base staging --head kitta/sv-gutachten-werte-edit \
  --title "feat(sv-fall-detail): S2 — SV editiert Gutachten-Bewertungswerte" \
  --body-file <PR-Body mit Regel-4-Smoke-Plan>
```

- [ ] **Step 4: Regel-4-Smoke-Plan in den PR** (an Deploy-Session): Wegwerf-SV, eigener Fall mit Gutachten → Wert editieren (z.B. Minderwert) → Save → Wert + „vom Gutachter bestätigt"-Badge in der GutachtenWerteCard; Gegenprüfung Kunde-`SaeuleMeinGeld` zeigt den Wert + „vom Gutachter geprüft". Negativ: Selbstzahler/Kasko unberührt. `telefon=NULL`, kein echtes Geld bewegt.

---

## Self-Review

**Spec-Coverage:**
- Editierbare Werte-Karte (SV, separat) → Task 3 + 4. ✓
- SV-ownership-gated Action, reuse `apply_gutachten_ocr` + `manuell_ueberschrieben` → Task 2. ✓
- Werteblock raus aus GutachtenCard → Task 4 Step 2. ✓
- Advisory `anomalien.ts`-Validierung → Task 3 (inline, nicht blockierend). ✓
- Provenance-Marker SV-Card + Kunde-`SaeuleMeinGeld` (via `manuell_ueberschrieben`) → Task 3 (Badge) + Task 5. ✓
- Kein Schema-Change → bestätigt (alle Spalten in `v_gutachten_werte`). ✓
- Regel-4-Smoke → Task 6 Step 4. ✓

**Placeholder-Scan:** keine „TBD/TODO"; alle Code-Steps mit realem Code; Selects/Typen konkret. Die zwei „beim Typecheck fällt auf"-Hinweise (FallDetailClient-Props-Typ, GeldZone-Durchreichung) sind bewusst — die exakte Zeile hängt vom Fremd-Lane-Stand der Datei ab; der Typecheck ist der deterministische Anker.

**Typ-Konsistenz:** `filterWerteFelder`/`SV_WERTE_FELDER` (T1) → konsumiert in T2 (Action) + T3 (Card), gleiche Signaturen. `GutachtenWerte`-Record-Keys == `SV_WERTE_FELDER[].key`. `manuell_ueberschrieben` (DB) → `manuellUeberschrieben` (VM) durchgängig. `ActionResult` (`{ success?/error? }`) konsistent mit Datei.
