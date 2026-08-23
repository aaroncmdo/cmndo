import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Sichert die Lehre vom 21.08.2026 ab: Die gezeichnete Unterschrift muss in der ZEILE landen,
 * nicht nur eingebettet im PDF.
 *
 * Damals waren 5 Vertrags-PDFs aus dem Storage verschwunden. Name, Datum, IP und User-Agent
 * standen weiter in `vertraege_unterzeichnet` — nur das Signaturbild war weg, weil es
 * ausschliesslich im PDF existierte. Das PDF war damit ein Single Point of Failure fuer den
 * einzigen bildlichen Beleg.
 *
 * ⚠ Ein Typecheck faengt eine Ruecknahme NICHT: `createAdminClient()` ist ungetypt, ein
 * fehlendes oder falsch geschriebenes Insert-Feld faellt dort nicht auf. Deshalb dieser Test.
 */

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let insertCapture: Record<string, unknown> | null = null
let updateCapture: Record<string, unknown> | null = null

function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  c.select = () => c
  c.eq = () => c
  c.single = async () => result
  c.maybeSingle = async () => result
  c.order = () => c
  c.limit = () => c
  c.then = (res: (v: unknown) => void) => res(result)
  return c
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabelle: string) => ({
      select: () => chain({ data: { id: 'vorlage-1', version: '1.0', titel: 'Nutzungsbedingungen', inhalt_html: '<p>x</p>' }, error: null }),
      insert: (vals: Record<string, unknown>) => {
        if (tabelle === 'vertraege_unterzeichnet') insertCapture = vals
        return chain({ data: { id: 'vertrag-1' }, error: null })
      },
      update: (vals: Record<string, unknown>) => {
        if (tabelle === 'vertraege_unterzeichnet') updateCapture = vals
        return chain({ error: null })
      },
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
      }),
    },
  }),
}))

vi.mock('../contract-pdf', () => ({
  generateContractPdf: async () => Buffer.from('%PDF-1.7 fake'),
}))

import { signAndStoreContract } from '../sign-and-store'

beforeEach(() => {
  insertCapture = null
  updateCapture = null
})

describe('signAndStoreContract — Signatur landet in der Zeile', () => {
  it('schreibt signature_png_data_uri in vertraege_unterzeichnet', async () => {
    await signAndStoreContract({
      sv_id: 'sv-1',
      vorlage_typ: 'nutzungsbedingungen',
      rolle: 'sachverstaendiger',
      unterschrift_name: 'Max Mustermann',
      unterschrift_ip: '1.2.3.4',
      unterschrift_user_agent: 'vitest',
      signature_png_data_uri: SIG,
    })

    expect(insertCapture).not.toBeNull()
    expect(insertCapture!.signature_png_data_uri).toBe(SIG)
  })

  it('haelt die uebrigen Nachweisfelder weiterhin fest', async () => {
    await signAndStoreContract({
      sv_id: 'sv-1',
      vorlage_typ: 'nutzungsbedingungen',
      rolle: 'sachverstaendiger',
      unterschrift_name: 'Max Mustermann',
      unterschrift_ip: '1.2.3.4',
      unterschrift_user_agent: 'vitest',
      signature_png_data_uri: SIG,
    })

    expect(insertCapture).toMatchObject({
      unterschrift_name: 'Max Mustermann',
      unterschrift_ip: '1.2.3.4',
      unterschrift_user_agent: 'vitest',
    })
  })

  it('setzt das Feld auf null, wenn ohne gezeichnete Signatur unterschrieben wurde', async () => {
    await signAndStoreContract({
      sv_id: 'sv-1',
      vorlage_typ: 'nutzungsbedingungen',
      rolle: 'sachverstaendiger',
      unterschrift_name: 'Klick Zustimmung',
    })

    expect(insertCapture!.signature_png_data_uri).toBeNull()
  })

  it('zieht den Storage-Pfad weiterhin nach (PDF bleibt die Ausfertigung)', async () => {
    await signAndStoreContract({
      sv_id: 'sv-1',
      vorlage_typ: 'nutzungsbedingungen',
      rolle: 'sachverstaendiger',
      unterschrift_name: 'Max Mustermann',
      signature_png_data_uri: SIG,
    })

    expect(updateCapture).toMatchObject({ pdf_storage_path: 'sv-1/vertrag-1.pdf' })
    expect(updateCapture!.pdf_generiert_am).toBeTruthy()
  })
})
