'use client'

import Link from 'next/link'
import { CheckIcon, ClipboardListIcon, BadgeCheckIcon, MapPinIcon, EuroIcon, ClockIcon } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

// AAR-876 — SEO-Content-Block für /gutachter-partner (B2B Sie-Anrede, SV-Akquise)
// PARTNER_FAQ (JSON-LD-Schema-Quelle) liegt in ./partner-faq.ts (Plain-Modul) —
// darf NICHT aus dieser 'use client'-Datei exportiert werden (Server-Import → Client-Ref → Crash).

const SCHRITTE_ICONS = [ClipboardListIcon, BadgeCheckIcon, MapPinIcon, CheckIcon]

export function PartnerContent({ warteliste }: { warteliste: number }) {
  const t = useTranslations('gutachter_partner')
  const schritte = t.raw('content.schritte') as Array<{ titel: string; text: string }>
  const voraussetzungen = t.raw('content.voraussetzungen') as string[]
  const faqs = t.raw('content.faqs') as Array<{ frage: string; antwort: string }>

  return (
    <section className="bg-white border-t border-claimondo-navy/[0.06]">
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-14 text-claimondo-navy">

        {/* Sektion 1 — Prozess */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-3">
            {t('content.prozess_heading')}
          </h2>
          <p className="text-claimondo-shield leading-relaxed mb-8">
            {t('content.prozess_text')}
          </p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {schritte.map((s, i) => {
              const Icon = SCHRITTE_ICONS[i] ?? CheckIcon
              return (
                <li key={s.titel} className="bg-claimondo-bg rounded-2xl p-5 flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-ios-xl bg-claimondo-ondo/10 flex items-center justify-center text-claimondo-ondo">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-claimondo-ondo mb-1 tracking-[0.08em]">
                      {t('content.schritt_label', { nr: i + 1 })}
                    </div>
                    <h3 className="text-base font-bold mb-1 tracking-[-.018em]">{s.titel}</h3>
                    <p className="text-sm text-claimondo-shield leading-relaxed">{s.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Sektion 2 — Was Sie verdienen */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-3 flex items-center gap-3">
            <EuroIcon className="w-7 h-7 text-claimondo-ondo" />
            {t('content.verdienst_heading')}
          </h2>
          <p className="text-claimondo-shield leading-relaxed mb-4">
            {t('content.verdienst_text1')}
          </p>
          <p className="text-claimondo-shield leading-relaxed">
            {t('content.verdienst_text2')}
          </p>
        </div>

        {/* Sektion 3 — Onboarding & Voraussetzungen */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-3 flex items-center gap-3">
            <ClockIcon className="w-7 h-7 text-claimondo-ondo" />
            {t('content.onboarding_heading')}
          </h2>
          <p className="text-claimondo-shield leading-relaxed mb-4">
            {t('content.onboarding_text')}
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-claimondo-shield">
            {voraussetzungen.map((v) => (
              <li key={v} className="flex items-start gap-2">
                <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sektion 4 — Warteliste-Framing */}
        <div className="bg-claimondo-navy/[0.04] border border-claimondo-navy/[0.08] rounded-2xl px-6 py-5">
          <h2 className="text-lg font-bold tracking-[-.018em] mb-2">
            {t('content.warteliste_heading')}
          </h2>
          <p className="text-sm text-claimondo-shield leading-relaxed">
            {t('content.warteliste_text_pre')}{' '}
            <strong className="text-claimondo-navy">{t('content.warteliste_text_sv', { anzahl: warteliste })}</strong>{' '}
            {t('content.warteliste_text_post')}
          </p>
        </div>

        {/* Sektion 4b — Ratgeber-Crosslinks (B2B-SEO-Topic-Pages) */}
        <div>
          <h2 className="text-lg font-bold tracking-[-.018em] mb-3">
            {t('content.ratgeber_heading')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/gutachter-partner/neukundengewinnung"
              className="inline-flex items-center gap-2 rounded-full border border-claimondo-navy/10 bg-claimondo-bg px-4 py-1.5 text-sm font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
            >
              {t('content.ratgeber_neukundengewinnung')}
            </Link>
            <Link
              href="/gutachter-partner/marketing"
              className="inline-flex items-center gap-2 rounded-full border border-claimondo-navy/10 bg-claimondo-bg px-4 py-1.5 text-sm font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
            >
              {t('content.ratgeber_marketing')}
            </Link>
          </div>
        </div>

        {/* Sektion 5 — FAQ */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-6">
            {t('content.faq_heading')}
          </h2>
          <dl className="space-y-4">
            {faqs.map((f) => (
              <details
                key={f.frage}
                className="group bg-claimondo-bg rounded-2xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex justify-between items-start gap-4 cursor-pointer list-none">
                  <dt className="text-base font-semibold tracking-[-.01em] text-claimondo-navy">{f.frage}</dt>
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white border border-claimondo-navy/10 flex items-center justify-center text-claimondo-ondo text-sm font-bold group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <dd className="mt-3 text-sm text-claimondo-shield leading-relaxed">{f.antwort}</dd>
              </details>
            ))}
          </dl>
        </div>

        {/* Cross-Link zum Ratgeber-Spoke — Discoverability fuer /gutachter-partner/leads-generieren */}
        <div>
          <Link
            href="/gutachter-partner/leads-generieren"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-claimondo-ondo hover:text-claimondo-navy"
          >
            {t('content.ratgeber_leads_cta')}
          </Link>
        </div>

      </div>
    </section>
  )
}
