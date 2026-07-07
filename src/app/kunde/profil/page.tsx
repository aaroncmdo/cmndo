// Sub-Projekt 4 (Kunde-Portal 1+): Settings konsolidiert — Profil + Benachrichtigungen
// + Datenschutz auf EINER erreichbaren Flaeche (/kunde/profil, Nav "Profil").
// /kunde/einstellungen leitet hierher (Legacy-Bookmarks). Vorher: 2 getrennte
// Flaechen, einstellungen nicht in der Nav erreichbar.

import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { BellIcon, ShieldIcon } from 'lucide-react'
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'
import { TotpEnrollCard } from '@/components/auth/TotpEnrollCard'
import KundeProfilForm from './KundeProfilForm'
import PageHeader from '@/components/shared/PageHeader'
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
import { NotificationPreferencesForm } from '@/components/notifications/NotificationPreferencesForm'
import DsgvoLoeschCard from '@/components/shared/DsgvoLoeschCard'

// User-spezifische Notification-Prefs -> dynamisch (aus /kunde/einstellungen uebernommen).
export const dynamic = 'force-dynamic'

export default async function ProfilPage() {
  const t = await getTranslations('kunde.settings')
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    // AAR-344: twofa_telefon, AAR-703: zweit_email mitladen
    .select('vorname, nachname, email, telefon, twofa_telefon, zweit_email')
    .eq('id', user.id)
    .single()

  const name = profile ? [profile.vorname, profile.nachname].filter(Boolean).join(' ') : user.email ?? ''

  // Benachrichtigungs-Praeferenzen (Sub-Projekt 4: aus /kunde/einstellungen konsolidiert)
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
      <PageHeader title={t('profil.title')} size="lg" />
      <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-5 space-y-3">
        <div><span className="text-sm text-claimondo-ondo">{t('profil.nameLabel')}</span><p className="text-claimondo-navy font-medium">{name || '—'}</p></div>
        <div><span className="text-sm text-claimondo-ondo">{t('profil.emailLabel')}</span><p className="text-claimondo-navy">{profile?.email ?? user.email ?? '—'}</p></div>
      </div>

      {/* AAR-703: Telefon + zweit_email editierbar */}
      <KundeProfilForm
        initialTelefon={profile?.telefon ?? null}
        initialZweitEmail={profile?.zweit_email ?? null}
      />

      {/* AAR-344: 2FA-Nummer-Änderungs-Flow */}
      <TwoFaPhoneChange
        aktuelleTwofaTelefon={profile?.twofa_telefon ?? null}
        fallbackTelefon={profile?.telefon ?? null}
      />

      {/* AAR-939: TOTP (Authenticator-App) — optionaler 2. Faktor */}
      <TotpEnrollCard />

      {/* Sub-Projekt 4: Benachrichtigungen (vorher /kunde/einstellungen, konsolidiert) */}
      <section className="bg-white rounded-ios-xl border border-claimondo-border overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-claimondo-border">
          <span className="shrink-0 w-9 h-9 rounded-ios-xl bg-claimondo-bg text-claimondo-ondo border border-claimondo-border flex items-center justify-center">
            <BellIcon width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-claimondo-navy">{t('einstellungen.benachrichtigungenTitle')}</h2>
            <p className="text-xs text-claimondo-ondo mt-0.5">{t('einstellungen.benachrichtigungenDesc')}</p>
          </div>
        </div>
        <div className="p-5">
          <NotificationPreferencesForm role="kunde" initial={initial} />
        </div>
      </section>

      {/* Sub-Projekt 4: Datenschutz / Account-Loeschung (vorher /kunde/einstellungen) */}
      <section className="bg-white rounded-ios-xl border border-claimondo-border overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-claimondo-border">
          <span className="shrink-0 w-9 h-9 rounded-ios-xl bg-claimondo-bg text-claimondo-ondo border border-claimondo-border flex items-center justify-center">
            <ShieldIcon width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-claimondo-navy">{t('einstellungen.datenschutzTitle')}</h2>
            <p className="text-xs text-claimondo-ondo mt-0.5">{t('einstellungen.datenschutzDesc')}</p>
          </div>
        </div>
        <div className="p-5">
          <DsgvoLoeschCard bestehenderAuftrag={bestehenderAuftrag} />
        </div>
      </section>
    </div>
  )
}
