// src/components/landing/sections/PlattformMechanikSection.tsx
//
// Doc 44 §6 / Doc 45 Task 5: Plattform-Mechanik-Section (Cluster 6).
// 3 Steps (Disponiert / In der Tasche / Kürzungs-Alarm) + Speed-Vergleich.
// Position auf Hauptseite: Section 7 (nach Berater-Section).

import Link from 'next/link'
import { Zap, Clock } from 'lucide-react'
import {
  PLATTFORM_MECHANIK_STEPS,
  SERVICE_PITCH_CTAS,
} from '@/lib/brand/service-pitch'

export function PlattformMechanikSection() {
  return (
    <section
      className="bg-white py-16 sm:py-24"
      aria-labelledby="plattform-mechanik-heading"
    >
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            Warum wir schneller sind
          </p>
          <h2
            id="plattform-mechanik-heading"
            className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl"
          >
            Das Uber-Prinzip für Schadensgutachten — so funktioniert es.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Hinter unseren 32 Tagen steckt eine Plattform-Mechanik, die Gutachter, Anwalt
            und Versicherung in einem Workflow zusammenführt.
          </p>
        </div>

        <ol
          className="mt-12 grid gap-5 md:grid-cols-3"
          role="list"
          aria-label="Drei Schritte der Plattform-Mechanik"
        >
          {PLATTFORM_MECHANIK_STEPS.map((s) => (
            <li
              key={s.nr}
              className="relative rounded-ios-md border border-claimondo-border bg-claimondo-bg p-6 shadow-claimondo-sm"
            >
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Schritt {s.nr}
              </span>
              <h3 className="mt-2 text-xl font-extrabold text-claimondo-navy">{s.titel}</h3>
              <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 mx-auto max-w-xl rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
          <div className="flex items-center gap-3 text-sm text-claimondo-shield/70">
            <Clock className="h-5 w-5 flex-shrink-0" aria-hidden />
            <span>Branchen-Durchschnitt: <strong className="text-claimondo-shield">4–6 Monate</strong></span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm text-emerald-700">
            <Zap className="h-5 w-5 flex-shrink-0" aria-hidden />
            <span>Claimondo: <strong>32 Tage Ø</strong></span>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/wie-es-funktioniert"
            data-tracking="plattform-mechanik-cta"
            className="inline-flex items-center gap-2 rounded-full border-2 border-claimondo-navy bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy transition-all hover:bg-claimondo-navy hover:text-white"
          >
            {SERVICE_PITCH_CTAS.plattformMechanik}
          </Link>
        </div>
      </div>
    </section>
  )
}
