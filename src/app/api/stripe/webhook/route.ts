import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-148: Stripe Webhook Endpoint.
 * Verarbeitet checkout.session.completed, payment_intent.payment_failed.
 */
export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  // Signatur-Verifizierung
  let event: { id: string; type: string; data: { object: Record<string, unknown> } }
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      const { stripe } = await import('@/lib/stripe/client')
      const verified = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
      event = verified as typeof event
    } else {
      event = JSON.parse(body)
    }
  } catch (err) {
    console.error('[KFZ-148] Stripe Webhook Signatur-Fehler:', err)
    return NextResponse.json({ error: 'Signatur ungültig' }, { status: 400 })
  }

  const db = createAdminClient()

  // Idempotenz: Event nur einmal verarbeiten
  const { data: existing } = await db.from('stripe_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .limit(1)
    .maybeSingle()
  if (existing) return NextResponse.json({ ok: true, duplicate: true })

  // Event loggen
  const gutachterId = (event.data.object.metadata as Record<string, string>)?.gutachter_id ?? null
  await db.from('stripe_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    gutachter_id: gutachterId,
    payload: event.data.object,
  })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const meta = (session.metadata ?? {}) as Record<string, string>

        // KFZ-152: Buero-Anzahlung — Parent zahlt zentral fuer alle Sub-Standorte
        if (meta.typ === 'buero_anzahlung' && meta.organisation_id) {
          const orgId = meta.organisation_id

          // Default Payment Method aus dem Payment Intent extrahieren
          let defaultPmId: string | null = null
          try {
            const piId = session.payment_intent as string | null
            if (piId) {
              const { stripe } = await import('@/lib/stripe/client')
              const pi = await stripe.paymentIntents.retrieve(piId)
              defaultPmId = (pi.payment_method as string) ?? null
            }
          } catch (err) { console.error('[KFZ-152] PI retrieve:', err) }

          // Org aktivieren + PM speichern
          await db.from('organisationen').update({
            onboarding_status: 'aktiv',
            parent_stripe_default_pm_id: defaultPmId,
            updated_at: new Date().toISOString(),
          }).eq('id', orgId)

          // Alle Sub-SVs (mitarbeiter) + Inhaber freischalten
          await db.from('sachverstaendige').update({
            onboarding_status: 'bezahlt',
            stripe_anzahlung_bezahlt_am: new Date().toISOString(),
            portal_zugang_freigeschaltet: true,
            anzahlung_status: 'bezahlt',
            ist_aktiv: true,
          }).eq('organisation_id', orgId)

          // Email an Inhaber
          try {
            const { data: org } = await db.from('organisationen')
              .select('name, hauptansprechpartner_user_id')
              .eq('id', orgId)
              .single()
            if (org?.hauptansprechpartner_user_id) {
              const { data: p } = await db.from('profiles').select('email, vorname').eq('id', org.hauptansprechpartner_user_id).single()
              if (p?.email) {
                const { sendEmail } = await import('@/lib/email/google/client')
                await sendEmail({
                  to: p.email,
                  subject: `Anzahlung eingegangen — Buero ${org.name} ist aktiv`,
                  html: `<p>Hallo ${p.vorname ?? 'Partner'},</p><p>deine Anzahlung fuer das Buero <strong>${org.name}</strong> ist eingegangen. Alle Standorte sind freigeschaltet und koennen ab sofort Auftraege erhalten.</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'}/gutachter">Zum Buero-Portal</a></p>`,
                  empfaengerTyp: 'sv',
                  template: 'buero_onboarding_payment_confirmed',
                })
              }
            }
          } catch (err) { console.error('[KFZ-152] Buero confirm-mail:', err) }

          // KFZ-151: Auto-Resolve etwaiger offener Onboarding-Tasks zur Org
          try {
            const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
            await resolveTasksForEntity('sv_onboarding', orgId, 'Buero-Anzahlung eingegangen')
          } catch (err) { console.error('[KFZ-151] resolveTasks buero:', err) }

          break
        }

        if (meta.typ === 'sv_anzahlung' && meta.gutachter_id) {
          const svId = meta.gutachter_id

          // BUG-FOLLOW-4: werbebudget_guthaben_netto mit Anzahlungsbetrag initialisieren.
          // KFZ-149 process-case-billing zieht 150 EUR pro Fall vom Werbebudget ab —
          // ohne diese Initialisierung waere das Guthaben 0 und der SV wuerde sofort
          // den vollen Lead-Preis zahlen statt der Differenz.
          const { data: svBefore } = await db.from('sachverstaendige')
            .select('onboarding_anzahlung_betrag')
            .eq('id', svId)
            .single()
          const initGuthaben = Number(svBefore?.onboarding_anzahlung_betrag ?? 0)

          // Portal freischalten
          await db.from('sachverstaendige').update({
            onboarding_status: 'bezahlt',
            stripe_anzahlung_payment_intent_id: session.payment_intent as string ?? null,
            stripe_anzahlung_bezahlt_am: new Date().toISOString(),
            portal_zugang_freigeschaltet: true,
            anzahlung_status: 'bezahlt',
            werbebudget_guthaben_netto: initGuthaben,
          }).eq('id', svId)

          // KFZ-151: Auto-Resolve aller offenen Tasks zu diesem Onboarding
          try {
            const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
            await resolveTasksForEntity('sv_onboarding', svId, 'Anzahlung eingegangen')
          } catch (err) { console.error('[KFZ-151] resolveTasks sv_onboarding:', err) }

          // Email an SV: Portal freigeschaltet
          try {
            const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', svId).single()
            if (sv?.profile_id) {
              const { data: p } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
              if (p?.email) {
                const { sendEmail } = await import('@/lib/email/google/client')
                await sendEmail({
                  to: p.email,
                  subject: 'Zahlung eingegangen — dein Portal ist freigeschaltet!',
                  html: `<p>Hallo ${p.vorname ?? 'Partner'},</p><p>deine Anzahlung ist eingegangen. Dein Gutachter-Portal ist jetzt freigeschaltet!</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'}/gutachter">Zum Portal</a></p>`,
                  empfaengerTyp: 'sv',
                  template: 'sv_onboarding_payment_confirmed',
                })
              }
            }
          } catch (err) { console.error('[KFZ-148] Bestätigungs-Email:', err) }

          // Admin-Notification
          try {
            const { data: admins } = await db.from('profiles').select('telefon').eq('rolle', 'admin')
            const { sendManualWhatsApp } = await import('@/lib/whatsapp')
            for (const a of admins ?? []) {
              if (a.telefon) await sendManualWhatsApp(a.telefon, `✅ SV-Anzahlung eingegangen für ${svId.slice(0, 8)}. Portal freigeschaltet.`, null)
            }
          } catch { /* */ }
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object
        const meta = (pi.metadata ?? {}) as Record<string, string>
        if (meta.gutachter_id) {
          // Status updaten
          await db.from('sachverstaendige').update({
            onboarding_status: 'anzahlung_offen',
          }).eq('id', meta.gutachter_id)
        }
        break
      }
    }

    // Als verarbeitet markieren
    await db.from('stripe_events').update({ verarbeitet: true }).eq('stripe_event_id', event.id)
  } catch (err) {
    console.error(`[KFZ-148] Stripe Webhook ${event.type}:`, err)
    await db.from('stripe_events').update({ fehler: String(err) }).eq('stripe_event_id', event.id)
  }

  return NextResponse.json({ ok: true })
}
