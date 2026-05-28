import type { City } from '@/lib/cluster'
import { CLUSTER } from '@/lib/cluster'

// Final-CTA-Sektion (Mock-Zeilen 1038-1045). Server-Component, keine
// Interaktivitaet. Telefon aus CLUSTER (statt Mock-Festnetz), Stadtname
// dynamisch via {city.name}. Klick-Tracking laeuft delegiert ueber
// SiteScripts (data-cta), kein onClick. Mock-Mapping: rounded-sm → rounded-cta.
export function FinalCta({ city }: { city: City }) {
  return (
    <section className="py-[clamp(52px,7vw,84px)] bg-petrol text-white relative">
      <div className="max-w-wrap mx-auto px-6 text-center">
        <h2 className="font-display font-bold text-section-h2 text-white mb-4">Unfall gehabt? Wir regeln das für Sie.</h2>
        <p className="text-white/[.84] text-[17px] leading-relaxed max-w-[600px] mx-auto mb-7">
          Ein Anruf genügt — den Rest übernehmen wir. Soforthilfe rund um die Uhr in ganz{' '}
          <span className="loc-text">{city.name}</span>.
        </p>
        <a
          className="inline-flex items-center gap-2 bg-amber text-white font-display font-bold text-[17px] px-8 py-[18px] rounded-cta shadow-[0_6px_18px_color-mix(in_srgb,var(--amber)_32%,transparent)] hover:bg-amber-700 hover:-translate-y-px transition"
          href={`tel:${CLUSTER.phone.tel}`}
          data-cta="final_cta_call"
        >
          ☎ Schaden jetzt melden — {CLUSTER.phone.display}
        </a>
      </div>
    </section>
  )
}
