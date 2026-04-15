'use server'

// AAR-126: Server Action für Polizeibericht-Upload durch den SV.
// AAR-134: Server Actions für SV-Termin-Ablehnung + Gegenvorschlag.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'

// ─── AAR-134: SV-Termin ablehnen ──────────────────────────────────────────

export async function svAblehneTermin(
  terminId: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  if (!grund || grund.trim().length < 10) {
    return { success: false, error: 'Bitte mindestens 10 Zeichen Begründung angeben.' }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  const adminDb = createAdminClient()
  const { data: termin } = await adminDb
    .from('gutachter_termine')
    .select('id, sv_id, status, lead_id, fall_id')
    .eq('id', terminId)
    .single()

  if (!termin) return { success: false, error: 'Termin nicht gefunden' }
  if (termin.sv_id !== sv.id) return { success: false, error: 'Nicht autorisiert' }
  if (!['reserviert', 'bestaetigt'].includes(termin.status)) {
    return { success: false, error: `Termin kann im Status "${termin.status}" nicht abgelehnt werden` }
  }

  const { error } = await adminDb
    .from('gutachter_termine')
    .update({
      status: 'abgelehnt',
      sv_ablehnung_grund: grund.trim(),
      sv_ablehnung_am: new Date().toISOString(),
    })
    .eq('id', terminId)

  if (error) return { success: false, error: error.message }

  // Dispatcher-Email (non-blocking)
  try {
    const { sendDispatcherTerminAbgelehnt } = await import('@/lib/email/google/flows')
    await sendDispatcherTerminAbgelehnt(terminId, grund.trim())
  } catch (err) {
    console.warn('[svAblehneTermin] Dispatcher-Email fehlgeschlagen:', err)
  }

  // Timeline — typ='termin', scope auf fall_id ODER lead_id
  await adminDb.from('timeline').insert({
    fall_id: termin.fall_id ?? null,
    lead_id: !termin.fall_id ? termin.lead_id : null,
    typ: 'termin',
    titel: 'SV hat Termin abgelehnt',
    beschreibung: `Grund: ${grund.trim()}`,
    erstellt_von: user.id,
  }).then(() => {}, () => {})

  revalidatePath('/gutachter/termine')
  revalidatePath(`/gutachter/termine/${terminId}`)
  revalidatePath('/dispatch/leads')
  if (termin.lead_id) revalidatePath(`/dispatch/leads/${termin.lead_id}`)

  return { success: true }
}

// ─── AAR-134: SV-Gegenvorschlag ──────────────────────────────────────────

export type GegenvorschlagSlot = { start: string; end: string }

export async function svGegenvorschlagTermin(
  terminId: string,
  slots: GegenvorschlagSlot[],
  begruendung?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > 5) {
    return { success: false, error: 'Bitte 1-5 alternative Termine vorschlagen.' }
  }

  // Slot-Validierung: start < end, start in Zukunft
  const now = Date.now()
  for (const [i, slot] of slots.entries()) {
    const start = new Date(slot.start).getTime()
    const end = new Date(slot.end).getTime()
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return { success: false, error: `Slot ${i + 1}: ungültiges Datum` }
    }
    if (start >= end) {
      return { success: false, error: `Slot ${i + 1}: Start muss vor Ende liegen` }
    }
    if (start < now) {
      return { success: false, error: `Slot ${i + 1}: Termin liegt in der Vergangenheit` }
    }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  const adminDb = createAdminClient()
  const { data: termin } = await adminDb
    .from('gutachter_termine')
    .select('id, sv_id, status, lead_id, fall_id')
    .eq('id', terminId)
    .single()

  if (!termin) return { success: false, error: 'Termin nicht gefunden' }
  if (termin.sv_id !== sv.id) return { success: false, error: 'Nicht autorisiert' }
  if (!['reserviert', 'bestaetigt'].includes(termin.status)) {
    return { success: false, error: `Termin kann im Status "${termin.status}" nicht geändert werden` }
  }

  const { error } = await adminDb
    .from('gutachter_termine')
    .update({
      status: 'gegenvorschlag',
      sv_vorgeschlagene_slots: slots,
      sv_ablehnung_grund: begruendung?.trim() || null,
      sv_ablehnung_am: new Date().toISOString(),
    })
    .eq('id', terminId)

  if (error) return { success: false, error: error.message }

  try {
    const { sendDispatcherGegenvorschlag } = await import('@/lib/email/google/flows')
    await sendDispatcherGegenvorschlag(terminId, slots, begruendung?.trim() || null)
  } catch (err) {
    console.warn('[svGegenvorschlagTermin] Dispatcher-Email fehlgeschlagen:', err)
  }

  await adminDb.from('timeline').insert({
    fall_id: termin.fall_id ?? null,
    lead_id: !termin.fall_id ? termin.lead_id : null,
    typ: 'termin',
    titel: 'SV hat Gegenvorschlag gemacht',
    beschreibung: `${slots.length} alternative Termine vorgeschlagen.${begruendung ? ' Begründung: ' + begruendung.trim() : ''}`,
    erstellt_von: user.id,
  }).then(() => {}, () => {})

  revalidatePath('/gutachter/termine')
  revalidatePath(`/gutachter/termine/${terminId}`)
  revalidatePath('/dispatch/leads')
  if (termin.lead_id) revalidatePath(`/dispatch/leads/${termin.lead_id}`)

  return { success: true }
}

// ─── AAR-126: Polizeibericht-Upload ──────────────────────────────────────

export async function uploadPolizeiberichtAsSv(
  fallId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const file = formData.get('file') as File | null
  const aktenzeichen = (formData.get('aktenzeichen') as string | null)?.trim() || null

  if (!file || file.size === 0) {
    return { success: false, error: 'Keine Datei ausgewählt' }
  }

  // Auth: SV muss für diesen Fall zuständig sein.
  // Robusterer Check: entweder via faelle.sv_id ODER via gutachter_termine.sv_id
  // (für Pre-FlowLink-Termine wo der Termin SV-zugewiesen ist aber der Fall
  // noch keinen sv_id hat — siehe AAR-115 Reservierungs-Flow)
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein Sachverständigen-Profil' }

  const adminDb = createAdminClient()
  const { data: fall } = await adminDb
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .single()

  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  let svIstZustaendig = fall.sv_id === sv.id
  if (!svIstZustaendig) {
    const { data: terminMatch } = await adminDb
      .from('gutachter_termine')
      .select('id')
      .eq('fall_id', fallId)
      .eq('sv_id', sv.id)
      .limit(1)
      .maybeSingle()
    svIstZustaendig = !!terminMatch
  }
  if (!svIstZustaendig) {
    return { success: false, error: 'SV nicht für diesen Fall zugewiesen' }
  }

  // Storage-Upload
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `gutachter/${fallId}/polizeibericht_${Date.now()}.${ext}`
  const { error: uploadErr } = await adminDb.storage
    .from('dokumente')
    .upload(path, file)
  if (uploadErr) return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  const { data: urlData } = adminDb.storage.from('dokumente').getPublicUrl(path)
  const dokumentUrl = urlData.publicUrl

  // Pflichtdokumente-Row updaten ODER neu anlegen (für Pre-AAR-125 Fälle)
  const { data: existing } = await adminDb
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', fallId)
    .eq('dokument_typ', 'polizeibericht')
    .maybeSingle()

  if (existing?.id) {
    const { error: upErr } = await adminDb
      .from('pflichtdokumente')
      .update({
        dokument_url: dokumentUrl,
        hochgeladen_am: new Date().toISOString(),
        status: 'hochgeladen',
        quelle: 'sachverstaendiger',
      })
      .eq('id', existing.id)
    if (upErr) return { success: false, error: `pflichtdokumente-Update: ${upErr.message}` }
  } else {
    // Backfill: row hat gefehlt (z.B. Pre-AAR-125 Fall)
    const { error: insErr } = await adminDb.from('pflichtdokumente').insert({
      fall_id: fallId,
      dokument_typ: 'polizeibericht',
      pflicht: true,
      status: 'hochgeladen',
      quelle: 'sachverstaendiger',
      dokument_url: dokumentUrl,
      hochgeladen_am: new Date().toISOString(),
    })
    if (insErr) return { success: false, error: `pflichtdokumente-Insert: ${insErr.message}` }
  }

  // dokumente-Row für Fallakte-Übersicht (gleicher Pattern wie uploadDokument)
  await adminDb.from('dokumente').insert({
    fall_id: fallId,
    typ: 'polizeibericht',
    datei_url: dokumentUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    kategorie: 'kundendokument',
    quelle: 'gutachter',
    hochgeladen_von: user.id,
    hochgeladen_von_rolle: 'sachverstaendiger',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  }).then(() => {}, () => {})

  // Aktenzeichen optional in faelle nachpflegen wenn vorhanden
  if (aktenzeichen) {
    await adminDb
      .from('faelle')
      .update({ polizei_aktenzeichen: aktenzeichen })
      .eq('id', fallId)
  }

  // Timeline-Eintrag
  await adminDb.from('timeline').insert({
    fall_id: fallId,
    typ: 'dokument',
    titel: 'Polizeibericht vor Ort aufgenommen',
    beschreibung: aktenzeichen
      ? `Der Sachverständige hat den Polizeibericht vor Ort eingeholt. Aktenzeichen: ${aktenzeichen}`
      : 'Der Sachverständige hat den Polizeibericht vor Ort eingeholt.',
    erstellt_von: user.id,
  }).then(() => {}, () => {})

  revalidatePath(`/gutachter/termine/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/kunde')
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/admin/faelle/${fallId}`)

  return { success: true }
}
