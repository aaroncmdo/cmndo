import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KaskoTarifeTable, { type KaskoTarifeZeile } from './KaskoTarifeTable'

// Kasko-WB Phase 1 (Aaron E5): nur Liste, keine Pflege — die Wissensbasis wird per Seed-Generator aktualisiert.
export const dynamic = 'force-dynamic'

export default async function KaskoTarifePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const { data } = await supabase
    .from('kasko_versicherer_marken')
    .select('id, marke, slug, wb_status, wb_marker, hinweis, stand, versicherung_id, kasko_tarife(hat_werkstattbindung)')
    .order('marke')

  const zeilen: KaskoTarifeZeile[] = ((data ?? []) as unknown as {
    id: string; marke: string; slug: string; wb_status: string; wb_marker: string[] | null; hinweis: string | null
    stand: string; versicherung_id: string | null; kasko_tarife: { hat_werkstattbindung: boolean }[] | null
  }[]).map((m) => ({
    id: m.id,
    marke: m.marke,
    slug: m.slug,
    wbStatus: m.wb_status,
    marker: m.wb_marker ?? [],
    hinweis: m.hinweis,
    stand: m.stand,
    rechtstraegerVerknuepft: m.versicherung_id != null,
    tarifeFrei: (m.kasko_tarife ?? []).filter((t) => !t.hat_werkstattbindung).length,
    tarifeGebunden: (m.kasko_tarife ?? []).filter((t) => t.hat_werkstattbindung).length,
  }))

  return <KaskoTarifeTable zeilen={zeilen} />
}
