'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

/**
 * ARCH-1 FR-3: Sub-Mitarbeiter akzeptiert nur Nutzungsbedingungen + AGB + DS
 * via Checkbox+Name (kein PDF, keine Signatur). Schreibt audit-trail nach
 * vertraege_unterzeichnet und markiert den SV als vertrag_unterschrieben.
 *
 * Wenn der Inhaber bereits bezahlt hat (Org aktiv ODER irgendein anderer
 * Sub-SV der Org bereits portal_zugang_freigeschaltet=true), wird der
 * Sub-SV sofort freigeschaltet und kann ins Dashboard.
 * Sonst landet er auf einer Warte-Page bis der Inhaber zahlt.
 */
export async function akzeptiereAgbSubSv(
  sv_id: string,
  name: string,
): Promise<{ success: boolean; freigeschaltet?: boolean; error?: string }> {
  if (!sv_id || !name?.trim()) {
    return { success: false, error: 'sv_id und name sind Pflicht' }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()

  // 1. SV laden + Eigentum verifizieren (profile_id ODER user_id)
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('id, profile_id, user_id, organisation_id, rolle_in_organisation, portal_zugang_freigeschaltet, onboarding_anzahlung_betrag')
    .eq('id', sv_id)
    .maybeSingle()

  if (!sv) return { success: false, error: 'SV nicht gefunden' }
  if (sv.profile_id !== user.id && sv.user_id !== user.id) {
    return { success: false, error: 'Keine Berechtigung' }
  }
  if (!sv.organisation_id) {
    return { success: false, error: 'SV ohne Organisation kann nicht als Sub-Mitarbeiter akzeptieren' }
  }
  // Sicherheits-Check: Inhaber-Branch darf nicht hier landen
  const rolle = (sv.rolle_in_organisation ?? '').toLowerCase()
  if (rolle === 'inhaber') {
    return { success: false, error: 'Inhaber muessen den Buero-Vertrag mit Signatur unterzeichnen' }
  }

  // 2. Aktive Nutzungsbedingungen-Vorlage als Referenz laden
  const { data: vorlage } = await db
    .from('vertragsvorlagen')
    .select('id, version')
    .eq('typ', 'nutzungsbedingungen')
    .eq('aktiv', true)
    .limit(1)
    .maybeSingle()

  if (!vorlage) {
    return { success: false, error: 'Keine aktive Nutzungsbedingungen-Vorlage hinterlegt' }
  }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  // 3. vertraege_unterzeichnet-Eintrag schreiben (kein PDF, keine Signatur)
  const { error: insertErr } = await db.from('vertraege_unterzeichnet').insert({
    sv_id: sv.id,
    organisation_id: sv.organisation_id,
    vorlage_id: vorlage.id,
    vorlage_typ: 'agb_sub_mitarbeiter',
    vorlage_version: vorlage.version,
    unterschrift_name: name.trim(),
    unterschrift_ip: ip,
    unterschrift_user_agent: userAgent,
    pdf_storage_path: null,
  })

  if (insertErr) {
    return { success: false, error: `Audit-Trail konnte nicht geschrieben werden: ${insertErr.message}` }
  }

  // 4. SV-Status updaten
  await db.from('sachverstaendige').update({
    vertrag_unterschrieben: true,
    vertrag_unterschrieben_am: new Date().toISOString(),
    onboarding_status: 'vertrag_unterzeichnet',
  }).eq('id', sv.id)

  // 5. Hat der Inhaber bereits bezahlt?
  //    - Variante A: Org-Status='aktiv' (KFZ-152 Buero-Anzahlung-Webhook)
  //    - Variante B: irgendein anderer SV der Org ist schon portal_zugang_freigeschaltet=true
  const { data: org } = await db
    .from('organisationen')
    .select('onboarding_status')
    .eq('id', sv.organisation_id)
    .maybeSingle()

  let inhaberHatBezahlt = org?.onboarding_status === 'aktiv'
  if (!inhaberHatBezahlt) {
    const { data: andere } = await db
      .from('sachverstaendige')
      .select('id, portal_zugang_freigeschaltet')
      .eq('organisation_id', sv.organisation_id)
      .neq('id', sv.id)
    inhaberHatBezahlt = (andere ?? []).some(s => s.portal_zugang_freigeschaltet === true)
  }

  if (inhaberHatBezahlt) {
    // Inhaber hat bereits bezahlt → Sub-SV sofort freischalten
    // BUG-FOLLOW-4 analog: Werbebudget initialisieren falls nicht schon gesetzt
    await db.from('sachverstaendige').update({
      portal_zugang_freigeschaltet: true,
      onboarding_status: 'bezahlt',
      anzahlung_status: 'bezahlt',
      ist_aktiv: true,
      werbebudget_guthaben_netto: Number(sv.onboarding_anzahlung_betrag ?? 0),
    }).eq('id', sv.id)

    revalidatePath('/gutachter/willkommen', 'page')
    return { success: true, freigeschaltet: true }
  }

  revalidatePath('/gutachter/willkommen', 'page')
  return { success: true, freigeschaltet: false }
}
