// Admin-Uebersicht: offene Reparaturfreigaben ueber ALLE Werkstaetten (Team-Backlog).
// Quelle = die vom Trigger erzeugten reparatur_freigabe-Tasks (status offen/in-bearbeitung).
// Admin-Client (Service-Role): nur in der admin-guarded /admin/werkstaetten-Page aufgerufen
// -> umgeht RLS fuer den Multi-Tabellen-Join (kein FK-Namen-Raten, batched in JS gejoint).

import { createAdminClient } from '@/lib/supabase/admin'

export type AusstehendeFreigabe = {
  claim_id: string
  fall_id: string | null
  werkstatt_name: string | null
  kennzeichen: string | null
  kva_betrag: number | null
  kb_name: string | null
  faellig_am: string | null
  ueberfaellig: boolean
  eskaliert: boolean
  erstellt_am: string
}

type TaskRow = { claim_id: string | null; fall_id: string | null; faellig_am: string | null; eskaliert_am: string | null; created_at: string; zugewiesen_an: string | null }
type ClaimRow = { id: string; werkstatt_id: string | null; lead_id: string | null }
type LeadRow = { id: string; kennzeichen: string | null; kostenvoranschlag_brutto: number | null; kostenvoranschlag_netto: number | null }
type ProfRow = { id: string; vorname: string | null; nachname: string | null }

export async function getAusstehendeFreigaben(): Promise<AusstehendeFreigabe[]> {
  const admin = createAdminClient()

  const { data: tasksData } = await admin
    .from('tasks')
    .select('claim_id, fall_id, faellig_am, eskaliert_am, created_at, zugewiesen_an')
    .eq('task_code', 'reparatur_freigabe')
    .in('status', ['offen', 'in-bearbeitung'])
    .order('faellig_am', { ascending: true })
  const tasks = (tasksData ?? []) as unknown as TaskRow[]
  if (tasks.length === 0) return []

  const claimIds = [...new Set(tasks.map(t => t.claim_id).filter(Boolean))] as string[]
  const kbIds = [...new Set(tasks.map(t => t.zugewiesen_an).filter(Boolean))] as string[]

  const { data: claimsData } = await admin.from('claims').select('id, werkstatt_id, lead_id').in('id', claimIds)
  const claims = (claimsData ?? []) as unknown as ClaimRow[]
  const claimMap = new Map(claims.map(c => [c.id, c]))
  const werkIds = [...new Set(claims.map(c => c.werkstatt_id).filter(Boolean))] as string[]
  const leadIds = [...new Set(claims.map(c => c.lead_id).filter(Boolean))] as string[]

  const [werksRes, leadsRes, profsRes] = await Promise.all([
    admin.from('werkstaetten').select('id, name').in('id', werkIds),
    admin.from('leads').select('id, kennzeichen, kostenvoranschlag_brutto, kostenvoranschlag_netto').in('id', leadIds),
    admin.from('profiles').select('id, vorname, nachname').in('id', kbIds),
  ])
  const werkMap = new Map(((werksRes.data ?? []) as unknown as { id: string; name: string }[]).map(w => [w.id, w.name]))
  const leadMap = new Map(((leadsRes.data ?? []) as unknown as LeadRow[]).map(l => [l.id, l]))
  const profMap = new Map(((profsRes.data ?? []) as unknown as ProfRow[]).map(p => [p.id, p]))

  const now = Date.now()
  return tasks.map((t): AusstehendeFreigabe => {
    const c = t.claim_id ? claimMap.get(t.claim_id) : undefined
    const lead = c?.lead_id ? leadMap.get(c.lead_id) : undefined
    const prof = t.zugewiesen_an ? profMap.get(t.zugewiesen_an) : undefined
    const kva = lead ? (lead.kostenvoranschlag_brutto ?? lead.kostenvoranschlag_netto) : null
    return {
      claim_id: (t.claim_id ?? '') as string,
      fall_id: t.fall_id,
      werkstatt_name: c?.werkstatt_id ? (werkMap.get(c.werkstatt_id) ?? null) : null,
      kennzeichen: lead?.kennzeichen ?? null,
      kva_betrag: kva != null ? Number(kva) : null,
      kb_name: prof ? ([prof.vorname, prof.nachname].filter(Boolean).join(' ') || null) : null,
      faellig_am: t.faellig_am,
      ueberfaellig: t.faellig_am ? new Date(t.faellig_am).getTime() < now : false,
      eskaliert: t.eskaliert_am != null,
      erstellt_am: t.created_at,
    }
  })
}
