// Warte-/Sackgassen-Seite fuer flottenmanager ohne nutzbaren Portal-Zugang.
// Wird vom (shell)-Layout angesteuert, wenn KEIN firmen_flotten_konten-Datensatz
// existiert ODER dessen status != 'aktiv'.
//
// Warum: vorher gingen beide Faelle auf /login?error=… — der User war aber
// EINGELOGGT. Er sah ein Anmeldeformular + eine interne Fehlermeldung, ohne
// Support-Kontakt und ohne Abmelden-Ausgang; und weil roleToPath('flottenmanager')
// = /flotte ist, warf ihn jeder erneute Login-Versuch sofort wieder raus
// (Nutzer-Schleife ohne Ausgang). Relevant vor allem fuer den LEGITIMEN Fall
// status != 'aktiv' (deaktivierter Flottenkunde), nicht nur fuer Fehl-Provisionierung.
// Muster 1:1 wie werkstatt/pending (Guard + PageHeader + Support + Logout).
//
// Liegt BEWUSST ausserhalb der (shell)-Gruppe: das Shell-Layout ist genau die
// Instanz, die hierher redirectet — innerhalb waere es eine Endlosschleife.

import { redirect } from 'next/navigation'
import { ClockIcon, LockIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { roleToPath } from '@/lib/auth/role-redirect'
import { getFlottenmanagerKontoWithFirma } from '@/lib/flotte/konto-firma'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'

export const dynamic = 'force-dynamic'

export default async function FlotteKeinZugangPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  // Bei falscher Rolle ins eigene Portal statt eine fremde Warte-Seite zu zeigen
  // (Sec-Audit-Muster aus werkstatt/pending, 07.07.).
  if (profile?.rolle !== 'flottenmanager') redirect(roleToPath(profile?.rolle as string | null | undefined))

  // Zustand selbst aufloesen statt per Query-Param: nicht spoofbar, eine Quelle.
  // Ist der Zugang inzwischen aktiv, gehoert der User ins Portal — kein Loop,
  // weil das Layout nur bei der exakt inversen Bedingung hierher redirectet.
  const konto = await getFlottenmanagerKontoWithFirma(createAdminClient(), user.id)
  if (konto && konto.status === 'aktiv') redirect('/flotte/flotte')

  const deaktiviert = konto !== null
  const Icon = deaktiviert ? LockIcon : ClockIcon
  const title = deaktiviert
    ? 'Ihr Flotten-Zugang ist derzeit nicht aktiv'
    : 'Flotten-Zugang noch nicht eingerichtet'
  const description = deaktiviert
    ? `Der Zugang zum Flottenportal von ${konto.firmaName} ist momentan deaktiviert. Bitte wenden Sie sich an Ihren Ansprechpartner bei Claimondo — wir schalten ihn gerne wieder frei.`
    : 'Ihr Konto ist noch keiner Firmenflotte zugeordnet. Bitte wenden Sie sich an Ihren Ansprechpartner bei Claimondo — wir richten den Zugang für Sie ein.'

  return (
    <main className="min-h-screen bg-claimondo-bg flex items-center justify-center px-6 py-12">
      <SectionCard size="lg" className="max-w-md w-full shadow-sm">
        <PageHeader
          title={title}
          description={description}
          align="center"
          leadingSlot={
            <div className="w-14 h-14 rounded-full bg-claimondo-bg border border-claimondo-border flex items-center justify-center text-claimondo-ondo">
              <Icon className="w-6 h-6" />
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
      </SectionCard>
    </main>
  )
}
