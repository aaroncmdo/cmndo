// AAR Werkstatt-Vermittlung: Tests der Dispatcher-Action. Der Write/Notify-Kern
// (vermittlung-server) ist gemockt — hier wird NUR die Action-Verantwortung
// geprueft: Rollen-Guard, Delegation mit quelle='dispatcher', Fehler-Durchreichung,
// surface-spezifisches revalidatePath. Patch-/Gate-Logik: siehe
// src/lib/werkstatt/__tests__/vermittlung-core.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { assignMock, findMock } = vi.hoisted(() => ({
  assignMock: vi.fn(),
  findMock: vi.fn(async () => []),
}))

vi.mock('@/lib/werkstatt/vermittlung-server', () => ({
  assignReparaturWerkstatt: assignMock,
  findReparaturWerkstaettenForTarget: findMock,
}))

let guardOk = true
let guardRolle = 'dispatch'
vi.mock('@/lib/auth/guards', () => ({
  requireRole: vi.fn(async () =>
    guardOk
      ? { success: true, user: { id: 'dispatcher-user-9', rolle: guardRolle } }
      : { success: false, error: 'Rolle "kunde" nicht berechtigt', user: null },
  ),
}))

const revalidateMock = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidateMock(p) }))

beforeEach(() => {
  assignMock.mockReset()
  assignMock.mockResolvedValue({ ok: true })
  revalidateMock.mockClear()
  guardOk = true
  guardRolle = 'dispatch'
})

describe('vermittleWerkstatt', () => {
  it('delegiert an assignReparaturWerkstatt mit quelle=dispatcher (target=lead) + revalidiert', async () => {
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'lead', id: 'lead-1', werkstattId: 'w-1' })
    expect(r.ok).toBe(true)
    expect(assignMock).toHaveBeenCalledWith({
      target: 'lead',
      id: 'lead-1',
      werkstattId: 'w-1',
      quelle: 'dispatcher',
      actorUserId: 'dispatcher-user-9',
    })
    expect(revalidateMock).toHaveBeenCalledWith('/dispatch/leads/lead-1')
  })

  it('revalidiert die Fallakte bei target=claim', async () => {
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'claim', id: 'claim-1', werkstattId: 'w-2' })
    expect(r.ok).toBe(true)
    expect(assignMock).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'claim', id: 'claim-1', quelle: 'dispatcher' }),
    )
    expect(revalidateMock).toHaveBeenCalledWith('/faelle/claim-1')
  })

  it('reicht ok:false vom Kern durch und revalidiert nicht', async () => {
    assignMock.mockResolvedValueOnce({ ok: false, error: 'boom' })
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'lead', id: 'lead-1', werkstattId: 'w-1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('boom')
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('liefert ok:false wenn der Guard die Rolle ablehnt — keine Delegation', async () => {
    guardOk = false
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'lead', id: 'lead-1', werkstattId: 'w-1' })
    expect(r.ok).toBe(false)
    expect(assignMock).not.toHaveBeenCalled()
  })

  it('attribuiert quelle=kb wenn ein Kundenbetreuer vermittelt', async () => {
    guardRolle = 'kundenbetreuer'
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'claim', id: 'claim-9', werkstattId: 'w-9' })
    expect(r.ok).toBe(true)
    expect(assignMock).toHaveBeenCalledWith(expect.objectContaining({ quelle: 'kb', actorUserId: 'dispatcher-user-9' }))
  })
})
