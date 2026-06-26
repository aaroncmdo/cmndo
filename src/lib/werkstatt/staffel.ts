// Pure Helper fuer den Staffel-Fortschritt im Werkstatt-Portal. Keine I/O.
// erreichteSchwellen = settled-count-abgeleitet (konsistent mit dem Vergabe-Trigger,
// der bei genau diesem Count vergibt).

export type StaffelStufe = { schwelle: number; bonus_betrag_netto: number }

export type StaffelFortschritt = {
  naechste: StaffelStufe | null
  prozent: number
  alleErreicht: boolean
  erreichteSchwellen: number[]
}

export function berechneStaffelFortschritt(
  settledCount: number,
  stufen: StaffelStufe[],
): StaffelFortschritt {
  const sorted = [...stufen].sort((a, b) => a.schwelle - b.schwelle)
  const erreichteSchwellen = sorted.filter((s) => settledCount >= s.schwelle).map((s) => s.schwelle)
  const naechste = sorted.find((s) => settledCount < s.schwelle) ?? null

  if (sorted.length === 0) {
    return { naechste: null, prozent: 0, alleErreicht: false, erreichteSchwellen }
  }
  if (!naechste) {
    return { naechste: null, prozent: 100, alleErreicht: true, erreichteSchwellen }
  }
  // Basis = hoechste bereits erreichte Schwelle (oder 0), Fortschritt relativ zur naechsten
  const basis = erreichteSchwellen.length > 0 ? Math.max(...erreichteSchwellen) : 0
  const spanne = naechste.schwelle - basis
  const prozent = spanne <= 0 ? 0 : Math.min(100, Math.max(0, ((settledCount - basis) / spanne) * 100))
  return { naechste, prozent, alleErreicht: false, erreichteSchwellen }
}
