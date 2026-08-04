import { describe, it, expect, vi } from 'vitest'

vi.mock('../get-rechnungs-konfig', () => ({
  getAktuelleRechnungsKonfig: vi.fn(),
}))
import { getAktuelleRechnungsKonfig } from '../get-rechnungs-konfig'
import { ladeNetzwerkPreise } from '../netzwerk-preise'

const baseKonfig = { id: 'k1', version: 3 } as never

describe('ladeNetzwerkPreise', () => {
  it('liefert Cent-Betraege + Config-Version aus der aktuellen Konfig', async () => {
    ;(getAktuelleRechnungsKonfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...(baseKonfig as object), netzwerk_monat_cent: 2999, netzwerk_setup_cent: 3990,
    })
    const p = await ladeNetzwerkPreise()
    expect(p).toEqual({ monatCent: 2999, setupCent: 3990, konfigId: 'k1', konfigVersion: 3 })
  })

  it('wirft wenn Preis-Werte fehlen (kein stiller 0-Preis)', async () => {
    ;(getAktuelleRechnungsKonfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...(baseKonfig as object), netzwerk_monat_cent: null, netzwerk_setup_cent: null,
    })
    await expect(ladeNetzwerkPreise()).rejects.toThrow(/netzwerk_monat_cent/)
  })

  it('setupCent=0 ist erlaubt (Waiver), monatCent<=0 nicht', async () => {
    ;(getAktuelleRechnungsKonfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...(baseKonfig as object), netzwerk_monat_cent: 2999, netzwerk_setup_cent: 0,
    })
    const p = await ladeNetzwerkPreise()
    expect(p.setupCent).toBe(0)
    ;(getAktuelleRechnungsKonfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...(baseKonfig as object), netzwerk_monat_cent: 0, netzwerk_setup_cent: 3990,
    })
    await expect(ladeNetzwerkPreise()).rejects.toThrow(/netzwerk_monat_cent/)
  })
})
