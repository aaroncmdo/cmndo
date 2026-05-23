import { Phone } from 'lucide-react'
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'
import { WhatsAppIcon } from './WhatsAppIcon'

const WA_HREF = 'https://wa.me/4922125906530'
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * Decoder-spezifischer CTA (höhere Conversion-Absicht). Navy-Band mit
 * Anruf + WhatsApp primär. Sitzt NACH der extrahierbaren Antwort, damit das
 * SEO/GEO-Signal nicht vom CTA verdrängt wird.
 */
export function DecoderCtaBlock() {
  return (
    <section className="relative mt-6 overflow-hidden rounded-ios-md bg-claimondo-navy p-6 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.40), transparent 55%)' }}
      />
      <div className="relative">
        <h2 style={HEAD_FONT} className="text-xl font-extrabold">Genau diesen Brief bekommen?</h2>
        <p className="mt-1 max-w-prose text-sm text-white/80">
          Wir antworten kostenlos für Sie und setzen die Frist korrekt. Ohne Kostenrisiko bei unverschuldetem Unfall.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
            <Phone className="h-4 w-4" aria-hidden />
            {PHONE_DISPLAY}
          </a>
          <a href={WA_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white transition hover:opacity-90" style={{ backgroundColor: '#25D366' }}>
            <WhatsAppIcon className="h-4 w-4" />
            WhatsApp
          </a>
          <a href="/schaden-melden" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10">
            Online melden
          </a>
        </div>
      </div>
    </section>
  )
}
