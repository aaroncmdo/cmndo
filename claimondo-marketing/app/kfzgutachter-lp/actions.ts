'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'

// Lead-Server-Action für die kfzgutachter-Ads-Landeseite.
// Schreibt zuerst eine anfragen-Zeile (Inbox/Audit), ruft dann atomic
// convert_anfrage_zu_lead(uuid). Bei Convert-Failure bleibt die Anfrage
// persistent (Audit-Trail) und die Action liefert Soft-Error mit
// anfrageId zur späteren Nachverfolgung.
// Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md

const SOURCE_SLUG = 'kfzgutachter-ads-lp'
const VARIANT_SLUG = 'test_b'

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
})

type Field = 'name' | 'phone' | 'city'

export async function submitKfzgutachterLead(
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

  // 2. Headers (Audit) + UTMs (aus FormData via Client-Hidden-Inputs in T6)
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

  // Optional: Fahrzeugart kommt vom Scroll-Popover-Wizard (Step 1).
  // Kein Zod-Validation — Side-Channel via JSON-payload, akzeptiert
  // nur eine Whitelist um zu verhindern, dass beliebige Strings die
  // Dispatch-View vergiften.
  const rawFahrzeug = String(formData.get('fahrzeug') ?? '').trim().toLowerCase()
  // Aaron 2026-05-19: Popover Step 1 reduziert auf 2 Optionen (pkw +
  // motorrad_roller). Alte Werte bleiben in der Whitelist, damit aeltere
  // Convert-Calls (zB von einer anderen Source-Form) nicht ploetzlich
  // gefiltert werden.
  const FAHRZEUG_WHITELIST = ['pkw', 'motorrad_roller', 'transporter', 'lkw', 'motorrad', 'wohnmobil', 'sonstiges']
  const fahrzeug = FAHRZEUG_WHITELIST.includes(rawFahrzeug) ? rawFahrzeug : null

  // Optional: Google-Place-ID aus dem Autocomplete-Picker (Step 2).
  // Format ist ChIJ… — auf alphanumerisch + Bindestrich/Unterstrich
  // begrenzen, damit kein Markup/SQL-Hex reinrutscht.
  const rawPlaceId = String(formData.get('place_id') ?? '').trim()
  const placeId =
    rawPlaceId && /^[A-Za-z0-9_-]{10,128}$/.test(rawPlaceId)
      ? rawPlaceId
      : null

  const payload: Record<string, string> = {}
  if (fahrzeug) payload.fahrzeug = fahrzeug
  if (placeId) payload.place_id = placeId

  // 3. Anfrage anlegen
  const { data: anfrage, error: anfErr } = await sb
    .from('anfragen')
    .insert({
      quelle: SOURCE_SLUG,
      quelle_variant: VARIANT_SLUG,
      quelle_url: refererUrl,
      ...utm,
      kontakt_name: parsed.data.name,
      kontakt_telefon: parsed.data.phone,
      kontakt_plz_oder_stadt: parsed.data.city,
      payload,
      client_ip: clientIp,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (anfErr || !anfrage) {
    console.error('[kfzgutachter-lp] Anfrage-Insert fehlgeschlagen:', anfErr?.message)
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
      '[kfzgutachter-lp] Convert fehlgeschlagen:',
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
  //    Die LP-Submit-Action läuft mit service_role (kein auth.uid()) — daher
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
      const fahrzeug =
        typeof formData.get('fahrzeug') === 'string'
          ? String(formData.get('fahrzeug'))
          : null
      const beschreibung = [
        SOURCE_SLUG,
        fahrzeug ? `Fahrzeug: ${fahrzeug}` : null,
        parsed.data.phone,
      ]
        .filter(Boolean)
        .join(' · ')
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
      '[kfzgutachter-lp] Dispatcher-Notify fehlgeschlagen (nicht kritisch):',
      (err as Error).message,
    )
  }

  // 6. Email + WhatsApp via shared notifyNewLead (Aaron-Direktive 2026-05-20).
  //    Helper kapselt: Email an info@claimondo.de + WA via Baileys an
  //    +491633628571 + +4917620289514. Fire-and-forget intern.
  await notifyNewLead({
    leadId: String(leadId),
    source: 'kfzgutachter.claimondo.de (Ads-LP)',
    name: parsed.data.name,
    phone: parsed.data.phone,
    city: parsed.data.city,
    fahrzeug: String(formData.get('fahrzeug') ?? '').trim() || null,
    utm,
    extraFields: [
      { label: 'Place-ID', value: placeId },
      { label: 'Referer', value: refererUrl },
      { label: 'Client-IP', value: clientIp },
      { label: 'Variant', value: VARIANT_SLUG },
      { label: 'Anfrage-ID', value: anfrage.id },
    ],
  })

  // 7. Revalidate Dispatch-Views
  revalidatePath('/admin/leads')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/anfragen')

  return { ok: true, leadId: String(leadId), anfrageId: anfrage.id }
}
