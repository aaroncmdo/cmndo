import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// server-only wirft in einer plain-node/vitest-Umgebung (kein react-server-Condition) ->
// als no-op mocken, damit der Guard (und die dedup-Kette) importierbar bleibt.
vi.mock('server-only', () => ({}))
// Die DB-Zaehl-Funktion mocken — kein Supabase im Unit-Test. Ersetzt zugleich die gesamte
// recent-lead-dedup-Kette (server-only + createAdminClient), die sonst mitgeladen wuerde.
vi.mock('./recent-lead-dedup', () => ({
  countRecentMcpLeadsByPhone: vi.fn(),
}))

describe('write-abuse-guard', () => {
  beforeEach(() => {
    vi.resetModules() // frischer Modul-State pro Test (writeHits, lastTrippedLogTs)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('globaler Circuit-Breaker: loest beim Cap aus und faellt nach dem 1h-Fenster zurueck', async () => {
    vi.stubEnv('MCP_WRITE_CAP_PER_HOUR', '3')
    const g = await import('./write-abuse-guard')
    expect(g.globalWriteCapExceeded()).toBe(false)
    g.recordGlobalWrite()
    g.recordGlobalWrite()
    g.recordGlobalWrite()
    expect(g.globalWriteCapExceeded()).toBe(true) // 3 >= Cap 3
    vi.advanceTimersByTime(60 * 60_000 + 1) // > 1 h -> Rolling-Window rollt ab
    expect(g.globalWriteCapExceeded()).toBe(false)
  })

  it('globaler Circuit-Breaker: Default-Cap 120 wenn ENV fehlt/ungueltig', async () => {
    vi.stubEnv('MCP_WRITE_CAP_PER_HOUR', 'nonsense') // ungueltig -> Fallback 120
    const g = await import('./write-abuse-guard')
    for (let i = 0; i < 119; i++) g.recordGlobalWrite()
    expect(g.globalWriteCapExceeded()).toBe(false) // 119 < 120
    g.recordGlobalWrite()
    expect(g.globalWriteCapExceeded()).toBe(true) // 120 >= 120
  })

  it('recordGlobalWrite zaehlt erst nach bestandenem Gate — abgelehnte Requests blaehen das Cap nicht auf', async () => {
    vi.stubEnv('MCP_WRITE_CAP_PER_HOUR', '2')
    const g = await import('./write-abuse-guard')
    g.recordGlobalWrite()
    g.recordGlobalWrite()
    expect(g.globalWriteCapExceeded()).toBe(true)
    // Guard-Aufruf zaehlt NICHT (nur recordGlobalWrite zaehlt) -> mehrfaches Pruefen bleibt bei 2.
    expect(g.globalWriteCapExceeded()).toBe(true)
    expect(g.globalWriteCapExceeded()).toBe(true)
  })

  it('Per-Telefon-Velocity: blockt beim 24h-Cap, laesst darunter durch', async () => {
    vi.stubEnv('MCP_WRITE_CAP_PER_PHONE_24H', '3')
    const dedup = await import('./recent-lead-dedup')
    const g = await import('./write-abuse-guard')
    const mockCount = dedup.countRecentMcpLeadsByPhone as unknown as ReturnType<typeof vi.fn>

    mockCount.mockResolvedValueOnce(2)
    expect(await g.phoneWriteCapExceeded('+49 170 1234567')).toBe(false) // 2 < 3
    mockCount.mockResolvedValueOnce(3)
    expect(await g.phoneWriteCapExceeded('+49 170 1234567')).toBe(true) // 3 >= 3

    // Die 24h-Fensterbreite wird an die DB-Zaehlung durchgereicht.
    expect(mockCount).toHaveBeenLastCalledWith('+49 170 1234567', 24)
  })

  it('Per-Telefon-Velocity: best-effort 0 (DB-Fehler in der Zaehlung) blockt nie', async () => {
    vi.stubEnv('MCP_WRITE_CAP_PER_PHONE_24H', '3')
    const dedup = await import('./recent-lead-dedup')
    const g = await import('./write-abuse-guard')
    const mockCount = dedup.countRecentMcpLeadsByPhone as unknown as ReturnType<typeof vi.fn>
    mockCount.mockResolvedValueOnce(0) // countRecentMcpLeadsByPhone liefert bei Fehler 0
    expect(await g.phoneWriteCapExceeded('+49 170 1234567')).toBe(false)
  })
})
