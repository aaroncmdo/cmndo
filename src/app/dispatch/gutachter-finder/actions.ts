'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type GutachterFinderAnfrage = {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string | null
  kennzeichen: string | null
  schadentyp: string
  schadenort: string | null
  wunschtermin: string | null
  matching_typ: string | null
  sa_unterzeichnet_am: string | null
  status: string
  erstellt_am: string
  sv_name: string | null
  sv_telefon: string | null
  sv_lead_name: string | null
  sv_lead_telefon: string | null
}

export async function ladeGutachterFinderAnfragen(): Promise<{
  ok: true
  data: GutachterFinderAnfrage[]
} | { ok: false; error: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('gutachter_finder_anfragen')
    .select(`
      id, vorname, nachname, email, telefon, kennzeichen,
      schadentyp, schadenort, wunschtermin, matching_typ,
      sa_unterzeichnet_am, status, erstellt_am,
      zugeordneter_sv:sachverstaendige(
        firmenname,
        profiles(anzeigename, telefon)
      ),
      sv_lead:sv_leads(name, telefon)
    `)
    .order('erstellt_am', { ascending: false })

  if (error) return { ok: false, error: error.message }

  const anfragen: GutachterFinderAnfrage[] = (data ?? []).map((row: unknown) => {
    const r = row as {
      id: string; vorname: string; nachname: string; email: string; telefon: string | null
      kennzeichen: string | null; schadentyp: string; schadenort: string | null
      wunschtermin: string | null; matching_typ: string | null; sa_unterzeichnet_am: string | null
      status: string; erstellt_am: string
      zugeordneter_sv: { firmenname: string | null; profiles: { anzeigename?: string; telefon?: string } | { anzeigename?: string; telefon?: string }[] | null } | null
      sv_lead: { name: string; telefon: string | null } | null
    }

    const svRaw = Array.isArray(r.zugeordneter_sv) ? r.zugeordneter_sv[0] ?? null : r.zugeordneter_sv
    const svProfile = svRaw ? (Array.isArray(svRaw.profiles) ? svRaw.profiles[0] ?? null : svRaw.profiles) : null
    const svLead = Array.isArray(r.sv_lead) ? r.sv_lead[0] ?? null : r.sv_lead

    return {
      id: r.id,
      vorname: r.vorname,
      nachname: r.nachname,
      email: r.email,
      telefon: r.telefon,
      kennzeichen: r.kennzeichen,
      schadentyp: r.schadentyp,
      schadenort: r.schadenort,
      wunschtermin: r.wunschtermin,
      matching_typ: r.matching_typ,
      sa_unterzeichnet_am: r.sa_unterzeichnet_am,
      status: r.status,
      erstellt_am: r.erstellt_am,
      sv_name: svRaw?.firmenname ?? (svProfile as { anzeigename?: string } | null)?.anzeigename ?? null,
      sv_telefon: (svProfile as { telefon?: string } | null)?.telefon ?? null,
      sv_lead_name: svLead?.name ?? null,
      sv_lead_telefon: svLead?.telefon ?? null,
    }
  })

  return { ok: true, data: anfragen }
}

export async function aktualisiereAnfrageStatus(
  id: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gutachter_finder_anfragen')
    .update({ status })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dispatch/gutachter-finder')
  return { ok: true }
}
