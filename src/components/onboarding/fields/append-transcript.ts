// Haengt einen Diktat-Transcript an bereits getippten Text an (nie ueberschreiben).
// Pure Funktion -> unit-testbar. Leerer Bestand -> nur der Transcript; sonst mit
// genau einem Trennzeichen (Space) verbunden, doppelte Leerzeichen vermieden.
export function appendTranscript(existing: string, added: string): string {
  const base = (existing ?? '').trimEnd()
  const addition = (added ?? '').trim()
  if (!addition) return existing ?? ''
  if (!base) return addition
  return `${base} ${addition}`
}
