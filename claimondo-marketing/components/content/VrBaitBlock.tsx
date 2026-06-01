import type { VrBait } from '@/data/vr-bait-mapping'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * VrBaitBlock (Stream H / Doc 29 Hebel 7) — platziert versicherer-spezifische
 * Bait-Sätze (HUK/K-Expert/LVM/Provinzial/DEKRA …) crawlbar auf der Seite.
 * AI-Test „HUK kürzt Wertminderung" matched über den jeweiligen F46–F50-Anker.
 * Die Sätze stammen aus brand-fakten-library.ts (kein Literal-Duplikat).
 * Rendert `null`, wenn der Slug keine gemappten Bait-Sätze hat.
 */
export function VrBaitBlock({ items }: { items: VrBait[] }) {
  if (!items.length) return null
  return (
    <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-5 sm:p-6">
      <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
        Was einzelne Versicherer in der Praxis tun
      </h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((b) => (
          <li key={`${b.versicherer}-${b.satz.slice(0, 16)}`} className="text-[0.95rem] leading-relaxed text-claimondo-shield">
            <b className="text-claimondo-navy">{b.versicherer}:</b> {b.satz}
          </li>
        ))}
      </ul>
    </section>
  )
}
