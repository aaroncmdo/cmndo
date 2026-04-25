// AAR-500 N5: Kunden-Einstellungen — aktuell nur Benachrichtigungs-Präferenzen.
// Weitere Sections (Sprache, Datenschutz, Account-Löschung) folgen in späteren
// Tickets. Der Profil-Block (Name/Email/2FA) bleibt in /kunde/profil.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BellIcon, ArrowLeftIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
import { NotificationPreferencesForm } from '@/components/notifications/NotificationPreferencesForm'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function KundeEinstellungenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const prefsRes = await getMyNotificationPreferences()
  const initial = prefsRes.prefs ?? {
    quiet_hours_start: null,
    quiet_hours_end: null,
    timezone: 'Europe/Berlin',
    channel_opt_outs: [],
    event_opt_outs: {},
  }

  return (
    <div className="w-full px-4 py-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/kunde/profil"
          className="inline-flex items-center gap-1 text-xs text-[#4573A2] hover:text-[#0D1B3E]"
        >
          <ArrowLeftIcon width={12} height={12} /> Profil
        </Link>
      </div>
      <PageHeader title="Einstellungen" size="lg" />

      <section className="bg-white rounded-2xl border border-[#e4e7ef] overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[#e4e7ef]">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-[#f8f9fb] text-[#4573A2] border border-[#e4e7ef] flex items-center justify-center">
            <BellIcon width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[#0D1B3E]">Benachrichtigungen</h2>
            <p className="text-xs text-[#4573A2] mt-0.5">
              Ruhezeiten, Kanäle und welche Ereignisse Sie wo erhalten möchten.
            </p>
          </div>
        </div>
        <div className="p-5">
          <NotificationPreferencesForm role="kunde" initial={initial} />
        </div>
      </section>
    </div>
  )
}
