# Schadenkarte NFC Blanko-Provisioner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanko-NFC-Karten write-first provisionieren (Chip auflegen → Token entsteht → schreiben → verifizieren → optional binden), erreichbar für Flottenmanager **und** Admin, mit ehrlicher Desktop-Bridge.

**Architecture:** Reiner App-Layer-Umbau auf Basis der bestehenden `src/lib/schadenkarte/*`-Services (kein DB-Change). Die Orchestrierung (mint→write→verify→finalize) lebt als **pure, injizierte Funktion** (`provisioniere-karte.ts`, node-testbar); die React-Komponente liefert nur die realen NFC-/Server-Effekte. Ein geteilter Component wird in beiden Portalen gemountet; die Server-Actions gibt es firma-scoped je einmal (Flottenmanager eigene Firma / Admin `requireRole`).

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19 Client Components, Supabase (`schadenkarten`-Tabelle, `AnyDb`-Cast), Web NFC (`NDEFReader`), vitest (node-env), `qrcode` (Bridge-QR).

## Global Constraints

- **Kein DB-Change.** Nur bestehende Spalten (`karten_token`, `firma_id`, `fahrzeug_id`, `status`, `charge`, `nfc_uid`, `gebunden_am/-von`) über die bestehenden Lib-Funktionen.
- **Web NFC = nur Chrome/Android.** `nfcVerfuegbar()` = `'NDEFReader' in window`. Desktop/iPhone → Bridge, kein Crash.
- **Server-Actions: Result-Object** `{ ok, error? }` bzw. `{ ok: true; token }` — nie `throw`. Jede mutierende Action ruft `revalidatePath`.
- **Firma-Scoping in jeder Action** (Flottenmanager: `getFlottenmanagerFirma`; Admin: `requireRole(['admin','dispatch'])` + gewählte `firmaId`).
- **UI-Strings Deutsch mit echten Umlauten** (ä/ö/ü/ß).
- **Component-Set:** `Button` aus `@/components/primitives`, `SectionCard` aus `@/components/shared/SectionCard`. Farben nur Claimondo-Tokens (`text-claimondo-*`, `text-success-strong`, `text-danger-strong`), Radien nur `rounded-ios-*`. Kein Inline-Hex.
- **`schadenkarten` ist nicht in `database.types.ts`** → `AnyDb`-Cast-Muster (bestehend) beibehalten.
- Worktree: `.claude/worktrees/flotte-kartenbindung-nfc` (Branch `kitta/flotte-kartenbindung-nfc`, aus `origin/staging`). Alle Pfade unten sind repo-relativ zu diesem Worktree.

---

### Task 1: Pure Provisioning-Orchestrator

**Files:**
- Create: `src/lib/schadenkarte/provisioniere-karte.ts`
- Test: `src/lib/schadenkarte/provisioniere-karte.test.ts`

**Interfaces:**
- Consumes: `buildSchadenkarteUrl(token)` from `./url`, `chipTraegtToken(gelesen, erwartet)` from `./nfc` (beide bestehend, pure).
- Produces:
  - `type ProvisionEffects = { mintToken: () => Promise<{ok:true;token:string}|{ok:false;error:string}>; writeAndRead: (url:string) => Promise<{ok:true;uid:string|null;readBack:string|null}|{ok:false;error:string}>; finalize: (token:string, nfcUid:string|null, fahrzeugId:string|null) => Promise<{ok:boolean;error?:string}> }`
  - `type ProvisionInput = { fahrzeugId: string | null; pendingToken: string | null }`
  - `type ProvisionOutcome = { ok: true; token: string } | { ok: false; error: string; retryToken: string | null }`
  - `provisioniereKarte(effects: ProvisionEffects, input: ProvisionInput): Promise<ProvisionOutcome>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/schadenkarte/provisioniere-karte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { provisioniereKarte, type ProvisionEffects } from './provisioniere-karte'

const OK_TOKEN = 'SKT-ABCDEFGH23456789'
const OK_URL = `https://app.claimondo.de/schaden/${OK_TOKEN}`

function effects(over: Partial<ProvisionEffects> = {}): ProvisionEffects {
  return {
    mintToken: vi.fn(async () => ({ ok: true, token: OK_TOKEN }) as const),
    writeAndRead: vi.fn(async () => ({ ok: true, uid: '04:aa:bb', readBack: OK_URL }) as const),
    finalize: vi.fn(async () => ({ ok: true }) as const),
    ...over,
  }
}

describe('provisioniereKarte', () => {
  it('happy path: mint -> write -> verify -> finalize', async () => {
    const e = effects()
    const res = await provisioniereKarte(e, { fahrzeugId: 'v1', pendingToken: null })
    expect(res).toEqual({ ok: true, token: OK_TOKEN })
    expect(e.finalize).toHaveBeenCalledWith(OK_TOKEN, '04:aa:bb', 'v1')
  })

  it('reuses pendingToken and does NOT mint again', async () => {
    const e = effects()
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: OK_TOKEN })
    expect(res.ok).toBe(true)
    expect(e.mintToken).not.toHaveBeenCalled()
  })

  it('mint failure -> retryToken null', async () => {
    const e = effects({ mintToken: vi.fn(async () => ({ ok: false, error: 'mint kaputt' }) as const) })
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: null })
    expect(res).toEqual({ ok: false, error: 'mint kaputt', retryToken: null })
  })

  it('write failure -> keeps token for retry', async () => {
    const e = effects({ writeAndRead: vi.fn(async () => ({ ok: false, error: 'nicht leer' }) as const) })
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: null })
    expect(res).toEqual({ ok: false, error: 'nicht leer', retryToken: OK_TOKEN })
  })

  it('verify failure (readBack mismatch) -> keeps token', async () => {
    const e = effects({ writeAndRead: vi.fn(async () => ({ ok: true, uid: 'x', readBack: 'https://app.claimondo.de/schaden/SKT-ZZZZZZZZ23456789' }) as const) })
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: null })
    expect(res.ok).toBe(false)
    expect((res as { retryToken: string }).retryToken).toBe(OK_TOKEN)
    expect((res as { error: string }).error).toMatch(/verifiziert/i)
  })

  it('finalize failure -> keeps token, surfaces error', async () => {
    const e = effects({ finalize: vi.fn(async () => ({ ok: false, error: 'Fahrzeug hat schon eine Karte' }) as const) })
    const res = await provisioniereKarte(e, { fahrzeugId: 'v1', pendingToken: null })
    expect(res).toEqual({ ok: false, error: 'Fahrzeug hat schon eine Karte', retryToken: OK_TOKEN })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/schadenkarte/provisioniere-karte.test.ts`
Expected: FAIL — `Cannot find module './provisioniere-karte'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/schadenkarte/provisioniere-karte.ts`:

```ts
// Pure Orchestrierung des Blanko-Karte-Provisionierens: mint -> write -> verify -> finalize.
// Alle Effekte werden injiziert -> node-testbar ohne DOM/NFC. Die React-Komponente liefert
// die realen Effekte (NDEFReader-Adapter + Server-Actions).
import { buildSchadenkarteUrl } from './url'
import { chipTraegtToken } from './nfc'

export type ProvisionEffects = {
  mintToken: () => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  writeAndRead: (
    url: string,
  ) => Promise<{ ok: true; uid: string | null; readBack: string | null } | { ok: false; error: string }>
  finalize: (token: string, nfcUid: string | null, fahrzeugId: string | null) => Promise<{ ok: boolean; error?: string }>
}

export type ProvisionInput = { fahrzeugId: string | null; pendingToken: string | null }

export type ProvisionOutcome =
  | { ok: true; token: string }
  | { ok: false; error: string; retryToken: string | null }

const VERIFY_FEHLER =
  'Die Karte konnte nicht verifiziert werden — sie gilt als nicht beschrieben. Bitte erneut auflegen.'

export async function provisioniereKarte(
  effects: ProvisionEffects,
  input: ProvisionInput,
): Promise<ProvisionOutcome> {
  // 1) Token: bestehenden Versuch wiederverwenden ODER frisch minten (begrenzt verwaiste Zeilen).
  let token = input.pendingToken
  if (!token) {
    const mint = await effects.mintToken()
    if (!mint.ok) return { ok: false, error: mint.error, retryToken: null }
    token = mint.token
  }

  // 2) Schreiben + zurücklesen (overwrite:false steckt in der Effekt-Impl).
  const write = await effects.writeAndRead(buildSchadenkarteUrl(token))
  if (!write.ok) return { ok: false, error: write.error, retryToken: token }

  // 3) Verifizieren: trägt der Chip wirklich UNSEREN Token?
  if (!chipTraegtToken(write.readBack, token)) {
    return { ok: false, error: VERIFY_FEHLER, retryToken: token }
  }

  // 4) Persistieren: uid vermerken (falls gelesen) + optional binden.
  const fin = await effects.finalize(token, write.uid, input.fahrzeugId)
  if (!fin.ok) {
    return { ok: false, error: fin.error ?? 'Speichern fehlgeschlagen. Bitte erneut auflegen.', retryToken: token }
  }

  return { ok: true, token }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/schadenkarte/provisioniere-karte.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schadenkarte/provisioniere-karte.ts src/lib/schadenkarte/provisioniere-karte.test.ts
git commit -m "feat(schadenkarte): pure provisioning orchestrator (mint->write->verify->finalize)"
```

---

### Task 2: `finalisiereSchadenkarte` Lib-Funktion

**Files:**
- Modify: `src/lib/schadenkarte/schadenkarte.ts` (neue Funktion am Ende anhängen)
- Modify: `src/lib/schadenkarte/schadenkarte.test.ts` (neuen `describe`-Block anhängen)

**Interfaces:**
- Consumes: `speichereNfcUid`, `bindeSchadenkarteAnFahrzeug` (beide bereits in derselben Datei).
- Produces: `finalisiereSchadenkarte(db, { token, firmaId, userId, nfcUid, fahrzeugId }): Promise<{ ok: boolean; error?: string }>` — uid vermerken (wenn nicht null) + binden (wenn fahrzeugId nicht null).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/schadenkarte/schadenkarte.test.ts` (nach dem letzten `describe`; `makeDb` + Importe sind oben in der Datei schon vorhanden — `finalisiereSchadenkarte` zur bestehenden Import-Liste aus `./schadenkarte` hinzufügen):

```ts
describe('finalisiereSchadenkarte', () => {
  it('vermerkt uid UND bindet, wenn beide gegeben sind', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'f1', fahrzeug_id: null } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: '04:aa', fahrzeugId: 'v1',
    })
    expect(res.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ nfc_uid: '04:aa' }))
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'gebunden', fahrzeug_id: 'v1' }))
  })

  it('bindet NICHT, wenn fahrzeugId null ist (nur beschreiben)', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'bestellt', firma_id: 'f1', fahrzeug_id: null } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: '04:aa', fahrzeugId: null,
    })
    expect(res.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ nfc_uid: '04:aa' }))
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'gebunden' }))
  })

  it('macht KEINEN uid-Write, wenn nfcUid null ist', async () => {
    const { db, updateMock } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'f1', fahrzeug_id: null } },
      updateResult: { data: { id: 'k1' }, error: null },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: null, fahrzeugId: 'v1',
    })
    expect(res.ok).toBe(true)
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({ nfc_uid: expect.anything() }))
  })

  it('propagiert einen Fehler aus dem uid-Schritt (fremde Firma)', async () => {
    const { db } = makeDb({
      selectResult: { data: { id: 'k1', status: 'frei', firma_id: 'ANDERE', fahrzeug_id: null } },
    })
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: '04:aa', fahrzeugId: 'v1',
    })
    expect(res.ok).toBe(false)
  })

  it('ist ein No-op (ok:true) wenn weder uid noch fahrzeugId gegeben', async () => {
    const { db, updateMock } = makeDb({})
    const res = await finalisiereSchadenkarte(db, {
      token: 'SKT-AAAAAAAAAAAAAAAA', firmaId: 'f1', userId: 'u1', nfcUid: null, fahrzeugId: null,
    })
    expect(res.ok).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/schadenkarte/schadenkarte.test.ts`
Expected: FAIL — `finalisiereSchadenkarte is not exported` / not a function.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/schadenkarte/schadenkarte.ts` (nach `speichereNfcUid`):

```ts
/**
 * Finalisiert eine frisch beschriebene Karte in EINEM Aufruf für beide Portale:
 * Chip-UID vermerken (falls gelesen) + optional ans Fahrzeug binden.
 * uid zuerst, dann bind -- schlägt der Bind fehl, ist die Karte trotzdem als beschrieben
 * markiert (der Nutzer wiederholt nur die Bindung).
 */
export async function finalisiereSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string; userId: string; nfcUid: string | null; fahrzeugId: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (params.nfcUid) {
    const uidRes = await speichereNfcUid(db, {
      token: params.token,
      firmaId: params.firmaId,
      nfcUid: params.nfcUid,
    })
    if (!uidRes.ok) return uidRes
  }
  if (params.fahrzeugId) {
    const bindRes = await bindeSchadenkarteAnFahrzeug(db, {
      token: params.token,
      fahrzeugId: params.fahrzeugId,
      firmaId: params.firmaId,
      userId: params.userId,
    })
    if (!bindRes.ok) return bindRes
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/schadenkarte/schadenkarte.test.ts`
Expected: PASS (alle bisherigen + 5 neue).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schadenkarte/schadenkarte.ts src/lib/schadenkarte/schadenkarte.test.ts
git commit -m "feat(schadenkarte): finalisiereSchadenkarte (uid + optional bind) fuer beide Portale"
```

---

### Task 3: `nfc.ts` Write-Options + Provisioner-Komponente

**Files:**
- Modify: `src/lib/schadenkarte/nfc.ts:17-22` (write-Signatur um `options` erweitern)
- Modify: `src/components/flotte/NfcKarteBeschreiben.tsx` (komplett ersetzen)

**Interfaces:**
- Consumes: `provisioniereKarte`, `ProvisionEffects` (Task 1); `nfcVerfuegbar`, `NDEF_RECORD_TYPE`, `NdefReaderCtor`, `NdefReadingEventLike` (nfc.ts).
- Produces: `NfcKarteBeschreiben` (default-benannter Export bleibt `NfcKarteBeschreiben`) mit neuen Props `{ fahrzeuge: Array<{vehicleId:string;label:string}>; onMintToken: () => Promise<{ok:true;token:string}|{ok:false;error:string}>; onFinalize: (token:string, nfcUid:string|null, fahrzeugId:string|null) => Promise<{ok:boolean;error?:string}> }`. Der alte `onNfcUid`-Prop entfällt.

- [ ] **Step 1: Erweitere die `write`-Signatur in `nfc.ts`**

Ersetze in `src/lib/schadenkarte/nfc.ts` das `NdefReaderLike`-Interface (Zeilen 17-22) durch:

```ts
export interface NdefReaderLike {
  write(
    message: { records: Array<{ recordType: string; data: string }> },
    options?: { overwrite?: boolean; signal?: AbortSignal },
  ): Promise<void>
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: NdefReadingEventLike) => void) | null
  onreadingerror: ((event: Event) => void) | null
}
```

- [ ] **Step 2: Ersetze die Provisioner-Komponente**

Ersetze den **gesamten** Inhalt von `src/components/flotte/NfcKarteBeschreiben.tsx` durch:

```tsx
'use client'

// Blanko-Karte per NFC beschreiben — WRITE-FIRST.
// Leere NFC-Karte auflegen -> frischer Token wird gemintet, auf den Chip geschrieben,
// zurueckgelesen/verifiziert und (optional) gleich ans gewaehlte Fahrzeug gebunden.
// KEIN QR-Zwang (der war nur fuer VORBEDRUCKTE Karten noetig). Web NFC = nur Chrome/Android;
// Desktop/iPhone bekommen die "am Handy oeffnen"-Bruecke.
import { useEffect, useState } from 'react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { provisioniereKarte, type ProvisionEffects } from '@/lib/schadenkarte/provisioniere-karte'
import {
  nfcVerfuegbar,
  NDEF_RECORD_TYPE,
  type NdefReaderCtor,
  type NdefReadingEventLike,
} from '@/lib/schadenkarte/nfc'

type Props = {
  fahrzeuge: Array<{ vehicleId: string; label: string }>
  onMintToken: () => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  onFinalize: (
    token: string,
    nfcUid: string | null,
    fahrzeugId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>
}

export function NfcKarteBeschreiben({ fahrzeuge, onMintToken, onFinalize }: Props) {
  const [unterstuetzt, setUnterstuetzt] = useState(false)
  const [bridgeQr, setBridgeQr] = useState<string | null>(null)
  const [fahrzeugId, setFahrzeugId] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)
  const [pendingToken, setPendingToken] = useState<string | null>(null)

  // Verfuegbarkeit ERST nach Mount pruefen (kein Hydration-Mismatch, s. nfcVerfuegbar-Kommentar).
  // Ohne NFC: QR der AKTUELLEN Seite bauen, damit der Operator sie am Android-Handy oeffnen kann.
  useEffect(() => {
    const ok = nfcVerfuegbar()
    setUnterstuetzt(ok)
    if (!ok && typeof window !== 'undefined') {
      void (async () => {
        try {
          const { default: QRCode } = await import('qrcode')
          setBridgeQr(await QRCode.toDataURL(window.location.href, { margin: 1, width: 180 }))
        } catch {
          setBridgeQr(null)
        }
      })()
    }
  }, [])

  // NFC-Adapter: schreibt mit overwrite:false (Clobber-Schutz), liest zurueck, liefert uid+readBack.
  async function writeAndRead(
    url: string,
  ): Promise<{ ok: true; uid: string | null; readBack: string | null } | { ok: false; error: string }> {
    try {
      const Ctor = (window as unknown as { NDEFReader: NdefReaderCtor }).NDEFReader
      const writer = new Ctor()
      await writer.write({ records: [{ recordType: NDEF_RECORD_TYPE, data: url }] }, { overwrite: false })

      const reader = new Ctor()
      const controller = new AbortController()
      const gelesen = await new Promise<{ uid: string | null; readBack: string | null }>((resolve) => {
        const timeout = setTimeout(() => {
          controller.abort()
          resolve({ uid: null, readBack: null })
        }, 10_000)
        reader.onreading = (ev: NdefReadingEventLike) => {
          clearTimeout(timeout)
          const rec = ev.message.records.find((r) => r.recordType === NDEF_RECORD_TYPE)
          const text = rec?.data ? new TextDecoder().decode(rec.data) : null
          controller.abort()
          resolve({ uid: ev.serialNumber ?? null, readBack: text })
        }
        reader.onreadingerror = () => {
          clearTimeout(timeout)
          controller.abort()
          resolve({ uid: null, readBack: null })
        }
        reader.scan({ signal: controller.signal }).catch(() => {
          clearTimeout(timeout)
          controller.abort()
          resolve({ uid: null, readBack: null })
        })
      })
      return { ok: true, uid: gelesen.uid, readBack: gelesen.readBack }
    } catch (err) {
      // overwrite:false auf einer NICHT leeren Karte UND eine abgelehnte Berechtigung landen beide
      // als NotAllowedError -> nicht sicher unterscheidbar. Ehrliche kombinierte Meldung.
      const denied = err instanceof Error && err.name === 'NotAllowedError'
      return {
        ok: false,
        error: denied
          ? 'Beschreiben nicht möglich — entweder ist die Karte nicht leer oder der NFC-Zugriff wurde abgelehnt. Bitte eine leere Karte auflegen und den Zugriff erlauben.'
          : 'Beschreiben fehlgeschlagen. Bitte eine leere Karte erneut auflegen.',
      }
    }
  }

  async function beschreibe() {
    setFehler(null)
    setErfolg(null)
    setLaeuft(true)
    const effects: ProvisionEffects = { mintToken: onMintToken, writeAndRead, finalize: onFinalize }
    const res = await provisioniereKarte(effects, { fahrzeugId: fahrzeugId || null, pendingToken })
    if (res.ok) {
      setPendingToken(null)
      setErfolg(
        fahrzeugId
          ? 'Karte beschrieben und ans Fahrzeug gebunden.'
          : 'Karte beschrieben. Noch keinem Fahrzeug zugewiesen — erst nach dem Binden im Ernstfall aktiv.',
      )
    } else {
      setPendingToken(res.retryToken)
      setFehler(res.error)
    }
    setLaeuft(false)
  }

  if (!unterstuetzt) {
    return (
      <SectionCard title="Karte beschreiben (NFC)">
        <p className="text-sm text-claimondo-shield">
          NFC-Beschreiben geht nur auf einem{' '}
          <strong className="text-claimondo-navy">Android-Gerät mit Chrome</strong>. Am Desktop und iPhone ist das
          technisch nicht möglich.
        </p>
        {bridgeQr && (
          <div className="mt-3 flex items-center gap-3">
            <img
              src={bridgeQr}
              alt="QR-Code: diese Seite am Android-Handy öffnen"
              width={90}
              height={90}
              className="rounded-ios-sm"
            />
            <p className="text-sm text-claimondo-ondo">
              Diese Seite am Android-Handy (Chrome) öffnen — QR scannen — dort die Karten beschreiben.
            </p>
          </div>
        )}
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Karte beschreiben (NFC)"
      subtitle="Leere Karte auflegen — sie wird beschrieben und optional gleich ans Fahrzeug gebunden."
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-body-xs font-medium text-claimondo-navy">Fahrzeug (optional)</span>
          <select
            value={fahrzeugId}
            onChange={(e) => setFahrzeugId(e.target.value)}
            disabled={laeuft}
            className="w-full rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30"
          >
            <option value="">— nur beschreiben (später binden) —</option>
            {fahrzeuge.map((f) => (
              <option key={f.vehicleId} value={f.vehicleId}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <Button variant="ondo" loading={laeuft} onClick={beschreibe}>
          Karte auflegen &amp; beschreiben
        </Button>

        {erfolg && <p className="text-sm text-success-strong">{erfolg}</p>}
        {fehler && <p className="text-sm text-danger-strong">{fehler}</p>}
      </div>
    </SectionCard>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: Kein Fehler in `nfc.ts`, `provisioniere-karte.ts`, `NfcKarteBeschreiben.tsx`. (Es werden Fehler in `KartenClient.tsx` erwartet, weil dort noch der alte `onNfcUid`-Prop übergeben wird — die behebt Task 5. Wenn du Tasks strikt einzeln grün halten willst, führe Step 3 erst nach Task 5 aus; sonst hier nur prüfen, dass die 3 obigen Dateien selbst fehlerfrei sind.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/schadenkarte/nfc.ts src/components/flotte/NfcKarteBeschreiben.tsx
git commit -m "feat(schadenkarte): write-first NFC-Provisioner (kein QR-Zwang, overwrite:false, Desktop-Bruecke)"
```

---

### Task 4: Flotte Server-Actions

**Files:**
- Modify: `src/app/flotte/(shell)/karten/actions.ts`

**Interfaces:**
- Consumes: `mintSchadenkarten`, `finalisiereSchadenkarte` (Task 2), `getFlottenmanagerFirma`, `requirePortalAccess`, `createAdminClient`.
- Produces: `provisioniereKarteToken(): Promise<{ok:true;token:string}|{ok:false;error:string}>`; `finalisiereKarte(token:string, nfcUid:string|null, fahrzeugId:string|null): Promise<{ok:boolean;error?:string}>`. Entfernt: `merkeNfcUid`.

- [ ] **Step 1: Importe anpassen**

In `src/app/flotte/(shell)/karten/actions.ts` den Import aus `@/lib/schadenkarte/schadenkarte` ändern: `speichereNfcUid` **entfernen**, `mintSchadenkarten` und `finalisiereSchadenkarte` **hinzufügen**. Ergebnis:

```ts
import {
  resolveSchadenkarteToFahrzeug,
  getKartenFuerFirma,
  sperreSchadenkarte,
  entsperreSchadenkarte,
  entbindeSchadenkarte,
  mintSchadenkarten,
  finalisiereSchadenkarte,
} from '@/lib/schadenkarte/schadenkarte'
```

- [ ] **Step 2: `merkeNfcUid` ersetzen**

Ersetze die gesamte `merkeNfcUid`-Funktion (Zeilen ~120-133) durch:

```ts
/** Blanko-Provisionierung: einen frischen Karten-Token für die eigene Firma minten. */
export async function provisioniereKarteToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await mintSchadenkarten(db, { firmaId: firma.id, anzahl: 1 })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, token: res.tokens[0] }
}

/** Nach verifiziertem NFC-Schreiben: Chip-UID vermerken (falls gelesen) + optional binden. */
export async function finalisiereKarte(
  token: string,
  nfcUid: string | null,
  fahrzeugId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await finalisiereSchadenkarte(db, {
    token,
    firmaId: firma.id,
    userId: user.id,
    nfcUid,
    fahrzeugId,
  })
  if (res.ok) {
    revalidatePath('/flotte/karten')
    revalidatePath('/flotte/flotte')
  }
  return res
}
```

- [ ] **Step 3: Typecheck this file**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: Kein Fehler in `actions.ts` (Fehler in `page.tsx`/`KartenClient.tsx` bzgl. entfernter `merkeNfcUid` sind erwartet → Task 5).

- [ ] **Step 4: Commit**

```bash
git add "src/app/flotte/(shell)/karten/actions.ts"
git commit -m "feat(flotte): provisioniereKarteToken + finalisiereKarte (ersetzt merkeNfcUid)"
```

---

### Task 5: Flotte Page + KartenClient verdrahten

**Files:**
- Modify: `src/app/flotte/(shell)/karten/page.tsx`
- Modify: `src/app/flotte/(shell)/karten/KartenClient.tsx`

**Interfaces:**
- Consumes: `provisioniereKarteToken`, `finalisiereKarte` (Task 4), `getKundeFlotte` (`@/lib/kunde/firma-flotte`), das `NfcKarteBeschreiben` (Task 3).
- Produces: gerendeter Provisioner auf `/flotte/karten` mit den Firmen-Fahrzeugen.

- [ ] **Step 1: Page — Fahrzeuge laden + neue Props übergeben**

Ersetze `src/app/flotte/(shell)/karten/page.tsx` durch:

```tsx
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getKartenFuerFirma } from '@/lib/schadenkarte/schadenkarte'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import KartenClient from './KartenClient'
import {
  identifiziereKarte,
  baueKartenQrPdf,
  sperreKarte,
  entsperreKarte,
  entbindeKarte,
  provisioniereKarteToken,
  finalisiereKarte,
} from './actions'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export default async function KartenPage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  const karten = firma ? await getKartenFuerFirma(db, firma.id) : []
  const flotte = firma ? await getKundeFlotte(db, firma.id) : []
  const fahrzeuge = flotte.map((f) => ({
    vehicleId: f.vehicleId,
    label: [f.kennzeichen, f.hersteller, f.modell].filter(Boolean).join(' · ') || f.vehicleId,
  }))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">Karten</h1>
        <p className="mt-1 text-sm text-claimondo-shield">
          Schadenkarten beschreiben, Fahrzeuge zuweisen und identifizieren.
        </p>
      </div>
      <KartenClient
        karten={karten}
        fahrzeuge={fahrzeuge}
        onIdentify={identifiziereKarte}
        onQrPdf={baueKartenQrPdf}
        onSperren={sperreKarte}
        onEntsperren={entsperreKarte}
        onEntbinden={entbindeKarte}
        onMintToken={provisioniereKarteToken}
        onFinalize={finalisiereKarte}
      />
    </div>
  )
}
```

- [ ] **Step 2: KartenClient — Props tauschen**

In `src/app/flotte/(shell)/karten/KartenClient.tsx`:

(a) Den `Props`-Typ ändern: `onNfcUid` entfernen, `fahrzeuge`, `onMintToken`, `onFinalize` hinzufügen:

```ts
type Props = {
  karten: Karte[]
  fahrzeuge: Array<{ vehicleId: string; label: string }>
  onIdentify: (token: string) => Promise<{ ok: true; vehicleId: string } | { ok: false; error: string }>
  onQrPdf: () => Promise<{ ok: true; base64: string } | { ok: false; error: string }>
  onSperren: Aktion
  onEntsperren: Aktion
  onEntbinden: Aktion
  onMintToken: () => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  onFinalize: (token: string, nfcUid: string | null, fahrzeugId: string | null) => Promise<{ ok: boolean; error?: string }>
}
```

(b) Die Destrukturierung in der Funktionssignatur anpassen:

```ts
export default function KartenClient({
  karten, fahrzeuge, onIdentify, onQrPdf, onSperren, onEntsperren, onEntbinden, onMintToken, onFinalize,
}: Props) {
```

(c) Den Provisioner-Mount (aktuell `<NfcKarteBeschreiben onNfcUid={onNfcUid} />`, Zeile ~110) ersetzen durch:

```tsx
      <NfcKarteBeschreiben fahrzeuge={fahrzeuge} onMintToken={onMintToken} onFinalize={onFinalize} />
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: PASS (keine Fehler mehr in flotte/karten).

- [ ] **Step 4: Commit**

```bash
git add "src/app/flotte/(shell)/karten/page.tsx" "src/app/flotte/(shell)/karten/KartenClient.tsx"
git commit -m "feat(flotte): Provisioner auf /flotte/karten verdrahten (Fahrzeuge + mint/finalize)"
```

---

### Task 6: Admin Staff-Actions

**Files:**
- Modify: `src/app/admin/vertrieb/_actions/firmen-flotte-karten.ts`

**Interfaces:**
- Consumes: `requireRole(['admin','dispatch'])`, `createClient` (für user.id), `createAdminClient`, `mintSchadenkarten`, `finalisiereSchadenkarte`.
- Produces: `provisioniereKarteTokenStaff(firmaId:string): Promise<{ok:true;token:string}|{ok:false;error:string}>`; `finalisiereKarteStaff(firmaId:string, token:string, nfcUid:string|null, fahrzeugId:string|null): Promise<{ok:boolean;error?:string}>`.

- [ ] **Step 1: Import ergänzen**

In `src/app/admin/vertrieb/_actions/firmen-flotte-karten.ts` den Import aus `@/lib/schadenkarte/schadenkarte` um `finalisiereSchadenkarte` erweitern:

```ts
import { mintSchadenkarten, bindeSchadenkarteAnFahrzeug, finalisiereSchadenkarte } from '@/lib/schadenkarte/schadenkarte'
```

- [ ] **Step 2: Zwei Staff-Actions anhängen**

Am Ende der Datei anhängen (Muster exakt wie `minteKartenFuerFlotte`/`bindeKarteAnFahrzeug` in derselben Datei):

```ts
/** Blanko-Provisionierung (staff): einen frischen Karten-Token für die gewählte Firma minten. */
export async function provisioniereKarteTokenStaff(
  firmaId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  const res = await mintSchadenkarten(admin, { firmaId, anzahl: 1 })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, token: res.tokens[0] }
}

/** Nach verifiziertem NFC-Schreiben (staff): Chip-UID vermerken + optional binden. */
export async function finalisiereKarteStaff(
  firmaId: string,
  token: string,
  nfcUid: string | null,
  fahrzeugId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient()
  const res = await finalisiereSchadenkarte(admin, { token, firmaId, userId: user.id, nfcUid, fahrzeugId })
  if (res.ok) revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return res
}
```

- [ ] **Step 3: Typecheck this file**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: kein Fehler in `firmen-flotte-karten.ts` (Fehler in `FirmenFlotteDetailClient.tsx` erst nach Task 7 behoben).

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/vertrieb/_actions/firmen-flotte-karten.ts"
git commit -m "feat(admin): provisioniereKarteTokenStaff + finalisiereKarteStaff"
```

---

### Task 7: Admin FirmenFlotteDetailClient verdrahten

**Files:**
- Modify: `src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx`

**Interfaces:**
- Consumes: `NfcKarteBeschreiben` (Task 3), `provisioniereKarteTokenStaff`, `finalisiereKarteStaff` (Task 6). `detail.fahrzeuge` (Feld `vehicle_id`, `kennzeichen` — s. bestehendes Dropdown Zeile ~277).
- Produces: gerenderter Provisioner in der „Schaden-Karten"-Sektion der Admin-Akte.

- [ ] **Step 1: Importe ergänzen**

In `src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx`:
- den Karten-Actions-Import erweitern:

```ts
import { minteKartenFuerFlotte, bindeKarteAnFahrzeug, provisioniereKarteTokenStaff, finalisiereKarteStaff } from '../../_actions/firmen-flotte-karten'
```

- den Provisioner importieren (zu den bestehenden Component-Importen):

```ts
import { NfcKarteBeschreiben } from '@/components/flotte/NfcKarteBeschreiben'
```

- [ ] **Step 2: Provisioner in der Karten-Sektion mounten**

In der `<SectionCard title={`Schaden-Karten (${karten.length})`}>` (beginnt Zeile ~233): **direkt nach** dem öffnenden `<SectionCard …>`-Tag (vor dem mint-`<div className="flex flex-wrap items-end gap-2 mb-3">`) einfügen:

```tsx
        <div className="mb-4">
          <NfcKarteBeschreiben
            fahrzeuge={fahrzeuge.map((f) => ({
              vehicleId: f.vehicle_id,
              label: f.kennzeichen ?? f.vehicle_id,
            }))}
            onMintToken={() => provisioniereKarteTokenStaff(firma.id)}
            onFinalize={(token, nfcUid, fahrzeugId) =>
              finalisiereKarteStaff(firma.id, token, nfcUid, fahrzeugId)
            }
          />
        </div>
```

Hinweis: `NfcKarteBeschreiben` bringt seine eigene `SectionCard` mit (verschachtelte Cards sind im Bestand üblich). Auf dem Admin-**Desktop** rendert die Komponente automatisch die Bridge (QR „am Handy öffnen"); auf einem Android-Handy (Admin eingeloggt) ist sie voll funktional.

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: PASS (gesamtes Projekt fehlerfrei). Falls `f.vehicle_id`/`f.kennzeichen` nicht existieren: die exakten Feldnamen aus dem bestehenden Dropdown (Zeile ~277-279 desselben Files) übernehmen — dort werden sie schon verwendet.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx"
git commit -m "feat(admin): NFC-Provisioner in der Firmen-Flotte-Akte (Desktop = Handy-Bruecke)"
```

---

### Task 8: Vollverifikation + Smoke

**Files:** keine (nur Prüfläufe + Dokumentation).

- [ ] **Step 1: Unit-Tests grün**

Run: `npx vitest run src/lib/schadenkarte/`
Expected: PASS (inkl. `provisioniere-karte.test.ts` + neue `finalisiereSchadenkarte`-Fälle).

- [ ] **Step 2: Voller Build (Next.js 15 Validatoren für Routen/Actions)**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: grün.

- [ ] **Step 3: Ratchets**

Run nacheinander:
```bash
npm run check:token-audit
npm run check:component-set
npm run check:status-registry
npm run check:knip
npm run check:vitest
```
Expected: keine NEUEN Verletzer. Erwartbare Reibungspunkte + Fix:
- `check:component-set`: das rohe `<select>` (Provisioner) entspricht dem Muster im bestehenden `FirmenFlotteDetailClient` (rohes `<select>`); falls der Ratchet es als neuen Verletzer meldet, ist das ein Boy-Scout-/Baseline-Fall — Baseline mit `npm run check:component-set -- --update-baseline` nachziehen (begründet: Konsistenz mit Sibling-Code).
- `check:knip`: `merkeNfcUid` ist entfernt (kein toter Rest) — sollte grün sein; ein neu „unused export" auf `finalisiereSchadenkarte`/Provisioner-Typen ist non-blocking (`--warn`).

- [ ] **Step 4: Desktop-Render-Smoke (automatisierbar, ohne echtes NFC)**

Manuell im Browser (oder Playwright gegen Prod nach Deploy, mit Flottenmanager-Testkonto): `/flotte/karten` **am Desktop** öffnen → die Kachel „Karte beschreiben (NFC)" zeigt den ehrlichen Android-Hinweis **inkl. QR** (kein Crash, keine Sackgasse). Ebenso Admin `/admin/vertrieb/firmen-flotte/<id>` → „Schaden-Karten" zeigt oben den Provisioner mit Bridge.

- [ ] **Step 5: Manueller Android-Smoke (Regel 4 — echtes NFC, NICHT automatisierbar)**

Auf einem **Android-Handy mit Chrome**, eingeloggt als Flottenmanager, `/flotte/karten`:
1. Fahrzeug im Dropdown wählen (optional) → „Karte auflegen & beschreiben" → leere Karte antippen.
2. Erwartung: „Karte beschrieben und ans Fahrzeug gebunden." (bzw. „…noch keinem Fahrzeug zugewiesen…" ohne Auswahl).
3. Karte danach mit einem **beliebigen Handy** antippen → öffnet `https://app.claimondo.de/schaden/<token>`.
4. In der Karten-Liste erscheint die Karte (Status `gebunden`/`bestellt`).
5. Ergebnis (grün/rot + Screenshots) im PR/Marker dokumentieren. Aufgabe bleibt **offen** bis dieser Smoke grün ist.

- [ ] **Step 6: Push + PR gegen `staging`**

```bash
git push -u origin kitta/flotte-kartenbindung-nfc
gh pr create --base staging --title "feat(schadenkarte): NFC Blanko-Write-First-Provisioner (Flottenmanager + Admin)" --body "<Zusammenfassung + Audit + Regel-4-Smoke-Plan>"
```

---

## Self-Review (gegen die Spec)

**Spec-Coverage:**
- write-first Provisioner (mint-on-tap, overwrite:false, verify, optional bind) → Task 1 (Orchestrierung) + Task 3 (NFC-Adapter/UI). ✓
- „beschreiben ≠ binden", ein Finalize-Aufruf → Task 2 (`finalisiereSchadenkarte`). ✓
- Beide Rollen, ein Component → Task 3 (Component) + Task 5 (Flotte) + Task 7 (Admin). ✓
- Firma-scoped Actions (Flotte eigene / Admin `requireRole`) → Task 4 + Task 6. ✓
- Desktop-Bridge statt Sackgasse → Task 3 (`!unterstuetzt`-Zweig mit QR). ✓
- Kein DB-Change → nur bestehende Lib/Spalten. ✓
- Regel 4 (automatisierter Render-Smoke + manueller Android-Smoke) → Task 8. ✓
- Dead-Code (`merkeNfcUid` entfernt) → Task 4. ✓

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code. Der einzige „confirm exact field names"-Hinweis (Task 7 Step 3) zeigt auf die authoritative Stelle im selben File (bestehendes Dropdown), kein Platzhalter.

**Typ-Konsistenz:** `provisioniereKarte`/`ProvisionEffects`/`ProvisionOutcome` (Task 1) = exakt die in Task 3 konsumierten Namen. `finalisiereSchadenkarte(db,{token,firmaId,userId,nfcUid,fahrzeugId})` (Task 2) = exakt der Aufruf in Task 4 + Task 6. Props `{fahrzeuge,onMintToken,onFinalize}` (Task 3) = exakt übergeben in Task 5 + Task 7. `onMintToken`→`provisioniereKarteToken`/`…Staff`, `onFinalize`→`finalisiereKarte`/`…Staff` — Signaturen identisch.

## Out of Scope (Iteration 2)
Tap-auf-bestehende-Karte-zum-Rebinden; mobiler Batch-Modus; Per-Karte-QR-Druck; Waisen-Cleanup; USB-NFC am Desktop. Unberührt: „Fahrzeug per Karte identifizieren", „Alle QR-Codes als PDF", Sperren/Entsperren/Entbinden, `/flotte/flotte`-QR-Bindung.
