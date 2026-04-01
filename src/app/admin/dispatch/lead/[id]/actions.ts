'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendStatusWhatsApp, sendManualWhatsApp } from '@/lib/whatsapp'

// ─── Manuelle WhatsApp (KFZ-114) ────────────────────────────────────────────

export async function sendWhatsAppFromLead(telefon: string, message: string) {
  await sendManualWhatsApp(telefon, message)
}

// ─── Disqualifizierung (BUG-28) ─────────────────────────────────────────────

export async function disqualifiziereLead(
  leadId: string,
  grund: string,
  notiz: string | null,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'disqualifiziert',
      status: 'disqualifiziert',
      disqualifiziert: true,
      disqualifiziert_grund: grund,
      disqualifiziert_notiz: notiz,
      disqualifiziert_am: now,
      updated_at: now,
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/dispatch/lead/${leadId}`)
  revalidatePath('/admin/dispatch')
}

export async function confirmGutachterTermin(
  leadId: string,
  svId: string,
  termin: string,
  fahrzeugPlz: string,
  fahrzeugAdresse: string,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()
  const terminDate = new Date(termin)
  const endDate = new Date(terminDate.getTime() + 120 * 60 * 1000) // 2h block

  // 1. Update lead with termin info
  const { error: leadErr } = await supabase
    .from('leads')
    .update({
      gutachter_termin: termin,
      wunschtermin: termin,
      fahrzeug_standort_plz: fahrzeugPlz || null,
      fahrzeug_standort_adresse: fahrzeugAdresse || null,
      updated_at: now,
    })
    .eq('id', leadId)

  if (leadErr) throw new Error(`Lead-Update fehlgeschlagen: ${leadErr.message}`)

  // 2. If a fall exists for this lead, update sv_id + sv_termin
  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fall) {
    const { error: fallErr } = await supabase
      .from('faelle')
      .update({
        sv_id: svId,
        sv_termin: termin,
        sv_zugewiesen_am: now,
        gutachter_termin_status: 'bestaetigt',
        status: 'sv-termin',
        updated_at: now,
      })
      .eq('id', fall.id)

    if (fallErr) throw new Error(`Fall-Update fehlgeschlagen: ${fallErr.message}`)
  }

  // 3. Create entry in gutachter_termine (verbindlicher Kalender-Eintrag)
  const { error: terminErr } = await supabase
    .from('gutachter_termine')
    .insert({
      sv_id: svId,
      fall_id: fall?.id ?? null,
      start_zeit: termin,
      end_zeit: endDate.toISOString(),
      status: 'bestaetigt',
    })

  if (terminErr) throw new Error(`Kalender-Eintrag fehlgeschlagen: ${terminErr.message}`)

  // 4. Try to sync to external calendar (fire & forget)
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    const { data: leadData } = await supabase
      .from('leads')
      .select('vorname, nachname')
      .eq('id', leadId)
      .single()

    const kundenName = leadData
      ? `${leadData.vorname ?? ''} ${leadData.nachname ?? ''}`.trim()
      : 'Kunde'

    await fetch(`${origin}/api/kalender-eintragen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sv_id: svId,
        fall_id: fall?.id ?? null,
        start_zeit: termin,
        end_zeit: endDate.toISOString(),
        titel: `Gutachten: ${kundenName}`,
        beschreibung: `KFZ-Begutachtung fuer ${kundenName}. Standort: ${fahrzeugAdresse || fahrzeugPlz}.`,
      }),
    }).catch(() => {})
  } catch {
    // External calendar sync is best-effort
  }

  // 5. Increment paket_faelle_genutzt (or offene_faelle as fallback)
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('offene_faelle, paket_faelle_genutzt')
    .eq('id', svId)
    .single()

  if (sv) {
    await supabase
      .from('sachverstaendige')
      .update({
        offene_faelle: (sv.offene_faelle ?? 0) + 1,
        paket_faelle_genutzt: (sv.paket_faelle_genutzt ?? 0) + 1,
      })
      .eq('id', svId)
  }

  // 6. Create timeline entry
  if (fall) {
    const { data: svProfile } = await supabase
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', svId)
      .single()

    let svName = '—'
    if (svProfile?.profile_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('vorname, nachname')
        .eq('id', svProfile.profile_id)
        .single()
      if (profile) svName = `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || '—'
    }

    const terminStr = new Date(termin).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    await supabase.from('timeline').insert({
      fall_id: fall.id,
      typ: 'system',
      titel: 'Gutachter-Termin vereinbart',
      beschreibung: `Gutachter ${svName} am ${terminStr}. Standort: ${fahrzeugAdresse || fahrzeugPlz}. Termin im Kalender eingetragen.`,
      erstellt_von: user.id,
    })

    // WhatsApp: Gutachter beauftragt + Termin bestaetigt
    const terminDate = new Date(termin)
    sendStatusWhatsApp(fall.id, 'nach_gutachter_dispatch', {
      gutachter_name: svName,
    }).catch(() => {})
    sendStatusWhatsApp(fall.id, 'nach_terminbestaetigung', {
      gutachter_name: svName,
      termin_datum: terminDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      termin_uhrzeit: terminDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      termin_ort: fahrzeugAdresse || fahrzeugPlz,
    }).catch(() => {})
  }

  revalidatePath(`/admin/dispatch/lead/${leadId}`)
  revalidatePath('/admin/dispatch')
}

// ─── Lead-Qualifizierung speichern ─────────────────────────────────────────

export async function saveLeadQualifizierung(
  leadId: string,
  data: Record<string, unknown>,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) throw new Error(`Qualifizierung fehlgeschlagen: ${error.message}`)

  revalidatePath(`/admin/dispatch/lead/${leadId}`)
  revalidatePath('/admin/dispatch')
}

// ─── Rückruftermin (KFZ-37) ─────────────────────────────────────────────────

export async function saveRueckruf(
  leadId: string,
  datum: string | null,
  notiz: string | null,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      rueckruf_datum: datum,
      rueckruf_notiz: notiz,
      rueckruf_erledigt: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/dispatch/lead/${leadId}`)
  revalidatePath('/admin/dispatch')
}

export async function markRueckrufErledigt(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date()
  const zeitStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

  const { error } = await supabase
    .from('leads')
    .update({
      rueckruf_erledigt: true,
      updated_at: now.toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  // Timeline-Eintrag
  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fall) {
    await supabase.from('timeline').insert({
      fall_id: fall.id,
      typ: 'system',
      titel: 'Rückruf durchgeführt',
      beschreibung: `Rückruf durchgeführt um ${zeitStr}.`,
      erstellt_von: user.id,
    })
  }

  revalidatePath(`/admin/dispatch/lead/${leadId}`)
  revalidatePath('/admin/dispatch')
}

// ─── Notiz speichern ────────────────────────────────────────────────────────

export async function saveLeadNotiz(leadId: string, notiz: string | null) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({ notiz, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/dispatch/lead/${leadId}`)
}

export async function handleGegenvorschlag(
  leadId: string,
  terminId: string,
  action: 'accept' | 'reject' | 'new_sv',
  neuerTermin?: string,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  if (action === 'accept' && neuerTermin) {
    // Kunde akzeptiert Gegenvorschlag: Update termin
    const { data: termin } = await supabase
      .from('gutachter_termine')
      .select('sv_id, fall_id')
      .eq('id', terminId)
      .single()

    if (!termin) throw new Error('Termin nicht gefunden')

    const endDate = new Date(new Date(neuerTermin).getTime() + 120 * 60 * 1000)

    await supabase
      .from('gutachter_termine')
      .update({
        start_zeit: neuerTermin,
        end_zeit: endDate.toISOString(),
        status: 'bestaetigt',
      })
      .eq('id', terminId)

    // Update lead + fall
    await supabase
      .from('leads')
      .update({ gutachter_termin: neuerTermin, updated_at: new Date().toISOString() })
      .eq('id', leadId)

    if (termin.fall_id) {
      await supabase
        .from('faelle')
        .update({
          sv_termin: neuerTermin,
          gutachter_termin_status: 'bestaetigt',
          updated_at: new Date().toISOString(),
        })
        .eq('id', termin.fall_id)
    }
  } else if (action === 'reject') {
    // Keine Einigung: Termin stornieren, neuen Gutachter suchen
    await supabase
      .from('gutachter_termine')
      .update({ status: 'storniert' })
      .eq('id', terminId)
  }

  revalidatePath(`/admin/dispatch/lead/${leadId}`)
  revalidatePath('/admin/dispatch')
}
