import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'

// Lazy-Import von '@/lib/stripe/client' innerhalb der Handler — der Client
// instantiiert Stripe im Konstruktor mit STRIPE_SECRET_KEY!. Bei einem
// Top-Level-Import wuerde 'next build' im Page-Data-Collection-Schritt
// crashen falls STRIPE_SECRET_KEY zur Build-Zeit nicht gesetzt ist. Pattern
// siehe src/app/api/stripe/webhook/route.ts.

export const dynamic = 'force-dynamic'

const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'aaron@claimondo.de'

/**
 * KFZ-149 Hund-D: Lastschrift-Einzugs-Cron fuer SV-Monatsabrechnungen.
 *
 * Schedule (vercel.json): 0 10 * * *  — taeglich um 10:00 UTC
 *
 * Findet alle SV-Abrechnungen die heute oder frueher faellig sind, noch nicht
 * bezahlt sind und noch nicht eingezogen wurden. Triggert pro Eintrag einen
 * Stripe PaymentIntent mit confirm=true + off_session=true gegen die im
 * Customer hinterlegte Default Payment Method (Solo: sachverstaendige.
 * stripe_default_payment_method_id, Buero: organisationen.parent_stripe_
 * default_pm_id).
 *
 * Bei Erfolg: bezahlt_am + bezahlt_betrag setzen, status='bezahlt',
 * stripe_payment_intent_id speichern.
 * Bei Fehler: einzug_versucht_am + einzug_fehler setzen, status='fehlgeschlagen'
 * und Aaron als Admin per Mail alerten (ADMIN_ALERT_EMAIL).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET} (analog allen anderen Crons).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const heute = new Date().toISOString().slice(0, 10)

  const { data: faellig, error } = await db
    .from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_typ, empfaenger_id, empfaenger_email, empfaenger_name, summe_brutto, faellig_am')
    .eq('empfaenger_typ', 'sv')
    .is('bezahlt_am', null)
    .is('einzug_versucht_am', null)
    .is('storniert_am', null)
    .lte('faellig_am', heute)

  if (error) {
    console.error('[KFZ-149 einzug] Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let success = 0
  let failed = 0

  // Lazy-load Stripe nur wenn es tatsaechlich Eintraege zu verarbeiten gibt.
  const { stripe } = (faellig?.length ?? 0) > 0
    ? await import('@/lib/stripe/client')
    : { stripe: null as unknown as import('stripe').default }

  for (const abr of faellig ?? []) {
    if (!abr.empfaenger_id || !abr.summe_brutto) {
      // Defensive: ohne empfaenger_id und Betrag kein Einzug moeglich
      await markFailed(abr.id, 'empfaenger_id oder summe_brutto fehlt', 'Validierungsfehler', abr)
      failed++
      continue
    }

    // Stripe-Customer + Payment Method aufloesen.
    // KFZ-152 Phase 2+3 Fix: empfaenger_id kann jetzt drei Dinge sein:
    //   a) sachverstaendige.id (Solo + Community-Member, individuelle Rechnung)
    //   b) sachverstaendige.profile_id (Legacy-Pfad, Fallback)
    //   c) organisationen.id (Buero/Akademie Sammelrechnung von Hund N)
    // Wir versuchen die Quellen in dieser Reihenfolge.
    let svRow: { id: string; stripe_customer_id: string | null; stripe_default_payment_method_id: string | null; organisation_id: string | null; profile_id: string | null } | null = null
    let orgRow: { id: string; parent_stripe_customer_id: string | null; parent_stripe_default_pm_id: string | null; typ: string | null } | null = null
    {
      const { data } = await db.from('sachverstaendige')
        .select('id, stripe_customer_id, stripe_default_payment_method_id, organisation_id, profile_id')
        .eq('id', abr.empfaenger_id)
        .maybeSingle()
      if (data) svRow = data
    }
    if (!svRow) {
      const { data } = await db.from('sachverstaendige')
        .select('id, stripe_customer_id, stripe_default_payment_method_id, organisation_id, profile_id')
        .eq('profile_id', abr.empfaenger_id)
        .limit(1)
        .maybeSingle()
      if (data) svRow = data
    }
    if (!svRow) {
      // KFZ-152: Org-Sammelrechnung — empfaenger_id ist die Org-ID
      const { data } = await db.from('organisationen')
        .select('id, parent_stripe_customer_id, parent_stripe_default_pm_id, typ')
        .eq('id', abr.empfaenger_id)
        .maybeSingle()
      if (data) orgRow = data
    }

    if (!svRow && !orgRow) {
      await markFailed(abr.id, 'Kein Sachverstaendiger / keine Organisation gefunden', 'Lookup fehlgeschlagen', abr)
      failed++
      continue
    }

    // Customer + PM bestimmen
    let customerId: string | null = null
    let pmId: string | null = null
    if (orgRow) {
      // Org-Sammelrechnung: direkt vom Org-Stripe-Customer
      customerId = orgRow.parent_stripe_customer_id
      pmId = orgRow.parent_stripe_default_pm_id
    } else if (svRow) {
      // Solo + Community: SV-eigener Customer, Fallback Org bei Buero/Akademie-Sub
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

    if (!customerId || !pmId) {
      await markFailed(abr.id, 'Stripe Customer oder Payment Method fehlt', 'Stripe-Setup unvollstaendig', abr)
      failed++
      continue
    }

    // PaymentIntent off_session auslosen
    try {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(Number(abr.summe_brutto) * 100),
        currency: 'eur',
        customer: customerId,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        description: orgRow
          ? `Claimondo Sammelabrechnung ${abr.abrechnungs_nr} (${orgRow.typ})`
          : `Claimondo Monatsabrechnung ${abr.abrechnungs_nr}`,
        metadata: {
          abrechnung_id: abr.id,
          abrechnungs_nr: abr.abrechnungs_nr,
          empfaenger_typ: orgRow ? 'org' : 'sv',
          ...(svRow ? { gutachter_id: svRow.id } : {}),
          ...(orgRow ? { organisation_id: orgRow.id, organisation_typ: orgRow.typ ?? '' } : {}),
        },
      })

      if (pi.status === 'succeeded') {
        const bezahltAm = new Date().toISOString()
        await db.from('abrechnungen').update({
          bezahlt_am: bezahltAm,
          bezahlt_betrag: Number(abr.summe_brutto),
          einzug_versucht_am: bezahltAm,
          stripe_payment_intent_id: pi.id,
          status: 'bezahlt',
          updated_at: bezahltAm,
        }).eq('id', abr.id)
        success++
      } else {
        // 'requires_action' (3DS) oder 'processing' — Einzug noch offen, Versuch zaehlen
        await db.from('abrechnungen').update({
          einzug_versucht_am: new Date().toISOString(),
          stripe_payment_intent_id: pi.id,
          einzug_fehler: `PaymentIntent status=${pi.status} (3DS oder verzoegert)`,
          status: 'fehlgeschlagen',
          updated_at: new Date().toISOString(),
        }).eq('id', abr.id)
        await alertAaron(abr, `PaymentIntent ${pi.id} im Status ${pi.status} statt 'succeeded' — manuelle Pruefung noetig.`)
        failed++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const piId = (err && typeof err === 'object' && 'payment_intent' in err)
        ? (err as { payment_intent?: { id?: string } }).payment_intent?.id ?? null
        : null
      console.error(`[KFZ-149 einzug] PaymentIntent fuer ${abr.abrechnungs_nr} fehlgeschlagen:`, msg)
      await db.from('abrechnungen').update({
        einzug_versucht_am: new Date().toISOString(),
        einzug_fehler: msg,
        stripe_payment_intent_id: piId,
        status: 'fehlgeschlagen',
        updated_at: new Date().toISOString(),
      }).eq('id', abr.id)
      await alertAaron(abr, msg)
      failed++
    }
  }

  console.log(`[KFZ-149 einzug] success=${success} failed=${failed} total_pruefung=${faellig?.length ?? 0}`)
  return NextResponse.json({ ok: true, success, failed, total: faellig?.length ?? 0 })

  // ── Helpers ──────────────────────────────────────────────────────────
  async function markFailed(
    abrechnungId: string,
    fehler: string,
    grund: string,
    abr: { abrechnungs_nr: string; empfaenger_name: string | null; summe_brutto: number | string | null },
  ) {
    await db.from('abrechnungen').update({
      einzug_versucht_am: new Date().toISOString(),
      einzug_fehler: fehler,
      status: 'fehlgeschlagen',
      updated_at: new Date().toISOString(),
    }).eq('id', abrechnungId)
    await alertAaron(abr, `${grund}: ${fehler}`)
  }

  async function alertAaron(
    abr: { abrechnungs_nr: string; empfaenger_name: string | null; summe_brutto: number | string | null },
    error: string,
  ) {
    try {
      const { render } = await import('@react-email/render')
      const { AdminEinzugFehlgeschlagenEmail, subject: einzugSubject } = await import('@/lib/email/google/templates/AdminEinzugFehlgeschlagen')
      const props = {
        abrechnungsNr: abr.abrechnungs_nr,
        empfaengerName: abr.empfaenger_name ?? null,
        betragBrutto: Number(abr.summe_brutto ?? 0),
        fehlerGrund: error,
      }
      const html = await render(AdminEinzugFehlgeschlagenEmail(props))
      await sendEmail({
        to: ADMIN_ALERT_EMAIL,
        subject: einzugSubject(props),
        html,
        empfaengerTyp: 'admin',
        template: 'abrechnung_einzug_failed',
      })
    } catch (mailErr) {
      console.error('[KFZ-149 einzug] Admin-Alert-Mail fehlgeschlagen:', mailErr)
    }
  }
}
