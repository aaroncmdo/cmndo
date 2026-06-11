'use server'

// AAR-143: Multi-Channel-FlowLink-Versand extrahiert aus actions.ts
// (AAR-141 / W7). Ersetzt die alte sendFlowLink in admin/dispatch/actions.ts
// als Phase-5-Primärweg.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { persistFlowLinkVersand } from '@/lib/start-link/persist-flowlink-versand'
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

  // AAR-956: EIN Lead = EIN Link — über die kanonische idempotente Brücke statt
  // eigenem flow_links-Insert (reuse bestehender gültiger Link, sonst neu).
  const flRes = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp, sprache })
  if (!flRes.ok) return { success: false, error: flRes.error }
  const token = flRes.token

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const flowUrl = `${baseUrl}/flow/${token}`

  // Aktiver Termin für Template-Variablen (AAR-116 Fix: alle 6 Vars)
  const { data: terminRaw } = await supabase
    .from('gutachter_termine')
    // AAR-956: Self-Service-Termine sind bezug-nativ (lead_id NULL) -> Dual-Lookup mitfinden.
    .select('start_zeit, sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
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

  // AAR-956 Part 1 (Send-Text nach DB-Stand): liegt ein vollständiger SV-Termin vor,
  // geht die Termin-Variante raus; sonst ein Plain-Link (KEIN Hard-Error mehr) — der
  // Kunde bucht den Termin dann selbst im /flow-Resolver. Gilt für alle drei Kanäle.
  const vornameVal = (lead.vorname ?? '').trim()
  const terminTextMoeglich = Boolean(svVorname && svNachname && datum && uhrzeit)

  if (kanal === 'whatsapp') {
    if (!telefon) return { success: false, error: 'Keine Telefonnummer für WhatsApp' }
    // Telefon auf E.164 normalisieren.
    let waTelefon = telefon.replace(/\s/g, '')
    if (waTelefon.startsWith('0')) waTelefon = '+49' + waTelefon.slice(1)
    else if (waTelefon.startsWith('00')) waTelefon = '+' + waTelefon.slice(2)
    if (!waTelefon.startsWith('+')) waTelefon = '+' + waTelefon
    try {
      if (terminTextMoeglich) {
        // Mit Termin → nummerierte Vorlage (Vorname, SV-Vorname, SV-Nachname, Datum, Uhrzeit, URL).
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('flowlink_versand', {
          telefon: waTelefon,
          '1': vornameVal,
          '2': svVorname,
          '3': svNachname,
          '4': datum,
          '5': uhrzeit,
          '6': flowUrl,
        })
      } else {
        // Kein Termin → Plain-Freitext via Baileys (WA ist seit 02.06. Baileys, kein
        // Twilio-Template nötig). An das SendResult gekoppelt (§6.1: kein Falsch-"gesendet").
        const { sendWhatsAppText } = await import('@/lib/whatsapp/baileys-client')
        const greet = vornameVal ? `Hallo ${vornameVal}` : 'Hallo'
        const sent = await sendWhatsAppText(
          waTelefon,
          `${greet}, hier geht es zu Ihrer Schadensregulierung bei Claimondo:\n\n${flowUrl}\n\nMit wenigen Klicks buchen Sie Ihren Gutachter-Termin und schließen ab.`,
        )
        if (!sent.ok) {
          return { success: false, error: sent.error ?? 'WhatsApp-Versand fehlgeschlagen' }
        }
      }
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
    const body = terminTextMoeglich
      ? `Hallo ${vornameVal}, Ihr Schadenportal ist bereit. Termin mit ${svVorname} ${svNachname} am ${datum} ${uhrzeit}. Portal öffnen: ${flowUrl}`
      : `Hallo ${vornameVal}, hier geht es zu Ihrer Schadensregulierung bei Claimondo: ${flowUrl}`
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
    if (terminTextMoeglich) {
      const { sendFlowLinkVersand } = await import('@/lib/email/google/flows')
      const r = await sendFlowLinkVersand(leadId, flowUrl)
      if (!r.success) return { success: false, error: r.error }
    } else {
      // Kein Termin → saubere Plain-Vorlage (branded + i18n), keine "—"-Platzhalter.
      const { sendMiniWizardMagicLink } = await import('@/lib/email/google/flows')
      const r = await sendMiniWizardMagicLink(leadId, flowUrl)
      if (!r.success) return { success: false, error: r.error }
    }
  }

  // AAR-956 P4: Versand-State auf flow_links persistieren (Dispatcher sieht
  // gesendet?/wann/Kanal + Re-Send-Anzahl). Service-Role, da flow_links default-deny
  // fuer authenticated ist. Non-fatal — der Send ist hier bereits erfolgreich.
  try {
    await persistFlowLinkVersand(createAdminClient(), token, kanal)
  } catch (err) {
    console.error('[sendFlowLinkMultiChannel] persistFlowLinkVersand:', err)
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
  return { success: true, token }
}
