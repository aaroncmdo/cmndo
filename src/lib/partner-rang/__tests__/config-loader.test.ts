import { describe, it, expect } from 'vitest'
import { ladeRangConfig } from '../config-loader'
import { DEFAULT_RANG_CONFIG } from '../config'

describe('ladeRangConfig', () => {
  it('mappt DB-Zeilen auf RangConfig, DB gewinnt', async () => {
    const rows = [{ schluessel: 'schwelle_gold', wert: 70 }, { schluessel: 'volumen_faktor', wert: 5 }]
    const supabase = { from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }) } as unknown as Parameters<typeof ladeRangConfig>[0]
    const cfg = await ladeRangConfig(supabase)
    expect(cfg.schwelleGold).toBe(70)
    expect(cfg.volumenFaktor).toBe(5)
    expect(cfg.schwelleSilber).toBe(DEFAULT_RANG_CONFIG.schwelleSilber) // fehlender Key -> Default
  })
  it('leere DB -> alle Defaults', async () => {
    const supabase = { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) } as unknown as Parameters<typeof ladeRangConfig>[0]
    expect(await ladeRangConfig(supabase)).toEqual(DEFAULT_RANG_CONFIG)
  })
})
