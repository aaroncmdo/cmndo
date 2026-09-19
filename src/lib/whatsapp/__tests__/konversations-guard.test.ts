import { describe, it, expect, vi } from 'vitest'
import { hatKuerzlichMenschlicheKonversation } from '../konversations-guard'

type Zeile = { richtung: string }

// Zeilen-Formen, wie prod sie am 19.09.2026 tatsaechlich schreibt (30 Tage, 85 Zeilen gemessen):
// Der Kunde schreibt -> inbound. ALLES Ausgehende — getippte Betreuer-Nachricht wie Cron-Send —
// liegt als outbound mit sender_rolle='system', is_system=false, sender_id=NULL (sender_id ist in
// der ganzen Tabelle nie gesetzt, 0/818). Die Tests mocken bewusst DIESE Formen und keine
// erfundenen: die erste Fassung mockte sender_rolle:'kundenbetreuer', einen Wert, den prod nicht
// kennt — der Test war gruen, der Guard auf prod blind.
const KUNDE_SCHREIBT: Zeile = { richtung: 'inbound' }
const AUSGEHEND_WIE_PROD: Zeile = { richtung: 'outbound' }

// Baut einen minimalen supabase-Query-Mock, der die Kette
// .from().select().eq().eq().gte().or()/.ilike().limit() unterstuetzt und am Ende `rows` liefert.
// Der Mock filtert NICHT — was `rows` enthaelt, kommt zurueck. Spies werden zurueckgegeben, damit
// Tests den PostgREST-Ausdruck bzw. die Filter pruefen koennen.
function mockDb(rows: Zeile[] | null, error = false) {
  const result = { data: error ? null : rows, error: error ? { message: 'boom' } : null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'ilike', 'or']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.limit = vi.fn(() => Promise.resolve(result))
  return { db: { from: vi.fn(() => chain) } as never, chain }
}

describe('hatKuerzlichMenschlicheKonversation', () => {
  it('true, wenn der Kunde im Fenster geschrieben hat (inbound)', async () => {
    const { db } = mockDb([KUNDE_SCHREIBT])
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })).toBe(true)
  })

  it('false bei ausschliesslich ausgehenden Zeilen, wie prod sie schreibt — auch wenn ein Mensch tippte (bekannte Luecke)', async () => {
    // Der DB-Filter liesse diese Zeilen real gar nicht durch; der Mock filtert nicht — der Fall
    // beweist den JS-Gurt im Guard.
    const { db } = mockDb([AUSGEHEND_WIE_PROD, AUSGEHEND_WIE_PROD, AUSGEHEND_WIE_PROD])
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })).toBe(false)
  })

  it('Anna-Verlauf 16.09. 06:45: Cron-Sends + Kundenantworten <24h -> true (haette die 1h-Erinnerung unterdrueckt)', async () => {
    const { db } = mockDb([AUSGEHEND_WIE_PROD, KUNDE_SCHREIBT, AUSGEHEND_WIE_PROD, KUNDE_SCHREIBT])
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1', leadId: 'l1' })).toBe(true)
  })

  it('filtert serverseitig auf kanal=whatsapp UND richtung=inbound (Kontrakt: nur die Kundennachricht traegt)', async () => {
    const { db, chain } = mockDb([KUNDE_SCHREIBT])
    await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })
    expect(chain.select).toHaveBeenCalledWith('richtung')
    expect(chain.eq).toHaveBeenCalledWith('kanal', 'whatsapp')
    expect(chain.eq).toHaveBeenCalledWith('richtung', 'inbound')
  })

  it('false bei keiner Nachricht', async () => {
    const { db } = mockDb([])
    expect(await hatKuerzlichMenschlicheKonversation(db, { leadId: 'l1' })).toBe(false)
  })

  it('false ohne Kennung (kein Query moeglich)', async () => {
    const { db } = mockDb([KUNDE_SCHREIBT])
    expect(await hatKuerzlichMenschlicheKonversation(db, {})).toBe(false)
  })

  it('fail-open: Query-Fehler -> false (Reminder laeuft, nie faelschlich verschluckt)', async () => {
    const { db } = mockDb(null, true)
    expect(await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1' })).toBe(false)
  })

  it('prueft BEIDE Achsen (claim_id OR lead_id), wenn beide vorliegen', async () => {
    const { db, chain } = mockDb([KUNDE_SCHREIBT])
    const treffer = await hatKuerzlichMenschlicheKonversation(db, { claimId: 'c1', leadId: 'l1', telefon: '+49170123456' })
    expect(treffer).toBe(true)
    // OR ueber beide Bezug-Achsen; Telefon-ilike NICHT genutzt, wenn claim/lead vorliegen.
    expect(chain.or).toHaveBeenCalledWith('claim_id.eq.c1,lead_id.eq.l1')
    expect(chain.ilike).not.toHaveBeenCalled()
  })

  it('faellt auf Telefon-ilike zurueck, wenn weder claimId noch leadId vorliegen', async () => {
    const { db, chain } = mockDb([KUNDE_SCHREIBT])
    await hatKuerzlichMenschlicheKonversation(db, { telefon: '+49 170 1234567' })
    expect(chain.or).not.toHaveBeenCalled()
    expect(chain.ilike).toHaveBeenCalledWith('empfaenger_kontakt', '%701234567%')
  })
})
