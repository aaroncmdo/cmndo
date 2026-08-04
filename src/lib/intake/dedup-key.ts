// C2 (Fundament, Ein Intake): der generische Intake-Dedup-Key — Person (telefon|email) + Schaden
// (kennzeichen) in einem Zeitfenster. Verallgemeinert die source-channel-spezifischen findRecent*-
// Helfer (recent-lead-dedup.ts) auf EINEN Key, den jeder createCase-Adapter mitgibt.

export type DedupKeyInput = {
  telefon?: string | null
  email?: string | null
  kennzeichen?: string | null
}

export type NormalizedDedupKey = {
  telefon: string | null
  email: string | null
  kennzeichen: string | null
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

export function normalizeDedupKey(input: DedupKeyInput): NormalizedDedupKey {
  const email = clean(input.email)
  return {
    telefon: clean(input.telefon),
    email: email ? email.toLowerCase() : null,
    kennzeichen: clean(input.kennzeichen),
  }
}

/** Nutzbar nur wenn eine Person-Kennung (telefon ODER email) UND die Schadenkennung (kennzeichen)
 *  vorliegen — sonst waere der Key zu breit. Fehlt eine Achse -> Caller ueberspringt den Dedup. */
export function dedupKeyIsUsable(input: DedupKeyInput): boolean {
  const k = normalizeDedupKey(input)
  const hatPerson = k.telefon !== null || k.email !== null
  return hatPerson && k.kennzeichen !== null
}
