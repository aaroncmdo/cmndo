import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldCheckIcon, FileSignatureIcon, CalendarIcon, PhoneIcon, ArrowRightIcon, UsersIcon, Trash2Icon, SparklesIcon, CoinsIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

// Fix: /admin/einstellungen hatte keine page.tsx, nur Sub-Ordner → 404.
// Jetzt Landing-Page mit Kacheln zu den existierenden Unter-Bereichen.
export const dynamic = 'force-dynamic'

const SECTIONS = [
  {
    href: '/admin/einstellungen/vertraege',
    icon: FileSignatureIcon,
    title: 'Vertragstexte',
    description: 'SV-Vertrag, AGB und Nutzungsbedingungen verwalten.',
    iconBg: 'bg-claimondo-ondo/10',
    iconColor: 'text-claimondo-ondo',
  },
  {
    href: '/admin/einstellungen/anspruch-saetze',
    icon: CoinsIcon,
    title: 'Anspruchsprüfer-Sätze',
    description: 'Nutzungsausfall-Klassensätze (A–L) und Anspruch-Parameter (Schwellen, Höchstdauern) verwalten.',
    iconBg: 'bg-claimondo-ondo/10',
    iconColor: 'text-claimondo-ondo',
  },
  {
    href: '/admin/einstellungen/kasko-tarife',
    icon: ShieldCheckIcon,
    title: 'Kasko-Tarife (Werkstattbindung)',
    description: 'Wissensbasis der Kasko-Versicherer: Werkstattbindungs-Status, Marker und Tarife (nur lesen; Pflege per Seed-Generator).',
    iconBg: 'bg-claimondo-ondo/10',
    iconColor: 'text-claimondo-ondo',
  },
  {
    href: '/admin/einstellungen/google',
    icon: CalendarIcon,
    title: 'Google-Integration',
    description: 'OAuth-Verbindung mit Google Calendar + Meet für Kundenbetreuer.',
    iconBg: 'bg-success-soft',
    iconColor: 'text-success-strong',
  },
  {
    href: '/admin/einstellungen/aircall-relay-seats',
    icon: PhoneIcon,
    title: 'Aircall Relay-Seats',
    description: 'Aircall-Telefon-Seats für Kundenbetreuer verwalten.',
    iconBg: 'bg-warning-soft',
    iconColor: 'text-warning-strong',
  },
  {
    href: '/admin/personen-dubletten',
    icon: UsersIcon,
    title: 'Personen-Dubletten',
    description: 'Mögliche Dubletten im Personen-Register ansehen (nur Ansicht, kein Merge).',
    iconBg: 'bg-claimondo-ondo/10',
    iconColor: 'text-claimondo-ondo',
  },
  {
    href: '/admin/datenschutz/loeschauftraege',
    icon: Trash2Icon,
    title: 'DSGVO-Löschaufträge',
    description: 'Eingegangene Lösch-Anfragen (Art. 17 DSGVO) ansehen und bearbeiten.',
    iconBg: 'bg-danger-soft',
    iconColor: 'text-danger-strong',
  },
  {
    href: '/admin/statistiken/ki-usage',
    icon: SparklesIcon,
    title: 'KI-Nutzung & Kosten',
    description: 'Übersicht der KI-Aufrufe und -Kosten (Claude/OCR) der letzten Tage.',
    iconBg: 'bg-claimondo-ondo/10',
    iconColor: 'text-claimondo-ondo',
  },
]

export default async function EinstellungenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <PageHeader title="Einstellungen" description="System-Konfiguration und Integrationen." size="lg" />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group bg-white border border-claimondo-border rounded-ios-lg p-5 hover:border-claimondo-ondo hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-ios-xl ${s.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${s.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-body-sm font-semibold text-claimondo-navy">
                    {s.title}
                    <ArrowRightIcon className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-body-xs text-claimondo-ondo mt-1 leading-relaxed">{s.description}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
