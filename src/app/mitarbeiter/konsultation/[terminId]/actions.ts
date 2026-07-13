'use server'

// AAR-956: KB-Konsultations-Actions. service-role + Ownership-Gate
// (gutachter_termine.kb_id===user.id), weil der KB keinen RLS-Pfad auf
// claim-lose Abbrecher-Leads hat (siehe Design-Spec). gutachter_termine-Queries
// nutzen .eq('id') + JS-Gate (termin-engine-contract-safe).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { revalidatePath } from 'next/cache'
import type { KonsultationDisposition } from './types'
import { syncKbTerminOut } from '@/lib/termine/kb-termin-sync'

const BERATUNG_DAUER_MIN = 30

// Service-role-Lookup + Ownership-Gate: liefert {admin, termin, leadId} NUR wenn
// der Termin dem aufrufenden KB gehört (kb_beratung + kb_id==userId). Sonst null.
async function ladeEigenenKbTermin(terminId: string, userId: string) {
  const admin = createAdminClient()
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, typ, kb_id, lead_id, start_zeit, status, notiz_intern')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin || termin.typ !== 'kb_beratung' || termin.kb_id !== userId) return null
  return { admin, termin, leadId: (termin.lead_id as string | null) ?? null }
}

export async function sendeKonsultationsFlowLink(
  terminId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const ctx = await ladeEigenenKbTermin(terminId, user.id)
  if (!ctx) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }
  if (!ctx.leadId) return { ok: false, error: 'Kein Lead am Termin' }

  const res = await sendFlowLinkMultiChannelCore(ctx.admin, ctx.leadId, kanal, user.id)
  if (!res.success) return { ok: false, error: res.error }

  revalidatePath(`/mitarbeiter/konsultation/${terminId}`)
  revalidatePath('/mitarbeiter/termine')
  return { ok: true }
}

export async function protokolliereKonsultation(
  terminId: string,
  disposition: KonsultationDisposition,
  notiz?: string,
  neuStartIso?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const ctx = await ladeEigenenKbTermin(terminId, user.id)
  if (!ctx) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  const now = new Date().toISOString()
  const trimmedNotiz = notiz?.trim() || null
  const dispoLabel =
    disposition === 'durchgefuehrt' ? 'Durchgeführt'
    : disposition === 'nicht_erreicht' ? 'Nicht erreicht'
    : 'Verschoben'
  const stamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
  const neueZeile = `[${stamp}] ${dispoLabel}${trimmedNotiz ? ': ' + trimmedNotiz : ''}`
  const notizIntern = ctx.termin.notiz_intern ? `${ctx.termin.notiz_intern}\n${neueZeile}` : neueZeile

  const update: Record<string, unknown> = { notiz_intern: notizIntern }

  if (disposition === 'durchgefuehrt') {
    update.durchgefuehrt_am = now
  } else if (disposition === 'verschoben') {
    if (!neuStartIso) return { ok: false, error: 'Kein neuer Termin angegeben' }
    const start = new Date(neuStartIso)
    if (isNaN(start.getTime())) return { ok: false, error: 'Ungültige Zeit' }
    if (start.getTime() <= Date.now()) return { ok: false, error: 'Termin muss in der Zukunft liegen' }
    update.start_zeit = neuStartIso
    update.end_zeit = new Date(start.getTime() + BERATUNG_DAUER_MIN * 60 * 1000).toISOString()
    update.status = 'bestaetigt'
    update.verlegung_initiator_kunde = false // KB-initiiert
  }

  const { error } = await ctx.admin.from('gutachter_termine').update(update).eq('id', terminId)
  if (error) return { ok: false, error: error.message }

  // SP2c: bei Verlegung (Zeitaenderung) den externen KB-Kalender nachziehen. Fail-soft.
  if (disposition === 'verschoben') await syncKbTerminOut(terminId)

  if (ctx.leadId) {
    try {
      await ctx.admin.from('timeline').insert({
        lead_id: ctx.leadId,
        fall_id: null,
        typ: 'system',
        titel: `KB-Beratung: ${dispoLabel}`,
        beschreibung: trimmedNotiz,
        erstellt_von: user.id,
      })
    } catch (err) {
      console.error('[protokolliereKonsultation] timeline:', err)
    }
  }

  revalidatePath(`/mitarbeiter/konsultation/${terminId}`)
  revalidatePath('/mitarbeiter/termine')
  return { ok: true }
}
