# ZB1-Scan-Fahrzeuganlage (Batch) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flotten-Fahrzeuge per ZB1-Scan als FIN-deduplizierte `vehicles`-Zeilen anlegen — im Batch (mehrere ZB1s → Sammel-Review → alle anlegen), aus dem Flottenmanager- und dem Admin-Vertrieb-Portal.

**Architecture:** Compose-Job. OCR (`runZB1Ocr`, Google Vision), FIN-Dedup-Write (`ensureVehicleFromFin` → `upsert_vehicle_by_fin`) und Flotten-Binding existieren. Neu sind ein reiner Mapper, drei dünne Lib-/Action-Funktionen und eine Batch-Review-UI. Kein DDL.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Supabase · vitest · Google Vision (bestehend)

**Spec:** `docs/superpowers/specs/2026-07-15-firmen-flotte-zb1-batch-anlage-design.md`
**Branch:** `kitta/firmen-flotte-zb1-batch-anlage` (off `origin/staging`)

## Global Constraints

- **Regel 1:** Nie auf `main`. PR gegen `staging`.
- **Regel 4:** Prod-Smoke nach Deploy (Verdrahtung Scan→Review→Anlage→DB; OCR-Trefferquote ist nicht Teil des Smokes).
- **Umlaute:** Alle **nutzersichtbaren** Strings mit echten `ä/ö/ü/ß`. Code-Kommentare/Commits dürfen ASCII sein.
- **Server-Actions:** Result-Object, **kein** `throw`. `revalidatePath` bei jedem Write.
- **Komponenten:** `@/components/primitives` (Button, Drawer) + `@/components/shared` (SectionCard). Status-Badges über die Registry (`@/lib/status`), keine neue Farb-Map.
- **`createAdminClient()` ist UNGETYPT** → jeden neuen Select gegen prod proben (READ), sonst stiller PostgREST-400.
- **Prod-DB-ref:** `paizkjajbuxxksdoycev`.
- **KEIN DDL.** Alle Spalten existieren (`vehicles.*`, `flotten_fahrzeuge`, `vehicles.zb1_dokument_id`).
- **Territorium:** `src/lib/ocr/*` nur **importieren**; `src/lib/vehicles/ensure-vehicle.ts` nur **aufrufen**; `src/app/admin/vertrieb/**` ist geteilt → Marker liegt (`COORDINATION-...`). `convert-lead-to-claim.ts` / aar-956 **nicht anfassen**.
- **Arbeitsverzeichnis:** `.claude/worktrees/firmen-flotte-zb1-batch-anlage`

**Verifizierte Reuse-Signaturen:**
```ts
// @/lib/ocr/zb1-parser
runZB1Ocr(base64: string): Promise<{ fullText: string; extracted: ZB1ExtractedData } | { error: string; status?: number }>
type ZB1ExtractedData = { kennzeichen, erstzulassung, fahrzeug_baujahr: number|null, halter_nachname, halter_vorname,
  halter_strasse, halter_plz, halter_stadt, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_farbe, fin_vin, hsn, tsn, brn }  // Rest string|null
// @/lib/vehicles/ensure-vehicle
type VehicleSnapshot = { kennzeichen?, hersteller?, modell?, hsn?, tsn?, kilometerstand?, kennzeichenBuchstaben?, farbe?, farbcode?, baujahr?: number|null, erstzulassung?, finQuelle? }  // string|null
type EnsureVehicleResult = { ok: true; vehicleId: string } | { ok: false; error: string }
ensureVehicleFromFin(p: { fin: string|null; snapshot?: VehicleSnapshot; ownerId?: string|null; db: SupabaseClient }): Promise<EnsureVehicleResult>
createVehicleStub(p: { snapshot?: VehicleSnapshot; db: SupabaseClient }): Promise<EnsureVehicleResult>
// @/lib/flotte/mutate-flotte  (addFahrzeugToFlotte -> Boy-Scout in Task 2)
addFahrzeugToFlotte(db, firmaId, form: FahrzeugForm, userId): Promise<{ ok: boolean; error?: string }>
// @/lib/flotte/konto-firma
getFlottenmanagerFirma(db, userId): Promise<KundeFirma | null>   // KundeFirma hat { id, name, ... }
// @/lib/kunde/firma-flotte
type FahrzeugForm = { kennzeichen: string; hersteller?: string; modell?: string; notiz?: string }
```

---

# SLICE A — Lib-Kern (Task 1–3)

### Task 1: Mapper `zb1ToVehicleSnapshot`

**Files:**
- Create: `src/lib/flotte/zb1-vehicle.ts`
- Test: `src/lib/flotte/zb1-vehicle.test.ts`

**Interfaces:**
- Consumes: `ZB1ExtractedData` (Typ aus `@/lib/ocr/zb1-parser`), `VehicleSnapshot` (aus `@/lib/vehicles/ensure-vehicle`)
- Produces: `zb1ToVehicleSnapshot(e: ZB1ExtractedData): VehicleSnapshot` + `type EditierbareFahrzeugFelder` (das, was der Review-Screen editiert) — beide von Task 3 + Task 5 genutzt.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { zb1ToVehicleSnapshot } from './zb1-vehicle'
import type { ZB1ExtractedData } from '@/lib/ocr/zb1-parser'

const leer: ZB1ExtractedData = {
  kennzeichen: null, erstzulassung: null, fahrzeug_baujahr: null,
  halter_nachname: null, halter_vorname: null, halter_strasse: null, halter_plz: null, halter_stadt: null,
  fahrzeug_hersteller: null, fahrzeug_modell: null, fahrzeug_farbe: null,
  fin_vin: null, hsn: null, tsn: null, brn: null,
}

describe('zb1ToVehicleSnapshot', () => {
  it('mappt die ZB1-Felder auf den VehicleSnapshot + setzt finQuelle', () => {
    const snap = zb1ToVehicleSnapshot({
      ...leer,
      kennzeichen: 'K-AB 1234', fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d',
      hsn: '0005', tsn: 'ABC', fahrzeug_farbe: 'Schwarz', fahrzeug_baujahr: 2020, erstzulassung: '2020-03-01',
    })
    expect(snap).toMatchObject({
      kennzeichen: 'K-AB 1234', hersteller: 'BMW', modell: '320d',
      hsn: '0005', tsn: 'ABC', farbe: 'Schwarz', baujahr: 2020, erstzulassung: '2020-03-01',
      finQuelle: 'zb1_ocr',
    })
  })

  it('die FIN wandert NICHT in den Snapshot (ensureVehicleFromFin nimmt sie separat)', () => {
    const snap = zb1ToVehicleSnapshot({ ...leer, fin_vin: 'WBA12345678901234' })
    expect(snap).not.toHaveProperty('fin')
  })

  it('leere ZB1 → Snapshot mit nur finQuelle (alle anderen null/undefined)', () => {
    const snap = zb1ToVehicleSnapshot(leer)
    expect(snap.finQuelle).toBe('zb1_ocr')
    expect(snap.kennzeichen ?? null).toBeNull()
  })
})
```

- [ ] **Step 2: Run — fails** (`Failed to resolve import "./zb1-vehicle"`)

```bash
npx vitest run src/lib/flotte/zb1-vehicle.test.ts
```

- [ ] **Step 3: Implement**

```ts
// Reines Mapping ZB1-OCR -> VehicleSnapshot. Die FIN wird bewusst NICHT gemappt:
// ensureVehicleFromFin nimmt sie als eigenes Argument (sie ist der Dedup-Key, nicht Teil
// des Nachtrag-Snapshots). finQuelle='zb1_ocr' markiert die Provenienz in vehicles.fin_quelle.
import type { ZB1ExtractedData } from '@/lib/ocr/zb1-parser'
import type { VehicleSnapshot } from '@/lib/vehicles/ensure-vehicle'

/** Die im Review editierbaren Felder einer gescannten Zeile (FIN separat). */
export type EditierbareFahrzeugFelder = {
  fin: string | null
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  hsn: string | null
  tsn: string | null
  farbe: string | null
  erstzulassung: string | null
  baujahr: number | null
}

export function zb1ToVehicleSnapshot(e: ZB1ExtractedData): VehicleSnapshot {
  return {
    kennzeichen: e.kennzeichen,
    hersteller: e.fahrzeug_hersteller,
    modell: e.fahrzeug_modell,
    hsn: e.hsn,
    tsn: e.tsn,
    farbe: e.fahrzeug_farbe,
    baujahr: e.fahrzeug_baujahr,
    erstzulassung: e.erstzulassung,
    finQuelle: 'zb1_ocr',
  }
}

/** ZB1-OCR -> die editierbare Review-Zeile (FIN inklusive, fuer die Anzeige). */
export function zb1ToFelder(e: ZB1ExtractedData): EditierbareFahrzeugFelder {
  return {
    fin: e.fin_vin, kennzeichen: e.kennzeichen, hersteller: e.fahrzeug_hersteller,
    modell: e.fahrzeug_modell, hsn: e.hsn, tsn: e.tsn, farbe: e.fahrzeug_farbe,
    erstzulassung: e.erstzulassung, baujahr: e.fahrzeug_baujahr,
  }
}

/** Die editierten Review-Felder -> VehicleSnapshot (fuer die Anlage nach Nutzer-Korrektur). */
export function felderToSnapshot(f: EditierbareFahrzeugFelder): VehicleSnapshot {
  return {
    kennzeichen: f.kennzeichen, hersteller: f.hersteller, modell: f.modell,
    hsn: f.hsn, tsn: f.tsn, farbe: f.farbe, baujahr: f.baujahr,
    erstzulassung: f.erstzulassung, finQuelle: 'zb1_ocr',
  }
}
```

Ergänze in der Test-Datei zwei Fälle für `felderToSnapshot` (analog zu `zb1ToVehicleSnapshot`: FIN nicht im Snapshot, finQuelle gesetzt).

- [ ] **Step 4: Run — passes**

```bash
npx vitest run src/lib/flotte/zb1-vehicle.test.ts
```

- [ ] **Step 5: Commit** — `feat(zb1): Mapper ZB1-OCR -> VehicleSnapshot/Review-Felder` (7-Punkte-Audit im Body + Co-Authored-By).

---

### Task 2: `bindeVehicleAnFlotte` (N:M-Extraktion, Boy-Scout)

**Files:**
- Modify: `src/lib/flotte/mutate-flotte.ts`
- Modify: `src/lib/flotte/mutate-flotte.test.ts`

**Interfaces:**
- Produces: `bindeVehicleAnFlotte(db, p: { firmaId: string; vehicleId: string; userId: string; notiz?: string|null }): Promise<{ ok: boolean; bereitsVorhanden?: boolean; error?: string }>` — von Task 3 genutzt.
- `addFahrzeugToFlotte` behält **exakt** seine bestehende Signatur + sein 23505-Verhalten (Regressionsschutz für die 4 Consumer).

- [ ] **Step 1: Write the failing test** (an `mutate-flotte.test.ts` anhängen)

```ts
import { bindeVehicleAnFlotte } from './mutate-flotte'

describe('bindeVehicleAnFlotte', () => {
  it('bindet ein Fahrzeug an die Flotte', async () => {
    const db = { from: () => ({ insert: async () => ({ error: null }) }) } as any
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: true })
  })
  it('23505 (UNIQUE firma_id,vehicle_id) -> bereitsVorhanden, KEIN Fehler', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as any
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, bereitsVorhanden: true })
  })
  it('anderer Fehler -> ok:false + error', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23503', message: 'fk' } }) }) } as any
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, error: 'fk' })
  })
})
```

Prüfe: die bestehenden `addFahrzeugToFlotte`-Tests in derselben Datei müssen **unverändert grün** bleiben.

- [ ] **Step 2: Run — new fails, old pass**

```bash
npx vitest run src/lib/flotte/mutate-flotte.test.ts
```

- [ ] **Step 3: Implement** — `bindeVehicleAnFlotte` hinzufügen, `addFahrzeugToFlotte` den inline-Insert durch den Aufruf ersetzen:

```ts
/** Reiner flotten_fahrzeuge-N:M-Insert. 23505 (UNIQUE firma_id,vehicle_id) = "schon gebunden",
 *  NICHT als Fehler, sondern als bereitsVorhanden. */
export async function bindeVehicleAnFlotte(
  db: AnyDb,
  p: { firmaId: string; vehicleId: string; userId: string; notiz?: string | null },
): Promise<{ ok: boolean; bereitsVorhanden?: boolean; error?: string }> {
  const { error } = await db.from('flotten_fahrzeuge').insert({
    firma_id: p.firmaId, vehicle_id: p.vehicleId, added_by_user_id: p.userId, notiz: p.notiz?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, bereitsVorhanden: true }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
```

Und in `addFahrzeugToFlotte` den Block `const { error } = await db.from('flotten_fahrzeuge').insert({...}); if (error) {...}` ersetzen durch:
```ts
  const bind = await bindeVehicleAnFlotte(db, { firmaId, vehicleId: veh.vehicleId, userId, notiz: form.notiz })
  if (!bind.ok) return { ok: false, error: bind.bereitsVorhanden ? 'Dieses Fahrzeug ist bereits in der Flotte.' : bind.error }
  return { ok: true }
```
(behält die exakte bestehende Fehlermeldung — Regressionsschutz.)

- [ ] **Step 4: Run — all pass** (`npx vitest run src/lib/flotte/mutate-flotte.test.ts`)

- [ ] **Step 5: Commit** — `refactor(flotte): bindeVehicleAnFlotte extrahiert (Boy-Scout) + 23505-Semantik`

---

### Task 3: `legeFlottenFahrzeugeAn` (Batch-Anlage, non-atomar)

**Files:**
- Create: `src/lib/flotte/zb1-batch-anlage.ts`
- Test: `src/lib/flotte/zb1-batch-anlage.test.ts`

**Interfaces:**
- Consumes: `felderToSnapshot` (T1), `bindeVehicleAnFlotte` (T2), `ensureVehicleFromFin`/`createVehicleStub` (bestehend)
- Produces: `type BatchAnlageZeile = { felder: EditierbareFahrzeugFelder; bereitsInFlotte: boolean }`, `type BatchAnlageErgebnis` (aus Spec §4.2), `legeFlottenFahrzeugeAn(db, zeilen: BatchAnlageZeile[], firmaId, userId): Promise<BatchAnlageErgebnis[]>` — von Task 5 (UI) + Task 7/8 (Actions) genutzt. Das ZB1-Bild wird in Task 6 ergänzt.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'

const ensureMock = vi.fn()
const stubMock = vi.fn()
const bindeMock = vi.fn()
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  ensureVehicleFromFin: (...a: unknown[]) => ensureMock(...a),
  createVehicleStub: (...a: unknown[]) => stubMock(...a),
}))
vi.mock('./mutate-flotte', () => ({ bindeVehicleAnFlotte: (...a: unknown[]) => bindeMock(...a) }))

import { legeFlottenFahrzeugeAn } from './zb1-batch-anlage'

const felder = (fin: string | null, kz = 'K-AA 1') => ({
  fin, kennzeichen: kz, hersteller: 'BMW', modell: '320d', hsn: null, tsn: null, farbe: null, erstzulassung: null, baujahr: null,
})
const db = {} as any

beforeEach(() => { ensureMock.mockReset(); stubMock.mockReset(); bindeMock.mockReset() })

describe('legeFlottenFahrzeugeAn', () => {
  it('mit FIN -> ensureVehicleFromFin + bind -> angelegt', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder('WBA12345678901234'), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('angelegt')
  })
  it('bereitsInFlotte -> vehicle refresht, KEIN bind -> aktualisiert', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder('WBA12345678901234'), bereitsInFlotte: true }], 'f1', 'u1')
    expect(r[0].status).toBe('aktualisiert')
    expect(bindeMock).not.toHaveBeenCalled()
  })
  it('keine FIN -> createVehicleStub -> stub', async () => {
    stubMock.mockResolvedValue({ ok: true, vehicleId: 'v2' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder(null), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('stub')
    expect(ensureMock).not.toHaveBeenCalled()
  })
  it('NON-ATOMAR: Zeile 2 scheitert, Zeile 1+3 laufen durch', async () => {
    ensureMock
      .mockResolvedValueOnce({ ok: true, vehicleId: 'v1' })
      .mockResolvedValueOnce({ ok: false, error: 'FIN ungueltig' })
      .mockResolvedValueOnce({ ok: true, vehicleId: 'v3' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [
      { felder: felder('WBA00000000000001'), bereitsInFlotte: false },
      { felder: felder('WBA00000000000002'), bereitsInFlotte: false },
      { felder: felder('WBA00000000000003'), bereitsInFlotte: false },
    ], 'f1', 'u1')
    expect(r.map((x) => x.status)).toEqual(['angelegt', 'fehler', 'angelegt'])
  })
})
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureVehicleFromFin, createVehicleStub } from '@/lib/vehicles/ensure-vehicle'
import { bindeVehicleAnFlotte } from './mutate-flotte'
import { felderToSnapshot, type EditierbareFahrzeugFelder } from './zb1-vehicle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type BatchAnlageZeile = { felder: EditierbareFahrzeugFelder; bereitsInFlotte: boolean }
export type BatchAnlageErgebnis = {
  zeileIndex: number
  kennzeichen: string | null
  status: 'angelegt' | 'aktualisiert' | 'stub' | 'fehler'
  error?: string
}

const FIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/** Batch-Anlage, NICHT atomar: jede Zeile wird einzeln versucht, ein Fehler stoppt die anderen nicht. */
export async function legeFlottenFahrzeugeAn(
  db: AnyDb,
  zeilen: BatchAnlageZeile[],
  firmaId: string,
  userId: string,
): Promise<BatchAnlageErgebnis[]> {
  const out: BatchAnlageErgebnis[] = []
  for (let i = 0; i < zeilen.length; i++) {
    const { felder, bereitsInFlotte } = zeilen[i]
    const kennzeichen = felder.kennzeichen
    try {
      const fin = felder.fin?.trim().toUpperCase() || null
      const hatFin = !!fin && FIN_REGEX.test(fin)

      if (hatFin) {
        const veh = await ensureVehicleFromFin({ fin, snapshot: felderToSnapshot(felder), db })
        if (!veh.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: veh.error }); continue }
        if (bereitsInFlotte) { out.push({ zeileIndex: i, kennzeichen, status: 'aktualisiert' }); continue }
        const bind = await bindeVehicleAnFlotte(db, { firmaId, vehicleId: veh.vehicleId, userId })
        if (bind.bereitsVorhanden) { out.push({ zeileIndex: i, kennzeichen, status: 'aktualisiert' }); continue }
        if (!bind.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: bind.error }); continue }
        out.push({ zeileIndex: i, kennzeichen, status: 'angelegt' })
      } else {
        // Kein/ungueltiges FIN -> Stub (kein Dedup, keine Anreicherung).
        const veh = await createVehicleStub({ snapshot: felderToSnapshot(felder), db })
        if (!veh.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: veh.error }); continue }
        const bind = await bindeVehicleAnFlotte(db, { firmaId, vehicleId: veh.vehicleId, userId })
        if (bind.bereitsVorhanden) { out.push({ zeileIndex: i, kennzeichen, status: 'aktualisiert' }); continue }
        if (!bind.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: bind.error }); continue }
        out.push({ zeileIndex: i, kennzeichen, status: 'stub' })
      }
    } catch (err) {
      out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }
  return out
}
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit** — `feat(zb1): legeFlottenFahrzeugeAn — Batch-Anlage (non-atomar, FIN-Dedup + Stub-Fallback)`

---

# SLICE B — Scan + Review-UI (Task 4–5)

### Task 4: `scanZb1FuerFlotte` (OCR + Dedup-Check + Halter)

**Files:**
- Create: `src/lib/flotte/zb1-scan.ts`
- Test: `src/lib/flotte/zb1-scan.test.ts`

**Interfaces:**
- Consumes: `runZB1Ocr` (mocked im Test), `zb1ToFelder` (T1)
- Produces: `type ScanErgebnis` (Spec §4.2, aber mit `felder: EditierbareFahrzeugFelder` statt rohem extracted), `scanZb1FuerFlotte(db, base64, firmaId): Promise<{ ok: true; ergebnis: ScanErgebnis } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
const ocrMock = vi.fn()
vi.mock('@/lib/ocr/zb1-parser', () => ({ runZB1Ocr: (...a: unknown[]) => ocrMock(...a) }))
import { scanZb1FuerFlotte } from './zb1-scan'

// db-Mock: FIN-Dup-Check (maybeSingle) + firmen.name (maybeSingle)
function makeDb(finVorhanden: boolean, firmaName: string | null) {
  return {
    from: (t: string) => t === 'firmen'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: firmaName ? { name: firmaName } : null }) }) }) }
      : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: finVorhanden ? { vehicle_id: 'v1' } : null }) }) }) }) },
  } as any
}
const extracted = (fin: string | null, halter = 'Schmidt Logistik') => ({
  kennzeichen: 'K-AA 1', erstzulassung: null, fahrzeug_baujahr: null, halter_nachname: halter, halter_vorname: null,
  halter_strasse: null, halter_plz: null, halter_stadt: null, fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d',
  fahrzeug_farbe: null, fin_vin: fin, hsn: '0005', tsn: 'ABC', brn: null,
})

describe('scanZb1FuerFlotte', () => {
  it('erkennt Confidence aus den 5 Kernfeldern', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234') }) // fin+hsn+tsn+kz = 4/5
    const r = await scanZb1FuerFlotte(makeDb(false, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.confidence).toBeCloseTo(0.8)
  })
  it('FIN schon in der Flotte -> bereitsInFlotte', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234') })
    const r = await scanZb1FuerFlotte(makeDb(true, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.bereitsInFlotte).toBe(true)
  })
  it('Halter weicht ab -> halterWarnung', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234', 'Mueller') })
    const r = await scanZb1FuerFlotte(makeDb(false, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.halterWarnung).toBe(true)
  })
  it('Halter passt (fuzzy, Rechtsform ignoriert) -> keine Warnung', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234', 'Schmidt Logistik') })
    const r = await scanZb1FuerFlotte(makeDb(false, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.halterWarnung).toBe(false)
  })
  it('OCR-Fehler -> ok:false', async () => {
    ocrMock.mockResolvedValue({ error: 'Vision down', status: 502 })
    const r = await scanZb1FuerFlotte(makeDb(false, 'x'), 'b64', 'f1')
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement** — `scanZb1FuerFlotte`:
  - `runZB1Ocr(base64)`; bei `error` → `{ ok: false, error }`.
  - `felder = zb1ToFelder(extracted)`.
  - Confidence = Anteil erkannt von `[fin_vin, hsn, tsn, kennzeichen, erstzulassung]`.
  - FIN-Dup: wenn `felder.fin`, join `vehicles.fin === felder.fin` × `flotten_fahrzeuge.firma_id === firmaId` (READ; **gegen prod proben** — der genaue Select-Pfad). `bereitsInFlotte = treffer`.
  - Halter: `firmen.name` laden; `halterZb1 = halter_nachname ?? halter_vorname`; `halterWarnung = beide gesetzt && normalisiert(halterZb1) ⊄ normalisiert(firmaName)` (normalisiert = lowercase, ohne `gmbh|ag|kg|ohg|ug|mbh|e.k.|gbr` und Satzzeichen).
  - Return `{ ok: true, ergebnis: { felder, confidence, bereitsInFlotte, halterWarnung, halterZb1 } }`.

⚠️ **Vor dem Commit den FIN-Dup-Select gegen prod proben** (MCP `execute_sql`, READ): dass `flotten_fahrzeuge` × `vehicles.fin` so joinbar ist.

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit** — `feat(zb1): scanZb1FuerFlotte — OCR + Confidence + FIN-Dup + Halter-Verifikation`

---

### Task 5: `Zb1BatchScanner`-UI (Scan → Review → Ergebnis)

**Files:**
- Create: `src/components/flotte/Zb1BatchScanner.tsx`
- (Kein Unit-Test — die UI ist dünne Orchestrierung über der getesteten Lib; Verifikation via tsc/build + Prod-Smoke.)

**Interfaces:**
- Consumes: `ScanErgebnis` / `BatchAnlageErgebnis` / `EditierbareFahrzeugFelder` (T1/T3/T4), `SectionCard`, `Button`
- Produces: `<Zb1BatchScanner firmaId onScan onAnlegen onFertig />`
  - `onScan: (base64: string) => Promise<{ ok: true; ergebnis: ScanErgebnis } | { ok: false; error: string }>`
  - `onAnlegen: (zeilen: { felder: EditierbareFahrzeugFelder; bereitsInFlotte: boolean; base64: string }[]) => Promise<BatchAnlageErgebnis[]>`
  - `onFertig: () => void`

- [ ] **Step 1: Komponente bauen** — drei Phasen, Muster für Kamera/Upload aus `src/app/upload/zb1/[token]/Zb1UploadClient.tsx` übernehmen (dort: `<input type="file" accept="image/*" capture="environment">`, File → base64). State:
```ts
type Zeile = { felder: EditierbareFahrzeugFelder; bereitsInFlotte: boolean; halterWarnung: boolean; halterZb1: string|null; confidence: number; base64: string }
const [phase, setPhase] = useState<'scannen'|'review'|'ergebnis'>('scannen')
const [zeilen, setZeilen] = useState<Zeile[]>([])
const [ergebnis, setErgebnis] = useState<BatchAnlageErgebnis[]|null>(null)
```
Verhalten:
- **scannen**: pro Bild `onScan(base64)`. Erfolg → Zeile pushen; **Batch-Dedup**: wenn `felder.fin` schon in `zeilen`, nicht pushen + Hinweis „bereits in dieser Liste". Buttons: „Weitere Karte scannen" / „Zum Review (N)".
- **review**: Tabelle der Zeilen. Pro Zeile: editierbare Felder (kennzeichen/fin/hersteller/modell/…), Status-Badge (`ok` / `⚠ bitte prüfen` bei confidence<0.8 / `keine FIN` / `bereits in Flotte`), Halter-Warnung gelb bei `halterWarnung`, Zeile entfernbar. Button „Alle anlegen".
- **anlegen**: `onAnlegen(zeilen.map(z => ({ felder: z.felder, bereitsInFlotte: z.bereitsInFlotte, base64: z.base64 })))` → `ergebnis`, Phase `ergebnis`.
- **ergebnis**: Zusammenfassung „N angelegt · M aktualisiert · K Stub · F Fehler". Fehler-Zeilen (status `fehler`) zurück in `review` anbieten. „Fertig" → `onFertig()`.

**Umlaute** in allen sichtbaren Strings. Status-Badge über die Registry (`@/lib/status`) oder eine reine Label-Map ohne Farb-Ternary (Ratchet).

- [ ] **Step 2: Verify** — `npx tsc --noEmit --skipLibCheck` (exit 0), `npm run check:component-set && npm run check:status-registry && npm run check:token-audit` (exit 0).

- [ ] **Step 3: Commit** — `feat(zb1): Zb1BatchScanner — Scan/Review/Ergebnis-UI (Batch, rollenagnostisch)`

---

# SLICE C — Einstiege + ZB1-Bild (Task 6–8)

### Task 6: ZB1-Bild-Ablage (fall_dokumente + zb1_dokument_id, best-effort)

**Files:**
- Modify: `src/lib/flotte/zb1-batch-anlage.ts` (+ Test)

**Interfaces:**
- `legeFlottenFahrzeugeAn` bekommt `base64?: string` je Zeile (`BatchAnlageZeile`) und legt nach erfolgreicher vehicle-Erstellung das Bild ab.

- [ ] **Step 1: Test** — neue Zeile mit `base64` gesetzt → `db.storage.upload` + `fall_dokumente.insert` + `vehicles.update({ zb1_dokument_id })` werden aufgerufen; ein Storage-Fehler bricht die Zeile **nicht** (Status bleibt `angelegt`). Mock `db.storage.from().upload` + die Inserts.

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement** — `BatchAnlageZeile` um `base64?: string` erweitern. Nach erfolgreichem `veh.ok` (angelegt/stub/aktualisiert) eine `try/catch`-Hilfsfunktion `hinterlegeZb1Bild(db, vehicleId, base64)`:
  - `db.storage.from('fall-dokumente').upload('vehicles/{vehicleId}/zb1/{uuid}.jpg', buffer, ...)`
  - `db.from('fall_dokumente').insert({ ..., dokument_typ: 'zb1_fahrzeugschein', storage_path, sichtbar_fuer: ['admin','kundenbetreuer','sachverstaendiger','flottenmanager'] })` → id
  - `db.from('vehicles').update({ zb1_dokument_id: id }).eq('id', vehicleId)`
  - alle Fehler nur `console.error`, **kein throw** (best-effort). ⚠ `fall_dokumente`-Spalten (`storage_path`, `sichtbar_fuer`, `dokument_typ`) gegen prod proben.

- [ ] **Step 4: Run — passes** (inkl. der T3-Tests weiterhin grün)

- [ ] **Step 5: Commit** — `feat(zb1): ZB1-Bild -> fall_dokumente + vehicles.zb1_dokument_id (best-effort)`

---

### Task 7: Flottenmanager-Einstieg (`/flotte`)

**Files:**
- Modify: `src/app/flotte/(shell)/flotte/actions.ts` (2 Server-Actions)
- Modify: `src/components/flotte/FlotteClient.tsx` (Button + Drawer)

**Interfaces:**
- Consumes: `scanZb1FuerFlotte` (T4), `legeFlottenFahrzeugeAn` (T3/T6), `Zb1BatchScanner` (T5), `getFlottenmanagerFirma`
- Produces: Server-Actions `scanZb1(base64)` + `legeZb1Fahrzeuge(zeilen)` (firma aus dem eingeloggten Flottenmanager)

- [ ] **Step 1: Server-Actions** (Muster wie `bindeKarte` in `flotte/(shell)/flotte/schadenkarte-actions.ts`): `requirePortalAccess(['flottenmanager'])` → `createAdminClient` → `getFlottenmanagerFirma(db, user.id)` → Lib-Aufruf → bei `legeZb1Fahrzeuge` `revalidatePath('/flotte/flotte')`. Result-Objekte.

- [ ] **Step 2: UI** — in `FlotteClient.tsx` einen Button „Fahrzeuge per ZB1 scannen" neben dem bestehenden manuellen Anlegen; öffnet `<Zb1BatchScanner firmaId onScan={scanZb1} onAnlegen={legeZb1Fahrzeuge} onFertig={() => { setOpen(false); router.refresh() }} />` in einem `Drawer` (width 860).

- [ ] **Step 3: Verify** — tsc + component-set/token-audit/status-registry exit 0; die 4 Slice-A/B-Testdateien weiter grün. **UI-Erreichbarkeit statisch prüfen** (Button gerendert, Rolle flottenmanager).

- [ ] **Step 4: Commit** — `feat(zb1): ZB1-Scan-Einstieg im Flottenmanager-Portal`

---

### Task 8: Admin-Vertrieb-Einstieg (`/admin/vertrieb/firmen-flotte/[id]`)

**Files:**
- Modify: `src/app/admin/vertrieb/_actions/firmen-flotte-fahrzeuge.ts` (2 Server-Actions)
- Modify: `src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx` (Button + Drawer)

**Interfaces:**
- Wie Task 7, aber Auth = `requireRole(['admin','dispatch'])` und `firmaId` kommt als **Argument** (aus der Route), nicht aus `getFlottenmanagerFirma`.

- [ ] **Step 1: Server-Actions** — `scanZb1FuerFirma(firmaId, base64)` + `legeZb1FahrzeugeFuerFirma(firmaId, zeilen)`: `requireRole(['admin','dispatch'])` → user → `createAdminClient` → Lib mit der übergebenen `firmaId` → `revalidatePath('/admin/vertrieb/firmen-flotte/${firmaId}')`. **`firmaId` ist der Scope** — kein Cross-Firma (der Admin darf cross-firma, aber immer die explizit übergebene).

- [ ] **Step 2: UI** — in `FirmenFlotteDetailClient.tsx` in der Fahrzeug-Sektion einen Button „Fahrzeuge per ZB1 scannen"; öffnet `<Zb1BatchScanner firmaId={firma.id} onScan={(b) => scanZb1FuerFirma(firma.id, b)} onAnlegen={(z) => legeZb1FahrzeugeFuerFirma(firma.id, z)} onFertig={...} />` im Drawer.

- [ ] **Step 3: Verify** — tsc + `npm run build` (Route/Server-Action-Änderung) exit 0; Ratchets exit 0.

- [ ] **Step 4: Commit + PR** — `feat(zb1): ZB1-Scan-Einstieg in der Admin-Vertrieb-Flottenakte`, dann `git push` + `gh pr create --base staging`. PR-Body: Slices, Reuse, **Prod-Smoke-Plan** (Task 9 unten).

---

### Task 9: Prod-Smoke (Regel 4) — nach Deploy

**Files:** keine (Verifikation)

- [ ] Test-Flotte `flotte.test@claimondo.de` / Firma `dafc57ee`. Ein ZB1-Testbild → Scan → Review → Anlegen → DB prüfen: `vehicles`-Row mit FIN, `flotten_fahrzeuge`-Bind, `zb1_dokument_id` gesetzt. **Duplikat**: dasselbe Fahrzeug zweimal → zweites `aktualisiert`, kein Doppel-Bind. **Teilfehler**: eine Zeile mit unsinniger FIN → andere kommen durch. **Beide Einstiege** (Flottenmanager + Admin) einmal. Fixtures danach löschen (service-role-Script, nicht `execute_sql`).
- ⚠ Der Smoke prüft die **Verdrahtung**, nicht die OCR-Trefferquote (bildqualitätsabhängig). Ergebnis im PR/Marker dokumentieren.

---

## Self-Review

**Spec-Abdeckung:**

| Spec | Task |
|---|---|
| §4.2 Mapper | 1 |
| §4.2 bindeVehicleAnFlotte (Boy-Scout) | 2 |
| §4.1/§4.4 Batch-Anlage non-atomar | 3 |
| §4.2/§4.3/§4.7 scanZb1FuerFlotte (OCR+Dup+Halter) | 4 |
| §4.6 Zb1BatchScanner-UI | 5 |
| §4.5 ZB1-Bild-Ablage | 6 |
| §4.6 zwei Einstiege | 7, 8 |
| §7 Firma-Scoping | 4, 7, 8 |
| §8 Prod-Smoke | 9 |

**Typ-Konsistenz:** `EditierbareFahrzeugFelder` (T1) → T3/T4/T5 · `BatchAnlageZeile`/`BatchAnlageErgebnis` (T3) → T5/T7/T8 · `ScanErgebnis` (T4) → T5 · `bindeVehicleAnFlotte` (T2) → T3. Namen/Signaturen konsistent.

**Keine Platzhalter in den Lib-Tasks** (1–4, 6: vollständiger Test+Impl-Code). Die UI-Tasks (5, 7, 8) geben Skelett + Kern-Logik + konkrete Muster-Verweise (`Zb1UploadClient`, `bindeKarte`) — die visuelle Ausgestaltung bleibt dem Implementer, die Verhaltens-Kontrakte sind vollständig.
