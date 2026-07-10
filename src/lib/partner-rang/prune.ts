// src/lib/partner-rang/prune.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

const TYPEN = ['sachverstaendiger', 'makler', 'werkstatt'] as const

/**
 * Bringt partner_rang exakt aufs aktuelle Kandidaten-Set: loescht je Partner-Typ die Zeilen,
 * deren partner_id NICHT in `rows` steht (Stale-Zeilen von Test-/geloeschten/deaktivierten
 * Partnern — der Cron macht sonst nur upsert und prunt nichts). LEERES-SET-GUARD: ein Typ
 * ohne Kandidaten wird uebersprungen (koennte ein transienter Loader-Fehler sein) -> nie ein
 * versehentlicher Massen-Delete. Prune-Fehler sind non-fatal (nur geloggt) -> brechen den
 * Cron nicht (die Ranges wurden ja bereits ge-upsertet).
 */
export async function prunePartnerRang(
  supabase: Sb,
  rows: { partner_typ: string; partner_id: string }[],
): Promise<void> {
  for (const typ of TYPEN) {
    const keepIds = rows.filter((r) => r.partner_typ === typ).map((r) => r.partner_id)
    if (keepIds.length === 0) continue
    const { error } = await supabase
      .from('partner_rang')
      .delete()
      .eq('partner_typ', typ)
      .not('partner_id', 'in', `(${keepIds.join(',')})`)
    if (error) console.error(`[partner-rang] prune ${typ} fehlgeschlagen:`, error.message)
  }
}
