// Registry-Domain fuer die Dringlichkeit einer Aufgabe (tasks.prioritaet).
//
// Die drei Keys spiegeln den DB-CHECK exakt:
//   CHECK (prioritaet = ANY (ARRAY['normal', 'dringend', 'kritisch']))
//
// Warum als Registry-Domain und nicht als Ternary in der Seite: Genau diese Farb-
// Ternaries (`prioritaet === 'kritisch' ? 'bg-danger-soft' : …`) sind es, die der
// Status-Registry-Ratchet blockt — sie streuen dieselbe Zuordnung ueber beliebig viele
// Dateien, bis sie auseinanderlaufen. Die Zuordnung gehoert an EINE Stelle.
//
// Kontext (Ops-Test 13.08.): 'dringend' war im Dispatch-Bereich wertlos geworden, weil
// zwei Routine-Crons es pauschal setzten — ALLE 347 offenen Aufgaben trugen es. Seit
// #5273 sind es 21. Erst dadurch traegt die Farbe hier wieder eine Aussage.
import type { StatusDef } from '../types'

export const TASK_PRIORITAET_DEFS = {
  normal:   { label: 'Normal', slot: 'neutral' },
  dringend: { label: 'Dringend', slot: 'warning' },
  kritisch: { label: 'Kritisch', slot: 'danger' },
} satisfies Record<string, StatusDef>
