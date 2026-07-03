// AAR-369: Mitarbeiter-Profilseite (KB, Dispatcher, Admin)
// Avatar-Upload + Anzeigename + Profilbeschreibung.
// Dispatch/Admin nutzen dieselbe Seite, da sie im mitarbeiter-Layout liegen.
// SP2b: + Kalender-Connect-Section (Google + CalDAV) via geteiltem KalenderConnectPanel.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MitarbeiterProfilClient from './MitarbeiterProfilClient'
import { KontoSicherheitPanel } from '@/components/auth/KontoSicherheitPanel'
import KalenderConnectPanel, { type CalDavState } from '@/components/shared/KalenderConnectPanel'

export default async function MitarbeiterProfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname, telefon, anzeigename, avatar_url, profilbeschreibung, google_connected_at, google_email')
    .eq('id', user.id)
    .single()

  if (!profile || !['kundenbetreuer', 'dispatch', 'admin'].includes(profile.rolle)) {
    redirect('/login')
  }

  // SP2b: Kalender-Connect-Status — Google aus profiles (kanonisch, rollen-agnostisch),
  // CalDAV aus kalender_verbindungen (SP2a-SSoT) per profile_id (= user.id).
  const { data: caldavRow } = await supabase
    .from('kalender_verbindungen')
    .select('id, provider_label, username, calendar_display_name, connected_at, last_sync_at, last_error, last_error_at')
    .eq('profile_id', user.id)
    .eq('provider', 'caldav')
    .maybeSingle()

  const caldavState: CalDavState | null = caldavRow
    ? {
        id: caldavRow.id as string,
        providerLabel: (caldavRow.provider_label as string | null) ?? 'CalDAV',
        username: caldavRow.username as string,
        calendarDisplayName: caldavRow.calendar_display_name as string | null,
        connectedAt: caldavRow.connected_at as string,
        lastSyncAt: caldavRow.last_sync_at as string | null,
        lastError: caldavRow.last_error as string | null,
        lastErrorAt: caldavRow.last_error_at as string | null,
      }
    : null

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
      <div className="mt-5 max-w-3xl px-4">
        <h2 className="text-base font-semibold text-claimondo-navy mb-3">Kalender</h2>
        <KalenderConnectPanel
          googleConnected={!!profile.google_connected_at}
          googleEmail={(profile.google_email as string | null) ?? null}
          caldav={caldavState}
          returnPath="/mitarbeiter/profil"
        />
      </div>
      <div className="mt-5 max-w-3xl pb-6">
        <KontoSicherheitPanel />
      </div>
    </>
  )
}
