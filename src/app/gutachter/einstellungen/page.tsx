import Link from 'next/link'
import { CalendarIcon, UserIcon, ChevronRightIcon, SettingsIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import PageHeader from '@/components/shared/PageHeader'
import KartenAnzeigeToggle from './KartenAnzeigeToggle'

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
  }>(supabase, user.id, 'id, gcal_connected')
  if (!sv) redirect('/gutachter/willkommen')

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
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : item.statusTone === 'amber'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border'
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-start gap-4 bg-white border border-claimondo-border rounded-2xl p-4 hover:border-claimondo-ondo transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-claimondo-ondo/10 flex items-center justify-center flex-shrink-0">
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

      {/* 2026-05-08 Aaron-Brief: Toggle „Mein Gebiet auf Karte zeigen"
          steuert den Heute-Hub-Polygon-Layer (LocalStorage-Persist). */}
      <div className="space-y-2 pt-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-claimondo-ondo">
          Karten-Anzeige
        </p>
        <KartenAnzeigeToggle />
      </div>

      <p className="text-[11px] text-claimondo-ondo/70 text-center">
        Weitere Bereiche (Benachrichtigungen, 2FA, Datenexport) folgen.
      </p>
    </div>
  )
}
