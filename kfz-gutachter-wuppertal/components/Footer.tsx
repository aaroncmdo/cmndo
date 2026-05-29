import type { City } from '@/lib/cluster'
import { CLUSTER, cityHref, waHref } from '@/lib/cluster'
import { SITE } from '@/lib/site'

// Server-Component (kein 'use client'). Footer mit 4-Spalten-Grid:
// 1) Logo + Betreiber-Block (SITE.operator) + Servicegebiet + Partnernetzwerk-Hinweis
// 2) Kontakt (Tel + WhatsApp) · 3) Erreichbarkeit · 4) Einsatzgebiet (cluster-dynamisch).
// Telefon ueber CLUSTER (weicht bewusst vom Mock-Festnetz ab — Aaron-Vorgabe Mobil).
// data-cta-Attribute fuer delegiertes Klick-Tracking (SiteScripts). Echte Umlaute.
export function Footer({ city }: { city: City }) {
  return (
    <footer className="bg-petrol-700 text-white/[.82] text-sm py-12 pb-[110px]">
      <div className="max-w-wrap mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* 1) Logo + Betreiber */}
          <div>
            <div className="flex items-center gap-3 mb-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${CLUSTER.imgPath}logo-${CLUSTER.key}.webp`}
                alt={SITE.name}
                className="h-14 md:h-16 w-auto flex-none"
                loading="lazy"
              />
            </div>
            <p className="font-semibold text-white">
              Kitta &amp; Sprafke UG{' '}
              <span className="text-white/55 font-normal">(haftungsbeschränkt)</span>
            </p>
            <p>{SITE.operator.street}</p>
            <p>
              {SITE.operator.postalCode} {SITE.operator.city}
            </p>
            <p className="mt-1.5 text-[13px] text-white/55">
              Servicegebiet: {city.name} &amp; Umland
            </p>
            <p className="mt-3 text-[12.5px] text-white/55 leading-snug">
              Vermittlung im{' '}
              <strong className="text-white/85 font-semibold">Claimondo-Partnernetzwerk</strong> ·
              DAT-zertifizierte Partner-Sachverständige vor Ort
            </p>
          </div>

          {/* 2) Kontakt */}
          <div>
            <h3 className="font-display font-bold text-white text-base mb-3">Kontakt</h3>
            <a
              className="block font-mono font-bold text-white mb-1"
              href={`tel:${CLUSTER.phone.tel}`}
              data-cta="footer_call"
            >
              {CLUSTER.phone.display}
            </a>
            <a className="block text-white/70" href={waHref(city)} data-cta="footer_wa">
              WhatsApp
            </a>
          </div>

          {/* 3) Erreichbarkeit */}
          <div>
            <h3 className="font-display font-bold text-white text-base mb-3">Erreichbarkeit</h3>
            <p>Mo – So: 08:00 – 20:00 Uhr</p>
            <p>Auch an Feiertagen</p>
            <p>Soforthilfe 24/7</p>
          </div>

          {/* 4) Einsatzgebiet — cluster-dynamisch */}
          <div>
            <h3 className="font-display font-bold text-white text-base mb-3">Einsatzgebiet</h3>
            <div className="flex flex-col gap-1 text-[13px]">
              {CLUSTER.cities.map((c) => (
                <a
                  key={c.slug}
                  href={cityHref(c)}
                  className={
                    c.slug === city.slug
                      ? 'text-amber font-bold'
                      : 'hover:text-white transition'
                  }
                >
                  {c.name}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-white/10 text-[13px] text-white/55">
          <span>© 2026 {SITE.name} · {CLUSTER.region}</span>
          <div className="flex gap-4">
            <a
              href={SITE.legalUrl}
              target="_blank"
              rel="noopener"
              className="hover:text-white transition"
            >
              Impressum
            </a>
            <a
              href={SITE.legalUrl}
              target="_blank"
              rel="noopener"
              className="hover:text-white transition"
            >
              Datenschutz
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
