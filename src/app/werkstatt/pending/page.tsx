// AAR-956 WP-B (Task 9): Warte-Seite fuer Werkstaetten ohne aktiven Status.
// Wird vom Shell-Layout angesteuert wenn status != 'aktiv'.
//
// Sec-Audit 07.07. (Kohaerenz-Pass): war eine statische, UNgegatete Seite —
// im Gegensatz zum Schwester-Fall makler/pending (login + rolle-Guard). Kein
// Daten-Leak (nur Text), aber inkonsistent + von jeder Rolle/anon erreichbar.
// Jetzt auf das makler/pending-Muster angeglichen: Guard + PageHeader + Logout.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import { ClockIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function WerkstattPendingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  // Bei falscher Rolle ins eigene Portal statt eine fremde Warte-Seite zu zeigen.
  if (profile?.rolle !== 'werkstatt') redirect(roleToPath(profile?.rolle as string | null | undefined))

  return (
    <main className="min-h-screen bg-claimondo-bg flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-claimondo-border p-8">
        <PageHeader
          title="Ihr Betrieb wird noch aktiviert"
          description="Ihr Werkstatt-Zugang ist derzeit noch nicht freigegeben. Sobald wir Ihre Registrierung geprüft haben, erhalten Sie eine Benachrichtigung per E-Mail."
          align="center"
          leadingSlot={
            <div className="w-14 h-14 rounded-full bg-claimondo-bg border border-claimondo-border flex items-center justify-center text-claimondo-ondo">
              <ClockIcon className="w-6 h-6" />
            </div>
          }
        />
        <p className="text-xs text-claimondo-ondo text-center mt-4">
          Bei Fragen:{' '}
          <a href="mailto:support@claimondo.de" className="underline text-claimondo-navy">
            support@claimondo.de
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
