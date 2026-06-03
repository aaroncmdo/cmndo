# AAR-956 P4-A — Self-Service-Erfassung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der anonyme Self-Service-Flow erfasst vor der SA die deklarativen Schaden-/Fahrzeug-/Gegner-Fakten selbst (① Feststellung), sodass post-SA die bestehende dynamische Pflicht-Engine (②) gezielt die fehlenden Dokumente nachfordert.

**Architecture:** ① = neuer `feststellung`-Step in `FlowWizardKfz` (incomplete-Pfad, vor `termin`), rendert die `lead-erfassung`(audience kunde)-Fakten-Felder via dem geteilten `FieldRenderer` und speichert sie token-basiert auf den Lead. ② = REUSE des bestehenden adaptiven `/kunde/onboarding`-Wizards + `getOffeneDokumentAnforderungen`/`evaluatePflichtdocs` (post-fall, fallId vorhanden → native OCR). §8b/P4-B gestrichen.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (admin client, token-resolve), next-intl, vitest, das `onboarding_felder`-Config-System.

**Spec:** `docs/superpowers/specs/2026-06-03-aar956-p4-self-service-erfassung-design.md`

---

## File Structure

| Datei | Verantwortung | Status |
|---|---|---|
| `src/lib/onboarding/lead-erfassung-allowlist.ts` | Geteilter serverseitiger Feld-Allowlist-Loader + Coercion (aus `onboarding_felder`, flow `lead-erfassung`) | **NEU** (extrahiert aus dispatch) |
| `src/app/dispatch/leads/[id]/_actions/dispatch-lead-felder.ts` | Dispatcher-Save | **importiert** den geteilten Helper (DRY) |
| `src/app/flow/[token]/self-service-feststellung-actions.ts` | `speichereFeststellungFlow(token, values)` — token-basiert, anon | **NEU** |
| `src/lib/self-service/feststellung-felder.ts` | Reine Filter-Funktion: welche `lead-erfassung`-Felder gehören in ① | **NEU** (+ Test) |
| `src/app/flow/[token]/FlowFeststellungStep.tsx` | Client-Step: rendert die ①-Felder via `FieldRenderer`, Batch-Save auf „Weiter" | **NEU** |
| `src/app/flow/[token]/FlowWizardKfz.tsx` | Host-Wizard: `feststellung` in `StepId` + `STEPS` + Render-Block + Quali→Feststellung→Termin-Verdrahtung | **geändert** |
| `src/app/flow/[token]/page.tsx` | lädt `ladeFlowPhasen('lead-erfassung','kunde')` + reicht `feststellungPhasen` + aktuelle Lead-Werte durch | **geändert** |

**②** braucht (Smoke ergibt) i.d.R. **keinen** Code-Change — nur Verifikation, dass der Self-Service-Fall im adaptiven `/kunde/onboarding`-`dokumente`-Step landet. Falls ein Gap auftaucht, wird er als eigener Mini-PR nachgezogen (Task 6).

---

## Task 0: Worktree-Build-Gate herstellen

**Files:** keine (Setup).

- [ ] **Step 1: Echtes `node_modules` im Worktree** (Junction erzeugt false `TS2307`, s. AGENTS.md/Memory `worktree_build_gate`)

Run: `npm ci` (im Worktree `…/.claude/worktrees/aar-956-p4`)
Expected: installiert ohne Fehler; `node_modules` ist ein echtes Verzeichnis (kein Junction).

- [ ] **Step 2: Stale generierte Route-Typen entfernen** (sonst false `sv-portal`-Fehler beim tsc)

Run: `rm -rf .next/dev/types .next/types`
Expected: kein Fehler.

---

## Task 1: Geteilter Allowlist-Helper (extrahiert, DRY)

`ladeLeadErfassungLeadsFelder` + die Coercion leben heute lokal in `dispatch-lead-felder.ts`. ① braucht denselben serverseitigen Allowlist-Mechanismus (Spalten/Coercion NIE dem Client vertrauen) → in eine geteilte lib ziehen, beide Consumer importieren.

**Files:**
- Create: `src/lib/onboarding/lead-erfassung-allowlist.ts`
- Create: `src/lib/onboarding/__tests__/lead-erfassung-allowlist.test.ts`
- Modify: `src/app/dispatch/leads/[id]/_actions/dispatch-lead-felder.ts`

- [ ] **Step 1: Failing test für die Coercion**

```ts
// src/lib/onboarding/__tests__/lead-erfassung-allowlist.test.ts
import { describe, it, expect } from 'vitest'
import { coerceLeadErfassungWert } from '../lead-erfassung-allowlist'

describe('coerceLeadErfassungWert', () => {
  it('leerer String und undefined werden null', () => {
    expect(coerceLeadErfassungWert('text', '')).toBeNull()
    expect(coerceLeadErfassungWert('text', undefined)).toBeNull()
  })
  it('number-Felder werden zu Number (leer = null)', () => {
    expect(coerceLeadErfassungWert('number', '2019')).toBe(2019)
    expect(coerceLeadErfassungWert('number', '  ')).toBeNull()
  })
  it('segmented true/false werden Boolean', () => {
    expect(coerceLeadErfassungWert('segmented', 'true')).toBe(true)
    expect(coerceLeadErfassungWert('segmented', 'false')).toBe(false)
  })
  it('andere Werte bleiben unverändert', () => {
    expect(coerceLeadErfassungWert('text', 'B-MW 123')).toBe('B-MW 123')
    expect(coerceLeadErfassungWert('segmented', 'gegner')).toBe('gegner')
  })
})
```

- [ ] **Step 2: Test rot laufen lassen**

Run: `npx vitest run src/lib/onboarding/__tests__/lead-erfassung-allowlist.test.ts`
Expected: FAIL (`coerceLeadErfassungWert` existiert nicht).

- [ ] **Step 3: Helper implementieren** (1:1 aus dispatch-lead-felder.ts, leads-gefiltert, zb1-upload skip)

```ts
// src/lib/onboarding/lead-erfassung-allowlist.ts
// Geteilter serverseitiger Allowlist-Loader + Coercion fuer den lead-erfassung-Flow.
// Spalten/Typen kommen aus onboarding_felder (NIE Client-Mapping vertrauen).
// Consumer: saveDispatchLeadFelder (Dispatcher) + speichereFeststellungFlow (Self-Service).

import { createAdminClient } from '@/lib/supabase/admin'

export type LeadErfassungFeldMeta = { spalte: string; typ: string }

/** feld_key -> {leads-Spalte, typ} fuer alle lead-erfassung-Felder mit db_target.tabelle='leads'.
 *  zb1-upload wird ausgelassen (der OCR-Endpoint schreibt kennzeichen, nicht der generische Save). */
export async function ladeLeadErfassungLeadsFelder(): Promise<Map<string, LeadErfassungFeldMeta>> {
  const admin = createAdminClient()
  const { data: phasen } = await admin
    .from('onboarding_phasen')
    .select('id')
    .eq('flow_key', 'lead-erfassung')
  const phaseIds = ((phasen ?? []) as Array<{ id: string }>).map((p) => p.id)
  const map = new Map<string, LeadErfassungFeldMeta>()
  if (phaseIds.length === 0) return map

  const { data } = await admin
    .from('onboarding_felder')
    .select('feld_key, typ, db_target')
    .in('phase_id', phaseIds)
  for (const row of (data ?? []) as Array<{
    feld_key: string
    typ: string
    db_target: { tabelle?: string; spalte?: string } | null
  }>) {
    if (row.typ === 'zb1-upload') continue
    const t = row.db_target
    if (t?.tabelle === 'leads' && t.spalte) map.set(row.feld_key, { spalte: t.spalte, typ: row.typ })
  }
  return map
}

/** '' / undefined -> null; number -> Number; segmented 'true'/'false' -> boolean; sonst unveraendert. */
export function coerceLeadErfassungWert(typ: string, v: unknown): unknown {
  if (v === '' || v === undefined) return null
  if (typ === 'number') return typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v
  if (typ === 'segmented' && (v === 'true' || v === 'false')) return v === 'true'
  return v
}
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run src/lib/onboarding/__tests__/lead-erfassung-allowlist.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: dispatch-lead-felder.ts auf den geteilten Helper umstellen** (Boy-Scout-DRY)

In `src/app/dispatch/leads/[id]/_actions/dispatch-lead-felder.ts`: die lokale `ladeLeadErfassungLeadsFelder`-Funktion (Zeilen ~18-44) **und** `coerceVal` (Zeilen ~46-51) löschen; statt `type FeldMeta` den Import nutzen. Oben ergänzen:

```ts
import { ladeLeadErfassungLeadsFelder, coerceLeadErfassungWert } from '@/lib/onboarding/lead-erfassung-allowlist'
```

Im Body `coerceVal(meta.typ, raw)` → `coerceLeadErfassungWert(meta.typ, raw)`. Rest unverändert.

- [ ] **Step 6: tsc + bestehende Dispatcher-Tests grün**

Run: `npx tsc --noEmit && npx vitest run src/app/dispatch`
Expected: tsc exit 0; Dispatcher-Tests unverändert grün.

- [ ] **Step 7: Commit**

```bash
git add src/lib/onboarding/lead-erfassung-allowlist.ts src/lib/onboarding/__tests__/lead-erfassung-allowlist.test.ts "src/app/dispatch/leads/[id]/_actions/dispatch-lead-felder.ts"
git commit -m "refactor(AAR-956 P4): lead-erfassung-Allowlist+Coercion in geteilte lib (DRY fuer Dispatcher+Self-Service)"
```

---

## Task 2: `speichereFeststellungFlow` Server-Action (anon, token-basiert)

**Files:**
- Create: `src/app/flow/[token]/self-service-feststellung-actions.ts`

- [ ] **Step 1: Action implementieren** (spiegelt `speichereQualiFlow`-Resolve + den Allowlist-Save)

```ts
// src/app/flow/[token]/self-service-feststellung-actions.ts
'use server'

// AAR-956 P4-A: token-basierter Self-Service-Save der deklarativen Feststellungs-
// Felder auf den Lead (anon, vor der SA). Resolve via flow_links-Token (wie die
// anderen self-service-actions); Allowlist/Coercion serverseitig aus onboarding_felder.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ladeLeadErfassungLeadsFelder,
  coerceLeadErfassungWert,
} from '@/lib/onboarding/lead-erfassung-allowlist'

async function resolveFlowLeadId(token: string): Promise<{
  admin: ReturnType<typeof createAdminClient> | null
  leadId: string | null
  error?: string
}> {
  if (!token) return { admin: null, leadId: null, error: 'Kein Token.' }
  const admin = createAdminClient()
  const { data: flowLink } = await admin
    .from('flow_links')
    .select('lead_id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (flowLink) {
    if (flowLink.expires_at && new Date(flowLink.expires_at as string).getTime() < Date.now()) {
      return { admin, leadId: null, error: 'Dieser Link ist abgelaufen.' }
    }
    return { admin, leadId: (flowLink.lead_id as string | null) ?? null }
  }
  return { admin, leadId: token } // Backward-compat: Token = lead_id
}

export async function speichereFeststellungFlow(
  token: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLeadId(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // SA-Lockdown: nach Konvertierung ist der Fall SSoT, kein Lead-Edit mehr.
  const { data: lead } = await admin
    .from('leads')
    .select('sa_unterschrieben')
    .eq('id', leadId)
    .maybeSingle()
  if (lead?.sa_unterschrieben) {
    return { ok: false, error: 'Dieser Vorgang ist bereits abgeschlossen.' }
  }

  const feldMap = await ladeLeadErfassungLeadsFelder()
  const update: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(values)) {
    const meta = feldMap.get(key)
    if (!meta) continue // unbekannt / Sentinel / zb1-upload -> skip
    update[meta.spalte] = coerceLeadErfassungWert(meta.typ, raw)
  }
  if (Object.keys(update).length === 0) return { ok: true }

  update.updated_at = new Date().toISOString()
  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}
```

- [ ] **Step 2: tsc grün**

Run: `npx tsc --noEmit`
Expected: exit 0. (DB-Integration wird im E2E-Smoke Task 7 geprüft — kein Unit-Test, da Admin-DB-Write.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/flow/[token]/self-service-feststellung-actions.ts"
git commit -m "feat(AAR-956 P4): speichereFeststellungFlow — token-basierter anon Lead-Save"
```

---

## Task 3: ①-Feld-Filter (reine Funktion, getestet)

Definiert, welche `lead-erfassung`(kunde)-Felder in ① gehören: deklarative Fakten/Flags — **OHNE** Uploads (file/zb1-upload/signature/termin/slot), **OHNE** die schon woanders erfassten (`schuldfrage`=§3a-quali, `kontakt`-Sektion=Zusammenfassung, `termin_sv`=§3a-slot, `vollmacht`=§3a-SA, `status`=Dispatcher), **OHNE** die OCR-Folgedaten (`fin`/`hsn`/`tsn`/`fahrzeug_hersteller`/`fahrzeug_modell`/`fahrzeug_baujahr`/`fahrzeug_farbe` → kommen via ZB1-OCR in ②).

**Files:**
- Create: `src/lib/self-service/feststellung-felder.ts`
- Create: `src/lib/self-service/__tests__/feststellung-felder.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/self-service/__tests__/feststellung-felder.test.ts
import { describe, it, expect } from 'vitest'
import { istFeststellungsFeld } from '../feststellung-felder'

const feld = (over: Partial<{ feld_key: string; typ: string; sektion: string | null }>) => ({
  feld_key: 'x', typ: 'text', sektion: 'schaden', ...over,
})

describe('istFeststellungsFeld', () => {
  it('nimmt deklarative Schaden-Flags', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'personenschaden_flag', typ: 'segmented' }))).toBe(true)
    expect(istFeststellungsFeld(feld({ feld_key: 'schadentyp', typ: 'toggle-cards' }))).toBe(true)
  })
  it('nimmt Kennzeichen + Halter-Toggle aus fahrzeug', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'kennzeichen', sektion: 'fahrzeug' }))).toBe(true)
    expect(istFeststellungsFeld(feld({ feld_key: 'ist_fahrzeughalter', typ: 'segmented', sektion: 'fahrzeug' }))).toBe(true)
  })
  it('schliesst Upload-Typen aus', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'fahrzeugschein_foto', typ: 'zb1-upload', sektion: 'fahrzeug' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'schadensfotos', typ: 'file' }))).toBe(false)
  })
  it('schliesst OCR-Folgedaten aus', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'fin', sektion: 'fahrzeug' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'fahrzeug_hersteller', sektion: 'fahrzeug' }))).toBe(false)
  })
  it('schliesst woanders erfasste aus', () => {
    expect(istFeststellungsFeld(feld({ feld_key: 'schuldfrage', typ: 'segmented', sektion: 'schuld' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'vorname', sektion: 'kontakt' }))).toBe(false)
    expect(istFeststellungsFeld(feld({ feld_key: 'termin', typ: 'termin', sektion: 'termin_sv' }))).toBe(false)
  })
})
```

- [ ] **Step 2: Test rot**

Run: `npx vitest run src/lib/self-service/__tests__/feststellung-felder.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

```ts
// src/lib/self-service/feststellung-felder.ts
// AAR-956 P4-A: welche lead-erfassung(kunde)-Felder in ① (Feststellung, pre-SA) gehoeren.
// Deklarative Fakten/Flags; KEINE Uploads, KEINE woanders erfassten, KEINE OCR-Folgedaten.

const EXCLUDE_TYPEN = new Set(['file', 'zb1-upload', 'signature', 'termin', 'slot'])
const EXCLUDE_SEKTIONEN = new Set(['kontakt', 'termin_sv', 'vollmacht', 'status'])
const EXCLUDE_FELDER = new Set([
  'schuldfrage', // §3a-Quali-Step
  // OCR-Folgedaten — kommen via ZB1-Foto in ②
  'fin', 'hsn', 'tsn', 'fahrzeug_hersteller', 'fahrzeug_modell', 'fahrzeug_baujahr', 'fahrzeug_farbe',
])

export function istFeststellungsFeld(feld: {
  feld_key: string
  typ: string
  sektion: string | null
}): boolean {
  if (EXCLUDE_TYPEN.has(feld.typ)) return false
  if (feld.sektion && EXCLUDE_SEKTIONEN.has(feld.sektion)) return false
  if (EXCLUDE_FELDER.has(feld.feld_key)) return false
  return true
}
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run src/lib/self-service/__tests__/feststellung-felder.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/self-service/feststellung-felder.ts src/lib/self-service/__tests__/feststellung-felder.test.ts
git commit -m "feat(AAR-956 P4): istFeststellungsFeld — ①-Feldfilter (deklarativ, kein Upload/OCR/Dup)"
```

---

## Task 4: `FlowFeststellungStep`-Komponente

Rendert die gefilterten ①-Felder (gruppiert je Sektion) via `FieldRenderer`, hält die Werte lokal, speichert sie auf „Weiter" via `speichereFeststellungFlow`. Nichts ist Pflicht (alles „überspringbar"). Mount-stabil (keine Props die `STEPS` flippen — nur `onWeiter`-Callback).

**Files:**
- Create: `src/app/flow/[token]/FlowFeststellungStep.tsx`

- [ ] **Step 1: Komponente implementieren**

```tsx
// src/app/flow/[token]/FlowFeststellungStep.tsx
'use client'

// AAR-956 P4-A: ① Feststellung — der Kunde erklaert die deklarativen Fakten/Flags
// (Schaden/Fahrzeug-ID/Gegner/Unfall) vor der SA. Gerendert aus der lead-erfassung-
// Config via dem geteilten FieldRenderer; nichts ist Pflicht ("vorerst ueberspringen").

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import { istFeststellungsFeld } from '@/lib/self-service/feststellung-felder'
import { speichereFeststellungFlow } from './self-service-feststellung-actions'

export function FlowFeststellungStep({
  token,
  phasen,
  initialValues,
  onWeiter,
}: {
  token: string
  phasen: OnboardingPhase[]
  initialValues: Record<string, unknown>
  onWeiter: () => void
}) {
  const t = useTranslations('flow')
  const [values, setValues] = useState<Record<string, unknown>>(initialValues)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nur Sektionen mit ≥1 ①-Feld; Felder pro Sektion gefiltert.
  const sektionen = phasen
    .map((p) => ({ phase: p, felder: p.felder.filter(istFeststellungsFeld) }))
    .filter((s) => s.felder.length > 0)

  function setFeld(key: string, val: unknown) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  async function handleWeiter() {
    setSaving(true)
    setError(null)
    const res = await speichereFeststellungFlow(token, values)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    onWeiter()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-claimondo-navy leading-snug">
          {t.has('step_feststellung.heading')
            ? t('step_feststellung.heading')
            : 'Ein paar Angaben zu Ihrem Schaden'}
        </h1>
        <p className="mt-2 text-sm text-claimondo-ondo">
          {t.has('step_feststellung.sub')
            ? t('step_feststellung.sub')
            : 'Je genauer, desto schneller — alles ist optional und kann später ergänzt werden.'}
        </p>
      </div>

      <div className="space-y-7">
        {sektionen.map(({ phase, felder }) => (
          <section key={phase.id}>
            {phase.titel && (
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-claimondo-ondo/60 mb-3">
                {phase.titel}
              </h2>
            )}
            <div className="space-y-4">
              {felder.map((feld: OnboardingFeld) => (
                <FieldRenderer
                  key={feld.id}
                  feld={feld}
                  value={values[feld.feld_key]}
                  onChange={(val) => setFeld(feld.feld_key, val)}
                  disabled={saving}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-500 bg-red-50 border border-red-100 rounded-ios-md px-4 py-3">
          {error}
        </p>
      )}

      <button
        onClick={handleWeiter}
        disabled={saving}
        className="mt-7 w-full inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
      >
        {saving ? (t.has('common.speichern') ? t('common.speichern') : 'Speichern…') : t('common.weiter')}
      </button>
    </div>
  )
}
```

> **Component-Set-Hinweis:** Der CTA-Button spiegelt bewusst den vorhandenen FlowWizardKfz-Button-Stil (lokale Konsistenz, gesamter Wizard ist handgerolltes Tailwind aus der Pre-Policy-Zeit). Falls der `check:component-set --ratchet` ihn als neuen Verstoß zählt: in `primitives.Button` (variant `ondo`) umstellen ODER den Wizard-Button als lokale Mini-Komponente extrahieren und beide nutzen. Vor dem Commit prüfen (Task 7 Gate).

- [ ] **Step 2: tsc grün**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/flow/[token]/FlowFeststellungStep.tsx"
git commit -m "feat(AAR-956 P4): FlowFeststellungStep — ①-Felder via FieldRenderer, Batch-Save"
```

---

## Task 5: `page.tsx` — Feststellungs-Phasen + Werte laden

**Files:**
- Modify: `src/app/flow/[token]/page.tsx`

- [ ] **Step 1: Phasen serverseitig laden** (nur wenn `needsBooking`, sonst unnötig). Nach der `needsBooking`-Zeile (~181):

```ts
import { ladeFlowPhasen } from '@/lib/onboarding/lade-flow-phasen'
// … in FlowPage, nach `const needsBooking = …`:
const feststellungPhasen = needsBooking
  ? await ladeFlowPhasen('lead-erfassung', 'kunde')
  : []
```

- [ ] **Step 2: Initial-Werte aus dem Lead bauen** (feld_key → aktueller leads-Wert). Da `db_target.spalte === feld_key` für fast alle Felder gilt, reicht ein direkter Lookup auf der `lead`-Row (SELECT * ist schon geladen):

```ts
const feststellungWerte: Record<string, unknown> = {}
for (const phase of feststellungPhasen) {
  for (const feld of phase.felder) {
    const spalte = feld.db_target?.spalte
    if (spalte && spalte in (lead as Record<string, unknown>)) {
      const v = (lead as Record<string, unknown>)[spalte]
      feststellungWerte[feld.feld_key] = typeof v === 'boolean' ? String(v) : v
    }
  }
}
```

> Boolean→String, weil `segmented`/`toggle-cards` String-Werte erwarten (`'true'`/`'false'`); die Action coercet beim Save zurück.

- [ ] **Step 3: Props durchreichen** an `<FlowWizardKfz>` (im JSX, neben `needsBooking`):

```tsx
feststellungPhasen={feststellungPhasen}
feststellungWerte={feststellungWerte}
```

- [ ] **Step 4: tsc grün** (FlowWizardKfz-Props folgen in Task 6 — tsc wird hier rot sein bis Task 6; daher Task 5+6 zusammen committen)

Run: `npx tsc --noEmit`
Expected: ggf. Fehler „Property 'feststellungPhasen' does not exist" → in Task 6 behoben.

---

## Task 6: `FlowWizardKfz` — `feststellung`-Step verdrahten

**Files:**
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx`

- [ ] **Step 1: Import + Typen**

Oben ergänzen:
```ts
import { FlowFeststellungStep } from './FlowFeststellungStep'
import type { OnboardingPhase } from '@/components/onboarding/types'
```
`StepId` erweitern (Zeile ~98):
```ts
type StepId = 'zusammenfassung' | 'quali' | 'feststellung' | 'termin' | 'gutachter' | 'sa' | 'account'
```

- [ ] **Step 2: Props** (im Funktions-Signatur-Objekt, neben `needsBooking`):
```ts
  feststellungPhasen,
  feststellungWerte,
```
und im Typ:
```ts
  feststellungPhasen?: OnboardingPhase[]
  feststellungWerte?: Record<string, unknown>
```

- [ ] **Step 3: `feststellung` in die incomplete-`STEPS`** (Zeile ~199-207) — nach `quali`, vor `termin`:
```ts
  const STEPS: { id: StepId; label: string }[] = istIncomplete
    ? [
        { id: 'zusammenfassung', label: 'Zusammenfassung' },
        ...(qualiPending ? [{ id: 'quali' as StepId, label: 'Schuldfrage' }] : []),
        { id: 'feststellung', label: 'Angaben' },
        { id: 'termin', label: 'Termin' },
        { id: 'gutachter', label: 'Ihr Gutachter' },
        { id: 'sa', label: 'Beauftragung' },
        { id: 'account', label: 'Konto' },
      ]
    : [ /* unverändert */ ]
```

- [ ] **Step 4: Quali-`onWeiter` auf `feststellung`** (Zeile ~474):
```ts
              <FlowQualiStep
                token={token}
                vorname={editVorname || lead.vorname || null}
                onWeiter={() => setStepIndex(stepIndexById('feststellung'))}
              />
```

- [ ] **Step 5: Render-Block** (zwischen quali- und termin-Block einfügen, ~Zeile 477):
```tsx
            {/* ═══ AAR-956 P4-A: FESTSTELLUNG (deklarative Fakten, nur incomplete-Pfad) ═══ */}
            {currentStep.id === 'feststellung' && (
              <FlowFeststellungStep
                token={token}
                phasen={feststellungPhasen ?? []}
                initialValues={feststellungWerte ?? {}}
                onWeiter={() => setStepIndex(stepIndexById('termin'))}
              />
            )}
```

- [ ] **Step 6: Edge-Case** — wenn `feststellungPhasen` leer (kein ①-Feld sichtbar), den Step überspringen, damit kein leerer Schritt erscheint. In der `STEPS`-Bildung den feststellung-Eintrag konditionalisieren:
```ts
        ...((feststellungPhasen?.some((p) => p.felder.some(istFeststellungsFeld)) ?? false)
          ? [{ id: 'feststellung' as StepId, label: 'Angaben' }]
          : []),
```
(Import `istFeststellungsFeld` oben ergänzen.) **Mount-stabil:** `feststellungPhasen` ist ein Server-Prop, das sich während der Session nicht ändert → kein Stale-Index-Risiko (anders als `needsBooking`/`schuldfrage`).

- [ ] **Step 7: tsc + vitest grün**

Run: `rm -rf .next/dev/types .next/types && npx tsc --noEmit && npx vitest run src/lib/self-service src/lib/onboarding`
Expected: exit 0; alle neuen Tests grün.

- [ ] **Step 8: Commit (Task 5+6 zusammen)**

```bash
git add "src/app/flow/[token]/page.tsx" "src/app/flow/[token]/FlowWizardKfz.tsx"
git commit -m "feat(AAR-956 P4): feststellung-Step in FlowWizardKfz + page.tsx Phasen-Loading"
```

---

## Task 7: ②-Verifikation + E2E-Smoke + Gates

② (dynamische Pflicht-Nachforderung) ist bestehende Engine — dieser Task **verifiziert** sie für den Self-Service-Pfad und fängt eine etwaige Lücke.

**Files:**
- Create: `scripts/smoke-aar956-p4.mts` (TEMP, am Ende löschen)

- [ ] **Step 1: Fixture + Walk** (Muster: §3a-Walk `smoke-flow-verify.mts`/`smoke-flow-walk.mts` aus der Git-History `git show origin/staging~…` bzw. Memory `project_aar940_self_service`). Seed: anon Lead (schuldfrage null, fahrzeug_standort coords Köln, personenschaden_flag/sachschaden_flag/polizei_vor_ort gezielt setzen) + gfa (konvertiert_zu_lead_id + zugeordneter_sv_id=Test-SV `1da11741-a406-45ce-a27b-c041576cccbb`) + flow_links token. Flag `CANONICAL_FLOWLINK_ENABLED=true` staging-isoliert (PM2 process-env, wie §3a).

- [ ] **Step 2: Browser-Walk-Assertions**

Walk `/flow/<token>`: DSGVO→Weiter → Quali (gegner) → **assert: feststellung-Step rendert** (Sektions-Überschriften Schaden/Fahrzeug/Unfall, Felder sichtbar, KEIN FIN/ZB1-Upload) → Werte setzen (z.B. `personenschaden_flag=ja`) → Weiter → assert Slot-Picker → Slot → Gutachter → SA signieren → Account (auto) → Login → `/kunde/onboarding`.

- [ ] **Step 3: ②-Assertion (der Kern-Verify)**

Im `/kunde/onboarding`-`dokumente`-Step assert: die laut ①-Flags erwarteten Pflicht-Slots erscheinen — **`personenschaden_flag=true` → „Ärztliches Attest" + „Diagnosebericht"; `polizei_vor_ort=true` → „Polizeibericht"; immer → ZB1 + Schaden-/Unfallfotos.** (Quelle: `getOffeneDokumentAnforderungen`, Conditions in `lib/claims/data-requirements.ts`.) ZB1-Foto hochladen → assert OCR füllt Fahrzeugdaten (DB-Check `leads`/`claims` kennzeichen/fin).

- [ ] **Step 4: DB-Verify**

`leads`-Spalten aus ① gesetzt; nach SA: `claims.hat_personenschaden=true`, `polizei_vor_ort=true`; `claim_parties` (geschädigter + ggf. verursacher bei Gegner-Info); `pflichtdokumente`-Slots/`getOffeneDokumentAnforderungen` zeigen die offenen.

- [ ] **Step 5: Falls ②-Gap** (z.B. onboarding berechnet `offenePflichtdokumente` nicht aus dem frischen Claim): minimal fixen (Doc im Plan-Nachtrag), sonst nichts.

- [ ] **Step 6: Cleanup** Fixture löschen (lead/gfa/flow_links/termin/fall/claim), Flag zurück auf `false` + `pm2 save`, Smoke-Script + `.env.local`-Kopie + Screenshots entfernen.

- [ ] **Step 7: Alle Gates** (Handoff §6)

Run:
```
npm dedupe
rm -rf .next/dev/types .next/types && npx tsc --noEmit
npx vitest run
npm run check:token-audit
npm run check:component-set -- --ratchet
npm run check:knip -- --ratchet
```
Expected: alle grün / 0-neu. **`package-lock.json` NICHT committen.** Voller `next build` OOMt im Worktree → der CI-`build`-Job ist der gatende Check.

- [ ] **Step 8: PR gegen `staging`** (nicht selbst mergen)

```bash
gh pr create --base staging --title "feat(AAR-956 P4-A): Self-Service-Feststellung (① pre-SA) + dynamische Pflicht (② Reuse)" --body "<Audit-Block + Spec-Link + Smoke-Ergebnis + Screenshots>"
```

---

## Self-Review (gegen die Spec)

**Spec-Coverage:**
- §4 ① Feststellung → Tasks 3 (Filter) + 4 (Component) + 6 (Wiring) + 2/1 (Save). ✓
- §5 ② Reuse/Verify → Task 7. ✓
- §6 §8b gestrichen → kein Task baut Token-OCR. ✓ (bewusste Nicht-Abdeckung)
- §7 Daten-Fluss → durch `convertLeadToClaim` (unverändert) abgedeckt; Task 7 Step 4 verifiziert das Mapping. ✓
- §8 Quali-Doppelung → `EXCLUDE_FELDER` enthält `schuldfrage` (Task 3); ②-Daten-Nachtrag = YAGNI (kein Task, Default). ✓
- §10 Files → Task-Tabelle deckt alle. ✓

**Placeholder-Scan:** Jeder Code-Step zeigt vollständigen Code; Smoke-Assertions konkret benannt. Einzige bewusste „Recherche im Task": Task 7 Step 1 verweist auf das §3a-Walk-Skript als Vorlage (existiert, Memory-referenziert) — kein Placeholder, sondern Reuse.

**Typ-Konsistenz:** `coerceLeadErfassungWert`/`ladeLeadErfassungLeadsFelder` (Task 1) ↔ Import in Task 2. `istFeststellungsFeld` (Task 3) ↔ Import in Task 4/6. `feststellungPhasen`/`feststellungWerte` (Task 5) ↔ Props in Task 6. `speichereFeststellungFlow(token, values)` (Task 2) ↔ Aufruf in Task 4. Konsistent.

**Offen für Reviewer:** der exakte ①-Feld-Schnitt (`EXCLUDE_FELDER`/`EXCLUDE_SEKTIONEN` in Task 3) ist die eine tunbare Design-Stellschraube — leicht anzupassen, falls Aaron z.B. `fahrzeug_hersteller`/`fahrzeug_modell` doch in ① will.
