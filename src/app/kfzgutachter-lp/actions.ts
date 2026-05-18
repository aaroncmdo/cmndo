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
      payload: {},
      client_ip: clientIp,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (anfErr || !anfrage) {
    console.error('[kfzgutachter-lp] Anfrage-Insert fehlgeschlagen:', anfErr?.message)
    return {
      ok: false,
      error: 'Konfigurationsfehler — bitte rufen Sie an: 0221 25906530',
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

  // 5. Revalidate Dispatch-Views
  revalidatePath('/admin/leads')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/anfragen')

  return { ok: true, leadId: String(leadId), anfrageId: anfrage.id }
}
