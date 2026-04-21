'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function requireAuth() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  return { supabase, userId: user.id }
}

/** Pre-Call Briefing generieren */
export async function getCallBriefing(opts: { fallId?: string; leadId?: string }): Promise<string> {
  await requireAuth()
  const { getPreCallBriefing } = await import('@/lib/copilot/briefing')
  const result = await getPreCallBriefing(opts)
  return result.briefing
}

/** Outbound-Call starten */
export async function startCall(opts: {
  fallId?: string
  leadId?: string
  telefon: string
}): Promise<{ callId: string }> {
  const { userId } = await requireAuth()
  const db = createAdminClient()

  // Aircall User-ID ermitteln (vereinfacht: erster User)
  let aircallUserId = 0
  try {
    const { getUsers } = await import('@/lib/aircall/client')
    const users = await getUsers()
    if (users.length > 0) aircallUserId = users[0].id
  } catch (err) {
    console.error('[KFZ-143] Aircall Users laden fehlgeschlagen:', err)
  }

  // Call in DB anlegen
  const tempAircallId = `pending_${Date.now()}`
  const { data: call, error } = await db.from('calls').insert({
    aircall_call_id: tempAircallId,
    fall_id: opts.fallId ?? null,
    lead_id: opts.leadId ?? null,
    initiator_user_id: userId,
    richtung: 'outbound',
    status: 'initiiert',
    zu_nummer: opts.telefon,
    gestartet_am: new Date().toISOString(),
  }).select('id').single()

  if (error) throw new Error(error.message)

  // Aircall Call starten (fire & forget — Update kommt via Webhook)
  if (aircallUserId > 0) {
    try {
      const { startOutboundCall } = await import('@/lib/aircall/client')
      const result = await startOutboundCall({ userId: aircallUserId, toNumber: opts.telefon })
      // Update mit echtem Aircall-ID
      await db.from('calls').update({ aircall_call_id: String(result.id) }).eq('id', call!.id)
    } catch (err) {
      console.error('[KFZ-143] Aircall startOutboundCall fehlgeschlagen:', err)
      await db.from('calls').update({ status: 'failed' }).eq('id', call!.id)
    }
  }

  if (opts.fallId) revalidatePath(`/faelle/${opts.fallId}`)
  return { callId: call!.id }
}

/** Call-Notiz speichern */
export async function saveCallNotiz(callId: string, notiz: string): Promise<void> {
  await requireAuth()
  const db = createAdminClient()
  const { error } = await db.from('calls').update({ notiz, updated_at: new Date().toISOString() }).eq('id', callId)
  if (error) throw new Error(error.message)
}

/** Calls für einen Fall/Lead laden */
export async function getCallsForFall(fallId: string) {
  await requireAuth()
  const db = createAdminClient()
  const { data } = await db.from('calls')
    .select('id, aircall_call_id, richtung, status, zu_nummer, gestartet_am, beendet_am, dauer_sekunden, ki_zusammenfassung, ki_naechste_schritte, notiz, sentiment')
    .eq('fall_id', fallId)
    .order('created_at', { ascending: false })
  return data ?? []
}
