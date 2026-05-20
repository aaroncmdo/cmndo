'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

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

  // 6. Email-Notification an info@claimondo.de — Aaron-Direktive 2026-05-20:
  //    Jede LP-Form-Submission soll auch per Email reinkommen, damit das
  //    Inbox-Postfach den Lead unabhaengig vom Dispatcher-Portal-Login sieht.
  //    Fire-and-forget — Email-Failure (SMTP/Resend) bricht den Lead-Flow NICHT.
  try {
    const { sendEmail } = await import('@/lib/email/google/client')
    const fahrzeugVal = String(formData.get('fahrzeug') ?? '').trim() || '—'
    const utmRows = Object.entries(utm)
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${v}</td></tr>`)
      .join('')
    const html = `
      <h2>Neuer Lead: ${parsed.data.name}</h2>
      <p>Quelle: <strong>${SOURCE_SLUG}</strong> (${VARIANT_SLUG})</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td><strong>Name</strong></td><td>${parsed.data.name}</td></tr>
        <tr><td><strong>Telefon</strong></td><td>${parsed.data.phone}</td></tr>
        <tr><td><strong>Stadt / PLZ</strong></td><td>${parsed.data.city}</td></tr>
        <tr><td><strong>Fahrzeug</strong></td><td>${fahrzeugVal}</td></tr>
        <tr><td><strong>Place-ID</strong></td><td>${placeId ?? '—'}</td></tr>
        <tr><td><strong>Referer</strong></td><td>${refererUrl ?? '—'}</td></tr>
        <tr><td><strong>Client-IP</strong></td><td>${clientIp ?? '—'}</td></tr>
        ${utmRows}
      </table>
      <p style="margin-top:16px"><a href="https://app.claimondo.de/dispatch/leads/${leadId}">Lead im Dispatch-Portal oeffnen</a></p>
      <p style="color:#666;font-size:12px">Anfrage-ID: ${anfrage.id} · Lead-ID: ${leadId}</p>
    `
    const text = [
      `Neuer Lead: ${parsed.data.name}`,
      `Quelle: ${SOURCE_SLUG} (${VARIANT_SLUG})`,
      ``,
      `Name: ${parsed.data.name}`,
      `Telefon: ${parsed.data.phone}`,
      `Stadt/PLZ: ${parsed.data.city}`,
      `Fahrzeug: ${fahrzeugVal}`,
      placeId ? `Place-ID: ${placeId}` : null,
      refererUrl ? `Referer: ${refererUrl}` : null,
      clientIp ? `Client-IP: ${clientIp}` : null,
      ...Object.entries(utm).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
      ``,
      `Lead: https://app.claimondo.de/dispatch/leads/${leadId}`,
      `Anfrage-ID: ${anfrage.id} / Lead-ID: ${leadId}`,
    ].filter(Boolean).join('\n')
    await sendEmail({
      to: 'info@claimondo.de',
      subject: `Neuer Lead: ${parsed.data.name} (${parsed.data.city})`,
      html,
      text,
    })
  } catch (err) {
    console.error(
      '[kfzgutachter-lp] Email an info@claimondo.de fehlgeschlagen (nicht kritisch):',
      (err as Error).message,
    )
  }

  // 7. WhatsApp-Notification an feste Empfaenger via Baileys — Aaron-Direktive
  //    2026-05-20: zusaetzlich zur Email auch WA an Aaron + Mitarbeiter, damit
  //    der Lead push-mobile auflaeuft. Fire-and-forget — Baileys-Down brichst
  //    den Lead-Flow NICHT.
  try {
    const { sendWhatsAppText } = await import('@/lib/whatsapp/baileys-client')
    const fahrzeugVal = String(formData.get('fahrzeug') ?? '').trim() || '—'
    const waText = [
      `🔔 Neuer Lead: ${parsed.data.name}`,
      ``,
      `📞 ${parsed.data.phone}`,
      `📍 ${parsed.data.city}`,
      `🚗 ${fahrzeugVal}`,
      ``,
      `Quelle: ${SOURCE_SLUG}`,
      `https://app.claimondo.de/dispatch/leads/${leadId}`,
    ].join('\n')
    const WA_EMPFAENGER = ['+491633628571', '+4917620289514']
    await Promise.all(
      WA_EMPFAENGER.map(async (phone) => {
        const r = await sendWhatsAppText(phone, waText)
        if (!r.ok) {
          console.error(
            `[kfzgutachter-lp] Baileys-WA an ${phone} fehlgeschlagen:`,
            r.code,
            r.error,
          )
        }
      }),
    )
  } catch (err) {
    console.error(
      '[kfzgutachter-lp] WhatsApp-Notify fehlgeschlagen (nicht kritisch):',
      (err as Error).message,
    )
  }

  // 8. Revalidate Dispatch-Views
  revalidatePath('/admin/leads')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/anfragen')

  return { ok: true, leadId: String(leadId), anfrageId: anfrage.id }
}
