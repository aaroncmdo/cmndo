// AAR-477 P1-Fix (17.07.2026): /schaden-melden/fortsetzen/[token] — das Ziel der
// Lead-Nurture-Mails (LeadReminder1-4). Existierte nie als Route: claimondo.de 404te,
// app.claimondo.de warf den next.config-308-Stopgap auf den Funnel-Start und verwarf
// den Token. Prod hatte bereits Mails mit totem Link versendet (r1=3, r2=1 am 17.07.).
//
// Semantik: reminder_token (leads, UUID, unique idx) -> Lead ->
// ensureCanonicalFlowLinkForLead (idempotent, mintet bei 72h-Expiry FRISCH — deshalb
// NICHT "flow_token beim Cron-Send joinen": der waere beim Klick ab Tag 3 abgelaufen)
// -> 307 auf /flow/<token>. Muster: src/app/start/[anfrageId]/route.ts.
//
// Anon: KEIN Auth-Gate — der reminder_token IST das Gate (UUID aus der Mail).
// Bewusst KEIN disqualifiziert-Gate: wer nach der 10-Tage-Disqualifikation doch noch
// klickt, ist ein heisser Lead — der Flow zeigt den echten Zustand.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'

export const dynamic = 'force-dynamic'

// Funnel-Neustart auf der Marketing-Domain — absolut, damit der Fallback unabhaengig
// von Host-Weichen (proxy.ts) und dem frueheren 308-Browser-Cache eindeutig landet.
const FUNNEL_FALLBACK = 'https://claimondo.de/schaden-melden'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // Kein UUID-Format -> gar nicht erst die DB fragen (uuid-Spalte wuerfe Parse-Error).
  if (!UUID_RE.test(token)) {
    redirect(`${FUNNEL_FALLBACK}?fortsetzen=ungueltig`)
  }

  const admin = createAdminClient()
  const { data: lead, error } = await admin
    .from('leads')
    .select('id')
    .eq('reminder_token', token)
    .maybeSingle()

  if (error) {
    console.error('[AAR-477] fortsetzen: Lead-Lookup fehlgeschlagen:', error.message)
    redirect(`${FUNNEL_FALLBACK}?fortsetzen=fehler`)
  }
  if (!lead?.id) {
    redirect(`${FUNNEL_FALLBACK}?fortsetzen=unbekannt`)
  }

  const fl = await ensureCanonicalFlowLinkForLead(lead.id as string)
  if (!fl.ok) {
    console.error('[AAR-477] fortsetzen: FlowLink-Issue fehlgeschlagen:', fl.error, '— lead', lead.id)
    redirect(`${FUNNEL_FALLBACK}?fortsetzen=fehler`)
  }

  // 307 (redirect()-Default im Route-Handler) — nie permanent, das Mapping ist dynamisch.
  redirect(`/flow/${fl.token}`)
}
