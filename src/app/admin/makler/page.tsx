// Makler-Vermittlung: Admin-Anlage + Liste. Spiegelt admin/werkstaetten/page.tsx.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import MaklerAdminClient from './MaklerAdminClient'
import { getGesellschaftOptions } from '@/lib/makler/gesellschaft'

export const dynamic = 'force-dynamic'

export default async function MaklerAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (p?.rolle !== 'admin') redirect('/login')

  const admin = createAdminClient()
  const { data: maklers } = await admin
    .from('makler')
    .select(
      'id, firma, email, telefon, status, provision_betrag_komplett_netto, ' +
        'provision_betrag_nur_gutachter_netto, aktiviert_am, ansprechpartner_vorname, ansprechpartner_nachname',
    )
    .order('aktiviert_am', { ascending: false })

  const { versicherungen, maklerpools } = await getGesellschaftOptions()

  return (
    <MaklerAdminClient
      maklers={(maklers ?? []) as never}
      versicherungen={versicherungen}
      maklerpools={maklerpools}
    />
  )
}
