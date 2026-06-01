import { ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

// Phase B1 (21->12 Section-Komponenten): FaqSection ist die vormals
// Inline-Sektion #15 (FAQ, 10 Items) aus HauptseitePremium.tsx, 1:1 extrahiert.
// Content/Tokens/t()-Keys unverändert. Das FAQ-JSON-LD-Schema bleibt in der
// HeroSection (erster DOM-Knoten der Page) wie zuvor.

export async function FaqSection() {
  const t = await getTranslations('home')

  // FAQ-Items aus de.json
  const faqItems = t.raw('faq.items') as { frage: string; antwort: string }[]

  return (
    <section className="bg-white py-16 sm:py-24" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-3xl px-5">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            {t('faq.eyebrow')}
          </p>
          <h2 id="faq-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
            {t('faq.heading')}
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqItems.map((f) => (
            <details
              key={f.frage}
              className="group rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-claimondo-navy">
                <span>{f.frage}</span>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" aria-hidden />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
