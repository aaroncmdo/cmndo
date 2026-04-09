import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VertraegeEditorClient from './VertraegeEditorClient'

export default async function VertraegeEditorPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const { data: vorlagen } = await supabase
    .from('vertragsvorlagen')
    .select('id, typ, version, titel, inhalt_html, pflicht_unterschrift, aktiv, gueltig_ab, created_at, updated_at')
    .order('typ', { ascending: true })
    .order('aktiv', { ascending: false })
    .order('created_at', { ascending: false })

  return <VertraegeEditorClient vorlagen={vorlagen ?? []} />
}
