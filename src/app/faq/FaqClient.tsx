'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { FAQ_GRUPPEN } from './faqs'

function FaqItem({ frage, antwort }: { frage: string; antwort: string }) {
  const [offen, setOffen] = useState(false)
  return (
    <div className="border-b border-[#e4e7ef] last:border-0">
      <button
        onClick={() => setOffen(!offen)}
        className="flex w-full items-start justify-between gap-4 py-5 text-left"
      >
        <span className="font-semibold text-[#0D1B3E]">{frage}</span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 flex-shrink-0 text-[#4573A2] transition-transform ${offen ? 'rotate-180' : ''}`}
        />
      </button>
      {offen && (
        <div className="pb-5 text-sm leading-relaxed text-[#1E3A5F]">{antwort}</div>
      )}
    </div>
  )
}

export default function FaqClient() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <LandingTopbar authenticatedUser={null} />

      <section className="bg-gradient-to-b from-white to-[#f8f9fb] py-16 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#4573A2]/20 bg-[#4573A2]/5 px-4 py-1.5 text-sm font-semibold text-[#4573A2]">
            Häufige Fragen
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#0D1B3E] sm:text-5xl">
            Was Sie wissen müssen
          </h1>
          <p className="mt-4 text-lg text-[#4573A2]">
            Basierend auf 27 Fachanwalt-Quellen, BGH-Rechtsprechung und über 2.400 Fällen.
          </p>
        </div>
      </section>

      <div className="border-y border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-3xl items-start gap-3 px-4 py-4 sm:px-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            <strong>Wichtig:</strong> Ohne professionelle Hilfe verlieren Unfallbeteiligte im Schnitt{' '}
            <strong>33% ihres Anspruchs</strong>. Die Versicherung kürzt systematisch — in der Hoffnung,
            dass Sie nicht widersprechen.
          </p>
        </div>
      </div>

      <section className="py-16">
        <div className="mx-auto max-w-3xl space-y-8 px-4 sm:px-6">
          {FAQ_GRUPPEN.map((g) => (
            <div key={g.gruppe} className="rounded-3xl border border-[#e4e7ef] bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-extrabold text-[#0D1B3E]">{g.gruppe}</h2>
              <div>
                {g.fragen.map((f) => (
                  <FaqItem key={f.frage} frage={f.frage} antwort={f.antwort} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#0D1B3E] py-20 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-3xl font-extrabold text-white">Noch offen geblieben?</h2>
          <p className="mt-3 text-white/60">Wir beraten Sie kostenlos und unverbindlich — ohne Callcenter, direkt mit einem Fachmann.</p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#4573A2] px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-[#7BA3CC]"
            >
              Schaden melden — 0 € Kosten
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:+4922112345678"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/80 hover:border-white/40 hover:text-white"
            >
              0221 123 456 78 anrufen
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
