'use server'

// AAR-902 Prototyp: Server-Action fuer den Mini-Wizard.
// 1. Lead einfuegen (4 Felder + Defaults), Disqualifikation bei
//    schuldfrage='eigenverantwortung'
// 2. flow_links-Token erstellen (72h gueltig)
// 3. Magic-Link per Email an Lead.email senden
//    (Baileys/WhatsApp folgt in PR 1+2 der AAR-897-Strecke)
// 4. Liefert { redirect } zurueck — Caller (Client-Component) navigiert.
//
// Anonyme Aktion: kein auth.getUser, /schaden-melden ist public.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { readPromoCookie, isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { resolvePromoCodeToId } from '@/lib/flow/resolve-promo'
import { miniWizardSchema, type MiniWizardInput } from '@/lib/flow/schemas/mini-wizard'
import { sendMiniWizardMagicLink } from '@/lib/email/google/flows'

type Result =
  | {
      success: true
      leadId: string
      redirectTo: string
      kanal: 'email' | 'disqualifiziert'
    }
  | { success: false; error: string }

export async function createLeadFromMiniWizard(input: MiniWizardInput): Promise<Result> {
  const parsed = miniWizardSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
    }
  }

  const data = parsed.data
  const isDisqualifiziert = data.schuldfrage === 'eigenverantwortung'
  const locale = await getLocaleCookie()

  // Promo-Cookie-Attribution wie im alten Wizard
  let promotionCodeId: string | null = null
  const promoCookie = await readPromoCookie()
  if (promoCookie && isValidPromoCodeFormat(promoCookie)) {
    promotionCodeId = await resolvePromoCodeToId(promoCookie)
  }

  const admin = createAdminClient()

  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .insert({
      // Pflicht / sinnvolle Defaults
      schuldfrage: data.schuldfrage,
      unfalldatum: data.unfalldatum,
      unfallort: data.unfallort,
      email: data.email,
      telefon: data.telefon,
      vorname: data.vorname || null,
      sprache: locale,
      source_channel: 'mini_wizard',
      qualifizierungs_phase: isDisqualifiziert ? 'disqualifiziert' : 'in-qualifizierung',
      status: isDisqualifiziert ? 'disqualifiziert' : 'neu',
      disqualifiziert: isDisqualifiziert,
      disqualifiziert_grund_key: isDisqualifiziert ? 'eigenverantwortung' : null,
      disqualifiziert_am: isDisqualifiziert ? new Date().toISOString() : null,
      promotion_code_id: promotionCodeId,
    })
    .select('id')
    .single()

  if (leadErr || !lead) {
    return {
      success: false,
      error: leadErr?.message ?? 'Lead konnte nicht angelegt werden',
    }
  }

  // Selbstverschulden: Lead bleibt in DB, kein Magic-Link
  if (isDisqualifiziert) {
    revalidatePath('/dispatch/leads')
    return {
      success: true,
      leadId: lead.id as string,
      redirectTo: '/schaden-melden/prototyp/selbstverschulden',
      kanal: 'disqualifiziert',
    }
  }

  // flow_links Token erstellen — 72h gueltig wie im Dispatch-Flow
  const { data: flowLink, error: flowErr } = await admin
    .from('flow_links')
    .insert({
      lead_id: lead.id as string,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      service_typ: 'komplett',
      sprache: locale,
    })
    .select('token')
    .single()

  if (flowErr || !flowLink) {
    return {
      success: false,
      error: flowErr?.message ?? 'Magic-Link-Token konnte nicht erstellt werden',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const flowUrl = `${baseUrl}/flow/${flowLink.token as string}`

  // Email-Versand (WhatsApp via Baileys kommt mit PR 1+2 der Strecke AAR-897)
  const emailResult = await sendMiniWizardMagicLink(lead.id as string, flowUrl)
  if (!emailResult.success) {
    return {
      success: false,
      error: `Magic-Link konnte nicht versendet werden: ${emailResult.error}`,
    }
  }

  // Lead-Status aktualisieren + Timeline-Eintrag
  await admin
    .from('leads')
    .update({
      qualifizierungs_phase: 'flow-versendet',
      status: 'flow-gesendet',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id as string)

  await admin
    .from('timeline')
    .insert({
      lead_id: lead.id as string,
      fall_id: null,
      typ: 'system',
      titel: 'Mini-Wizard: Magic-Link per Email versendet',
      beschreibung: `An ${data.email} — Schuldfrage: ${data.schuldfrage}, Unfallort: ${data.unfallort}`,
    })
    .then(() => {}, () => {})

  revalidatePath('/dispatch/leads')

  return {
    success: true,
    leadId: lead.id as string,
    redirectTo: `/schaden-melden/prototyp/link-versendet?email=${encodeURIComponent(data.email)}`,
    kanal: 'email',
  }
}
