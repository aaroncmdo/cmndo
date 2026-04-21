'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { signAndStoreContract } from '@/lib/contracts/sign-and-store'

// KFZ-152 Phase 2: Server Actions fuer das Akademie-Onboarding (Verwalter-Pfad)
//   - signAkademieVertrag: signiert den Akademie-Kooperationsvertrag (vorlage_typ='akademie_kooperation')
//     und schreibt vertraege_unterzeichnet mit organisation_id (gutachter_id null).
//   - startAkademieStripeCheckout: startet den embedded Stripe Checkout fuer
//     die individuell festgelegte Akademie-Erst-Anzahlung.

export async function signAkademieVertrag(params: {
  organisation_id: string
  signaturePngDataUri: string
  unterschriftName: string
}): Promise<{ success: boolean; error?: string; vertrag_id?: string; pdf_path?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()

  // Org laden + verifizieren dass es eine Akademie ist und User der Verwalter ist
  const { data: org } = await db.from('organisationen')
    .select('id, name, typ, hauptansprechpartner_user_id')
    .eq('id', params.organisation_id)
    .single()
  if (!org) return { success: false, error: 'Organisation nicht gefunden' }
  if (org.typ !== 'akademie') return { success: false, error: 'Organisation ist keine Akademie' }
  if (org.hauptansprechpartner_user_id !== user.id) {
    return { success: false, error: 'Keine Berechtigung' }
  }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  let result
  try {
    result = await signAndStoreContract({
      vorlage_typ: 'akademie_kooperation',
      unterschrift_name: params.unterschriftName,
      unterschrift_ip: ip,
      unterschrift_user_agent: userAgent,
      signature_png_data_uri: params.signaturePngDataUri,
      organisation_id: params.organisation_id,
      rolle: 'Akademie-Verwalter',
      organisation_name: org.name,
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Vertrag konnte nicht gespeichert werden' }
  }

  await db.from('organisationen').update({
    onboarding_status: 'vertrag_unterzeichnet',
    vertrag_unterzeichnet_id: result.vertrag_id,
    updated_at: new Date().toISOString(),
  }).eq('id', params.organisation_id)

  // BUG-92 Pattern: Inhaber-SV-Row auch markieren damit Status-Badges stimmen
  await db.from('sachverstaendige').update({
    vertrag_unterschrieben: true,
    vertrag_unterschrieben_am: new Date().toISOString(),
    onboarding_status: 'vertrag_unterzeichnet',
  }).eq('organisation_id', params.organisation_id).eq('ist_parent_account', true)

  revalidatePath('/admin/sachverstaendige', 'page')
  revalidatePath('/admin/sachverstaendige', 'page')
  revalidatePath('/admin/organisationen', 'page')

  return { success: true, vertrag_id: result.vertrag_id, pdf_path: result.pdf_path }
}

export async function startAkademieStripeCheckout(organisationId: string): Promise<{ clientSecret: string; sessionId: string } | { error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  // Auth-Check: User muss Verwalter der Akademie sein
  const adminDb = createAdminClient()
  const { data: org } = await adminDb.from('organisationen')
    .select('hauptansprechpartner_user_id, typ')
    .eq('id', organisationId)
    .maybeSingle()
  if (!org || org.typ !== 'akademie' || org.hauptansprechpartner_user_id !== user.id) {
    return { error: 'Keine Berechtigung' }
  }

  try {
    const { createAkademieCheckoutSession } = await import('@/lib/stripe/akademie-checkout')
    return await createAkademieCheckoutSession(organisationId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Stripe-Fehler' }
  }
}
