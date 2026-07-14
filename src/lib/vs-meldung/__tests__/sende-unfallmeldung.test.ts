import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: Array<Record<string, unknown>> = []
const tasks: Array<Record<string, unknown>> = []
const korrespondenz: Array<Record<string, unknown>> = []
const deadLetters: Array<Record<string, unknown>> = []

const state = {
  empfaenger: { kann: true, versicherungId: 'v1', name: 'Allianz', email: 'sachschaden@allianz.de' } as Record<
    string,
    unknown
  >,
  dokumente: [] as Array<Record<string, unknown>>,
  sendThrows: false,
  claimVorhanden: true,
}

vi.mock('../empfaenger', () => ({ resolveVsEmpfaenger: async () => state.empfaenger }))

vi.mock('../dispatch-task', () => ({
  erstelleVsDispatchTask: async (i: Record<string, unknown>) => {
    tasks.push(i)
    return { ok: true }
  },
}))

vi.mock('../claim-daten', () => ({
  ladeVsMeldungDaten: async () =>
    state.claimVorhanden
      ? {
          claimId: 'c1',
          claimNummer: 'CLM-1',
          unfallDatum: '2026-07-13',
          hergang: 'Auffahrunfall',
          gegnerVersicherungId: 'v1',
          geschaedigt: { firmaName: 'Test-Flotte GmbH', kennzeichen: 'B-FL 202', fahrzeug: 'BMW 320d' },
          gegner: {
            name: 'Max Mustermann',
            kennzeichen: 'B-XX 9999',
            versicherungsnummer: 'POL-123',
            versicherungsAktenzeichen: null,
          },
        }
      : null,
}))

vi.mock('@/lib/email/google/client', () => ({
  sendEmail: async (o: Record<string, unknown>) => {
    if (state.sendThrows) throw new Error('resend down')
    sent.push(o)
    return { messageId: 'msg-1' }
  },
}))

vi.mock('@react-email/render', () => ({ render: async () => '<html>x</html>' }))

const storageUrl = { value: 'https://storage.example/foto.jpg' as string | null }
vi.mock('@/lib/storage/url', () => ({
  getStorageUrl: async () => storageUrl.value,
  STORAGE_TTL: { download: 300 },
}))

vi.mock('@/lib/reliability/dead-letter', () => ({
  recordFailedOperation: async (i: Record<string, unknown>) => {
    deadLetters.push(i)
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'fall_dokumente') {
        return { select: () => ({ eq: async () => ({ data: state.dokumente, error: null }) }) }
      }
      return {
        insert: async (row: Record<string, unknown>) => {
          korrespondenz.push(row)
          return { error: null }
        },
      }
    },
  }),
}))

vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
)

beforeEach(() => {
  sent.length = 0
  tasks.length = 0
  korrespondenz.length = 0
  deadLetters.length = 0
  state.empfaenger = { kann: true, versicherungId: 'v1', name: 'Allianz', email: 'sachschaden@allianz.de' }
  state.dokumente = []
  state.sendThrows = false
  state.claimVorhanden = true
  storageUrl.value = 'https://storage.example/foto.jpg'
  process.env.VS_MELDUNG_ENABLED = 'true'
})

describe('sendeUnfallmeldungAnGegnerVs', () => {
  it('sendet an die schaden_email und protokolliert CHECK-konform in vs_korrespondenz', async () => {
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ ok: true, gesendet: true, empfaenger: 'sachschaden@allianz.de' })
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('sachschaden@allianz.de')

    expect(korrespondenz).toHaveLength(1)
    const k = korrespondenz[0]
    expect(k.claim_id).toBe('c1')
    expect(k.richtung).toBe('ausgehend') // CHECK: eingehend|ausgehend
    expect(k.kanal).toBe('email') // CHECK: email|post|fax|telefon|portal
    expect(k.status).toBe('wartet_auf_antwort') // CHECK kennt kein 'pending'
    expect(k.versicherung_id).toBe('v1')
  })

  it('haengt Schadenfotos an — mit Dateiendung, weil der Resend-Pfad contentType droppt', async () => {
    state.dokumente = [
      {
        id: 'd1',
        dokument_typ: 'gegner_fahrzeug_foto',
        storage_path: 'claims/c1/a.jpg',
        original_filename: 'a.jpg',
        mime_type: 'image/jpeg',
      },
      {
        id: 'd2',
        dokument_typ: 'unfallort_foto',
        storage_path: 'claims/c1/b.jpg',
        original_filename: 'b.jpg',
        mime_type: 'image/jpeg',
      },
    ]
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ gesendet: true, anhaenge: 2 })
    const att = sent[0].attachments as Array<{ filename: string; contentType?: string }>
    expect(att).toHaveLength(2)
    expect(att[0].filename).toMatch(/\.jpg$/)
    expect(att[0].contentType).toBe('image/jpeg')
  })

  it('haengt NUR Schadenfotos an, keine fremden Dokumenttypen', async () => {
    state.dokumente = [
      { id: 'd1', dokument_typ: 'gegner_fahrzeug_foto', storage_path: 'p/a.jpg', original_filename: 'a.jpg', mime_type: 'image/jpeg' },
      { id: 'd2', dokument_typ: 'fuehrerschein', storage_path: 'p/fs.jpg', original_filename: 'fs.jpg', mime_type: 'image/jpeg' },
      { id: 'd3', dokument_typ: 'gutachten', storage_path: 'p/g.pdf', original_filename: 'g.pdf', mime_type: 'application/pdf' },
    ]
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ anhaenge: 1 })
    const att = sent[0].attachments as Array<{ filename: string }>
    expect(att.map((a) => a.filename)).toEqual(['a.jpg'])
  })

  it('nicht signierbares Foto wird uebersprungen — die Meldung geht trotzdem raus', async () => {
    storageUrl.value = null // getStorageUrl scheitert
    state.dokumente = [
      { id: 'd1', dokument_typ: 'gegner_fahrzeug_foto', storage_path: 'p/a.jpg', original_filename: 'a.jpg', mime_type: 'image/jpeg' },
    ]
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    // Lieber ein Foto weniger als gar keine Meldung an die Versicherung:
    expect(res).toMatchObject({ ok: true, gesendet: true, anhaenge: 0 })
    expect(sent).toHaveLength(1)
  })

  it('KILL-SWITCH aus: kein Send, aber ehrliche Tracking-Zeile mit Dry-Run-Marker', async () => {
    process.env.VS_MELDUNG_ENABLED = 'false'
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ ok: true, gesendet: false, grund: 'kill_switch' })
    expect(sent).toHaveLength(0) // NICHTS geht an einen echten Versicherer
    expect(korrespondenz).toHaveLength(1)
    expect(korrespondenz[0].status).toBe('archiviert') // CHECK-konform
    expect(String(korrespondenz[0].notiz)).toContain('DRY-RUN')
    expect(String(korrespondenz[0].notiz)).toContain('sachschaden@allianz.de')
  })

  it('keine Versicherung -> Dispatch-Task, kein Send', async () => {
    state.empfaenger = { kann: false, grund: 'keine_versicherung' }
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res).toMatchObject({ ok: true, gesendet: false, grund: 'dispatch_task' })
    expect(sent).toHaveLength(0)
    expect(tasks[0]).toMatchObject({ claimId: 'c1', grund: 'keine_versicherung' })
  })

  it('Versicherer ohne schaden_email -> Dispatch-Task, kein Send', async () => {
    state.empfaenger = { kann: false, grund: 'keine_schaden_email', versicherungName: 'ADLER' }
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    await sendeUnfallmeldungAnGegnerVs('c1')

    expect(sent).toHaveLength(0)
    expect(tasks[0]).toMatchObject({ grund: 'keine_schaden_email' })
  })

  it('Send-Fehler -> Dead-Letter + Dispatch-Task, KEIN Tracking-Eintrag als gesendet', async () => {
    state.sendThrows = true
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('c1')

    expect(res.ok).toBe(false)
    expect(deadLetters[0]).toMatchObject({ operationType: 'vs_meldung_email', dedupKey: 'vs_meldung:c1' })
    expect(tasks[0]).toMatchObject({ grund: 'send_fehler' })
    expect(korrespondenz).toHaveLength(0) // nichts als "gesendet" protokollieren, was nie ankam
  })

  it('unbekannter Claim -> Fehler, kein Send', async () => {
    state.claimVorhanden = false
    const { sendeUnfallmeldungAnGegnerVs } = await import('../sende-unfallmeldung')
    const res = await sendeUnfallmeldungAnGegnerVs('gibts-nicht')

    expect(res).toEqual({ ok: false, error: 'Claim nicht gefunden' })
    expect(sent).toHaveLength(0)
  })
})
