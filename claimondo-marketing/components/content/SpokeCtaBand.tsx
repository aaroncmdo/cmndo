import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { WhatsAppIcon } from './WhatsAppIcon'
import { WHATSAPP_HREF } from '@/lib/seo/jsonld'
import { NaechsteTermineKompakt } from './NaechsteTermineKompakt'

const WA_HREF = WHATSAPP_HREF
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * Navy-CTA-Band am Artikel-Ende (Spoke + Cornerstone). „Schaden melden"
 * primär + WhatsApp. Gleiche Glow-Sprache wie /vorteile. Chrome aus dem
 * `content`-Namespace (Sprachumschalter); ohne `headline`-Prop greift die
 * Default-Headline aus den Messages.
 */
export function SpokeCtaBand({ headline }: { headline?: string }) {
  const t = useTranslations('content')
  const headlineText = headline ?? t('cta_band.headline_default')
  return (
    <>
    {/* Konkrete freie Termine VOR dem CTA-Band — ausfuehrliche Begruendung in
        NaechsteTermineKompakt.tsx. Kurz: der nginx-Log vom 25.08.2026 zeigt, dass
        ChatGPT die Ratgeber-/Wissens-Seiten von SELBST holt und die Stadtseiten nur
        auf ausdrueckliche Aufforderung — und genau die gelesenen Seiten trugen NULL
        buchbare Termine. Diese Komponente steht auf 18 Seiten und ist damit der
        breiteste Hebel, den es dafuer gibt.

        ⚠ VOR das Band, nicht hinein: das Band ist navy mit weisser Schrift, der
        Termin-Block hell. Ineinander gesetzt beissen sie sich optisch, und der
        Termin — die konkreteste Aussage der Seite — saehe aus wie ein Fehler. */}
    <NaechsteTermineKompakt />
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
        <h2 style={HEAD_FONT} className="text-balance text-[1.6875rem] font-extrabold leading-tight">{headlineText}</h2>
        <p className="mx-auto mt-2 max-w-xl text-white/75">
          {t('cta_band.subline')}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href="/schaden-melden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
            {t('cta_band.report_online')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </a>
          {/* Dunkle Schrift auf dem WhatsApp-Gruen: weiss darauf sind 1,98:1
              (Soll 4,5:1 bei 16px), Navy sind 8,29:1. Die Flaechenfarbe traegt
              die Wiedererkennung und bleibt. */}
          <a href={WA_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-claimondo-navy transition hover:opacity-90" style={{ backgroundColor: '#25D366' }}>
            <WhatsAppIcon className="h-5 w-5" />
            WhatsApp
          </a>
        </div>
      </div>
    </section>
    </>
  )
}
