'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { postChatSystemMessage } from '@/lib/chat/system-messages'
import { generateReminderForTermin, cancelRemindersForTermin } from '@/lib/reminders/generate'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { revalidatePath } from 'next/cache'

type ActionResult = { success: boolean; error?: string }

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDatumDE(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function getSvName(admin: ReturnType<typeof createAdminClient>, svId: string): Promise<string> {
  const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
  if (!sv?.profile_id) return 'Unbekannt'
  const { data: p } = await admin.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
  return p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || 'Unbekannt' : 'Unbekannt'
}

async function getKundeName(admin: ReturnType<typeof createAdminClient>, kundeId: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('vorname, nachname').eq('id', kundeId).single()
  return p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || 'Unbekannt' : 'Unbekannt'
}

function revalidateTerminPaths(fallId: string) {
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath('/kunde')
  revalidatePath(`/admin/faelle/${fallId}`)
}

// ─── AUTH: SV Portal ────────────────────────────────────────────────────────

async function authSvPortal(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { error: 'Kein SV-Profil' }
  const { data: fall } = await supabase.from('faelle').select('id, sv_id').eq('id', fallId).eq('sv_id', sv.id).single()
  if (!fall) return { error: 'Fall nicht gefunden' }
  return { userId: user.id, svId: sv.id, fallId: fall.id }
}

// ─── AUTH: SV Token ─────────────────────────────────────────────────────────

async function authSvToken(token: string) {
  const svc = createServiceClient()
  const { data: termin } = await svc
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, start_zeit, status')
    .eq('ablehnen_token', token)
    .maybeSingle()
  if (!termin) return { error: 'Token ungültig' }
  if (!['reserviert', 'gegenvorschlag'].includes(termin.status)) {
    return { error: `Aktion im Status "${termin.status}" nicht möglich` }
  }
  return { terminId: termin.id, svId: termin.sv_id, fallId: termin.fall_id, startZeit: termin.start_zeit, status: termin.status }
}

// ─── AUTH: Kunde Portal ─────────────────────────────────────────────────────

async function authKundePortal(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }
  const admin = createAdminClient()
  const { data: fall } = await admin.from('faelle').select('id, kunde_id, sv_id, lead_id').eq('id', fallId).single()
  if (!fall) return { error: 'Fall nicht gefunden' }
  // Ownership: kunde_id oder lead-email
  if (fall.kunde_id !== user.id) {
    if (fall.lead_id) {
      const { data: lead } = await admin.from('leads').select('email').eq('id', fall.lead_id).single()
      if (lead?.email !== user.email) return { error: 'Kein Zugriff' }
    } else {
      return { error: 'Kein Zugriff' }
    }
  }
  return { userId: user.id, fallId: fall.id, svId: fall.sv_id }
}

// ─── 1. terminAblehnen ─────────────────────────────────────────────────────

export async function terminAblehnen({
  terminId,
  grund,
  source,
  token,
  fallId: fallIdArg,
}: {
  terminId?: string
  grund: string
  source: 'sv_portal' | 'sv_token'
  token?: string
  fallId?: string
}): Promise<ActionResult> {
  const admin = createAdminClient()
  let tId: string
  let svId: string
  let fId: string
  let startZeit: string | null = null

  if (source === 'sv_token' && token) {
    const auth = await authSvToken(token)
    if ('error' in auth) return { success: false, error: auth.error }
    tId = auth.terminId
    svId = auth.svId
    fId = auth.fallId
    startZeit = auth.startZeit
  } else if (source === 'sv_portal' && fallIdArg) {
    const auth = await authSvPortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    // Find the active termin for this fall
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id, start_zeit')
      .eq('fall_id', fallIdArg)
      .eq('sv_id', auth.svId)
      .in('status', ['reserviert', 'gegenvorschlag'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Termin gefunden' }
    tId = termin.id
    svId = auth.svId
    fId = fallIdArg
    startZeit = termin.start_zeit
  } else {
    return { success: false, error: 'Ungültige Parameter' }
  }

  // 1. DB Update
  const { error: updateErr } = await admin.from('gutachter_termine').update({
    status: 'abgelehnt',
    abgelehnt_am: new Date().toISOString(),
    abgelehnt_grund: grund || 'Ohne Begründung',
  }).eq('id', tId)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Reminder stornieren
  try { await cancelRemindersForTermin(tId) } catch (err) { console.error('[KFZ-136] Reminder-Cancel fehlgeschlagen:', err) }

  // 2. Fall updaten
  await admin.from('faelle').update({
    sv_id: null,
    gutachter_termin_status: 'abgelehnt',
    updated_at: new Date().toISOString(),
  }).eq('id', fId)

  // 3. Timeline
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: 'Gutachter hat Termin abgelehnt',
    beschreibung: `Grund: ${grund || 'Nicht angegeben'}. Neuer Gutachter wird gesucht.`,
  })

  // 4. Chat System-Message
  const svName = await getSvName(admin, svId)
  const terminDatum = startZeit ? formatDatumDE(startZeit) : '?'
  const grundText = grund ? ` Grund: "${grund}"` : ''
  await postChatSystemMessage({
    fallId: fId,
    text: `❌ Sachverständiger ${svName} hat den Termin am ${terminDatum} abgelehnt.${grundText}`,
    event: 'termin_abgelehnt',
  })

  // 5. Notifications: Kunde + Admin
  try {
    const { data: fallData } = await admin.from('faelle').select('fall_nummer, kundenbetreuer_id, kunde_id').eq('id', fId).single()
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    // Kunde benachrichtigen
    if (fallData?.kunde_id) {
      const { data: kundeProfile } = await admin.from('profiles').select('telefon').eq('id', fallData.kunde_id).single()
      if (kundeProfile?.telefon) {
        await sendManualWhatsApp(kundeProfile.telefon,
          `⚠️ Der Sachverständige hat den Termin am ${terminDatum} für Ihren Fall ${fallData?.fall_nummer ?? ''} abgelehnt. Wir suchen umgehend einen neuen Gutachter für Sie.`,
          fId)
      }
    }

    // Admin benachrichtigen
    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `⚠️ Gutachter ${svName} hat den Termin am ${terminDatum} für ${fallData?.fall_nummer ?? 'Fall'} ABGELEHNT. Bitte neuen Gutachter zuweisen.`,
          fId)
      }
    }

    // Task erstellen (KFZ-151: verknuepft mit case)
    const { createLinkedTask } = await import('@/lib/tasks/create-task')
    await createLinkedTask({
      fall_id: fId,
      titel: `Neuen Gutachter zuweisen für ${fallData?.fall_nummer ?? 'Fall'}`,
      typ: 'dispatch',
      prioritaet: 'dringend',
      faellig_am: new Date(),
      zugewiesen_an: fallData?.kundenbetreuer_id ?? null,
      entity_type: 'case',
      entity_id: fId,
    })
  } catch { /* non-critical */ }

  revalidateTerminPaths(fId)
  return { success: true }
}

// ─── 2. terminGegenvorschlag ────────────────────────────────────────────────

export async function terminGegenvorschlag({
  terminId,
  neuesDatum,
  grund,
  source,
  token,
  fallId: fallIdArg,
}: {
  terminId?: string
  neuesDatum: string
  grund: string
  source: 'sv_portal' | 'sv_token' | 'kunde'
  token?: string
  fallId?: string
}): Promise<ActionResult> {
  const admin = createAdminClient()
  let tId: string
  let fId: string
  let svId: string | null = null
  let kundeId: string | null = null
  const vonWem: 'sv' | 'kunde' = source === 'kunde' ? 'kunde' : 'sv'

  if (source === 'sv_token' && token) {
    const auth = await authSvToken(token)
    if ('error' in auth) return { success: false, error: auth.error }
    tId = auth.terminId
    fId = auth.fallId
    svId = auth.svId
  } else if (source === 'sv_portal' && fallIdArg) {
    const auth = await authSvPortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id')
      .eq('fall_id', fallIdArg)
      .eq('sv_id', auth.svId)
      .in('status', ['reserviert', 'gegenvorschlag'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Termin gefunden' }
    tId = termin.id
    fId = fallIdArg
    svId = auth.svId
  } else if (source === 'kunde' && fallIdArg) {
    const auth = await authKundePortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    kundeId = auth.userId
    fId = auth.fallId
    svId = auth.svId
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id')
      .eq('fall_id', fallIdArg)
      .eq('status', 'gegenvorschlag')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Gegenvorschlag gefunden' }
    tId = termin.id
  } else {
    return { success: false, error: 'Ungültige Parameter' }
  }

  const neueStartZeit = new Date(neuesDatum)
  const neueEndZeit = new Date(neueStartZeit.getTime() + 90 * 60 * 1000)

  // 1. DB Update
  const { error: updateErr } = await admin.from('gutachter_termine').update({
    status: 'gegenvorschlag',
    vorgeschlagenes_datum: neueStartZeit.toISOString(),
    gegenvorschlag_grund: grund || null,
    gegenvorschlag_von: vonWem,
  }).eq('id', tId)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Bestehende Reminder stornieren (Termin noch nicht final)
  try { await cancelRemindersForTermin(tId) } catch (err) { console.error('[KFZ-136] Reminder-Cancel fehlgeschlagen:', err) }

  // 2. Fall updaten
  await admin.from('faelle').update({
    gutachter_termin_status: 'gegenvorschlag',
    updated_at: new Date().toISOString(),
  }).eq('id', fId)

  // 3. Timeline
  const terminStr = formatDatumDE(neueStartZeit.toISOString())
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: vonWem === 'sv' ? 'Gutachter hat Gegenvorschlag gemacht' : 'Kunde hat Gegenvorschlag gemacht',
    beschreibung: `Neuer Terminvorschlag: ${terminStr}.${grund ? ` Grund: ${grund}` : ''}`,
  })

  // 4. Chat System-Message
  let rollenName: string
  if (vonWem === 'sv' && svId) {
    const name = await getSvName(admin, svId)
    rollenName = `Sachverständiger ${name}`
  } else if (vonWem === 'kunde' && kundeId) {
    const name = await getKundeName(admin, kundeId)
    rollenName = `Kunde ${name}`
  } else {
    rollenName = vonWem === 'sv' ? 'Sachverständiger' : 'Kunde'
  }

  const grundText = grund ? ` Grund: "${grund}"` : ''
  await postChatSystemMessage({
    fallId: fId,
    text: `📅 ${rollenName} hat einen neuen Termin vorgeschlagen: ${terminStr}.${grundText}`,
    event: 'termin_gegenvorschlag',
  })

  // 5. Notifications
  try {
    const { data: fallData } = await admin.from('faelle').select('fall_nummer, kunde_id').eq('id', fId).single()
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    if (vonWem === 'sv') {
      // Notification an Kunde
      if (fallData?.kunde_id) {
        const { data: kundeProfile } = await admin.from('profiles').select('telefon').eq('id', fallData.kunde_id).single()
        if (kundeProfile?.telefon) {
          await sendManualWhatsApp(kundeProfile.telefon,
            `📅 Der Sachverständige schlägt einen neuen Termin vor: ${terminStr}. Bitte prüfen Sie den Vorschlag in Ihrem Portal.`,
            fId)
        }
      }
    } else {
      // Notification an SV
      if (svId) {
        const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
        if (sv?.profile_id) {
          const { data: svProfile } = await admin.from('profiles').select('telefon').eq('id', sv.profile_id).single()
          if (svProfile?.telefon) {
            await sendManualWhatsApp(svProfile.telefon,
              `📅 Kunde schlägt stattdessen ${terminStr} vor für Fall ${fallData?.fall_nummer ?? ''}. Bitte prüfen Sie den Vorschlag im Portal.`,
              fId)
          }
        }
      }
    }

    // Admin Info
    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `ℹ️ Gegenvorschlag für ${fallData?.fall_nummer ?? 'Fall'}: ${rollenName} schlägt ${terminStr} vor.`,
          fId)
      }
    }
  } catch { /* non-critical */ }

  revalidateTerminPaths(fId)
  return { success: true }
}

// ─── 3. terminAnnehmen ──────────────────────────────────────────────────────

export async function terminAnnehmen({
  terminId,
  source,
  fallId: fallIdArg,
}: {
  terminId?: string
  source: 'kunde' | 'sv_portal'
  fallId?: string
}): Promise<ActionResult> {
  const admin = createAdminClient()
  let fId: string
  let tId: string
  let svId: string | null = null

  if (source === 'kunde' && fallIdArg) {
    const auth = await authKundePortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    fId = auth.fallId
    svId = auth.svId
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id, vorgeschlagenes_datum')
      .eq('fall_id', fId)
      .eq('status', 'gegenvorschlag')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Gegenvorschlag gefunden' }
    tId = termin.id

    // start_zeit = vorgeschlagenes_datum
    const neueStartZeit = termin.vorgeschlagenes_datum ? new Date(termin.vorgeschlagenes_datum) : null
    const updateData: Record<string, unknown> = {
      status: 'bestaetigt',
      gegenvorschlag_von: null,
    }
    if (neueStartZeit) {
      updateData.start_zeit = neueStartZeit.toISOString()
      updateData.end_zeit = new Date(neueStartZeit.getTime() + 90 * 60 * 1000).toISOString()
    }
    const { error: updateErr } = await admin.from('gutachter_termine').update(updateData).eq('id', tId)
    if (updateErr) return { success: false, error: updateErr.message }
  } else if (source === 'sv_portal' && fallIdArg) {
    const auth = await authSvPortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    fId = auth.fallId
    svId = auth.svId
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id, vorgeschlagenes_datum')
      .eq('fall_id', fId)
      .eq('sv_id', auth.svId)
      .eq('status', 'gegenvorschlag')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Gegenvorschlag gefunden' }
    tId = termin.id

    const neueStartZeit = termin.vorgeschlagenes_datum ? new Date(termin.vorgeschlagenes_datum) : null
    const updateData: Record<string, unknown> = {
      status: 'bestaetigt',
      gegenvorschlag_von: null,
    }
    if (neueStartZeit) {
      updateData.start_zeit = neueStartZeit.toISOString()
      updateData.end_zeit = new Date(neueStartZeit.getTime() + 90 * 60 * 1000).toISOString()
    }
    const { error: updateErr } = await admin.from('gutachter_termine').update(updateData).eq('id', tId)
    if (updateErr) return { success: false, error: updateErr.message }
  } else {
    return { success: false, error: 'Ungültige Parameter' }
  }

  // KFZ-136: Reminder neu generieren (Termin ist jetzt bestaetigt)
  try { await generateReminderForTermin(tId) } catch (err) { console.error('[KFZ-136] Reminder-Generierung fehlgeschlagen:', err) }

  // KFZ-137: SV Auftragszusammenfassung Email
  try {
    const { sendSvAuftragszusammenfassung } = await import('@/lib/email/google/flows')
    if (svId) await sendSvAuftragszusammenfassung(fId, svId)
  } catch (err) { console.error('[KFZ-137] SV-Email fehlgeschlagen:', err) }

  // KFZ-151: Auto-Resolve aller offenen Termin-Tasks (z.B. "Termin bestaetigen")
  try { await resolveTasksForEntity('termin', tId, 'Termin bestaetigt') } catch (err) { console.error('[KFZ-151] resolveTasks termin:', err) }

  // Fall updaten
  await admin.from('faelle').update({
    gutachter_termin_status: 'bestaetigt',
    updated_at: new Date().toISOString(),
  }).eq('id', fId)

  // Timeline
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: source === 'kunde' ? 'Kunde hat Terminvorschlag angenommen' : 'Gutachter hat Kunden-Vorschlag angenommen',
    beschreibung: 'Termin ist jetzt bestätigt.',
  })

  // KEINE Chat-System-Message bei Annahme (laut Ticket)

  // Notifications
  try {
    const { data: fallData } = await admin.from('faelle').select('fall_nummer, kunde_id').eq('id', fId).single()
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    if (source === 'kunde' && svId) {
      // Notification an SV
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
      if (sv?.profile_id) {
        const { data: svProfile } = await admin.from('profiles').select('telefon').eq('id', sv.profile_id).single()
        if (svProfile?.telefon) {
          const { data: termin } = await admin.from('gutachter_termine').select('start_zeit').eq('fall_id', fId).eq('status', 'bestaetigt').single()
          const terminStr = termin?.start_zeit ? formatDatumDE(termin.start_zeit) : ''
          await sendManualWhatsApp(svProfile.telefon,
            `✅ Kunde akzeptiert ${terminStr} für Fall ${fallData?.fall_nummer ?? ''}.`,
            fId)
        }
      }
    } else if (source === 'sv_portal' && fallData?.kunde_id) {
      // Notification an Kunde
      const { data: kundeProfile } = await admin.from('profiles').select('telefon').eq('id', fallData.kunde_id).single()
      if (kundeProfile?.telefon) {
        const { data: termin } = await admin.from('gutachter_termine').select('start_zeit').eq('fall_id', fId).eq('status', 'bestaetigt').single()
        const terminStr = termin?.start_zeit ? formatDatumDE(termin.start_zeit) : ''
        await sendManualWhatsApp(kundeProfile.telefon,
          `✅ Der Sachverständige akzeptiert Ihren Terminvorschlag: ${terminStr}.`,
          fId)
      }
    }

    // Admin Info
    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `ℹ️ Termin für ${fallData?.fall_nummer ?? 'Fall'} wurde bestätigt.`,
          fId)
      }
    }
  } catch { /* non-critical */ }

  revalidateTerminPaths(fId)
  return { success: true }
}

// ─── 4. terminBuchen (Kunde wählt Slot aus SV-Kalender) ───────────────────

export async function terminBuchen({
  terminId,
  slot,
  source,
  fallId: fallIdArg,
}: {
  terminId?: string
  slot: string
  source: 'kunde_kalender'
  fallId?: string
}): Promise<ActionResult> {
  if (!fallIdArg) return { success: false, error: 'Ungültige Parameter' }

  const auth = await authKundePortal(fallIdArg)
  if ('error' in auth) return { success: false, error: auth.error }

  const admin = createAdminClient()
  const fId = auth.fallId
  const svId = auth.svId

  // Find the active termin
  const { data: termin } = await admin.from('gutachter_termine')
    .select('id')
    .eq('fall_id', fId)
    .in('status', ['gegenvorschlag', 'reserviert'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!termin) return { success: false, error: 'Kein aktiver Termin gefunden' }

  const slotDate = new Date(slot)
  const endDate = new Date(slotDate.getTime() + 90 * 60 * 1000)

  // 1. DB Update
  const { error: updateErr } = await admin.from('gutachter_termine').update({
    status: 'bestaetigt',
    start_zeit: slotDate.toISOString(),
    end_zeit: endDate.toISOString(),
    gegenvorschlag_von: null,
  }).eq('id', termin.id)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Reminder generieren (Termin gebucht)
  try { await generateReminderForTermin(termin.id) } catch (err) { console.error('[KFZ-136] Reminder-Generierung fehlgeschlagen:', err) }

  // KFZ-137: SV Auftragszusammenfassung Email
  try {
    const { sendSvAuftragszusammenfassung } = await import('@/lib/email/google/flows')
    if (svId) await sendSvAuftragszusammenfassung(fId, svId)
  } catch (err) { console.error('[KFZ-137] SV-Email fehlgeschlagen:', err) }

  // 2. Fall updaten
  await admin.from('faelle').update({
    gutachter_termin_status: 'bestaetigt',
    sv_termin: slotDate.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', fId)

  // 3. Timeline
  const terminStr = formatDatumDE(slotDate.toISOString())
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: 'Kunde hat Termin aus SV-Kalender gebucht',
    beschreibung: `Verbindlich gebucht: ${terminStr}`,
  })

  // KEINE Chat-System-Message bei Buchung (laut Ticket)

  // Notifications an SV + Admin
  try {
    const { data: fallData } = await admin.from('faelle').select('fall_nummer').eq('id', fId).single()
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    if (svId) {
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
      if (sv?.profile_id) {
        const { data: svProfile } = await admin.from('profiles').select('telefon').eq('id', sv.profile_id).single()
        if (svProfile?.telefon) {
          await sendManualWhatsApp(svProfile.telefon,
            `✅ Kunde hat verbindlich ${terminStr} gebucht für Fall ${fallData?.fall_nummer ?? ''}.`,
            fId)
        }
      }
    }

    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `ℹ️ Kunde hat Termin ${terminStr} für ${fallData?.fall_nummer ?? 'Fall'} aus SV-Kalender gebucht.`,
          fId)
      }
    }
  } catch { /* non-critical */ }

  revalidateTerminPaths(fId)
  return { success: true }
}
