// AAR-483 (M1): Defensiver Fallback für Makler ohne zugeordnete makler-Row.
// Das sollte durch den Signup-Flow nicht passieren — wenn doch, dem User
// einen klaren Hinweis + Support-Kontakt anzeigen statt 404/Crash.
//
// AAR-807: Auf PageHeader align='center' migriert; Hex-Tokens auf
// claimondo-Token.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MaklerOnboardingPage() {
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
          title="Ihr Makler-Profil ist noch nicht vollständig eingerichtet"
          description="Bitte kontaktieren Sie uns — wir richten Ihr Profil gemeinsam ein und schalten Ihren Zugang frei."
          align="center"
          actions={
            <a
              href="mailto:hallo@claimondo.de?subject=Makler-Onboarding%20fehlt"
              className="inline-flex items-center justify-center h-10 px-6 bg-claimondo-navy text-white rounded-lg text-sm font-medium hover:bg-claimondo-shield"
            >
              Support kontaktieren
            </a>
          }
        />
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
