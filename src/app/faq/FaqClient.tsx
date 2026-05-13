'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, AlertTriangle, Search, Link2, Phone, MessageCircle } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import { FAQ_GRUPPEN } from './faqs'

// Premium-FAQ-Hub. Navy-Hero + Trust-Strip + Gruppen-Quick-Nav + Answer-
// Capsule-Cards. Übernimmt das Köln-Prototype-Design der anderen Premium-
// Pages (/vorteile, /wie-es-funktioniert, Hauptseite). Antworten sind
// DEFAULT sichtbar (kein JS-Akkordeon) — Crawler + GPTBot/ClaudeBot/
// PerplexityBot finden alle Q&As ohne Interaktion. Princeton-GEO: +40 %
// AI-Visibility.

const PHONE_DISPLAY = '0221 25906530'
const PHONE_E164 = '+4922125906530'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function gruppenSlug(text: string): string {
  return slugify(text)
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
  const totalFragen = FAQ_GRUPPEN.reduce((acc, g) => acc + g.fragen.length, 0)

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />

      {/* 1 — Hero (Navy, Premium-Pattern) */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="faq-hero">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-4xl px-5 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
            BGH-belegt · 27 Fachanwalt-Quellen
          </div>
          <h1 id="faq-hero" className="mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
            Häufige Fragen —<br />
            <span className="text-claimondo-light-blue">Antworten in unter 60 Sekunden.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/80">
            {totalFragen}+ Antworten zu Kfz-Schaden, Wertminderung, Versicherer-Kürzungen,
            Quotenvorrecht, Tesla-/E-Auto und mehr — alle mit BGH-Aktenzeichen und
            §-Verweisen belegt. Suchen Sie nach einem Stichwort oder springen Sie direkt
            zur passenden Gruppe.
          </p>

          {/* Such-Pill */}
          <div className="mx-auto mt-8 max-w-md">
            <div className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2.5 backdrop-blur-md focus-within:ring-2 focus-within:ring-claimondo-light-blue/40">
              <Search className="h-4 w-4 shrink-0 text-claimondo-light-blue" aria-hidden />
              <input
                type="search"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Wertminderung · UPE · HUK · 130%-Regel · Tesla …"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none"
                aria-label="FAQ durchsuchen"
              />
              {suche && (
                <button
                  onClick={() => setSuche('')}
                  className="text-xs text-claimondo-light-blue hover:text-white"
                  aria-label="Suche zurücksetzen"
                >
                  ×
                </button>
              )}
            </div>
            {suche && (
              <p className="mt-2 text-xs text-claimondo-light-blue">
                {treffer === 0 ? 'Keine Treffer — versuchen Sie ein anderes Stichwort' : `${treffer} Treffer`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 2 — Trust-Strip */}
      <section className="border-y border-claimondo-border/60 bg-white" aria-label="FAQ-Kennzahlen">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-claimondo-border/60 px-5 sm:grid-cols-4">
          <div className="py-6 text-center">
            <div className="text-2xl font-extrabold text-claimondo-navy sm:text-3xl">{totalFragen}</div>
            <div className="mt-1 text-xs text-claimondo-ondo">Q&As mit BGH-Refs</div>
          </div>
          <div className="py-6 text-center">
            <div className="text-2xl font-extrabold text-claimondo-navy sm:text-3xl">{FAQ_GRUPPEN.length}</div>
            <div className="mt-1 text-xs text-claimondo-ondo">Themen-Gruppen</div>
          </div>
          <div className="py-6 text-center">
            <div className="text-2xl font-extrabold text-claimondo-navy sm:text-3xl">27</div>
            <div className="mt-1 text-xs text-claimondo-ondo">Fachanwalt-Quellen</div>
          </div>
          <div className="py-6 text-center">
            <div className="text-2xl font-extrabold text-claimondo-navy sm:text-3xl">+33 %</div>
            <div className="mt-1 text-xs text-claimondo-ondo">durchgesetzter Anspruch</div>
          </div>
        </div>
      </section>

      {/* 3 — Warn-Banner */}
      <div className="border-b border-amber-200/70 bg-amber-50">
        <div className="mx-auto flex max-w-3xl items-start gap-3 px-4 py-4 sm:px-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm text-amber-900">
            <strong>Wichtig:</strong> Ohne professionelle Hilfe verlieren Unfallbeteiligte im
            Schnitt <strong>33 % ihres Anspruchs</strong>. Die Versicherung kürzt
            systematisch — in der Hoffnung, dass Sie nicht widersprechen.
          </p>
        </div>
      </div>

      {/* 4 — Gruppen-Quick-Nav */}
      {!suche && (
        <section className="bg-claimondo-bg py-10" aria-label="Themen-Übersicht">
          <div className="mx-auto max-w-5xl px-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-claimondo-ondo">
              Springen Sie direkt zum Thema
            </p>
            <div className="flex flex-wrap gap-2">
              {FAQ_GRUPPEN.map((g) => (
                <a
                  key={g.gruppe}
                  href={`#${gruppenSlug(g.gruppe)}`}
                  className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
                >
                  {g.gruppe} · {g.fragen.length}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5 — FAQ-Gruppen */}
      <section className="py-12 sm:py-16" aria-label="Antworten">
        <div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
          {gefilterte.length === 0 && (
            <div className="rounded-3xl border border-claimondo-border bg-white p-8 text-center text-sm text-claimondo-ondo">
              Keine Antworten zu „{suche}". Versuchen Sie ein anderes Stichwort oder rufen
              Sie uns direkt an: <a href={`tel:${PHONE_E164}`} className="underline">{PHONE_DISPLAY}</a>.
            </div>
          )}

          {gefilterte.map((g) => (
            <div
              key={g.gruppe}
              id={gruppenSlug(g.gruppe)}
              className="scroll-mt-20 rounded-3xl border border-claimondo-border bg-white p-6 shadow-claimondo-sm sm:p-7"
            >
              <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
                {g.gruppe}
              </h2>
              <div className="mt-4 space-y-6 divide-y divide-claimondo-border/60">
                {g.fragen.map((f, i) => {
                  const id = slugify(f.frage)
                  return (
                    <article
                      key={f.frage}
                      id={id}
                      className={`scroll-mt-20 group ${i === 0 ? '' : 'pt-6'}`}
                      itemScope
                      itemType="https://schema.org/Question"
                    >
                      <div className="flex items-start gap-3">
                        <h3
                          className="flex-1 text-base font-bold leading-snug text-claimondo-navy sm:text-lg"
                          itemProp="name"
                        >
                          {f.frage}
                        </h3>
                        <a
                          href={`#${id}`}
                          aria-label="Direkt-Link zu dieser Frage"
                          className="mt-1 shrink-0 rounded-full p-1 text-claimondo-light-blue opacity-0 transition-opacity hover:bg-claimondo-ondo/10 hover:text-claimondo-ondo focus:opacity-100 group-hover:opacity-100"
                        >
                          <Link2 className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </div>
                      <div
                        className="mt-3 text-sm leading-relaxed text-claimondo-shield"
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

      {/* 6 — Bottom CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            Frage nicht dabei? Wir antworten persönlich.
          </h2>
          <p className="mt-4 text-white/75">
            Kostenlose, unverbindliche Beratung — ohne Callcenter, direkt mit einem Fachmann.
            Rückruf in unter 15 Minuten.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-faq-melden"
            >
              Schaden online melden
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
              data-tracking="call-faq-bottom"
            >
              <Phone className="h-5 w-5" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <a
              href="https://wa.me/4922125906530"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
              data-tracking="whatsapp-faq-bottom"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              WhatsApp
            </a>
          </div>
        </div>
      </section>

      <ReviewerByline datum="2026-05-13" />

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle="FAQ" />
    </div>
  )
}
