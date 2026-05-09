'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, AlertTriangle, Search, Link2 } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { FAQ_GRUPPEN } from './faqs'

// 2026-05-09 Frontend-Audit + GEO-Vorbereitung:
// - Glass-Pass auf Header + Gruppen-Cards (matcht Hero/Vorteile/Wie-Pages)
// - Answer-Capsule-Pattern: Antworten sind DEFAULT sichtbar (kein Accordion mehr).
//   Crawler + ChatGPT/Perplexity finden Direktantworten ohne JS-Interaktion.
// - Client-seitige Suche zum Navigieren der ~30 Q&A-Paare
// - Anchor-Links pro Frage (#frage-slug) fuer Deep-Linking aus AI-Antworten

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export default function FaqClient() {
  const [suche, setSuche] = useState('')

  const gefilterte = useMemo(() => {
    const q = suche.trim().toLowerCase()
    if (!q) return FAQ_GRUPPEN
    return FAQ_GRUPPEN
      .map((g) => ({
        ...g,
        fragen: g.fragen.filter(
          (f) => f.frage.toLowerCase().includes(q) || f.antwort.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.fragen.length > 0)
  }, [suche])

  const treffer = gefilterte.reduce((acc, g) => acc + g.fragen.length, 0)

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      <LandingTopbar authenticatedUser={null} />

      {/* Header — Glass-Pass mit Spotlights */}
      <section className="relative isolate overflow-hidden py-16 text-center sm:py-20">
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
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-[#4573A2] shadow-[0_2px_12px_rgba(13,27,62,0.06)] backdrop-blur-md sm:text-sm">
            Häufige Fragen
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-[#0D1B3E] sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Was Sie wissen müssen
          </h1>
          <p className="mt-5 text-balance text-base text-[#4573A2] sm:text-lg">
            Basierend auf 27 Fachanwalt-Quellen, BGH-Rechtsprechung und über 2.400 Fällen.
          </p>

          {/* Such-Pill */}
          <div className="mx-auto mt-8 max-w-md">
            <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-4 py-2.5 shadow-[0_4px_16px_rgba(13,27,62,0.06)] backdrop-blur-md focus-within:ring-2 focus-within:ring-[#4573A2]/30">
              <Search className="h-4 w-4 shrink-0 text-[#7BA3CC]" />
              <input
                type="search"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Wertminderung, UPE, HUK, …"
                className="w-full bg-transparent text-sm text-[#0D1B3E] placeholder:text-[#7BA3CC] focus:outline-none"
              />
              {suche && (
                <button
                  onClick={() => setSuche('')}
                  className="text-xs text-[#4573A2] hover:text-[#0D1B3E]"
                >
                  ×
                </button>
              )}
            </div>
            {suche && (
              <p className="mt-2 text-xs text-[#7BA3CC]">
                {treffer === 0 ? 'Keine Treffer — versuchen Sie ein anderes Stichwort' : `${treffer} Treffer`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Warn-Banner — bleibt amber, aber mit Glass-Edge */}
      <div className="border-y border-amber-200/70 bg-amber-50/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-start gap-3 px-4 py-4 sm:px-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <strong>Wichtig:</strong> Ohne professionelle Hilfe verlieren Unfallbeteiligte im
            Schnitt <strong>33 % ihres Anspruchs</strong>. Die Versicherung kürzt systematisch
            — in der Hoffnung, dass Sie nicht widersprechen.
          </p>
        </div>
      </div>

      {/* FAQ-Gruppen — Antworten direkt sichtbar (Answer-Capsule-Pattern) */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
          {gefilterte.length === 0 && (
            <div
              className="rounded-3xl border border-white/60 bg-white/70 p-8 text-center text-sm text-[#4573A2] backdrop-blur-md"
              style={{ WebkitBackdropFilter: 'blur(14px)' }}
            >
              Keine Antworten zu „{suche}". Versuchen Sie ein anderes Stichwort oder rufen Sie
              uns direkt an.
            </div>
          )}

          {gefilterte.map((g) => (
            <div
              key={g.gruppe}
              className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md sm:p-7"
              style={{ WebkitBackdropFilter: 'blur(14px)' }}
            >
              <h2
                className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[#4573A2]"
              >
                {g.gruppe}
              </h2>
              <div className="mt-4 space-y-6 divide-y divide-[#e4e7ef]/60">
                {g.fragen.map((f, i) => {
                  const id = slugify(f.frage)
                  return (
                    <article
                      key={f.frage}
                      id={id}
                      className={i === 0 ? '' : 'pt-6'}
                      itemScope
                      itemType="https://schema.org/Question"
                    >
                      <div className="flex items-start gap-3">
                        <h3
                          className="flex-1 text-base font-bold leading-snug text-[#0D1B3E] sm:text-lg"
                          style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                          itemProp="name"
                        >
                          {f.frage}
                        </h3>
                        <a
                          href={`#${id}`}
                          aria-label="Direkt-Link zu dieser Frage"
                          className="mt-1 shrink-0 rounded-full p-1 text-[#7BA3CC] opacity-0 transition-opacity hover:bg-[#4573A2]/10 hover:text-[#4573A2] focus:opacity-100 group-hover:opacity-100"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <div
                        className="mt-3 text-sm leading-relaxed text-[#1E3A5F]"
                        itemScope
                        itemType="https://schema.org/Answer"
                        itemProp="acceptedAnswer"
                      >
                        <span itemProp="text">{f.antwort}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-[#0D1B3E] py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 25% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 75% 80%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-2xl px-4">
          <h2
            className="text-3xl font-bold text-white sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Noch offen geblieben?
          </h2>
          <p className="mt-3 text-white/65">
            Wir beraten Sie kostenlos und unverbindlich — ohne Callcenter, direkt mit einem Fachmann.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-[#4573A2] px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-[#7BA3CC] active:scale-[0.98]"
            >
              Schaden melden — 0 € Kosten
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              0221 25906530 anrufen
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="FAQ" />
    </div>
  )
}
