import Link from 'next/link'
import { CalendarIcon, UserIcon, ChevronRightIcon, SettingsIcon, Code2Icon, ClockIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import PageHeader from '@/components/shared/PageHeader'

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

export default async function EinstellungenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    gcal_connected: boolean | null
    arbeitszeiten: Record<string, unknown> | null
    urlaub_von: string | null
    urlaub_bis: string | null
  }>(supabase, user.id, 'id, gcal_connected, arbeitszeiten, urlaub_von, urlaub_bis')
  if (!sv) redirect('/gutachter/willkommen')

  // Verfuegbarkeit-Status: laufender Urlaub schlaegt "individuell" schlaegt "Standard".
  const heuteIso = new Date().toISOString().slice(0, 10)
  const imUrlaub = !!sv.urlaub_von && !!sv.urlaub_bis && sv.urlaub_bis >= heuteIso
  const verfuegbarkeitStatus = imUrlaub
    ? { label: `Urlaub bis ${sv.urlaub_bis!.slice(8, 10)}.${sv.urlaub_bis!.slice(5, 7)}.`, tone: 'amber' as const }
    : sv.arbeitszeiten
      ? { label: 'Individuell', tone: 'green' as const }
      : { label: 'Standard-Zeiten', tone: 'gray' as const }

  const { data: caldavRow } = await supabase
    .from('sv_kalender_verbindungen')
    .select('id, last_error')
    .eq('sv_id', sv.id)
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
      <PageHeader
        title="Einstellungen"
        description="Alle Konfigurations-Bereiche deines Gutachter-Kontos."
        size="lg"
        useBranding
        leadingSlot={
          <div className="w-10 h-10 rounded-full bg-[var(--brand-secondary)]/10 text-[var(--brand-primary)] flex items-center justify-center shrink-0">
            <SettingsIcon className="w-5 h-5" />
          </div>
        }
      />

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
      </div>

      <p className="text-[11px] text-claimondo-ondo/70 text-center">
        Weitere Bereiche (Benachrichtigungen, 2FA, Datenexport) folgen.
      </p>
    </div>
  )
}
