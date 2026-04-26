// AAR-835: Repairs Queries

import { createClient } from '@/lib/supabase/server'

export type Werkstatt = {
  id: string
  name: string
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  telefon: string | null
  email: string | null
  partner: boolean
}

export type RepairMitWerkstatt = {
  id: string
  claim_id: string
  werkstatt_id: string | null
  gutachten_id: string | null
  status: string
  auftragsnummer: string | null
  geplanter_beginn: string | null
  tatsaechlicher_beginn: string | null
  abgeschlossen_am: string | null
  kostenvoranschlag: number | null
  tatsaechliche_kosten: number | null
  notiz: string | null
  created_at: string
  updated_at: string
  created_by_user_id: string | null
  werkstaetten: Werkstatt | null
}

export async function getRepairsForClaim(claimId: string): Promise<RepairMitWerkstatt[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('repairs')
    .select(`
      id, claim_id, werkstatt_id, gutachten_id, status, auftragsnummer,
      geplanter_beginn, tatsaechlicher_beginn, abgeschlossen_am,
      kostenvoranschlag, tatsaechliche_kosten, notiz,
      created_at, updated_at, created_by_user_id,
      werkstaetten ( id, name, adresse_strasse, adresse_plz, adresse_ort, telefon, email, partner )
    `)
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[AAR-835] getRepairsForClaim:', error.message)
    return []
  }

  return (data ?? []).map((r) => ({
    ...r,
    werkstaetten: Array.isArray(r.werkstaetten) ? (r.werkstaetten[0] ?? null) : r.werkstaetten,
  })) as unknown as RepairMitWerkstatt[]
}

export async function getRepairWithDetails(repairId: string): Promise<RepairMitWerkstatt | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('repairs')
    .select(`
      id, claim_id, werkstatt_id, gutachten_id, status, auftragsnummer,
      geplanter_beginn, tatsaechlicher_beginn, abgeschlossen_am,
      kostenvoranschlag, tatsaechliche_kosten, notiz,
      created_at, updated_at, created_by_user_id,
      werkstaetten ( id, name, adresse_strasse, adresse_plz, adresse_ort, telefon, email, partner )
    `)
    .eq('id', repairId)
    .single()

  if (error) {
    console.error('[AAR-835] getRepairWithDetails:', error.message)
    return null
  }

  return {
    ...data,
    werkstaetten: Array.isArray(data.werkstaetten) ? (data.werkstaetten[0] ?? null) : data.werkstaetten,
  } as unknown as RepairMitWerkstatt
}
