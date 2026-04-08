'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

/**
 * KFZ-148: Vertrag unterzeichnen (Schritt 2).
 * Speichert Akzeptanz in vertraege_unterzeichnet, generiert PDF (TODO), sendet Email.
 */
export async function signSvVertrag({
  signatureSvg,
  unterschriftName,
}: {
  signatureSvg: string
  unterschriftName: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  const db = createAdminClient()

  // Aktive Vertragsvorlagen laden
  const { data: nbVorlage } = await db.from('vertragsvorlagen')
    .select('id, version')
    .eq('typ', 'nutzungsbedingungen')
    .eq('aktiv', true)
    .limit(1)
    .single()

  const { data: kvVorlage } = await db.from('vertragsvorlagen')
    .select('id, version')
    .eq('typ', 'kooperationsvertrag_muster')
    .eq('aktiv', true)
    .limit(1)
    .maybeSingle()

  if (!nbVorlage) return { success: false, error: 'Nutzungsbedingungen nicht verfügbar' }

  // IP + User-Agent
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  // 1. Insert Nutzungsbedingungen-Akzeptanz
  const { error: nbErr } = await db.from('vertraege_unterzeichnet').insert({
    gutachter_id: sv.id,
    vorlage_id: nbVorlage.id,
    vorlage_typ: 'nutzungsbedingungen',
    vorlage_version: nbVorlage.version,
    unterschrift_name: unterschriftName,
    unterschrift_ip: ip,
    unterschrift_user_agent: userAgent,
  })
  if (nbErr) return { success: false, error: nbErr.message }

  // 2. Insert Kooperationsvertrag-Muster gelesen (Audit-Trail)
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

  // 3. TODO: PDF-Generierung mit eingebrannter Unterschrift
  // PDF enthält: Claimondo Header, "Bestätigung Nutzungsbedingungen-Akzeptanz",
  // SV-Stammdaten, eingebrannte SVG-Unterschrift, Footer mit IP+Timestamp
  // Für jetzt: ohne PDF, wird in Folge-Task ergänzt

  // 4. Status updaten
  await db.from('sachverstaendige').update({
    onboarding_status: 'vertrag_unterzeichnet',
    vertrag_unterschrieben: true,
  }).eq('id', sv.id)

  // 5. Welcome-Email (fire & forget)
  try {
    const { sendEmail } = await import('@/lib/email/google/client')
    const { data: profile } = await db.from('profiles').select('email, vorname').eq('id', user.id).single()
    if (profile?.email) {
      await sendEmail({
        to: profile.email,
        subject: 'Willkommen bei Claimondo — deine nächsten Schritte',
        html: `<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.7;color:#374151">
<p>Hallo ${profile.vorname ?? 'Partner'},</p>
<p>vielen Dank für die Unterzeichnung der Nutzungsbedingungen. Dein Portal-Zugang wird freigeschaltet sobald die Anzahlung eingegangen ist.</p>
<p><strong>Nächster Schritt:</strong> Bitte leiste die Anzahlung über den Stripe-Checkout in deinem Onboarding-Bereich.</p>
<p>Bei Fragen stehen wir dir jederzeit zur Verfügung.</p>
<p>Dein Claimondo-Team</p></div>`,
        fallId: null,
        empfaengerTyp: 'sv',
        template: 'sv_onboarding_welcome',
      })
    }
  } catch (err) { console.error('[KFZ-148] Welcome-Mail:', err) }

  revalidatePath('/gutachter/onboarding')
  return { success: true }
}

/**
 * KFZ-148: Stripe Checkout starten (Schritt 3).
 */
export async function startStripeCheckout(): Promise<{ checkoutUrl: string } | { error: string }> {
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

  // Anzahlung berechnen (150 EUR netto pro Fall im Kontingent)
  const maxFaelle = Number(sv.max_faelle_monat ?? 10)
  const anzahlung = Number(sv.onboarding_anzahlung_betrag ?? maxFaelle * 150)

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
