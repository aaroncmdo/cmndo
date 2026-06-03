// AAR-500 N5: Kunden-Einstellungen — aktuell nur Benachrichtigungs-Präferenzen.
// Weitere Sections (Sprache, Datenschutz, Account-Löschung) folgen in späteren
// Tickets. Der Profil-Block (Name/Email/2FA) bleibt in /kunde/profil.

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { BellIcon, ArrowLeftIcon, ShieldIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
import { NotificationPreferencesForm } from '@/components/notifications/NotificationPreferencesForm'
import PageHeader from '@/components/shared/PageHeader'
import DsgvoLoeschCard from '@/components/kunde/DsgvoLoeschCard'

export const dynamic = 'force-dynamic'

export default async function KundeEinstellungenPage() {
  const t = await getTranslations('kunde.settings')
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

  // DSGVO-Antrag laden falls einer offen
  const { data: bestehenderAuftragRow } = await supabase
    .from('dsgvo_loeschauftraege')
    .select('id, status, eingereicht_am, bestaetigt_am, grund')
    .eq('user_id', user.id)
    .in('status', ['eingereicht', 'bestaetigt', 'ausgefuehrt'])
    .order('eingereicht_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  const bestehenderAuftrag = bestehenderAuftragRow
    ? {
        id: bestehenderAuftragRow.id as string,
        status: bestehenderAuftragRow.status as 'eingereicht' | 'bestaetigt' | 'ausgefuehrt',
        eingereicht_am: bestehenderAuftragRow.eingereicht_am as string,
        bestaetigt_am: bestehenderAuftragRow.bestaetigt_am as string | null,
        grund: bestehenderAuftragRow.grund as string | null,
      }
    : null

  return (
    <div className="w-full px-4 py-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/kunde/profil"
          className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy"
        >
          <ArrowLeftIcon width={12} height={12} /> {t('einstellungen.backToProfil')}
        </Link>
      </div>
      <PageHeader title={t('einstellungen.title')} size="lg" />

      <section className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-claimondo-border">
          <span className="shrink-0 w-9 h-9 rounded-ios-xl bg-claimondo-bg text-claimondo-ondo border border-claimondo-border flex items-center justify-center">
            <BellIcon width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-claimondo-navy">{t('einstellungen.benachrichtigungenTitle')}</h2>
            <p className="text-xs text-claimondo-ondo mt-0.5">
              {t('einstellungen.benachrichtigungenDesc')}
            </p>
          </div>
        </div>
        <div className="p-5">
          <NotificationPreferencesForm role="kunde" initial={initial} />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-claimondo-border">
          <span className="shrink-0 w-9 h-9 rounded-ios-xl bg-claimondo-bg text-claimondo-ondo border border-claimondo-border flex items-center justify-center">
            <ShieldIcon width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-claimondo-navy">{t('einstellungen.datenschutzTitle')}</h2>
            <p className="text-xs text-claimondo-ondo mt-0.5">
              {t('einstellungen.datenschutzDesc')}
            </p>
          </div>
        </div>
        <div className="p-5">
          <DsgvoLoeschCard bestehenderAuftrag={bestehenderAuftrag} />
        </div>
      </section>
    </div>
  )
}
