// AAR-483 (M1): Defensiver Fallback für Makler ohne zugeordnete makler-Row.
// Das sollte durch den Signup-Flow nicht passieren — wenn doch, dem User
// einen klaren Hinweis + Support-Kontakt anzeigen statt 404/Crash.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
  if (profile?.rolle !== 'makler') redirect('/')

  return (
    <main className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-[#e4e7ef] p-8 text-center">
        <h1 className="text-xl font-semibold text-[#0D1B3E] mb-2">
          Ihr Makler-Profil ist noch nicht vollständig eingerichtet
        </h1>
        <p className="text-sm text-[#4573A2] leading-relaxed mb-4">
          Bitte kontaktieren Sie uns — wir richten Ihr Profil gemeinsam ein
          und schalten Ihren Zugang frei.
        </p>
        <a
          href="mailto:hallo@claimondo.de?subject=Makler-Onboarding%20fehlt"
          className="inline-flex items-center justify-center h-10 px-6 bg-[#0D1B3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3A5F]"
        >
          Support kontaktieren
        </a>
        <form action="/api/auth/logout" method="POST" className="mt-6">
          <button
            type="submit"
            className="text-xs text-[#4573A2] hover:text-[#0D1B3E] underline"
          >
            Abmelden
          </button>
        </form>
      </div>
    </main>
  )
}
