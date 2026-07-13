import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import MitarbeiterDetail from './MitarbeiterDetail'

export default async function MitarbeiterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profil } = await supabase
    .from('profiles')
    // AAR-343: twofa_telefon für 2FA-Reset-Panel
    .select('id, email, vorname, nachname, rolle, telefon, twofa_telefon, kategorie, kapazitaet_max, aktiv, force_password_change, created_at, twilio_whatsapp_nummer, twilio_phone_sid, twilio_nummer_provisioned_am')
    .eq('id', id)
    .single()
  if (!profil) notFound()

  // W2.3/AAR-951: HR-Felder aus admin-only mitarbeiter_verguetung holen + flach mergen
  // (MitarbeiterDetail liest m.position/gehaltsstufe/gehalt_brutto/eingestellt_am unveraendert).
  const { data: verg } = await supabase
    .from('mitarbeiter_verguetung')
    .select('position, gehaltsstufe, gehalt_brutto, eingestellt_am')
    .eq('profile_id', id)
    .maybeSingle()
  const mitarbeiter = {
    ...profil,
    position: verg?.position ?? null,
    gehaltsstufe: verg?.gehaltsstufe ?? null,
    gehalt_brutto: verg?.gehalt_brutto ?? null,
    eingestellt_am: verg?.eingestellt_am ?? null,
  }

  // Task B (Aaron-Fund): aktuelle Handy-LOGIN-Nummer (auth.users.phone) — getrennt
  // von twofa_telefon. Nur der Admin-Client kann auth.users lesen; non-critical.
  let loginPhone: string | null = null
  try {
    const adminDb = createAdminClient()
    const { data: authUser } = await adminDb.auth.admin.getUserById(id)
    const raw = authUser?.user?.phone ?? null
    loginPhone = raw ? (raw.startsWith('+') ? raw : `+${raw}`) : null
  } catch {
    // ignore — Panel zeigt dann '—'
  }

  const now = new Date()
  const monatStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const isDispatch = mitarbeiter.kategorie === 'dispatch' || mitarbeiter.rolle === 'dispatch'

  const [{ data: leadsRaw }, { data: faelleAktivRaw }, { data: faelleAbgRaw }, { data: perf }] = await Promise.all([
    supabase.from('leads').select('id, status').eq('zugewiesen_an', id).gte('created_at', monatStr),
    // CMM-47: faelle → v_claim_full. CMM-49 T1.2-d: abgeschlossen-KPI über sub_phase='erfolgreich_reguliert'.
    supabase.from('v_claim_full').select('id').eq('kundenbetreuer_id', id).neq('main_phase', 'abschluss'),
    supabase.from('v_claim_full').select('id, fall_created_at, abgeschlossen_am').eq('kundenbetreuer_id', id).eq('sub_phase', 'erfolgreich_reguliert').gte('abgeschlossen_am', monatStr),
    supabase.from('mitarbeiter_performance').select('*').eq('mitarbeiter_id', id).order('jahr', { ascending: false }).order('monat', { ascending: false }).limit(6),
  ])

  const leadsTotal = leadsRaw?.length ?? 0
  const leadsKonvertiert = leadsRaw?.filter(l => l.status === 'umgewandelt' || l.status === 'umgewandelt-sv').length ?? 0
  const aktiveFaelle = faelleAktivRaw?.length ?? 0
  const abgeschlossen = faelleAbgRaw?.length ?? 0

  let avgDays = 0
  const completed = (faelleAbgRaw ?? []).filter(f => f.abgeschlossen_am && f.fall_created_at)
  if (completed.length > 0) {
    const total = completed.reduce((s, f) => s + (new Date(f.abgeschlossen_am!).getTime() - new Date(f.fall_created_at!).getTime()) / 86400000, 0)
    avgDays = Math.round(total / completed.length)
  }

  return (
    <MitarbeiterDetail
      mitarbeiter={mitarbeiter}
      stats={{ leadsTotal, leadsKonvertiert, aktiveFaelle, abgeschlossen, avgDays, isDispatch }}
      performanceHistory={perf ?? []}
      loginPhone={loginPhone}
    />
  )
}
