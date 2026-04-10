'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Stripe wird in retryEinzug() lazy via dynamic import geladen — sonst crasht
// 'next build' im Page-Data-Collection-Schritt falls STRIPE_SECRET_KEY
// zur Build-Zeit nicht gesetzt ist (siehe stripe/webhook/route.ts).

// KFZ-149 Hund-D: Server Actions fuer das /admin/abrechnungen Listing.
//   - retryEinzug : startet einen erneuten Stripe-Lastschrift-Einzug
//   - markBezahlt : manuell als bezahlt markieren (z.B. nach Bank-Ueberweisung)

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins' }
  return { ok: true }
}

/**
 * Manueller Retry des Lastschrift-Einzugs fuer eine fehlgeschlagene Abrechnung.
 * Resettet die einzug_versucht_am Sperre nicht — wir machen einen neuen Versuch
 * und ueberschreiben einzug_versucht_am und einzug_fehler.
 */
export async function retryEinzug(abrechnung_id: string): Promise<{ success: boolean; error?: string; payment_intent_id?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()

  const { data: abr } = await db.from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_typ, empfaenger_id, summe_brutto, bezahlt_am')
    .eq('id', abrechnung_id)
    .maybeSingle()
  if (!abr) return { success: false, error: 'Abrechnung nicht gefunden' }
  if (abr.bezahlt_am) return { success: false, error: 'Abrechnung ist bereits bezahlt' }
  if (abr.empfaenger_typ !== 'sv') return { success: false, error: 'Retry nur fuer SV-Abrechnungen unterstuetzt' }
  if (!abr.empfaenger_id || !abr.summe_brutto) return { success: false, error: 'empfaenger_id oder Betrag fehlt' }

  // KFZ-152 Phase 2+3 Fix: empfaenger_id kann SV-Id, profile_id ODER org_id sein
  let svRow: { id: string; stripe_customer_id: string | null; stripe_default_payment_method_id: string | null; organisation_id: string | null } | null = null
  let orgRow: { id: string; parent_stripe_customer_id: string | null; parent_stripe_default_pm_id: string | null; typ: string | null } | null = null
  {
    const { data } = await db.from('sachverstaendige')
      .select('id, stripe_customer_id, stripe_default_payment_method_id, organisation_id')
      .eq('id', abr.empfaenger_id)
      .maybeSingle()
    if (data) svRow = data
  }
  if (!svRow) {
    const { data } = await db.from('sachverstaendige')
      .select('id, stripe_customer_id, stripe_default_payment_method_id, organisation_id')
      .eq('profile_id', abr.empfaenger_id)
      .limit(1)
      .maybeSingle()
    if (data) svRow = data
  }
  if (!svRow) {
    // Org-Sammelrechnung
    const { data } = await db.from('organisationen')
      .select('id, parent_stripe_customer_id, parent_stripe_default_pm_id, typ')
      .eq('id', abr.empfaenger_id)
      .maybeSingle()
    if (data) orgRow = data
  }
  if (!svRow && !orgRow) return { success: false, error: 'Kein Sachverstaendiger / keine Organisation gefunden' }

  let customerId: string | null = null
  let pmId: string | null = null
  if (orgRow) {
    customerId = orgRow.parent_stripe_customer_id
    pmId = orgRow.parent_stripe_default_pm_id
  } else if (svRow) {
    customerId = svRow.stripe_customer_id
    pmId = svRow.stripe_default_payment_method_id
    if ((!customerId || !pmId) && svRow.organisation_id) {
      const { data: org } = await db.from('organisationen')
        .select('parent_stripe_customer_id, parent_stripe_default_pm_id')
        .eq('id', svRow.organisation_id)
        .maybeSingle()
      customerId = customerId ?? (org?.parent_stripe_customer_id ?? null)
      pmId = pmId ?? (org?.parent_stripe_default_pm_id ?? null)
    }
  }

  if (!customerId || !pmId) return { success: false, error: 'Stripe Customer oder Payment Method fehlt — bitte Profil pruefen' }

  const { stripe } = await import('@/lib/stripe/client')

  try {
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(Number(abr.summe_brutto) * 100),
      currency: 'eur',
      customer: customerId,
      payment_method: pmId,
      confirm: true,
      off_session: true,
      description: orgRow
        ? `Claimondo Sammelabrechnung ${abr.abrechnungs_nr} (${orgRow.typ}, manueller Retry)`
        : `Claimondo Monatsabrechnung ${abr.abrechnungs_nr} (manueller Retry)`,
      metadata: {
        abrechnung_id: abr.id,
        abrechnungs_nr: abr.abrechnungs_nr,
        empfaenger_typ: orgRow ? 'org' : 'sv',
        ...(svRow ? { gutachter_id: svRow.id } : {}),
        ...(orgRow ? { organisation_id: orgRow.id, organisation_typ: orgRow.typ ?? '' } : {}),
        manueller_retry: 'true',
      },
    })

    if (pi.status === 'succeeded') {
      const bezahltAm = new Date().toISOString()
      await db.from('abrechnungen').update({
        bezahlt_am: bezahltAm,
        bezahlt_betrag: Number(abr.summe_brutto),
        einzug_versucht_am: bezahltAm,
        einzug_fehler: null,
        stripe_payment_intent_id: pi.id,
        status: 'bezahlt',
        updated_at: bezahltAm,
      }).eq('id', abr.id)

      // Bezahlt-Bestaetigungs-Mail an SV (best effort, blockt Retry-Erfolg nicht)
      try {
        const { data: full } = await db.from('abrechnungen')
          .select('empfaenger_email, empfaenger_id')
          .eq('id', abr.id).maybeSingle()
        if (full?.empfaenger_email) {
          let vorname: string | null = null
          if (full.empfaenger_id) {
            const { data: sub } = await db.from('sachverstaendige')
              .select('profile_id').eq('id', full.empfaenger_id).maybeSingle()
            const profileId = sub?.profile_id ?? full.empfaenger_id
            const { data: p } = await db.from('profiles')
              .select('vorname').eq('id', profileId).maybeSingle()
            vorname = p?.vorname ?? null
          }
          const { render } = await import('@react-email/render')
          const { AbrechnungBezahltConfirmationEmail, subject: bezahltSubject } =
            await import('@/lib/email/google/templates/AbrechnungBezahltConfirmation')
          const { sendEmail } = await import('@/lib/email/google/client')
          const props = {
            vorname,
            abrechnungs_nr: abr.abrechnungs_nr,
            summe_brutto: Number(abr.summe_brutto ?? 0),
            bezahlt_am: bezahltAm,
            stripe_payment_intent_id: pi.id,
            manuell: true,
          }
          await sendEmail({
            to: full.empfaenger_email,
            subject: bezahltSubject(props),
            html: await render(AbrechnungBezahltConfirmationEmail(props)),
            empfaengerTyp: 'sv',
            template: 'abrechnung_bezahlt_confirmation',
          })
        }
      } catch (mailErr) {
        console.error('[KFZ-149 retry] Bezahlt-Mail fehlgeschlagen:', mailErr)
      }

      revalidatePath('/admin/abrechnungen', 'page')
      return { success: true, payment_intent_id: pi.id }
    }

    await db.from('abrechnungen').update({
      einzug_versucht_am: new Date().toISOString(),
      einzug_fehler: `PaymentIntent status=${pi.status}`,
      stripe_payment_intent_id: pi.id,
      status: 'fehlgeschlagen',
      updated_at: new Date().toISOString(),
    }).eq('id', abr.id)
    revalidatePath('/admin/abrechnungen', 'page')
    return { success: false, error: `PaymentIntent ist im Status '${pi.status}' (kein 'succeeded'). PaymentIntent-ID: ${pi.id}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.from('abrechnungen').update({
      einzug_versucht_am: new Date().toISOString(),
      einzug_fehler: msg,
      status: 'fehlgeschlagen',
      updated_at: new Date().toISOString(),
    }).eq('id', abr.id)
    revalidatePath('/admin/abrechnungen', 'page')
    return { success: false, error: msg }
  }
}

/**
 * Manuelle Markierung als bezahlt — z.B. nach Bank-Ueberweisung die nicht
 * ueber Stripe lief. Setzt bezahlt_am, bezahlt_betrag und status='bezahlt'.
 */
export async function markBezahlt(abrechnung_id: string, notiz?: string): Promise<{ success: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()

  const { data: abr } = await db.from('abrechnungen')
    .select('id, summe_brutto, bezahlt_am, notiz')
    .eq('id', abrechnung_id)
    .maybeSingle()
  if (!abr) return { success: false, error: 'Abrechnung nicht gefunden' }
  if (abr.bezahlt_am) return { success: false, error: 'Abrechnung ist bereits bezahlt' }

  const neueNotiz = [abr.notiz, notiz?.trim()].filter(Boolean).join('\n---\n').trim() || null

  const { error } = await db.from('abrechnungen').update({
    bezahlt_am: new Date().toISOString(),
    bezahlt_betrag: Number(abr.summe_brutto ?? 0),
    status: 'bezahlt',
    notiz: neueNotiz,
    updated_at: new Date().toISOString(),
  }).eq('id', abrechnung_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/abrechnungen', 'page')
  return { success: true }
}

/**
 * KFZ-150: Abrechnung stornieren.
 * - Nicht bezahlt: Status storniert + Stripe PI Cancel + Storno-Rechnung (neg. Betrag)
 * - Bezahlt: Stripe Refund + Status storniert + Storno-Rechnung
 * - Email an Empfänger + Timeline-Eintrag
 */
export async function stornoAbrechnung(
  abrechnung_id: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!grund.trim()) return { success: false, error: 'Storno-Grund ist Pflicht' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  const db = createAdminClient()

  const { data: abr } = await db.from('abrechnungen')
    .select('id, abrechnungs_nr, status, bezahlt_am, summe_netto, summe_brutto, ust_satz, ust_betrag, empfaenger_typ, empfaenger_id, empfaenger_email, empfaenger_name, stripe_payment_intent_id, abrechnungs_zeitraum_start, abrechnungs_zeitraum_ende')
    .eq('id', abrechnung_id)
    .maybeSingle()
  if (!abr) return { success: false, error: 'Abrechnung nicht gefunden' }
  if (abr.status === 'storniert') return { success: false, error: 'Bereits storniert' }

  const now = new Date().toISOString()

  // 1. Bei bezahlter Rechnung: Stripe Refund
  if (abr.bezahlt_am && abr.stripe_payment_intent_id) {
    try {
      const { stripe } = await import('@/lib/stripe/client')
      await stripe.refunds.create({ payment_intent: abr.stripe_payment_intent_id })
    } catch (e) {
      console.error('[KFZ-150] Stripe Refund fehlgeschlagen:', e)
      // Continue with storno even if refund fails — admin can handle manually
    }
  }

  // 2. Bei nicht bezahlter Rechnung: Stripe PI canceln
  if (!abr.bezahlt_am && abr.stripe_payment_intent_id) {
    try {
      const { stripe } = await import('@/lib/stripe/client')
      await stripe.paymentIntents.cancel(abr.stripe_payment_intent_id)
    } catch { /* already cancelled/captured */ }
  }

  // 3. Status auf storniert setzen
  await db.from('abrechnungen').update({
    status: 'storniert',
    storniert_am: now,
    storniert_grund: grund.trim(),
    updated_at: now,
  }).eq('id', abrechnung_id)

  // 4. Storno-Rechnung erstellen (negativer Betrag, bezieht sich auf Original)
  const stornoNr = `${abr.abrechnungs_nr}-S`
  await db.from('abrechnungen').insert({
    empfaenger_typ: abr.empfaenger_typ,
    empfaenger_id: abr.empfaenger_id,
    empfaenger_email: abr.empfaenger_email,
    empfaenger_name: abr.empfaenger_name,
    abrechnungs_nr: stornoNr,
    abrechnungs_zeitraum_start: abr.abrechnungs_zeitraum_start,
    abrechnungs_zeitraum_ende: abr.abrechnungs_zeitraum_ende,
    positionen: [{ typ: 'storno', bezeichnung: `Storno zu ${abr.abrechnungs_nr}`, betrag: -Number(abr.summe_netto) }],
    summe_netto: -Number(abr.summe_netto),
    ust_satz: Number(abr.ust_satz ?? 19),
    ust_betrag: -Number(abr.ust_betrag ?? 0),
    summe_brutto: -Number(abr.summe_brutto),
    status: 'versendet',
    versand_datum: now,
    notiz: `Storno-Rechnung zu ${abr.abrechnungs_nr}. Grund: ${grund.trim()}`,
  })

  // 5. Email an Empfänger
  try {
    const { sendEmail } = await import('@/lib/email/google/client')
    const { render } = await import('@react-email/render')
    const { AbrechnungManuellVersendetEmail, subject: stornoSubject } = await import('@/lib/email/google/templates/AbrechnungManuellVersendet')
    const stornoProps = {
      empfaengerVorname: abr.empfaenger_name?.split(' ')[0] ?? null,
      abrechnungsNr: abr.abrechnungs_nr,
      betragBrutto: Number(abr.summe_brutto ?? 0),
      stornoGrund: grund.trim(),
      stornoNr,
      istStorno: true,
      wirdErstattet: !!abr.bezahlt_am,
    }
    const html = await render(AbrechnungManuellVersendetEmail(stornoProps))
    await sendEmail({
      to: abr.empfaenger_email,
      subject: stornoSubject(stornoProps),
      html,
      empfaengerTyp: abr.empfaenger_typ ?? 'sv',
      template: 'abrechnung_storno',
    })
  } catch (e) {
    console.error('[KFZ-150] Storno-Email fehlgeschlagen:', e)
  }

  // 6. Timeline-Einträge für betroffene Fälle
  const { data: betroffeneFaelle } = await db.from('faelle')
    .select('id')
    .eq('abrechnung_id', abrechnung_id)
  for (const f of betroffeneFaelle ?? []) {
    await db.from('timeline').insert({
      fall_id: f.id,
      typ: 'system',
      titel: 'Abrechnung storniert',
      beschreibung: `Rechnung ${abr.abrechnungs_nr} wurde storniert. Grund: ${grund.trim()}`,
      erstellt_von: user?.id ?? null,
    })
  }

  revalidatePath('/admin/abrechnungen', 'page')
  return { success: true }
}

/**
 * KFZ-150: Re-Issue einer stornierten Abrechnung.
 * Erstellt neue Korrekturabrechnung. Optional mit Korrekturen an Positionen.
 */
export async function reIssueAbrechnung(
  abrechnung_id: string,
  korrekturen?: { fall_id: string; neuer_betrag_netto: number }[],
): Promise<{ success: boolean; error?: string; neue_abrechnung_id?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()

  const { data: abr } = await db.from('abrechnungen')
    .select('id, status, storniert_am, ersetzt_durch_abrechnung_id')
    .eq('id', abrechnung_id)
    .maybeSingle()
  if (!abr) return { success: false, error: 'Abrechnung nicht gefunden' }
  if (abr.status !== 'storniert' || !abr.storniert_am) return { success: false, error: 'Abrechnung muss zuerst storniert sein' }
  if (abr.ersetzt_durch_abrechnung_id) return { success: false, error: 'Re-Issue wurde bereits erstellt' }

  // Korrekturen anwenden falls vorhanden
  if (korrekturen?.length) {
    for (const k of korrekturen) {
      await db.from('faelle').update({
        sv_nachzahlung_netto: k.neuer_betrag_netto,
      }).eq('id', k.fall_id)
    }
  }

  const { reissueAbrechnung } = await import('@/lib/abrechnung/reissue-abrechnung')
  const result = await reissueAbrechnung(abrechnung_id)

  revalidatePath('/admin/abrechnungen', 'page')

  if (!result.neue_abrechnung_id) {
    return { success: true, error: 'Keine verbleibenden Fälle — keine neue Abrechnung erstellt' }
  }

  return { success: true, neue_abrechnung_id: result.neue_abrechnung_id }
}
