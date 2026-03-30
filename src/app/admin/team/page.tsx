import { createClient } from '@/lib/supabase/server'
import TeamClient from './TeamClient'

export default async function TeamPage() {
  const supabase = await createClient()

  const { data: mitarbeiter } = await supabase
    .from('profiles')
    .select('id, email, vorname, nachname, rolle, force_password_change, created_at')
    .in('rolle', ['admin', 'sachverstaendiger', 'kundenbetreuer', 'leadbearbeiter', 'kanzlei'])
    .order('created_at', { ascending: false })

  return <TeamClient mitarbeiter={mitarbeiter ?? []} />
}
