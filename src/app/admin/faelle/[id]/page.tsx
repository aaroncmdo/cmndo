import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import FallakteClient from './FallakteClient'

export default async function FallaktePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', id)
    .single()

  if (!fall) notFound()

  const [
    { data: schadenspositionen },
    { data: dokumente },
    { data: parteien },
    leadResult,
    svResult,
  ] = await Promise.all([
    supabase
      .from('schadenspositionen')
      .select('id, kategorie, bezeichnung, beschreibung, geschaetzter_wert, reparaturkosten, sort_order')
      .eq('fall_id', id)
      .order('sort_order'),
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, created_at')
      .eq('fall_id', id)
      .order('created_at'),
    supabase
      .from('parteien')
      .select('id, rolle, name, versicherung_name, versicherung_nr, telefon, email')
      .eq('fall_id', id),
    fall.lead_id
      ? supabase
          .from('leads')
          .select('vorname, nachname, email, telefon')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    fall.sv_id
      ? supabase
          .from('sachverstaendige')
          .select('id, paket, profiles(vorname, nachname, telefon)')
          .eq('id', fall.sv_id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  // Normalize the SV profile join (Supabase may return array or object)
  let sv = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const profileRaw = raw.profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw ?? null
    sv = { id: raw.id as string, paket: raw.paket as string, profile }
  }

  return (
    <FallakteClient
      fall={fall}
      lead={leadResult.data}
      sv={sv}
      schadenspositionen={schadenspositionen ?? []}
      dokumente={dokumente ?? []}
      parteien={parteien ?? []}
    />
  )
}
