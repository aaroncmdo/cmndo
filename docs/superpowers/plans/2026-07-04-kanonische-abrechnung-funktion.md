# Kanonische Abrechnungs-Funktion (P2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eine descriptor-getriebene `createAbrechnung()`, durch die alle 5 Rechnungs-Generatoren laufen — vereinheitlicht das geld-kritische Skelett (Netto→MwSt-Cent-Pfad→Nummer→Header+Positionen-Insert→Mark) und fixt die MwSt-Float-Drift + das hardcodete `19`.

**Architecture:** Ein `createAbrechnung(db, descriptor, input)` trägt das Skelett einmal; per-Rolle-`descriptor`s tragen die Divergenzen (Tabelle/Nummer-Format/Dedup/Mark) als Daten. Eligibility/Rate/Positionen-Bauen + Send bleiben im Caller. 5 Generatoren migrieren inkrementell (ein Task/Commit je Generator) mit Golden-Tests.

**Tech Stack:** TypeScript, Supabase (bestehende Tabellen, KEIN DDL), vitest. Reuse: `calculate-ust.ts`, `generate-rechnungs-nr.ts`, `constants.ts`.

**Spec:** `docs/superpowers/specs/2026-07-04-kanonische-abrechnung-funktion-design.md`

## Global Constraints

- **Branch:** `kitta/kanonische-abrechnung-funktion` (off staging). Nie main; PR gegen staging.
- **KEIN DDL** — reiner Code-Refactor, bestehende Tabellen.
- **Geld-Pfad live:** jede Generator-Migration verhaltens-erhaltend (Golden-Test: alter == neuer Output) **außer** dem beabsichtigten MwSt-Cent-Fix (≤1 Cent, dokumentiert). Ein Generator pro Commit, einzeln reviewbar/rollback-bar.
- **MwSt nur über `calculateUst(netto_cent, 19)`** (Cent-Integer). Netto IMMER in Cent summieren (`eurToCent` je Position), nie Float-Akku.
- **Reuse, nicht neu:** `nextRechnungsNrRaw` (Nummer), `calculateUst`/`eurToCent`/`centToEur` (MwSt), `FINANCE.*` (Raten).
- **Multi-Session:** Billing-Files sind heiß. Jede Migration: `git branch --show-current` == `kitta/kanonische-abrechnung-funktion` prüfen; NIE checkout/switch; additive/isolierte Änderung.
- **Gates vor jedem Commit:** `npx tsc --noEmit`; bei Cron-Route-Änderung `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; `npx vitest run <betroffene>`; am Ende knip/token-audit/component-set `--ratchet`.

---

## File Structure

**Neu:**
- `src/lib/abrechnung/create-abrechnung.ts` — `createAbrechnung()` + Descriptor-/Result-Typen.
- `src/lib/abrechnung/create-abrechnung.test.ts` — vitest (Fake-DB).
- `src/lib/abrechnung/descriptors/` — je Generator ein Descriptor + dessen Golden-Test (oder Descriptor lokal beim Generator; ein File pro Rolle).

**Modifiziert (je 1 Migration):** `create-onboarding-rechnung.ts`, `embed-abrechnung-erstellen/route.ts`, `abrechnung-erstellen/route.ts`, `abrechnung/kanzlei/erstelle-abrechnung.ts`, `finance/abrechnungen-generator.ts`.

---

## Task 1: `createAbrechnung()`-Kern + Descriptor-Typ (TDD)

**Files:**
- Create: `src/lib/abrechnung/create-abrechnung.ts`, `src/lib/abrechnung/create-abrechnung.test.ts`

**Interfaces:**
- Consumes: `calculateUst(netto_cent, ust_satz_pct=19)` + `eurToCent`/`centToEur` aus `@/lib/billing/calculate-ust`; `nextRechnungsNrRaw(serie, jahr)` aus `@/lib/billing/generate-rechnungs-nr` (self-clientet, kein db-Arg).
- Produces (für Tasks 2-6): `createAbrechnung`, `AbrechnungDescriptor`, `AbrechnungInput`, `BerechneteBetraege`, `CreateAbrechnungResult` (Signaturen unten).

- [ ] **Step 1: Failing test** — `create-abrechnung.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { createAbrechnung, type AbrechnungDescriptor } from './create-abrechnung'

vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn().mockResolvedValue(7),
}))

function fakeDb(inserts: Record<string, unknown[]>) {
  return {
    from: (t: string) => ({
      insert: (row: unknown) => {
        inserts[t] = inserts[t] ?? []
        if (Array.isArray(row)) inserts[t].push(...row); else inserts[t].push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'HDR-1' }, error: null }) }) }
      },
    }),
  } as any
}
const desc: AbrechnungDescriptor = {
  zielTabelle: 'abrechnungen', positionenTabelle: 'abrechnung_positionen', positionsFkSpalte: 'abrechnung_id',
  nummer: () => ({ serie: 'CMNDO-05', jahr: 2026, format: (j, n) => `CMNDO-${j}-05-${String(n).padStart(4, '0')}` }),
  buildHeaderRow: (b) => ({ empfaenger_typ: 'sv', abrechnungs_nr: b.nummer, summe_netto: b.nettoCent / 100, ust_betrag: b.ustCent / 100, summe_brutto: b.bruttoCent / 100 }),
  buildPositionRow: (p, id) => ({ abrechnung_id: id, betrag_netto: (p.betrag_netto_cent as number) / 100 }),
}

describe('createAbrechnung', () => {
  it('summiert Netto in Cent, rechnet USt Cent-Pfad, allokiert Nummer, inserted Header+Positionen', async () => {
    const inserts: Record<string, unknown[]> = {}
    const r = await createAbrechnung(fakeDb(inserts), desc, {
      positionen: [{ betrag_netto_cent: 15000 }, { betrag_netto_cent: 7000 }], kontext: {},
    })
    expect(r).toMatchObject({ ok: true, erstellt: true, id: 'HDR-1', nummer: 'CMNDO-2026-05-0007' })
    if (r.ok && r.erstellt) expect(r.betraege).toMatchObject({ nettoCent: 22000, ustCent: 4180, bruttoCent: 26180, ustSatz: 19 })
    expect(inserts['abrechnungen']).toHaveLength(1)
    expect(inserts['abrechnung_positionen']).toHaveLength(2)
  })
  it('Dedup-Treffer -> erstellt:false, kein Insert', async () => {
    const inserts: Record<string, unknown[]> = {}
    const r = await createAbrechnung(fakeDb(inserts), { ...desc, pruefeBestehend: () => Promise.resolve('EXIST-9') }, { positionen: [{ betrag_netto_cent: 100 }], kontext: {} })
    expect(r).toEqual({ ok: true, erstellt: false, bestehendeId: 'EXIST-9' })
    expect(inserts['abrechnungen']).toBeUndefined()
  })
})
```
- [ ] **Step 2: Test → FAIL** — `npx vitest run src/lib/abrechnung/create-abrechnung.test.ts` (module not found).
- [ ] **Step 3: Implementieren** — `create-abrechnung.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateUst } from '@/lib/billing/calculate-ust'
import { nextRechnungsNrRaw } from '@/lib/billing/generate-rechnungs-nr'

export interface BerechneteBetraege { nettoCent: number; ustCent: number; bruttoCent: number; ustSatz: number; nummer: string }
export interface AbrechnungInput { positionen: Array<{ betrag_netto_cent: number } & Record<string, unknown>>; kontext: Record<string, unknown> }
export interface AbrechnungDescriptor {
  zielTabelle: string
  positionenTabelle: string | null
  positionsFkSpalte: string | null
  ustSatz?: number
  nummer: (kontext: Record<string, unknown>) => { serie: string; jahr: number; format: (jahr: number, lfdNr: number) => string }
  buildHeaderRow: (b: BerechneteBetraege, positionen: AbrechnungInput['positionen'], kontext: Record<string, unknown>) => Record<string, unknown>
  buildPositionRow?: (position: Record<string, unknown>, headerId: string, kontext: Record<string, unknown>) => Record<string, unknown>
  pruefeBestehend?: (db: SupabaseClient<any>, kontext: Record<string, unknown>) => Promise<string | null>
  markiere?: (db: SupabaseClient<any>, headerId: string, positionen: AbrechnungInput['positionen'], kontext: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
}
export type CreateAbrechnungResult =
  | { ok: true; erstellt: true; id: string; nummer: string; betraege: BerechneteBetraege; markiertOk: boolean }
  | { ok: true; erstellt: false; bestehendeId: string }
  | { ok: false; error: string }

export async function createAbrechnung(
  db: SupabaseClient<any>, descriptor: AbrechnungDescriptor, input: AbrechnungInput,
): Promise<CreateAbrechnungResult> {
  const { positionen, kontext } = input
  if (descriptor.pruefeBestehend) {
    const bestehendeId = await descriptor.pruefeBestehend(db, kontext)
    if (bestehendeId) return { ok: true, erstellt: false, bestehendeId }
  }
  const nettoCent = positionen.reduce((s, p) => s + Math.round(p.betrag_netto_cent), 0)
  const { ust_cent, brutto_cent, ust_satz_pct } = calculateUst(nettoCent, descriptor.ustSatz ?? 19)
  const spec = descriptor.nummer(kontext)
  let nummer: string
  try {
    const lfdNr = await nextRechnungsNrRaw(spec.serie, spec.jahr)
    nummer = spec.format(spec.jahr, lfdNr)
  } catch (err) { return { ok: false, error: `Nummer-Allokation fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` } }
  const betraege: BerechneteBetraege = { nettoCent, ustCent: ust_cent, bruttoCent: brutto_cent, ustSatz: ust_satz_pct, nummer }
  const { data: header, error: headerErr } = await db.from(descriptor.zielTabelle).insert(descriptor.buildHeaderRow(betraege, positionen, kontext)).select('id').single()
  if (headerErr || !header) return { ok: false, error: `Header-Insert fehlgeschlagen: ${headerErr?.message ?? 'kein Datensatz'}` }
  const id = (header as { id: string }).id
  if (descriptor.positionenTabelle && descriptor.buildPositionRow) {
    const rows = positionen.map((p) => descriptor.buildPositionRow!(p, id, kontext))
    const { error: posErr } = await db.from(descriptor.positionenTabelle).insert(rows)
    if (posErr) return { ok: false, error: `Positionen-Insert fehlgeschlagen: ${posErr.message}` }
  }
  let markiertOk = true
  if (descriptor.markiere) {
    const r = await descriptor.markiere(db, id, positionen, kontext)
    markiertOk = r.ok
    if (!r.ok) console.error(`[createAbrechnung] markiere fehlgeschlagen (id=${id}):`, r.error)
  }
  return { ok: true, erstellt: true, id, nummer, betraege, markiertOk }
}
```
- [ ] **Step 4: Test → PASS** (2/2).
- [ ] **Step 5: `npx tsc --noEmit`** grün.
- [ ] **Step 6: Commit** — `git commit -m "feat(finance): createAbrechnung canonical generation core + descriptor type"`

---

## Tasks 2-6: Generator-Migrationen (je 1 Task, Risiko-Reihenfolge)

**Gemeinsames Protokoll pro Migration** (der Implementer liest den EXAKTEN aktuellen Generator + überträgt):
1. **Descriptor bauen** (Werte s. Spec §6 + unten) — Tabelle/Nummer-Format/Positionen/Dedup/Mark aus dem aktuellen Generator 1:1 in den Descriptor überführen. `buildHeaderRow` mappt `betraege` (Cent) auf die exakten Header-Spalten des Generators (Cent für onboarding, `centToEur` für #1-4). `pruefeBestehend` = die bestehende Dedup-Query. `markiere` = der bestehende Mark-Write (Result-shape `{ok,error?}`).
2. **Positionen in Cent** — im Caller je Position `betrag_netto_cent: eurToCent(<altes netto>)` setzen; rollen-spezifische Positions-Felder unverändert mitgeben.
3. **Skelett ersetzen** — den inline-Block (Netto-Summe + MwSt-`Math.round`-Zeilen + Nummer + Header-Insert + Positionen-Insert + Mark) durch **einen** `createAbrechnung(db, descriptor, {positionen, kontext})`-Call ersetzen. Eligibility/Rate/Positionen-Bauen + **Send** bleiben unverändert im Caller (Send konsumiert das zurückgegebene `{id, nummer, betraege}`).
4. **Golden-Test** — `descriptors/<rolle>.golden.test.ts`: für repräsentative Positionen (ganz-Euro + fraktional) assert, dass die von `createAbrechnung`+Descriptor berechneten `betraege` (netto/ust/brutto Cent) und die `buildHeaderRow`-Ausgabe der ALTEN Inline-Formel entsprechen — **außer** dem MwSt-Cent-Fix (ganz-Euro identisch; fraktional ≤1-Cent-Delta explizit als erwartet asserten + kommentieren).
5. **Gates** — `tsc`; bei Cron-Route `npm run build`; `vitest` (Golden + Kern). Commit.

### Task 2: Onboarding (`src/lib/billing/create-onboarding-rechnung.ts`) — 0 Betrags-Änderung
Nutzt SCHON `calculateUst` (Cent) → reiner Struktur-Umbau, Golden-Test muss **byte-gleich** sein (kein Cent-Delta). Descriptor: `zielTabelle:'sv_onboarding_rechnungen'`, `positionenTabelle:null`, Nummer `CM-ONB-{jahr}-{pad5}` (serie `CM-ONB`), `buildHeaderRow` → Cent-Spalten (`netto_cent/ust_cent/brutto_cent/ust_satz_pct` direkt aus `betraege`), Dedup upstream (kein `pruefeBestehend`), keine `markiere`. **Sicherster Erst-Beweis des Mechanismus.** Commit `feat(finance): migrate onboarding invoice to createAbrechnung`.

### Task 3: Embed (`src/app/api/cron/embed-abrechnung-erstellen/route.ts`)
Descriptor: `zielTabelle:'abrechnungen'` (typ=sv), Nummer `CMNDO-EMB-{jahr}-{MM}-{pad3}`, `positionenTabelle:'embed_abrechnung_positionen'` (FK `abrechnung_id`), `pruefeBestehend`=LIKE-Guard, `markiere`=`gutachter_finder_anfragen.abrechnung_id/abgerechnet_am`. Cron-Route → `npm run build`. Commit `feat(finance): migrate embed invoice to createAbrechnung`.

### Task 4: SV-Monat (`src/app/api/cron/abrechnung-erstellen/route.ts`) — 2 Sub-Pfade
Individual + Org-Sammelrechnung: **derselbe** Descriptor (`zielTabelle:'abrechnungen'` typ=sv, Nummer `CMNDO-{jahr}-{MM}-{pad4}`, `positionenTabelle:'abrechnung_positionen'`, Dedup LIKE+Orphan-Relink, `markiere`=`claims.abrechnung_id`), zweimal aufgerufen mit unterschiedlichem `kontext` (empfaenger). Header-JSONB `positionen` in `buildHeaderRow` mit einbetten (Generator schreibt beides). Cron-Route → `npm run build`. Commit `feat(finance): migrate SV monthly invoice to createAbrechnung`.

### Task 5: Kanzlei-B (`src/lib/abrechnung/kanzlei/erstelle-abrechnung.ts`)
Descriptor: `zielTabelle:'kanzlei_abrechnungen'`, Nummer `CMNDO-K-{jahr}-{MM}-{pad3}`, `positionenTabelle:'kanzlei_abrechnung_positionen'`, Dedup kanzlei_id+monat+jahr, `markiere`=`claims.kanzlei_abrechnung_id`+`kanzlei_provision_status`. Zwei-Phasen-Status (insert 'offen' → Caller sendet PDF+Magic-Link → 'versendet'): `buildHeaderRow` setzt 'offen'; der Send + Status→'versendet' bleibt im Caller. Commit `feat(finance): migrate kanzlei invoice to createAbrechnung`.

### Task 6: Marketing/Kanzlei-A (`src/lib/finance/abrechnungen-generator.ts`) — fixt hardcoded-19
Descriptor: `zielTabelle:'abrechnungen'` (typ=marketing bzw. kanzlei), Nummer `CL-{jahr-MM}-{TYP}-{pad3}`, `positionenTabelle:null` (Positionen NUR Header-JSONB → in `buildHeaderRow` einbetten), Dedup empfaenger_typ+zeitraum, keine `markiere` (status='entwurf'). **Hier verschwindet das hardcodete `ustSatz=19`** — der Cent-Pfad zieht `FINANCE.MWST_PROZENT` bzw. den Descriptor-Default 19; Golden-Test dokumentiert etwaige Cent-Deltas. Zwei Descriptors (marketing + kanzlei) ODER einer mit typ im kontext. Commit `feat(finance): migrate marketing/kanzlei-A invoice to createAbrechnung (fix hardcoded 19)`.

---

## Task 7: Volle Gates + PR
- [ ] **Step 1:** `npx tsc --noEmit`; `NODE_OPTIONS=--max-old-space-size=8192 npm run build`; `npm run check:knip -- --ratchet`; `npm run check:token-audit`; `npm run check:component-set -- --ratchet`; `npx vitest run src/lib/abrechnung src/lib/billing`. Alle grün.
- [ ] **Step 2:** 7-Punkte-Audit dokumentieren.
- [ ] **Step 3:** PR `--base staging --body-file` (Beschreibung: eine createAbrechnung, 5 Generatoren migriert, MwSt-Cent-Fix als einzige beabsichtigte Betrags-Änderung + Golden-Test-Nachweis; System-A-Retirement als Follow-up geflaggt).

---

## Self-Review

**Spec-Coverage:** §3 Architektur → Task 1. §4 Contract → Task 1 (exakte Signaturen). §5 MwSt-Cent-Pfad → Task 1 (`calculateUst`) + jede Migration. §6 Per-Generator-Descriptors → Tasks 2-6 (je Descriptor). §7 inkrementelle Migration+Golden → Tasks 2-6 Protokoll. §8 Tests → Task 1 + Golden je Migration + Task 7 Gates. Alle Anforderungen haben Tasks.

**Placeholder-Scan:** Task 1 vollständiger Code. Tasks 2-6 sind **Transformationen bestehenden Codes** — der Descriptor je Rolle ist mit exakten Werten (Tabelle/Format/Dedup/Mark aus Spec §6) spezifiziert; der Implementer liest den konkreten Generator und überträgt das Skelett. Das ist kein Platzhalter, sondern eine präzise Refactor-Anweisung (der „neue Code" = 1 createAbrechnung-Call + der Descriptor; der „alte Code" wird gelesen, nicht erraten).

**Type-Consistency:** `createAbrechnung`/`AbrechnungDescriptor`/`BerechneteBetraege`/`CreateAbrechnungResult` in Task 1 definiert, in Tasks 2-6 konsumiert — Namen konsistent. `betrag_netto_cent` (Input), `betraege.{nettoCent,ustCent,bruttoCent}` (Output) durchgängig.

## Execution Handoff
`superpowers:subagent-driven-development` (empfohlen): frischer Subagent je Task, Review dazwischen, Golden-Test-Gate je Migration + finaler Whole-Branch-Review (Geld-Pfad!).
