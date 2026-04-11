'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { signAndStoreContract } from '@/lib/contracts/sign-and-store'

/**
 * KFZ-148: Vertrag unterzeichnen (Schritt 2).
 * Speichert Akzeptanz in vertraege_unterzeichnet, generiert PDF mit eingebrannter
 * Unterschrift via @react-pdf/renderer, lädt es nach storage:vertraege hoch und
 * schickt eine Welcome-Mail mit PDF-Anhang an den SV.
 *
 * KFZ-152 Refactor: Helper signAndStoreContract uebernimmt PDF + Storage + DB,
 * damit Buero-Onboarding den gleichen Pfad nutzen kann.
 */
export async function signSvVertrag({
  signaturePngDataUri,
  unterschriftName,
}: {
  signaturePngDataUri: string  // padRef.current.toDataURL('image/png') aus signature_pad
  unterschriftName: string
}): Promise<{ success: boolean; error?: string; vertrag_id?: string; pdf_path?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  const db = createAdminClient()
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  // Profile für Personalisierung der Email
  const { data: profile } = await db.from('profiles')
    .select('email, vorname, nachname')
    .eq('id', user.id)
    .single()

  // 1. Vertrag unterzeichnen + PDF generieren + Storage-Upload
  let result
  try {
    result = await signAndStoreContract({
      vorlage_typ: 'nutzungsbedingungen',
      unterschrift_name: unterschriftName,
      unterschrift_ip: ip,
      unterschrift_user_agent: userAgent,
      signature_png_data_uri: signaturePngDataUri,
      gutachter_id: sv.id,
      rolle: 'Solo-Sachverstaendiger',
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Vertrag konnte nicht erstellt werden' }
  }

  // 2. Audit-Trail: Kooperationsvertrag-Muster als gelesen markieren (separater Eintrag, ohne PDF)
  const { data: kvVorlage } = await db.from('vertragsvorlagen')
    .select('id, version')
    .eq('typ', 'kooperationsvertrag_muster')
    .eq('aktiv', true)
    .limit(1)
    .maybeSingle()
  if (kvVorlage) {
    await db.from('vertraege_unterzeichnet').insert({
      gutachter_id: sv.id,
      vorlage_id: kvVorlage.id,
      vorlage_typ: 'kooperationsvertrag_muster_gelesen',
      vorlage_version: kvVorlage.version,
      unterschrift_name: unterschriftName,
      unterschrift_ip: ip,
      unterschrift_user_agent: userAgent,
    })
  }

  // 3. Status updaten — vertrag_unterschrieben + Zeitstempel
  await db.from('sachverstaendige').update({
    onboarding_status: 'vertrag_unterzeichnet',
    vertrag_unterschrieben: true,
    vertrag_unterschrieben_am: new Date().toISOString(),
  }).eq('id', sv.id)

  // 4. Welcome-Email mit PDF-Anhang (fire & forget)
  try {
    const { sendEmail } = await import('@/lib/email/google/client')
    const { render } = await import('@react-email/render')
    const { SvPortalFreigeschaltetEmail, subject: svPortalSubject } = await import('@/lib/email/google/templates/SvPortalFreigeschaltet')
    if (profile?.email) {
      const props = { vorname: profile.vorname ?? null }
      const html = await render(SvPortalFreigeschaltetEmail(props))
      // TODO: migrate to sendCommunication when attachment support added
      await sendEmail({
        to: profile.email,
        subject: svPortalSubject(props),
        html,
        fallId: null,
        empfaengerTyp: 'sv',
        template: 'sv_onboarding_welcome',
        attachments: [{
          filename: `Claimondo-Nutzungsbedingungen-v${result.vorlage_version}.pdf`,
          content: result.pdf_buffer,
          contentType: 'application/pdf',
        }],
      })
    }
  } catch (err) { console.error('[KFZ-148] Welcome-Mail:', err) }

  revalidatePath('/gutachter/onboarding')
  // BUG-92: Admin-Listing muss frische Daten sehen sobald der SV unterzeichnet hat,
  // sonst zeigt das Status-Badge dort weiter 'Wartet auf Vertrag'.
  revalidatePath('/admin/sachverstaendige', 'page')
  revalidatePath('/admin/karte', 'page')
  return { success: true, vertrag_id: result.vertrag_id, pdf_path: result.pdf_path }
}

/**
 * KFZ-148 / KFZ-156: Stripe Checkout starten (Schritt 3).
 *
 * KFZ-156: Returnt jetzt clientSecret (statt checkoutUrl), damit die
 * Willkommen-Page <EmbeddedCheckout /> mounten kann.
 */
export async function startStripeCheckout(): Promise<{ clientSecret: string; sessionId: string } | { error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { error: 'Kein SV-Profil' }

  try {
    const { createStripeCheckoutSession } = await import('@/lib/stripe/sv-checkout')
    return await createStripeCheckoutSession(sv.id)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Stripe-Fehler' }
  }
}

/**
 * KFZ-148: Onboarding-Daten für die Wizard-Page laden.
 */
export async function getOnboardingData() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null

  const sv = await getGutachterForUser<Record<string, unknown>>(supabase, user.id, 'id, paket, onboarding_status, onboarding_anzahlung_betrag, portal_zugang_freigeschaltet, vertrag_unterschrieben, max_faelle_monat, gebiet_plz, standort_adresse')
  if (!sv) return null

  const db = createAdminClient()

  // Profil-Daten
  const { data: profile } = await db.from('profiles').select('vorname, nachname, email, telefon').eq('id', user.id).single()

  // Vertragsvorlagen
  const { data: vorlagen } = await db.from('vertragsvorlagen')
    .select('id, typ, titel, inhalt_html, pflicht_unterschrift')
    .eq('aktiv', true)

  // Bereits unterzeichnet?
  const { data: unterzeichnet } = await db.from('vertraege_unterzeichnet')
    .select('id, vorlage_typ')
    .eq('gutachter_id', sv.id as string)

  // Anzahlung berechnen (pro Fall im Kontingent)
  const { FINANCE } = await import('@/lib/finance/constants')
  const maxFaelle = Number(sv.max_faelle_monat ?? 10)
  const anzahlung = Number(sv.onboarding_anzahlung_betrag ?? maxFaelle * FINANCE.ANZAHLUNG_PRO_KONTINGENT)

  return {
    svId: sv.id as string,
    paket: sv.paket as string ?? 'standard',
    status: sv.onboarding_status as string,
    portalFreigeschaltet: sv.portal_zugang_freigeschaltet as boolean,
    vertragUnterschrieben: sv.vertrag_unterschrieben as boolean ?? false,
    anzahlung,
    maxFaelle,
    gebietsPlz: sv.gebiet_plz as string ?? '—',
    adresse: sv.standort_adresse as string ?? '—',
    profile: profile ? { vorname: profile.vorname, nachname: profile.nachname, email: profile.email, telefon: profile.telefon } : null,
    vorlagen: vorlagen ?? [],
    bereitsUnterzeichnet: (unterzeichnet ?? []).map(u => u.vorlage_typ),
  }
}
