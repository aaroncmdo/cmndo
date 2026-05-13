'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { convertLeadToClaim } from '@/lib/leads/convert-lead-to-claim'

// AAR-476 C10: Signup + Lead→Fall-Konvertierung.
//
// Unterschied zu signSAandCreateFall (flow/[token]/actions.ts):
//   - User-Supplied-Password statt Magic-Link + generierte Passwörter
//   - Keine SA/Vollmacht beim Signup — sa_unterschrieben bleibt false,
//     abtretung_pdf/abtretung_signiert_am bleiben NULL
//   - Kein gutachter_termine-Handling (der Termin wird später im Kunden-Portal
//     gebucht, nicht im Signup-Flow)
//   - Nach Signup: optional makler_fall_consent + makler_provisionen
//
// Die Kern-Mapping-Logik wird aus lead-fall-mapping.ts wiederverwendet —
// Single Source of Truth für Lead→Fall-Feldkopie.

type Result =
  | { success: true; fallId: string; claimId: string | null }
  | { success: false; error: string; code?: 'EMAIL_EXISTS' }

export async function signupAndConvertLead(input: {
  leadId: string
  email: string
  password: string
  consent_vollzugriff: boolean
}): Promise<Result> {
  if (!input.leadId) return { success: false, error: 'Lead-ID fehlt' }
  if (!input.email || !input.password) {
    return { success: false, error: 'Email oder Passwort fehlt' }
  }
  if (input.password.length < 8) {
    return { success: false, error: 'Passwort zu kurz (min 8 Zeichen)' }
  }

  // 1) Signup via Standard-Client (setzt Session-Cookie)
  const supabase = await createClient()
  const { data: signup, error: signupErr } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { rolle: 'kunde' } },
  })
  if (signupErr) {
    const msg = signupErr.message.toLowerCase()
    if (msg.includes('already') || msg.includes('registered')) {
      return {
        success: false,
        error: 'Diese Email ist bereits registriert.',
        code: 'EMAIL_EXISTS',
      }
    }
    return { success: false, error: signupErr.message }
  }
  if (!signup.user) {
    return { success: false, error: 'Signup fehlgeschlagen (keine User-ID)' }
  }

  // Ab hier mit Admin-Client — Lead/Fall-Writes sollen RLS umgehen und
  // gemeinsam atomar passieren.
  const admin = createAdminClient()

  // 2) profiles-Row sicherstellen — Trigger legt evtl. schon an, upsert
  //    überschreibt nur id+rolle+email, keine weiteren Felder.
  await admin
    .from('profiles')
    .upsert({ id: signup.user.id, rolle: 'kunde', email: input.email })

  // 3) Lead laden inkl. Promo-Code + Makler-Stammdaten
  const { data: leadRaw, error: leadErr } = await admin
    .from('leads')
    .select(
      '*, promotion_code:promotion_codes(id, makler_id, makler:makler(id, firma, provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto))',
    )
    .eq('id', input.leadId)
    .single()
  if (leadErr || !leadRaw) {
    return { success: false, error: 'Lead nicht gefunden' }
  }

  // Nested-FK-Normalisierung (AGENTS.md Inkonsistenz-Check #6)
  const promoCode = Array.isArray(leadRaw.promotion_code)
    ? leadRaw.promotion_code[0]
    : leadRaw.promotion_code
  const maklerFromPromo = promoCode
    ? Array.isArray(promoCode.makler)
      ? promoCode.makler[0]
      : promoCode.makler
    : null

  // 4) CMM-3: Lead → Claim direkt konvertieren. convertLeadToClaim
  // erledigt fall_nummer, KB-Round-Robin, claims-Insert, Sub-Entities
  // (parties, vehicle_involvements), faelle (vollständig bis Phase 6) und
  // setzt Leads-Status auf "umgewandelt" inkl. konvertiert_zu_*-FKs.
  const conv = await convertLeadToClaim({
    leadId: input.leadId,
    triggerByUserId: signup.user.id,
    kundeUserIdOverride: signup.user.id,
  })
  if (!conv.ok) {
    return {
      success: false,
      error: `Konvertierung fehlgeschlagen: ${conv.error}`,
    }
  }
  const fall = { id: conv.fallId, lead_id: input.leadId, service_typ: 'komplett' as string }

  // 5) Beim Signup noch keine SA — die Convert-Funktion füllt
  // sa_unterschrieben/abtretung_* mit Defaults aus dem Lead. Wir korrigieren
  // sie hier explizit auf "nicht unterschrieben" und Status auf
  // "ersterfassung", weil convertLeadToClaim default `status='dispatch_done'`
  // gesetzt hat.
  await admin
    .from('faelle')
    .update({
      sa_unterschrieben: false,
      abtretung_signiert_am: null,
      abtretung_pdf: null,
      status: 'ersterfassung',
    })
    .eq('id', fall.id)

  // 6) Service-Typ aus dem persistierten Fall nachladen für Provisions-Logik
  const { data: fallRow } = await admin
    .from('faelle')
    .select('service_typ')
    .eq('id', fall.id)
    .maybeSingle()
  if (fallRow?.service_typ) fall.service_typ = fallRow.service_typ as string

  // 7) Makler-Consent + Provision (nur wenn Promo-Code auf dem Lead lag)
  if (promoCode && maklerFromPromo?.id) {
    const maklerId = maklerFromPromo.id as string
    const consent_scope = input.consent_vollzugriff ? 'vollzugriff' : 'minimal'

    await admin.from('makler_fall_consent').insert({
      fall_id: fall.id,
      makler_id: maklerId,
      consent_scope,
    })

    await admin.from('faelle').update({ makler_id: maklerId }).eq('id', fall.id)

    const serviceTypFall = fall.service_typ ?? 'komplett'
    const betrag =
      serviceTypFall === 'komplett'
        ? maklerFromPromo.provision_betrag_komplett_netto
        : maklerFromPromo.provision_betrag_nur_gutachter_netto
    if (betrag != null) {
      const now = new Date()
      const holdUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      await admin.from('makler_provisionen').insert({
        makler_id: maklerId,
        lead_id: fall.lead_id,
        fall_id: fall.id,
        promotion_code_id: promoCode.id,
        betrag_netto_eur: betrag,
        service_typ: serviceTypFall === 'komplett' ? 'komplett' : 'nur_gutachter',
        trigger_event: 'fall_erstellt',
        trigger_at: now.toISOString(),
        hold_until: holdUntil.toISOString(),
      })
    }
  }

  // 13.05.2026 Server-Actions-Audit Fix: Lead → Fall + ggf. Makler-Consent +
  // Provision werden hier atomar angelegt. Ohne revalidate sehen Dispatch
  // (neue Fälle) + Makler (neue Provision + Akte) + Admin-Übersicht ihre
  // frisch erzeugten Datensätze erst nach Hard-Refresh.
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/dashboard')
  revalidatePath('/admin/faelle')
  revalidatePath('/admin/finance/provisionen')
  revalidatePath('/makler/leads')
  revalidatePath('/makler/akten')

  return { success: true, fallId: fall.id, claimId: conv.claimId }
}

// AAR-476 Helper: Lädt die Daten die der SignupClient für die Render-
// Entscheidung (Makler-Consent-Box sichtbar / Email prefill) braucht.
// Gibt nur unkritische Felder zurück.
export async function loadLeadForSignup(leadId: string): Promise<
  | {
      success: true
      lead: {
        id: string
        email: string | null
        maklerFirma: string | null
        hasPromotionCode: boolean
      }
    }
  | { success: false; error: string }
> {
  if (!leadId) return { success: false, error: 'Lead-ID fehlt' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('leads')
    .select(
      'id, email, promotion_code_id, promotion_code:promotion_codes(makler:makler(firma))',
    )
    .eq('id', leadId)
    .single()
  if (error || !data) return { success: false, error: 'Lead nicht gefunden' }
  const promo = Array.isArray(data.promotion_code)
    ? data.promotion_code[0]
    : data.promotion_code
  const makler = promo
    ? Array.isArray(promo.makler)
      ? promo.makler[0]
      : promo.makler
    : null
  return {
    success: true,
    lead: {
      id: data.id as string,
      email: (data.email as string | null) ?? null,
      maklerFirma: (makler?.firma as string | null) ?? null,
      hasPromotionCode: !!data.promotion_code_id,
    },
  }
}
