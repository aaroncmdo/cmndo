import Link from 'next/link'
import { MapPin, FileSearch, ShieldCheck, ChevronRight } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'

// Gebrandete Makler-Kunden-Landeseite (Hub). Zwei gleichwertige Wege: Gutachter-Finder
// (App-Domain, extern) + Anspruch-Check (Marketing, intern) — beide tragen die Makler-
// Attribution (promotion_code_id) in den Lead. Design spiegelt /check (Claimondo-Tokens,
// Landing-Frame). Hardcoded Deutsch (Referral-Kontext ist deutsch).
export function MaklerHubLanding({
  firma,
  finderHref,
  anspruchHref,
}: {
  firma: string
  finderHref: string
  anspruchHref: string
}) {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden py-14 text-center sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 20% 15%, rgba(123,163,204,0.22), transparent 50%)',
              'radial-gradient(circle at 85% 35%, rgba(69,115,162,0.14), transparent 45%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Empfohlen von {firma}
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Ihr Makler hat Sie an Claimondo vermittelt
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-claimondo-ondo sm:text-lg">
            Claimondo ist Deutschlands Plattform für die Kfz-Schadenregulierung. Unverschuldet?
            Dann ist die Regulierung für Sie{' '}
            <strong className="font-semibold text-claimondo-navy">komplett kostenlos</strong> — § 249 BGB.
          </p>
        </div>
      </section>

      {/* Zwei gleichwertige Wege */}
      <section className="pb-14">
        <div className="mx-auto grid max-w-3xl gap-4 px-4 sm:grid-cols-2 sm:px-6">
          {/* Weg 1: Gutachter-Finder (App-Domain -> externer Link) */}
          <a
            href={finderHref}
            className="group flex flex-col rounded-ios-lg border border-claimondo-border bg-white p-6 text-left shadow-sm transition-all hover:border-claimondo-ondo hover:shadow-md"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-claimondo-navy/10 text-claimondo-navy">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-bold text-claimondo-navy">Gutachter finden &amp; Termin</h2>
            <p className="mt-1 flex-1 text-sm text-claimondo-ondo">
              Unabhängigen Kfz-Sachverständigen in Ihrer Nähe finden und direkt einen Termin buchen.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-claimondo-navy">
              Jetzt starten
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </a>

          {/* Weg 2: Anspruch-Check (Marketing -> interner Link, ?m= traegt die Attribution) */}
          <Link
            href={anspruchHref}
            className="group flex flex-col rounded-ios-lg border border-claimondo-border bg-white p-6 text-left shadow-sm transition-all hover:border-claimondo-ondo hover:shadow-md"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-claimondo-navy/10 text-claimondo-navy">
              <FileSearch className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-bold text-claimondo-navy">Anspruch prüfen</h2>
            <p className="mt-1 flex-1 text-sm text-claimondo-ondo">
              In drei Fragen: Welche Ansprüche stehen Ihnen nach dem Unfall zu? Kostenlos &amp; unverbindlich.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-claimondo-navy">
              Anspruch prüfen
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Makler-Empfehlung (/m)" />
    </div>
  )
}
