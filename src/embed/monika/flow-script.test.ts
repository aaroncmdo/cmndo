import { describe, it, expect } from 'vitest'
import { SCRIPT, START_STEP, type StepId } from './flow-script'

const ids = new Set<string>(Object.keys(SCRIPT))

describe('SCRIPT — Graph-Integritaet', () => {
  it('START_STEP existiert', () => expect(SCRIPT[START_STEP]).toBeTruthy())

  it('Step.id == Map-Key', () => {
    for (const [key, step] of Object.entries(SCRIPT)) expect(step.id).toBe(key)
  })

  it('jede choice/contact/actions .next zeigt auf einen realen Step', () => {
    for (const step of Object.values(SCRIPT)) {
      if (step.then.kind === 'choices') for (const o of step.then.options) expect(ids.has(o.next)).toBe(true)
      if (step.then.kind === 'contact') expect(ids.has(step.then.next)).toBe(true)
      if (step.then.kind === 'actions') for (const a of step.then.actions) if (a.next) expect(ids.has(a.next)).toBe(true)
    }
  })

  it('jeder erreichbare Pfad terminiert (contact/actions); kontakt erreichbar', () => {
    const seen = new Set<StepId>()
    const q: StepId[] = [START_STEP]
    while (q.length) {
      const id = q.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      const t = SCRIPT[id].then
      if (t.kind === 'choices') t.options.forEach((o) => q.push(o.next))
      if (t.kind === 'actions') t.actions.forEach((a) => a.next && q.push(a.next as StepId))
      // contact = terminal
    }
    expect(seen.has('kontakt')).toBe(true)
    expect([...seen].every((id) => ids.has(id))).toBe(true)
  })

  it('start bietet genau die 4 Anliegen', () => {
    const opts = SCRIPT.start.then.kind === 'choices' ? SCRIPT.start.then.options.map((o) => o.value).sort() : []
    expect(opts).toEqual(['gegengutachten', 'haftpflichtgutachten', 'schadensberatung', 'wertgutachten'])
  })
})

describe('Pfad-Simulation', () => {
  it('Haftpflicht/unverschuldet laeuft ueber den Graph bis hp_kapazitaet (contact)', () => {
    const path: Array<[StepId, string]> = [
      ['start', 'haftpflichtgutachten'],
      ['hp_unfalltyp', 'auffahrunfall'],
      ['hp_schuld', 'unverschuldet'],
      ['hp_termin_tag', 'morgen'],
      ['hp_termin_zeit', 'vormittag'],
    ]
    let cur: StepId = 'start'
    for (const [expectStep, value] of path) {
      expect(cur).toBe(expectStep)
      const t = SCRIPT[cur].then
      expect(t.kind).toBe('choices')
      if (t.kind !== 'choices') throw new Error('expected choices at ' + cur)
      const opt = t.options.find((o) => o.value === value)
      expect(opt).toBeTruthy()
      cur = opt!.next
    }
    expect(cur).toBe('hp_kapazitaet')
    expect(SCRIPT.hp_kapazitaet.then.kind).toBe('contact')
  })

  it('Gegengutachten → nur Rückruf → kontakt', () => {
    const t = SCRIPT.gegen.then
    expect(t.kind).toBe('actions')
    if (t.kind !== 'actions') throw new Error('expected actions')
    expect(t.actions).toHaveLength(1)
    expect(t.actions[0]).toMatchObject({ kind: 'callback', next: 'kontakt' })
  })
})
