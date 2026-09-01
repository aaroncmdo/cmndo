# WS6 Slice 1 — Reparatur Close-Loop + Kunde-Beleg-Download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Werkstatt kann eine Reparatur abschließen (Status `erledigt` + Schlussrechnung-Upload); das schließt den Claim automatisch, gibt die Werkstatt-Provision frei, und der Kunde lädt sein Beleg-Paket (KVA + Schlussrechnung + Fotos) herunter.

**Architecture:** Werkstatt-Server-Action `markiereReparaturErledigt` (auth-aware Client für den `reparatur_termine`-RLS-Write, Admin-Client für Upload + Claim-Close + Provision) → reine Guard-Logik `repair-closure.ts` → direkter `operative_status='abgeschlossen'`-Write (Präzedenz: `endzustand-actions.ts`, umgeht die state-machine-Transition, die `abgeschlossen` nur aus `regulierung`/`klage`/`zahlung-eingegangen` erlaubt) → Provision-Flip pending→freigegeben. Kunde-Seite: neue `BelegePaketCard` in der `DoksTermineZone` der Rebuild-Zonen, gespeist aus dem ViewModel.

**Tech Stack:** Next.js 15 App Router (Server-Components + `'use client'`), Supabase (RLS + admin/service-role), TypeScript, vitest, `@/components/primitives` + `@/components/shared`, `apply_migration` (Regel 2).

## Global Constraints
- **Branch:** `kitta/repair-loop-closure` (off `kitta/kunde-claim-detail-rebuild`), PR gegen `staging` (rebase auf staging sobald der Rebuild #4084 merged), NIE `main` (Regel 1).
- **DDL nur via `apply_migration`** (Supabase-Plugin), NIE raw `execute_sql`; Migration-File nach getrackter Version benennen (Regel 2, Schritt 3+4).
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }`, kein throw; `revalidatePath`; Non-kritische Sends (Notify) in try/catch.
- **UI-Strings:** Umlaut-korrektes Deutsch (ä/ö/ü/ß).
- **Token-Konsistenz:** primitives/shared + claimondo-Tokens; Ratchets (token-audit/component-set/status-registry/knip) 0-neu.
- **`fall_dokumente`:** `fall_id` UND `claim_id` sind NOT NULL — beide setzen (`fall_id` via `faelle_claim_bridge`-Reverse-Lookup, Fallback `claimId`). `sichtbar_fuer` muss `'kunde'` enthalten.
- **`dokument_typ='schlussrechnung'`** (NICHT `reparaturrechnung` — kollidiert mit dem Vorschaden-Konzept `reparaturrechnung_vorschaden`).
- **Verify je Task:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (0 in berührten Files) + relevante vitest.

## File Structure
| Datei | Verantwortung |
|---|---|
| `supabase/migrations/<V>_reparatur_termine_erledigt_am.sql` | DDL: `reparatur_termine.erledigt_am timestamptz` |
| `src/lib/werkstatt/repair-closure.ts` (+ `__tests__/`) | PURE `istReparaturClaimAbschliessbar(claim, termin)` + Ziel-Zustand-Konstanten |
| `src/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts` | `markiereReparaturErledigt(terminId, formData)` — Status + Upload + Close + Provision |
| `src/components/werkstatt/ReparaturAbschlussModal.tsx` | `'use client'` Upload-Modal (Schlussrechnung), Muster `KvaHochladenModal` |
| `src/components/werkstatt/WerkstattAuftragDetail.tsx` (modify `ReparaturterminSektion`) | „Reparatur abschließen"-Button (gated `status='bestaetigt'`) → Modal |
| `src/lib/claims/kunde-claim-view.ts` (modify) | `vm.werkstatt.schlussrechnungUrl` ableiten (wie `kvaPdfUrl`) |
| `src/components/kunde/claim-view/BelegePaketCard.tsx` | claim-type-aware Download-Card |
| `src/components/kunde/claim-view/DoksTermineZone.tsx` (modify) | `BelegePaketCard` einhängen |

---

## Task 1: DDL — `reparatur_termine.erledigt_am`

**Files:**
- Create: `supabase/migrations/<V>_reparatur_termine_erledigt_am.sql`

**Interfaces:**
- Produces: Spalte `reparatur_termine.erledigt_am timestamptz` (nullable) — Completion-Zeitstempel (Trigger für Close + Provision + spätere Ops-Phase).

- [ ] **Step 1: Apply migration via Plugin (Regel 2)**

`apply_migration({ name: "reparatur_termine_erledigt_am", query: <DDL> })`:
```sql
ALTER TABLE public.reparatur_termine
  ADD COLUMN IF NOT EXISTS erledigt_am timestamptz;
COMMENT ON COLUMN public.reparatur_termine.erledigt_am IS
  'WS6: Zeitpunkt, zu dem die Werkstatt die Reparatur als erledigt markiert hat (status=erledigt). Trigger fuer Claim-Close + Provisions-Freigabe.';
```

- [ ] **Step 2: Getrackte Version ablesen** — `list_migrations` → die vom Plugin vergebene Version `<V>` notieren.

- [ ] **Step 3: Verify (READ)** — `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'reparatur_termine' AND column_name = 'erledigt_am';
```
Expected: eine Zeile `erledigt_am | timestamp with time zone | YES`.

- [ ] **Step 4: Migration-File committen** als `supabase/migrations/<V>_reparatur_termine_erledigt_am.sql` (Dateiname == getrackte Version `<V>`):
```bash
git add supabase/migrations/<V>_reparatur_termine_erledigt_am.sql
git commit -m "feat(repair-loop): DDL reparatur_termine.erledigt_am (WS6 Slice 1)"
```

> `status='erledigt'` ist bereits ein legaler CHECK-Wert (`20260703204827_reparatur_termine.sql:11`) → KEINE Enum-DDL nötig. `dokument_typ='schlussrechnung'` ist ein freier String → KEINE DDL.

---

## Task 2: Pure Guard — `repair-closure.ts`

**Files:**
- Create: `src/lib/werkstatt/repair-closure.ts`
- Test: `src/lib/werkstatt/__tests__/repair-closure.test.ts`

**Interfaces:**
- Produces:
```typescript
export type ReparaturTerminLike = { status: string | null }
export type ClaimCloseLike = { operative_status: string | null }
export const REPARATUR_CLOSE_STATUS = 'abgeschlossen' as const
export const REPARATUR_CLOSE_GRUND = 'reparatur_erledigt' as const
// Guard: darf dieser Claim/Termin per Reparatur-Abschluss geschlossen werden?
export function istReparaturClaimAbschliessbar(claim: ClaimCloseLike, termin: ReparaturTerminLike): boolean
```
- Consumes: nichts (pure).

- [ ] **Step 1: Failing test** — `repair-closure.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { istReparaturClaimAbschliessbar, REPARATUR_CLOSE_STATUS, REPARATUR_CLOSE_GRUND } from '../repair-closure'

describe('istReparaturClaimAbschliessbar', () => {
  it('bestätigter Termin + offener Claim -> true', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'ersterfassung' }, { status: 'bestaetigt' })).toBe(true)
  })
  it('Termin noch angefragt -> false', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'ersterfassung' }, { status: 'angefragt' })).toBe(false)
  })
  it('bereits erledigt -> false (idempotent)', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'ersterfassung' }, { status: 'erledigt' })).toBe(false)
  })
  it('Claim bereits abgeschlossen -> false', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'abgeschlossen' }, { status: 'bestaetigt' })).toBe(false)
  })
  it('Claim storniert -> false', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'storniert' }, { status: 'bestaetigt' })).toBe(false)
  })
  it('Konstanten', () => {
    expect(REPARATUR_CLOSE_STATUS).toBe('abgeschlossen')
    expect(REPARATUR_CLOSE_GRUND).toBe('reparatur_erledigt')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/werkstatt/__tests__/repair-closure.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implement** `src/lib/werkstatt/repair-closure.ts`:
```typescript
// WS6 Slice 1 — reine Guard-Logik fuer den Reparatur-Abschluss (client-safe, keine DB-Imports).
// Ein Reparatur-Claim wird per Werkstatt-Abschluss geschlossen — NICHT ueber die state-machine
// (die 'abgeschlossen' nur aus regulierung/klage/zahlung-eingegangen erlaubt), sondern per
// direktem operative_status-Write (Praezedenz: endzustand-actions.ts). Diese Datei kapselt nur
// die Vorbedingung + die Ziel-Konstanten; der Write lebt in der Server-Action (Task 4).

export type ReparaturTerminLike = { status: string | null }
export type ClaimCloseLike = { operative_status: string | null }

export const REPARATUR_CLOSE_STATUS = 'abgeschlossen' as const
export const REPARATUR_CLOSE_GRUND = 'reparatur_erledigt' as const

// Terminal-Zustaende, aus denen NICHT mehr geschlossen wird (idempotent + kein Reopen).
const CLAIM_TERMINAL = new Set(['abgeschlossen', 'storniert', 'abgelehnt', 'verjaehrt'])

/**
 * Darf die Werkstatt diese Reparatur jetzt abschließen? Nur wenn der Termin bestätigt ist
 * (die Reparatur läuft) und der Claim noch nicht terminal ist. `erledigt` ist bereits gesetzt
 * (idempotenter Zweitklick) → false.
 */
export function istReparaturClaimAbschliessbar(claim: ClaimCloseLike, termin: ReparaturTerminLike): boolean {
  if (CLAIM_TERMINAL.has(claim.operative_status ?? '')) return false
  return (termin.status ?? '') === 'bestaetigt'
}
```

- [ ] **Step 4: Run** vitest → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/werkstatt/repair-closure.ts src/lib/werkstatt/__tests__/repair-closure.test.ts
git commit -m "feat(repair-loop): pure istReparaturClaimAbschliessbar-Guard (TDD)"
```

---

## Task 3: Server-Action — `markiereReparaturErledigt`

**Files:**
- Create: `src/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts`

**Interfaces:**
- Consumes: `istReparaturClaimAbschliessbar`, `REPARATUR_CLOSE_STATUS`, `REPARATUR_CLOSE_GRUND` (Task 2); `requirePortalAccess` (`@/lib/auth/portal-guard`), `createClient`/`createServiceClient` (`@/lib/supabase/server`), `createAdminClient` (`@/lib/supabase/admin`).
- Produces:
```typescript
export async function markiereReparaturErledigt(
  terminId: string,
  formData: FormData,   // enthält 'schlussrechnung' (File)
): Promise<{ ok: boolean; error?: string }>
```

- [ ] **Step 1: Implement** `src/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts`:
```typescript
'use server'

// WS6 Slice 1 — Werkstatt schließt die Reparatur ab: Status 'erledigt' + Schlussrechnung-Upload
// → Claim-Close (direkter operative_status-Write, Praezedenz endzustand-actions.ts) → Provisions-Freigabe.
// Auth-aware Client fuer den reparatur_termine-RLS-Write (is_werkstatt_for_claim); Admin-Client fuer
// Upload + Claim-Close + Provision (bewusst service-role, wie erstelleKvaFuerAuftrag).

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import {
  istReparaturClaimAbschliessbar,
  REPARATUR_CLOSE_STATUS,
  REPARATUR_CLOSE_GRUND,
} from '@/lib/werkstatt/repair-closure'
import { notifyKundeReparaturtermin } from '@/lib/werkstatt/notify-kunde-reparaturtermin'

export async function markiereReparaturErledigt(
  terminId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const file = formData.get('schlussrechnung')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Bitte die Schlussrechnung (PDF/Bild) hochladen.' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'Datei zu groß (max. 10 MB).' }
  }

  const supabase = await createClient()
  // Termin + Claim laden (RLS: nur die eigene Werkstatt).
  const { data: termin, error: tErr } = await supabase
    .from('reparatur_termine')
    .select('id, claim_id, status, werkstatt_id')
    .eq('id', terminId)
    .maybeSingle()
  if (tErr) return { ok: false, error: tErr.message }
  if (!termin) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  const claimId = (termin as { claim_id: string }).claim_id
  const admin = createAdminClient()
  const { data: claim } = await admin
    .from('claims')
    .select('operative_status, claim_nummer')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden' }

  if (!istReparaturClaimAbschliessbar(
    { operative_status: (claim as { operative_status: string | null }).operative_status },
    { status: (termin as { status: string | null }).status },
  )) {
    return { ok: false, error: 'Reparatur kann in diesem Zustand nicht abgeschlossen werden.' }
  }

  // 1) Schlussrechnung → Storage + fall_dokumente (sichtbar_fuer inkl. kunde). fall_id via Bridge.
  const { data: bridge } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const fallId = (bridge as { fall_id: string } | null)?.fall_id ?? claimId

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const storagePath = `${fallId}/schlussrechnung_${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(storagePath, bytes, { contentType: file.type || 'application/pdf', upsert: false })
  if (upErr) return { ok: false, error: `Upload fehlgeschlagen: ${upErr.message}` }

  const { error: docErr } = await admin.from('fall_dokumente').insert({
    fall_id: fallId,
    claim_id: claimId,
    dokument_typ: 'schlussrechnung',
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type || 'application/pdf',
    groesse_bytes: bytes.byteLength,
    kategorie: 'schlussrechnung',
    quelle: 'werkstatt',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
  } as never)
  if (docErr) return { ok: false, error: `Dokument-Speicherung fehlgeschlagen: ${docErr.message}` }

  // 2) Termin -> erledigt (auth-aware Client wegen RLS is_werkstatt_for_claim).
  const nowIso = new Date().toISOString()
  const { error: stErr } = await supabase
    .from('reparatur_termine')
    .update({ status: 'erledigt', erledigt_am: nowIso, updated_at: nowIso } as never)
    .eq('id', terminId)
  if (stErr) return { ok: false, error: stErr.message }

  // 3) Claim schließen — direkter Write (Praezedenz endzustand-actions.ts; state-machine erlaubt
  //    'abgeschlossen' NICHT aus dem Reparatur-Zustand). Guard gegen Re-Close via .neq.
  await admin
    .from('claims')
    .update({ operative_status: REPARATUR_CLOSE_STATUS, abgeschlossen_am: nowIso, geschlossen_grund: REPARATUR_CLOSE_GRUND } as never)
    .eq('id', claimId)
    .neq('operative_status', REPARATUR_CLOSE_STATUS)

  // 4) Werkstatt-Provision freigeben (pending -> freigegeben), an die Fertigstellung gekoppelt.
  //    Praematur-Release-Vermeidung im Cron = 457ab612-Naht (Marker separat).
  await admin
    .from('partner_provisionen')
    .update({ status: 'freigegeben' } as never)
    .eq('partner_typ', 'werkstatt')
    .eq('claim_id', claimId)
    .eq('status', 'pending')

  revalidatePath(`/werkstatt/auftraege/${claimId}`)
  revalidatePath('/werkstatt/auftraege')
  revalidatePath(`/kunde/faelle/${claimId}`)

  // 5) Kunde-Notify (non-fatal).
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({ claimId, ereignis: 'erledigt', bestaetigterTermin: null, svc })
  } catch (err) {
    console.warn('[WS6] Kunden-Notify erledigt fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}
```

- [ ] **Step 2: Extend notifier union** — in `src/lib/werkstatt/notify-kunde-reparaturtermin.ts` das `ereignis`-Union um `'erledigt'` erweitern + einen Text-Zweig (Betreff „Deine Reparatur ist abgeschlossen", Hinweis auf den Beleg-Download im Portal). (Falls der Notifier ein festes `Record<ereignis, …>` nutzt: den `erledigt`-Eintrag ergänzen, Umlaut-korrekt.)

- [ ] **Step 3: Verify tsc** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler in `reparatur-abschluss-actions.ts` + `notify-kunde-reparaturtermin.ts`.

- [ ] **Step 4: Commit**
```bash
git add src/app/werkstatt/\(shell\)/auftraege/reparatur-abschluss-actions.ts src/lib/werkstatt/notify-kunde-reparaturtermin.ts
git commit -m "feat(repair-loop): markiereReparaturErledigt — Status+Upload+Close+Provision"
```

> **⚠ 457ab612-Naht (Marker vor Merge):** Der Trigger `create_werkstatt_provision` setzt `hold_until=now()+7d` bei Claim-Erstellung; der Release-Cron (`release-werkstatt-provisionen`) gibt bei `hold_until<=now` frei — d.h. er würde eine Provision auch OHNE Reparatur nach 7 Tagen freigeben. Mein Completion-Flip (Schritt 4) gibt bei tatsächlicher Fertigstellung frei (idempotent, `.eq('status','pending')`). Die **Verhinderung des prämaturen Cron-Release** (Gate auf Completion) ist 457ab612s Cron → Marker.

---

## Task 4: UI — `ReparaturAbschlussModal` + Einhängen in `ReparaturterminSektion`

**Files:**
- Create: `src/components/werkstatt/ReparaturAbschlussModal.tsx`
- Modify: `src/components/werkstatt/WerkstattAuftragDetail.tsx` (`ReparaturterminSektion`, ~`:51-220`)

**Interfaces:**
- Consumes: `markiereReparaturErledigt` (Task 3). `ReparaturterminSektion` hat `auftrag.reparatur_termin_id` + `auftrag.reparatur_termin_status` + `auftrag.claim_id`.

- [ ] **Step 1: Create `ReparaturAbschlussModal.tsx`** (`'use client'`, Muster `KvaHochladenModal` — File-Input + Submit → `markiereReparaturErledigt(terminId, formData)`):
```tsx
'use client'

// WS6 Slice 1 — Modal: Werkstatt lädt die Schlussrechnung hoch + schließt die Reparatur ab.
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { markiereReparaturErledigt } from '@/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions'

export function ReparaturAbschlussModal({
  terminId, open, onClose,
}: { terminId: string; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function handleSubmit() {
    const file = inputRef.current?.files?.[0]
    if (!file) { setError('Bitte die Schlussrechnung auswählen.'); return }
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('schlussrechnung', file)
      const res = await markiereReparaturErledigt(terminId, fd)
      if (!res.ok) { setError(res.error ?? 'Abschluss fehlgeschlagen'); toast.error(res.error ?? 'Abschluss fehlgeschlagen'); return }
      toast.success('Reparatur abgeschlossen — der Kunde bekommt seinen Beleg.')
      onClose()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-ios-xl bg-white p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-claimondo-navy">Reparatur abschließen</h3>
        <p className="text-body-sm text-claimondo-ondo">
          Lade die Schlussrechnung hoch. Damit gilt die Reparatur als abgeschlossen und der Kunde kann den Beleg herunterladen.
        </p>
        <input ref={inputRef} type="file" accept="image/*,application/pdf"
          className="block w-full text-body-sm text-claimondo-navy file:mr-3 file:rounded-ios-md file:border-0 file:bg-claimondo-bg file:px-3 file:py-1.5" />
        {error && <p className="text-body-xs text-danger-strong bg-danger-soft rounded-ios-lg p-2">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Abbrechen</Button>
          <Button variant="navy" size="sm" loading={pending} onClick={handleSubmit}>Reparatur abschließen</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `ReparaturterminSektion`** — in `WerkstattAuftragDetail.tsx`: Import `ReparaturAbschlussModal` + `useState` (`abschlussOffen`). Im `ReparaturterminSektion`-Render, gated auf `auftrag.reparatur_termin_status === 'bestaetigt'`, einen Button + das Modal ergänzen (analog zum `handleBestaetigen`-Muster):
```tsx
{auftrag.reparatur_termin_status === 'bestaetigt' && auftrag.reparatur_termin_id && (
  <div className="pt-2">
    <Button variant="navy" size="sm" onClick={() => setAbschlussOffen(true)}>Reparatur abschließen</Button>
    <ReparaturAbschlussModal
      terminId={auftrag.reparatur_termin_id}
      open={abschlussOffen}
      onClose={() => setAbschlussOffen(false)}
    />
  </div>
)}
```

- [ ] **Step 3: Verify** tsc 0 in beiden Files; `npm run check:component-set -- --ratchet` + `check:token-audit` 0-neu.

- [ ] **Step 4: Commit**
```bash
git add src/components/werkstatt/ReparaturAbschlussModal.tsx src/components/werkstatt/WerkstattAuftragDetail.tsx
git commit -m "feat(repair-loop): Werkstatt 'Reparatur abschließen'-Button + Modal"
```

---

## Task 5: ViewModel — `vm.werkstatt.schlussrechnungUrl`

**Files:**
- Modify: `src/lib/claims/kunde-claim-view.ts` (Type `KundeWerkstatt` ~`:129-134` + die Ableitung ~`:403`)

**Interfaces:**
- Produces: `vm.werkstatt.schlussrechnungUrl: string | null` — jüngstes `schlussrechnung`-Dokument mit URL (analog `kvaPdfUrl`/`schadensfotoUrls`).

- [ ] **Step 1: Type erweitern** — in `KundeWerkstatt`: `schlussrechnungUrl: string | null` ergänzen.

- [ ] **Step 2: Ableitung ergänzen** — dort wo `schadensfotoUrls`/`gutachtenUrlRaw` aus `dokumente` abgeleitet werden:
```typescript
const schlussrechnungUrl =
  dokumente.filter((d) => d.typ === 'schlussrechnung' && d.datei_url).slice(-1)[0]?.datei_url ?? null
```
und in das `werkstatt`-Objekt aufnehmen: `schlussrechnungUrl`.

- [ ] **Step 3: Verify** tsc 0 in `kunde-claim-view.ts`; `npx vitest run src/lib/claims/__tests__/kunde-zonen.test.ts` (VM-Factory ggf. um `schlussrechnungUrl` ergänzen, falls der Test `werkstatt` mockt — sonst unberührt).

- [ ] **Step 4: Commit**
```bash
git add src/lib/claims/kunde-claim-view.ts
git commit -m "feat(repair-loop): vm.werkstatt.schlussrechnungUrl (Beleg-Download-Quelle)"
```

> `vm.doks.dokumente` ist Admin-gelesen + NICHT `sichtbar_fuer`-gefiltert. Da wir die Schlussrechnung mit `sichtbar_fuer` inkl. `'kunde'` schreiben, ist das Surfacen korrekt; KVA (`geld.kvaPdfUrl`) + Fotos (`werkstatt.schadensfotoUrls`) + Gutachten (`status.gutachtenUrl`, freigabe-gated) sind ohnehin schon kunde-appropriate abgeleitet.

---

## Task 6: `BelegePaketCard` + Einhängen in `DoksTermineZone`

**Files:**
- Create: `src/components/kunde/claim-view/BelegePaketCard.tsx`
- Modify: `src/components/kunde/claim-view/DoksTermineZone.tsx`

**Interfaces:**
- Consumes: `vm` (`KundeClaimViewModel`) — `geld.kvaPdfUrl`, `werkstatt.schlussrechnungUrl`, `werkstatt.schadensfotoUrls`, `status.gutachtenUrl`, `flags.istReparaturRoute`.

- [ ] **Step 1: Create `BelegePaketCard.tsx`** (Server-Component, reine Ableitung aus vm; Downloads als signierte `<a href>`-Links):
```tsx
// WS6 Slice 1 — claim-type-aware Beleg-/Dokumenten-Download für den Kunden.
// Reparatur-Claim: KVA + Schlussrechnung + Schadenfotos. Normal-/SV-Claim: Gutachten
// (SV-Rechnung folgt in Slice 1b — SV-Upload + Sichtbarkeit sind heute ein Gap).
import { Card } from '@/components/primitives'
import { DownloadIcon } from 'lucide-react'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

type Beleg = { label: string; url: string }

function belegeFor(vm: KundeClaimViewModel): Beleg[] {
  const belege: Beleg[] = []
  if (vm.flags.istReparaturRoute) {
    if (vm.geld.kvaPdfUrl) belege.push({ label: 'Kostenvoranschlag', url: vm.geld.kvaPdfUrl })
    if (vm.werkstatt.schlussrechnungUrl) belege.push({ label: 'Schlussrechnung', url: vm.werkstatt.schlussrechnungUrl })
    vm.werkstatt.schadensfotoUrls.forEach((url, i) => belege.push({ label: `Schadenfoto ${i + 1}`, url }))
  } else {
    if (vm.status.gutachtenUrl) belege.push({ label: 'Gutachten', url: vm.status.gutachtenUrl })
    // SV-Rechnung: Slice 1b (heute kein kunde-sichtbares SV-Rechnungs-Dokument).
  }
  return belege
}

export function BelegePaketCard({ vm }: { vm: KundeClaimViewModel }) {
  const belege = belegeFor(vm)
  if (belege.length === 0) return null
  return (
    <Card p={4} className="space-y-3">
      <h2 className="text-body-sm font-semibold text-claimondo-navy">Deine Belege</h2>
      <p className="text-body-xs text-claimondo-ondo">Lade deine Unterlagen herunter — z.B. für deinen Versicherer.</p>
      <ul className="space-y-1.5">
        {belege.map((b) => (
          <li key={b.url}>
            <a href={b.url} target="_blank" rel="noopener noreferrer" download
              className="flex items-center justify-between gap-2 rounded-ios-sm bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy hover:bg-claimondo-border/40 transition-colors">
              <span>{b.label}</span>
              <DownloadIcon className="w-4 h-4 text-claimondo-ondo shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  )
}
```

- [ ] **Step 2: Einhängen in `DoksTermineZone.tsx`** — Import + Render (nach der Gutachten-Download-Card `:37-48`, vor `FallDetailSections`):
```tsx
import { BelegePaketCard } from './BelegePaketCard'
// ... im Render, nach dem Gutachten-Card-Block:
<BelegePaketCard vm={vm} />
```
Da `BelegePaketCard` bei leeren Belegen `null` rendert, ist das gaten-frei sicher. (Das bestehende Gutachten-Card-Block bleibt — die neue Card ist die konsolidierte Download-Liste; Deduplizierung des Gutachten-Buttons ist Slice-1b-Politur, nicht MVP.)

- [ ] **Step 3: Verify** tsc 0 in beiden Files; `check:component-set`/`check:token-audit` 0-neu.

- [ ] **Step 4: Commit**
```bash
git add src/components/kunde/claim-view/BelegePaketCard.tsx src/components/kunde/claim-view/DoksTermineZone.tsx
git commit -m "feat(repair-loop): Kunde BelegePaketCard (KVA+Schlussrechnung+Fotos / Gutachten)"
```

---

## Task 7: Prod-Smoke — der ganze Loop

**Files:** keine (Verifikation).

- [ ] **Step 1: Voraussetzung** — Reparatur-Demo-Claim `29dd7ad5` (Selbstzahler + Werkstatt SMOKE Köln + `reparatur_termine.status='bestaetigt'`, aus dem Gegentest). Werkstatt-Login = SMOKE Werkstatt (`werkstatt-smoke@claimondo.de`, `SmokeWerkstatt-2026!`).

- [ ] **Step 2: Lokaler Dev-Server** (Worktree, `.env.local` kopieren, `@turf/union`+`jsqr` `--no-save`, `PORT=3556 npm run dev`).

- [ ] **Step 3: Werkstatt schließt ab** — Login Werkstatt → `/werkstatt/auftraege/29dd7ad5…` → „Reparatur abschließen" → Schlussrechnung (Test-PDF) hochladen → Erfolg.

- [ ] **Step 4: DB-Verify (READ)** via service-role Skript: `reparatur_termine.status='erledigt'` + `erledigt_am` gesetzt; `claims.operative_status='abgeschlossen'` + `abgeschlossen_am` + `geschlossen_grund='reparatur_erledigt'`; `partner_provisionen` (werkstatt, claim=29dd7ad5) `status='freigegeben'`; `fall_dokumente` neue Zeile `dokument_typ='schlussrechnung'` `sichtbar_fuer` inkl. `kunde`.

- [ ] **Step 5: Kunde-Download** — Login Kunde (`aaron.sprafke+kunde-20260515123218@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`) → `/kunde/faelle/29dd7ad5…` → „Deine Belege"-Card zeigt KVA + Schlussrechnung + Fotos, Download klickbar. Screenshot desktop+mobile.

- [ ] **Step 6: Report** — Ergebnis + Screenshots. (Tmp-Skripte/`.env.local` danach löschen.)

---

## Task 8: Koordinations-Marker

**Files:** Marker in `…/memory/`.

- [ ] **Marker an 457ab612** — Provision-Cron-Gate: mein Completion-Flip gibt bei `erledigt` frei; bitte den `release-werkstatt-provisionen`-Cron auf Completion gaten (statt blindem `hold_until`), damit eine Provision nicht ohne Reparatur nach 7 Tagen freigegeben wird.
- [ ] **Marker an 470d55c9** — Repair-Closure schreibt `operative_status='abgeschlossen'` direkt (Präzedenz `endzustand-actions.ts`), umgeht bewusst die state-machine-Transition; FYI + Frage, ob ihr stattdessen eine echte `→abgeschlossen`-Transition für den Reparatur-Zustand wollt. Außerdem: Slice 2 (Repair-Phase → `v_claim_workstate`) kommt auf euch zu.

---

## Selbst-Review (Spec-Abdeckung)
- §5 Datenmodell → Task 1 (erledigt_am) + `schlussrechnung`-Typ (Task 3, kein DDL). §6.1 Werkstatt-Abschluss → Task 3+4. §6.2 Repair-Closure → Task 2 (Guard) + Task 3 (direkter Write, endzustand-Präzedenz statt state-machine — löst §11-Grounding-Punkt). §6.3 Provision → Task 3 (Completion-Flip) + Task 8 (457ab612-Cron-Gate). §6.4 Kunde-Download → Task 5+6; **SV-Rechnung = Slice 1b** (Grounding ergab: voller Gap, braucht SV-Upload — NICHT in diesem Plan, Task-6-Kommentar + §Scope). §9 Testing → Task 2 (vitest) + Task 7 (Prod-Smoke). Slice 2 (Ops-Phase 6a + Cron 6c) = Folge-Plan.
- Type-Konsistenz: `istReparaturClaimAbschliessbar`/`REPARATUR_CLOSE_*` (Task 2) → Task 3; `markiereReparaturErledigt` (Task 3) → Task 4; `vm.werkstatt.schlussrechnungUrl` (Task 5) → Task 6. `dokument_typ='schlussrechnung'` konsistent Task 3 (write) ↔ Task 5/6 (read). Konsistent.

## 📋 Offene Punkte / Folge-Arbeit (nach Slice 1 — priorisiert)

Slice 1 (Code + DDL `20260711121111` + Prod-Smoke) ist gelandet in **PR #4109**. Diese Punkte bleiben offen — je mit Owner/Marker, damit nichts verloren geht:

- **🔴 P1 — Money-Hebel (→ 457ab612 / 3724ced2):** Der Trigger `create_werkstatt_provision` feuert nur `AFTER INSERT ON claims WHEN NEW.werkstatt_id IS NOT NULL` — reparatur-vermittelte Selbstzahler/Kasko-frei-Claims setzen aber `reparatur_werkstatt_id` (per UPDATE beim Picker), NICHT `werkstatt_id`. **Prod-Smoke-Beleg:** der Demo-Claim hatte 0 `partner_provisionen`-Zeilen → mein Completion-Flip lief korrekt ins Leere. **Ohne Provision kein Umsatz** (laut Spec der einzige Umsatz dieser Claims). Fix: Trigger auf `reparatur_werkstatt_id` erweitern ODER Provision beim Vermittlungs-Write anlegen. `[[coordination-an-457ab612-470d55c9-ws6-provision-close]]`
- **🟠 P2 — Release-Cron auf Completion gaten (→ 457ab612):** `release-werkstatt-provisionen` gibt heute blind auf `hold_until`+7d frei (auch ohne Reparatur). Mein Flip ist idempotent; die prämature Freigabe soll weg. Selber Marker.
- **🟠 P3 — #4099-Merge-Reconcile (→ 6c630247, werkstatt-hp):** additive Überlappung (notify-Union `+werkstatt_vorschlag`/`+erledigt`, WerkstattAuftragDetail „Anderen Termin vorschlagen"/„Reparatur abschließen", reparatur_termine). Wer als Zweiter auf staging merged, löst additiv (mein Button gated `bestaetigt` = disjunkt). `[[coordination-an-6c630247-ws6-repair-loop-closure-overlap]]`
- **🟡 P4 — Slice 1b: SV-Rechnung-Download (Normal-Claim):** SV-Upload-Pfad für eine kunde-sichtbare Honorar-/Rechnung (`dokument_typ` + `sichtbar_fuer` inkl. kunde) + Surfacing im Normal-Zweig der `BelegePaketCard`. Heute voller Gap (kein Artefakt, kein Upload, admin-only Sichtbarkeit). Eigener kleiner Plan.
- **🟡 P5 — Slice 2: Ops-Sichtbarkeit + Nudge-Cron:** (6a) `deriveRepairPhase` → `v_claim_workstate` spiegeln (mit 470d55c9; sonst hängt der Claim für Ops unsichtbar in `ersterfassung`) + (6c) `repair-reminders`-Cron im VPS-crontab aktivieren (fertig gebaut, dormant). Eigener Plan.
- **🟢 P6 — Reconciliation-Edge-Case (→ 470d55c9, Slice-2-Linse):** wenn der Status-Flip NACH dem Close fehlschlägt, kann ein Claim `abgeschlossen` sein während `reparatur_termine.status='bestaetigt'` bleibt (Display-Lag). Eine erledigt-vs-abgeschlossen-Mismatch-Linse im Ops-Cockpit fängt das.
- **🟢 P7 — Beleg-Politik (Slice-1b-Polish):** `<a download>` auf cross-origin signierten URLs öffnet einen Tab statt Force-Download; `getStorageUrl(..., {download:true})` (Content-Disposition attachment) würde es erzwingen. Optional ZIP-Bundle „alles herunterladen".
