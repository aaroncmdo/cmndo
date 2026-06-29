// #updates-rebuild Phase 0: einheitliches Item-Shape, das die UI konsumiert.
// Zwei orthogonale Achsen: typ (Modalitaet) x modus (braucht-mich?).
export type UpdateItem = {
  id: string
  typ: 'event' | 'message' | 'call' | 'task'
  modus: 'info' | 'action'
  prioritaet: 'normal' | 'hoch' | 'dringend'
  titel: string
  inhalt: string | null
  kontextTyp: string | null
  kontextId: string | null
  routeUrl: string | null
  source: string
  createdAt: string
}
