// AAR-369: Mitarbeiter-Profilseite (KB, Dispatcher, Admin)
// Avatar-Upload + Anzeigename + Profilbeschreibung.
// Dispatch/Admin nutzen dieselbe Seite, da sie im mitarbeiter-Layout liegen.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BellIcon } from 'lucide-react'
import MitarbeiterProfilClient from './MitarbeiterProfilClient'
import { KontoSicherheitPanel } from '@/components/auth/KontoSicherheitPanel'
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
import { NotificationPreferencesForm } from '@/components/notifications/NotificationPreferencesForm'

export default async function MitarbeiterProfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname, telefon, anzeigename, avatar_url, profilbeschreibung')
    .eq('id', user.id)
    .single()

  if (!profile || !['kundenbetreuer', 'dispatch', 'admin'].includes(profile.rolle)) {
    redirect('/login')
  }

  // Benachrichtigungs-Präferenzen nur für KB: kundenbetreuer empfängt ~25 Events
  // (fast alle in_app). dispatch/kanzlei bekommen keine Matrix-Notifications (Realtime),
  // admin ist Ops-Oversight -> für die ist eine Präferenz-UI (noch) nicht sinnvoll.
  const kbPrefs =
    profile.rolle === 'kundenbetreuer' ? ((await getMyNotificationPreferences()).prefs ?? null) : null

  return (
    <>
      <MitarbeiterProfilClient
        email={user.email ?? ''}
        vorname={profile.vorname ?? ''}
        nachname={profile.nachname ?? ''}
        telefon={profile.telefon ?? null}
        rolle={profile.rolle}
        avatarUrl={profile.avatar_url ?? null}
        anzeigename={profile.anzeigename ?? ''}
        profilbeschreibung={profile.profilbeschreibung ?? ''}
      />
      {kbPrefs ? (
        <div className="mt-5 max-w-3xl">
          <section className="bg-white rounded-ios-xl border border-claimondo-border overflow-hidden">
            <div className="flex items-start gap-3 px-5 py-4 border-b border-claimondo-border">
              <span className="shrink-0 w-9 h-9 rounded-ios-xl bg-claimondo-bg text-claimondo-ondo border border-claimondo-border flex items-center justify-center">
                <BellIcon width={16} height={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-claimondo-navy">Benachrichtigungen</h2>
                <p className="text-xs text-claimondo-ondo mt-0.5">
                  Kanäle, Ruhezeiten und welche Ereignisse Sie erreichen sollen.
                </p>
              </div>
            </div>
            <div className="p-5">
              <NotificationPreferencesForm role="kundenbetreuer" initial={kbPrefs} />
            </div>
          </section>
        </div>
      ) : null}
      <div className="mt-5 max-w-3xl pb-6">
        <KontoSicherheitPanel />
      </div>
    </>
  )
}
