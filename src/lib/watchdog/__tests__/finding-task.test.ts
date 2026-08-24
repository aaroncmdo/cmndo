import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baueBeschreibung, meldeFindingsAlsTask, MAX_ZEILEN_IM_TASK } from '../finding-task'

const createLinkedTaskMock = vi.fn().mockResolvedValue({ task_id: 'task-1' })
vi.mock('@/lib/tasks/create-task', () => ({
  createLinkedTask: (...args: unknown[]) => createLinkedTaskMock(...args),
}))

/**
 * Baut einen Supabase-Doppel, dessen Kette `.from().select().eq().neq().limit().maybeSingle()`
 * das uebergebene Ergebnis liefert. Bewusst minimal: getestet wird die Entscheidung
 * „Task ja/nein", nicht PostgREST.
 */
function dbMit(ergebnis: { data: unknown; error?: { message: string } | null }) {
  const kette = {
    select: () => kette,
    eq: () => kette,
    neq: () => kette,
    limit: () => kette,
    maybeSingle: async () => ({ data: ergebnis.data, error: ergebnis.error ?? null }),
  }
  return { from: vi.fn(() => kette) } as never
}

const BASIS = { taskCode: 'test-code', titel: 'Titel', einleitung: 'Einleitung.' }

beforeEach(() => {
  createLinkedTaskMock.mockClear()
})

describe('baueBeschreibung', () => {
  it('listet jede Zeile mit Aufzaehlungszeichen', () => {
    const text = baueBeschreibung({ einleitung: 'Kopf.', zeilen: ['A', 'B'] })
    expect(text).toBe('Kopf.\n\n• A\n• B')
  })

  it('kuerzt ab MAX_ZEILEN und nennt die Zahl der ausgelassenen', () => {
    const zeilen = Array.from({ length: MAX_ZEILEN_IM_TASK + 3 }, (_, i) => `Fund ${i}`)
    const text = baueBeschreibung({ einleitung: 'Kopf.', zeilen })
    expect(text).toContain(`Fund ${MAX_ZEILEN_IM_TASK - 1}`)
    expect(text).not.toContain(`Fund ${MAX_ZEILEN_IM_TASK}`)
    expect(text).toContain('… und 3 weitere')
  })

  it('haengt keinen Rest-Hinweis an, wenn alles passt', () => {
    expect(baueBeschreibung({ einleitung: 'K.', zeilen: ['A'] })).not.toContain('weitere')
  })
})

describe('meldeFindingsAlsTask', () => {
  it('legt KEINEN Task an, wenn es keine Findings gibt', async () => {
    const r = await meldeFindingsAlsTask(dbMit({ data: null }), { ...BASIS, zeilen: [] })
    expect(r).toEqual({ angelegt: false, grund: 'keine-findings' })
    expect(createLinkedTaskMock).not.toHaveBeenCalled()
  })

  it('legt KEINEN zweiten Task an, wenn schon einer offen ist (Dublettenschutz)', async () => {
    const r = await meldeFindingsAlsTask(dbMit({ data: { id: 'vorhanden' } }), { ...BASIS, zeilen: ['A'] })
    expect(r).toEqual({ angelegt: false, grund: 'schon-offen' })
    expect(createLinkedTaskMock).not.toHaveBeenCalled()
  })

  it('legt einen Task an, wenn Findings da sind und keiner offen ist', async () => {
    const r = await meldeFindingsAlsTask(dbMit({ data: null }), { ...BASIS, zeilen: ['A', 'B'] })
    expect(r).toEqual({ angelegt: true })
    expect(createLinkedTaskMock).toHaveBeenCalledTimes(1)
    const arg = createLinkedTaskMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.task_code).toBe('test-code')
    expect(arg.empfaenger_rolle).toBe('admin')
    expect(arg.auto_erstellt).toBe(true)
    expect(String(arg.beschreibung)).toContain('• A')
  })

  it('nutzt die uebergebene Prioritaet, sonst dringend', async () => {
    // ⚠ `TaskPrioritaet` kennt nur normal | dringend | kritisch — kein „hoch".
    // Genau das hatte ich zuerst geraten; tsc hat es gefangen, dieser Test haelt es fest.
    await meldeFindingsAlsTask(dbMit({ data: null }), { ...BASIS, zeilen: ['A'] })
    expect((createLinkedTaskMock.mock.calls[0][0] as Record<string, unknown>).prioritaet).toBe('dringend')

    createLinkedTaskMock.mockClear()
    await meldeFindingsAlsTask(dbMit({ data: null }), { ...BASIS, zeilen: ['A'], prioritaet: 'kritisch' })
    expect((createLinkedTaskMock.mock.calls[0][0] as Record<string, unknown>).prioritaet).toBe('kritisch')
  })

  it('wirft NICHT, wenn die Dedup-Abfrage fehlschlaegt', async () => {
    const db = dbMit({ data: null, error: { message: 'kaputt' } })
    const r = await meldeFindingsAlsTask(db, { ...BASIS, zeilen: ['A'] })
    expect(r).toEqual({ angelegt: false, grund: 'fehler' })
    expect(createLinkedTaskMock).not.toHaveBeenCalled()
  })

  it('wirft NICHT, wenn die Task-Anlage selbst fehlschlaegt', async () => {
    createLinkedTaskMock.mockRejectedValueOnce(new Error('insert kaputt'))
    const r = await meldeFindingsAlsTask(dbMit({ data: null }), { ...BASIS, zeilen: ['A'] })
    // Ein Waechter, der an seiner eigenen Meldung stirbt, verliert auch den Befund.
    expect(r).toEqual({ angelegt: false, grund: 'fehler' })
  })
})
