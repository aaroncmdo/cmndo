import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

const PHASE_LABEL: Record<string, string> = {
  ersterfassung: 'Ersterfassung', 'sv-zugewiesen': 'SV zugew.', 'sv-termin': 'Termin',
  besichtigung: 'Besichtigung', 'gutachten-eingegangen': 'Gutachten', filmcheck: 'QC',
  'kanzlei-uebergeben': 'Kanzlei', anschlussschreiben: 'AS', regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschl.', storniert: 'Storniert',
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  const isAdmin = profile?.rolle === 'admin'

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const datumLabel = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })

  // Parallel data fetching
  const [
    { data: rueckrufeRaw },
    { data: termineRaw },
    { data: tasksRaw },
    { data: faelleRaw },
    { count: leadsCount },
    { count: faelleTotal },
    { data: konvertiertRaw },
    { data: gutachterTermineRaw },
  ] = await Promise.all([
    // Rückrufe heute
    supabase.from('leads')
      .select('id, vorname, nachname, telefon, schadenfall_typ, rueckruf_datum, rueckruf_notiz')
      .not('rueckruf_datum', 'is', null)
      .or('rueckruf_erledigt.is.null,rueckruf_erledigt.eq.false')
      .lte('rueckruf_datum', todayEnd)
      .order('rueckruf_datum', { ascending: true }),
    // Kundenbetreuer-Termine heute
    supabase.from('termine')
      .select('id, fall_id, typ, datum, dauer_minuten, betreff, status')
      .gte('datum', todayStart).lt('datum', todayEnd)
      .in('status', ['geplant', 'bestaetigt'])
      .order('datum', { ascending: true }),
    // Offene Tasks
    supabase.from('tasks')
      .select('id, titel, status, prioritaet, faellig_am, fall_id, faelle(fall_nummer)')
      .in('status', ['offen', 'in-bearbeitung'])
      .order('faellig_am', { ascending: true })
      .limit(20),
    // Aktive Fälle
    supabase.from('faelle')
      .select('id, fall_nummer, status, mandatsnummer, lead_id')
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false })
      .limit(15),
    // Stats
    supabase.from('leads').select('id', { count: 'exact', head: true }).not('status', 'in', '("disqualifiziert","kalt")'),
    supabase.from('faelle').select('id', { count: 'exact', head: true }).not('status', 'in', '("abgeschlossen","storniert")'),
    supabase.from('leads').select('id').eq('status', 'umgewandelt').gte('updated_at', todayStart),
    // Gutachtertermine heute
    supabase.from('gutachter_termine')
      .select('id, fall_id, start_zeit, status, faelle(fall_nummer)')
      .gte('start_zeit', todayStart).lt('start_zeit', todayEnd)
      .eq('status', 'bestaetigt')
      .order('start_zeit', { ascending: true }),
  ])

  // Resolve Fälle names
  const faelleLeadIds = (faelleRaw ?? []).map(f => f.lead_id).filter(Boolean) as string[]
  let leadNameMap: Record<string, string> = {}
  if (faelleLeadIds.length > 0) {
    const { data: leads } = await supabase.from('leads').select('id, vorname, nachname').in('id', faelleLeadIds)
    leadNameMap = Object.fromEntries((leads ?? []).map(l => [l.id, [l.vorname, l.nachname].filter(Boolean).join(' ') || '—']))
  }

  // Build Rückrufe
  const rueckrufe = (rueckrufeRaw ?? []).map(r => ({
    id: r.id as string,
    name: [r.vorname, r.nachname].filter(Boolean).join(' ') || '—',
    telefon: r.telefon as string | null,
    schadentyp: r.schadenfall_typ as string | null,
    datum: r.rueckruf_datum as string,
    notiz: r.rueckruf_notiz as string | null,
  }))

  // Build Timeline
  const timeline: { zeit: string; typ: string; label: string; detail: string; link?: string }[] = []

  for (const t of termineRaw ?? []) {
    timeline.push({
      zeit: t.datum as string,
      typ: t.typ === 'video-call' ? 'video-call' : 'telefonat',
      label: (t.betreff as string) ?? (t.typ === 'video-call' ? 'Video-Call' : 'Telefonat'),
      detail: `${t.dauer_minuten} Min`,
      link: t.fall_id ? `/admin/faelle/${t.fall_id}` : undefined,
    })
  }

  for (const t of gutachterTermineRaw ?? []) {
    const fallRaw = t.faelle as Record<string, unknown> | null
    timeline.push({
      zeit: t.start_zeit as string,
      typ: 'gutachter',
      label: 'Gutachtertermin',
      detail: fallRaw?.fall_nummer ? `Fall ${fallRaw.fall_nummer}` : '',
      link: t.fall_id ? `/admin/faelle/${t.fall_id}` : undefined,
    })
  }

  for (const r of rueckrufe) {
    const d = new Date(r.datum)
    if (d >= new Date(todayStart) && d < new Date(todayEnd)) {
      timeline.push({ zeit: r.datum, typ: 'rueckruf', label: `Rückruf: ${r.name}`, detail: r.notiz ?? '', link: `/admin/dispatch/lead/${r.id}` })
    }
  }

  // Überfällige Tasks als Timeline-Einträge
  const ueberfaelligeTasks = (tasksRaw ?? []).filter(t => t.faellig_am && new Date(t.faellig_am) < now)
  for (const t of ueberfaelligeTasks.slice(0, 5)) {
    timeline.push({ zeit: t.faellig_am!, typ: 'task', label: t.titel as string, detail: 'ÜBERFÄLLIG', link: t.fall_id ? `/admin/faelle/${t.fall_id}` : undefined })
  }

  timeline.sort((a, b) => new Date(a.zeit).getTime() - new Date(b.zeit).getTime())

  // Build Tasks
  const tasks = (tasksRaw ?? []).map(t => {
    const fallRaw = t.faelle as Record<string, unknown> | null
    return {
      id: t.id as string,
      titel: t.titel as string,
      fallNr: (fallRaw?.fall_nummer as string) ?? '—',
      fallId: t.fall_id as string | null,
      deadline: t.faellig_am as string | null,
      prioritaet: t.prioritaet as string | null,
    }
  })

  // Build Fälle
  const faelle = (faelleRaw ?? []).map(f => ({
    id: f.id as string,
    fallNr: ((f as Record<string, unknown>).mandatsnummer as string) ?? f.fall_nummer ?? f.id.slice(0, 8),
    kundeName: f.lead_id ? (leadNameMap[f.lead_id] ?? null) : null,
    status: f.status as string,
    phase: PHASE_LABEL[f.status] ?? f.status,
  }))

  return (
    <DashboardClient
      rueckrufe={rueckrufe}
      timeline={timeline}
      tasks={tasks}
      faelle={faelle}
      stats={{
        leads: leadsCount ?? 0,
        faelleCount: faelleTotal ?? 0,
        konvertiert: (konvertiertRaw ?? []).length,
        ueberfaellig: ueberfaelligeTasks.length,
      }}
      datumLabel={datumLabel}
    />
  )
}
