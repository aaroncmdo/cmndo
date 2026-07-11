// src/lib/task-executor/allowed-triggers.ts
// Kuratierte Teilmenge von COMMUNICATION_REGISTRY-Triggern, die der Executor
// senden darf (Template existiert + geprueft). Bewusst klein; neue Trigger hier
// ergaenzen (nicht im Verb frei-stringen). WhatsApp ist template-gebunden — kein
// Freitext. Verifiziere neue Trigger gegen src/lib/communications/registry.ts.
export const ERLAUBTE_COMM_TRIGGER = [
  'dokumente_nachreichen',
  'dokumente_upload_anfrage',
] as const

export type ErlaubterTrigger = (typeof ERLAUBTE_COMM_TRIGGER)[number]
