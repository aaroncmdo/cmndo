// AAR-483 (M1): Warte-Seite für Makler mit status != 'aktiv'. Freundliche
// UX ohne Sidebar (User ist nicht freigeschaltet → keine Portal-Navigation).
//
// AAR-807: Auf PageHeader align='center' migriert. Icon-Circle als
// leadingSlot.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import { ClockIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MaklerPendingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  // AAR-718: Bei falscher Rolle in eigenes Portal statt auf Landing-Page.
  if (profile?.rolle !== 'makler') redirect(roleToPath(profile?.rolle as string | null | undefined))

  return (
    <main className="min-h-screen bg-claimondo-bg flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-claimondo-border p-8">
        <PageHeader
          title="Ihr Zugang wird aktuell geprüft"
          description="Wir melden uns innerhalb von 24 Stunden bei Ihnen und schalten Ihren Zugang frei."
          align="center"
          leadingSlot={
            <div className="w-14 h-14 rounded-full bg-claimondo-bg border border-claimondo-border flex items-center justify-center text-claimondo-ondo">
              <ClockIcon className="w-6 h-6" />
            </div>
          }
        />
        <p className="text-xs text-claimondo-ondo text-center mt-4">
          Bei Fragen:{' '}
          <a href="mailto:hallo@claimondo.de" className="underline text-claimondo-navy">
            hallo@claimondo.de
          </a>
        </p>
        <form action="/api/auth/logout" method="POST" className="mt-6 text-center">
          <button
            type="submit"
            className="text-xs text-claimondo-ondo hover:text-claimondo-navy underline"
          >
            Abmelden
          </button>
        </form>
      </div>
    </main>
  )
}
