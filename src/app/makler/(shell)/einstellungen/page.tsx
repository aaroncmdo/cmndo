// AAR-492 (M10): Einstellungen für Makler — Profil, Bank, Passwort,
// Consents, Benachrichtigungen, Logout, Account-Löschung.

import { redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerFullProfile,
  getMaklerAktiveConsents,
} from '@/lib/makler/queries'
import { MaklerSettings } from '@/components/makler/MaklerSettings'

export const dynamic = 'force-dynamic'

export default async function EinstellungenPage() {
  const makler = await getCurrentMakler()
  if (!makler) redirect('/login')

  const [profile, consents] = await Promise.all([
    getMaklerFullProfile(makler.id),
    getMaklerAktiveConsents(makler.id),
  ])

  if (!profile) redirect('/makler')

  return <MaklerSettings profile={profile} consents={consents} />
}
