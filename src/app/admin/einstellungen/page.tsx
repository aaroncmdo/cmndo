import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FileSignatureIcon, CalendarIcon, PhoneIcon, ArrowRightIcon, SettingsIcon } from 'lucide-react'
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
    iconBg: 'bg-[#4573A2]/10',
    iconColor: 'text-[#4573A2]',
  },
  {
    href: '/admin/einstellungen/google',
    icon: CalendarIcon,
    title: 'Google-Integration',
    description: 'OAuth-Verbindung mit Google Calendar + Meet für Kundenbetreuer.',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  {
    href: '/admin/einstellungen/aircall-relay-seats',
    icon: PhoneIcon,
    title: 'Aircall Relay-Seats',
    description: 'Aircall-Telefon-Seats für Kundenbetreuer verwalten.',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
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
      <PageHeader
        title="Einstellungen"
        description="System-Konfiguration und Integrationen."
        icon={SettingsIcon}
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group bg-white border border-claimondo-border rounded-2xl p-5 hover:border-[#4573A2] hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${s.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-sm font-semibold text-[#0D1B3E]">
                    {s.title}
                    <ArrowRightIcon className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-claimondo-ondo mt-1 leading-relaxed">{s.description}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
