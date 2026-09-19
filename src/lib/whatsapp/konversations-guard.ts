import type { SupabaseClient } from '@supabase/supabase-js'

/** Letzte 9 Ziffern einer Telefonnummer (notationstolerant, wie istInternesTelefon). */
function letzte9(tel: string): string {
  return (tel.match(/\d/g) ?? []).join('').slice(-9)
}

/**
 * Lief mit einem Kunden in den letzten `stundenFenster` Stunden eine MENSCHLICHE
 * WhatsApp-Konversation?
 *
 * Menschlich = der KUNDE hat geschrieben (richtung='inbound'). Nur das — und zwar bewusst:
 *
 * ⚠ Auf prod GEMESSEN (19.09.2026, 30 Tage, 85 WhatsApp-Zeilen): ausgehende Zeilen tragen KEINEN
 * Mensch/Automat-Unterschied. Getippte Betreuer-Nachrichten ("Ich klaere das kurz ab fuer Sie") und
 * Cron-Sends ("Erinnerung: ... morgen 10:00") liegen identisch als sender_rolle='system',
 * is_system=false, sender_id=NULL, template_key=NULL — der Betreuer tippt direkt in WhatsApp,
 * Baileys spiegelt ohne Absenderwissen. is_system=true steht nur auf den Protokoll-ZWILLINGEN aus
 * send-fall.ts, nie auf der gesendeten Nachricht selbst. sender_rolle ist als Signal deshalb
 * wertlos: die erste Fassung dieses Guards prueft es (`!= 'system'`) und waere auf prod NIE
 * gefeuert — der Unit-Test hatte einen Wert gemockt, den prod nicht kennt.
 * Wirksam ist deshalb allein die eingehende Kundennachricht, und genau das ist der Kontrakt.
 * KEIN sender_id-Zweig: die Spalte ist auf prod in der GESAMTEN Tabelle nie gesetzt (0 von 818
 * Zeilen, alle Kanaele, 19.09.2026) — ein Zweig darauf waere ein stummer Waechter. Wer den
 * Sendepfad um einen echten Absender erweitert, erweitert HIER um eine Zeile, mit Test gegen
 * echte Zeilen. Follow-up: BROADCAST-nachrichten-outbound-mensch-automat-ununterscheidbar.
 *
 * Bekannte Luecke daraus: eine vom Betreuer EROEFFNETE Konversation ist bis zur ersten Kunden-
 * antwort unsichtbar (Anna Winter 15.09.: 07:28:38 Betreuer bestaetigt -> 07:30:02 Cron-Erinnerung,
 * 84 s). Ihre beiden peinlichsten Sends (16.09. 06:45 + 07:45) hatten Kundenantworten <24 h davor
 * und werden gefangen.
 *
 * Reminder-/Eskalations-Crons nutzen das, um NICHT dazwischenzufunken, waehrend ein Betreuer den
 * Kunden gerade manuell betreut (Aaron 19.09.2026, Fall Anna Winter / CLM-2026-07961: Termin-
 * erinnerung + "Schadenmeldung offen" platzten in die laufende Konversation, der Betreuer musste
 * sich entschuldigen: "Hallo, die WhatsApp ist automatisiert rausgegangen, wir ...").
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
      .select('richtung')
      .eq('kanal', 'whatsapp')
      .eq('richtung', 'inbound')
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

    // Serverseitig schon auf inbound gefiltert; der JS-Check bleibt als Gurt, falls jemand den
    // .eq()-Filter oben entfernt — der Test "ausgehend wie prod -> false" haengt daran.
    return (data as Array<{ richtung: string }>).some((n) => n.richtung === 'inbound')
  } catch {
    return false
  }
}
