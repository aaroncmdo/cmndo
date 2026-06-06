import { describe, it, expect } from 'vitest'
import { EmbedAnfrageSchema } from './embed-anfrage'

describe('EmbedAnfrageSchema — Monika-A-Flow-Felder', () => {
  const base = { name: 'Max Mustermann', telefon: '0151 23456789', source: 'sv_embed' as const }

  it('akzeptiert + behaelt die 6 neuen Felder', () => {
    const r = EmbedAnfrageSchema.safeParse({
      ...base,
      anliegen: 'haftpflichtgutachten',
      unfalltyp: 'auffahrunfall',
      schuld_einschaetzung: 'unverschuldet',
      bewertungsgrund: 'reparatur',
      wunsch_tag: 'morgen',
      wunsch_zeit: 'vormittag',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.anliegen).toBe('haftpflichtgutachten')
      expect(r.data.wunsch_tag).toBe('morgen')
      expect(r.data.wunsch_zeit).toBe('vormittag')
    }
  })

  it('Felder sind optional (Pfade fuellen nur ihre)', () => {
    expect(EmbedAnfrageSchema.safeParse({ ...base, anliegen: 'schadensberatung' }).success).toBe(true)
  })
})
