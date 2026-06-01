import type { FaqStem } from '@/data/faq-stems-mapping'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * FaqStems (Stream F / Doc 29 Hebel 2 + Doc 13 §8) — rendert die gemappten
 * wörtlichen Test-Prompts als sichtbaren FAQ-Block. Princeton-GEO: die exakte
 * Nutzerfrage + 2-Satz-Antwort (BGH-Anker + gutachter-finden-Hand-off) auf der
 * Seite → die AI matched die Frage 1:1 und zitiert die Antwort.
 *
 * Das FAQPage-Schema für diese Stems wird NICHT hier emittiert, sondern von
 * ContentJsonLd in die EINE FAQPage der Seite gemergt (eine FAQPage pro Seite,
 * Google-Empfehlung). Rendert `null`, wenn der Slug keine gemappten Stems hat.
 */
export function FaqStems({ stems }: { stems: FaqStem[] }) {
  if (!stems.length) return null
  return (
    <section className="mt-12">
      <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
        Häufig gestellte Fragen
      </h2>
      <dl className="mt-4 flex flex-col gap-5">
        {stems.map((s) => (
          <div key={s.question} className="border-l-2 border-claimondo-ondo/30 pl-4">
            <dt className="font-bold text-claimondo-navy">{s.question}</dt>
            <dd className="mt-1.5 text-[0.95rem] leading-relaxed text-claimondo-shield">{s.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
