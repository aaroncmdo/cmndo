import { describe, expect, it, vi } from 'vitest'
import { erzeugeLegacy } from '../legacy'
import {
  BudgetErschoepft,
  erzeugeZaehler,
  schaetzeKosten,
  GRATIS_JE_MONAT,
  mitBudget,
} from '../budget'
import type { PlacesAdapter } from '../adapter'

/** Eine Antwort, die der Adapter als gueltig durchgehen laesst. */
const ok = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response

const LEER = { status: 'ZERO_RESULTS', results: [] }

describe('erzeugeZaehler', () => {
  it('laesst genau so viele Abrufe durch wie das Budget gross ist', () => {
    const z = erzeugeZaehler(3)
    z.melde()
    z.melde()
    z.melde()
    expect(z.verbraucht()).toBe(3)
    expect(() => z.melde()).toThrow(BudgetErschoepft)
  })

  it('wirft BEIM Abruf, der das Budget sprengt — nicht erst danach', () => {
    // ⚠ Zaehlt man erst nach dem Abruf, ist der teuerste schon bezahlt.
    const z = erzeugeZaehler(1)
    z.melde()
    expect(() => z.melde()).toThrow(BudgetErschoepft)
    expect(z.uebrig()).toBe(0)
  })
})

describe('Der Zaehler im Adapter', () => {
  it('zaehlt JEDEN Wiederholversuch, nicht nur den erfolgreichen Abruf', async () => {
    // ⭐ DAS ist der Fehler, der am 21.08. 2.798 EUR kostete: 80 % der Abrufe
    // scheiterten und wurden dreimal gefeuert. Google berechnet den Abruf,
    // sobald er ankommt — die Antwort muss uns nie erreichen.
    const zaehler = erzeugeZaehler(100)
    let versuche = 0
    const fetchImpl = vi.fn(async () => {
      versuche++
      if (versuche < 3) throw new Error('fetch failed')
      return ok(LEER)
    }) as unknown as typeof fetch

    const a = erzeugeLegacy('k', { fetchImpl, warte: async () => {}, zaehler })
    await a.websiteVon('p1')

    expect(versuche).toBe(3)
    // Drei Versuche = drei bezahlte Abrufe, obwohl nur einer Daten brachte.
    expect(zaehler.verbraucht()).toBe(3)
  })

  it('bricht ab, sobald das Budget mitten in einem Lauf erschoepft ist', async () => {
    const zaehler = erzeugeZaehler(2)
    const fetchImpl = vi.fn(async () => ok(LEER)) as unknown as typeof fetch
    const a = erzeugeLegacy('k', { fetchImpl, warte: async () => {}, zaehler })

    await a.websiteVon('p1')
    await a.websiteVon('p2')
    await expect(a.websiteVon('p3')).rejects.toThrow(BudgetErschoepft)
    // Der dritte Abruf wurde NICHT gefeuert.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('Notbremse bei Fehlersturm', () => {
  it('hoert auf zu feuern, wenn dauerhaft mehr als die Haelfte scheitert', async () => {
    // ⭐ Eine hohe Fehlerquote ist kein Grund, es oefter zu versuchen — sie ist
    // ein Grund aufzuhoeren. Die alte Logik tat das Gegenteil und kaufte
    // Rechnungsposten.
    const zaehler = erzeugeZaehler(10_000)
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed')
    }) as unknown as typeof fetch

    const a = erzeugeLegacy('k', { fetchImpl, warte: async () => {}, zaehler })

    let sturmGemeldet = false
    for (let i = 0; i < 40; i++) {
      try {
        await a.websiteVon(`p${i}`)
      } catch (err) {
        if (err instanceof Error && err.message.includes('FEHLERSTURM')) {
          sturmGemeldet = true
          break
        }
      }
    }

    expect(sturmGemeldet).toBe(true)
    // Ohne Bremse waeren es 40 × 3 = 120 Abrufe geworden.
    expect(zaehler.verbraucht()).toBeLessThan(60)
  })
})

describe('schaetzeKosten', () => {
  it('rechnet das Gratis-Kontingent gegen, bevor es etwas berechnet', () => {
    const k = schaetzeKosten(1_000, 'nearby')
    expect(k.gratis).toBe(1_000)
    expect(k.berechnet).toBe(0)
    expect(k.euro).toBe(0)
  })

  it('nennt fuer den Lauf vom 21.08. eine Zahl in der Groessenordnung der Rechnung', () => {
    // 87.000 Abrufe minus 5.000 gratis, zu 32 USD/1.000 → ~2.624 USD ≈ 2.414 EUR.
    // Die echte Rechnung lag bei 2.798 EUR — dieselbe Groessenordnung. Genau
    // diese Zahl haette VOR dem Lauf auf dem Schirm stehen muessen.
    const k = schaetzeKosten(87_000, 'nearby')
    expect(k.berechnet).toBe(87_000 - GRATIS_JE_MONAT)
    expect(k.euro).toBeGreaterThan(2_000)
    expect(k.euro).toBeLessThan(3_000)
  })
})

describe('mitBudget', () => {
  it('zaehlt auch bei einem Adapter, der den Zaehler selbst nicht kennt', async () => {
    // Die zweite Schranke: ein kuenftiger Adapter, der `opts.zaehler` ignoriert,
    // darf trotzdem nicht unbegrenzt feuern.
    const zaehler = erzeugeZaehler(2)
    const blind: PlacesAdapter = {
      suchText: async () => [],
      suchUmkreis: async () => [],
      details: async () => null,
      profil: async () => null,
      websiteVon: async () => null,
    }
    const a = mitBudget(blind, zaehler)

    await a.websiteVon('p1')
    await a.details('p2')
    await expect(a.profil('p3')).rejects.toThrow(BudgetErschoepft)
  })
})
