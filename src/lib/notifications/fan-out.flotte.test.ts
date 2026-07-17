import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeRecipients } from './fan-out'
import type { NotificationEvent } from './types'

// P1.1 (Operativ-Audit 17.07.): Flottenmanager war strukturell taub — kein Fan-Out-Pfad.
// Diese Tests beweisen die neue Aufloesungs-Kette claims.vehicle_id -> flotten_fahrzeuge
// -> firmen_flotten_konten (NUR status='aktiv') -> Recipient { role: 'flottenmanager' }.

type TableResults = Record<string, unknown>
let currentResults: TableResults = {}
let callLog: { table: string; method: string; args: unknown[] }[] = []

// Chainabler Thenable-Builder: eq/in/select/is geben den Builder zurueck (mit Call-Log),
// await auf dem Builder liefert { data: <Tabellen-Result als Liste> }, maybeSingle() die
// Objekt-Form. Filter-Wirkung stellt der Test ueber die konfigurierten Results dar; dass
// die Filter AUFGERUFEN werden (z. B. status='aktiv'), beweist das Call-Log.
function makeBuilder(table: string) {
  const data = currentResults[table] ?? null
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'limit']) {
    builder[m] = (...args: unknown[]) => {
      callLog.push({ table, method: m, args })
      return builder
    }
  }
  builder.maybeSingle = async () => ({ data: Array.isArray(data) ? (data[0] ?? null) : data })
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data }).then(resolve)
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

function fallCreatedEvent(): NotificationEvent {
  return {
    id: 'evt-flotte-1',
    event_type: 'fall.created',
    payload: {},
    fall_id: null,
    claim_id: 'claim-1',
    triggered_by_user_id: null,
    created_at: '2026-07-17T10:00:00Z',
    processed_at: null,
    status: 'pending',
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
  } as NotificationEvent
}

beforeEach(() => {
  callLog = []
  currentResults = {
    // Basis: Claim ohne Kunde/SV/KB, keine Makler-Consents, keine Admins ->
    // uebrig bleibt exakt die Flotten-Aufloesung.
    claims: { geschaedigter_user_id: null, sv_id: null, kundenbetreuer_id: null, vehicle_id: 'veh-1' },
    makler_fall_consent: [],
    profiles: [],
    flotten_fahrzeuge: [{ firma_id: 'firma-1' }],
    firmen_flotten_konten: [{ user_id: 'fm-1' }],
  }
})

describe('computeRecipients — Flottenmanager-Aufloesung (P1.1)', () => {
  it('Claim-Fahrzeug in Flotte + aktives Konto -> Flottenmanager bekommt in_app', async () => {
    const recipients = await computeRecipients(fallCreatedEvent())
    expect(recipients).toEqual([{ userId: 'fm-1', role: 'flottenmanager', channels: ['in_app'] }])
    // Der aktiv-Filter MUSS gesetzt werden (pausierte/deaktivierte Konten nie benachrichtigen).
    expect(callLog).toContainEqual({ table: 'firmen_flotten_konten', method: 'eq', args: ['status', 'aktiv'] })
  })

  it('zwei aktive Konten derselben Firma -> beide Manager, dedupliziert', async () => {
    currentResults.firmen_flotten_konten = [{ user_id: 'fm-1' }, { user_id: 'fm-2' }, { user_id: 'fm-1' }]
    const recipients = await computeRecipients(fallCreatedEvent())
    expect(recipients.map((r) => r.userId).sort()).toEqual(['fm-1', 'fm-2'])
    expect(recipients.every((r) => r.role === 'flottenmanager')).toBe(true)
  })

  it('Claim ohne vehicle_id -> keine Flotten-Query, keine Flottenmanager-Recipients', async () => {
    currentResults.claims = { geschaedigter_user_id: null, sv_id: null, kundenbetreuer_id: null, vehicle_id: null }
    const recipients = await computeRecipients(fallCreatedEvent())
    expect(recipients).toEqual([])
    expect(callLog.some((c) => c.table === 'flotten_fahrzeuge')).toBe(false)
  })

  it('Fahrzeug ohne Flotten-Bind -> keine Konten-Query, keine Recipients', async () => {
    currentResults.flotten_fahrzeuge = []
    const recipients = await computeRecipients(fallCreatedEvent())
    expect(recipients).toEqual([])
    expect(callLog.some((c) => c.table === 'firmen_flotten_konten')).toBe(false)
  })

  it('Flottenmanager wird ZUSAETZLICH zu anderen Beteiligten aufgeloest (Kunde bleibt)', async () => {
    currentResults.claims = { geschaedigter_user_id: 'kunde-1', sv_id: null, kundenbetreuer_id: null, vehicle_id: 'veh-1' }
    const recipients = await computeRecipients(fallCreatedEvent())
    const byUser = Object.fromEntries(recipients.map((r) => [r.userId, r]))
    expect(byUser['kunde-1']?.role).toBe('kunde')
    expect(byUser['fm-1']?.role).toBe('flottenmanager')
    expect(byUser['fm-1']?.channels).toEqual(['in_app'])
  })
})
