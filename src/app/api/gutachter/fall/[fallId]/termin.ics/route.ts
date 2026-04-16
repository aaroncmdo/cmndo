// AAR-318 Teil B: iCal-Download für SV-Termin.
// Universeller Endpoint — Apple Kalender, Outlook, Google Calendar etc.
// Auth: SV muss dem Fall zugewiesen sein, Admin darf immer.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildIcs } from '@/lib/ical'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fallId: string }> },
) {
  const { fallId } = await params

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return new NextResponse('Nicht angemeldet', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname, email')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined

  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, schadens_ort, schadens_adresse, sv_termin, sv_id, lead_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return new NextResponse('Fall nicht gefunden', { status: 404 })
  if (!fall.sv_termin) return new NextResponse('Kein Termin gesetzt', { status: 404 })

  // Authorisation: Admin/KB jederzeit, SV nur wenn der Fall ihm zugewiesen ist
  if (rolle === 'sachverstaendiger') {
    if (!fall.sv_id) return new NextResponse('Nicht autorisiert', { status: 403 })
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', fall.sv_id)
      .maybeSingle()
    if (!sv?.profile_id || sv.profile_id !== user.id) {
      return new NextResponse('Nicht autorisiert', { status: 403 })
    }
  } else if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return new NextResponse('Nicht autorisiert', { status: 403 })
  }

  // Lead-Daten für Beschreibung
  let kundenName = ''
  let telefon = ''
  if (fall.lead_id) {
    const { data: lead } = await admin
      .from('leads')
      .select('vorname, nachname, telefon')
      .eq('id', fall.lead_id)
      .maybeSingle()
    if (lead) {
      kundenName = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
      telefon = lead.telefon ?? ''
    }
  }

  const startsAt = new Date(fall.sv_termin)
  // Default 1h Termin-Dauer (real Dauer steht in gutachter_termine.end_zeit, hier
  // bewusst auf faelle.sv_termin reduziert für Einfachheit)
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)

  const fallNr = fall.fall_nummer ?? fall.id.slice(0, 8)
  const ort = fall.schadens_adresse ?? fall.schadens_ort ?? ''
  const summary = `Begutachtung ${fallNr}${kundenName ? ` · ${kundenName}` : ''}`
  const beschrTeile = [
    `Fall: ${fallNr}`,
    kundenName ? `Kunde: ${kundenName}` : null,
    telefon ? `Telefon: ${telefon}` : null,
    fall.kennzeichen ? `Kennzeichen: ${fall.kennzeichen}` : null,
    ort ? `Ort: ${ort}` : null,
    `Portal: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/gutachter/fall/${fall.id}`,
  ].filter(Boolean) as string[]

  const ics = buildIcs({
    uid: `fall-${fall.id}-svtermin`,
    summary,
    description: beschrTeile.join('\n'),
    location: ort,
    startsAt,
    endsAt,
    organizerName: 'Claimondo',
    organizerEmail: 'no-reply@claimondo.de',
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="claimondo-${fallNr}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
