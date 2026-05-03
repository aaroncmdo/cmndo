import { createClient } from '@/lib/supabase/server'
import KanbanBoard from './KanbanBoard'

// AAR-154: Zusätzlich zu fall_id laden wir jetzt Leads + SVs für Task-
// Objekt-Verlinkung (entity_type='lead' / 'gutachter' / 'fall').
// Tasks ohne referenziertes Objekt (weder fall_id noch entity_id) werden
// clientseitig gefiltert — die sind typisch Alt-System-Einträge ohne Bezug.
export default async function TasksPage() {
  const supabase = await createClient()

  const [{ data: tasks }, { data: faelle }, { data: admins }, { data: leads }, { data: svs }, { data: reassignProfiles }] =
    await Promise.all([
      supabase
        .from('tasks')
        .select(
          'id, fall_id, lead_id, typ, task_typ, titel, beschreibung, status, faellig_am, erledigt_am, zugewiesen_an, created_at, entity_type, entity_id, auto_resolved_am, auto_resolved_grund',
        )
        .order('created_at', { ascending: false }),
      supabase.from('faelle').select('id, fall_nummer').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, vorname, nachname').in('rolle', ['admin', 'kanzlei']),
      supabase.from('leads').select('id, vorname, nachname, telefon'),
      supabase
        .from('sachverstaendige')
        .select('id, profile_id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)'),
      // AAR-723: Alle aktiven Mitarbeiter-Profile als Reassign-Kandidaten
      // (alle Rollen außer Kunde/Makler/SV — das sind Portal-User, Tasks
      // werden intern umverteilt).
      supabase
        .from('profiles')
        .select('id, vorname, nachname, rolle')
        .not('aktiv', 'is', false)
        .in('rolle', ['admin', 'kundenbetreuer', 'dispatch', 'kanzlei']),
    ])

  const fallMap = Object.fromEntries(
    (faelle ?? []).map((f) => [f.id, f.fall_nummer ?? f.id.slice(0, 8)]),
  )
  const adminMap = Object.fromEntries(
    (admins ?? []).map((a) => [
      a.id,
      `${a.vorname ?? ''} ${a.nachname ?? ''}`.trim() || a.id.slice(0, 8),
    ]),
  )
  const leadMap = Object.fromEntries(
    (leads ?? []).map((l) => [
      l.id,
      `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || l.telefon || l.id.slice(0, 8),
    ]),
  )
  const svMap = Object.fromEntries(
    (svs ?? []).map((sv) => {
      const pRel = sv.profiles as unknown
      const p = (Array.isArray(pRel) ? pRel[0] : pRel) as
        | { vorname: string | null; nachname: string | null }
        | null
      return [
        sv.id,
        `${p?.vorname ?? ''} ${p?.nachname ?? ''}`.trim() || sv.id.slice(0, 8),
      ]
    }),
  )

  const reassignCandidates = (reassignProfiles ?? []).map(p => ({
    id: p.id as string,
    name: [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Unbekannt',
    rolle: p.rolle as string,
  }))

  return (
    <KanbanBoard
      tasks={tasks ?? []}
      faelle={faelle ?? []}
      fallMap={fallMap}
      adminMap={adminMap}
      leadMap={leadMap}
      svMap={svMap}
      admins={admins ?? []}
      reassignCandidates={reassignCandidates}
    />
  )
}
