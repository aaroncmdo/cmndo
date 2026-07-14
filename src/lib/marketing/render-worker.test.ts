import { describe, it, expect, vi } from 'vitest'
import { verarbeiteRenderQueue, type RenderWorkerDeps } from './render-worker'

// Dummy-Supabase: alle DB-Ops laufen ueber gemockte deps, der Client wird nie benutzt.
const db = {} as never

function makeDeps(over: Partial<RenderWorkerDeps> = {}): RenderWorkerDeps {
  return {
    reapStale: vi.fn().mockResolvedValue(0),
    claimNext: vi.fn().mockResolvedValue({ status: 'idle' }),
    rendereJob: vi.fn().mockResolvedValue({ ok: true }),
    readAvailableRamMb: vi.fn().mockResolvedValue(800),
    ...over,
  }
}

describe('verarbeiteRenderQueue', () => {
  it('ueberspringt den Lauf bei zu wenig RAM (kein Claim, kein Render)', async () => {
    const deps = makeDeps({ readAvailableRamMb: vi.fn().mockResolvedValue(200) })
    const r = await verarbeiteRenderQueue(db, deps, { minMb: 650 })
    expect(r.outcome).toBe('skipped_ram')
    expect(r.availableMb).toBe(200)
    expect(deps.claimNext).not.toHaveBeenCalled()
    expect(deps.rendereJob).not.toHaveBeenCalled()
  })

  it('rendert bei RAM=null (nicht-Linux) weiter — Gate inaktiv', async () => {
    const deps = makeDeps({
      readAvailableRamMb: vi.fn().mockResolvedValue(null),
      claimNext: vi.fn().mockResolvedValue({ status: 'claimed', jobId: 'j1' }),
    })
    const r = await verarbeiteRenderQueue(db, deps, { minMb: 650 })
    expect(r.outcome).toBe('rendered')
    expect(deps.rendereJob).toHaveBeenCalledWith('j1', db)
  })

  it('idle wenn die Queue leer ist', async () => {
    const deps = makeDeps()
    const r = await verarbeiteRenderQueue(db, deps, { minMb: 650 })
    expect(r.outcome).toBe('idle')
    expect(deps.rendereJob).not.toHaveBeenCalled()
  })

  it('rendert den beanspruchten Job und reicht das Ergebnis durch', async () => {
    const deps = makeDeps({
      claimNext: vi.fn().mockResolvedValue({ status: 'claimed', jobId: 'j2' }),
      rendereJob: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }),
    })
    const r = await verarbeiteRenderQueue(db, deps, { minMb: 650 })
    expect(r.outcome).toBe('rendered')
    expect(r.jobId).toBe('j2')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })

  it('raced (anderer Lauf war zuerst) -> kein Render', async () => {
    const deps = makeDeps({ claimNext: vi.fn().mockResolvedValue({ status: 'raced', jobId: 'j3' }) })
    const r = await verarbeiteRenderQueue(db, deps, { minMb: 650 })
    expect(r.outcome).toBe('raced')
    expect(deps.rendereJob).not.toHaveBeenCalled()
  })

  it('reicht die Reap-Zahl durch', async () => {
    const deps = makeDeps({ reapStale: vi.fn().mockResolvedValue(2) })
    const r = await verarbeiteRenderQueue(db, deps, { minMb: 650 })
    expect(r.reaped).toBe(2)
  })
})
