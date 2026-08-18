// AAR-956: Multi-Channel-FlowLink-Versand — Core mit injiziertem DB-Client.
// Extrahiert aus dispatch/leads/[id]/_actions/flowlink.ts. Beide Aufrufer teilen
// diesen Code, injizieren aber je ihren Client + Actor:
//   - Dispatch        -> createClient() (RLS; Dispatcher hat Voll-Zugriff auf leads)
//   - KB-Konsultation -> createAdminClient() (service-role; der KB hat KEINEN
//     RLS-Pfad auf claim-lose Abbrecher-Leads — siehe pg_policies / Design-Spec).
// revalidatePath bleibt im jeweiligen Wrapper (verschiedene Routen).
// KEIN 'use server' — reine Lib (mehrere Server-Actions importieren sie).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { persistFlowLinkVersand } from '@/lib/start-link/persist-flowlink-versand'
import { toE164 } from '@/lib/format/telefon'
import { ladeSvAssigneeName } from '@/lib/termine/termin-assignee-name'

type DbClient = SupabaseClient<Database>

export async function sendFlowLinkMultiChannelCore(
  db: DbClient,
  leadId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
  actorId: string,
  telefonOverride?: string | null,
  // Optionaler Vorspann (z.B. Makler-Vermittlungs-Kontext) — nur fuer den Plain-Link
  // (kein Termin); das Termin-Template ist ein fixes WA-Template ohne freien Text.
  introText?: string | null,
): Promise<{ success: boolean; error?: string; token?: string }> {
  const { data: lead } = await db
    .from('leads')
    .select('id, vorname, nachname, telefon, email, service_typ, sprache')
    .eq('id', leadId)
    .single()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const telefon = (telefonOverride?.trim() || lead.telefon) ?? null
  const serviceTyp = (lead.service_typ as string | null) ?? 'komplett'
  const sprache = (lead.sprache as string | null) ?? 'de'

  const flRes = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp, sprache })
  if (!flRes.ok) return { success: false, error: flRes.error }
  const token = flRes.token

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const flowUrl = `${baseUrl}/flow/${token}`

  const { data: terminRaw } = await db
    .from('gutachter_termine')
    // AAR-956 17.07.: SV-Name via Zwei-Schritt (assignee-Achse) — das sachverstaendige-Embed
    // hat auf gutachter_termine keinen FK (PGRST200), die Query starb still → FlowLink ging
    // immer OHNE Termin-Text raus.
    .select('start_zeit, assignee_typ, assignee_id')
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()
  const termin = terminRaw as { start_zeit: string; assignee_typ: string | null; assignee_id: string | null } | null
  const profile = await ladeSvAssigneeName(db, termin?.assignee_typ ?? null, termin?.assignee_id ?? null)
  const svVorname = profile?.vorname ?? ''
  const svNachname = profile?.nachname ?? ''
  const terminDate = termin?.start_zeit ? new Date(termin.start_zeit) : null
  const datum = terminDate ? terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
  const uhrzeit = terminDate
    ? terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
    : ''

  const vornameVal = (lead.vorname ?? '').trim()
  const terminTextMoeglich = Boolean(svVorname && svNachname && datum && uhrzeit)

  if (kanal === 'whatsapp') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für WhatsApp' }
    const waTelefon = toE164(telefon)
    if (!waTelefon) return { success: false, error: 'Ungültige Telefonnummer für WhatsApp' }
    try {
      if (terminTextMoeglich) {
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('flowlink_versand', {
          telefon: waTelefon,
          '1': vornameVal, '2': svVorname, '3': svNachname, '4': datum, '5': uhrzeit, '6': flowUrl,
        })
      } else {
        const { sendWhatsAppText } = await import('@/lib/whatsapp/baileys-client')
        const greet = vornameVal ? `Hallo ${vornameVal}` : 'Hallo'
        const intro = introText ? `${introText}\n\n` : ''
        const sent = await sendWhatsAppText(
          waTelefon,
          `${intro}${greet}, hier geht es zu Ihrer Schadensregulierung bei Claimondo:\n\n${flowUrl}\n\nMit wenigen Klicks buchen Sie Ihren Gutachter-Termin und schließen ab.`,
        )
        if (!sent.ok) return { success: false, error: sent.error ?? 'WhatsApp-Versand fehlgeschlagen' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'WhatsApp-Versand fehlgeschlagen' }
    }
  } else if (kanal === 'sms') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für SMS' }
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const smsFrom = process.env.TWILIO_SMS_FROM
    if (!accountSid || !authToken || !smsFrom) {
      return { success: false, error: 'Twilio-SMS-Credentials fehlen (TWILIO_SMS_FROM)' }
    }
    const normalTo = toE164(telefon)
    if (!normalTo) return { success: false, error: 'Ungültige Telefonnummer für SMS' }
    const body = terminTextMoeglich
      ? `Hallo ${vornameVal}, Ihr Schadenportal ist bereit. Termin mit ${svVorname} ${svNachname} am ${datum} ${uhrzeit}. Portal öffnen: ${flowUrl}`
      : `${introText ? introText + ' ' : ''}Hallo ${vornameVal}, hier geht es zu Ihrer Schadensregulierung bei Claimondo: ${flowUrl}`
    const params = new URLSearchParams()
    params.set('From', smsFrom); params.set('To', normalTo); params.set('Body', body)
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { success: false, error: `Twilio-SMS Fehler ${resp.status}: ${text.slice(0, 200)}` }
    }
  } else if (kanal === 'email') {
    if (!lead.email) return { success: false, error: 'Keine Email-Adresse am Lead' }
    if (terminTextMoeglich) {
      const { sendFlowLinkVersand } = await import('@/lib/email/google/flows')
      const r = await sendFlowLinkVersand(leadId, flowUrl)
      if (!r.success) return { success: false, error: r.error }
    } else {
      const { sendMiniWizardMagicLink } = await import('@/lib/email/google/flows')
      const r = await sendMiniWizardMagicLink(leadId, flowUrl)
      if (!r.success) return { success: false, error: r.error }
    }
  }

  try {
    await persistFlowLinkVersand(createAdminClient(), token, kanal)
  } catch (err) {
    console.error('[sendFlowLinkMultiChannelCore] persistFlowLinkVersand:', err)
  }

  const { data: currentLead } = await db
    .from('leads')
    .select('zugewiesen_an')
    .eq('id', leadId)
    .maybeSingle()
  // Versand-Marker NACH dem Versand: der Link ist an dieser Stelle beim Kunden.
  // Ohne die Marker gilt er als nicht verschickt und wird erneut zugestellt.
  const { error: versandMarkerFehler } = await db
    .from('leads')
    .update({
      ...(kanal === 'whatsapp' && { wa_gesendet: true }),
      ...(!currentLead?.zugewiesen_an && { zugewiesen_an: actorId }),
      status: 'flow-gesendet',
      qualifizierungs_phase: 'flow-versendet',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (versandMarkerFehler) {
    console.error(`[send-flowlink] Versand-Marker nicht gesetzt (Lead ${leadId}, ${kanal}) — Doppel-Zustellung moeglich:`, versandMarkerFehler.message)
  }

  const kanalLabel = kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'
  await db
    .from('timeline')
    .insert({
      lead_id: leadId,
      fall_id: null,
      typ: 'system',
      titel: `FlowLink per ${kanalLabel} versendet`,
      beschreibung: `An ${kanal === 'email' ? lead.email : telefon} — SV ${svVorname} ${svNachname} am ${datum} ${uhrzeit}`,
      erstellt_von: actorId,
    })
    .then(() => {}, () => {})

  return { success: true, token }
}
