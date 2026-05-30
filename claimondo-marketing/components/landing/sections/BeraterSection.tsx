// src/components/landing/sections/BeraterSection.tsx
//
// Doc 44 §2.2 / Doc 45 Task 1: 1:1 extrahiert aus HauptseitePremium.tsx
// (vormals Inline-Section 8). Eigene Component, weil die Section-Reihenfolge
// umgestellt wird (Doc 45 Task 6) und eine Inline-Verschiebung in der
// ~600-Zeilen-Datei fehleranfaellig waere. Inhalt unveraendert.

import Image from 'next/image'
import Link from 'next/link'
import { Phone, ChevronRight, Quote } from 'lucide-react'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

export function BeraterSection() {
  return (
    <section className="bg-claimondo-navy py-16 text-white sm:py-20" aria-labelledby="berater-heading">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-ios-lg border border-white/10 shadow-claimondo-lg">
          <Image
            src="/marketing-landing-koeln/berater.png"
            alt="Persönlicher Claimondo-Berater am Telefon"
            fill sizes="(max-width: 768px) 100vw, 40vw"
            className="object-cover"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            Persönliche Begleitung
          </p>
          <h2 id="berater-heading" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            Ein Berater. Eine Nummer. Die ganze Strecke.
          </h2>
          <Quote className="mt-6 h-8 w-8 text-claimondo-light-blue/60" aria-hidden />
          <blockquote className="mt-3 text-lg leading-relaxed text-white/85">
            „Wenn die Versicherung den ControlExpert ansetzt, ist das ein Schnell-Check
            ohne Fahrzeug. Wir gehen ran, reden mit der Werkstatt, prüfen die
            Reparaturkalkulation gegen die BGH-Linie — und holen jeden Euro zurück."
          </blockquote>
          <p className="mt-4 text-sm font-semibold text-claimondo-light-blue">
            — Claimondo-Schadenbegleitung
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="call-berater"
            >
              <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <Link
              href="/wie-es-funktioniert"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
            >
              So funktioniert der Ablauf
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
