import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect, notFound } from 'next/navigation'
import AuftragClient from './AuftragClient'

export default async function AuftragPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify this case belongs to the gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', id)
    .eq('sv_id', sv?.id ?? '')
    .single()

  if (!fall) notFound()

  const [
    { data: lead },
    { data: dokumente },
    { data: parteien },
    { data: schadenspositionen },
  ] = await Promise.all([
    fall.lead_id
      ? supabase.from('leads').select('vorname, nachname, email, telefon').eq('id', fall.lead_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, created_at')
      .eq('fall_id', id)
      .order('created_at'),
    supabase
      .from('parteien')
      .select('id, rolle, name, versicherung_name, versicherung_nr, telefon, email')
      .eq('fall_id', id),
    supabase
      .from('schadenspositionen')
      .select('id, kategorie, bezeichnung, beschreibung, geschaetzter_wert, reparaturkosten')
      .eq('fall_id', id)
      .order('sort_order'),
  ])

  return (
    <AuftragClient
      fall={fall}
      lead={lead}
      dokumente={dokumente ?? []}
      parteien={parteien ?? []}
      schadenspositionen={schadenspositionen ?? []}
    />
  )
}
