# KB-Konsultations-Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein KB-eigenes Konsultations-Cockpit (`/mitarbeiter/konsultation/[terminId]`), das vom Auto-Beratungstermin aus Kunden-Kontext zeigt, Anrufen (Aircall) erlaubt, den FlowLink erneut sendet (schlank) und das Gesprächs-Ergebnis loggt.

**Architecture:** Service-role + expliziter Ownership-Gate (`gutachter_termine.kb_id === user.id`), weil der KB **keinen RLS-Pfad** auf claim-lose Funnel-Abbrecher-Leads hat (verifiziert via `pg_policies`: `leads_staff_all_consolidated`/`leads_kanzlei_kb_select_consolidated` erfordern einen Claim mit `kundenbetreuer_id=KB`). Der Multi-Channel-Send wird aus `dispatch/.../flowlink.ts` in eine Lib mit injiziertem DB-Client extrahiert; Dispatch injiziert seinen RLS-Client, der KB den Admin-Client. Kein DB-Change, kein Types-Regen.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (service-role via `createAdminClient`), `primitives.Button`, `shared/PhoneButton` (Aircall), `WunschterminPicker` (reuse aus embed), vitest.

## Global Constraints

- **Kein DB-Change, keine Migration, kein Types-Regen.** Nur bestehende Spalten: `gutachter_termine.notiz_intern/durchgefuehrt_am/status/verlegung_initiator_kunde/start_zeit/end_zeit`, `leads.*`, `timeline`, `flow_links` (read).
- **Server-Actions liefern `{ ok: boolean; error?: string }`** — nie `throw`, nie `success` (neuer Code = `ok`).
- **Aus `'use server'`-Files NIE Typen/Konstanten exportieren** (AAR-664) → `KonsultationDisposition` lebt in `types.ts`.
- **termin-engine-contract-Ratchet:** Auf `gutachter_termine` **NIE** `.eq('lead_id')`/`.eq('sv_id')` — immer `.eq('id', terminId)` + JS-Gate auf `kb_id`. (`.or('lead_id.eq…')` im Send-Core ist erlaubt — kein `.eq('lead_id')`-Match; Filter auf `flow_links`/`leads` sind eigene Segmente, block-aware-safe.)
- **Frontend-Umlaute** (ä/ö/ü/ß) in allen nutzersichtbaren Strings (Buttons/Labels/Toasts).
- **`primitives.Button`** (`variant`: `ondo`/`ghost`/`navy`, `loading`-Prop) — kein handgerolltes `<button className=…>`. Token-Klassen (`claimondo-*`, `rounded-ios-*`, `text-body/-caption`), kein Inline-Hex, keine raw Status-/Accent-Scales.
- **Ownership-Gate zuerst:** service-role wird IMMER erst nach bestätigtem `kb_id===user.id` für Lead-/Termin-Daten verwendet.
- **Build:** Routen + Server-Actions → voller `npm run build` (Audit-Punkt 1). Bei OOM: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Bash-Syntax).

---

## File Structure

- **Create** `src/lib/start-link/send-flowlink-multichannel.ts` — Send-Core `sendFlowLinkMultiChannelCore(db, leadId, kanal, actorId, telefonOverride?)`.
- **Modify** `src/app/dispatch/leads/[id]/_actions/flowlink.ts` — `sendFlowLinkMultiChannel` wird thin Wrapper (Signatur unverändert).
- **Create** `src/lib/start-link/__tests__/send-flowlink-multichannel.test.ts` — Core-Injektions-Test.
- **Create** `src/app/mitarbeiter/konsultation/[terminId]/types.ts` — `KonsultationDisposition` (kein 'use server').
- **Create** `src/app/mitarbeiter/konsultation/[terminId]/actions.ts` — KB-Actions + Ownership-Helper.
- **Create** `src/app/mitarbeiter/konsultation/[terminId]/__tests__/konsultation-actions.test.ts` — vitest.
- **Create** `src/app/mitarbeiter/konsultation/[terminId]/page.tsx` — Cockpit-Page (Server).
- **Create** `src/app/mitarbeiter/konsultation/[terminId]/KonsultationCockpit.tsx` — Cockpit-UI (Client).
- **Modify** `src/app/mitarbeiter/termine/page.tsx` — Listen-Link für `kb_beratung` → Cockpit (Einstiegspunkt).

---

## Task 1: Send-Core extrahieren + Dispatch-Wrapper

**Files:**
- Create: `src/lib/start-link/send-flowlink-multichannel.ts`
- Modify: `src/app/dispatch/leads/[id]/_actions/flowlink.ts`
- Test: `src/lib/start-link/__tests__/send-flowlink-multichannel.test.ts`

**Interfaces:**
- Produces: `sendFlowLinkMultiChannelCore(db: DbClient, leadId: string, kanal: 'whatsapp'|'sms'|'email', actorId: string, telefonOverride?: string|null): Promise<{ success: boolean; error?: string; token?: string }>`
- `sendFlowLinkMultiChannel(leadId, kanal, telefonOverride?)` behält Signatur + `{ success, error?, token? }` — die 3 bestehenden Consumer (`DispatchFlowlinkPanel.tsx:75`, `dispatch/kalender/_actions/spontan.ts:91`, Re-Export `dispatch/leads/[id]/actions.ts:20`) bleiben unverändert.

- [ ] **Step 1: Core-Lib erstellen.** Der Body ist eine 1:1-Übernahme der aktuellen `sendFlowLinkMultiChannel` (flowlink.ts), mit: `supabase`→`db`, `user.id`→`actorId`, OHNE `createClient`/`getUser`/`if(!user)` (Zeilen 18–20) und OHNE die `revalidatePath`-Zeilen. **Wichtig:** Die `DbClient`-Typ-Zeile + die beiden Type-Imports (`SupabaseClient` aus `@supabase/supabase-js`, `Database` aus den generierten Types) **exakt aus `src/lib/claims/get-claim-for-role.ts` (Zeilen 1–20) übernehmen** (dort `type DbClient = SupabaseClient<Database>`). `createAdminClient()` ist untypisiert, aber an `DbClient` assignable (Präzedenz: die kb-termin-reminder-Crons übergeben `createAdminClient()` an `resolveClaimId(db: DbClient, …)`).

```typescript
// AAR-956: Multi-Channel-FlowLink-Versand — Core mit injiziertem DB-Client.
// Extrahiert aus dispatch/leads/[id]/_actions/flowlink.ts. Beide Aufrufer teilen
// diesen Code, injizieren aber je ihren Client + Actor:
//   - Dispatch        -> createClient() (RLS; Dispatcher hat Voll-Zugriff auf leads)
//   - KB-Konsultation -> createAdminClient() (service-role; der KB hat KEINEN
//     RLS-Pfad auf claim-lose Abbrecher-Leads — siehe pg_policies / Design-Spec).
// revalidatePath bleibt im jeweiligen Wrapper (verschiedene Routen).
// KEIN 'use server' — reine Lib (mehrere Server-Actions importieren sie).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types' // EXAKT wie get-claim-for-role.ts importiert
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { persistFlowLinkVersand } from '@/lib/start-link/persist-flowlink-versand'

type DbClient = SupabaseClient<Database>

export async function sendFlowLinkMultiChannelCore(
  db: DbClient,
  leadId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
  actorId: string,
  telefonOverride?: string | null,
): Promise<{ success: boolean; error?: string; token?: string }> {
  const { data: lead } = await db
    .from('leads')
    .select('id, vorname, nachname, telefon, email, service_typ, sprache')
    .eq('id', leadId)
    .single()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const telefon = (telefonOverride?.trim() || lead.telefon) ?? null
  const serviceTyp = (lead.service_typ as string | null) ?? 'komplett'
  const sprache = (lead.sprache as string | null) ?? 'de'

  const flRes = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp, sprache })
  if (!flRes.ok) return { success: false, error: flRes.error }
  const token = flRes.token

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const flowUrl = `${baseUrl}/flow/${token}`

  const { data: terminRaw } = await db
    .from('gutachter_termine')
    .select('start_zeit, sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()
  const termin = terminRaw as { start_zeit: string; sachverstaendige: unknown } | null
  const svRel = termin?.sachverstaendige
  const sv = (Array.isArray(svRel) ? svRel[0] : svRel) as { profiles: unknown } | null
  const profileRel = sv?.profiles
  const profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
    | { vorname: string | null; nachname: string | null }
    | null
  const svVorname = profile?.vorname ?? ''
  const svNachname = profile?.nachname ?? ''
  const terminDate = termin?.start_zeit ? new Date(termin.start_zeit) : null
  const datum = terminDate ? terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
  const uhrzeit = terminDate
    ? terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
    : ''

  const vornameVal = (lead.vorname ?? '').trim()
  const terminTextMoeglich = Boolean(svVorname && svNachname && datum && uhrzeit)

  if (kanal === 'whatsapp') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für WhatsApp' }
    let waTelefon = telefon.replace(/\s/g, '')
    if (waTelefon.startsWith('0')) waTelefon = '+49' + waTelefon.slice(1)
    else if (waTelefon.startsWith('00')) waTelefon = '+' + waTelefon.slice(2)
    if (!waTelefon.startsWith('+')) waTelefon = '+' + waTelefon
    try {
      if (terminTextMoeglich) {
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('flowlink_versand', {
          telefon: waTelefon,
          '1': vornameVal, '2': svVorname, '3': svNachname, '4': datum, '5': uhrzeit, '6': flowUrl,
        })
      } else {
        const { sendWhatsAppText } = await import('@/lib/whatsapp/baileys-client')
        const greet = vornameVal ? `Hallo ${vornameVal}` : 'Hallo'
        const sent = await sendWhatsAppText(
          waTelefon,
          `${greet}, hier geht es zu Ihrer Schadensregulierung bei Claimondo:\n\n${flowUrl}\n\nMit wenigen Klicks buchen Sie Ihren Gutachter-Termin und schließen ab.`,
        )
        if (!sent.ok) return { success: false, error: sent.error ?? 'WhatsApp-Versand fehlgeschlagen' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'WhatsApp-Versand fehlgeschlagen' }
    }
  } else if (kanal === 'sms') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für SMS' }
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const smsFrom = process.env.TWILIO_SMS_FROM
    if (!accountSid || !authToken || !smsFrom) {
      return { success: false, error: 'Twilio-SMS-Credentials fehlen (TWILIO_SMS_FROM)' }
    }
    let normalTo = telefon.replace(/\s/g, '')
    if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
    else if (normalTo.startsWith('00')) normalTo = '+' + normalTo.slice(2)
    if (!normalTo.startsWith('+')) normalTo = '+' + normalTo
    const body = terminTextMoeglich
      ? `Hallo ${vornameVal}, Ihr Schadenportal ist bereit. Termin mit ${svVorname} ${svNachname} am ${datum} ${uhrzeit}. Portal öffnen: ${flowUrl}`
      : `Hallo ${vornameVal}, hier geht es zu Ihrer Schadensregulierung bei Claimondo: ${flowUrl}`
    const params = new URLSearchParams()
    params.set('From', smsFrom); params.set('To', normalTo); params.set('Body', body)
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { success: false, error: `Twilio-SMS Fehler ${resp.status}: ${text.slice(0, 200)}` }
    }
  } else if (kanal === 'email') {
    if (!lead.email) return { success: false, error: 'Keine Email-Adresse am Lead' }
    if (terminTextMoeglich) {
      const { sendFlowLinkVersand } = await import('@/lib/email/google/flows')
      const r = await sendFlowLinkVersand(leadId, flowUrl)
      if (!r.success) return { success: false, error: r.error }
    } else {
      const { sendMiniWizardMagicLink } = await import('@/lib/email/google/flows')
      const r = await sendMiniWizardMagicLink(leadId, flowUrl)
      if (!r.success) return { success: false, error: r.error }
    }
  }

  try {
    await persistFlowLinkVersand(createAdminClient(), token, kanal)
  } catch (err) {
    console.error('[sendFlowLinkMultiChannelCore] persistFlowLinkVersand:', err)
  }

  const { data: currentLead } = await db
    .from('leads')
    .select('zugewiesen_an')
    .eq('id', leadId)
    .maybeSingle()
  await db
    .from('leads')
    .update({
      ...(kanal === 'whatsapp' && { wa_gesendet: true }),
      ...(!currentLead?.zugewiesen_an && { zugewiesen_an: actorId }),
      status: 'flow-gesendet',
      qualifizierungs_phase: 'flow-versendet',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  const kanalLabel = kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'
  await db
    .from('timeline')
    .insert({
      lead_id: leadId,
      fall_id: null,
      typ: 'system',
      titel: `FlowLink per ${kanalLabel} versendet`,
      beschreibung: `An ${kanal === 'email' ? lead.email : telefon} — SV ${svVorname} ${svNachname} am ${datum} ${uhrzeit}`,
      erstellt_von: actorId,
    })
    .then(() => {}, () => {})

  return { success: true, token }
}
```

- [ ] **Step 2: Dispatch-Wrapper umbauen.** `flowlink.ts` vollständig ersetzen durch den thin Wrapper (gleiche Signatur, ruft den Core, revalidiert die Dispatch-Pfade):

```typescript
'use server'

// AAR-143/AAR-956: thin Wrapper um sendFlowLinkMultiChannelCore. Dispatch nutzt
// den RLS-Client (createClient) — Dispatcher haben Voll-Zugriff auf leads.
import { createClient } from '@/lib/supabase/server'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { revalidatePath } from 'next/cache'

export async function sendFlowLinkMultiChannel(
  leadId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
  telefonOverride?: string | null,
): Promise<{ success: boolean; error?: string; token?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const res = await sendFlowLinkMultiChannelCore(supabase, leadId, kanal, user.id, telefonOverride)
  if (res.success) {
    revalidatePath(`/dispatch/leads/${leadId}`)
    revalidatePath('/dispatch/dashboard')
  }
  return res
}
```

- [ ] **Step 3: Failing test schreiben** (`src/lib/start-link/__tests__/send-flowlink-multichannel.test.ts`). Testet den Injektions-Contract: der Core nutzt den übergebenen `db` (kein `createClient`), Lead-nicht-gefunden → Fehler; Email-Happy-Path mit gemockten Deps → `{success:true}` + Status-Advance via injiziertem db.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ensureCanonicalFlowLinkForLead + Email-Send gemockt (keine echten Sends).
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: vi.fn(async () => ({ ok: true, token: 'tok-1' })),
}))
vi.mock('@/lib/start-link/persist-flowlink-versand', () => ({ persistFlowLinkVersand: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/email/google/flows', () => ({
  sendFlowLinkVersand: vi.fn(async () => ({ success: true })),
  sendMiniWizardMagicLink: vi.fn(async () => ({ success: true })),
}))

import { sendFlowLinkMultiChannelCore } from '../send-flowlink-multichannel'

// Mini queue-Builder (idiom: convert-lead-to-claim.test.ts)
let q: Array<{ data: unknown; error?: unknown }> = []
const updateCalls: unknown[] = []
function next() { return q.shift() ?? { data: null, error: null } }
function makeBuilder() {
  const h: Record<string, unknown> = {}
  h.select = () => h; h.eq = () => h; h.or = () => h; h.in = () => h; h.order = () => h; h.limit = () => h
  h.single = () => Promise.resolve(next())
  h.maybeSingle = () => Promise.resolve(next())
  h.then = (res: (v: unknown) => unknown) => Promise.resolve(next()).then(res)
  return h
}
const db = {
  from: () => ({
    select: () => makeBuilder(),
    update: (p: unknown) => { updateCalls.push(p); return makeBuilder() },
    insert: () => makeBuilder(),
  }),
} as never

beforeEach(() => { q = []; updateCalls.length = 0; vi.clearAllMocks() })

describe('sendFlowLinkMultiChannelCore', () => {
  it('gibt "Lead nicht gefunden" wenn der injizierte db keinen Lead liefert', async () => {
    q = [{ data: null }] // lead .single()
    const r = await sendFlowLinkMultiChannelCore(db, 'lead-x', 'email', 'kb-1')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Lead nicht gefunden')
  })

  it('Email-Happy-Path: success:true + Lead-Status-Advance mit actorId', async () => {
    q = [
      { data: { id: 'lead-1', vorname: 'Max', nachname: 'M', telefon: null, email: 'a@b.de', service_typ: 'komplett', sprache: 'de' } }, // lead
      { data: null },                 // gutachter_termine maybeSingle (kein Termin)
      { data: { zugewiesen_an: null } }, // currentLead
      { data: null, error: null },    // leads update terminal
      { data: null, error: null },    // timeline insert terminal
    ]
    const r = await sendFlowLinkMultiChannelCore(db, 'lead-1', 'email', 'kb-1')
    expect(r.success).toBe(true)
    expect(r.token).toBe('tok-1')
    expect(updateCalls.at(-1)).toMatchObject({ status: 'flow-gesendet', zugewiesen_an: 'kb-1' })
  })
})
```

- [ ] **Step 4: Test laufen lassen.** Run: `npx vitest run src/lib/start-link/__tests__/send-flowlink-multichannel.test.ts`. Erwartung: 2 PASS.
- [ ] **Step 5: tsc.** Run: `npx tsc --noEmit`. Erwartung: 0 Fehler (Wrapper + Core + 3 Consumer kompilieren).
- [ ] **Step 6: Commit.**
```bash
git add src/lib/start-link/send-flowlink-multichannel.ts src/lib/start-link/__tests__/send-flowlink-multichannel.test.ts "src/app/dispatch/leads/[id]/_actions/flowlink.ts"
git commit -m "refactor(KFZ-AAR-956): sendFlowLinkMultiChannel-Core extrahieren (injizierter db)"
```

---

## Task 2: KB-Actions + Ownership-Gate

**Files:**
- Create: `src/app/mitarbeiter/konsultation/[terminId]/types.ts`
- Create: `src/app/mitarbeiter/konsultation/[terminId]/actions.ts`
- Test: `src/app/mitarbeiter/konsultation/[terminId]/__tests__/konsultation-actions.test.ts`

**Interfaces:**
- Consumes: `sendFlowLinkMultiChannelCore` (Task 1).
- Produces: `sendeKonsultationsFlowLink(terminId, kanal): Promise<{ok; error?}>`; `protokolliereKonsultation(terminId, disposition, notiz?, neuStartIso?): Promise<{ok; error?}>`; Type `KonsultationDisposition = 'durchgefuehrt'|'nicht_erreicht'|'verschoben'` (aus `types.ts`).

- [ ] **Step 1: types.ts** (KEIN 'use server' — AAR-664):
```typescript
// AAR-956: Disposition-Type separat (nicht aus 'use server'-File exportierbar).
export type KonsultationDisposition = 'durchgefuehrt' | 'nicht_erreicht' | 'verschoben'
```

- [ ] **Step 2: actions.ts.** Ownership-Helper + 2 Actions. service-role NUR nach `kb_id===user.id`-Gate. `gutachter_termine`-Queries nutzen `.eq('id')` (contract-safe).
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { revalidatePath } from 'next/cache'
import type { KonsultationDisposition } from './types'

const BERATUNG_DAUER_MIN = 30

// Service-role-Lookup + Ownership-Gate: liefert {admin, termin, leadId} NUR wenn
// der Termin dem aufrufenden KB gehört (kb_beratung + kb_id==userId). Sonst null.
async function ladeEigenenKbTermin(terminId: string, userId: string) {
  const admin = createAdminClient()
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, typ, kb_id, lead_id, start_zeit, status, notiz_intern')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin || termin.typ !== 'kb_beratung' || termin.kb_id !== userId) return null
  return { admin, termin, leadId: (termin.lead_id as string | null) ?? null }
}

export async function sendeKonsultationsFlowLink(
  terminId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const ctx = await ladeEigenenKbTermin(terminId, user.id)
  if (!ctx) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }
  if (!ctx.leadId) return { ok: false, error: 'Kein Lead am Termin' }

  const res = await sendFlowLinkMultiChannelCore(ctx.admin, ctx.leadId, kanal, user.id)
  if (!res.success) return { ok: false, error: res.error }

  revalidatePath(`/mitarbeiter/konsultation/${terminId}`)
  revalidatePath('/mitarbeiter/termine')
  return { ok: true }
}

export async function protokolliereKonsultation(
  terminId: string,
  disposition: KonsultationDisposition,
  notiz?: string,
  neuStartIso?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const ctx = await ladeEigenenKbTermin(terminId, user.id)
  if (!ctx) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  const now = new Date().toISOString()
  const trimmedNotiz = notiz?.trim() || null
  const dispoLabel =
    disposition === 'durchgefuehrt' ? 'Durchgeführt'
    : disposition === 'nicht_erreicht' ? 'Nicht erreicht'
    : 'Verschoben'
  const stamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
  const neueZeile = `[${stamp}] ${dispoLabel}${trimmedNotiz ? ': ' + trimmedNotiz : ''}`
  const notizIntern = ctx.termin.notiz_intern ? `${ctx.termin.notiz_intern}\n${neueZeile}` : neueZeile

  const update: Record<string, unknown> = { notiz_intern: notizIntern }

  if (disposition === 'durchgefuehrt') {
    update.durchgefuehrt_am = now
  } else if (disposition === 'verschoben') {
    if (!neuStartIso) return { ok: false, error: 'Kein neuer Termin angegeben' }
    const start = new Date(neuStartIso)
    if (isNaN(start.getTime())) return { ok: false, error: 'Ungültige Zeit' }
    if (start.getTime() <= Date.now()) return { ok: false, error: 'Termin muss in der Zukunft liegen' }
    update.start_zeit = neuStartIso
    update.end_zeit = new Date(start.getTime() + BERATUNG_DAUER_MIN * 60 * 1000).toISOString()
    update.status = 'bestaetigt'
    update.verlegung_initiator_kunde = false // KB-initiiert
  }

  const { error } = await ctx.admin.from('gutachter_termine').update(update).eq('id', terminId)
  if (error) return { ok: false, error: error.message }

  if (ctx.leadId) {
    try {
      await ctx.admin.from('timeline').insert({
        lead_id: ctx.leadId,
        fall_id: null,
        typ: 'system',
        titel: `KB-Beratung: ${dispoLabel}`,
        beschreibung: trimmedNotiz,
        erstellt_von: user.id,
      })
    } catch (err) {
      console.error('[protokolliereKonsultation] timeline:', err)
    }
  }

  revalidatePath(`/mitarbeiter/konsultation/${terminId}`)
  revalidatePath('/mitarbeiter/termine')
  return { ok: true }
}
```

- [ ] **Step 3: Failing test** (`__tests__/konsultation-actions.test.ts`). Mock-Strategie: queue-Builder + gemockter `createAdminClient` + gemockter Core + gemockter Auth-User.
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

let authUser: { id: string } | null = { id: 'kb-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authUser } }) } }),
}))

let terminRow: Record<string, unknown> | null = null
const updateCalls: unknown[] = []
const insertCalls: unknown[] = []
let updateError: unknown = null
function makeAdmin() {
  return {
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: terminRow }) }) }),
      update: (p: unknown) => { updateCalls.push(p); return { eq: async () => ({ error: updateError }) } },
      insert: async (p: unknown) => { insertCalls.push(p); return { error: null } },
    }),
  }
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

const coreMock = vi.fn(async () => ({ success: true, token: 't' }))
vi.mock('@/lib/start-link/send-flowlink-multichannel', () => ({ sendFlowLinkMultiChannelCore: (...a: unknown[]) => coreMock(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendeKonsultationsFlowLink, protokolliereKonsultation } from '../actions'

beforeEach(() => {
  authUser = { id: 'kb-1' }; terminRow = null; updateError = null
  updateCalls.length = 0; insertCalls.length = 0; coreMock.mockClear()
})

const eigenerTermin = { id: 't1', typ: 'kb_beratung', kb_id: 'kb-1', lead_id: 'lead-1', start_zeit: '2026-06-25T08:00:00Z', status: 'reserviert', notiz_intern: null }

describe('Ownership-Gate', () => {
  it('sendeKonsultationsFlowLink lehnt fremden kb_id ab', async () => {
    terminRow = { ...eigenerTermin, kb_id: 'kb-OTHER' }
    const r = await sendeKonsultationsFlowLink('t1', 'email')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('kein Zugriff')
    expect(coreMock).not.toHaveBeenCalled()
  })
  it('protokolliereKonsultation lehnt nicht-kb_beratung ab', async () => {
    terminRow = { ...eigenerTermin, typ: 'sv_begutachtung' }
    const r = await protokolliereKonsultation('t1', 'durchgefuehrt')
    expect(r.ok).toBe(false)
    expect(updateCalls.length).toBe(0)
  })
})

describe('sendeKonsultationsFlowLink', () => {
  it('ruft den Core mit admin-db + actor + ok:true', async () => {
    terminRow = eigenerTermin
    const r = await sendeKonsultationsFlowLink('t1', 'whatsapp')
    expect(r.ok).toBe(true)
    expect(coreMock).toHaveBeenCalledWith(expect.anything(), 'lead-1', 'whatsapp', 'kb-1')
  })
})

describe('protokolliereKonsultation', () => {
  it('durchgefuehrt setzt durchgefuehrt_am + notiz_intern + timeline', async () => {
    terminRow = eigenerTermin
    const r = await protokolliereKonsultation('t1', 'durchgefuehrt', 'Kunde will weitermachen')
    expect(r.ok).toBe(true)
    const upd = updateCalls.at(-1) as Record<string, unknown>
    expect(upd.durchgefuehrt_am).toBeTruthy()
    expect(upd.notiz_intern).toContain('Durchgeführt')
    expect(insertCalls.at(-1)).toMatchObject({ titel: 'KB-Beratung: Durchgeführt', lead_id: 'lead-1' })
  })
  it('verschoben ohne neuStartIso → Fehler', async () => {
    terminRow = eigenerTermin
    const r = await protokolliereKonsultation('t1', 'verschoben')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Kein neuer Termin')
  })
  it('verschoben mit Vergangenheit → Fehler', async () => {
    terminRow = eigenerTermin
    const past = new Date(Date.now() - 3600_000).toISOString()
    const r = await protokolliereKonsultation('t1', 'verschoben', undefined, past)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Zukunft')
  })
  it('verschoben mit Zukunft → start/end/status gesetzt (end=start+30min)', async () => {
    terminRow = eigenerTermin
    const future = new Date(Date.now() + 2 * 24 * 3600_000).toISOString()
    const r = await protokolliereKonsultation('t1', 'verschoben', undefined, future)
    expect(r.ok).toBe(true)
    const upd = updateCalls.at(-1) as Record<string, unknown>
    expect(upd.start_zeit).toBe(future)
    expect(upd.status).toBe('bestaetigt')
    const diff = new Date(upd.end_zeit as string).getTime() - new Date(upd.start_zeit as string).getTime()
    expect(diff).toBe(30 * 60 * 1000)
  })
  it('DB-Update-Fehler → ok:false', async () => {
    terminRow = eigenerTermin; updateError = { message: 'DB kaputt' }
    const r = await protokolliereKonsultation('t1', 'nicht_erreicht')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('DB kaputt')
  })
})
```

- [ ] **Step 4: Tests laufen.** Run: `npx vitest run "src/app/mitarbeiter/konsultation/[terminId]/__tests__/konsultation-actions.test.ts"`. Erwartung: alle PASS.
- [ ] **Step 5: tsc.** Run: `npx tsc --noEmit`. Erwartung: 0 Fehler.
- [ ] **Step 6: Commit.**
```bash
git add "src/app/mitarbeiter/konsultation/[terminId]/types.ts" "src/app/mitarbeiter/konsultation/[terminId]/actions.ts" "src/app/mitarbeiter/konsultation/[terminId]/__tests__/konsultation-actions.test.ts"
git commit -m "feat(KFZ-AAR-956): KB-Konsultations-Actions (FlowLink-Resend + Ergebnis-Log, Ownership-Gate)"
```

---

## Task 3: Cockpit-Page + UI + Listen-Link

**Files:**
- Create: `src/app/mitarbeiter/konsultation/[terminId]/page.tsx`
- Create: `src/app/mitarbeiter/konsultation/[terminId]/KonsultationCockpit.tsx`
- Modify: `src/app/mitarbeiter/termine/page.tsx`

**Interfaces:**
- Consumes: `sendeKonsultationsFlowLink`, `protokolliereKonsultation`, `KonsultationDisposition` (Task 2).

- [ ] **Step 1: page.tsx** (Server; Auth → service-role-Load mit Ownership-Gate → Render). `gutachter_termine` via `.eq('id')` (contract-safe), `leads`/`flow_links` eigene Segmente.
```typescript
// AAR-956: KB-Konsultations-Cockpit. Service-role + Ownership-Gate (kb_id==user),
// weil der KB keinen RLS-Pfad auf claim-lose Abbrecher-Leads hat (siehe Spec).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { KonsultationCockpit } from './KonsultationCockpit'

export const dynamic = 'force-dynamic'

export default async function KonsultationPage({ params }: { params: Promise<{ terminId: string }> }) {
  const { terminId } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, typ, kb_id, lead_id, start_zeit, end_zeit, status, kanal, notiz_intern, durchgefuehrt_am')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin || termin.typ !== 'kb_beratung' || termin.kb_id !== user.id) notFound()

  const { data: lead } = termin.lead_id
    ? await admin
        .from('leads')
        .select(
          'id, vorname, nachname, telefon, email, service_typ, schadentyp, schadentyp_freitext, ' +
            'schadens_hergang, unfalldatum, unfallort, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, ' +
            'fahrzeug_baujahr, qualifizierungs_phase, status, flow_link_geoeffnet, flow_link_abgeschlossen, ' +
            'anruf_versuche, letzter_anruf_status, notiz',
        )
        .eq('id', termin.lead_id)
        .maybeSingle()
    : { data: null }

  const { data: flowLink } = termin.lead_id
    ? await admin
        .from('flow_links')
        .select('gesendet_am, gesendet_kanal, gesendet_anzahl, geoeffnet_am, abgeschlossen_am')
        .eq('lead_id', termin.lead_id)
        .order('erstellt_am', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  return (
    <KonsultationCockpit
      termin={{
        id: termin.id,
        startZeit: termin.start_zeit,
        status: termin.status,
        kanal: termin.kanal,
        notizIntern: termin.notiz_intern,
        durchgefuehrtAm: termin.durchgefuehrt_am,
      }}
      lead={lead}
      flowLink={flowLink}
    />
  )
}
```

- [ ] **Step 2: KonsultationCockpit.tsx** (Client). Kunde-Karte (PhoneButton aircall) + Stand + Termin-Info + Aktionen (Resend WA/SMS/Email, Ergebnis-Log mit Disposition/Notiz/Verschieben-Picker). primitives.Button, Umlaute, Token-Klassen.
```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import PhoneButton from '@/components/shared/PhoneButton'
import PageHeader from '@/components/shared/PageHeader'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { sendeKonsultationsFlowLink, protokolliereKonsultation } from './actions'
import type { KonsultationDisposition } from './types'

type Lead = {
  id: string; vorname: string | null; nachname: string | null; telefon: string | null; email: string | null
  service_typ: string | null; schadentyp: string | null; schadentyp_freitext: string | null
  schadens_hergang: string | null; unfalldatum: string | null; unfallort: string | null; kennzeichen: string | null
  fahrzeug_hersteller: string | null; fahrzeug_modell: string | null; fahrzeug_baujahr: number | null
  qualifizierungs_phase: string | null; status: string | null
  flow_link_geoeffnet: boolean | null; flow_link_abgeschlossen: boolean | null
  anruf_versuche: number | null; letzter_anruf_status: string | null; notiz: string | null
} | null

type FlowLink = {
  gesendet_am: string | null; gesendet_kanal: string | null; gesendet_anzahl: number | null
  geoeffnet_am: string | null; abgeschlossen_am: string | null
} | null

type Props = {
  termin: { id: string; startZeit: string; status: string; kanal: string | null; notizIntern: string | null; durchgefuehrtAm: string | null }
  lead: Lead
  flowLink: FlowLink
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
    }).format(new Date(iso))
  } catch { return iso }
}

const PHASE_LABEL: Record<string, string> = {
  neu: 'Neu — noch nicht gestartet',
  'flow-versendet': 'FlowLink versendet',
  'flow-gesendet': 'FlowLink gesendet',
}

export function KonsultationCockpit({ termin, lead, flowLink }: Props) {
  const [sending, setSending] = useState<string | null>(null)
  const [status, setStatus] = useState(termin.status)
  const [startZeit, setStartZeit] = useState(termin.startZeit)
  const [durchgefuehrt, setDurchgefuehrt] = useState<boolean>(!!termin.durchgefuehrtAm)
  const [dispo, setDispo] = useState<KonsultationDisposition | null>(null)
  const [notiz, setNotiz] = useState('')
  const [neuLokal, setNeuLokal] = useState('')
  const [logging, setLogging] = useState(false)

  const name = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || 'Unbekannter Kunde'
  const fahrzeug = [lead?.fahrzeug_hersteller, lead?.fahrzeug_modell, lead?.fahrzeug_baujahr].filter(Boolean).join(' ')
  const schaden = lead?.schadentyp_freitext || lead?.schadentyp || lead?.schadens_hergang

  async function resend(kanal: 'whatsapp' | 'sms' | 'email') {
    setSending(kanal)
    try {
      const r = await sendeKonsultationsFlowLink(termin.id, kanal)
      if (!r.ok) { toast.error(r.error ?? 'Versand fehlgeschlagen'); return }
      toast.success(`FlowLink per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} gesendet`)
    } finally { setSending(null) }
  }

  async function logge() {
    if (!dispo) return
    setLogging(true)
    try {
      const neuIso = dispo === 'verschoben' && neuLokal ? berlinWallClockToUtc(neuLokal) : undefined
      if (dispo === 'verschoben' && !neuIso) { toast.error('Bitte neuen Termin wählen'); return }
      const r = await protokolliereKonsultation(termin.id, dispo, notiz || undefined, neuIso)
      if (!r.ok) { toast.error(r.error ?? 'Speichern fehlgeschlagen'); return }
      toast.success('Ergebnis gespeichert')
      if (dispo === 'durchgefuehrt') setDurchgefuehrt(true)
      if (dispo === 'verschoben' && neuIso) { setStartZeit(neuIso); setStatus('bestaetigt') }
      setDispo(null); setNotiz(''); setNeuLokal('')
    } finally { setLogging(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Beratungstermin" description={`Konsultation mit ${name}`} size="lg" />

      {/* Kunde-Karte */}
      <section className="bg-white rounded-ios-lg shadow-ios-md p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-body font-semibold text-claimondo-navy">{name}</p>
            {lead?.email && <p className="text-body-sm text-claimondo-ondo">{lead.email}</p>}
          </div>
          {lead?.telefon && (
            <PhoneButton nummer={lead.telefon} mode="aircall" variant="card" leadId={lead.id} label="Anrufen" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-body-sm">
          {fahrzeug && <p><span className="text-claimondo-ondo">Fahrzeug:</span> {fahrzeug}</p>}
          {lead?.kennzeichen && <p><span className="text-claimondo-ondo">Kennzeichen:</span> {lead.kennzeichen}</p>}
          {schaden && <p className="col-span-2"><span className="text-claimondo-ondo">Schaden:</span> {schaden}</p>}
          {lead?.unfallort && <p><span className="text-claimondo-ondo">Unfallort:</span> {lead.unfallort}</p>}
          {lead?.unfalldatum && <p><span className="text-claimondo-ondo">Unfalldatum:</span> {fmt(lead.unfalldatum)}</p>}
        </div>
        {lead?.notiz && <p className="text-body-sm text-claimondo-shield/80 border-t border-claimondo-border pt-2">{lead.notiz}</p>}
      </section>

      {/* Stand */}
      <section className="bg-white rounded-ios-lg shadow-ios-md p-5 space-y-2">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo">Stand</p>
        <p className="text-body-sm text-claimondo-navy">
          {(lead?.qualifizierungs_phase && PHASE_LABEL[lead.qualifizierungs_phase]) || lead?.qualifizierungs_phase || lead?.status || 'Unbekannt'}
        </p>
        <p className="text-body-sm text-claimondo-ondo">
          {flowLink?.gesendet_am
            ? `FlowLink zuletzt gesendet: ${fmt(flowLink.gesendet_am)}${flowLink.gesendet_kanal ? ` via ${flowLink.gesendet_kanal}` : ''}${flowLink.gesendet_anzahl ? ` (${flowLink.gesendet_anzahl}×)` : ''}`
            : 'FlowLink noch nie gesendet'}
          {flowLink?.geoeffnet_am && ' · geöffnet'}
          {flowLink?.abgeschlossen_am && ' · abgeschlossen'}
        </p>
      </section>

      {/* Termin-Info */}
      <section className="bg-white rounded-ios-lg shadow-ios-md p-5">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo mb-1">Termin</p>
        <p className="text-body font-semibold text-claimondo-navy">{fmt(startZeit)}</p>
        <p className="text-body-sm text-claimondo-ondo">
          {termin.kanal === 'video' ? 'Video-Call' : 'Telefon'} · {durchgefuehrt ? 'durchgeführt' : status}
        </p>
      </section>

      {/* Aktion: FlowLink erneut senden */}
      <section className="bg-white rounded-ios-lg shadow-ios-md p-5 space-y-3">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo">FlowLink erneut senden</p>
        <p className="text-body-sm text-claimondo-ondo">Der Kunde schließt den Flow selbst ab (Termin, Auftrag, alles Weitere).</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="ondo" loading={sending === 'whatsapp'} disabled={!lead?.telefon || !!sending} onClick={() => resend('whatsapp')}>WhatsApp</Button>
          <Button variant="ghost" loading={sending === 'sms'} disabled={!lead?.telefon || !!sending} onClick={() => resend('sms')}>SMS</Button>
          <Button variant="ghost" loading={sending === 'email'} disabled={!lead?.email || !!sending} onClick={() => resend('email')}>Email</Button>
        </div>
      </section>

      {/* Aktion: Ergebnis loggen */}
      <section className="bg-white rounded-ios-lg shadow-ios-md p-5 space-y-3">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo">Gesprächsergebnis</p>
        <div className="flex flex-wrap gap-2">
          {(['durchgefuehrt', 'nicht_erreicht', 'verschoben'] as KonsultationDisposition[]).map((d) => (
            <Button key={d} variant={dispo === d ? 'navy' : 'ghost'} disabled={logging} onClick={() => setDispo(d)}>
              {d === 'durchgefuehrt' ? 'Durchgeführt' : d === 'nicht_erreicht' ? 'Nicht erreicht' : 'Verschieben'}
            </Button>
          ))}
        </div>
        {dispo === 'verschoben' && (
          <WunschterminPicker value={neuLokal} onChange={setNeuLokal} />
        )}
        {dispo && (
          <>
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="Notiz (optional)"
              rows={2}
              className="w-full rounded-ios-md border border-claimondo-border p-2 text-body-sm"
            />
            <div className="flex gap-2">
              <Button variant="ondo" loading={logging} disabled={dispo === 'verschoben' && !neuLokal} onClick={logge}>Speichern</Button>
              <Button variant="ghost" disabled={logging} onClick={() => { setDispo(null); setNotiz(''); setNeuLokal('') }}>Abbrechen</Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Listen-Link-Fix** in `src/app/mitarbeiter/termine/page.tsx`. Die `href`-Zeile (aktuell `const href = lead ? ... : fall ? ... : '#'`) ersetzen, sodass `kb_beratung`-Zeilen aufs Cockpit zeigen:
```typescript
                const href =
                  t.typ === 'kb_beratung'
                    ? `/mitarbeiter/konsultation/${t.id}`
                    : lead
                    ? `/dispatch/leads/${lead.id}`
                    : fall
                    ? `/faelle/${fall.id}`
                    : '#'
```

- [ ] **Step 4: Voller Build.** Run (Bash): `NODE_OPTIONS=--max-old-space-size=8192 npm run build`. Erwartung: Build grün (neue Route `/mitarbeiter/konsultation/[terminId]` kompiliert, Server-Action-Validator grün).
- [ ] **Step 5: Ratchets.** Run: `npm run check:termin-engine-contract -- --ratchet` und `npm run check:component-set -- --ratchet` und `npm run check:token-audit` und `npm run check:knip -- --ratchet`. Erwartung: alle grün (keine neuen Verletzer). Falls component-set die net-new `.tsx` zählt: erst `git add` der neuen Files, dann Ratchet (Net-New sind sonst untracked-unsichtbar → CI-Falle).
- [ ] **Step 6: Commit.**
```bash
git add "src/app/mitarbeiter/konsultation/[terminId]/page.tsx" "src/app/mitarbeiter/konsultation/[terminId]/KonsultationCockpit.tsx" "src/app/mitarbeiter/termine/page.tsx"
git commit -m "feat(KFZ-AAR-956): KB-Konsultations-Cockpit Page + UI + Listen-Einstieg"
```

---

## Live-Smoke (nach Task 3, vor PR — Controller)

Auto-rollback-Probe (kein persistenter Testdatensatz): einen kb_beratung-Termin updaten (`notiz_intern` + `durchgefuehrt_am`) + timeline-Insert + Gate-Reject (fremder kb_id liefert kein Row) in einem `DO $ … RAISE EXCEPTION 'RESULT …' END $;`-Block prüfen. Erwartung: Update + Insert greifen unter service-role; ein `kb_id<>X`-Lookup liefert 0 Rows (Gate hält).

## Self-Review (Controller, nach Plan-Erstellung)

- **Spec-Coverage:** Kontext (Task 3 Kunde-Karte/Stand) · Anruf (PhoneButton aircall) · FlowLink-Resend schlank (Task 1 Core + Task 2 Action + Task 3 Buttons) · Ergebnis-Log (Task 2 protokolliereKonsultation + Task 3 Panel) · Listen-Einstieg (Task 3 Step 3) · service-role+Gate (Task 2 ladeEigenenKbTermin, Task 3 page) — alle abgedeckt.
- **Placeholder:** keine offenen TBD; alle Code-Blöcke vollständig.
- **Typ-Konsistenz:** `sendFlowLinkMultiChannelCore`-Signatur identisch in Task 1 (Definition) + Task 2 (Consumer); `KonsultationDisposition` in types.ts definiert, in actions.ts + Cockpit konsumiert (nie aus 'use server' exportiert).
