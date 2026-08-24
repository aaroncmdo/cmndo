import { beforeEach, describe, expect, it } from 'vitest'
import { schreibeFunde, type Db } from '../schreiben'

/**
 * Die Datenbank ist ein Doppel — Pruefobjekt ist die ENTSCHEIDUNGSLOGIK:
 * Suppression zuerst, dann nur Leerstellen, Update nur mit Row-Check, Audit
 * erst nach erfolgreichem Update.
 *
 * Der Client wird hereingegeben (kein vi.mock noetig): genau deshalb beschafft
 * `schreibeFunde` ihn nicht selbst.
 */
const state = {
  lead: {} as Record<string, unknown>,
  leadFehler: null as string | null,
  suppression: [] as string[],
  updates: [] as Record<string, unknown>[],
  audit: [] as Record<string, unknown>[],
  updateRows: 1,
  updateFehler: null as string | null,
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'sv_leads') {
      return {
        select: () => ({
          eq: () => ({
            single: async () =>
              state.leadFehler
                ? { data: null, error: { message: state.leadFehler } }
                : { data: state.lead, error: null },
          }),
        }),
        update: (werte: Record<string, unknown>) => {
          state.updates.push(werte)
          return {
            eq: () => ({
              select: async () =>
                state.updateFehler
                  ? { data: null, error: { message: state.updateFehler } }
                  : {
                      data: Array.from({ length: state.updateRows }, () => ({ id: 'L1' })),
                      error: null,
                    },
            }),
          }
        },
      }
    }
    if (tabelle === 'cold_mail_suppression') {
      return {
        select: () => ({
          in: async () => ({
            data: state.suppression.map((email) => ({ email })),
            error: null,
          }),
        }),
      }
    }
    if (tabelle === 'levelup_anreicherung') {
      return {
        insert: async (rows: Record<string, unknown>[]) => {
          state.audit.push(...rows)
          return { error: null }
        },
      }
    }
  throw new Error(`Unerwartete Tabelle im Anreicherungs-Schreibpfad: ${tabelle}`)
  },
} as unknown as Db

beforeEach(() => {
  state.lead = { id: 'L1', email: null, telefon: null, website_url: null, vorname: null, nachname: null }
  state.leadFehler = null
  state.suppression = []
  state.updates = []
  state.audit = []
  state.updateRows = 1
  state.updateFehler = null
})

describe('schreibeFunde', () => {
  it('fuellt eine Leerstelle und protokolliert sie', async () => {
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'https://b.de/impressum', sicherheit: 90 },
    ], 'LAUF1')

    expect(r.ok).toBe(true)
    expect(r.ok && r.geschrieben).toEqual(['email'])
    expect(state.audit).toHaveLength(1)
    expect(state.audit[0]).toMatchObject({
      sv_lead_id: 'L1', feld: 'email', wert_vorher: null, wert_nachher: 'a@b.de',
      quelle_url: 'https://b.de/impressum', sicherheit: 90, lauf_id: 'LAUF1',
    })
  })

  it('setzt angereichert_am mit', async () => {
    await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')
    expect(state.updates[0]).toHaveProperty('angereichert_am')
  })

  // T-24: nur Leerstellen
  it('ueberschreibt ein gefuelltes Feld NICHT', async () => {
    state.lead.email = 'alt@example.de'
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'neu@example.de', quelleUrl: 'u', sicherheit: 95 },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual([])
    expect(r.ok && r.uebersprungen[0]).toMatchObject({ feld: 'email', grund: 'bereits gefuellt' })
    expect(state.audit).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('fuellt das leere Feld, auch wenn ein anderes belegt ist', async () => {
    state.lead.email = 'alt@example.de'
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'neu@example.de', quelleUrl: 'u', sicherheit: 95 },
      { feld: 'telefon', wert: '+49251123456', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual(['telefon'])
    expect(state.audit).toHaveLength(1)
    expect(state.audit[0]).toMatchObject({ feld: 'telefon' })
  })

  it('schreibt eine Adresse aus der Suppression-Liste GAR NICHT', async () => {
    state.suppression = ['a@b.de']
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual([])
    expect(r.ok && r.uebersprungen[0]).toMatchObject({ grund: 'in cold_mail_suppression' })
    expect(state.audit).toHaveLength(0)
  })

  it('meldet einen 0-Row-Update als Fehler statt Erfolg', async () => {
    state.updateRows = 0
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')

    expect(r.ok).toBe(false)
    expect(state.audit).toHaveLength(0)  // kein Audit ohne wirksamen Write
  })

  it('meldet einen Update-Fehler als Fehler', async () => {
    state.updateFehler = 'permission denied'
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')
    expect(r.ok).toBe(false)
  })

  it('meldet einen Lade-Fehler, statt blind zu schreiben', async () => {
    state.leadFehler = 'not found'
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1')
    expect(r.ok).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('schreibt im Trockenlauf nichts, meldet aber was passieren wuerde', async () => {
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'u', sicherheit: 90 },
    ], 'LAUF1', { dryRun: true })

    expect(r.ok && r.geschrieben).toEqual(['email'])
    expect(state.updates).toHaveLength(0)
    expect(state.audit).toHaveLength(0)
  })

  it('schreibt bei zwei Funden fuers gleiche Feld nur den ersten — eine Audit-Zeile', async () => {
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'erste@b.de', quelleUrl: 'u1', sicherheit: 90 },
      { feld: 'email', wert: 'zweite@b.de', quelleUrl: 'u2', sicherheit: 95 },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual(['email'])
    expect(state.updates[0]).toMatchObject({ email: 'erste@b.de' })
    // Zwei Audit-Zeilen fuer ein Feld wuerden behaupten, beide Werte seien
    // geschrieben worden — geschrieben wurde aber nur der erste.
    expect(state.audit).toHaveLength(1)
    expect(state.audit[0]).toMatchObject({ wert_nachher: 'erste@b.de' })
    expect(r.ok && r.uebersprungen[0]).toMatchObject({ grund: 'Duplikat im Fund-Satz' })
  })

  // CONTRACT §281: der beste Treffer setzt website_url, website_gefunden UND
  // website_sicherheit. Ohne die Sicherheit sieht der Vertrieb keine Warnung.
  it('setzt beim Website-Fund die Methode und die Sicherheit mit', async () => {
    await schreibeFunde(db, 'L1', [
      { feld: 'website_url', wert: 'https://b.de', quelleUrl: 'https://b.de', sicherheit: 70, methode: 'domain_raten' },
    ], 'LAUF1')

    expect(state.updates[0]).toMatchObject({
      website_url: 'https://b.de',
      website_gefunden: 'domain_raten',
      website_sicherheit: 70,
    })
  })

  it('setzt beim Kontakt-Fund die Fundstelle als kontakt_quelle', async () => {
    await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'a@b.de', quelleUrl: 'https://b.de/impressum', sicherheit: 90 },
    ], 'LAUF1')

    expect(state.updates[0]).toMatchObject({ kontakt_quelle: 'https://b.de/impressum' })
  })

  it('setzt keine Begleitspalte, wenn das Feld uebersprungen wurde', async () => {
    state.lead.website_url = 'https://alt.de'
    state.lead.email = 'alt@b.de'
    await schreibeFunde(db, 'L1', [
      { feld: 'website_url', wert: 'https://neu.de', quelleUrl: 'u', sicherheit: 40, methode: 'domain_raten' },
      { feld: 'email', wert: 'neu@b.de', quelleUrl: 'u', sicherheit: 90 },
      { feld: 'telefon', wert: '+4925112345', quelleUrl: 'https://b.de/kontakt', sicherheit: 90 },
    ], 'LAUF1')

    // Nur das Telefon war leer -> nur seine Fundstelle wird gesetzt,
    // die Sicherheit der VERWORFENEN Website darf nicht einsickern.
    expect(state.updates[0]).toMatchObject({ kontakt_quelle: 'https://b.de/kontakt' })
    expect(state.updates[0]).not.toHaveProperty('website_gefunden')
    expect(state.updates[0]).not.toHaveProperty('website_sicherheit')
  })

  /**
   * Verschaerfung gegenueber CONTEXT §5 ("unter 70 schreiben, aber markieren"),
   * begruendet am Bestand: bei "Ing.-Büro Urbach KG" traf `sv-ing.de` mit
   * Sicherheit 40 — eine FREMDE Firma. Eine Website mit 40 ist ein
   * Rechercheanhaltspunkt, den der Vertrieb korrigiert. Eine Adresse mit 40 ist
   * ein KANAL: die Cold Mail geht automatisiert an einen Unbeteiligten.
   */
  it('schreibt Kontaktdaten unter Sicherheit 70 NICHT', async () => {
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'fremd@andere-firma.de', quelleUrl: 'u', sicherheit: 40 },
      { feld: 'telefon', wert: '+4925199999', quelleUrl: 'u', sicherheit: 40 },
      { feld: 'vorname', wert: 'Fremd', quelleUrl: 'u', sicherheit: 40 },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual([])
    expect(r.ok && r.uebersprungen.map((u) => u.grund)).toEqual([
      'Zuordnung zu unsicher (40 < 70)',
      'Zuordnung zu unsicher (40 < 70)',
      'Zuordnung zu unsicher (40 < 70)',
    ])
    expect(state.audit).toHaveLength(0)
  })

  /**
   * Am Bestand gefunden (18.08., sv-wester.de): die Seite nennt
   * `zentrale@sv-wester.de`. T-25 kappt Rollenadressen auf 60 — eine Schwelle
   * auf `sicherheit` haette also JEDE Rollenadresse verworfen, obwohl die
   * Website mit 100 zugeordnet war. `info@`/`kontakt@` ist bei
   * Sachverstaendigen die haeufigste Impressumsadresse; das haette die
   * Cold-Mail-Basis fast vollstaendig zerstoert.
   *
   * Die beiden Groessen sind verschieden und duerfen nicht in eine Zahl:
   *   zuordnung  = gehoert die Quelle zu DIESEM Lead
   *   sicherheit = wie belastbar ist DIESER Wert (Rollenadresse hoechstens 60)
   */
  it('schreibt eine Rollenadresse von einer sicher zugeordneten Website', async () => {
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'zentrale@sv-wester.de', quelleUrl: 'u', sicherheit: 60, zuordnung: 100 },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual(['email'])
    expect(state.audit[0]).toMatchObject({ sicherheit: 60 })   // die Kappung bleibt im Log
  })

  it('verwirft dieselbe Adresse, wenn die Website unsicher zugeordnet ist', async () => {
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'email', wert: 'info@fremd.de', quelleUrl: 'u', sicherheit: 60, zuordnung: 40 },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual([])
    expect(r.ok && r.uebersprungen[0].grund).toContain('zu unsicher')
  })

  it('schreibt die Website auch unter 70 — sie ist ein Anhaltspunkt, kein Kanal', async () => {
    const r = await schreibeFunde(db, 'L1', [
      { feld: 'website_url', wert: 'https://vielleicht.de', quelleUrl: 'u', sicherheit: 40, methode: 'domain_raten' },
    ], 'LAUF1')

    expect(r.ok && r.geschrieben).toEqual(['website_url'])
    expect(state.updates[0]).toMatchObject({ website_sicherheit: 40 })
  })

  it('kommt mit einer leeren Fundliste zurecht', async () => {
    const r = await schreibeFunde(db, 'L1', [], 'LAUF1')
    expect(r.ok && r.geschrieben).toEqual([])
    expect(state.updates).toHaveLength(0)
  })
})
