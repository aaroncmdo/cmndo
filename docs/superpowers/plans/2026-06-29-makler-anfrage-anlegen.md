# Makler legt Kunden-Anfrage an — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Makler legt im Portal (`/makler/leads`) proaktiv einen Kunden an und sendet mit einem Submit entweder einen kanonischen Self-Service-FlowLink (Kunde durchläuft den Gutachter-Finder selbst) ODER bucht einen Rückruf — wobei der Makler immer via `leads.promotion_code_id` für die Abrechnung mitgesendet wird.

**Architecture:** Eine neue Server-Action `erstelleMaklerAnfrage` komponiert ausschließlich bestehende, verifizierte Infrastruktur: `getCurrentMakler` (Auth-Gate) + `getMaklerPrimaryPromoCode` (Attribution) + `createLead` + `pickRoundRobinDispatcher` + `sendFlowLinkMultiChannelCore` (FlowLink-Zweig, setzt Lifecycle selbst) bzw. `erstelleOeffentlichenRueckruf` (Rückruf-Zweig, additiv um `promotionCodeId`+Standort erweitert). Kein DB-Schema-Change. Der Kunde landet im lead-gekeyten `/flow/[token]` — kein zweiter Lead, keine Kollision mit dem öffentlichen Map-Finder. Spec: `docs/superpowers/specs/2026-06-29-makler-anfrage-anlegen-design.md`.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase (service-role für Writes), vitest, React Client Components, `primitives/Modal` + `shared/forms/TextField` + `primitives/Button`, sonner-Toasts.

## Global Constraints

- **Result-Object-Pattern, kein `throw`:** Server-Actions liefern `{ ok: true, … } | { ok: false, error: string }`. Non-critical Sub-Sends (WA/Email/Timeline/notify) in `try/catch`, brechen die Anlage nie.
- **Attribution ist Pflicht:** Jeder vom Makler erzeugte Lead trägt `promotion_code_id` = primärer aktiver Promo-Code des **eingeloggten** Maklers (`getMaklerPrimaryPromoCode(makler.id)`). Niemals aus Client-Input. Kein Promo-Code → Action-Fehler, **kein** Lead.
- **Lifecycle verbatim, keine neuen Werte:** FlowLink-Lead = Anlage `status='neu'` / `qualifizierungs_phase='erstkontakt'`; die Transition auf `'flow-gesendet'`/`'flow-versendet'` macht **ausschließlich** `sendFlowLinkMultiChannelCore` selbst. Rückruf-Lead = `status='rueckruf'` / `qualifizierungs_phase='rueckruf'` (in `erstelleOeffentlichenRueckruf`). `source_channel='makler-anfrage'`.
- **Writes mit service-role:** Auth-Gate user-scoped (`getCurrentMakler`), Writes mit `createAdminClient()` (Makler hat keinen RLS-Write-Pfad). Muster wie `/start/makler` + KB-Konsultations-Cockpit.
- **Kunde → `/flow/[token]` (lead-gekeyt), NIE `/start/makler` (Map-Finder erzeugt 2. Lead).** Der Sender verschickt bereits `/flow/${token}`.
- **Frontend-Umlaute:** alle nutzersichtbaren Strings mit echten `ä/ö/ü/ß`. Makler-Portal nutzt **hardcoded Deutsch** (kein i18n — verifiziert an `leads/page.tsx`).
- **Komponenten-Set:** `primitives/Button` (`onClick`/`variant`/`loading`), `primitives/Modal` (`open`/`onClose`), `shared/forms/TextField` (`label`/`value`/`onChange`). Keine handgerollten Atoms. Token-Klassen (`claimondo-*`, `rounded-ios-*`) — kein raw Hex, keine raw Status-/Accent-Scales.
- **Kein DB-Schema-Change, keine Migration.**

---

### Task 1: `erstelleOeffentlichenRueckruf` additiv um Makler-Attribution + Standort erweitern

Macht die bestehende Rückruf-Infra (Lead + `admin_termine` + Mitteilungen + Team-Notify + Kunde-WA) für den Makler-Zweig wiederverwendbar, ohne Marketing-Caller zu verändern.

**Files:**
- Modify: `src/lib/actions/public-rueckruf.ts:10-18` (Type) + `:64-68` (createLead-`extra`)
- Test: `src/lib/actions/__tests__/public-rueckruf.test.ts` (Create)

**Interfaces:**
- Produces: `erstelleOeffentlichenRueckruf(input: RueckrufInput)` mit `RueckrufInput` zusätzlich `promotionCodeId?: string | null`, `standortPlz?: string | null`, `standortOrt?: string | null`. Rückgabe unverändert: `{ ok: true; leadId: string; terminId: string } | { ok: false; error: string }`.

- [ ] **Step 1: Failing test schreiben**

`src/lib/actions/__tests__/public-rueckruf.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createLeadMock = vi.fn()
vi.mock('@/lib/leads/create-lead', () => ({ createLead: (...a: unknown[]) => createLeadMock(...a) }))
vi.mock('@/lib/leads/notify-new-lead', () => ({ notifyNewLead: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/whatsapp/baileys-client', () => ({ sendWhatsAppText: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/lib/i18n/locale-cookie', () => ({ getLocaleCookie: vi.fn().mockResolvedValue('de') }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const adminMock = {
  from: vi.fn((table: string) => {
    if (table === 'profiles') return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'disp-1' }] }) }) }
    if (table === 'admin_termine') return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'termin-1' }, error: null }) }) }) }
    if (table === 'mitteilungen') return { insert: () => Promise.resolve({ error: null }) }
    return {}
  }),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminMock }))

import { erstelleOeffentlichenRueckruf } from '../public-rueckruf'

describe('erstelleOeffentlichenRueckruf — Makler-Attribution + Standort', () => {
  beforeEach(() => { createLeadMock.mockReset(); createLeadMock.mockResolvedValue({ ok: true, leadId: 'lead-1' }) })

  it('reicht promotionCodeId + Standort an createLead-extra durch', async () => {
    const res = await erstelleOeffentlichenRueckruf({
      name: 'Max Mustermann', telefon: '+4915112345678', quelle: 'makler-anfrage',
      promotionCodeId: 'promo-1', standortPlz: '50667', standortOrt: 'Koeln',
    })
    expect(res.ok).toBe(true)
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBe('promo-1')
    expect(extra.fahrzeug_standort_plz).toBe('50667')
    expect(extra.fahrzeug_standort_adresse).toBe('Koeln')
  })

  it('ohne promotionCodeId bleibt promotion_code_id unset (Marketing-Caller unveraendert)', async () => {
    await erstelleOeffentlichenRueckruf({ name: 'Erika Frei', telefon: '+4915100000000', quelle: 'rueckruf' })
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBeUndefined()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss FAILEN**

Run: `npx vitest run src/lib/actions/__tests__/public-rueckruf.test.ts`
Expected: FAIL (`promotionCodeId` ist noch nicht im Typ / wird nicht durchgereicht — TS-Fehler oder Assertion-Fail).

- [ ] **Step 3: Type erweitern** (`src/lib/actions/public-rueckruf.ts`, im `RueckrufInput`-Block, nach `quelle: string`):

```ts
  quelle: string
  // Makler-Anfrage (#makler-anfrage): Attribution + optionaler Standort-Prefill.
  promotionCodeId?: string | null
  standortPlz?: string | null
  standortOrt?: string | null
```

- [ ] **Step 4: createLead-`extra` erweitern** (im `createLead(admin, {…}, { … })`-Aufruf, 3. Argument):

```ts
    {
      qualifizierungs_phase: 'rueckruf',
      zugewiesen_an: erstellerId,
      sprache: await getLocaleCookie(),
      ...(input.promotionCodeId ? { promotion_code_id: input.promotionCodeId } : {}),
      ...(input.standortPlz ? { fahrzeug_standort_plz: input.standortPlz } : {}),
      ...(input.standortOrt ? { fahrzeug_standort_adresse: input.standortOrt } : {}),
    },
```

- [ ] **Step 5: Test laufen lassen — muss PASSEN**

Run: `npx vitest run src/lib/actions/__tests__/public-rueckruf.test.ts`
Expected: PASS (2 Tests grün).

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/public-rueckruf.ts src/lib/actions/__tests__/public-rueckruf.test.ts
git commit -m "$(cat <<'MSG'
feat(makler-anfrage): erstelleOeffentlichenRueckruf um promotionCodeId+Standort erweitern

Additiv: RueckrufInput += optional promotionCodeId/standortPlz/standortOrt,
durchgereicht an createLead-extra. Marketing-Caller unveraendert. Macht die
bestehende Rueckruf-Infra fuer den Makler-Zweig attribuierbar.

Audit:
- Build: tsc/vitest gruen (2 Tests)
- UI: n/a (Backend)
- Redundanz: erweitert bestehende Funktion statt Duplikat
- Dead-Code: nichts
- Spec: Lifecycle unveraendert (status/phase='rueckruf'); Attribution via promotion_code_id
- Inkonsistenz: Result-Object beibehalten
- Regression: bestehende Caller (Marketing) ohne neue Felder -> Verhalten byte-identisch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Server-Action `erstelleMaklerAnfrage`

Der Kern: Auth-Gate, Attribution, Verzweigung FlowLink/Rückruf.

**Files:**
- Create: `src/lib/makler/erstelle-anfrage.ts`
- Test: `src/lib/makler/__tests__/erstelle-anfrage.test.ts`

**Interfaces:**
- Consumes: `getCurrentMakler(): Promise<MaklerRow|null>` (`MaklerRow.id`, `.user_id`, `.firma`, `.status`); `getMaklerPrimaryPromoCode(maklerId): Promise<{id,code,aktiv}|null>`; `createLead(client, base, extra)`; `pickRoundRobinDispatcher(admin): Promise<string|null>`; `sendFlowLinkMultiChannelCore(db, leadId, kanal, actorId): Promise<{success,error?,token?}>`; `erstelleOeffentlichenRueckruf(input)` (aus Task 1); `notifyNewLead(...)`; `getLocaleCookie()`.
- Produces: `erstelleMaklerAnfrage(input: MaklerAnfrageInput): Promise<MaklerAnfrageResult>`. Types:
  - `MaklerAnfrageAusgang = 'rueckruf' | 'flowlink'`
  - `MaklerAnfrageInput = { vorname: string; nachname: string; telefon: string; email?: string|null; standortPlz?: string|null; standortOrt?: string|null; ausgang: MaklerAnfrageAusgang; rueckrufStartZeit?: string|null }`
  - `MaklerAnfrageResult = { ok: true; leadId: string; ausgang: MaklerAnfrageAusgang; token?: string; terminId?: string; warnung?: string } | { ok: false; error: string }`

- [ ] **Step 1: Failing test schreiben**

`src/lib/makler/__tests__/erstelle-anfrage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentMaklerMock = vi.fn()
const getPromoMock = vi.fn()
const pickDispatcherMock = vi.fn()
const createLeadMock = vi.fn()
const sendCoreMock = vi.fn()
const rueckrufMock = vi.fn()

vi.mock('@/lib/makler/queries', () => ({
  getCurrentMakler: () => getCurrentMaklerMock(),
  getMaklerPrimaryPromoCode: (id: string) => getPromoMock(id),
}))
vi.mock('@/lib/start-link/pick-dispatcher', () => ({ pickRoundRobinDispatcher: () => pickDispatcherMock() }))
vi.mock('@/lib/leads/create-lead', () => ({ createLead: (...a: unknown[]) => createLeadMock(...a) }))
vi.mock('@/lib/start-link/send-flowlink-multichannel', () => ({ sendFlowLinkMultiChannelCore: (...a: unknown[]) => sendCoreMock(...a) }))
vi.mock('@/lib/actions/public-rueckruf', () => ({ erstelleOeffentlichenRueckruf: (i: unknown) => rueckrufMock(i) }))
vi.mock('@/lib/leads/notify-new-lead', () => ({ notifyNewLead: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/i18n/locale-cookie', () => ({ getLocaleCookie: vi.fn().mockResolvedValue('de') }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { erstelleMaklerAnfrage } from '../erstelle-anfrage'

const MAKLER = { id: 'mk-1', user_id: 'user-1', firma: 'Muster Makler', ansprechpartner_vorname: 'Max', status: 'aktiv', erstellt_am: '2026-01-01' }
const baseInput = { vorname: 'Erika', nachname: 'Beispiel', telefon: '+4915112345678' }

beforeEach(() => {
  getCurrentMaklerMock.mockReset().mockResolvedValue(MAKLER)
  getPromoMock.mockReset().mockResolvedValue({ id: 'promo-1', code: 'MK-TEST', aktiv: true })
  pickDispatcherMock.mockReset().mockResolvedValue('disp-1')
  createLeadMock.mockReset().mockResolvedValue({ ok: true, leadId: 'lead-1' })
  sendCoreMock.mockReset().mockResolvedValue({ success: true, token: 'tok-1' })
  rueckrufMock.mockReset().mockResolvedValue({ ok: true, leadId: 'lead-r', terminId: 'termin-1' })
})

describe('erstelleMaklerAnfrage', () => {
  it('flowlink: setzt promotion_code_id (Attribution) + Lifecycle erstkontakt', async () => {
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(true)
    const extra = createLeadMock.mock.calls[0][2] as Record<string, unknown>
    expect(extra.promotion_code_id).toBe('promo-1')
    expect(extra.qualifizierungs_phase).toBe('erstkontakt')
    const base = createLeadMock.mock.calls[0][1] as Record<string, unknown>
    expect(base.status).toBe('neu')
    expect(base.source_channel).toBe('makler-anfrage')
  })

  it('flowlink: Versand-Kaskade startet mit WhatsApp', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(sendCoreMock.mock.calls[0][2]).toBe('whatsapp')
  })

  it('flowlink: WA-Fail -> SMS -> Email', async () => {
    sendCoreMock.mockReset()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, token: 't' })
    const res = await erstelleMaklerAnfrage({ ...baseInput, email: 'e@x.de', ausgang: 'flowlink' })
    expect(sendCoreMock.mock.calls.map((c) => c[2])).toEqual(['whatsapp', 'sms', 'email'])
    expect(res.ok).toBe(true)
  })

  it('flowlink: alle Kanaele scheitern -> ok mit warnung, Lead bleibt', async () => {
    sendCoreMock.mockReset().mockResolvedValue({ success: false })
    const res = await erstelleMaklerAnfrage({ ...baseInput, email: 'e@x.de', ausgang: 'flowlink' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.warnung).toBeTruthy()
  })

  it('rueckruf: delegiert an erstelleOeffentlichenRueckruf mit promotionCodeId, kein eigener createLead', async () => {
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'rueckruf', rueckrufStartZeit: null })
    expect(rueckrufMock).toHaveBeenCalledTimes(1)
    const arg = rueckrufMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.promotionCodeId).toBe('promo-1')
    expect(arg.quelle).toBe('makler-anfrage')
    expect(createLeadMock).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('Fremd-Attribution unmoeglich: Promo aus makler.id, nicht aus Input', async () => {
    await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(getPromoMock).toHaveBeenCalledWith('mk-1')
  })

  it('kein Promo-Code -> Fehler, kein Lead', async () => {
    getPromoMock.mockResolvedValue(null)
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(false)
    expect(createLeadMock).not.toHaveBeenCalled()
  })

  it('kein eingeloggter Makler -> Fehler', async () => {
    getCurrentMaklerMock.mockResolvedValue(null)
    const res = await erstelleMaklerAnfrage({ ...baseInput, ausgang: 'flowlink' })
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss FAILEN**

Run: `npx vitest run src/lib/makler/__tests__/erstelle-anfrage.test.ts`
Expected: FAIL (`erstelle-anfrage` existiert nicht / Cannot find module).

- [ ] **Step 3: Action implementieren**

`src/lib/makler/erstelle-anfrage.ts`:

```ts
'use server'

// Makler legt proaktiv einen Kunden an. Entweder kanonischer FlowLink (Kunde macht
// den Gutachter-Finder im lead-gekeyten /flow/[token] selbst) ODER Rueckruf (Default).
// Attribution IMMER via leads.promotion_code_id = eigener Makler-Promo-Code -> bestehende
// Pipeline (convert-lead-to-claim -> claims.makler_id -> makler_provisionen). Service-role
// fuer Writes; Auth-Gate user-scoped via getCurrentMakler. Komponiert nur bestehende Infra.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentMakler, getMaklerPrimaryPromoCode } from '@/lib/makler/queries'
import { createLead } from '@/lib/leads/create-lead'
import { pickRoundRobinDispatcher } from '@/lib/start-link/pick-dispatcher'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { revalidatePath } from 'next/cache'

export type MaklerAnfrageAusgang = 'rueckruf' | 'flowlink'

export type MaklerAnfrageInput = {
  vorname: string
  nachname: string
  telefon: string
  email?: string | null
  standortPlz?: string | null
  standortOrt?: string | null
  ausgang: MaklerAnfrageAusgang
  rueckrufStartZeit?: string | null
}

export type MaklerAnfrageResult =
  | { ok: true; leadId: string; ausgang: MaklerAnfrageAusgang; token?: string; terminId?: string; warnung?: string }
  | { ok: false; error: string }

export async function erstelleMaklerAnfrage(input: MaklerAnfrageInput): Promise<MaklerAnfrageResult> {
  // 1. Auth-Gate: eingeloggter, aktiver Makler.
  const makler = await getCurrentMakler()
  if (!makler || makler.status !== 'aktiv') return { ok: false, error: 'Kein aktiver Makler-Zugang.' }
  if (!makler.user_id) return { ok: false, error: 'Makler ohne User-Account.' }

  // 2. Attribution: eigener Promo-Code (Fremd-Attribution unmoeglich — aus makler.id).
  const promo = await getMaklerPrimaryPromoCode(makler.id)
  if (!promo) return { ok: false, error: 'Kein aktiver Promo-Code hinterlegt. Bitte Admin kontaktieren.' }

  // 3. Validierung.
  const vorname = input.vorname?.trim() ?? ''
  const nachname = input.nachname?.trim() ?? ''
  const telefon = input.telefon?.trim() ?? ''
  const email = input.email?.trim() || null
  const standortPlz = input.standortPlz?.trim() || null
  const standortOrt = input.standortOrt?.trim() || null
  if (vorname.length < 1 || nachname.length < 1) return { ok: false, error: 'Vor- und Nachname erforderlich.' }
  if (telefon.length < 5) return { ok: false, error: 'Telefonnummer erforderlich.' }
  if (input.ausgang === 'flowlink' && !telefon && !email) {
    return { ok: false, error: 'Fuer den Link-Versand wird Telefon oder Email benoetigt.' }
  }

  // 4a. RUECKRUF (Default): bestehende Rueckruf-Infra (Lead status/phase='rueckruf' + admin_termine
  //     + Mitteilungen + Team-Notify + Kunde-WA), additiv um promotionCodeId + Standort erweitert.
  if (input.ausgang === 'rueckruf') {
    const res = await erstelleOeffentlichenRueckruf({
      name: `${vorname} ${nachname}`.trim(),
      telefon,
      email,
      startZeit: input.rueckrufStartZeit ?? null,
      quelle: 'makler-anfrage',
      promotionCodeId: promo.id,
      standortPlz,
      standortOrt,
    })
    if (!res.ok) return { ok: false, error: res.error }
    revalidatePath('/makler/leads')
    return { ok: true, leadId: res.leadId, ausgang: 'rueckruf', terminId: res.terminId }
  }

  // 4b. FLOWLINK: kanonische Lead-Anlage (status='neu'/phase='erstkontakt') + kanonischer Sender.
  const admin = createAdminClient()
  const dispatcherId = await pickRoundRobinDispatcher(admin)
  const created = await createLead(
    admin,
    { source_channel: 'makler-anfrage', status: 'neu', vorname, nachname, telefon, email },
    {
      promotion_code_id: promo.id,
      service_typ: 'komplett',
      qualifizierungs_phase: 'erstkontakt',
      zugewiesen_an: dispatcherId,
      sprache: await getLocaleCookie(),
      ...(standortPlz ? { fahrzeug_standort_plz: standortPlz } : {}),
      ...(standortOrt ? { fahrzeug_standort_adresse: standortOrt } : {}),
    },
  )
  if (!created.ok) return { ok: false, error: created.error }
  const leadId = created.leadId

  // Versand-Kaskade WhatsApp -> SMS -> Email. Der Core mintet den Token (idempotent) UND
  // setzt selbst status='flow-gesendet'/qualifizierungs_phase='flow-versendet'.
  const actorId = makler.user_id
  let sent: { success: boolean; error?: string; token?: string } = { success: false }
  if (telefon) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'whatsapp', actorId)
  if (!sent.success && telefon) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'sms', actorId)
  if (!sent.success && email) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'email', actorId)

  // Team-Notify (non-critical).
  try {
    await notifyNewLead({
      leadId,
      source: 'Makler-Anfrage',
      name: `${vorname} ${nachname}`.trim(),
      phone: telefon,
      email,
      extraFields: [{ label: 'Makler', value: makler.firma }],
    })
  } catch (err) {
    console.error('[erstelleMaklerAnfrage] notifyNewLead:', err)
  }

  revalidatePath('/makler/leads')
  if (!sent.success) {
    return {
      ok: true,
      leadId,
      ausgang: 'flowlink',
      warnung: 'Lead angelegt, aber der Link konnte nicht zugestellt werden — das Team kuemmert sich.',
    }
  }
  return { ok: true, leadId, ausgang: 'flowlink', token: sent.token }
}
```

- [ ] **Step 4: Test laufen lassen — muss PASSEN**

Run: `npx vitest run src/lib/makler/__tests__/erstelle-anfrage.test.ts`
Expected: PASS (8 Tests grün).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: Keine neuen Fehler in `erstelle-anfrage.ts`. (Bekannte node_modules-Junction-Artefakte `sharp`/`@react-pdf/renderer` ignorieren — CI gatet den echten Build.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/makler/erstelle-anfrage.ts src/lib/makler/__tests__/erstelle-anfrage.test.ts
git commit -m "$(cat <<'MSG'
feat(makler-anfrage): Server-Action erstelleMaklerAnfrage (FlowLink / Rueckruf + Attribution)

Makler legt Kunden an -> entweder kanonischer FlowLink (lead-gekeytes /flow/[token],
Versand-Kaskade WA->SMS->Email via sendFlowLinkMultiChannelCore, Core setzt Lifecycle)
ODER Rueckruf (Default, via erstelleOeffentlichenRueckruf). promotion_code_id IMMER aus
getMaklerPrimaryPromoCode(makler.id) -> Abrechnung garantiert. Auth-Gate + service-role.

Audit:
- Build: tsc gruen (nur Junction-Artefakte); vitest 8 Tests gruen
- UI: n/a (Action; Trigger in Task 3)
- Redundanz: komponiert bestehende Infra (createLead/sendFlowLinkMultiChannelCore/erstelleOeffentlichenRueckruf)
- Dead-Code: nichts
- Spec: Lifecycle verbatim (neu/erstkontakt -> Core; rueckruf-Zweig delegiert); kein DB-Change
- Inkonsistenz: Result-Object; Non-critical Sends in try/catch
- Regression: keine bestehende Datei veraendert (nur Task-1-Erweiterung konsumiert)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: UI — `NeueAnfrageDrawer` + Button auf der Leads-Seite

**Files:**
- Create: `src/app/makler/(shell)/leads/NeueAnfrageDrawer.tsx`
- Modify: `src/app/makler/(shell)/leads/page.tsx:17-26`

**Interfaces:**
- Consumes: `erstelleMaklerAnfrage` + `MaklerAnfrageAusgang` (Task 2); `Button` (`@/components/primitives/Button`, props `onClick`/`variant`/`loading`/`disabled`); `Modal` (`@/components/primitives/Modal`, props `open`/`onClose`); `TextField` (`@/components/shared/forms/TextField`, props `label`/`value`/`onChange`/`type`/`placeholder`/`hint`); `toast` (`sonner`).
- Produces: `<NeueAnfrageDrawer />` (default-exportfrei, named export).

> Hinweis: `variant`-Namen (`ghost` für Abbrechen) an bestehenden `primitives/Button`-Consumern im Makler-Portal abgleichen; falls kein `ghost`, `secondary` nutzen. `Modal` rendert Children — Header/Footer kommen aus dem Drawer selbst (Muster: `MaklerSettings.tsx:597`).

- [ ] **Step 1: Drawer-Komponente erstellen**

`src/app/makler/(shell)/leads/NeueAnfrageDrawer.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import { Modal } from '@/components/primitives/Modal'
import { TextField } from '@/components/shared/forms/TextField'
import { erstelleMaklerAnfrage, type MaklerAnfrageAusgang } from '@/lib/makler/erstelle-anfrage'

export function NeueAnfrageDrawer() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [standortOffen, setStandortOffen] = useState(false)
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [ausgang, setAusgang] = useState<MaklerAnfrageAusgang>('rueckruf') // Default = Rueckruf
  const [rueckrufZeit, setRueckrufZeit] = useState('')

  function reset() {
    setVorname(''); setNachname(''); setTelefon(''); setEmail('')
    setPlz(''); setOrt(''); setStandortOffen(false); setAusgang('rueckruf'); setRueckrufZeit('')
  }

  function submit() {
    if (!vorname.trim() || !nachname.trim()) { toast.error('Vor- und Nachname erforderlich'); return }
    if (telefon.trim().length < 5) { toast.error('Telefonnummer erforderlich'); return }
    startTransition(async () => {
      const res = await erstelleMaklerAnfrage({
        vorname, nachname, telefon,
        email: email || null,
        standortPlz: plz || null,
        standortOrt: ort || null,
        ausgang,
        rueckrufStartZeit: ausgang === 'rueckruf' && rueckrufZeit ? new Date(rueckrufZeit).toISOString() : null,
      })
      if (!res.ok) { toast.error(res.error); return }
      if ('warnung' in res && res.warnung) toast.warning(res.warnung)
      else toast.success(ausgang === 'flowlink' ? 'Link an den Kunden gesendet' : 'Rückruf gebucht')
      setOpen(false); reset()
    })
  }

  const ausgangBtn = (key: MaklerAnfrageAusgang, titel: string, sub: string) => (
    <button
      type="button"
      onClick={() => setAusgang(key)}
      className={`rounded-ios-md border p-3 text-left text-sm transition ${
        ausgang === key ? 'border-claimondo-ondo bg-claimondo-ondo/10' : 'border-claimondo-border'
      }`}
    >
      <span className="font-semibold text-claimondo-navy">{titel}</span>
      <span className="mt-0.5 block text-xs text-claimondo-shield">{sub}</span>
    </button>
  )

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Neue Anfrage</Button>
      <Modal open={open} onClose={() => { if (!pending) { setOpen(false) } }}>
        <div className="space-y-4 p-1">
          <h2 className="text-lg font-bold text-claimondo-navy">Neue Anfrage anlegen</h2>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} />
            <TextField label="Nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} />
          </div>
          <TextField label="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+49 …" />
          <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <button type="button" className="text-sm font-medium text-claimondo-ondo" onClick={() => setStandortOffen((v) => !v)}>
            {standortOffen ? '− Standort ausblenden' : '+ Standort hinzufügen (optional)'}
          </button>
          {standortOffen ? (
            <div className="grid grid-cols-2 gap-3">
              <TextField label="PLZ" value={plz} onChange={(e) => setPlz(e.target.value)} />
              <TextField label="Ort" value={ort} onChange={(e) => setOrt(e.target.value)} />
            </div>
          ) : null}

          <div className="space-y-2">
            <span className="text-xs font-semibold text-claimondo-shield">Wie soll es weitergehen?</span>
            <div className="grid grid-cols-2 gap-3">
              {ausgangBtn('rueckruf', '📞 Rückruf buchen', 'Unser Team ruft den Kunden an.')}
              {ausgangBtn('flowlink', '📲 Link an Kunden senden', 'Kunde wählt Gutachter & Termin selbst.')}
            </div>
            {ausgang === 'rueckruf' ? (
              <TextField
                label="Wunschzeit (optional)"
                type="datetime-local"
                value={rueckrufZeit}
                onChange={(e) => setRueckrufZeit(e.target.value)}
                hint="Leer = baldmöglichst"
              />
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Abbrechen</Button>
            <Button onClick={submit} loading={pending}>Anlegen</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
```

- [ ] **Step 2: Leads-Seite verdrahten** (`src/app/makler/(shell)/leads/page.tsx`)

Import ergänzen (nach den bestehenden Imports):

```tsx
import { NeueAnfrageDrawer } from './NeueAnfrageDrawer'
```

Den `PageHeader` in eine Flex-Zeile mit dem Drawer-Button setzen — ersetze den `return`-Block ab `<div className="max-w-6xl …">`:

```tsx
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Leads"
          description="Ihre Leads mit Consent-Status und Schnellzugriff auf die Akte"
          icon={UserCheckIcon}
        />
        <NeueAnfrageDrawer />
      </div>

      <MaklerLeadsTable leads={leads} />
    </div>
  )
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Keine neuen Fehler in den beiden Files. Falls `variant="ghost"` ein TS-Fehler ist → auf den im Button-Typ erlaubten Sekundär-Variant umstellen (z.B. `secondary`).

- [ ] **Step 4: Voller Build** (Route-Change → AGENTS.md verlangt vollen Build)

Run: `npm run build`
Expected: Build grün. (Bei node_modules-Junction-Worktree kann Turbopack flackern — dann im Haupt-Checkout bzw. via CI verifizieren.)

- [ ] **Step 5: Manuelle Erreichbarkeit (Smoke, dokumentieren)**

Prüfen (lokal `npm run dev`, als aktiver Makler eingeloggt unter `/makler/leads`):
- „+ Neue Anfrage"-Button sichtbar oben rechts neben dem Header.
- Drawer öffnet; Pflichtfelder Vorname/Nachname/Telefon; Standort aufklappbar; Ausgang „Rückruf" vorausgewählt.
- „Rückruf buchen" + Submit → Toast „Rückruf gebucht"; neuer Lead erscheint in der Liste.
- „Link an Kunden senden" + Submit → Toast „Link an den Kunden gesendet"; Lead erscheint mit Status „Link verschickt".

- [ ] **Step 6: Commit**

```bash
git add "src/app/makler/(shell)/leads/NeueAnfrageDrawer.tsx" "src/app/makler/(shell)/leads/page.tsx"
git commit -m "$(cat <<'MSG'
feat(makler-anfrage): Drawer 'Neue Anfrage' auf /makler/leads

Makler-seitiger Einstiegspunkt: Button + Drawer (Kontakt + optional Standort +
Ausgang-Wahl Rueckruf[Default]/Link). Ruft erstelleMaklerAnfrage, Toast, Lead
erscheint sofort in der Liste (promotion_code_id-Filter, kein neues Plumbing).

Audit:
- Build: tsc + npm run build gruen
- UI: '+ Neue Anfrage' im PageHeader von /makler/leads (Rolle makler)
- Redundanz: primitives/Modal + shared/forms/TextField + primitives/Button (kein handgerolltes Atom)
- Dead-Code: nichts
- Spec: Default-Ausgang Rueckruf; hardcoded Deutsch m. Umlauten (Makler-Portal-Konvention)
- Inkonsistenz: Token-Klassen (claimondo-*/rounded-ios-*), kein raw Hex/Status-Scale
- Regression: Leads-Liste unveraendert (nur Header-Zeile + Drawer ergaenzt)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
)"
```

---

## Self-Review

**Spec-Coverage:**
- Abrechnungs-Garantie (`promotion_code_id`) → Task 2 Step 3 + Test „Attribution"/„Fremd-Attribution" ✓
- Entweder/oder + Default Rückruf → Task 2 (Verzweigung) + Task 3 (`useState('rueckruf')`) ✓
- Pflicht Vorname/Nachname/Telefon, Email+Standort optional → Task 2 Validierung + Task 3 Felder ✓
- Lifecycle verbatim (neu/erstkontakt → Core; rueckruf/rueckruf) → Task 2 Step 3 + Global Constraints ✓
- Kunde lead-gekeyt in `/flow/[token]`, keine Kollision → Sender verschickt `/flow/${token}`; kein `/start`-Aufruf im Code ✓
- Reuse-only, kein DB-Change → Tasks konsumieren bestehende Funktionen; einzige Modifikation = additive `public-rueckruf`-Erweiterung ✓
- UI-Erreichbarkeit → Task 3 Button im PageHeader ✓

**Placeholder-Scan:** Keine TODO/TBD; alle Steps mit vollständigem Code + exakten Befehlen.

**Typ-Konsistenz:** `MaklerAnfrageAusgang`/`MaklerAnfrageInput`/`MaklerAnfrageResult` in Task 2 definiert, in Task 3 via `import` konsumiert. `sendFlowLinkMultiChannelCore(db, leadId, kanal, actorId)` + `{success,error?,token?}` konsistent zwischen Action (Step 3) und Test (Step 1). `RueckrufInput`-Erweiterung (Task 1) ↔ Aufruf in Task 2 (`promotionCodeId`/`standortPlz`/`standortOrt`) konsistent.

**Abweichung von der Spec:** i18n-Keys entfallen — das Makler-Portal nutzt hardcoded Deutsch (verifiziert an `leads/page.tsx`); Drawer folgt dieser Konvention mit echten Umlauten.
