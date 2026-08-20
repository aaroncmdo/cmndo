// P5 T6: Netzwerkpartner-Abo-Dunning — gestaffelte Reminder fuer 'ueberfaellig'-Abos
// + finaler Cancel nach Karenz. Stripe treibt Retry/Renewal selbst; dieser Cron macht
// NUR Reminder (sv_payment_reminders-Idempotenz) + den finalen Schnitt (subscriptions.cancel
// + status='gekuendigt'; der subscription.deleted-Webhook bestaetigt idempotent).
// Auth: Bearer CRON_SECRET (pg_cron 08:00 UTC via cron_trigger_netzwerk_abo_dunning, Vault).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const REMINDER_STUFEN = [
  { tage: 1, typ: 'netzwerk_abo_ueberfaellig_1d' },
  { tage: 5, typ: 'netzwerk_abo_ueberfaellig_5d' },
  { tage: 10, typ: 'netzwerk_abo_ueberfaellig_10d' },
] as const
const KARENZ_TAGE = 14 // danach: Stripe-Cancel + gekuendigt

export async function GET(request: Request) {
  if (!assertCronAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()

  const { data: abos } = await db
    .from('sv_netzwerk_abonnements')
    .select('sv_id, status, gueltig_bis, stripe_subscription_id, aktualisiert_am, ueberfaellig_seit')
    .eq('status', 'ueberfaellig')
  if (!abos?.length) return NextResponse.json({ ok: true, count: 0 })

  let acted = 0
  for (const abo of abos) {
    // Review-Fix I-3: Dunning-Anker = ueberfaellig_seit (nur beim Uebergang gesetzt —
    // Stripe-Smart-Retries resetten ihn NICHT); aktualisiert_am nur als Alt-Row-Fallback.
    const seit = new Date((abo.ueberfaellig_seit as string | null) ?? (abo.aktualisiert_am as string))
    const tage = Math.floor((Date.now() - seit.getTime()) / 86_400_000)

    for (const stufe of REMINDER_STUFEN) {
      if (tage < stufe.tage) continue
      // Review-Followup M-5 (re-entrant): Dedup nur innerhalb der AKTUELLEN Ueberfaelligkeits-
      // Episode (versendet_am >= ueberfaellig_seit-Anker). Reminder einer FRUEHEREN Episode
      // (SV zahlte, fiel spaeter erneut aus) blocken die neue Staffel nicht mehr.
      const { data: existing } = await db
        .from('sv_payment_reminders')
        .select('id')
        .eq('sv_id', abo.sv_id)
        .eq('reminder_typ', stufe.typ)
        .gte('versendet_am', seit.toISOString())
        .limit(1)
        .maybeSingle()
      if (existing) continue
      // Mail non-fatal (dedizierter Registry-Trigger — sv_monatsabrechnung NICHT zweckentfremden).
      let versandOk = false
      try {
        const { data: sv } = await db
          .from('sachverstaendige').select('profile_id').eq('id', abo.sv_id).single()
        const { data: p } = sv?.profile_id
          ? await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
          : { data: null }
        if (p?.email) {
          const { sendCommunication } = await import('@/lib/communications/send')
          const res = await sendCommunication('netzwerk_abo_dunning', {
            email: p.email,
            vorname: p.vorname ?? 'Partner',
            subject: 'Zahlung Netzwerkpartner-Abo ausstehend',
            html: `<p>Hallo ${p.vorname ?? 'Partner'},</p><p>deine Netzwerkpartner-Zahlung ist noch offen. Bitte aktualisiere deine Zahlungsmethode im Portal (Einstellungen → Netzwerkpartner → „Abo verwalten"), damit dein Netzwerk-Vorteil aktiv bleibt.</p>`,
          })
          versandOk = res.ok
          if (!res.ok) console.error(`[netzwerk-dunning] Mahnung an SV ${abo.sv_id} NICHT zugestellt:`, res.error)
        } else {
          console.error(`[netzwerk-dunning] keine E-Mail-Adresse fuer SV ${abo.sv_id} — Mahnung unzustellbar`)
        }
      } catch (err) {
        console.error('[netzwerk-dunning] mail', err)
      }
      // Der Marker bedeutet "gemahnt", und die Dedup-Sperre oben (`if (existing) continue`)
      // haengt daran: wurde er trotz fehlgeschlagener Mail gesetzt, versucht KEIN weiterer
      // Lauf es erneut — der Partner bliebe dauerhaft ungemahnt, waehrend das System ihn als
      // gemahnt fuehrt. Deshalb nur bei tatsaechlichem Versand; sonst greift der naechste Lauf.
      if (!versandOk) continue
      const { error: insErr } = await db
        .from('sv_payment_reminders')
        .insert({ sv_id: abo.sv_id, reminder_typ: stufe.typ })
      if (insErr) console.error('[netzwerk-dunning] reminder-insert', insErr.message)
      else acted++
    }

    // Karenz abgelaufen -> Stripe-Sub canceln + status=gekuendigt (aktiver Schnitt;
    // der subscription.deleted-Webhook bestaetigt idempotent). Review-Fix M-3: der
    // Status-Schnitt haengt NICHT an stripe_subscription_id — eine sub-lose Row
    // bliebe sonst dauerhaft 'ueberfaellig'.
    if (tage >= KARENZ_TAGE) {
      if (abo.stripe_subscription_id) {
        try {
          const { stripe } = await import('@/lib/stripe/client')
          await stripe.subscriptions.cancel(abo.stripe_subscription_id as string)
        } catch (err) {
          console.error('[netzwerk-dunning] cancel', err)
        }
      }
      await db
        .from('sv_netzwerk_abonnements')
        .update({ status: 'gekuendigt', ueberfaellig_seit: null, aktualisiert_am: new Date().toISOString() })
        .eq('sv_id', abo.sv_id)
      acted++
    }
  }
  return NextResponse.json({ ok: true, count: acted })
}
