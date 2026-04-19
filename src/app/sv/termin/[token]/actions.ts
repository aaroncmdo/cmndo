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
  fall_nummer: string | null
  fall_id: string | null
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
  fahrzeug: string | null
  versicherung: string | null
  abgelehnt_am: string | null
}

export async function getTerminByToken(token: string): Promise<{ termin: TerminData | null; error?: string }> {
  const svc = createServiceClient()

  const { data: termin } = await svc
    .from('gutachter_termine')
    .select('id, status, start_zeit, end_zeit, fall_id, lead_id, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, abgelehnt_am, ablehnen_token_expires_at')
    .eq('ablehnen_token', token)
    .maybeSingle()

  if (!termin) return { termin: null, error: 'Token ungültig oder abgelaufen.' }

  // BUG-101: Token-Expiry prüfen
  if (termin.ablehnen_token_expires_at && new Date(termin.ablehnen_token_expires_at) < new Date()) {
    return { termin: null, error: 'Dieser Link ist abgelaufen. Bitte kontaktieren Sie den Dispatcher.' }
  }

  // Lade Kunden-Daten + Fall-Nummer + Fahrzeug
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

  if (termin.fall_id) {
    const { data: fall } = await svc
      .from('faelle')
      .select('fall_nummer, lead_id, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, besichtigungsort_adresse')
      .eq('id', termin.fall_id)
      .single()
    fallNummer = fall?.fall_nummer ?? null
    if (fall?.besichtigungsort_adresse) adresse = fall.besichtigungsort_adresse
    if (fall?.kennzeichen) kennzeichen = fall.kennzeichen
    const fp = [fall?.fahrzeug_hersteller, fall?.fahrzeug_modell].filter(Boolean)
    if (fp.length > 0) fahrzeug = fp.join(' ')

    const leadId = termin.lead_id || fall?.lead_id
    if (leadId) await loadLeadData(leadId)
    // Fall-Daten ueberschreiben Lead-Daten wo vorhanden
    if (fall?.besichtigungsort_adresse) adresse = fall.besichtigungsort_adresse
    if (fall?.kennzeichen) kennzeichen = fall.kennzeichen
    if (fp.length > 0) fahrzeug = fp.join(' ')

    // Versicherung aus parteien
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
      fall_nummer: fallNummer,
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

export async function ablehnenTermin(
  token: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  const svc = createServiceClient()

  const { data: termin } = await svc
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, start_zeit, status, ablehnen_token_expires_at')
    .eq('ablehnen_token', token)
    .maybeSingle()

  if (!termin) return { success: false, error: 'Token ungültig.' }
  // BUG-101: Expiry prüfen
  if (termin.ablehnen_token_expires_at && new Date(termin.ablehnen_token_expires_at) < new Date()) {
    return { success: false, error: 'Dieser Link ist abgelaufen.' }
  }
  if (termin.status === 'abgelehnt') return { success: false, error: 'Bereits abgelehnt.' }
  if (termin.status !== 'reserviert' && termin.status !== 'bestaetigt') {
    return { success: false, error: `Termin kann im Status "${termin.status}" nicht abgelehnt werden.` }
  }

  // 1. Termin ablehnen + Token verbrauchen (BUG-101)
  const { error: updateErr } = await svc.from('gutachter_termine').update({
    status: 'abgelehnt',
    abgelehnt_am: new Date().toISOString(),
    abgelehnt_grund: grund || 'Über Ablehnen-Seite',
    ablehnen_token_expires_at: new Date().toISOString(),
  }).eq('id', termin.id)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Reminder stornieren
  try { const { cancelRemindersForTermin } = await import('@/lib/reminders/generate'); await cancelRemindersForTermin(termin.id) } catch (err) { console.error('[KFZ-136] Reminder-Cancel:', err) }

  // 2. Fall updaten
  if (termin.fall_id) {
    await svc.from('faelle').update({
      sv_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', termin.fall_id)

    await svc.from('timeline').insert({
      fall_id: termin.fall_id,
      typ: 'system',
      titel: 'Gutachter hat Termin abgelehnt',
      beschreibung: `Grund: ${grund || 'Kein Grund angegeben'}. Neuer Gutachter wird gesucht.`,
    })

    // WhatsApp an Admin (non-critical)
    try {
      const { data: svData } = await svc.from('sachverstaendige')
        .select('profiles(vorname, nachname)')
        .eq('id', termin.sv_id)
        .single()
      const svP = (Array.isArray(svData?.profiles) ? svData?.profiles[0] : svData?.profiles) as { vorname: string | null; nachname: string | null } | null
      const svName = svP ? `${svP.vorname ?? ''} ${svP.nachname ?? ''}`.trim() : 'Unbekannt'

      const { data: fallData } = await svc.from('faelle').select('fall_nummer, kundenbetreuer_id').eq('id', termin.fall_id).single()
      const terminDatum = termin.start_zeit ? new Date(termin.start_zeit).toLocaleDateString('de-DE') : '?'

      const { sendManualWhatsApp } = await import('@/lib/whatsapp')
      const { data: admins } = await svc.from('profiles').select('telefon').eq('rolle', 'admin')
      for (const a of admins ?? []) {
        if (a.telefon) {
          await sendManualWhatsApp(a.telefon,
            `⚠️ Gutachter ${svName} hat den Termin am ${terminDatum} für ${fallData?.fall_nummer ?? 'Fall'} ABGELEHNT. Bitte neuen Gutachter zuweisen.`,
            termin.fall_id,
          )
        }
      }

      // Task erstellen (KFZ-151: verknuepft mit case)
      const { createLinkedTask } = await import('@/lib/tasks/create-task')
      await createLinkedTask({
        fall_id: termin.fall_id,
        titel: `Neuen Gutachter zuweisen für ${fallData?.fall_nummer ?? 'Fall'}`,
        typ: 'dispatch',
        prioritaet: 'dringend',
        faellig_am: new Date(),
        zugewiesen_an: fallData?.kundenbetreuer_id ?? null,
        entity_type: 'case',
        entity_id: termin.fall_id,
      })
    } catch { /* non-critical */ }
  }

  return { success: true }
}

export async function bestaetigenTermin(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const svc = createServiceClient()

  const { data: termin } = await svc
    .from('gutachter_termine')
    .select('id, fall_id, status, ablehnen_token_expires_at')
    .eq('ablehnen_token', token)
    .maybeSingle()

  if (!termin) return { success: false, error: 'Token ungültig.' }
  // BUG-101: Expiry prüfen
  if (termin.ablehnen_token_expires_at && new Date(termin.ablehnen_token_expires_at) < new Date()) {
    return { success: false, error: 'Dieser Link ist abgelaufen.' }
  }
  if (termin.status === 'bestaetigt') return { success: false, error: 'Bereits bestätigt.' }
  if (termin.status !== 'reserviert') {
    return { success: false, error: `Termin kann im Status "${termin.status}" nicht bestätigt werden.` }
  }

  // BUG-101: Token verbrauchen nach Bestätigung
  const { error: updateErr } = await svc.from('gutachter_termine').update({
    status: 'bestaetigt',
    ablehnen_token_expires_at: new Date().toISOString(),
  }).eq('id', termin.id)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Reminder generieren (Termin bestaetigt)
  try { const { generateReminderForTermin } = await import('@/lib/reminders/generate'); await generateReminderForTermin(termin.id) } catch (err) { console.error('[KFZ-136] Reminder-Gen:', err) }

  if (termin.fall_id) {
    await svc.from('faelle').update({
      updated_at: new Date().toISOString(),
    }).eq('id', termin.fall_id)

    await svc.from('timeline').insert({
      fall_id: termin.fall_id,
      typ: 'system',
      titel: 'Gutachter hat Termin bestätigt',
      beschreibung: 'Der Sachverständige hat den Termin über die Bestätigungsseite angenommen.',
    })
  }

  return { success: true }
}

export async function gegenvorschlagTermin(
  token: string,
  neuerTermin: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  const svc = createServiceClient()

  const { data: termin } = await svc
    .from('gutachter_termine')
    .select('id, fall_id, status, ablehnen_token_expires_at')
    .eq('ablehnen_token', token)
    .maybeSingle()

  if (!termin) return { success: false, error: 'Token ungültig.' }
  // BUG-101: Expiry prüfen
  if (termin.ablehnen_token_expires_at && new Date(termin.ablehnen_token_expires_at) < new Date()) {
    return { success: false, error: 'Dieser Link ist abgelaufen.' }
  }
  if (termin.status !== 'reserviert' && termin.status !== 'bestaetigt') {
    return { success: false, error: `Gegenvorschlag im Status "${termin.status}" nicht möglich.` }
  }

  const neueStartZeit = new Date(neuerTermin)
  const neueEndZeit = new Date(neueStartZeit.getTime() + 90 * 60 * 1000)

  const { error: updateErr } = await svc.from('gutachter_termine').update({
    status: 'gegenvorschlag',
    start_zeit: neueStartZeit.toISOString(),
    end_zeit: neueEndZeit.toISOString(),
    abgelehnt_grund: grund || 'Gegenvorschlag ohne Begründung',
  }).eq('id', termin.id)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Bestehende Reminder stornieren (Termin nicht final)
  try { const { cancelRemindersForTermin } = await import('@/lib/reminders/generate'); await cancelRemindersForTermin(termin.id) } catch (err) { console.error('[KFZ-136] Reminder-Cancel:', err) }

  if (termin.fall_id) {
    await svc.from('faelle').update({
      updated_at: new Date().toISOString(),
    }).eq('id', termin.fall_id)

    const terminStr = neueStartZeit.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    await svc.from('timeline').insert({
      fall_id: termin.fall_id,
      typ: 'system',
      titel: 'Gutachter hat Gegenvorschlag gemacht',
      beschreibung: `Neuer Terminvorschlag: ${terminStr}. Grund: ${grund || '—'}`,
    })

    // WhatsApp an Admin (non-critical)
    try {
      const { data: fallData } = await svc.from('faelle').select('fall_nummer').eq('id', termin.fall_id).single()
      const { sendManualWhatsApp } = await import('@/lib/whatsapp')
      const { data: admins } = await svc.from('profiles').select('telefon').eq('rolle', 'admin')
      for (const a of admins ?? []) {
        if (a.telefon) {
          await sendManualWhatsApp(a.telefon,
            `📅 Gegenvorschlag für ${fallData?.fall_nummer ?? 'Fall'}: Gutachter schlägt ${terminStr} vor. Bitte im Dispatching prüfen.`,
            termin.fall_id,
          )
        }
      }
    } catch { /* non-critical */ }
  }

  return { success: true }
}
