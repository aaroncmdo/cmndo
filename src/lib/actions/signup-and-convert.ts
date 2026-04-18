'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildFallInsertFromLead,
  resolveFallEntityFks,
} from '@/lib/lead-fall-mapping'

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
  | { success: true; fallId: string }
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

  // 4) Fallnummer CLM-YYYYMMDD-NNN
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await admin
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .like('fall_nummer', `CLM-${dateStr}-%`)
  const nr = String((count ?? 0) + 1).padStart(3, '0')
  const fallNummer = `CLM-${dateStr}-${nr}`

  // 5) Kundenbetreuer per Round-Robin — min aktive Fälle gewinnt
  let kundenbetreuerId: string | null = null
  const { data: betreuer } = await admin
    .from('profiles')
    .select('id')
    .in('rolle', ['kundenbetreuer', 'admin'])
    .limit(10)
  if (betreuer && betreuer.length > 0) {
    const counts: Record<string, number> = {}
    for (const b of betreuer) {
      const { count: c } = await admin
        .from('faelle')
        .select('id', { count: 'exact', head: true })
        .eq('kundenbetreuer_id', b.id)
        .not('status', 'in', '("abgeschlossen","storniert")')
      counts[b.id] = c ?? 0
    }
    const min = betreuer.reduce(
      (m, b) => ((counts[b.id] ?? 0) < (counts[m.id] ?? 0) ? b : m),
      betreuer[0],
    )
    kundenbetreuerId = min.id
  }

  // 6) Entity-FKs (versicherung/kanzlei/organisation/leadbearbeiter)
  const entityFks = await resolveFallEntityFks(admin, leadRaw, null)

  // 7) Fall-Insert — SA-Felder überschreiben: beim Signup noch keine SA
  const fallInsert = buildFallInsertFromLead(leadRaw, {
    fallNummer,
    kundenbetreuerId,
    svIdFromTermin: null,
    signatureUrl: '',
    ...entityFks,
  })
  fallInsert.kunde_id = signup.user.id
  fallInsert.sa_unterschrieben = false
  fallInsert.abtretung_signiert_am = null
  fallInsert.abtretung_pdf = null
  fallInsert.status = 'ersterfassung'

  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .insert(fallInsert)
    .select('id, service_typ, lead_id')
    .single()
  if (fallErr || !fall) {
    return {
      success: false,
      error: `Fall-Erstellung fehlgeschlagen: ${fallErr?.message ?? 'unbekannt'}`,
    }
  }

  // 8) Lead-Status auf „umgewandelt" setzen + FK zurückschreiben
  await admin
    .from('leads')
    .update({
      status: 'umgewandelt',
      qualifizierungs_phase: 'abgeschlossen',
      konvertiert_zu_fall_id: fall.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.leadId)

  // 9) Makler-Consent + Provision (nur wenn Promo-Code auf dem Lead lag)
  if (promoCode && maklerFromPromo?.id) {
    const maklerId = maklerFromPromo.id as string
    const consent_scope = input.consent_vollzugriff ? 'vollzugriff' : 'minimal'

    await admin.from('makler_fall_consent').insert({
      fall_id: fall.id,
      makler_id: maklerId,
      consent_scope,
    })

    await admin.from('faelle').update({ makler_id: maklerId }).eq('id', fall.id)

    // Provisions-Betrag abhängig vom service_typ im Fall
    const serviceTypFall = (fall.service_typ as string) ?? 'komplett'
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

  return { success: true, fallId: fall.id }
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
