# Werkstatt KVA-Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Werkstatt lädt im `/werkstatt`-Portal einen Kostenvoranschlag hoch; OCR liest Schadenbetrag/Fahrzeug/ggf. Kundendaten; nach Review entsteht ein Lead + kanonischer FlowLink, den der Kunde vorausgefüllt abschließt (Tab/QR/WhatsApp).

**Architecture:** Reine Erweiterung der bestehenden (live) Werkstatt-Vermittler-Infrastruktur. Neuer KVA-OCR-Extraktor (Claude Vision, Muster `gutachten-ocr.ts`) + zwei Server-Actions + eine 3-Schritt-Portal-Seite. Lead/FlowLink via bestehender `issueCanonicalFlowLinkForAnfrage` (trägt `werkstatt_id` bereits gfa→lead; +additiver `kostenvoranschlag`-Carry). `/flow/[token]` (Termin + Beauftragung) unverändert.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + Storage), Anthropic SDK (`@anthropic-ai/sdk`, `AI_MODELS.ocr` = `claude-sonnet-4-6`), vitest.

## Global Constraints

- Server-Actions liefern Result-Objekte `{ ok: boolean; … }`, kein `throw` (AGENTS.md). Non-critical Sub-Ops (Doc-Upload, WA) in try/catch + log.
- DDL **nur** via Supabase-Plugin `apply_migration` (Regel 2), danach `list_migrations` → Migration-File exakt nach getrackter Version benennen → `execute_sql` (READ) verifizieren.
- KVA-Betrag-Invariante: `kostenvoranschlag_*` ist die **Werkstatt-Schätzung**, fließt **nie** in `gutachten.*` oder `claims.schadens_hoehe_netto`.
- Auth: jede Action/Seite gegated auf Rolle `werkstatt` via `requirePortalAccess(['werkstatt'])`; `werkstatt_id` aus `getWerkstattByUserId()` (nie aus dem Client).
- gfa NOT-NULL: `vorname`, `nachname`, `email`, `schadentyp` müssen gesetzt sein (Platzhalter erlaubt; `email=''`).
- UI: Komponenten aus `@/components/primitives` + `@/components/shared`; echte Umlaute in nutzersichtbaren Strings.
- Branch `kitta/werkstatt-kva-upload` (Worktree), PR gegen `staging`. Vor Implementierungsstart: `git -C <wt> fetch origin staging && git -C <wt> rebase origin/staging`.

---

### Task 1: Migration — `kostenvoranschlag_*`-Spalten

**Files:**
- Create: `supabase/migrations/<V>_werkstatt_kva_kostenvoranschlag_cols.sql` (V = vom Plugin vergebene Version)

**Interfaces:**
- Produces: `gutachter_finder_anfragen.kostenvoranschlag_netto/_brutto` (numeric, nullable); `leads.kostenvoranschlag_netto/_brutto` (numeric, nullable).

- [ ] **Step 1: DDL via Plugin anwenden**

`apply_migration({ name: "werkstatt_kva_kostenvoranschlag_cols", query: <SQL> })` mit:

```sql
ALTER TABLE public.gutachter_finder_anfragen
  ADD COLUMN kostenvoranschlag_netto numeric,
  ADD COLUMN kostenvoranschlag_brutto numeric;

ALTER TABLE public.leads
  ADD COLUMN kostenvoranschlag_netto numeric,
  ADD COLUMN kostenvoranschlag_brutto numeric;

COMMENT ON COLUMN public.gutachter_finder_anfragen.kostenvoranschlag_brutto IS
  'Werkstatt-Kostenvoranschlag (Schaetzung). NICHT der SV-Gutachten-Wert / claims.schadens_hoehe_netto.';
COMMENT ON COLUMN public.leads.kostenvoranschlag_brutto IS
  'Werkstatt-Kostenvoranschlag (Schaetzung). NICHT der SV-Gutachten-Wert / claims.schadens_hoehe_netto.';
```

- [ ] **Step 2: Getrackte Version ablesen**

`list_migrations` → die für `werkstatt_kva_kostenvoranschlag_cols` vergebene Version `<V>` notieren.

- [ ] **Step 3: Migration-File committen (Name == `<V>`)**

Datei `supabase/migrations/<V>_werkstatt_kva_kostenvoranschlag_cols.sql` mit exakt dem SQL aus Step 1 anlegen.

- [ ] **Step 4: Verifizieren (READ)**

`execute_sql`:
```sql
select table_name, column_name, data_type from information_schema.columns
where table_schema='public' and column_name like 'kostenvoranschlag_%'
  and table_name in ('gutachter_finder_anfragen','leads') order by 1,2;
```
Expected: 4 Zeilen (je netto/brutto auf gfa + leads), `numeric`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(werkstatt-kva): kostenvoranschlag_netto/brutto auf gfa+leads (Werkstatt-Schaetzung, getrennt vom SV-Wert)"
```

---

### Task 2: KVA-OCR-Extraktor + Test (TDD)

**Files:**
- Create: `src/lib/ai/kostenvoranschlag-ocr.ts`
- Test: `src/lib/ai/kostenvoranschlag-ocr.test.ts`

**Interfaces:**
- Produces:
  - `type KvaOcrResult` (alle Felder `… | null`): `kostenvoranschlag_netto`, `kostenvoranschlag_brutto`, `fahrzeug_hersteller`, `fahrzeug_modell`, `kennzeichen`, `fin`, `erstzulassung`, `fahrzeug_baujahr`, `halter_vorname`, `halter_nachname`, `halter_strasse`, `halter_plz`, `halter_ort`, `telefon`.
  - `parseKvaOcrResponse(raw: string): KvaOcrResult` (PURE).
  - `extrahiereKvaAusBase64(input: { base64: string; mediaType: string }): Promise<{ ok: true; data: KvaOcrResult } | { ok: false; error: string }>`.

- [ ] **Step 1: Failing test schreiben**

`src/lib/ai/kostenvoranschlag-ocr.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseKvaOcrResponse } from './kostenvoranschlag-ocr'

describe('parseKvaOcrResponse', () => {
  it('parst JSON + normalisiert deutsche Betraege', () => {
    const raw = 'Hier das Ergebnis:\n{"kostenvoranschlag_netto":"3.245,67","kostenvoranschlag_brutto":"3.862,35","fahrzeug_hersteller":"BMW","fahrzeug_modell":"320d","kennzeichen":"K-AB 123","fin":"WBA1234567890","erstzulassung":"2019-03-01","fahrzeug_baujahr":2019,"halter_vorname":"Max","halter_nachname":"Mustermann","halter_strasse":"Hauptstr. 1","halter_plz":"50667","halter_ort":"Köln","telefon":"+49170123"}'
    const r = parseKvaOcrResponse(raw)
    expect(r.kostenvoranschlag_netto).toBe(3245.67)
    expect(r.kostenvoranschlag_brutto).toBe(3862.35)
    expect(r.fahrzeug_hersteller).toBe('BMW')
    expect(r.fahrzeug_baujahr).toBe(2019)
    expect(r.halter_ort).toBe('Köln')
  })

  it('fehlende Felder -> null; kein JSON -> alles null', () => {
    expect(parseKvaOcrResponse('{"kostenvoranschlag_brutto":1000}').kostenvoranschlag_netto).toBeNull()
    expect(parseKvaOcrResponse('keine daten').kostenvoranschlag_brutto).toBeNull()
    expect(parseKvaOcrResponse('keine daten').fahrzeug_hersteller).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen, Fehlschlag verifizieren**

Run: `cd <wt> && npx vitest run src/lib/ai/kostenvoranschlag-ocr.test.ts`
Expected: FAIL — `Cannot find module './kostenvoranschlag-ocr'`.

- [ ] **Step 3: Implementierung schreiben**

`src/lib/ai/kostenvoranschlag-ocr.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from './models'

export type KvaOcrResult = {
  kostenvoranschlag_netto: number | null
  kostenvoranschlag_brutto: number | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kennzeichen: string | null
  fin: string | null
  erstzulassung: string | null
  fahrzeug_baujahr: number | null
  halter_vorname: string | null
  halter_nachname: string | null
  halter_strasse: string | null
  halter_plz: string | null
  halter_ort: string | null
  telefon: string | null
}

const LEER: KvaOcrResult = {
  kostenvoranschlag_netto: null, kostenvoranschlag_brutto: null,
  fahrzeug_hersteller: null, fahrzeug_modell: null, kennzeichen: null, fin: null,
  erstzulassung: null, fahrzeug_baujahr: null, halter_vorname: null, halter_nachname: null,
  halter_strasse: null, halter_plz: null, halter_ort: null, telefon: null,
}

export const KVA_SYSTEM_PROMPT =
  'Du bist ein OCR-Assistent fuer deutsche Kfz-Kostenvoranschlaege (KVA) von Werkstaetten. ' +
  'Extrahiere die folgenden Felder und gib AUSSCHLIESSLICH ein JSON-Objekt zurueck (keine Erklaerung, ' +
  'kein Markdown). Wert nicht im Dokument -> null. Betraege: deutsche Schreibweise normalisieren ' +
  '("3.245,67 EUR" -> 3245.67). Der Kostenvoranschlag-Betrag ist die GESAMTE Reparatursumme der Werkstatt ' +
  '(NICHT einzelne Positionen). Datum als ISO YYYY-MM-DD.\n\n' +
  '{\n' +
  '  "kostenvoranschlag_netto": number|null,\n' +
  '  "kostenvoranschlag_brutto": number|null,\n' +
  '  "fahrzeug_hersteller": string|null,\n' +
  '  "fahrzeug_modell": string|null,\n' +
  '  "kennzeichen": string|null,\n' +
  '  "fin": string|null (17-stellig),\n' +
  '  "erstzulassung": "YYYY-MM-DD"|null,\n' +
  '  "fahrzeug_baujahr": number|null,\n' +
  '  "halter_vorname": string|null,\n' +
  '  "halter_nachname": string|null,\n' +
  '  "halter_strasse": string|null,\n' +
  '  "halter_plz": string|null,\n' +
  '  "halter_ort": string|null,\n' +
  '  "telefon": string|null\n' +
  '}\n\nAntworte NUR mit dem JSON-Objekt.'

function num(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** PURE: Claude-Textantwort -> KvaOcrResult. Toleriert umgebenden Prosa-Text. */
export function parseKvaOcrResponse(raw: string): KvaOcrResult {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { ...LEER }
  let p: Record<string, unknown>
  try { p = JSON.parse(match[0]) as Record<string, unknown> } catch { return { ...LEER } }
  return {
    kostenvoranschlag_netto: num(p.kostenvoranschlag_netto),
    kostenvoranschlag_brutto: num(p.kostenvoranschlag_brutto),
    fahrzeug_hersteller: str(p.fahrzeug_hersteller),
    fahrzeug_modell: str(p.fahrzeug_modell),
    kennzeichen: str(p.kennzeichen),
    fin: str(p.fin),
    erstzulassung: str(p.erstzulassung),
    fahrzeug_baujahr: num(p.fahrzeug_baujahr),
    halter_vorname: str(p.halter_vorname),
    halter_nachname: str(p.halter_nachname),
    halter_strasse: str(p.halter_strasse),
    halter_plz: str(p.halter_plz),
    halter_ort: str(p.halter_ort),
    telefon: str(p.telefon),
  }
}

/** Ruft Claude Vision auf den KVA (base64) und liefert das geparste Ergebnis. */
export async function extrahiereKvaAusBase64(
  input: { base64: string; mediaType: string },
): Promise<{ ok: true; data: KvaOcrResult } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY fehlt' }
  try {
    const client = new Anthropic({ apiKey })
    const isPdf = input.mediaType === 'application/pdf'
    const block = isPdf
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: input.base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: input.mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: input.base64 } }
    const resp = await client.messages.create({
      model: AI_MODELS.ocr,
      max_tokens: 1024,
      system: KVA_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extrahiere die im System-Prompt definierten Felder aus diesem Kostenvoranschlag.' }] }],
    })
    const tb = resp.content.find((b) => b.type === 'text')
    const raw = tb?.type === 'text' ? tb.text : ''
    return { ok: true, data: parseKvaOcrResponse(raw) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Test laufen, Erfolg verifizieren**

Run: `cd <wt> && npx vitest run src/lib/ai/kostenvoranschlag-ocr.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/kostenvoranschlag-ocr.ts src/lib/ai/kostenvoranschlag-ocr.test.ts
git commit -m "feat(werkstatt-kva): KVA-OCR-Extraktor (Claude Vision) + PURE Parser-Test"
```

---

### Task 3: `kostenvoranschlag`-Carry gfa→lead (additiv)

**Files:**
- Modify: `src/lib/start-link/issue-canonical-flowlink.ts` (im `extra`-Objekt, direkt nach der bestehenden `werkstatt_id`-Zeile ~164–166)

**Interfaces:**
- Consumes: `gfa.kostenvoranschlag_netto/_brutto` (Task 1).
- Produces: `leads.kostenvoranschlag_netto/_brutto` befüllt beim gfa→lead-Convert.

- [ ] **Step 1: Carry-Zeilen ergänzen**

Direkt nach `;(extra as Record<string, unknown>).werkstatt_id = (gfa.werkstatt_id as string | null) ?? null` einfügen:
```ts
    // AAR Werkstatt-KVA: Werkstatt-Kostenvoranschlag durchreichen (gfa->lead). Eigene Spur,
    // NIE der SV-Gutachten-Wert (claims.schadens_hoehe_netto). Record-Cast wg. Type-Lag (AGENTS §6).
    ;(extra as Record<string, unknown>).kostenvoranschlag_netto = (gfa.kostenvoranschlag_netto as number | null) ?? null
    ;(extra as Record<string, unknown>).kostenvoranschlag_brutto = (gfa.kostenvoranschlag_brutto as number | null) ?? null
```

- [ ] **Step 2: tsc verifizieren**

Run: `cd <wt> && npx tsc --noEmit`
Expected: exit 0 (keine neuen Fehler).

- [ ] **Step 3: Commit**

```bash
git add src/lib/start-link/issue-canonical-flowlink.ts
git commit -m "feat(werkstatt-kva): kostenvoranschlag-Carry gfa->lead in issueCanonicalFlowLink (additiv)"
```

---

### Task 4: Server-Actions (`extrahiereKvaOcr` + `erstelleWerkstattLeadAusKva`)

**Files:**
- Create: `src/app/werkstatt/(shell)/kva/actions.ts`

**Interfaces:**
- Consumes: `extrahiereKvaAusBase64`, `KvaOcrResult` (Task 2); `issueCanonicalFlowLinkForAnfrage` (`{ send }`); `requirePortalAccess(['werkstatt'])` → `{ user }`; `getWerkstattByUserId()` → Werkstatt-Row (id, name, adresse_strasse/plz/ort, status).
- Produces:
  - `extrahiereKvaOcr(input: { base64: string; mediaType: string }): Promise<{ ok: true; data: KvaOcrResult } | { ok: false; error: string }>`
  - `erstelleWerkstattLeadAusKva(daten: WerkstattKvaInput): Promise<{ ok: true; token: string; leadId: string } | { ok: false; error: string }>`
  - `type WerkstattKvaInput` (siehe Code).

- [ ] **Step 1: Action-Datei schreiben**

`src/app/werkstatt/(shell)/kva/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'
import { extrahiereKvaAusBase64, type KvaOcrResult } from '@/lib/ai/kostenvoranschlag-ocr'

export async function extrahiereKvaOcr(
  input: { base64: string; mediaType: string },
): Promise<{ ok: true; data: KvaOcrResult } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!input?.base64) return { ok: false, error: 'Kein Dokument' }
  return extrahiereKvaAusBase64(input)
}

export type WerkstattKvaInput = {
  vorname?: string | null
  nachname?: string | null
  email?: string | null
  telefon?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  kennzeichen?: string | null
  fin?: string | null
  erstzulassung?: string | null
  fahrzeug_baujahr?: number | null
  kostenvoranschlag_netto?: number | null
  kostenvoranschlag_brutto?: number | null
  ocrRoh?: unknown
  kvaBase64?: string | null
  kvaMediaType?: string | null
  perWhatsApp?: boolean
}

export async function erstelleWerkstattLeadAusKva(
  daten: WerkstattKvaInput,
): Promise<{ ok: true; token: string; leadId: string } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) return { ok: false, error: 'Werkstatt nicht gefunden' }

  const admin = createAdminClient()
  const ort = [werkstatt.adresse_plz, werkstatt.adresse_ort].filter(Boolean).join(' ').trim()
  const besichtigungsort = [werkstatt.adresse_strasse, ort].filter(Boolean).join(', ').trim() || null

  const { data: gfa, error } = await admin
    .from('gutachter_finder_anfragen')
    .insert({
      vorname: (daten.vorname ?? '').trim() || 'Kunde',
      nachname: (daten.nachname ?? '').trim() || '(Werkstatt-KVA)',
      email: (daten.email ?? '').trim(),
      telefon: (daten.telefon ?? '').trim() || null,
      schadentyp: 'Unfallschaden',
      status: 'neu',
      werkstatt_id: werkstatt.id,
      besichtigungsort_adresse: besichtigungsort,
      schadenort: besichtigungsort,
      fahrzeug_hersteller: daten.fahrzeug_hersteller ?? null,
      fahrzeug_modell: daten.fahrzeug_modell ?? null,
      kennzeichen: daten.kennzeichen ?? null,
      fin_vin: daten.fin ?? null,
      erstzulassung: daten.erstzulassung ?? null,
      fahrzeug_baujahr: daten.fahrzeug_baujahr ?? null,
      kostenvoranschlag_netto: daten.kostenvoranschlag_netto ?? null,
      kostenvoranschlag_brutto: daten.kostenvoranschlag_brutto ?? null,
      ocr_rohdaten: (daten.ocrRoh as Record<string, unknown> | null) ?? null,
      ocr_extrahiert_am: new Date().toISOString(),
    } as Record<string, unknown>)
    .select('id')
    .single()
  if (error || !gfa) return { ok: false, error: error?.message ?? 'Anlage fehlgeschlagen' }

  const issued = await issueCanonicalFlowLinkForAnfrage(gfa.id as string, {
    send: !!(daten.telefon && daten.telefon.trim()) && daten.perWhatsApp === true,
  })
  if (!issued.ok) return { ok: false, error: issued.error }

  // KVA-Dokument an den Lead haengen (non-critical).
  try {
    if (daten.kvaBase64 && daten.kvaMediaType) {
      const ext = daten.kvaMediaType === 'application/pdf' ? 'pdf' : (daten.kvaMediaType.split('/')[1] ?? 'bin')
      const bytes = Buffer.from(daten.kvaBase64, 'base64')
      await admin.storage
        .from('fall-dokumente')
        .upload(`leads/${issued.leadId}/kostenvoranschlag_${Date.now()}.${ext}`, bytes, {
          contentType: daten.kvaMediaType,
          upsert: false,
        })
    }
  } catch (e) {
    console.error('[werkstatt-kva] KVA-Doc-Upload fehlgeschlagen (nicht kritisch):', e)
  }

  revalidatePath('/werkstatt')
  return { ok: true, token: issued.token, leadId: issued.leadId }
}
```

**Hinweis (verifizieren):** `getWerkstattByUserId()` muss `adresse_strasse/plz/ort` in seiner Projektion liefern. Falls nicht: `src/lib/werkstatt/queries.ts` um diese Spalten erweitern (additiv).

- [ ] **Step 2: tsc verifizieren**

Run: `cd <wt> && npx tsc --noEmit`
Expected: exit 0. (Falls `kostenvoranschlag_*`/`werkstatt_id` Type-Fehler auf gfa werfen — Types hinken der DB hinterher: der `as Record<string, unknown>`-Cast auf dem Insert deckt das ab; bei Bedarf `generate_typescript_types` aufschieben, AGENTS §6.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/werkstatt/(shell)/kva/actions.ts"
git commit -m "feat(werkstatt-kva): Server-Actions extrahiereKvaOcr + erstelleWerkstattLeadAusKva"
```

---

### Task 5: Portal-Seite (3-Schritt-Flow) + Nav + Übergabe-QR

**Files:**
- Create: `src/app/werkstatt/(shell)/kva/page.tsx` (Server-Component, rendert den Client-Flow)
- Create: `src/components/werkstatt/WerkstattKvaFlow.tsx` (Client: Upload → Review → Übergabe)
- Create: `src/app/werkstatt/(shell)/kva/qr-action.ts` (Server-Action: QR-SVG für den FlowLink)
- Modify: `src/components/werkstatt/WerkstattShell.tsx` (Nav-Eintrag „Kostenvoranschlag")

**Interfaces:**
- Consumes: `extrahiereKvaOcr`, `erstelleWerkstattLeadAusKva` (Task 4); der QR-SVG-Generator aus `src/app/werkstatt/(shell)/promo/page.tsx` (dort den exakten Import ablesen — erzeugt das `qrSvg` für `WerkstattPromo`); `WerkstattPromo` als Render-Muster (`dangerouslySetInnerHTML` für `qrSvg`).
- Produces: Route `/werkstatt/kva`.

- [ ] **Step 1: QR-Server-Action**

`src/app/werkstatt/(shell)/kva/qr-action.ts` — generiert das QR-SVG für `/flow/[token]` mit demselben Generator wie `promo/page.tsx`:
```ts
'use server'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
// HINWEIS: exakten Import + Funktionsnamen aus promo/page.tsx uebernehmen (gleicher QR-SVG-Generator).
import { generateWerkstattQrSvg } from '@/lib/werkstatt/qr' // <- ggf. anpassen an den realen Pfad/Namen aus promo/page.tsx

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

export async function qrSvgFuerToken(token: string): Promise<{ ok: true; svg: string; url: string } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!token) return { ok: false, error: 'Kein Token' }
  const url = `${APP_URL}/flow/${token}`
  const svg = await generateWerkstattQrSvg(url)
  return { ok: true, svg, url }
}
```
**Verifizieren:** In `promo/page.tsx` den realen QR-Generator-Import nachschlagen und hier 1:1 verwenden (Funktion + Pfad). Falls der Generator synchron ist, `await` entfernen.

- [ ] **Step 2: Client-Flow-Komponente**

`src/components/werkstatt/WerkstattKvaFlow.tsx` — `'use client'`, drei Phasen `'upload' | 'review' | 'fertig'` via `useState`:
- **upload:** File-Input (PDF/JPG/PNG) → `FileReader` → base64 → `extrahiereKvaOcr({ base64, mediaType })`; bei `ok` Felder in den Review-State, Phase `review`; bei `!ok` trotzdem nach `review` mit leeren Feldern (manuell ausfüllbar) + Hinweistext.
- **review:** editierbare Felder via `@/components/shared/forms/TextField` (Hersteller, Modell, Kennzeichen, FIN, Erstzulassung, Baujahr, **Kostenvoranschlag netto/brutto**, Vorname, Nachname, E-Mail, Telefon *(optional)*) + Checkbox „Per WhatsApp senden" (nur wenn Telefon gesetzt). Button „Lead anlegen & FlowLink erzeugen" → `erstelleWerkstattLeadAusKva({ …felder, ocrRoh, kvaBase64, kvaMediaType, perWhatsApp })`; bei `ok` Token in State, Phase `fertig`.
- **fertig (Übergabe):** Reuse des `WerkstattPromo`-Musters — `qrSvgFuerToken(token)` laden; zeigen: (a) Button „Auf diesem Gerät öffnen" → `window.open(\`/flow/${token}\`, '_blank')`, (b) QR (`dangerouslySetInnerHTML={{ __html: svg }}` in einer `Card`), (c) falls `perWhatsApp` + Telefon: Hinweis „Link wurde per WhatsApp gesendet". Button „Weiteren Kunden anlegen" → Reset auf `upload`.

Echte Umlaute in allen Labels/Buttons. Nur `primitives`/`shared`-Komponenten (Button/Card/TextField), Claimondo-Tokens (kein raw Tailwind-Hex/Status — Token-Audit). Foto/PDF-base64: `const b64 = (reader.result as string).split(',')[1]`.

- [ ] **Step 3: Server-Page**

`src/app/werkstatt/(shell)/kva/page.tsx`:
```tsx
import { WerkstattKvaFlow } from '@/components/werkstatt/WerkstattKvaFlow'

export const dynamic = 'force-dynamic'

export default function WerkstattKvaPage() {
  return <WerkstattKvaFlow />
}
```
(Auth/Werkstatt-Gate kommt bereits aus `(shell)/layout.tsx`.)

- [ ] **Step 4: Nav-Eintrag**

In `src/components/werkstatt/WerkstattShell.tsx` den Nav-Items-Block um einen Eintrag erweitern (gleiche Struktur wie die bestehenden, z.B. neben „QR-Code"):
```tsx
{ href: '/werkstatt/kva', label: 'Kostenvoranschlag', icon: <FileTextIcon width={16} height={16} /> },
```
(`FileTextIcon` aus `lucide-react` importieren; exakte Item-Shape aus den bestehenden Nav-Items in der Datei übernehmen.)

- [ ] **Step 5: Build verifizieren**

Run: `cd <wt> && NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: exit 0; Route `/werkstatt/kva` in der Routen-Liste.

- [ ] **Step 6: Commit**

```bash
git add "src/app/werkstatt/(shell)/kva/" src/components/werkstatt/WerkstattKvaFlow.tsx src/components/werkstatt/WerkstattShell.tsx
git commit -m "feat(werkstatt-kva): Portal-Seite KVA-Upload->Review->Uebergabe (Tab/QR/WA) + Nav"
```

---

### Task 6: Audit, Gates & Smoke

**Files:** keine (Verifikation).

- [ ] **Step 1: Voller Build + tsc**

Run: `cd <wt> && npx tsc --noEmit && NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: beide exit 0.

- [ ] **Step 2: vitest (gesamt)**

Run: `cd <wt> && npx vitest run`
Expected: die neuen KVA-Tests grün; vorbestehende Fails (falls vorhanden) per Stash-Vergleich als pre-existing bestätigen (nicht durch diese Änderung verursacht — KVA-Dateien sind additiv).

- [ ] **Step 3: Ratchets**

Run: `cd <wt> && npm run check:token-audit && npm run check:component-set -- --ratchet && npm run check:termin-engine-contract`
Expected: keine neuen Verstöße. (knip: falls Binary im Env fehlt — additive Änderung, CI greift.)

- [ ] **Step 4: 7-Punkte-Audit + finaler Commit/PR**

7-Punkte-Audit dokumentieren (Build grün; UI=Nav-Eintrag „Kostenvoranschlag" im Werkstatt-Portal; Redundanz=OCR/FlowLink/Flow/QR/Storage wiederverwendet; Dead-Code=keiner; Spec-Treue=Upload→OCR→Review→FlowLink→Tab/QR/WA + KVA-Betrag getrennt; Inkonsistenz=ok-Shape/revalidate/Umlaute/DB-Spalten verifiziert; Regression=issueCanonicalFlowLink additiv, /flow + GF-Pfad unberührt). Push + PR gegen `staging`.

- [ ] **Step 5: Manuelle Live-Verifikation (nach Deploy)**

Im Werkstatt-Portal einen Test-KVA hochladen → DB-Check: genau 1 gfa+lead mit `werkstatt_id` + `kostenvoranschlag_*` + `ocr_rohdaten`; `/flow/[token]` zeigt Fahrzeug/Daten vorausgefüllt; Übergabe Tab/QR (+ WA falls Telefon). Test-Residue danach aufräumen.

---

## Self-Review (gegen den Spec)

- **Spec-Coverage:** Upload+OCR (T2,T4) · Review (T5) · Lead+FlowLink mit werkstatt_id (T4 + bestehender Carry) · KVA-Betrag-Trennung (T1 eigene Spalten, T3 Carry, nie claims/gutachten) · Übergabe Tab/QR/WA (T5) · Migration (T1) · Tests/Audit (T2,T6). Alle Spec-Sektionen haben eine Task.
- **Platzhalter:** Echter Code in T1–T4; T5 (UI) gibt Struktur + Daten-Wiring + exakte Reuse-Referenzen (WerkstattPromo, promo-QR-Generator, Nav-Item-Shape) — die zwei „verifizieren"-Hinweise (getWerkstattByUserId-Projektion, QR-Generator-Name) zeigen exakt auf die zu lesende Datei, kein vages „TODO".
- **Typ-Konsistenz:** `KvaOcrResult` (T2) ↔ `WerkstattKvaInput`-Felder (T4) ↔ Review-Felder (T5) ↔ gfa-Spalten — konsistente Namen (`kostenvoranschlag_netto/brutto`, `fahrzeug_*`, `halter_*`/`fin`/`telefon`).
