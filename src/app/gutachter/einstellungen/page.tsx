import Link from 'next/link'
import { CalendarIcon, UserIcon, ChevronRightIcon, Code2Icon, ClockIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import { berlinIsoDate } from '@/lib/time/berlin-day'
import KartenAnzeigeToggle from './KartenAnzeigeToggle'
import DsgvoLoeschSection from '@/components/shared/DsgvoLoeschSection'
// AAR-500 N5 / AAR-344 / KFZ-158: Settings-Panels von /profil hierher verschoben
import { getMyNotificationPreferences } from '@/lib/actions/notification-preferences'
import { EinstellungenSettings } from './_components/EinstellungenSettings'

// AAR-720: Einstellungen-Hub. Sammel-Page für alle konfigurierbaren
// Bereiche des SV-Portals — startet mit Kalender + Profil, wird nach
// und nach erweitert (Benachrichtigungen, 2FA, Whitelabel-Branding etc.).

export const dynamic = 'force-dynamic'

type Item = {
  href: string
  label: string
  description: string
  status: string
  statusTone: 'green' | 'amber' | 'gray'
  icon: typeof CalendarIcon
}

export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ netzwerk_abo?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { netzwerk_abo } = await searchParams

  const sv = await getGutachterForUser<{
    id: string
    gcal_connected: boolean | null
    arbeitszeiten: Record<string, unknown> | null
    urlaub_von: string | null
    urlaub_bis: string | null
    live_tracking_enabled: boolean | null
  }>(supabase, user.id, 'id, gcal_connected, arbeitszeiten, urlaub_von, urlaub_bis, live_tracking_enabled')
  if (!sv) redirect('/gutachter/willkommen')

  // AAR-500 N5: Benachrichtigungs-Praeferenzen + AAR-344: 2FA-Telefon laden
  // (von /gutachter/profil hierher verschoben)
  const [prefsRes, { data: profileRow }] = await Promise.all([
    getMyNotificationPreferences(),
    supabase
      .from('profiles')
      .select('twofa_telefon, telefon')
      .eq('id', user.id)
      .single(),
  ])

  const notificationPrefs = prefsRes.prefs ?? {
    quiet_hours_start: null,
    quiet_hours_end: null,
    timezone: 'Europe/Berlin',
    channel_opt_outs: [],
    event_opt_outs: {},
  }

  // Verfuegbarkeit-Status: laufender Urlaub schlaegt "individuell" schlaegt "Standard".
  const heuteIso = berlinIsoDate()
  const imUrlaub = !!sv.urlaub_von && !!sv.urlaub_bis && sv.urlaub_bis >= heuteIso
  const verfuegbarkeitStatus = imUrlaub
    ? { label: `Urlaub bis ${sv.urlaub_bis!.slice(8, 10)}.${sv.urlaub_bis!.slice(5, 7)}.`, tone: 'amber' as const }
    : sv.arbeitszeiten
      ? { label: 'Individuell', tone: 'green' as const }
      : { label: 'Standard-Zeiten', tone: 'gray' as const }

  // kalender_verbindungen ist RLS-locked (server-only) — User-Kontext liefe leer. Admin-Client
  // + expliziter profile_id-Self-Filter (einzige Zugriffsgrenze, MUSS bleiben).
  const { data: caldavRow } = await createAdminClient()
    .from('kalender_verbindungen')
    .select('id, last_error')
    .eq('profile_id', user.id)
    .eq('provider', 'caldav')
    .maybeSingle()

  const kalenderStatus = caldavRow?.last_error
    ? { label: 'Verbindungs-Fehler', tone: 'amber' as const }
    : caldavRow
    ? { label: 'CalDAV verbunden', tone: 'green' as const }
    : sv.gcal_connected
    ? { label: 'Google verbunden', tone: 'green' as const }
    : { label: 'Nicht verbunden', tone: 'gray' as const }

  const items: Item[] = [
    {
      href: '/gutachter/einstellungen/kalender',
      label: 'Kalender',
      description:
        'Google, Apple iCloud oder anderer CalDAV-Server — Claimondo prüft deine Verfügbarkeit vor Terminvorschlägen.',
      status: kalenderStatus.label,
      statusTone: kalenderStatus.tone,
      icon: CalendarIcon,
    },
    {
      href: '/gutachter/einstellungen/verfuegbarkeit',
      label: 'Verfügbarkeit',
      description:
        'Arbeitszeiten je Wochentag, geschlossene Tage und Urlaub — die Basis für Claimondos Terminvorschläge.',
      status: verfuegbarkeitStatus.label,
      statusTone: verfuegbarkeitStatus.tone,
      icon: ClockIcon,
    },
    {
      href: '/gutachter/einstellungen/embed',
      label: 'Embed-Widget & Anfragen',
      description:
        'Binde das Monika-Widget auf deiner Website ein und sieh eingehende Anfragen direkt hier.',
      status: 'Öffnen',
      statusTone: 'gray',
      icon: Code2Icon,
    },
    {
      href: '/gutachter/profil',
      label: 'Profil & Stammdaten',
      description:
        'Kontaktdaten, Firmeninfos, Qualifikationen und Spezialisierungen. Branding/Logo weiter im Profil.',
      status: 'Öffnen',
      statusTone: 'gray',
      icon: UserIcon,
    },
  ]

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon
          const toneClass =
            item.statusTone === 'green'
              ? 'bg-success-soft text-success-strong border-success/30'
              : item.statusTone === 'amber'
                ? 'bg-warning-soft text-warning-strong border-warning/30'
                : 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border'
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-start gap-4 bg-white border border-claimondo-border rounded-2xl p-4 hover:border-claimondo-ondo transition-colors group"
            >
              <div className="w-10 h-10 rounded-ios-xl bg-claimondo-ondo/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-claimondo-ondo" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-claimondo-navy">{item.label}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${toneClass}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-xs text-claimondo-ondo mt-1">{item.description}</p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-claimondo-ondo/70 group-hover:text-claimondo-ondo flex-shrink-0 mt-2" />
            </Link>
          )
        })}
        {/* Direkt-Toggle (kein Sub-Page-Link): steuert das Gebiets-Polygon im
            Heute-Hub via LocalStorage. War gebaut aber nie im Hub gerendert. */}
        <KartenAnzeigeToggle />
      </div>

      {/* AAR-500 N5 / AAR-344 / KFZ-158: Benachrichtigungen, 2FA + Live-Standort
          (von /gutachter/profil hierher verschoben) */}
      <EinstellungenSettings
        svId={sv.id}
        notificationPrefs={notificationPrefs}
        twofaTelefon={profileRow?.twofa_telefon ?? null}
        telefonFallback={profileRow?.telefon ?? null}
        gpsInitial={sv.live_tracking_enabled !== false}
      />

      {/* P5 T9: Netzwerkpartner-Abo (Upgrade-CTA bzw. Status + Customer-Portal). */}
      <NetzwerkAboBlock svId={sv.id} checkoutSuccess={netzwerk_abo === 'success'} />

      <div className="pt-2">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo/70">
          Konto &amp; Datenschutz
        </p>
        <DsgvoLoeschSection />
      </div>
    </div>
  )
}

// P5 T9: Server-Block laedt Abo-Row (authenticated SELECT, P0-RLS) + Config-Preise.
// Fail-safe: wirft die Preis-Config (fehlende Werte), wird die Sektion NICHT gerendert
// (kein 0-Preis-Checkout, Einstellungen-Seite bleibt intakt).
async function NetzwerkAboBlock({ svId, checkoutSuccess }: { svId: string; checkoutSuccess: boolean }) {
  try {
    const supabase = await createClient()
    const { data: abo } = await supabase
      .from('sv_netzwerk_abonnements')
      .select('status, gueltig_bis')
      .eq('sv_id', svId)
      .maybeSingle()

    const { ladeNetzwerkPreise } = await import('@/lib/billing/netzwerk-preise')
    const preise = await ladeNetzwerkPreise()
    const fmt = (cent: number) =>
      (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

    const { NetzwerkAboSection } = await import('./netzwerk-abo/NetzwerkAboSection')
    return (
      <NetzwerkAboSection
        aboStatus={(abo?.status as string | null) ?? null}
        gueltigBis={(abo?.gueltig_bis as string | null) ?? null}
        monatEuro={fmt(preise.monatCent)}
        setupEuro={preise.setupCent > 0 ? fmt(preise.setupCent) : ''}
        stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY ?? ''}
        checkoutSuccess={checkoutSuccess}
      />
    )
  } catch (err) {
    console.error('[einstellungen] NetzwerkAboBlock:', err)
    return null
  }
}
