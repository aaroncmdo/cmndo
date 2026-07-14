import { describe, it, expect } from 'vitest'
import { generiereColdMailVorlage } from '../compose-ki'

describe('generiereColdMailVorlage', () => {
  it('parst JSON aus der KI-Antwort', async () => {
    const generate = async () => '{"betreff":"Partnerschaft","body_html":"<p>Hallo {{Ansprechpartner}}</p>"}'
    const res = await generiereColdMailVorlage({ rolle: 'makler', ziel: 'Termin' }, { generate })
    expect(res).toEqual({ ok: true, betreff: 'Partnerschaft', body_html: '<p>Hallo {{Ansprechpartner}}</p>' })
  })
  it('toleriert Prosa um das JSON herum', async () => {
    const generate = async () => 'Klar!\n{"betreff":"X","body_html":"<p>Y</p>"}\nViel Erfolg.'
    const res = await generiereColdMailVorlage({ rolle: 'werkstatt', ziel: 'z' }, { generate })
    expect(res).toEqual({ ok: true, betreff: 'X', body_html: '<p>Y</p>' })
  })
  it('liefert ok:false bei unparsebarer Antwort', async () => {
    const res = await generiereColdMailVorlage({ rolle: 'makler', ziel: 'z' }, { generate: async () => 'kein json' })
    expect(res.ok).toBe(false)
  })
  it('liefert ok:false wenn generate wirft', async () => {
    const res = await generiereColdMailVorlage({ rolle: 'makler', ziel: 'z' }, { generate: async () => { throw new Error('boom') } })
    expect(res).toEqual({ ok: false, error: 'boom' })
  })
  it('reicht rollen-spezifischen System-Prompt + Ziel/Tonalität an generate', async () => {
    let sys = '', usr = ''
    const generate = async (s: string, u: string) => { sys = s; usr = u; return '{"betreff":"a","body_html":"b"}' }
    await generiereColdMailVorlage({ rolle: 'sachverstaendiger', ziel: 'Gutachtenaufträge', tonalitaet: 'seriös' }, { generate })
    expect(sys).toContain('Sachverständiger')
    expect(usr).toContain('Gutachtenaufträge')
    expect(usr).toContain('seriös')
  })
})
