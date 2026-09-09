import { createClient } from '@/lib/supabase/server'
import { claimNummernForFaelle } from '@/lib/claims/claim-nummer-map'
import { alleSeiten } from '@/lib/db/alle-seiten'
import KalenderClient from './KalenderClient'
import { getActiveGutachter } from '@/lib/actions/admin-kalender'

// Zeilenformen der drei Lesepfade — deckungsgleich mit den Props von
// KalenderClient (TaskTermin / ManuellerTermin dort).
type TaskRow = { id: string; fall_id: string | null; titel: string; faellig_am: string; status: string }
type TerminRow = { id: string; fall_id: string | null; typ: string; datum: string; dauer_minuten: number; betreff: string | null; status: string }
type GutachterTerminRow = { fall_id: string | null; assignee_id: string | null; start_zeit: string; status: string }

export default async function KalenderPage() {
  const supabase = await createClient()

  // ⚠ Ohne `range` liefert PostgREST still hoechstens 1.000 Zeilen. Auf prod
  // haben 1.928 Aufgaben eine Faelligkeit (gemessen 09.09.2026) — **928 fehlten
  // im Kalender**, ohne Fehler, ohne Hinweis. Die Luecke waechst mit jeder
  // neuen Aufgabe: am 03.09. waren es noch 719.
  //
  // `termine` (heute 0 Zeilen) und `gutachter_termine` (96) liegen unter dem
  // Deckel, tragen aber dasselbe Muster — sie kippen still, sobald sie ihn
  // erreichen. Deshalb hier gleich mitgezogen statt als spaeterer Befund.
  const [tasksGelesen, termineGelesen] = await Promise.all([
    alleSeiten<TaskRow>((von, bis) =>
      supabase
        .from('tasks')
        .select('id, fall_id, titel, faellig_am, status')
        .not('faellig_am', 'is', null)
        // Ein Zweitschluessel ist Pflicht: ohne stabile Reihenfolge kann
        // dieselbe Zeile auf zwei Seiten erscheinen — oder auf keiner.
        .order('id', { ascending: true })
        .range(von, bis),
    ),
    // BUG-08: Auch KB-Termine und manuelle Termine laden
    alleSeiten<TerminRow>((von, bis) =>
      supabase
        .from('termine')
        .select('id, fall_id, typ, datum, dauer_minuten, betreff, status')
        .not('datum', 'is', null)
        .order('id', { ascending: true })
        .range(von, bis),
    ),
  ])
  // Verhalten bei Lesefehler bleibt wie bisher (leere Liste) — neu ist nur,
  // dass der Fehlschlag ueberhaupt sichtbar wird statt in `data: null` zu
  // verschwinden.
  if (!tasksGelesen.ok) console.error('[admin/kalender] tasks:', tasksGelesen.error)
  if (!termineGelesen.ok) console.error('[admin/kalender] termine:', termineGelesen.error)
  const tasks: TaskRow[] = tasksGelesen.ok ? tasksGelesen.zeilen : []
  const termine: TerminRow[] = termineGelesen.ok ? termineGelesen.zeilen : []

  // KANONISCH (2026-07-07): SV-Termine aus gutachter_termine (assignee_id) statt stale
  // v_faelle_mit_aktuellem_termin.sv_termin (claim-scoped, claim_id meist NULL). claim_nummer
  // via v_claim_full angereichert. Siehe Spec 2026-07-07-sv-termine-canonical-source.
  const gtGelesen = await alleSeiten<GutachterTerminRow>((von, bis) =>
    supabase
      .from('gutachter_termine')
      .select('fall_id, assignee_id, start_zeit, status')
      .eq('assignee_typ', 'sachverstaendiger')
      .in('status', ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt', 'gegenvorschlag'])
      .not('start_zeit', 'is', null)
      .order('id', { ascending: true })
      .range(von, bis),
  )
  if (!gtGelesen.ok) console.error('[admin/kalender] gutachter_termine:', gtGelesen.error)
  const gtRows: GutachterTerminRow[] = gtGelesen.ok ? gtGelesen.zeilen : []
  const gtFallIds = [...new Set(gtRows.map((r) => r.fall_id).filter(Boolean) as string[])]
  const claimNrMap: Record<string, string | null> = {}
  if (gtFallIds.length) {
    const { data: cf } = await supabase.from('v_claim_full').select('fall_id, claim_nummer').in('fall_id', gtFallIds)
    for (const c of (cf ?? []) as Array<{ fall_id: string; claim_nummer: string | null }>) claimNrMap[c.fall_id] = c.claim_nummer ?? null
  }
  const faelle = gtRows.map((r) => ({
    id: (r.fall_id ?? '') as string,
    claim_nummer: r.fall_id ? (claimNrMap[r.fall_id] ?? null) : null,
    sv_termin: r.start_zeit,
    sv_id: r.assignee_id,
    status: r.status,
  }))

  // Fetch SV names
  const svIds = [...new Set(faelle.map(f => f.sv_id).filter(Boolean))]
  const { data: svs } = svIds.length > 0
    ? await supabase.from('sachverstaendige').select('id, profile_id').in('id', svIds)
    : { data: [] }

  const profileIds = (svs ?? []).map(s => s.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }

  const profileMap: Record<string, string> = {}
  for (const p of profiles ?? []) {
    profileMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'
  }
  const svMap: Record<string, string> = {}
  for (const sv of svs ?? []) {
    svMap[sv.id] = profileMap[sv.profile_id] ?? '—'
  }

  // Fetch claim_nummer for tasks
  // CMM-49: faelle-frei via Bridge+claims (shared helper).
  const fallIds = [...new Set(tasks.map(t => t.fall_id).filter(Boolean) as string[])]
  const fallMap: Record<string, string> = {}
  for (const r of await claimNummernForFaelle(supabase, fallIds)) {
    fallMap[r.fall_id] = r.claim_nummer ?? r.fall_id.slice(0, 8)
  }

  // KFZ-138: Active Gutachter fuer Multiselect
  const gutachter = await getActiveGutachter()

  return (
    <KalenderClient
      faelle={faelle}
      tasks={tasks}
      termine={termine}
      svMap={svMap}
      fallMap={fallMap}
      gutachterList={gutachter}
    />
  )
}
