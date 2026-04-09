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
        if (meta.typ === 'sv_anzahlung' && meta.gutachter_id) {
          const svId = meta.gutachter_id

          // Portal freischalten
          await db.from('sachverstaendige').update({
            onboarding_status: 'bezahlt',
            stripe_anzahlung_payment_intent_id: session.payment_intent as string ?? null,
            stripe_anzahlung_bezahlt_am: new Date().toISOString(),
            portal_zugang_freigeschaltet: true,
            anzahlung_status: 'bezahlt',
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
