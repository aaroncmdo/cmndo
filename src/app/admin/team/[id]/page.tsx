import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MitarbeiterDetail from './MitarbeiterDetail'

export default async function MitarbeiterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: mitarbeiter } = await supabase
    .from('profiles')
    // AAR-343: twofa_telefon für 2FA-Reset-Panel
    .select('id, email, vorname, nachname, rolle, telefon, twofa_telefon, position, gehaltsstufe, gehalt_brutto, kategorie, kapazitaet_max, aktiv, eingestellt_am, force_password_change, created_at, twilio_whatsapp_nummer, twilio_phone_sid, twilio_nummer_provisioned_am')
    .eq('id', id)
    .single()
  if (!mitarbeiter) notFound()

  const now = new Date()
  const monatStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const isDispatch = mitarbeiter.kategorie === 'dispatch' || mitarbeiter.rolle === 'leadbearbeiter'

  const [{ data: leadsRaw }, { data: faelleAktivRaw }, { data: faelleAbgRaw }, { data: perf }] = await Promise.all([
    supabase.from('leads').select('id, status').eq('zugewiesen_an', id).gte('created_at', monatStr),
    supabase.from('faelle').select('id').eq('kundenbetreuer_id', id).not('status', 'in', '("abgeschlossen","storniert")'),
    supabase.from('faelle').select('id, created_at, abgeschlossen_am').eq('kundenbetreuer_id', id).eq('status', 'abgeschlossen').gte('abgeschlossen_am', monatStr),
    supabase.from('mitarbeiter_performance').select('*').eq('mitarbeiter_id', id).order('jahr', { ascending: false }).order('monat', { ascending: false }).limit(6),
  ])

  const leadsTotal = leadsRaw?.length ?? 0
  const leadsKonvertiert = leadsRaw?.filter(l => l.status === 'umgewandelt' || l.status === 'umgewandelt-sv').length ?? 0
  const aktiveFaelle = faelleAktivRaw?.length ?? 0
  const abgeschlossen = faelleAbgRaw?.length ?? 0

  let avgDays = 0
  const completed = (faelleAbgRaw ?? []).filter(f => f.abgeschlossen_am && f.created_at)
  if (completed.length > 0) {
    const total = completed.reduce((s, f) => s + (new Date(f.abgeschlossen_am!).getTime() - new Date(f.created_at).getTime()) / 86400000, 0)
    avgDays = Math.round(total / completed.length)
  }

  return (
    <MitarbeiterDetail
      mitarbeiter={mitarbeiter}
      stats={{ leadsTotal, leadsKonvertiert, aktiveFaelle, abgeschlossen, avgDays, isDispatch }}
      performanceHistory={perf ?? []}
    />
  )
}
