import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { erzeugeSkizzeFuerLead, type SkizzeLeadClient, type SkizzeLeadStand } from '../erzeuge-fuer-lead'
import { generateUnfallskizze } from '../generate'

// Der Generator wird in erzeugeSkizzeFuerLead dynamisch importiert (Anthropic-SDK) —
// vi.mock greift auch dort.
vi.mock('../generate', () => ({ generateUnfallskizze: vi.fn() }))

const generatorMock = vi.mocked(generateUnfallskizze)

// Die Funktion loggt bewusst per console.warn (non-critical). Im Test stumm.
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
afterAll(() => warnSpy.mockRestore())

const HERGANG_LANG = 'Von hinten aufgefahren an der Ampel'

/**
 * Fake-Client, der die Queries der Funktion nachbildet + Writes mitschreibt.
 * Die Tabelle wird MITGESCHRIEBEN: seit dem Claim-Nachzug schreibt die Funktion in
 * `leads` UND `claims`, und die Tests sollen belegen, dass beides passiert.
 */
function fakeAdmin(opts: {
  stand: SkizzeLeadStand | null
  updateError?: { message: string } | null
  claimUpdateError?: { message: string } | null
  leseFehler?: Error
}) {
  const updates: { table: string; payload: Record<string, unknown> }[] = []
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (opts.leseFehler) throw opts.leseFehler
            return { data: opts.stand }
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push({ table, payload })
        return {
          eq: async () => ({
            error: (table === 'claims' ? opts.claimUpdateError : opts.updateError) ?? null,
          }),
        }
      },
    }),
  } as unknown as SkizzeLeadClient
  return { client, updates }
}

const STAND_LEER: SkizzeLeadStand = {
  unfallskizze_svg: null,
  schadentyp: 'auffahrunfall',
  gegner_fahrzeugtyp: 'pkw',
}

beforeEach(() => {
  generatorMock.mockReset()
  generatorMock.mockResolvedValue({ success: true, svg: '<svg/>' })
})

describe('erzeugeSkizzeFuerLead', () => {
  it('generiert + speichert, wenn Hergang lang genug und keine Skizze da ist', async () => {
    const { client, updates } = fakeAdmin({ stand: STAND_LEER })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: HERGANG_LANG,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'generiert' })
    // Zwei Writes: Lead UND Claim. Der Claim-Nachzug ist noetig, weil der Convert die
    // Skizze beim Anlegen kopiert — zu einem Zeitpunkt, an dem sie oft noch nicht da ist
    // (fire-and-forget, 5-15 s). Ohne ihn bleibt sie fuer den Kunden unsichtbar.
    expect(updates.map((u) => u.table)).toEqual(['leads', 'claims'])
    for (const { payload } of updates) {
      expect(payload.unfallskizze_svg).toBe('<svg/>')
      // Vorschlag, keine vollendete Tatsache: Dispatch gibt frei oder lehnt ab.
      expect(payload.unfallskizze_bestaetigt).toBe(false)
      // Ein alter Ablehnungsgrund darf nicht an einer neuen Skizze kleben.
      expect(payload.unfallskizze_ablehnung_grund).toBeNull()
      expect(typeof payload.unfallskizze_generiert_am).toBe('string')
    }
  })

  it('meldet trotzdem Erfolg, wenn nur der Claim-Nachzug scheitert', async () => {
    // Die Skizze liegt dann am Lead — der Convert nimmt sie spaeter mit. Ein harter
    // Fehlschlag hier waere unverhaeltnismaessig: die Skizze ist eine Zugabe.
    const { client, updates } = fakeAdmin({
      stand: STAND_LEER,
      claimUpdateError: { message: 'claims kaputt' },
    })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: HERGANG_LANG,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'generiert' })
    expect(updates.map((u) => u.table)).toEqual(['leads', 'claims'])
  })

  it('reicht schadentyp + gegner_fahrzeugtyp als Prompt-Kontext durch', async () => {
    const { client } = fakeAdmin({ stand: STAND_LEER })
    await erzeugeSkizzeFuerLead({ leadId: 'l1', hergang: HERGANG_LANG, admin: client, kontext: 'test' })

    expect(generatorMock).toHaveBeenCalledWith({
      unfallhergang: HERGANG_LANG,
      schadentyp: 'auffahrunfall',
      gegnerFahrzeugtyp: 'pkw',
    })
  })

  it('ueberspringt einen zu kurzen Hergang, ohne den Generator zu rufen', async () => {
    const { client, updates } = fakeAdmin({ stand: STAND_LEER })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: 'Unfall',
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'uebersprungen', grund: 'regel' })
    expect(generatorMock).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it('ueberschreibt eine vorhandene Skizze nicht — die kann Dispatch schon bewertet haben', async () => {
    const { client, updates } = fakeAdmin({
      stand: { ...STAND_LEER, unfallskizze_svg: '<svg id="alt"/>' },
    })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: HERGANG_LANG,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'uebersprungen', grund: 'regel' })
    expect(generatorMock).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it('ueberspringt einen nicht gefundenen Lead', async () => {
    const { client } = fakeAdmin({ stand: null })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'weg',
      hergang: HERGANG_LANG,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'uebersprungen', grund: 'lead-fehlt' })
    expect(generatorMock).not.toHaveBeenCalled()
  })

  it('schreibt nichts, wenn die Generierung fehlschlaegt', async () => {
    generatorMock.mockResolvedValue({ success: false, error: 'API down' })
    const { client, updates } = fakeAdmin({ stand: STAND_LEER })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: HERGANG_LANG,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'fehler', grund: 'API down' })
    expect(updates).toHaveLength(0)
  })

  it('meldet einen fehlgeschlagenen Write als Fehler', async () => {
    const { client } = fakeAdmin({ stand: STAND_LEER, updateError: { message: 'RLS' } })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: HERGANG_LANG,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'fehler', grund: 'RLS' })
  })

  it('wirft nie — ein geworfener Client-Fehler wird zum Ergebnis', async () => {
    const { client } = fakeAdmin({ stand: STAND_LEER, leseFehler: new Error('Netz weg') })
    // Kein rejects.toThrow: die Zusage der Funktion ist, dass der Caller sie
    // fire-and-forget rufen kann, ohne die Lead-Anlage zu gefaehrden.
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: HERGANG_LANG,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'fehler', grund: 'Netz weg' })
  })

  it('ueberspringt einen Hergang, der gar kein String ist', async () => {
    const { client } = fakeAdmin({ stand: STAND_LEER })
    const res = await erzeugeSkizzeFuerLead({
      leadId: 'l1',
      hergang: undefined,
      admin: client,
      kontext: 'test',
    })

    expect(res).toEqual({ status: 'uebersprungen', grund: 'regel' })
    expect(generatorMock).not.toHaveBeenCalled()
  })
})
