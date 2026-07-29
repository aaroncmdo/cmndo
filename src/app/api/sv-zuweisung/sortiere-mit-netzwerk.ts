// Pure Sort fuer die sv-zuweisung-Route (K4/13b): Netzwerkpartner zuerst, dann schaden_match,
// dann partner_seit ASC. DB-frei -> testbar. Der Batch (zahlendeSet) laedt der Caller (K10).
export type ZuweisungsKandidat = { id: string; schaden_match: boolean; partner_seit: string | null }

export function sortiereMitNetzwerk<T extends ZuweisungsKandidat>(
  kandidaten: T[],
  zahlendeSet: ReadonlySet<string>,
): T[] {
  return [...kandidaten].sort((a, b) => {
    const netz = Number(zahlendeSet.has(b.id)) - Number(zahlendeSet.has(a.id)) // Netzwerkpartner zuerst
    if (netz !== 0) return netz
    if (a.schaden_match !== b.schaden_match) return a.schaden_match ? -1 : 1
    const da = a.partner_seit ? new Date(a.partner_seit).getTime() : Infinity
    const dbt = b.partner_seit ? new Date(b.partner_seit).getTime() : Infinity
    return da - dbt
  })
}
