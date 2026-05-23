import { ChevronRight } from 'lucide-react'
import { WhatsAppIcon } from './WhatsAppIcon'

const WA_HREF = 'https://wa.me/4922125906530'
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * Navy-CTA-Band am Artikel-Ende (Spoke + Cornerstone). „Schaden melden"
 * primär + WhatsApp. Gleiche Glow-Sprache wie /vorteile.
 */
export function SpokeCtaBand({ headline = 'Unverschuldeter Unfall? Hol dir, was dir zusteht.' }: { headline?: string }) {
  return (
    <section className="relative mt-14 overflow-hidden rounded-ios-lg bg-claimondo-navy p-8 text-center text-white sm:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(69,115,162,0.35), transparent 55%), radial-gradient(circle at 82% 78%, rgba(123,163,204,0.20), transparent 50%)',
        }}
      />
      <div className="relative">
        <h2 style={HEAD_FONT} className="text-balance text-[1.6875rem] font-extrabold leading-tight">{headline}</h2>
        <p className="mx-auto mt-2 max-w-xl text-white/75">
          Anonyme Erst-Einschätzung. Antwort in unter 15 Minuten. Bei unverschuldetem Unfall trägt der Gegner die Anwaltskosten.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href="/schaden-melden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
            Schaden online melden
            <ChevronRight className="h-4 w-4" aria-hidden />
          </a>
          <a href={WA_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-white transition hover:opacity-90" style={{ backgroundColor: '#25D366' }}>
            <WhatsAppIcon className="h-5 w-5" />
            WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}
