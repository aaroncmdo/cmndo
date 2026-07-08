import type { City } from '@/lib/cluster'
import { PARTNER_LINE } from '@/lib/content'
import { CLUSTER } from '@/lib/cluster'
import { ClaimondoLink } from '@/lib/text'

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
                src={`${CLUSTER.imgPath}avatar-${CLUSTER.svName.toLowerCase()}-${CLUSTER.key}.png`}
                alt={`${CLUSTER.svName} ${CLUSTER.svSurname}, Kfz-Sachverständiger vor Ort in ${city.name}`}
                loading="lazy"
                width={44}
                height={44}
              />
              <div className="uu-quote-sign-text">
                <p className="uu-quote-name">
                  {CLUSTER.svName} <span className="uu-quote-role">· DAT-Sachverständiger</span>
                </p>
                <p className="uu-quote-brand">{PARTNER_LINE.pre} <ClaimondoLink>{PARTNER_LINE.brand}</ClaimondoLink></p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="uu-quote-siegel"
                src="/assets/brand/siegel-claimondo-partner-v3.svg"
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
              <span className="uu-pill-sub">Expert Partner</span>
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
              <span className="uu-pill-sub"><ClaimondoLink>Claimondo</ClaimondoLink> NRW</span>
            </div>
          </div>
          <p className="uu-pillrow-foot">Codes als Beleg · Netzwerk &amp; lokales Büro getrennt</p>
        </div>

        {/* ============ DESKTOP / TABLET — BRIEF 08n N5b: Beleg-Cluster (Entscheid
            Aaron 10.06., Cowork-Live-Preview): align-items start statt center;
            linke Spalte = Flex-Column Teamfoto -> Siegel-Zeile -> Zitat (Beleg-
            Cluster), rechte Spalte ohne Siegel/Zitat (kein Doppel). Gemessene
            Wirkung: Spalten 378/410 statt 226/546 @834. ============ */}
        <div className="hidden sm:grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-10 items-start">
          <div className="flex flex-col gap-[18px]">
            {/* 08n N5b-Nachfass: ab lg waechst das 3/2-Foto mit der Spalte auf
                ~330px und reisst die Hoehendifferenz auf 145 (Akzeptanz <=120
                @1280/@1440) — max-h klemmt es; object-position haelt die
                Koepfe im oberen Drittel. <lg (834er-Soll 378/410) unveraendert. */}
            <div className="relative rounded-2xl overflow-hidden aspect-[3/2] lg:max-h-[260px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="teamPhoto"
                src={`${CLUSTER.imgPath}team-${CLUSTER.key}.webp?v=${CLUSTER.assetVersion}`}
                alt={`Kfz-Sachverständigen-Team in ${city.name} — DAT-zertifiziert, Claimondo-Partner`}
                loading="lazy"
                data-placeholder="true"
                width={600}
                height={400}
                className="w-full h-full object-cover lg:object-[50%_30%]"
              />
            </div>
            {/* Siegel-Zeile (aus der rechten Spalte hierher) */}
            <div className="flex items-center gap-4 leading-tight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-[64px] h-[64px] flex-none drop-shadow-[0_4px_12px_rgba(0,0,0,.25)]"
                src="/assets/brand/siegel-claimondo-partner-v3.svg"
                alt="Claimondo-Partner-Siegel"
                loading="lazy"
                width={64}
                height={64}
              />
              <div>
                <div className="text-[15px] text-white font-semibold leading-tight">
                  {PARTNER_LINE.pre} <ClaimondoLink>{PARTNER_LINE.brand}</ClaimondoLink>
                </div>
                {/* 08o O3: "Schadenregulierung aus einer Hand"-Zusatz entfaellt ersatzlos. */}
                <div className="text-[13px] text-white/65 leading-tight mt-0.5">
                  {PARTNER_LINE.sub}
                </div>
              </div>
            </div>
            {/* Zitat (aus der rechten Spalte hierher) */}
            <p className="border-l-[3px] border-amber pl-4 text-white/[.88] italic text-base leading-relaxed">
              „Unabhängig und immer in Ihrem Interesse — vor Ort in ganz{' '}
              <span className="loc-text">{city.name}</span>.“
            </p>
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
            <p className="text-white/[.84] text-base mb-3 leading-relaxed">
              Zertifiziert, ingenieurbasiert, gerichtsfest — mit Zugang zum DAT Expert Partner-Netzwerk. Als <ClaimondoLink>Claimondo-Partner</ClaimondoLink> übernehmen wir
              die komplette Abwicklung — Gutachten, Anwalt, Mietwagen/Nutzungsausfall und
              Versicherungskommunikation. Sie sehen jeden Schritt live im Portal.
            </p>
            <p className="text-white/[.84] text-base leading-relaxed">
              Unser Sachverständigenbüro betreut seit über 10 Jahren Geschädigte im {CLUSTER.regionDative}.
              Persönlich, vor Ort, ohne Umwege.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
