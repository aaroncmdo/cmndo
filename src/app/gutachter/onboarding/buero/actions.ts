'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { signAndStoreContract } from '@/lib/contracts/sign-and-store'
import { PAKET_KONTINGENT, berechneStandortAnzahlung, type BueroStandortInput } from './constants'

// KFZ-152 Block C: Buero-Onboarding Server Actions

/**
 * Schritt 1: Buero anlegen + Sub-Standorte registrieren.
 * Erstellt organisationen-Eintrag (typ='buero', onboarding_status='pending')
 * + N+1 sachverstaendige (1 Inhaber ohne Kontingent + N Sub-Bueros mit Paket).
 */
export async function createBueroOrganisation(data: {
  buero_name: string
  rechtsform: string
  anschrift: string
  steuernummer: string
  ust_id: string
  standorte: BueroStandortInput[]
}): Promise<{ organisation_id: string; gesamt_anzahlung: number } | { error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  if (!data.buero_name?.trim()) return { error: 'Bueroname fehlt' }
  if (!data.standorte?.length) return { error: 'Mindestens ein Standort erforderlich' }

  const db = createAdminClient()

  // 1. Organisation anlegen
  const { data: org, error: orgErr } = await db.from('organisationen').insert({
    name: data.buero_name,
    typ: 'buero',
    rechtsform: data.rechtsform || null,
    anschrift: data.anschrift || null,
    steuernummer: data.steuernummer || null,
    ust_id: data.ust_id || null,
    hauptansprechpartner_user_id: user.id,
    parent_user_id: user.id,
    onboarding_status: 'pending',
  }).select('id').single()

  if (orgErr || !org) return { error: orgErr?.message ?? 'Org-Anlage fehlgeschlagen' }

  // 2. Inhaber-Eintrag (verwaltet, kein eigenes Kontingent)
  const { data: inhaberSv, error: inhaberErr } = await db.from('sachverstaendige').insert({
    profile_id: user.id,
    organisation_id: org.id,
    rolle_in_organisation: 'inhaber',
    paket: 'standard', // Pflichtfeld, wird nicht genutzt
    paket_faelle_gesamt: 0, // Inhaber bekommt keine Fälle persönlich
    onboarding_status: 'pending',
    onboarding_anzahlung_betrag: 0,
    ist_aktiv: false,
    ist_parent_account: true,
    portal_zugang_freigeschaltet: false, // BUG-FOLLOW-1 workaround: DB-Default ist faelschlich true
  }).select('id').single()

  if (inhaberErr || !inhaberSv) {
    await db.from('organisationen').delete().eq('id', org.id)
    return { error: inhaberErr?.message ?? 'Inhaber-Anlage fehlgeschlagen' }
  }

  // 3. Sub-Standorte anlegen
  let gesamtAnzahlung = 0
  for (const std of data.standorte) {
    const standortAnzahlung = berechneStandortAnzahlung(std.paket)
    gesamtAnzahlung += standortAnzahlung

    const { error: subErr } = await db.from('sachverstaendige').insert({
      organisation_id: org.id,
      rolle_in_organisation: 'mitarbeiter',
      paket: std.paket,
      paket_faelle_gesamt: PAKET_KONTINGENT[std.paket],
      standort_adresse: std.anschrift || null,
      standort_plz: std.plz || null,
      standort_lat: std.lat,
      standort_lng: std.lng,
      standort_place_id: std.place_id || null,
      gebiet_plz: std.plz ? [std.plz] : [],
      onboarding_status: 'pending',
      onboarding_anzahlung_betrag: standortAnzahlung,
      ist_aktiv: false,
      ist_parent_account: false,
      portal_zugang_freigeschaltet: false, // BUG-FOLLOW-1 workaround: DB-Default ist faelschlich true
    })

    if (subErr) {
      // Cleanup
      await db.from('sachverstaendige').delete().eq('organisation_id', org.id)
      await db.from('organisationen').delete().eq('id', org.id)
      return { error: `Standort '${std.name}' konnte nicht angelegt werden: ${subErr.message}` }
    }
  }

  return { organisation_id: org.id, gesamt_anzahlung: gesamtAnzahlung }
}

/**
 * Schritt 2: Vertrag unterzeichnen — Buero-Inhaber unterzeichnet stellvertretend
 * fuer alle aktuellen und zukuenftigen Standorte. Nutzt den shared
 * signAndStoreContract Helper (PDF + Storage + DB) wie KFZ-148.
 */
export async function signBueroVertrag(params: {
  organisation_id: string
  signaturePngDataUri: string  // padRef.current.toDataURL('image/png')
  unterschriftName: string
}): Promise<{ success: boolean; error?: string; vertrag_id?: string; pdf_path?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()

  // Org gehoert dem aktuellen User?
  const { data: org } = await db.from('organisationen')
    .select('id, name, hauptansprechpartner_user_id')
    .eq('id', params.organisation_id)
    .single()
  if (!org || org.hauptansprechpartner_user_id !== user.id) {
    return { success: false, error: 'Keine Berechtigung' }
  }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  // Vertrag unterzeichnen + PDF + Storage in einem Step
  let result
  try {
    result = await signAndStoreContract({
      vorlage_typ: 'nutzungsbedingungen',
      unterschrift_name: params.unterschriftName,
      unterschrift_ip: ip,
      unterschrift_user_agent: userAgent,
      signature_png_data_uri: params.signaturePngDataUri,
      organisation_id: params.organisation_id,
      rolle: 'Buero-Inhaber (stellvertretend fuer alle Standorte)',
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

  // BUG-92: Inhaber-sachverstaendige-Row muss vertrag_unterschrieben=true bekommen,
  // damit das Admin-Status-Badge von 'Wartet auf Vertrag' (gelb) auf 'Wartet auf
  // Anzahlung' (orange) wechselt. signBueroVertrag aktualisierte bisher nur
  // organisationen.onboarding_status, nicht aber den SV-Eintrag des Inhabers.
  // Sub-SVs bleiben unangetastet — die akzeptieren AGB separat ueber FR-3
  // akzeptiereAgbSubSv (oder werden spaetestens im Webhook defensiv mitgezogen).
  await db.from('sachverstaendige').update({
    vertrag_unterschrieben: true,
    vertrag_unterschrieben_am: new Date().toISOString(),
    onboarding_status: 'vertrag_unterzeichnet',
  }).eq('organisation_id', params.organisation_id).eq('ist_parent_account', true)

  // Welcome-Email mit PDF-Anhang an den Inhaber
  try {
    const { sendEmail } = await import('@/lib/email/google/client')
    const { render } = await import('@react-email/render')
    const { BueroSubSvEinladungEmail, subject: bueroSubject } = await import('@/lib/email/google/templates/BueroSubSvEinladung')
    const { data: profile } = await db.from('profiles').select('email, vorname').eq('id', user.id).single()
    if (profile?.email) {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'
      const props = {
        vorname: profile.vorname ?? null,
        bueroName: org.name,
        portalUrl: `${APP_URL}/gutachter/onboarding/buero`,
      }
      const html = await render(BueroSubSvEinladungEmail(props))
      // TODO: migrate to sendCommunication when attachment support added
      await sendEmail({
        to: profile.email,
        subject: bueroSubject(props),
        html,
        fallId: null,
        empfaengerTyp: 'sv',
        template: 'buero_onboarding_vertrag',
        attachments: [{
          filename: `Claimondo-Buero-Vertrag-v${result.vorlage_version}.pdf`,
          content: result.pdf_buffer,
          contentType: 'application/pdf',
        }],
      })
    }
  } catch (err) { console.error('[KFZ-152] Buero-Vertrag-Email:', err) }

  // BUG-92: Admin-Listing muss frische Daten sehen sobald der Buero-Inhaber
  // unterzeichnet hat, sonst zeigt das Status-Badge dort weiter 'Wartet auf Vertrag'.
  revalidatePath('/admin/sachverstaendige', 'page')
  revalidatePath('/admin/sachverstaendige/karte', 'page')
  revalidatePath('/admin/organisationen', 'page')

  return { success: true, vertrag_id: result.vertrag_id, pdf_path: result.pdf_path }
}

/**
 * Schritt 3 / KFZ-156: Stripe Checkout fuer Gesamt-Anzahlung des Bueros starten.
 *
 * KFZ-156: Returnt clientSecret fuer Embedded Checkout statt checkoutUrl.
 */
export async function startBueroStripeCheckout(organisationId: string): Promise<{ clientSecret: string; sessionId: string } | { error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  try {
    const { createBueroCheckoutSession } = await import('@/lib/stripe/buero-checkout')
    return await createBueroCheckoutSession(organisationId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Stripe-Fehler' }
  }
}
