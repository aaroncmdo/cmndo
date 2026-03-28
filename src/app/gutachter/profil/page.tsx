import { createClient } from '@/lib/supabase/server'
import ProfilClient from './ProfilClient'

export default async function ProfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: sv }, faelleResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('vorname, nachname, telefon, rolle')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('sachverstaendige')
      .select('id, paket, gebiet_plz, ist_aktiv, max_faelle_monat, offene_faelle')
      .eq('profile_id', user!.id)
      .single(),
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', user!.id),
  ])

  return (
    <ProfilClient
      email={user!.email ?? ''}
      profile={profile ?? { vorname: null, nachname: null, telefon: null, rolle: 'sachverstaendiger' }}
      sv={sv ?? { id: '', paket: '', gebiet_plz: null, ist_aktiv: true, max_faelle_monat: 10, offene_faelle: 0 }}
      faelleCount={faelleResult.count ?? 0}
    />
  )
}
