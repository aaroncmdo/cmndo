'use server'

// AAR-702: Token-basierte Kunde-Response auf SV-Gegenvorschlag.
// Anon-Route — kein Login nötig. Token = gutachter_termine.kunde_response_token.

import { createAdminClient } from '@/lib/supabase/admin'

export type KundeTerminData = {
  id: string
  status: string
  start_zeit: string
  end_zeit: string
  vorgeschlagenes_datum: string | null
  gegenvorschlag_grund: string | null
  fall_id: string | null
  fall_nummer: string | null
  sv_name: string
  kunde_vorname: string
}

async function loadTerminByToken(token: string) {
  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select(
      'id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_grund, fall_id, sv_id, lead_id, kunde_response_token_expires_at',
    )
    .eq('kunde_response_token', token)
    .maybeSingle()
  return { db, termin }
}

export async function getKundeTerminByToken(
  token: string,
): Promise<{ termin: KundeTerminData | null; error?: string }> {
  const { db, termin } = await loadTerminByToken(token)
  if (!termin) return { termin: null, error: 'Link ungültig oder abgelaufen.' }
  if (
    termin.kunde_response_token_expires_at &&
    new Date(termin.kunde_response_token_expires_at) < new Date()
  ) {
    return { termin: null, error: 'Dieser Link ist abgelaufen. Bitte kontaktieren Sie Ihren Betreuer.' }
  }

  // SV-Name + Fall-Nummer + Kunden-Vorname laden
  let svName = 'Sachverständiger'
  let fallNummer: string | null = null
  let kundeVorname = 'Kunde'

  if (termin.sv_id) {
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
    if (sv?.profile_id) {
      const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Sachverständiger'
    }
  }

  if (termin.fall_id) {
    const { data: fall } = await db.from('faelle').select('fall_nummer, lead_id').eq('id', termin.fall_id).single()
    fallNummer = fall?.fall_nummer ?? null
    const leadId = termin.lead_id ?? fall?.lead_id ?? null
    if (leadId) {
      const { data: lead } = await db.from('leads').select('vorname').eq('id', leadId).single()
      if (lead?.vorname) kundeVorname = lead.vorname
    }
  } else if (termin.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname').eq('id', termin.lead_id).single()
    if (lead?.vorname) kundeVorname = lead.vorname
  }

  return {
    termin: {
      id: termin.id,
      status: termin.status,
      start_zeit: termin.start_zeit,
      end_zeit: termin.end_zeit,
      vorgeschlagenes_datum: termin.vorgeschlagenes_datum,
      gegenvorschlag_grund: termin.gegenvorschlag_grund,
      fall_id: termin.fall_id,
      fall_nummer: fallNummer,
      sv_name: svName,
      kunde_vorname: kundeVorname,
    },
  }
}

/**
 * Kunde nimmt SV-Vorschlag an → status='bestaetigt', start_zeit auf
 * vorgeschlagenes_datum, bestaetigeTermin() läuft (sendet SV-Email + Kunde-WA).
 */
export async function acceptVorschlagByToken(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const { db, termin } = await loadTerminByToken(token)
  if (!termin) return { success: false, error: 'Token ungültig.' }
  if (
    termin.kunde_response_token_expires_at &&
    new Date(termin.kunde_response_token_expires_at) < new Date()
  ) {
    return { success: false, error: 'Dieser Link ist abgelaufen.' }
  }
  if (termin.status !== 'gegenvorschlag') {
    return { success: false, error: `Aktion im Status "${termin.status}" nicht möglich.` }
  }
  if (!termin.vorgeschlagenes_datum) {
    return { success: false, error: 'Kein gültiger Vorschlag hinterlegt.' }
  }

  const neueStartZeit = new Date(termin.vorgeschlagenes_datum)
  const neueEndZeit = new Date(neueStartZeit.getTime() + 90 * 60 * 1000)

  const { error: updateErr } = await db
    .from('gutachter_termine')
    .update({
      start_zeit: neueStartZeit.toISOString(),
      end_zeit: neueEndZeit.toISOString(),
      vorgeschlagenes_datum: null,
      gegenvorschlag_von: null,
      gegenvorschlag_grund: null,
      // Token verbrauchen
      kunde_response_token_expires_at: new Date().toISOString(),
    })
    .eq('id', termin.id)
  if (updateErr) return { success: false, error: updateErr.message }

  // bestaetigeTermin setzt status='bestaetigt' + sendet SV-Email + Kunde-WA + Timeline
  try {
    const { bestaetigeTermin } = await import('@/lib/termine/bestaetigung')
    await bestaetigeTermin(termin.id)
  } catch (err) {
    console.error('[AAR-702 acceptVorschlagByToken] bestaetigeTermin:', err)
  }

  return { success: true }
}

/**
 * Kunde macht eigenen Gegenvorschlag → status bleibt 'gegenvorschlag',
 * gegenvorschlag_von='kunde', neue Email an SV.
 */
export async function counterByToken(
  token: string,
  neuesDatum: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  const { db, termin } = await loadTerminByToken(token)
  if (!termin) return { success: false, error: 'Token ungültig.' }
  if (
    termin.kunde_response_token_expires_at &&
    new Date(termin.kunde_response_token_expires_at) < new Date()
  ) {
    return { success: false, error: 'Dieser Link ist abgelaufen.' }
  }
  if (termin.status !== 'gegenvorschlag') {
    return { success: false, error: `Aktion im Status "${termin.status}" nicht möglich.` }
  }

  const neueStartZeit = new Date(neuesDatum)
  if (Number.isNaN(neueStartZeit.getTime())) {
    return { success: false, error: 'Ungültiges Datum.' }
  }

  const { error: updateErr } = await db
    .from('gutachter_termine')
    .update({
      vorgeschlagenes_datum: neueStartZeit.toISOString(),
      gegenvorschlag_grund: grund || null,
      gegenvorschlag_von: 'kunde',
      // Token verbrauchen — kunde hat geantwortet, weitere Eskalation läuft
      // wieder über den SV-Workflow
      kunde_response_token_expires_at: new Date().toISOString(),
    })
    .eq('id', termin.id)
  if (updateErr) return { success: false, error: updateErr.message }

  // Timeline + Chat-System-Message
  if (termin.fall_id) {
    const terminStr = neueStartZeit.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    await db.from('timeline').insert({
      fall_id: termin.fall_id,
      typ: 'system',
      titel: 'Kunde hat Gegenvorschlag gemacht',
      beschreibung: `Neuer Terminvorschlag: ${terminStr}.${grund ? ` Grund: ${grund}` : ''}`,
    })
  }

  // SV per Email + WhatsApp informieren (non-critical)
  try {
    if (termin.sv_id) {
      const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
      if (sv?.profile_id) {
        const { data: p } = await db
          .from('profiles')
          .select('email, telefon, vorname')
          .eq('id', sv.profile_id)
          .single()
        const terminStr = neueStartZeit.toLocaleString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
        if (p?.telefon) {
          const { sendManualWhatsApp } = await import('@/lib/whatsapp')
          await sendManualWhatsApp(
            p.telefon,
            `📅 Kunde schlägt stattdessen ${terminStr} vor.${grund ? ` Grund: ${grund}` : ''} Bitte im Portal annehmen oder einen weiteren Vorschlag machen.`,
            termin.fall_id ?? null,
          )
        }
        // Email-Hinweis kann später als eigenes Template kommen — vorerst
        // reicht WhatsApp + die Anzeige im SV-Portal/Kalender.
      }
    }
  } catch (err) {
    console.warn('[AAR-702 counterByToken] SV-Notification:', err)
  }

  return { success: true }
}
