'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { bestaetigeTermin } from '@/lib/termine/bestaetigung'

export async function sendNachricht(
  fallId: string,
  nachricht: string,
  // AAR-102/AAR-310: nachrichten.kanal CHECK akzeptiert nur die 5 neuen Werte.
  // Legacy 'portal-kunde-claimondo' → 'chat_kb_kunde', 'portal-kunde-gutachter' → 'chat_kunde_sv'.
  kanal: 'chat_kb_kunde' | 'chat_kunde_sv' = 'chat_kb_kunde',
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  if (!nachricht.trim()) throw new Error('Nachricht darf nicht leer sein')

  // KFZ-127: Chat-Routing — empfaenger_id auf den zugewiesenen KB setzen
  let empfaengerId: string | null = null
  try {
    const admin = createAdminClient()
    const { data: fall } = await admin.from('faelle').select('kundenbetreuer_id, sv_id').eq('id', fallId).single()

    if (kanal === 'chat_kb_kunde' && fall?.kundenbetreuer_id) {
      empfaengerId = fall.kundenbetreuer_id
    } else if (kanal === 'chat_kunde_sv' && fall?.sv_id) {
      // SV profile_id als empfaenger
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
      empfaengerId = sv?.profile_id ?? null
    }
  } catch { /* Fallback: kein empfaenger — Admin sieht alles */ }

  const { error } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    kanal,
    sender_id: user.id,
    sender_rolle: 'kunde',
    nachricht: nachricht.trim(),
    empfaenger_id: empfaengerId,
  })

  if (error) throw new Error(error.message)

  // KFZ-129 / AAR-310: Benachrichtigung an empfaenger (KB oder SV).
  // Vorher: Lookup über chat_gruppen/chat_teilnehmer (Tabellen existieren nicht
  // mehr, immer Fallback). Jetzt direkt empfaenger benachrichtigen.
  if (empfaengerId) {
    try {
      const admin = createAdminClient()
      await admin.from('benachrichtigungen').insert({
        user_id: empfaengerId,
        typ: 'nachricht',
        titel: 'Neue Nachricht vom Kunden',
        beschreibung: nachricht.trim().slice(0, 100),
        link: `/admin/faelle/${fallId}`,
      })
    } catch { /* non-critical */ }
  }

  revalidatePath(`/kunde/faelle/${fallId}`)
}

// KFZ-206: Bankdaten für Auszahlung
export async function saveBankdaten(fallId: string, iban: string, bic: string, kontoinhaber: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data: fall } = await supabase.from('faelle').select('id, kunde_id').eq('id', fallId).single()
  if (!fall || fall.kunde_id !== user.id) throw new Error('Nicht autorisiert')

  const { error } = await supabase.from('faelle').update({
    iban, bic: bic || null, kontoinhaber,
    bankdaten_hinterlegt_am: new Date().toISOString(),
  }).eq('id', fallId)
  if (error) throw new Error(error.message)

  await supabase.from('timeline').insert({
    fall_id: fallId, typ: 'system', titel: 'Bankdaten hinterlegt',
    beschreibung: `IBAN: ${iban.slice(0, 4)}****${iban.slice(-4)}, Kontoinhaber: ${kontoinhaber}`,
    erstellt_von: user.id,
  })
  revalidatePath(`/kunde/faelle/${fallId}`)
}

// KFZ-206: Pflichtdokument hochladen (Kunden-Portal)
export async function uploadPflichtdokumentKunde(fallId: string, pflichtdokumentId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('Keine Datei')

  const { data: fall } = await supabase.from('faelle').select('id, kunde_id').eq('id', fallId).single()
  if (!fall || fall.kunde_id !== user.id) throw new Error('Nicht autorisiert')

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `kunden-dokumente/${fallId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await supabase.storage.from('fall-dokumente').upload(path, file)
  if (uploadErr) throw new Error(uploadErr.message)

  const { data: urlData } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
  const { data: pd } = await supabase.from('pflichtdokumente').select('titel').eq('id', pflichtdokumentId).single()

  await supabase.from('pflichtdokumente').update({
    status: 'hochgeladen', datei_url: urlData.publicUrl, datei_name: file.name,
  }).eq('id', pflichtdokumentId)

  // AAR-553: fall_dokumente statt dokumente
  await supabase.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: pd?.titel ?? 'kundendokument',
    storage_path: path,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    kategorie: 'kundendokument',
    quelle: 'kunde',
    hochgeladen_von_user_id: user.id,
    uploaded_by_kunde: true,
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  })
  revalidatePath(`/kunde/faelle/${fallId}`)
}

/**
 * KFZ-192: Kunde wählt einen der vom SV vorgeschlagenen Slots aus.
 * Setzt den Termin auf den gewählten Slot, bestätigt den Termin, und
 * aktualisiert Fall + Lead.
 */
export async function waehleGegenvorschlagSlot(
  fallId: string,
  terminId: string,
  slot: { datum: string; uhrzeit: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    const admin = createAdminClient()

    // Ownership prüfen
    const { data: fall } = await admin.from('faelle').select('id, lead_id, service_typ').eq('id', fallId).single()
    if (!fall) return { success: false, error: 'Fall nicht gefunden' }

    // Termin neu setzen
    const startZeit = `${slot.datum}T${slot.uhrzeit}:00`
    const endZeit = new Date(new Date(startZeit).getTime() + 90 * 60 * 1000).toISOString()

    const { error: updateErr } = await admin
      .from('gutachter_termine')
      .update({
        start_zeit: startZeit,
        end_zeit: endZeit,
        sv_vorgeschlagene_slots: null,
        // status wird durch bestaetigeTermin auf 'bestaetigt' gesetzt
      })
      .eq('id', terminId)

    if (updateErr) return { success: false, error: updateErr.message }

    // Termin bestätigen (setzt status='bestaetigt' + final_verbindlich_ab)
    await bestaetigeTermin(terminId)

    // Fall + Lead aktualisieren
    await admin.from('faelle')
      .update({
        sv_termin: startZeit,
        gutachter_termin_status: 'bestaetigt',
        updated_at: new Date().toISOString(),
      })
      .eq('id', fallId)

    if (fall.lead_id) {
      await admin.from('leads')
        .update({ gutachter_termin: startZeit, updated_at: new Date().toISOString() })
        .eq('id', fall.lead_id as string)
    }

    // KFZ-136: Reminder generieren
    try {
      const { generateReminderForTermin } = await import('@/lib/reminders/generate')
      await generateReminderForTermin(terminId)
    } catch (err) { console.error('[KFZ-136] Reminder-Gen Gegenvorschlag:', err) }

    revalidatePath(`/kunde/faelle/${fallId}`)
    return { success: true }
  } catch (err) {
    console.error('[waehleGegenvorschlagSlot]', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// KFZ-206: Zahlungsweg-Auswahl durch Kunden
export async function updateZahlungsweg(
  fallId: string,
  zahlungsweg: string,
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false }

  const admin = createAdminClient()
  const { data: fall } = await admin.from('faelle').select('id, kunde_id').eq('id', fallId).single()
  if (!fall || fall.kunde_id !== user.id) return { success: false }

  await admin.from('faelle').update({ zahlungsweg }).eq('id', fallId)
  await admin.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `Zahlungsweg gewählt: ${zahlungsweg === 'kundenkonto' ? 'Kundenkonto' : 'Werkstatt direkt'}`,
  })

  revalidatePath(`/kunde/faelle/${fallId}`)
  return { success: true }
}
