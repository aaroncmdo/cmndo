import { createClient } from '@/lib/supabase/server'
import RouteClient from './RouteClient'

export default async function TagesroutePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user!.id)
    .single()

  if (!sv) {
    return (
      <div className="px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
            <p className="text-zinc-500">Kein Sachverstaendigen-Profil gefunden.</p>
          </div>
        </div>
      </div>
    )
  }

  const today = new Date()
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  // Fetch today's termine with fall data
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, end_zeit, status, ankunft_zeit, abschluss_zeit, uebersprungen, uebersprung_grund, notizen_vor_ort')
    .eq('sv_id', sv.id)
    .gte('start_zeit', dayStart.toISOString())
    .lte('start_zeit', dayEnd.toISOString())
    .neq('status', 'storniert')
    .order('start_zeit', { ascending: true })

  // Also fetch from faelle.sv_termin as fallback
  const { data: faelleWithTermin } = await supabase
    .from('faelle')
    .select('id, fall_nummer, sv_termin, status, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, lead_id, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, vorschaden_vorhanden')
    .eq('sv_id', sv.id)
    .gte('sv_termin', dayStart.toISOString())
    .lte('sv_termin', dayEnd.toISOString())
    .order('sv_termin', { ascending: true })

  // Fetch lead names
  const leadIds = [...new Set((faelleWithTermin ?? []).map(f => f.lead_id).filter(Boolean))] as string[]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname, telefon').in('id', leadIds)
    : { data: [] }

  const leadMap: Record<string, { vorname: string | null; nachname: string | null; telefon: string | null }> = {}
  for (const l of leads ?? []) leadMap[l.id] = l

  // Build stops combining termine + faelle data
  const stops = (faelleWithTermin ?? []).map(fall => {
    const termin = (termine ?? []).find(t => t.fall_id === fall.id)
    const lead = fall.lead_id ? leadMap[fall.lead_id] : null
    const address = [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ')
    return {
      id: fall.id,
      terminId: termin?.id ?? null,
      fallNummer: fall.fall_nummer ?? fall.id.slice(0, 8),
      name: lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt' : 'Unbekannt',
      telefon: lead?.telefon ?? null,
      address,
      time: fall.sv_termin ? new Date(fall.sv_termin).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '--:--',
      schadenTyp: fall.schadens_ursache ?? null,
      fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || null,
      kennzeichen: fall.kennzeichen ?? null,
      vorschaden: fall.vorschaden_vorhanden ?? false,
      status: termin?.uebersprungen ? 'uebersprungen' as const
        : termin?.abschluss_zeit ? 'erledigt' as const
        : termin?.ankunft_zeit ? 'vor-ort' as const
        : 'ausstehend' as const,
      ankunftZeit: termin?.ankunft_zeit ?? null,
      abschlussZeit: termin?.abschluss_zeit ?? null,
      notizen: termin?.notizen_vor_ort ?? null,
    }
  })

  const todayFormatted = today.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return <RouteClient stops={stops} datum={todayFormatted} mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''} />
}
