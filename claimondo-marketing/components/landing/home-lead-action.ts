'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'

// Lead-Server-Action für das Hero-Lead-Formular der Hauptseite (claimondo.de).
// Spiegelt submitKfzgutachterLead (src/app/kfzgutachter-lp/actions.ts): zuerst
// eine anfragen-Zeile (Inbox/Audit), dann atomic convert_anfrage_zu_lead(uuid).
// Bei Convert-Failure bleibt die Anfrage persistent (Audit-Trail) und die Action
// liefert einen Soft-Error mit anfrageId zur späteren Nachverfolgung.
//
// Vorher posteten die Felder als rohes <form action="/api/leads/home">, aber
// diese Route existierte nie -> Submit landete auf einer 404. Das Projekt nutzt
// für Landing-Lead-Forms durchgaengig Client-Component + co-located Server-Action
// (LeadFormClient/StadtLeadFormClient), kein API-Route-POST. Diese Action zieht
// das Hero-Formular auf denselben Pfad.

const SOURCE_SLUG = 'claimondo-home-hero'

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
})

type Field = 'name' | 'phone' | 'city'

export async function submitHomeLead(
  formData: FormData,
): Promise<
  | { ok: true; leadId: string; anfrageId: string }
  | { ok: false; error: string; field?: Field; anfrageId?: string }
> {
  // 1. Zod-Validation
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Eingaben unvollständig',
      field: (issue?.path[0] as Field | undefined) ?? undefined,
    }
  }

  // 2. Headers (Audit) + UTMs (aus FormData via Client-Hidden-Inputs)
  const h = await headers()
  const xff = h.get('x-forwarded-for') ?? ''
  const clientIp = (xff.split(',')[0] ?? '').trim() || h.get('x-real-ip') || null
  const userAgent = h.get('user-agent') ?? null
  const refererUrl = h.get('referer') ?? null

  const utm = {
    utm_source:   String(formData.get('utm_source')   ?? '') || null,
    utm_medium:   String(formData.get('utm_medium')   ?? '') || null,
    utm_campaign: String(formData.get('utm_campaign') ?? '') || null,
    utm_term:     String(formData.get('utm_term')     ?? '') || null,
    utm_content:  String(formData.get('utm_content')  ?? '') || null,
  }

  const sb = createServiceClient()

  // 3. Anfrage anlegen
  const { data: anfrage, error: anfErr } = await sb
    .from('anfragen')
    .insert({
      quelle: SOURCE_SLUG,
      quelle_url: refererUrl,
      ...utm,
      kontakt_name: parsed.data.name,
      kontakt_telefon: parsed.data.phone,
      kontakt_plz_oder_stadt: parsed.data.city,
      client_ip: clientIp,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (anfErr || !anfrage) {
    console.error('[home-hero] Anfrage-Insert fehlgeschlagen:', anfErr?.message)
    return {
      ok: false,
      error: 'Konfigurationsfehler — bitte rufen Sie an: +49 221 25 906 530',
    }
  }

  // 4. Atomic Convert via RPC
  const { data: leadId, error: convErr } = await sb.rpc(
    'convert_anfrage_zu_lead',
    { p_anfrage_id: anfrage.id },
  )

  if (convErr || !leadId) {
    console.error(
      '[home-hero] Convert fehlgeschlagen:',
      convErr?.message,
      'anfrageId:',
      anfrage.id,
    )
    return {
      ok: false,
      error:
        'Übermittlung erhalten — Verarbeitung läuft. Wir melden uns auch ohne Sofort-Bestätigung.',
      anfrageId: anfrage.id,
    }
  }

  // 5. Push-Notification an alle aktiven Dispatcher + Admins.
  //    Fire-and-forget — wenn ein Insert in benachrichtigungen fehlschlägt,
  //    bleibt der Lead trotzdem erhalten (Audit kommt aus anfragen + console).
  //    Die Submit-Action läuft mit service_role (kein auth.uid()) — daher
  //    explizit alle Dispatcher anschreiben, statt "current user".
  try {
    const { data: dispatchers } = await sb
      .from('profiles')
      .select('id')
      .in('rolle', ['dispatch', 'admin'])
    if (dispatchers && dispatchers.length > 0) {
      const titel = `Neuer Lead${
        parsed.data.city ? ` aus ${parsed.data.city}` : ''
      }: ${parsed.data.name}`
      const beschreibung = [SOURCE_SLUG, parsed.data.phone].filter(Boolean).join(' · ')
      const link = `/dispatch/leads/${leadId}`
      await Promise.all(
        dispatchers.map((d) =>
          sb.from('benachrichtigungen').insert({
            user_id: d.id,
            typ: 'neuer-lead',
            titel,
            beschreibung,
            link,
          }),
        ),
      )
    }
  } catch (err) {
    console.error(
      '[home-hero] Dispatcher-Notify fehlgeschlagen (nicht kritisch):',
      (err as Error).message,
    )
  }

  // 6. Email + WhatsApp via shared notifyNewLead.
  await notifyNewLead({
    leadId: String(leadId),
    source: 'claimondo.de (Hauptseite Hero-Formular)',
    name: parsed.data.name,
    phone: parsed.data.phone,
    city: parsed.data.city,
    utm,
    extraFields: [
      { label: 'Referer', value: refererUrl },
      { label: 'Client-IP', value: clientIp },
      { label: 'Anfrage-ID', value: anfrage.id },
    ],
  })

  // 7. Revalidate Dispatch-Views
  revalidatePath('/admin/leads')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/anfragen')

  return { ok: true, leadId: String(leadId), anfrageId: anfrage.id }
}
