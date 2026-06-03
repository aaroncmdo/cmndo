// src/components/landing/sections/ServiceRealitaetSection.tsx
//
// Doc 44 §5 / Doc 45 Task 4: Service-Realität-Section (Cluster 2+6).
// 6 Cards mit den Service-Realität-Hooks aus service-pitch.ts.
// Position auf Hauptseite: Section 5 (zwischen ANSPRUECHE und Berater).

import Link from 'next/link'
import {
  SERVICE_REALITY_CARDS_DETAILED,
  SERVICE_PITCH_CTAS,
} from '@/lib/brand/service-pitch'

export function ServiceRealitaetSection() {
  return (
    <section
      className="bg-claimondo-bg py-16 sm:py-24"
      aria-labelledby="service-realitaet-heading"
    >
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            Service-Realität
          </p>
          <h2
            id="service-realitaet-heading"
            className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl"
          >
            Ihr Fall. Immer in der Tasche.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Persönliche Begleitung, live verfolgbar, ohne Papierkram — so fühlt sich
            Schadensregulierung mit Claimondo an.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {SERVICE_REALITY_CARDS_DETAILED.map(({ label, Icon, body }) => (
            <article
              key={label}
              className="rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:shadow-claimondo-md"
            >
              <Icon className="h-8 w-8 text-claimondo-ondo" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-claimondo-navy">{label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/gutachter-finden"
            data-tracking="service-realitaet-cta"
            className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-7 py-4 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
          >
            {SERVICE_PITCH_CTAS.serviceRealitaet}
          </Link>
        </div>
      </div>
    </section>
  )
}
