import { describe, it, expect, vi } from 'vitest'
import { parseMemAvailableMb, waitForRam } from './ram-gate'

const nosleep = () => Promise.resolve()

describe('parseMemAvailableMb', () => {
  it('parst MemAvailable (kB) nach MB', () => {
    const txt = 'MemTotal:        1876000 kB\nMemFree:           92000 kB\nMemAvailable:     716800 kB\n'
    expect(parseMemAvailableMb(txt)).toBe(700) // 716800 / 1024
  })

  it('gibt null zurueck wenn MemAvailable fehlt', () => {
    expect(parseMemAvailableMb('MemTotal: 1876000 kB\nMemFree: 92000 kB\n')).toBeNull()
  })
})

describe('waitForRam', () => {
  it('kehrt sofort zurueck wenn genug RAM da ist', async () => {
    const read = vi.fn().mockResolvedValue(800)
    await expect(waitForRam({ minMb: 650, read, sleep: nosleep })).resolves.toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('ist inaktiv (kehrt sofort zurueck) wenn RAM nicht ermittelbar ist (nicht-Linux)', async () => {
    const read = vi.fn().mockResolvedValue(null)
    await expect(waitForRam({ minMb: 650, read, sleep: nosleep })).resolves.toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('wartet und faehrt fort, sobald ein RAM-Fenster aufgeht', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(200) // zu wenig
      .mockResolvedValueOnce(300) // immer noch
      .mockResolvedValueOnce(700) // Fenster!
    await expect(
      waitForRam({ minMb: 650, read, sleep: nosleep, pollMs: 1000, maxWaitMs: 60_000 }),
    ).resolves.toBeUndefined()
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('wirft nach maxWaitMs, wenn nie genug RAM frei wird', async () => {
    const read = vi.fn().mockResolvedValue(100)
    await expect(
      waitForRam({ minMb: 650, read, sleep: nosleep, pollMs: 1000, maxWaitMs: 3000 }),
    ).rejects.toThrow(/Zu wenig RAM/)
  })
})
