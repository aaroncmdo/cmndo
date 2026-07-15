import { describe, it, expect, vi } from 'vitest'

const createMock = vi.fn()
vi.mock('@/lib/ai/vision/client', () => ({
  getAnthropicVisionClient: () => ({ messages: { create: createMock } }),
}))
vi.mock('@/lib/ai/models', () => ({ AI_MODELS: { vision_schadenbeschreibung: 'claude-haiku-4-5-20251001' } }))

import { klassifiziereSchadenbeschreibung } from '../schadenbeschreibung-gewerke'

function aiText(json: string) {
  return { content: [{ type: 'text', text: json }] }
}

// Hinweis: Reset bewusst als erste Zeile in jedem it() statt via beforeEach().
// Ein beforeEach(() => createMock.mockReset()) auf einem modul-scope vi.fn(),
// das von einer vi.mock()-Factory eingefangen wird, meldet unter Vitest 4.1.4
// bei mockRejectedValue()+await/try-catch faelschlich eine "unhandled rejection"
// (verifiziert per Bisektion: identische Assertions, nur beforeEach -> inline-
// Reset macht den Unterschied False/Green). Reines Test-Isolations-Artefakt,
// keine Implementierungs-Auswirkung.
describe('klassifiziereSchadenbeschreibung', () => {
  it('leitet Gewerke + confidence aus dem Text ab', async () => {
    createMock.mockReset()
    createMock.mockResolvedValue(aiText('{"kategorien":["karosserie","lackierung"],"confidence":80}'))
    const r = await klassifiziereSchadenbeschreibung('Stossstange eingedrueckt, Kratzer im Lack')
    expect(r.kategorien).toEqual(['karosserie', 'lackierung'])
    expect(r.confidence).toBe(80)
  })

  it('leerer Text -> kein KI-Call, {[],0}', async () => {
    createMock.mockReset()
    const r = await klassifiziereSchadenbeschreibung('   ')
    expect(r).toEqual({ kategorien: [], confidence: 0 })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('fail-safe: ungueltige Kategorien werden gefiltert, confidence 0 bei leerer Menge', async () => {
    createMock.mockReset()
    createMock.mockResolvedValue(aiText('{"kategorien":["quatsch"],"confidence":90}'))
    const r = await klassifiziereSchadenbeschreibung('irgendwas')
    expect(r).toEqual({ kategorien: [], confidence: 0 })
  })

  it('fail-safe: AI-Fehler -> {[],0}', async () => {
    createMock.mockReset()
    createMock.mockRejectedValue(new Error('boom'))
    const r = await klassifiziereSchadenbeschreibung('Stossstange')
    expect(r).toEqual({ kategorien: [], confidence: 0 })
  })
})
