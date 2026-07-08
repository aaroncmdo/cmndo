import { describe, it, expect } from 'vitest'
import { summarizeClaimAiContext } from './context'
it('rendert die Kernfakten in den Prompt', () => {
  const s = summarizeClaimAiContext({
    claimNummer: 'CL-123', status: 'in_bearbeitung', fahrzeug: 'BMW 320d', unfallhergang: 'Auffahrunfall',
    gegner: 'HUK', tageInaktiv: 7, dokumente: ['gutachten.pdf'], pflichtdokumente: [{ typ: 'zb1', status: 'offen' }],
    termine: [], letzteNachrichten: ['Kunde: Wann kommt der Gutachter?'], letzteTimeline: ['SV zugewiesen'], offeneTasks: ['KVA prüfen'],
  })
  expect(s).toContain('CL-123'); expect(s).toContain('7 Tage'); expect(s).toContain('zb1'); expect(s).toContain('BMW 320d')
})
