import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnspruchSaetzeClient from './AnspruchSaetzeClient'

// Admin-Tuning der Anspruchspruefer-Saetze. Admin-gated (wie die uebrigen
// /admin/einstellungen-Sub-Pages). Laedt die beiden SSoT-Tabellen und reicht
// sie an den Client-Editor.
export const dynamic = 'force-dynamic'

export default async function AnspruchSaetzePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const [klasseRes, configRes] = await Promise.all([
    // nutzungsausfall_klasse_saetze noch nicht in generierten Types -> Cast (wie rates.ts).
    supabase.from('nutzungsausfall_klasse_saetze' as never).select('klasse, euro_pro_tag, bezeichnung, beispiele'),
    supabase.from('anspruch_config').select('key, wert'),
  ])

  const klassen = ((klasseRes.data ?? []) as {
    klasse: string; euro_pro_tag: number | string; bezeichnung: string | null; beispiele: string | null
  }[])
    .map((k) => ({
      klasse: k.klasse,
      euroProTag: Number(k.euro_pro_tag),
      bezeichnung: k.bezeichnung,
      beispiele: k.beispiele,
    }))
    .sort((a, b) => a.klasse.localeCompare(b.klasse))

  const config = ((configRes.data ?? []) as { key: string; wert: number | string }[])
    .map((c) => ({ key: c.key, wert: Number(c.wert) }))
    .sort((a, b) => a.key.localeCompare(b.key))

  return <AnspruchSaetzeClient klassen={klassen} config={config} />
}
