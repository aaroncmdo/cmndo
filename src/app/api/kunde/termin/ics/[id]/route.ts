// AAR-448: GET /api/kunde/termin/ics/[id]
// Universeller ICS-Download für Kunden — funktioniert mit Apple Kalender,
// Outlook, Google Calendar. Nutzt Shared buildIcs aus @/lib/ical (Redundanz-Check:
// Gutachter hat analoge Route, Generator wird wiederverwendet).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildIcs } from '@/lib/ical'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return new NextResponse('Termin-ID fehlt', { status: 400 })

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return new NextResponse('Nicht angemeldet', { status: 401 })

  const admin = createAdminClient()
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, fall_id, typ, start_zeit, end_zeit, kanal, video_link, sv_id, kb_id')
    .eq('id', id)
    .maybeSingle()
  if (!termin || !termin.fall_id) return new NextResponse('Termin nicht gefunden', { status: 404 })
  if (!termin.start_zeit) return new NextResponse('Termin hat keine Startzeit', { status: 404 })

  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-A3: Aktennummer kommt aus claims.claim_nummer (gleiches Embed).
  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (aktueller Termin, SSoT).
  const { data: fall } = await admin
    .from('faelle')
    .select('id, kunde_id, lead_id, kennzeichen, claim_id, claims:claim_id(claim_nummer, schadenort_adresse, schadenort_ort, schadenort_plz)')
    .eq('id', termin.fall_id)
    .maybeSingle()
  if (!fall) return new NextResponse('Fall nicht gefunden', { status: 404 })
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

  let aktTerminIcs: { besichtigungsort_adresse: string | null } | null = null
  if (fall.claim_id) {
    const { data: at } = await admin
      .from('gutachter_termine')
      .select('besichtigungsort_adresse')
      .eq('claim_id', fall.claim_id)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminIcs = at
  }

  // Ownership-Check
  let owned = fall.kunde_id === user.id
  if (!owned && fall.lead_id) {
    const { data: lead } = await admin
      .from('leads')
      .select('email')
      .eq('id', fall.lead_id)
      .maybeSingle()
    owned = !!(
      lead?.email &&
      user.email &&
      lead.email.toLowerCase() === user.email.toLowerCase()
    )
  }
  if (!owned) return new NextResponse('Keine Berechtigung', { status: 403 })

  const startsAt = new Date(termin.start_zeit)
  const endsAt = termin.end_zeit ? new Date(termin.end_zeit) : new Date(startsAt.getTime() + 60 * 60 * 1000)

  const isVideo = termin.typ === 'kb_beratung' || termin.kanal === 'video'
  const fallNr = fallClaim?.claim_nummer ?? fall.id.slice(0, 8)
  const adresse = isVideo
    ? (termin.video_link ?? '')
    : (aktTerminIcs?.besichtigungsort_adresse ??
        [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', '))

  const summary = isVideo
    ? `Claimondo Videoberatung · ${fallNr}`
    : `Claimondo Gutachter-Termin · ${fallNr}`

  const beschrTeile = [
    `Fall-Nr.: ${fallNr}`,
    fall.kennzeichen ? `Kennzeichen: ${fall.kennzeichen}` : null,
    isVideo && termin.video_link ? `Videolink: ${termin.video_link}` : null,
    !isVideo && adresse ? `Ort: ${adresse}` : null,
    `Portal: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'}/kunde/faelle/${fall.id}`,
  ].filter(Boolean) as string[]

  const ics = buildIcs({
    uid: `termin-${termin.id}`,
    summary,
    description: beschrTeile.join('\n'),
    location: adresse || undefined,
    startsAt,
    endsAt,
    organizerName: 'Claimondo',
    organizerEmail: 'no-reply@claimondo.de',
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="claimondo-termin-${fallNr}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
