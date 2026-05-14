// 2026-05-07 Design-Review Item 5a: Hero-Empty-State fuer das Kunde-Dashboard.
// Vorher: 70 % Whitespace, „Noch kein Schadensfall" als 4-Zeilen-Card =
// Sackgasse. Jetzt: Hero mit Foto-Background + Schaden-melden-CTA + 5-Step-
// Process-Visualizer.
//
// Wirkung: der Endkunde versteht beim Reinkommen sofort
// (1) wir sind echte Menschen, (2) was tue ich, (3) wie laeuft der Prozess.

import Link from 'next/link'
import {
  ClipboardListIcon,
  CalendarCheckIcon,
  SearchIcon,
  FileTextIcon,
  WalletIcon,
  ArrowRightIcon,
} from 'lucide-react'

const PROCESS_STEPS = [
  { icon: ClipboardListIcon, label: 'Schaden gemeldet' },
  { icon: CalendarCheckIcon, label: 'SV terminiert' },
  { icon: SearchIcon, label: 'Begutachtung' },
  { icon: FileTextIcon, label: 'Gutachten' },
  { icon: WalletIcon, label: 'Reguliert' },
] as const

export default function KundeWillkommensHero({ vorname }: { vorname: string }) {
  return (
    <div className="space-y-6">
      {/* Hero-Card */}
      <div
        className="relative rounded-2xl overflow-hidden border border-claimondo-border shadow-md"
        style={{ minHeight: 340 }}
      >
        {/* Foto-Background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/kunde/hero-support.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Vignette + Lesbarkeits-Layer fuer Text rechts */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
        <div className="absolute inset-0 sm:bg-gradient-to-r sm:from-claimondo-navy/85 sm:via-claimondo-navy/40 sm:to-transparent" />

        {/* Content */}
        <div className="relative p-6 sm:p-10 max-w-md text-white space-y-4">
          <p className="text-xs uppercase tracking-wider opacity-80">Willkommen</p>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
            Hallo {vorname} — wie können wir helfen?
          </h1>
          <p className="text-sm opacity-90 leading-relaxed">
            Wir kümmern uns um Ihren Unfallschaden — von der Begutachtung bis zur
            Auszahlung. Sie müssen nichts verwalten, wir halten Sie auf jedem
            Schritt informiert.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/schaden-melden/schritt-1"
              className="inline-flex items-center gap-2 bg-white text-claimondo-navy hover:bg-claimondo-bg rounded-ios-xl px-5 py-3 text-sm font-semibold shadow-md transition-colors"
            >
              Schaden melden
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-[11px] opacity-70 pt-1">
            Bereits gemeldet? Sie erhalten von uns einen Link per E-Mail oder SMS.
          </p>
        </div>
      </div>

      {/* Process-Strip */}
      <div className="rounded-2xl border border-claimondo-border bg-white p-4 sm:p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-claimondo-ondo mb-3 sm:mb-4">
          So läuft's bei uns
        </p>
        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {PROCESS_STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <li key={step.label} className="flex flex-col items-center text-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-claimondo-ondo/10 flex items-center justify-center text-claimondo-navy">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] text-claimondo-ondo uppercase tracking-wider">
                  Schritt {i + 1}
                </span>
                <span className="text-xs font-medium text-claimondo-navy">
                  {step.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
