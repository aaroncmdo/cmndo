import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'

// KFZ-179: 5-Minuten-Notification an Kunden — getriggert vom Client wenn ETA < 5.

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token: string | undefined = body?.token
  if (!token) return NextResponse.json({ error: 'token fehlt' }, { status: 400 })

  const db = createAdminClient()

  const { data: termin } = await db
    .from('gutachter_termine')
    // CMM-49 (sv_id-Drop): assignee_id statt sv_id (value-identisch für SV-Termine).
    .select('id, fall_id, assignee_id, notification_5min_gesendet_am')
    .eq('kunden_tracking_token', token)
    .single()

  if (!termin) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })
  if (termin.notification_5min_gesendet_am) return NextResponse.json({ already_sent: true })

  // Kunden-Daten — CMM-49: lead_id (0-diff) claims-direkt via resolveClaimId. faelle-frei.
  const nClaimId = await resolveClaimId(db, termin.fall_id)
  const { data: fall } = nClaimId
    ? await db.from('claims').select('lead_id').eq('id', nClaimId).maybeSingle()
    : { data: null }
  let kundeVorname = 'Kunde'
  let kundeTelefon: string | null = null
  if (fall?.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
    if (lead) { kundeVorname = lead.vorname ?? 'Kunde'; kundeTelefon = lead.telefon }
  }

  // SV-Name
  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.assignee_id).single()
  let svName = 'Gutachter'
  if (sv?.profile_id) {
    const { data: p } = await db.from('profiles').select('vorname').eq('id', sv.profile_id).single()
    if (p) svName = p.vorname ?? 'Gutachter'
  }

  if (kundeTelefon) {
    // C3a: durable via Notification-Outbox. Der Kunde wartet gerade auf den SV —
    // ein verschluckter Send liess ihn ohne die "gleich da"-Info, und das Flag
    // notification_5min_gesendet_am unten verhindert jeden Nachschuss.
    // Empfaengerkreis UNVERAENDERT: die kundeTelefon-Guard bleibt stehen, und
    // sendFallCommunication resolved denselben Kunden (claims.lead_id ->
    // leads.telefon). Der zusaetzliche geschaedigter-Fallback ist auf prod leer
    // (0 von 77 Claims haetten NUR darueber einen Empfaenger) -> kein Change.
    // dedupKey mit termin.id: der Anstoss gehoert zu GENAU diesem Termin (dort
    // liegt auch das Idempotenz-Flag).
    await enqueue({
      dedupKey: buildDedupKey({
        template: 'sv_fast_da',
        claimId: termin.fall_id as string,
        fenster: termin.id as string,
      }),
      kanal: 'whatsapp',
      template: 'sv_fast_da',
      claimId: termin.fall_id as string,
      payload: { '1': kundeVorname, '2': svName },
    }).catch(() => {})
  }

  await db.from('gutachter_termine').update({
    notification_5min_gesendet_am: new Date().toISOString(),
  }).eq('id', termin.id)

  return NextResponse.json({ success: true })
}
