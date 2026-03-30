import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FlowWizardKfz from './FlowWizardKfz'

export default async function FlowPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select(`
      id, vorname, nachname, email, telefon,
      schadenfall_typ, kunden_konstellation,
      personenschaden_flag, mietwagen_flag,
      polizeibericht_pflicht, gutachter_termin,
      kennzeichen, fahrzeug_hersteller, fahrzeug_modell
    `)
    .eq('id', token)
    .maybeSingle()

  if (!lead) return notFound()

  return (
    <FlowWizardKfz
      token={token}
      lead={{
        vorname: lead.vorname ?? '',
        nachname: lead.nachname ?? '',
        email: lead.email ?? '',
        telefon: lead.telefon ?? '',
        schadenfall_typ: lead.schadenfall_typ ?? 'SF-01',
        kunden_konstellation: lead.kunden_konstellation ?? 'KK-01',
        personenschaden_flag: lead.personenschaden_flag ?? false,
        mietwagen_flag: lead.mietwagen_flag ?? false,
        polizeibericht_pflicht: lead.polizeibericht_pflicht ?? false,
        gutachter_termin: lead.gutachter_termin ?? null,
        kennzeichen: lead.kennzeichen ?? '',
        fahrzeug_hersteller: lead.fahrzeug_hersteller ?? '',
        fahrzeug_modell: lead.fahrzeug_modell ?? '',
      }}
    />
  )
}
