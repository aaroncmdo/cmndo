# Werkstatt-Admin Kunden-QR-Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Admin-Portal `/admin/werkstaetten` pro Werkstatt den regulären Kunden-QR (`/start/werkstatt/[werkstattId]`) ansehen, Link kopieren und als PNG/SVG herunterladen.

**Architecture:** On-Demand-QR via admin-gated Server-Action (spiegelt `kva/qr-action.ts`) → `Modal` pro Tabellenzeile → geteilte `QrCodeDownloadButtons`-Komponente (aus `WerkstattPromo` extrahiert, in beiden genutzt).

**Tech Stack:** Next.js (App Router, Server Actions), React Client Components, Supabase, `qrcode`-lib (via `generateQrCodeSvg`), vitest, `@/components/primitives` (`Button`/`Modal`), `@/components/shared/DataTable`.

## Global Constraints

- UI-Strings Deutsch mit echten Umlauten (ä/ö/ü/ß).
- Component-Set: `Button`/`Modal` aus `@/components/primitives`, `DataTable`-Set aus `@/components/shared`.
- Kein `type`/`const`-Export aus `'use server'`-File (AAR-664) → `qr-action.ts` exportiert nur die async Action.
- Server-Action: Result-Object `{ ok: true; … } | { ok: false; error }`, kein `throw`.
- Keine DB-Änderung / Migration. Base `staging`, PR gegen `staging`.
- 7-Punkte-Audit im Commit-Body.

---

### Task 1: Geteilte `QrCodeDownloadButtons`-Komponente + WerkstattPromo-Refactor

**Files:**
- Create: `src/components/shared/QrCodeDownloadButtons.tsx`
- Modify: `src/components/werkstatt/WerkstattPromo.tsx` (entfernt inline-Download-Logik, nutzt die neue Komponente)

**Interfaces:**
- Produces: `QrCodeDownloadButtons({ qrSvg: string; fileBaseName: string; pngSize?: number })` — rendert PNG- + SVG-Download-Buttons.

- [ ] **Step 1: Komponente anlegen**

```tsx
'use client'

// Geteilte QR-Download-Buttons (PNG/SVG). Aus WerkstattPromo extrahiert, damit
// Werkstatt-Portal + Admin-Werkstattverwaltung dieselbe Download-Logik teilen.

import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/primitives'

type Props = {
  qrSvg: string
  fileBaseName: string
  pngSize?: number
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function QrCodeDownloadButtons({ qrSvg, fileBaseName, pngSize = 600 }: Props) {
  function downloadSvg() {
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' })
    triggerDownload(blob, `${fileBaseName}.svg`)
  }

  function downloadPng() {
    const img = new Image()
    const encoded = btoa(unescape(encodeURIComponent(qrSvg)))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pngSize
      canvas.height = pngSize
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, pngSize, pngSize)
      ctx.drawImage(img, 0, 0, pngSize, pngSize)
      canvas.toBlob((blob) => {
        if (!blob) return
        triggerDownload(blob, `${fileBaseName}.png`)
      }, 'image/png')
    }
    img.src = `data:image/svg+xml;base64,${encoded}`
  }

  return (
    <div className="flex gap-2">
      <Button variant="navy" size="sm" onClick={downloadPng} iconLeft={<DownloadIcon width={12} height={12} />}>
        PNG
      </Button>
      <Button variant="ghost" size="sm" onClick={downloadSvg} iconLeft={<DownloadIcon width={12} height={12} />}>
        SVG
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: WerkstattPromo refactoren** — `DownloadIcon`-Import entfernen, `triggerDownload`/`downloadSvg`/`downloadPng` löschen, Import `import { QrCodeDownloadButtons } from '@/components/shared/QrCodeDownloadButtons'` ergänzen, den inline-Button-Block (`<div className="flex gap-2"> … PNG/SVG … </div>`) ersetzen durch `<QrCodeDownloadButtons qrSvg={qrSvg} fileBaseName="claimondo-werkstatt-qr" />`. Übrige Imports (`QrCodeIcon`, `CopyIcon`, `CheckIcon`, `ExternalLinkIcon`, `Button`) bleiben.

- [ ] **Step 3: tsc** — `npx tsc --noEmit` → grün.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/QrCodeDownloadButtons.tsx src/components/werkstatt/WerkstattPromo.tsx
git commit -m "refactor(werkstatt-admin-qr): extract QrCodeDownloadButtons shared component"
```

---

### Task 2: Server-Action `werkstattQrSvg` + Test

**Files:**
- Create: `src/app/admin/werkstaetten/qr-action.ts`
- Test: `src/app/admin/werkstaetten/__tests__/qr-action.test.ts`

**Interfaces:**
- Consumes: `werkstattStartUrl` (`@/lib/start-link/werkstatt-start-url`), `generateQrCodeSvg` (`@/lib/kanzlei/qr-code`), `createClient` (`@/lib/supabase/server`).
- Produces: `werkstattQrSvg(werkstattId: string): Promise<{ ok: true; svg: string; url: string; name: string } | { ok: false; error: string }>`

- [ ] **Step 1: Test schreiben** (`qr-action.test.ts`)

```ts
// Fokussierte Tests fuer werkstattQrSvg (admin-gate + happy path).
import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockConfig: { authUser: { id: string } | null; profileRolle: string | null; werkstattName: string | null } = {
  authUser: null, profileRolle: null, werkstattName: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: vi.fn().mockImplementation(async () => ({ data: { user: mockConfig.authUser } })) },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockConfig.profileRolle ? { rolle: mockConfig.profileRolle } : null, error: null,
          }),
        }
      }
      if (table === 'werkstaetten') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockConfig.werkstattName ? { name: mockConfig.werkstattName } : null, error: null,
          }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) }
    }),
  })),
}))

beforeEach(() => {
  mockConfig = { authUser: null, profileRolle: null, werkstattName: null }
  vi.clearAllMocks()
})

describe('werkstattQrSvg', () => {
  it('gibt ok:false zurueck wenn der Caller kein Admin ist', async () => {
    mockConfig.authUser = { id: 'u1' }
    mockConfig.profileRolle = 'dispatch'
    const { werkstattQrSvg } = await import('../qr-action')
    const res = await werkstattQrSvg('w-1')
    expect(res.ok).toBe(false)
  })

  it('gibt ok:true mit svg + url zurueck fuer Admin + gueltige id', async () => {
    mockConfig.authUser = { id: 'admin1' }
    mockConfig.profileRolle = 'admin'
    mockConfig.werkstattName = 'Test-Werkstatt'
    const { werkstattQrSvg } = await import('../qr-action')
    const res = await werkstattQrSvg('w-42')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.svg).toContain('<svg')
      expect(res.url).toContain('/start/werkstatt/w-42')
      expect(res.name).toBe('Test-Werkstatt')
    }
  })
})
```

- [ ] **Step 2: Test laufen lassen (rot)** — `npx vitest run src/app/admin/werkstaetten/__tests__/qr-action.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Action implementieren** (`qr-action.ts`)

```ts
'use server'

// On-Demand-QR fuer eine Werkstatt im Admin-Portal. Spiegelt kva/qr-action.ts.
// Liefert den regulaeren Kunden-Einstiegs-QR (/start/werkstatt/<id>) — NICHT den KVA-QR.

import { createClient } from '@/lib/supabase/server'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { werkstattStartUrl } from '@/lib/start-link/werkstatt-start-url'

export async function werkstattQrSvg(
  werkstattId: string,
): Promise<{ ok: true; svg: string; url: string; name: string } | { ok: false; error: string }> {
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins duerfen QR-Codes abrufen.' }

  const { data: w } = await supabase.from('werkstaetten').select('name').eq('id', werkstattId).single()
  if (!w) return { ok: false, error: 'Werkstatt nicht gefunden.' }

  const url = werkstattStartUrl(werkstattId)
  const svg = await generateQrCodeSvg(url, 300)
  return { ok: true, svg, url, name: w.name }
}
```

- [ ] **Step 4: Test laufen lassen (grün)** — `npx vitest run src/app/admin/werkstaetten/__tests__/qr-action.test.ts` → 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/werkstaetten/qr-action.ts src/app/admin/werkstaetten/__tests__/qr-action.test.ts
git commit -m "feat(werkstatt-admin-qr): werkstattQrSvg server-action (admin-gated) + tests"
```

---

### Task 3: Admin-UI — QR-Spalte + Modal

**Files:**
- Modify: `src/app/admin/werkstaetten/WerkstaettenClient.tsx`

**Interfaces:**
- Consumes: `werkstattQrSvg` (Task 2), `QrCodeDownloadButtons` (Task 1).

- [ ] **Step 1: Imports ergänzen**
  - lucide: `QrCodeIcon`, `CopyIcon`, `CheckIcon` zur bestehenden Zeile hinzufügen.
  - `import { werkstattQrSvg } from './qr-action'`
  - `import { QrCodeDownloadButtons } from '@/components/shared/QrCodeDownloadButtons'`

- [ ] **Step 2: State + Helper im Component-Body**

```tsx
const [qr, setQr] = useState<{ name: string; url: string; svg: string } | null>(null)
const [qrLoadingId, setQrLoadingId] = useState<string | null>(null)
const [copiedUrl, setCopiedUrl] = useState(false)

async function openQr(w: Werkstatt) {
  setQrLoadingId(w.id)
  try {
    const res = await werkstattQrSvg(w.id)
    if (!res.ok) { toast.error(res.error); return }
    setQr({ name: res.name, url: res.url, svg: res.svg })
    setCopiedUrl(false)
  } finally {
    setQrLoadingId(null)
  }
}

function copyQrUrl(text: string) {
  void navigator.clipboard.writeText(text).then(() => {
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  })
}

function qrFileBase(name: string) {
  const slug = name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `claimondo-werkstatt-${slug || 'qr'}-qr`
}
```

- [ ] **Step 3: QR-Spalte in der Tabelle** — neuer `<Th className="text-left text-claimondo-ondo!">QR</Th>` als letzte Spalte im Header; neue letzte `<Td>` pro Zeile:

```tsx
<Td>
  <Button
    size="sm"
    variant="ghost"
    loading={qrLoadingId === w.id}
    onClick={() => openQr(w)}
    iconLeft={<QrCodeIcon className="w-4 h-4" />}
  >
    QR
  </Button>
</Td>
```

  Empty-state-Row `colSpan={5}` → `colSpan={6}`.

- [ ] **Step 4: QR-Modal** (neben dem bestehenden Create-Modal):

```tsx
<Modal open={qr !== null} onClose={() => setQr(null)} maxWidth={420} ariaLabel="Werkstatt-QR-Code">
  {qr && (
    <div className="space-y-4">
      <h2 className="text-claimondo-navy font-semibold text-lg">QR-Code — {qr.name}</h2>
      <p className="text-claimondo-ondo text-sm">
        Kunden scannen diesen Code und gelangen direkt zum Schadenmelde-Einstieg dieser Werkstatt.
      </p>
      <div
        className="flex items-center justify-center p-6 rounded-ios-xl bg-claimondo-bg border border-claimondo-border"
        dangerouslySetInnerHTML={{ __html: qr.svg }}
      />
      <div>
        <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">Einstiegs-Link</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            readOnly
            value={qr.url}
            className="flex-1 font-mono text-sm text-claimondo-navy bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2.5 truncate"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="navy"
            size="sm"
            onClick={() => copyQrUrl(qr.url)}
            iconLeft={copiedUrl ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
          >
            {copiedUrl ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-xs text-claimondo-ondo">Zum Aushängen / Drucken:</span>
        <QrCodeDownloadButtons qrSvg={qr.svg} fileBaseName={qrFileBase(qr.name)} />
      </div>
    </div>
  )}
</Modal>
```

- [ ] **Step 5: tsc + build** — `npx tsc --noEmit` grün; voller Build in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/werkstaetten/WerkstaettenClient.tsx
git commit -m "feat(werkstatt-admin-qr): QR-Spalte + Modal in der Admin-Werkstattverwaltung"
```

---

### Task 4: Gates, Audit, PR

- [ ] **Step 1: vitest** — `npx vitest run src/app/admin/werkstaetten src/components` (neue + benachbarte Tests grün).
- [ ] **Step 2: Voller Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Server-Action + Route → Next.js-Validator).
- [ ] **Step 3: Ratchets** — `npm run check:token-audit`, `npm run check:component-set`, `npm run check:knip` (lokal `--warn`, müssen sauber bleiben; neue Files nicht in Baselines verschlechtern).
- [ ] **Step 4: 7-Punkte-Audit** durchgehen, Branch pushen, PR gegen `staging` öffnen (Audit-Body).

## Self-Review (gegen Spec)

1. **Spec coverage:** Server-Action (Task 2) ✓, geteilte Komponente (Task 1) ✓, Admin-UI Modal+Spalte (Task 3) ✓, WerkstattPromo-Refactor (Task 1) ✓, Test (Task 2) ✓, kein DB-Change ✓.
2. **Placeholder scan:** keine TBD/„handle errors" — alle Code-Blöcke vollständig.
3. **Type consistency:** `werkstattQrSvg` Rückgabe `{ ok, svg, url, name }` identisch in Action, Test, `openQr`; `QrCodeDownloadButtons`-Props `{ qrSvg, fileBaseName, pngSize? }` identisch in Definition + beiden Call-Sites.
