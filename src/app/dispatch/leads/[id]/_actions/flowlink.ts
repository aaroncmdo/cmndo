'use server'

// AAR-143: Multi-Channel-FlowLink-Versand extrahiert aus actions.ts
// (AAR-141 / W7). Ersetzt die alte sendFlowLink in admin/dispatch/actions.ts
// als Phase-5-Primärweg.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function sendFlowLinkMultiChannel(
  leadId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
  telefonOverride?: string | null,
): Promise<{ success: boolean; error?: string; token?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, email, service_typ, sprache')
    .eq('id', leadId)
    .single()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const telefon = (telefonOverride?.trim() || lead.telefon) ?? null
  const serviceTyp = (lead.service_typ as string | null) ?? 'komplett'
  // AAR-316: Kundensprache an den FlowLink vererben — Portal-Page liest sie.
  const sprache = (lead.sprache as string | null) ?? 'de'

  // RLS-Phase-1 (#3): flow_links INSERT muss via admin-Client laufen — der
  // Dispatch-User ist via App-Layer-Guard authentifiziert.
  const admin = createAdminClient()
  const { data: flowLink, error: flowErr } = await admin
    .from('flow_links')
    .insert({
      lead_id: leadId,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      service_typ: serviceTyp,
      sprache,
    })
    .select('token')
    .single()
  if (flowErr || !flowLink) {
    return { success: false, error: flowErr?.message ?? 'Flow-Link-Erstellung fehlgeschlagen' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const flowUrl = `${baseUrl}/flow/${flowLink.token}`

  // Aktiver Termin für Template-Variablen (AAR-116 Fix: alle 6 Vars)
  const { data: terminRaw } = await supabase
    .from('gutachter_termine')
    .select('start_zeit, sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()
  const termin = terminRaw as { start_zeit: string; sachverstaendige: unknown } | null
  const svRel = termin?.sachverstaendige
  const sv = (Array.isArray(svRel) ? svRel[0] : svRel) as { profiles: unknown } | null
  const profileRel = sv?.profiles
  const profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
    | { vorname: string | null; nachname: string | null }
    | null
  const svVorname = profile?.vorname ?? ''
  const svNachname = profile?.nachname ?? ''
  const terminDate = termin?.start_zeit ? new Date(termin.start_zeit) : null
  const datum = terminDate ? terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
  const uhrzeit = terminDate
    ? terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
    : ''

  if (kanal === 'whatsapp') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für WhatsApp' }
    // AAR-226: Twilio lehnt Templates mit leeren Placeholdern als "Invalid
    // Parameter" ab. Vor dem Send alle 6 Pflicht-Placeholder validieren +
    // klare Fehlermeldung wenn Termin/SV fehlt (statt kryptisches Twilio-
    // Error beim MA).
    const vornameVal = (lead.vorname ?? '').trim()
    const missing: string[] = []
    if (!vornameVal) missing.push('Vorname des Kunden')
    if (!svVorname || !svNachname) missing.push('SV-Name (SV-Termin noch nicht reserviert?)')
    if (!datum || !uhrzeit) missing.push('Termin-Datum/Uhrzeit')
    if (missing.length > 0) {
      return {
        success: false,
        error: `FlowLink-WhatsApp kann nicht gesendet werden — fehlt: ${missing.join(', ')}. Bitte Phase 2 (SV + Termin) abschließen.`,
      }
    }
    // Telefon auf E.164 normalisieren (Twilio WhatsApp verlangt +49... Format).
    let waTelefon = telefon.replace(/\s/g, '')
    if (waTelefon.startsWith('0')) waTelefon = '+49' + waTelefon.slice(1)
    else if (waTelefon.startsWith('00')) waTelefon = '+' + waTelefon.slice(2)
    if (!waTelefon.startsWith('+')) waTelefon = '+' + waTelefon
    try {
      const { sendCommunication } = await import('@/lib/communications/send')
      // AAR-175 P0-C: Der vorname-Key war Alt-Last aus pre-numbered-Template-Zeit.
      // Twilio-Templates konsumieren ausschließlich die nummerierten Placeholder
      // '1'..'6'.
      await sendCommunication('flowlink_versand', {
        telefon: waTelefon,
        '1': vornameVal,
        '2': svVorname,
        '3': svNachname,
        '4': datum,
        '5': uhrzeit,
        '6': flowUrl,
      })
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'WhatsApp-Versand fehlgeschlagen',
      }
    }
  } else if (kanal === 'sms') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für SMS' }
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const smsFrom = process.env.TWILIO_SMS_FROM
    if (!accountSid || !authToken || !smsFrom) {
      return { success: false, error: 'Twilio-SMS-Credentials fehlen (TWILIO_SMS_FROM)' }
    }
    let normalTo = telefon.replace(/\s/g, '')
    if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
    else if (normalTo.startsWith('00')) normalTo = '+' + normalTo.slice(2)
    if (!normalTo.startsWith('+')) normalTo = '+' + normalTo
    const body = `Hallo ${lead.vorname ?? ''}, Ihr Schadenportal ist bereit. Termin mit ${svVorname} ${svNachname} am ${datum} ${uhrzeit}. Portal öffnen: ${flowUrl}`
    const params = new URLSearchParams()
    params.set('From', smsFrom)
    params.set('To', normalTo)
    params.set('Body', body)
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      },
    )
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { success: false, error: `Twilio-SMS Fehler ${resp.status}: ${text.slice(0, 200)}` }
    }
  } else if (kanal === 'email') {
    if (!lead.email) return { success: false, error: 'Keine Email-Adresse am Lead' }
    const { sendFlowLinkVersand } = await import('@/lib/email/google/flows')
    const r = await sendFlowLinkVersand(leadId, flowUrl)
    if (!r.success) return { success: false, error: r.error }
  }

  // Lead-Status auf flow-versendet (AAR-116 Hardening: nur nach erfolgreichem Send).
  // wa_gesendet wird nur bei WA-Versand auf true gesetzt — per conditional spread.
  // AAR-155: zugewiesen_an wird automatisch auf den Dispatcher gesetzt falls
  // noch leer — damit später bei Fall-Erstellung dispatch_id FK bekannt
  // ist. Wenn bereits zugewiesen → nicht überschreiben.
  const { data: currentLead } = await supabase
    .from('leads')
    .select('zugewiesen_an')
    .eq('id', leadId)
    .maybeSingle()
  await supabase
    .from('leads')
    .update({
      ...(kanal === 'whatsapp' && { wa_gesendet: true }),
      ...(!currentLead?.zugewiesen_an && { zugewiesen_an: user.id }),
      status: 'flow-gesendet',
      qualifizierungs_phase: 'flow-versendet',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  const kanalLabel = kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'
  await supabase
    .from('timeline')
    .insert({
      lead_id: leadId,
      fall_id: null,
      typ: 'system',
      titel: `FlowLink per ${kanalLabel} versendet`,
      beschreibung: `An ${kanal === 'email' ? lead.email : telefon} — SV ${svVorname} ${svNachname} am ${datum} ${uhrzeit}`,
      erstellt_von: user.id,
    })
    .then(() => {}, () => {})

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
  return { success: true, token: flowLink.token }
}
