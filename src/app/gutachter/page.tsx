import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GutachterFieldApp from './GutachterFieldApp'

export default async function GutachterDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, standort_lat, standort_lng, paket_faelle_genutzt, paket_faelle_gesamt, guthaben, offene_faelle, max_faelle_monat')
    .eq('profile_id', user.id)
    .single()

  if (!sv) return <div className="p-8 text-center text-gray-500">Kein Gutachter-Profil gefunden.</div>

  const { data: profile } = await supabase.from('profiles').select('vorname').eq('id', user.id).single()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [todayRes, neueRes, tasksRes, erledigtRes] = await Promise.all([
    supabase.from('faelle')
      .select('id, fall_nummer, status, schadens_adresse, schadens_plz, schadens_ort, sv_termin, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadenfall_typ')
      .eq('sv_id', sv.id).gte('sv_termin', todayStart).lt('sv_termin', todayEnd)
      .not('status', 'in', '("abgeschlossen","storniert")').order('sv_termin', { ascending: true }),
    supabase.from('faelle')
      .select('id, fall_nummer, status, schadens_adresse, schadens_plz, schadens_ort, lead_id, created_at')
      .eq('sv_id', sv.id).is('sv_termin', null)
      .not('status', 'in', '("abgeschlossen","storniert")').order('created_at', { ascending: false }).limit(10),
    supabase.from('tasks')
      .select('id, titel, status, faellig_am, fall_id')
      .or(`zugewiesen_an.eq.${user.id},empfaenger_user_id.eq.${user.id}`)
      .in('status', ['offen', 'in-arbeit']).order('faellig_am').limit(10),
    supabase.from('faelle').select('id', { count: 'exact', head: true })
      .eq('sv_id', sv.id).eq('status', 'abgeschlossen').gte('created_at', monthStart),
  ])

  const allLeadIds = [...new Set([...(todayRes.data ?? []), ...(neueRes.data ?? [])].map(f => f.lead_id).filter(Boolean) as string[])]
  let leadMap: Record<string, { name: string; telefon: string | null; email: string | null }> = {}
  if (allLeadIds.length) {
    const { data: leads } = await supabase.from('leads').select('id, vorname, nachname, telefon, email').in('id', allLeadIds)
    for (const l of leads ?? []) {
      leadMap[l.id] = { name: [l.vorname, l.nachname].filter(Boolean).join(' ') || '—', telefon: l.telefon, email: l.email }
    }
  }

  const stops = (todayRes.data ?? []).map(f => [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', ')).filter(Boolean)
  const routeUrl = stops.length ? `https://www.google.com/maps/dir/${stops.map(s => encodeURIComponent(s)).join('/')}` : null

  const termine = (todayRes.data ?? []).map(f => ({
    id: f.id as string, fallNr: f.fall_nummer as string | null,
    uhrzeit: f.sv_termin ? new Date(f.sv_termin).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—',
    kunde: leadMap[f.lead_id ?? '']?.name ?? '—',
    telefon: leadMap[f.lead_id ?? '']?.telefon ?? null,
    email: leadMap[f.lead_id ?? '']?.email ?? null,
    adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '),
    kennzeichen: (f.kennzeichen as string) ?? null,
    fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || null,
    schadentyp: (f.schadenfall_typ as string) ?? null, status: f.status as string,
  }))

  const neueAuftraege = (neueRes.data ?? []).map(f => ({
    id: f.id as string, fallNr: f.fall_nummer as string | null,
    kunde: leadMap[f.lead_id ?? '']?.name ?? '—',
    adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '),
  }))

  const tasks = (tasksRes.data ?? []).map(t => ({
    id: t.id as string, titel: t.titel as string,
    faellig: t.faellig_am as string | null, fallId: t.fall_id as string | null,
  }))

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'

  return (
    <GutachterFieldApp
      greeting={`${greeting}${profile?.vorname ? ` ${profile.vorname}` : ''}`}
      datum={now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
      termine={termine} neueAuftraege={neueAuftraege} tasks={tasks} routeUrl={routeUrl}
      stats={{ faelle: sv.offene_faelle ?? sv.paket_faelle_genutzt ?? 0, maxFaelle: sv.max_faelle_monat ?? sv.paket_faelle_gesamt ?? 25, guthaben: typeof sv.guthaben === 'number' ? sv.guthaben : 0, erledigtMonat: erledigtRes.count ?? 0 }}
      svLat={sv.standort_lat ? Number(sv.standort_lat) : null}
      svLng={sv.standort_lng ? Number(sv.standort_lng) : null}
      mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''}
    />
  )
}
