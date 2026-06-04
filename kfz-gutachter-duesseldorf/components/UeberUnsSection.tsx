import type { City } from '@/lib/cluster'
import { CLUSTER } from '@/lib/cluster'

// SERVER-Component. Founder / Ueber-uns-Block.
// MOBILE (sm:hidden, #ueberUnsMobile, v3): heller bg-paper-Abschnitt mit
// uu-quote-card (Quote + Signatur-Zeile avatar-tobias + svName + Siegel-v3) +
// Trust-Pill-Row (DAT/BVSK/10+J[accent]/90+Netz). svName = CLUSTER.svName (Persona
// "Tobias", Aaron 04.06.). DESKTOP/TABLET (hidden sm:grid): Original (dunkel,
// Team-Foto + Text + Siegel + Quote). Farben/Radien nur ueber Tokens.
export function UeberUnsSection({ city }: { city: City }) {
  return (
    <section
      id="ueber-uns"
      className="py-9 sm:py-[clamp(52px,7vw,84px)] bg-paper sm:bg-petrol sm:text-white"
    >
      <div className="max-w-wrap mx-auto px-6">
        {/* ============ MOBILE-ONLY · Mini-Ueber-uns v3 ============ */}
        <div className="sm:hidden max-w-[440px] mx-auto" id="ueberUnsMobile">
          <div className="uu-quote-card">
            <p className="uu-quote-body">
              „<strong>Ingenieurbasiert</strong>, unabhängig und immer in Ihrem Interesse — vor Ort in{' '}
              <span className="loc-text">{city.name}</span>.“
            </p>
            <div className="uu-quote-rule" aria-hidden="true" />
            <div className="uu-quote-sign">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="uu-quote-avatar"
                src={`${CLUSTER.imgPath}avatar-tobias-${CLUSTER.key}.png`}
                alt="Sachverständiger vor Ort"
                loading="lazy"
                width={44}
                height={44}
              />
              <div className="uu-quote-sign-text">
                <p className="uu-quote-name">
                  {CLUSTER.svName} <span className="uu-quote-role">· DAT-Sachverständiger</span>
                </p>
                <p className="uu-quote-brand">Zertifizierter Claimondo-Partner</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="uu-quote-siegel"
                src="/assets/brand/siegel-claimondo-partner.svg"
                alt="Claimondo-Partner-Siegel"
                loading="lazy"
                width={42}
                height={42}
              />
            </div>
          </div>
          <div className="uu-pillrow" role="list" aria-label="Qualifikationen">
            <div className="uu-pill" role="listitem">
              <span className="uu-pill-key">DAT</span>
              <span className="uu-pill-sub">zertifiziert</span>
            </div>
            <span className="uu-pill-sep" aria-hidden="true" />
            <div className="uu-pill" role="listitem">
              <span className="uu-pill-key">BVSK</span>
              <span className="uu-pill-sub">geprüft</span>
            </div>
            <span className="uu-pill-sep" aria-hidden="true" />
            <div className="uu-pill uu-pill--accent" role="listitem">
              <span className="uu-pill-key">10+ J</span>
              <span className="uu-pill-sub">Erfahrung</span>
            </div>
            <span className="uu-pill-sep" aria-hidden="true" />
            <div className="uu-pill" role="listitem">
              <span className="uu-pill-key">90+ Netz</span>
              <span className="uu-pill-sub">Claimondo NRW</span>
            </div>
          </div>
          <p className="uu-pillrow-foot">Codes als Beleg · Netzwerk &amp; lokales Büro getrennt</p>
        </div>

        {/* ============ DESKTOP / TABLET — Original ============ */}
        <div className="hidden sm:grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-10 items-center">
          <div className="relative rounded-2xl overflow-hidden aspect-[3/2]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              id="teamPhoto"
              src={`${CLUSTER.imgPath}team-${CLUSTER.key}.webp`}
              alt={`Kfz-Sachverständigen-Team in ${city.name} — DAT-zertifiziert, Claimondo-Partner`}
              loading="lazy"
              data-placeholder="true"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
              <span className="eyebrow-dot" /> Ihr Sachverständigenbüro
            </span>
            <h2 className="font-display font-bold text-section-h2 text-white mb-3.5">
              Ihr Kfz-Sachverständigenbüro in <span className="text-amber">{city.name}</span>
            </h2>
            <div className="text-white/[.85] text-sm font-semibold mb-4">
              DAT-Expert · BVSK · 10+ Jahre · 2.500+ Schäden
            </div>
            {/* Claimondo-Partner-Brand-Block: Siegel (64px) + Sub-Label */}
            <div className="flex items-center gap-4 mb-5 leading-tight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-[64px] h-[64px] flex-none drop-shadow-[0_4px_12px_rgba(0,0,0,.25)]"
                src="/assets/brand/siegel-claimondo-partner.svg"
                alt="Claimondo-Partner-Siegel"
                loading="lazy"
              />
              <div>
                <div className="text-[15px] text-white font-semibold leading-tight">
                  Zertifizierter Claimondo-Partner
                </div>
                <div className="text-[13px] text-white/65 leading-tight mt-0.5">
                  Unfall-Assistance · Schadenregulierung aus einer Hand
                </div>
              </div>
            </div>
            <p className="text-white/[.84] text-base mb-3 leading-relaxed">
              DAT-zertifiziert, ingenieurbasiert, gerichtsfest. Als Claimondo-Partner übernehmen wir
              die komplette Abwicklung — Gutachten, Anwalt, Mietwagen/Nutzungsausfall und
              Versicherungskommunikation. Sie sehen jeden Schritt live im Portal.
            </p>
            <p className="text-white/[.84] text-base leading-relaxed mb-4">
              Unser Sachverständigenbüro betreut seit über 10 Jahren Geschädigte im {CLUSTER.regionDative}.
              Persönlich, vor Ort, ohne Umwege.
            </p>
            <p className="border-l-[3px] border-amber pl-4 text-white/[.88] italic text-base leading-relaxed">
              „Unabhängig und immer in Ihrem Interesse — vor Ort in ganz{' '}
              <span className="loc-text">{city.name}</span>.“
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
