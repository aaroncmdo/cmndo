import Link from 'next/link'
import { Phone, MessageCircle, ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF } from '@/lib/seo/jsonld'

// Phase B1 (21->12 Section-Komponenten): BottomCtaSection ist die vormals
// Inline-Sektion #16 (Bottom-CTA, Navy mit Glow) aus HauptseitePremium.tsx,
// 1:1 extrahiert. Content/Tokens/t()-Keys unverändert.

export async function BottomCtaSection() {
  const t = await getTranslations('home')

  return (
    <section
      className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white"
      aria-labelledby="bottom-cta-heading"
    >
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
        <h2 id="bottom-cta-heading" className="text-3xl font-bold leading-tight sm:text-4xl">
          {t('bottom_cta.heading')}
        </h2>
        <p className="mt-4 text-white/75">
          {t('bottom_cta.sub')}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={`tel:${PHONE_E164}`}
            className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
            data-tracking="call-bottom"
          >
            <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
            {PHONE_DISPLAY}
          </a>
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
            data-tracking="whatsapp-bottom"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            {t('bottom_cta.cta_whatsapp')}
          </a>
          <Link
            href="/schaden-melden"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
          >
            {t('bottom_cta.cta_online')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
