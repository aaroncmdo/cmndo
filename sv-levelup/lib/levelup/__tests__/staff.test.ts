import { describe, expect, it } from 'vitest'
import { pruefeStaff, type StaffDb } from '../staff'

function db(over: Partial<{
  user: { id: string } | null
  userFehler: boolean
  istStaff: boolean | null
  rpcFehler: boolean
}> = {}): StaffDb {
  return {
    auth: {
      getUser: async () => ({
        data: { user: over.userFehler ? null : (over.user ?? { id: 'u1' }) },
        error: over.userFehler ? { message: 'keine Sitzung' } : null,
      }),
    },
    rpc: async () => ({
      data: over.rpcFehler ? null : (over.istStaff ?? true),
      error: over.rpcFehler ? { message: 'kaputt' } : null,
    }),
  } as unknown as StaffDb
}

describe('pruefeStaff', () => {
  it('laesst einen angemeldeten Staff durch', async () => {
    const r = await pruefeStaff(db({ istStaff: true }))
    expect(r).toEqual({ ok: true, userId: 'u1' })
  })

  it('weist ohne Sitzung ab', async () => {
    const r = await pruefeStaff(db({ userFehler: true }))
    expect(r).toEqual({ ok: false, grund: 'keine_sitzung' })
  })

  it('weist einen angemeldeten Nicht-Staff ab', async () => {
    const r = await pruefeStaff(db({ istStaff: false }))
    expect(r).toEqual({ ok: false, grund: 'kein_staff' })
  })

  it('verweigert, wenn die Staff-Pruefung selbst fehlschlaegt', async () => {
    // ⚠ Der wichtigste Fall. Ein Gate, das bei Stoerung OEFFNET, ist kein Gate:
    // ein Netzfehler oder eine gedrehte Berechtigung wuerde den
    // Gespraechsleitfaden freigeben — genau das Dokument, das der
    // Sachverstaendige nie sehen darf.
    const r = await pruefeStaff(db({ rpcFehler: true }))
    expect(r).toEqual({ ok: false, grund: 'kein_staff' })
  })

  it('behandelt eine leere Antwort der Pruefung als Nein', async () => {
    const leer = { ...db(), rpc: async () => ({ data: null, error: null }) } as unknown as StaffDb
    const r = await pruefeStaff(leer)
    expect(r.ok).toBe(false)
  })

  it('behandelt einen unerwarteten Antworttyp als Nein', async () => {
    // Nicht `true` heisst nicht `true` — auch nicht ein wahrheitswertiger String.
    const komisch = { ...db(), rpc: async () => ({ data: 'ja', error: null }) } as unknown as StaffDb
    const r = await pruefeStaff(komisch)
    expect(r.ok).toBe(false)
  })
})
