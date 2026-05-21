// AAR-713 Phase 1 — getTerminByToken aus /sv/termin/[token]/actions.ts
// hierher verschoben damit die Route-actions.ts wegfallen kann (war
// Single-Source-Drift gegen lib/actions/termin-actions.ts).
//
// Loader für den Public-SV-Token-Flow: nimmt einen ablehnen_token, liefert
// die Termin-Daten + Kontext (Kunde, Fahrzeug, Adresse, Versicherung) für
// die Anzeige in /sv/termin/[token]. Reine Read-Funktion, kein Mutation —
// alle Mutations (annehmen/ablehnen/gegenvorschlag) laufen über
// lib/actions/termin-actions.ts.

'use server'

import { createServiceClient } from '@/lib/supabase/server'

export type TerminData = {
  id: string
  status: string
  start_zeit: string
  end_zeit: string
  kunde_name: string
  kennzeichen: string
  adresse: string
  claim_nummer: string | null
  fall_id: string | null
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
  fahrzeug: string | null
  versicherung: string | null
  abgelehnt_am: string | null
}

export async function getTerminByToken(
  token: string,
): Promise<{ termin: TerminData | null; error?: string }> {
  const svc = createServiceClient()

  // CMM-44 SP-D PR2a: besichtigungsort_adresse direkt aus gutachter_termine (SSoT).
  const { data: termin } = await svc
    .from('gutachter_termine')
    .select(
      'id, status, start_zeit, end_zeit, fall_id, lead_id, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, abgelehnt_am, ablehnen_token_expires_at, besichtigungsort_adresse',
    )
    .eq('ablehnen_token', token)
    .maybeSingle()

  if (!termin) return { termin: null, error: 'Token ungültig oder abgelaufen.' }

  if (termin.ablehnen_token_expires_at && new Date(termin.ablehnen_token_expires_at) < new Date()) {
    return { termin: null, error: 'Dieser Link ist abgelaufen. Bitte kontaktieren Sie den Dispatcher.' }
  }

  let kundeName = '—'
  let kennzeichen = '—'
  let adresse = '—'
  let fallNummer: string | null = null
  let fahrzeug: string | null = null
  let versicherung: string | null = null

  const loadLeadData = async (leadId: string) => {
    const { data: lead } = await svc
      .from('leads')
      .select('vorname, nachname, kennzeichen, fahrzeug_standort_adresse, fahrzeug_standort_plz, fahrzeug_hersteller, fahrzeug_modell')
      .eq('id', leadId)
      .single()
    if (lead) {
      kundeName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
      kennzeichen = lead.kennzeichen || '—'
      adresse = lead.fahrzeug_standort_adresse || lead.fahrzeug_standort_plz || '—'
      const parts = [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean)
      if (parts.length > 0) fahrzeug = parts.join(' ')
    }
  }

  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus termin-Row selbst (GT SSoT).
  if ((termin.besichtigungsort_adresse as string | null)) adresse = termin.besichtigungsort_adresse as string

  if (termin.fall_id) {
    const { data: fall } = await svc
      .from('faelle')
      .select('lead_id, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, claims:claim_id(claim_nummer)')
      .eq('id', termin.fall_id)
      .single()
    fallNummer = (Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims)?.claim_nummer ?? null
    if (fall?.kennzeichen) kennzeichen = fall.kennzeichen
    const fp = [fall?.fahrzeug_hersteller, fall?.fahrzeug_modell].filter(Boolean)
    if (fp.length > 0) fahrzeug = fp.join(' ')

    const leadId = termin.lead_id || fall?.lead_id
    if (leadId) await loadLeadData(leadId)
    // GT-Koordinate gewinnt über lead-Adresse wenn gesetzt
    if ((termin.besichtigungsort_adresse as string | null)) adresse = termin.besichtigungsort_adresse as string
    if (fall?.kennzeichen) kennzeichen = fall.kennzeichen
    if (fp.length > 0) fahrzeug = fp.join(' ')

    const { data: partei } = await svc.from('parteien').select('versicherung_name').eq('fall_id', termin.fall_id).eq('rolle', 'gegner').limit(1).maybeSingle()
    if (partei?.versicherung_name) versicherung = partei.versicherung_name
  } else if (termin.lead_id) {
    await loadLeadData(termin.lead_id)
  }

  return {
    termin: {
      id: termin.id,
      status: termin.status,
      start_zeit: termin.start_zeit,
      end_zeit: termin.end_zeit,
      kunde_name: kundeName,
      kennzeichen,
      adresse,
      claim_nummer: fallNummer,
      fall_id: termin.fall_id ?? null,
      vorgeschlagenes_datum: termin.vorgeschlagenes_datum ?? null,
      gegenvorschlag_von: termin.gegenvorschlag_von ?? null,
      gegenvorschlag_grund: termin.gegenvorschlag_grund ?? null,
      fahrzeug,
      versicherung,
      abgelehnt_am: termin.abgelehnt_am ?? null,
    },
  }
}
