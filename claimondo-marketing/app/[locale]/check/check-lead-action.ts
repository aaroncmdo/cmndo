'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { erzeugeUndSendeFlowLink } from '@/lib/leads/flowlink-fuer-lead'
import { resolveMaklerByPromoCode } from '@/lib/makler/resolve-promo'
import { persistiereOppref } from '@/lib/analytics/oaiq-capi'

// Lead-Server-Action für die interaktive Anspruchs-Prüfung (/check).
// Spiegelt submitHomeLead (components/landing/home-lead-action.ts): anfragen-Zeile
// (Inbox/Audit) -> atomic convert_anfrage_zu_lead(uuid) -> Dispatcher-Notify +
// notifyNewLead. Zusatz: die 3 Check-Antworten werden in anfragen.payload (jsonb)
// persistiert UND als lesbare extraFields an die Notification gehängt, damit
// Dispatch den Fall-Kontext (Schuld/Frist/Gutachten) sofort sieht.
//
// /check fuellte vorher eine 404 (InlineCheckCta -> /check existierte nie). Diese
// Action zieht den Check auf den einheitlichen Landing-Lead-Pfad des Projekts.

const SOURCE_SLUG = 'claimondo-check'
const SOURCE_VARIANT = 'interaktiv-anspruchscheck'

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
  // Check-Antworten (optional — der Lead funktioniert auch ohne)
  schuld: z.enum(['gegner', 'teils', 'unklar', 'selbst']).optional(),
  unfall_her: z.enum(['unter_woche', 'bis_monat', 'ueber_monat']).optional(),
  gutachten: z.enum(['nein', 'versicherung', 'ja']).optional(),
})

type Field = 'name' | 'phone' | 'city'

// Lesbare Labels für die Dispatch-Notification (DE — interner Audit-Trail).
const SCHULD_LABEL: Record<string, string> = {
  gegner: 'Unfallgegner trägt Schuld',
  teils: 'Teilschuld',
  unklar: 'Schuldfrage unklar',
  selbst: 'Eigenverschulden / Kasko-Fall',
}
const FRIST_LABEL: Record<string, string> = {
  unter_woche: 'Unfall < 1 Woche her',
  bis_monat: 'Unfall 1–4 Wochen her',
  ueber_monat: 'Unfall > 1 Monat her',
}
const GUTACHTEN_LABEL: Record<string, string> = {
  nein: 'Noch kein Gutachten',
  versicherung: 'Gegner-Versicherung will Gutachter schicken',
  ja: 'Gutachten liegt vor',
}

export async function submitCheckLead(
  formData: FormData,
): Promise<
  | { ok: true; leadId: string; anfrageId: string }
  | { ok: false; error: string; field?: Field; anfrageId?: string }
> {
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Eingaben unvollständig',
      field: (issue?.path[0] as Field | undefined) ?? undefined,
    }
  }

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

  const check = {
    schuld: parsed.data.schuld ?? null,
    unfall_her: parsed.data.unfall_her ?? null,
    gutachten: parsed.data.gutachten ?? null,
  }

  const sb = createServiceClient()

  const { data: anfrage, error: anfErr } = await sb
    .from('anfragen')
    .insert({
      quelle: SOURCE_SLUG,
      quelle_variant: SOURCE_VARIANT,
      quelle_url: refererUrl,
      ...utm,
      kontakt_name: parsed.data.name,
      kontakt_telefon: parsed.data.phone,
      kontakt_plz_oder_stadt: parsed.data.city,
      payload: { check },
      client_ip: clientIp,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (anfErr || !anfrage) {
    console.error('[check] Anfrage-Insert fehlgeschlagen:', anfErr?.message)
    return {
      ok: false,
      error: 'Konfigurationsfehler – bitte rufen Sie an: +49 221 25 906 530',
    }
  }

  const { data: leadId, error: convErr } = await sb.rpc('convert_anfrage_zu_lead', {
    p_anfrage_id: anfrage.id,
  })

  if (convErr || !leadId) {
    console.error('[check] Convert fehlgeschlagen:', convErr?.message, 'anfrageId:', anfrage.id)
    return {
      ok: false,
      error:
        'Übermittlung erhalten – Verarbeitung läuft. Wir melden uns auch ohne Sofort-Bestätigung.',
      anfrageId: anfrage.id,
    }
  }

  // OAIQ-Attribution festhalten, bevor irgendetwas anderes passiert: Das
  // __oppref-Cookie lebt auf claimondo.de, die Terminbuchung laeuft cross-origin
  // im iframe und die SA oft Tage spaeter — spaeter ist der Wert nicht mehr
  // erreichbar. Ohne Anzeigenklick/Marketing-Consent ein No-op.
  await persistiereOppref(String(leadId))

  // FlowLink erzeugen + dem MELDER schicken — sein Kanal zurück in den eigenen Vorgang.
  // Bis 30.08.2026 fehlte das: der Lead entstand, das Team bekam eine WhatsApp, der Kunde
  // nichts. Der Mini-Wizard macht es seit der Aaron-Direktive vom 20.05.2026 vor.
  // NON-FATAL: der Lead ist hier schon konvertiert, ein Versand-Fehler darf ihn nicht kippen.
  try {
    const fl = await erzeugeUndSendeFlowLink({
      leadId: String(leadId),
      telefon: parsed.data.phone,
      vorname: parsed.data.name.trim().split(/\s+/)[0] ?? null,
      quelle: 'Anspruchs-Prüfung',
    })
    if (!fl.ok) {
      console.error('[check] FlowLink:', fl.error, fl.token ? `(Link steht: ${fl.token})` : '(kein Link)')
    }
  } catch (err) {
    console.error('[check] FlowLink-Versand fehlgeschlagen:', (err as Error).message)
  }

  // Makler-Hub-Attribution (Leg 2): wenn der Hub-Link ?m=<Promo-Code> mitgab, den Lead
  // dem Makler zuordnen. Post-convert UPDATE — anfragen + convert_anfrage_zu_lead tragen
  // keine promotion_code_id (DB-verifiziert). Best-effort: ein Fail darf den Lead nicht brechen.
  const maklerCode = String(formData.get('m') ?? '').trim()
  if (maklerCode) {
    try {
      const target = await resolveMaklerByPromoCode(sb, maklerCode)
      if (target) {
        await sb.from('leads').update({ promotion_code_id: target.promotionCodeId }).eq('id', String(leadId))
      }
    } catch (err) {
      console.error('[check] Makler-Attribution fehlgeschlagen (nicht kritisch):', (err as Error).message)
    }
  }

  // Lesbarer Check-Kontext für die Dispatch-Notification.
  const checkExtras = [
    { label: 'Schuldfrage', value: check.schuld ? SCHULD_LABEL[check.schuld] ?? check.schuld : null },
    { label: 'Frist', value: check.unfall_her ? FRIST_LABEL[check.unfall_her] ?? check.unfall_her : null },
    { label: 'Gutachten-Status', value: check.gutachten ? GUTACHTEN_LABEL[check.gutachten] ?? check.gutachten : null },
  ].filter((e) => e.value)

  // Push-Notification an aktive Dispatcher + Admins (fire-and-forget).
  try {
    const { data: dispatchers } = await sb
      .from('profiles')
      .select('id')
      .in('rolle', ['dispatch', 'admin'])
    if (dispatchers && dispatchers.length > 0) {
      const titel = `Neuer Lead (Anspruch-Check)${
        parsed.data.city ? ` aus ${parsed.data.city}` : ''
      }: ${parsed.data.name}`
      const beschreibung = [SOURCE_SLUG, parsed.data.phone, ...checkExtras.map((e) => e.value)]
        .filter(Boolean)
        .join(' · ')
      await Promise.all(
        dispatchers.map((d) =>
          sb.from('benachrichtigungen').insert({
            user_id: d.id,
            typ: 'neuer-lead',
            titel,
            beschreibung,
            link: `/dispatch/leads/${leadId}`,
          }),
        ),
      )
    }
  } catch (err) {
    console.error('[check] Dispatcher-Notify fehlgeschlagen (nicht kritisch):', (err as Error).message)
  }

  await notifyNewLead({
    leadId: String(leadId),
    source: 'claimondo.de/check (Anspruchs-Prüfung)',
    name: parsed.data.name,
    phone: parsed.data.phone,
    city: parsed.data.city,
    utm,
    extraFields: [
      ...checkExtras,
      { label: 'Referer', value: refererUrl },
      { label: 'Client-IP', value: clientIp },
      { label: 'Anfrage-ID', value: anfrage.id },
    ],
  })

  revalidatePath('/admin/leads')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/anfragen')

  return { ok: true, leadId: String(leadId), anfrageId: anfrage.id }
}
