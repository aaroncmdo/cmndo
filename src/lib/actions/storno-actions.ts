'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revertCaseBilling } from '@/lib/abrechnung/revert-case-billing'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { revalidatePath } from 'next/cache'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

/**
 * KFZ-150: SV storniert einen Termin/Fall.
 * >= 24h vor Termin: kostenfrei (storno_sv_24h)
 * < 24h: Vertragsstrafe (storno_sv_spaet, Lead-Preis bleibt)
 */
export async function stornoFall(fallId: string, grund: string): Promise<{ success: boolean; typ: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, typ: '', error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, typ: '', error: 'Kein SV-Profil' }

  const db = createAdminClient()
  const { data: fall } = await db.from('v_faelle_mit_aktuellem_termin').select('id, sv_id, sv_termin').eq('id', fallId).eq('sv_id', sv.id).single()
  if (!fall) return { success: false, typ: '', error: 'Fall nicht gefunden' }

  // Check: wie viel Zeit bis zum Termin?
  const terminDate = fall.sv_termin ? new Date(fall.sv_termin) : null
  const hoursUntilTermin = terminDate ? (terminDate.getTime() - Date.now()) / (1000 * 60 * 60) : Infinity

  if (hoursUntilTermin >= 24) {
    // Kostenfrei: Werbebudget zurückbuchen
    await transitionFallStatus(fallId, 'storniert', { grund: `storno_sv_24h: ${grund}`, user_id: user.id })
    await revertCaseBilling(fallId, `storno_sv_24h: ${grund}`, user.id)
    revalidatePath(`/gutachter/fall/${fallId}`)
    return { success: true, typ: 'storno_sv_24h' }
  } else {
    // Vertragsstrafe: Lead-Preis bleibt, KEINE Rückbuchung
    await transitionFallStatus(fallId, 'storniert', { grund: `storno_sv_spaet: ${grund}`, user_id: user.id })
    await db.from('faelle').update({ storno_durch_user_id: user.id }).eq('id', fallId)
    revalidatePath(`/gutachter/fall/${fallId}`)
    return { success: true, typ: 'storno_sv_spaet' }
  }
}

/**
 * KFZ-150: SV meldet Kunde No-Show.
 */
export async function meldeNoShow(fallId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  const db = createAdminClient()

  // KFZ-202: no_show_count inkrementieren
  const { data: fall } = await db.from('faelle')
    .select('no_show_count, lead_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const newCount = ((fall.no_show_count as number) ?? 0) + 1

  const { error } = await db.from('faelle').update({
    no_show_gemeldet_am: new Date().toISOString(),
    no_show_count: newCount,
  }).eq('id', fallId).eq('sv_id', sv.id)

  if (error) return { success: false, error: error.message }

  // KFZ-202: Auto-Storno bei >= 2 No-Shows
  if (newCount >= 2) {
    try {
      await transitionFallStatus(fallId, 'storniert', { grund: `storno_no_show_${newCount}x`, user_id: user.id })
      await revertCaseBilling(fallId, `storno_no_show_${newCount}x`, user.id)
    } catch { /* Transition evtl. nicht moeglich */ }
    revalidatePath(`/gutachter/fall/${fallId}`)
    return { success: true }
  }

  // Admin-Task erstellen (KFZ-151: verknuepft mit case)
  await createLinkedTask({
    fall_id: fallId,
    titel: 'Kunde nicht erschienen — Ersatztermin vermitteln',
    typ: 'dispatch',
    prioritaet: 'dringend',
    faellig_am: new Date(),
    entity_type: 'case',
    entity_id: fallId,
  })

  // KFZ-202: WA an Kunden bei 1x No-Show
  if (fall.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
    if (lead?.telefon) {
      const { sendCommunication } = await import('@/lib/communications/send')
      sendCommunication('no_show_kunde', {
        telefon: lead.telefon,
        vorname: lead.vorname ?? '',
        fall_id: fallId,
      }).catch(() => {})
    }
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  return { success: true }
}

/**
 * KFZ-150: SV reicht Reklamation ein.
 */
export async function einreicheReklamation(data: {
  fallId: string
  grund: 'kein_haftpflichtschaden' | 'bagatelle_unter_750' | 'unvollstaendige_kundendaten' | 'sonstiges'
  begruendung: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  if (data.begruendung.length < 20) return { success: false, error: 'Begründung muss mindestens 20 Zeichen lang sein' }

  const db = createAdminClient()
  const { data: fall } = await db.from('faelle').select('id, sv_id, sv_zugewiesen_am').eq('id', data.fallId).eq('sv_id', sv.id).single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  // 5-Werktage-Frist berechnen
  const zugewiesen = fall.sv_zugewiesen_am ? new Date(fall.sv_zugewiesen_am) : new Date()
  const fristBis = new Date(zugewiesen)
  let werktageCounted = 0
  while (werktageCounted < 5) {
    fristBis.setDate(fristBis.getDate() + 1)
    const day = fristBis.getDay()
    if (day !== 0 && day !== 6) werktageCounted++
  }

  const { data: rekl, error } = await db.from('reklamationen').insert({
    fall_id: data.fallId,
    sv_id: sv.id,
    grund: data.grund,
    begruendung: data.begruendung,
    frist_bis: fristBis.toISOString(),
  }).select('id').single()

  if (error || !rekl) return { success: false, error: error?.message ?? 'Reklamation konnte nicht angelegt werden' }

  // Admin-Task (KFZ-151: verknuepft mit reklamation)
  const { data: fallInfo } = await db.from('faelle').select('fall_nummer').eq('id', data.fallId).single()
  await createLinkedTask({
    fall_id: data.fallId,
    titel: `Reklamation von SV zu Fall ${fallInfo?.fall_nummer ?? data.fallId.slice(0, 8)} prüfen`,
    typ: 'reklamation',
    prioritaet: 'dringend',
    faellig_am: new Date(),
    entity_type: 'reklamation',
    entity_id: rekl.id,
  })

  revalidatePath(`/gutachter/fall/${data.fallId}`)
  return { success: true }
}

/**
 * KFZ-150: Admin entscheidet über Reklamation.
 */
export async function entscheideReklamation(reklamationId: string, entscheidung: 'berechtigt' | 'abgelehnt', adminBegruendung: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { success: false, error: 'Kein Zugriff' }

  const db = createAdminClient()
  const { data: rekl } = await db.from('reklamationen').select('id, fall_id, sv_id, status').eq('id', reklamationId).single()
  if (!rekl) return { success: false, error: 'Reklamation nicht gefunden' }
  if (!['eingereicht', 'pruefung'].includes(rekl.status)) return { success: false, error: 'Reklamation bereits bearbeitet' }

  await db.from('reklamationen').update({
    status: entscheidung,
    bearbeitet_am: new Date().toISOString(),
    bearbeitet_von: user.id,
    admin_begruendung: adminBegruendung,
  }).eq('id', reklamationId)

  if (entscheidung === 'berechtigt') {
    // Rückbuchung triggern
    await transitionFallStatus(rekl.fall_id, 'storniert', { grund: 'storno_reklamation', user_id: user.id })
    await revertCaseBilling(rekl.fall_id, 'storno_reklamation', user.id)
  }

  // KFZ-151: Auto-Resolve aller offenen Tasks zu dieser Reklamation
  await resolveTasksForEntity('reklamation', reklamationId, `Reklamation entschieden: ${entscheidung}`)

  revalidatePath('/admin/reklamationen')
  return { success: true }
}

/**
 * KFZ-150: Admin storniert Fall manuell (Kulanz).
 */
export async function adminStornoFall(fallId: string, grund: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { success: false, error: 'Kein Zugriff' }

  const db = createAdminClient()
  await transitionFallStatus(fallId, 'storniert', { grund: `storno_admin: ${grund}`, user_id: user.id })
  await revertCaseBilling(fallId, `storno_admin: ${grund}`, user.id)

  revalidatePath(`/admin/faelle/${fallId}`)
  return { success: true }
}
