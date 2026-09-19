import type { SupabaseClient } from '@supabase/supabase-js'

/** Letzte 9 Ziffern einer Telefonnummer (notationstolerant, wie istInternesTelefon). */
function letzte9(tel: string): string {
  return (tel.match(/\d/g) ?? []).join('').slice(-9)
}

/**
 * Lief mit einem Kunden in den letzten `stundenFenster` Stunden eine MENSCHLICHE
 * WhatsApp-Konversation? Menschlich = eingehende Nachricht (richtung='inbound') ODER
 * ausgehende von einem echten Menschen (richtung='outbound' UND sender_rolle != 'system').
 *
 * Reminder-/Eskalations-Crons nutzen das, um NICHT dazwischenzufunken, waehrend ein
 * Betreuer den Kunden gerade manuell betreut (Aaron 19.09.2026, Fall Anna Winter /
 * CLM-2026-07961: automatische Terminerinnerung + "Schadenmeldung offen" platzten mitten
 * in eine laufende Betreuer-Konversation, der Betreuer musste sich beim Kunden entschuldigen).
 *
 * Fail-open: kein Query moeglich (keine Kennung), Query-Fehler oder Exception -> false
 * (der Reminder laeuft; ein echter Reminder darf nie wegen eines Lookup-Fehlers ausfallen).
 */
export async function hatKuerzlichMenschlicheKonversation(
  db: SupabaseClient,
  kennung: { claimId?: string | null; leadId?: string | null; telefon?: string | null },
  stundenFenster = 24,
): Promise<boolean> {
  try {
    if (!kennung.claimId && !kennung.leadId && !kennung.telefon) return false
    const seit = new Date(Date.now() - stundenFenster * 3_600_000).toISOString()

    let q = db
      .from('nachrichten')
      .select('richtung, sender_rolle')
      .eq('kanal', 'whatsapp')
      .gte('created_at', seit)

    // claim_id ODER lead_id (beide Achsen, wenn beide vorliegen): eine Konversation ueber
    // denselben Vorgang kann je nach Zeitpunkt am Lead ODER am Claim haengen (Lead->Claim-
    // Konversion, vgl. AUDIT-quali-antwort-erreicht-den-claim-nicht). Nur eine Achse zu pruefen
    // uebersaehe die Nachrichten der anderen. Telefon ist der Fallback ganz ohne Claim/Lead.
    const orParts: string[] = []
    if (kennung.claimId) orParts.push(`claim_id.eq.${kennung.claimId}`)
    if (kennung.leadId) orParts.push(`lead_id.eq.${kennung.leadId}`)
    if (orParts.length > 0) {
      q = q.or(orParts.join(','))
    } else if (kennung.telefon) {
      const digits = letzte9(kennung.telefon)
      if (digits.length < 6) return false
      q = q.ilike('empfaenger_kontakt', `%${digits}%`)
    }

    const { data, error } = await q.limit(200)
    if (error || !data) return false

    return (data as Array<{ richtung: string; sender_rolle: string | null }>).some(
      (n) => n.richtung === 'inbound' || (n.richtung === 'outbound' && n.sender_rolle !== 'system'),
    )
  } catch {
    return false
  }
}
