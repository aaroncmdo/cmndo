// Admin-Listing der Gutachter-Waitlist (eingehende Bewerbungen über
// gutachter.claimondo.de). Triage-Liste für Aaron + Dispatch-Team.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import WaitlistTable from './WaitlistTable'

export const dynamic = 'force-dynamic'

export default async function WaitlistPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const admin = createAdminClient()
  const { data: eintraege, error } = await admin
    .from('gutachter_waitlist')
    .select(
      'id, vorname, nachname, email, telefon, plz, ort, dat_expert_nummer, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer, unternehmen, jahre_erfahrung, aktuelle_auftraege_pro_monat, schwerpunkte, status, notizen_admin, erstellt_am, zuletzt_geaendert_am',
    )
    .order('erstellt_am', { ascending: false })

  if (error) console.error('[admin/partner/waitlist] Query:', error.message)

  const list = eintraege ?? []

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-claimondo-navy">Gutachter-Warteliste</h1>
        <p className="mt-1 text-sm text-claimondo-ondo">
          Eingehende Bewerbungen über gutachter.claimondo.de —{' '}
          <span className="font-semibold text-claimondo-navy">{list.length}</span> Einträge.
        </p>
      </header>

      <WaitlistTable eintraege={list} />
    </div>
  )
}
