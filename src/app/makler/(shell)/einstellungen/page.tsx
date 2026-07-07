// AAR-492 (M10): Einstellungen für Makler — Profil, Bank, Passwort,
// Consents, Benachrichtigungen, Logout, Account-Löschung.
// AAR-500 N5: Zusätzliche Benachrichtigungs-Präferenzen (Quiet-Hours + Channel-
// Opt-Outs + Event-Feintuning) neben den bestehenden Email-Flags aus M10.

import { redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerFullProfile,
  getMaklerAktiveConsents,
} from '@/lib/makler/queries'
import { MaklerSettings } from '@/components/makler/MaklerSettings'
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
import DsgvoLoeschSection from '@/components/shared/DsgvoLoeschSection'

export const dynamic = 'force-dynamic'

export default async function EinstellungenPage() {
  const makler = await getCurrentMakler()
  if (!makler) redirect('/login')

  const [profile, consents, prefsRes] = await Promise.all([
    getMaklerFullProfile(makler.id),
    getMaklerAktiveConsents(makler.id),
    getMyNotificationPreferences(),
  ])

  if (!profile) redirect('/makler')

  const notificationPrefs = prefsRes.prefs ?? {
    quiet_hours_start: null,
    quiet_hours_end: null,
    timezone: 'Europe/Berlin',
    channel_opt_outs: [],
    event_opt_outs: {},
  }

  return (
    <>
      <MaklerSettings
        profile={profile}
        consents={consents}
        notificationPrefs={notificationPrefs}
      />
      <div className="mx-auto max-w-2xl px-4 pb-8">
        <DsgvoLoeschSection />
      </div>
    </>
  )
}
