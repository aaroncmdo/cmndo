// AAR-483 (M1): Warte-Seite für Makler mit status != 'aktiv'. Freundliche
// UX ohne Sidebar (User ist nicht freigeschaltet → keine Portal-Navigation).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'

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
    <main className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-[#e4e7ef] p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-[#f8f9fb] border border-[#e4e7ef] flex items-center justify-center mx-auto mb-4 text-[#4573A2]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="24"
            height="24"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#0D1B3E] mb-2">
          Ihr Zugang wird aktuell geprüft
        </h1>
        <p className="text-sm text-[#4573A2] leading-relaxed mb-4">
          Wir melden uns innerhalb von 24 Stunden bei Ihnen und schalten Ihren
          Zugang frei.
        </p>
        <p className="text-xs text-[#4573A2]">
          Bei Fragen:{' '}
          <a
            href="mailto:hallo@claimondo.de"
            className="underline text-[#0D1B3E]"
          >
            hallo@claimondo.de
          </a>
        </p>
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
