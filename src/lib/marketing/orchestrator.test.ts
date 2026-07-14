import { describe, it, expect, vi, afterEach } from 'vitest'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verarbeiteJob, generiereJobSkript, rendereJob, type OrchestratorDeps } from './orchestrator'
import type { ContentScript } from './schema'

afterEach(() => {
  delete process.env.MARKETING_MAX_CLIPS_PER_WEEK
  delete process.env.MARKETING_STUDIO_ENABLED
})

function mockSupabase(opts: { count?: number; job?: unknown } = {}) {
  const updates: Record<string, unknown>[] = []
  const uploads: string[] = []
  const client = {
    from: vi.fn(() => ({
      select: vi.fn((_cols: string, o?: { head?: boolean }) => {
        if (o?.head)
          return { neq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ count: opts.count ?? 0 }) })) }
        return {
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: opts.job ?? null,
              error: opts.job ? null : { message: 'not found' },
            }),
          })),
        }
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        updates.push(patch)
        return { eq: vi.fn().mockResolvedValue({ error: null }) }
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (k: string) => {
          uploads.push(k)
          return { error: null }
        }),
        getPublicUrl: vi.fn((k: string) => ({ data: { publicUrl: `https://cdn/${k}` } })),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
  }
  return { client: client as never, updates, uploads }
}

const script: ContentScript = {
  hook: 'H',
  segmente: [{ text: 'Ein Satz hier', visual: { typ: 'grafik' } }],
  caption: 'Caption',
  hashtags: ['x'],
}

function happyDeps(audioPath: string): OrchestratorDeps {
  return {
    generiereSkript: vi.fn().mockResolvedValue(script),
    synthesize: vi.fn().mockResolvedValue({
      audioPath,
      words: [
        { word: 'Ein', start: 0, end: 1 },
        { word: 'Satz', start: 1, end: 2 },
        { word: 'hier', start: 2, end: 3 },
      ],
      engine: 'piper',
    }),
    resolveVisualsFor: vi.fn().mockResolvedValue([{ kind: 'graphic' }]),
    renderClip: vi.fn().mockResolvedValue(Buffer.from('video')),
  }
}

describe('verarbeiteJob', () => {
  it('blockt bei erreichtem Wochen-Cap', async () => {
    process.env.MARKETING_MAX_CLIPS_PER_WEEK = '5'
    const { client } = mockSupabase({ count: 5 })
    expect((await verarbeiteJob('job1', client)).ok).toBe(false)
  })

  it('meldet Fehler wenn Job nicht existiert', async () => {
    const { client } = mockSupabase({ count: 0, job: null })
    expect(await verarbeiteJob('nope', client)).toEqual({ ok: false, error: 'Job nicht gefunden' })
  })

  it('happy path: Status-Transitions + Storage-Uploads + ok', async () => {
    const audioPath = join(tmpdir(), `mkot-${Date.now()}.wav`)
    await writeFile(audioPath, Buffer.from('audio'))
    try {
      const { client, updates, uploads } = mockSupabase({
        count: 0,
        job: { id: 'j1', thema: 'T', format: 'ratgeber', skript: script },
      })
      const r = await verarbeiteJob('j1', client, happyDeps(audioPath))
      expect(r).toEqual({ ok: true })
      expect(updates.map((u) => u.status).filter(Boolean)).toEqual([
        'skript_generiert',
        'audio_erzeugt',
        'video_fertig',
      ])
      expect(uploads.some((k) => k.includes('audio'))).toBe(true)
      expect(uploads.some((k) => k.includes('video.mp4'))).toBe(true)
    } finally {
      await unlink(audioPath).catch(() => {})
    }
  })

  it('setzt status=fehler wenn eine Stufe wirft', async () => {
    const { client, updates } = mockSupabase({ count: 0, job: { id: 'j1', thema: 'T', format: 'ratgeber', skript: script } })
    const deps = happyDeps('/nonexistent')
    ;(deps.synthesize as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('TTS kaputt'))
    const r = await verarbeiteJob('j1', client, deps)
    expect(r.ok).toBe(false)
    expect(updates.some((u) => u.status === 'fehler' && String(u.fehler_text).includes('TTS'))).toBe(true)
  })
})

describe('Phasen-Split (Script-Review-Gate)', () => {
  it('generiereJobSkript stoppt bei skript_generiert (kein Render/Upload)', async () => {
    const { client, updates, uploads } = mockSupabase({
      count: 0,
      job: { id: 'j1', thema: 'T', format: 'ratgeber' },
    })
    const r = await generiereJobSkript('j1', client, happyDeps('/x'))
    expect(r).toEqual({ ok: true })
    expect(updates.map((u) => u.status).filter(Boolean)).toEqual(['skript_generiert'])
    expect(uploads).toHaveLength(0)
  })

  it('rendereJob rendert aus gespeichertem Skript -> video_fertig', async () => {
    const audioPath = join(tmpdir(), `mkot-r-${Date.now()}.wav`)
    await writeFile(audioPath, Buffer.from('audio'))
    try {
      const { client, updates, uploads } = mockSupabase({ job: { id: 'j1', skript: script } })
      const r = await rendereJob('j1', client, happyDeps(audioPath))
      expect(r).toEqual({ ok: true })
      expect(updates.map((u) => u.status).filter(Boolean)).toEqual(['audio_erzeugt', 'video_fertig'])
      expect(uploads.some((k) => k.includes('video.mp4'))).toBe(true)
    } finally {
      await unlink(audioPath).catch(() => {})
    }
  })

  it('rendereJob meldet Fehler ohne gueltiges Skript', async () => {
    const { client } = mockSupabase({ job: { id: 'j1', skript: null } })
    expect((await rendereJob('j1', client, happyDeps('/x'))).ok).toBe(false)
  })
})
