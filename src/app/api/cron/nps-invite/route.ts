import { NextResponse } from 'next/server'
import { render } from '@react-email/render'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEmailBranding } from '@/lib/branding/token-theme'
import { sendEmail } from '@/lib/email/google/client'
import { generateResponseToken, tokenExpiryFromNow, npsResponsePath } from '@/lib/nps/nps'
import { KundeNpsUmfrageEmail, subject as npsSubject } from '@/lib/email/google/templates/KundeNpsUmfrage'

export const dynamic = 'force-dynamic'

// GEO-P2 SP2: NPS-Einladungs-Cron. Scannt frisch abgeschlossene Claims (entkoppelt von
// den 3 Abschluss-Pfaden), legt genau-einmal (upsert onConflict claim_id) eine
// kunde_feedback-Zeile an + sendet den E-Mail-Magic-Link. Scheduler = crontab (Ops).

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
}

type Kandidat = {
  id: string
  lead_id: string | null
  geschaedigter_user_id: string | null
  claim_nummer: string | null
}

async function sendNpsInvite(
  db: ReturnType<typeof createAdminClient>,
  c: { claimId: string; leadId: string | null; geschaedigterId: string | null; claimNummer: string | null; token: string },
): Promise<void> {
  // Kunde-Email + Vorname (email-first): leads -> profiles-Fallback (Muster send-fall.ts).
  let empfaenger: string | null = null
  let vorname = ''
  if (c.leadId) {
    const { data: lead } = await db.from('leads').select('vorname, email').eq('id', c.leadId).maybeSingle()
    if (lead) {
      empfaenger = (lead.email as string | null) ?? null
      vorname = (lead.vorname as string | null) ?? ''
    }
  }
  if (!empfaenger && c.geschaedigterId) {
    const { data: p } = await db.from('profiles').select('vorname, email').eq('id', c.geschaedigterId).maybeSingle()
    if (p) {
      empfaenger = empfaenger || ((p.email as string | null) ?? null)
      vorname = vorname || ((p.vorname as string | null) ?? '')
    }
  }
  if (!empfaenger) {
    console.error('[nps-invite] keine Kunde-Email fuer claim', c.claimId)
    return
  }

  const brand = await resolveEmailBranding({ leadId: c.leadId })
  const npsUrl = appBase() + npsResponsePath(c.token)
  const optOutUrl = `${npsUrl}?abmelden=1`
  const props = { vorname, claimNummer: c.claimNummer, npsUrl, optOutUrl, brand: brand ?? undefined }
  const html = await render(KundeNpsUmfrageEmail(props))
  await sendEmail({
    to: empfaenger,
    subject: npsSubject(props),
    html,
    empfaengerTyp: 'kunde',
    template: 'nps_umfrage',
    listUnsubscribe: optOutUrl,
  })
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const { data: kandidaten } = await db
    .from('claims')
    .select('id, lead_id, geschaedigter_user_id, claim_nummer')
    .eq('operative_status', 'abgeschlossen')
    .gt('abgeschlossen_am', cutoff)

  let eingeladen = 0
  for (const c of (kandidaten ?? []) as Kandidat[]) {
    const token = generateResponseToken()
    // Genau-einmal: onConflict claim_id + ignoreDuplicates. Kam eine Zeile zurueck = neu.
    const { data: ins, error } = await db
      .from('kunde_feedback')
      .upsert(
        {
          claim_id: c.id,
          response_token: token,
          token_expires_at: tokenExpiryFromNow(),
          eingeladen_am: new Date().toISOString(),
        },
        { onConflict: 'claim_id', ignoreDuplicates: true },
      )
      .select('id')
    if (error) {
      console.error('[nps-invite] upsert', c.id, error.message)
      continue
    }
    if (!ins || ins.length === 0) continue // schon eingeladen

    try {
      await sendNpsInvite(db, {
        claimId: c.id,
        leadId: c.lead_id,
        geschaedigterId: c.geschaedigter_user_id,
        claimNummer: c.claim_nummer,
        token,
      })
      eingeladen++
    } catch (err) {
      // Non-critical: die Zeile bleibt (kein Re-Invite). Retry = dokumentierter Follow-up.
      console.error('[nps-invite] send', c.id, err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ ok: true, eingeladen, checked: kandidaten?.length ?? 0 })
}
