import type { City } from '@/lib/cluster'
import { CLUSTER, MAIN_CITY, cityHref, waHref } from '@/lib/cluster'
import { SITE } from '@/lib/site'
import { ClaimondoLink } from '@/lib/text'
import { CookieSettingsLink } from './CookieSettingsLink'

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
              {/* BRIEF 08d · Weiss-Variante auf dunklem Footer (logoExt pro Cluster).
                  08h A4a · Composite-Wortmarke wie im Header: Hairline + 2 Zeilen,
                  Zeile 2 "{Stadt} und Umgebung" normal geschrieben (Aaron 10.06.). */}
              <img
                src={`${CLUSTER.imgPath}logo-${CLUSTER.key}-white.${CLUSTER.logoExt}?v=${CLUSTER.assetVersion}`}
                alt={SITE.name}
                className="h-14 md:h-16 w-auto flex-none"
                loading="lazy"
              />
              <span className="block w-px self-stretch min-h-[34px] bg-amber" aria-hidden="true" />
              <span className="flex flex-col leading-none">
                <span className="font-display font-bold text-[17px] tracking-[-0.012em] text-white">Kfz-Gutachter</span>
                <span className="font-display font-bold text-[11px] tracking-[0.02em] mt-1.5 text-[var(--accent-on-dark,var(--amber))]">{MAIN_CITY.name} und Umgebung</span>
              </span>
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
              Servicegebiet: {city.name}{' '}&amp; Umland
            </p>
            <p className="mt-3 text-[12.5px] text-white/55 leading-snug">
              Vermittlung an qualifizierte Kfz-Sachverständige im{' '}
              <strong className="text-white/85 font-semibold"><ClaimondoLink>Claimondo-Partnernetzwerk</ClaimondoLink></strong> ·
              Gutachten nach BVSK-Standard
            </p>
            {/* 08k A5: Ratgeber-Link aus der Ablauf-Section hierher (war dort
                der einzige Treffer — Strategie 27c). Ziel 21.08.2026 von
                /gutachter/ auf /gutachter-ratgeber korrigiert: der alte Pfad
                war 404 und dieser Footer trug ihn auf 50 Seiten. */}
            <a
              href="https://autounfall.io/gutachter-ratgeber"
              target="_blank"
              rel="noopener"
              className="inline-block mt-2 text-[12.5px] text-white/70 underline underline-offset-2 hover:text-white transition"
            >
              Kfz-Gutachter-Ratgeber →
            </a>
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
            {/* 08q Q4: TMG verlangt unmittelbare Erreichbarkeit — Deep-Links
                auf /impressum bzw. /datenschutz, nicht auf die claimondo.de-
                Startseite. */}
            <a
              href={`${SITE.legalUrl}/impressum`}
              target="_blank"
              rel="noopener"
              className="hover:text-white transition"
            >
              Impressum
            </a>
            <a
              href={`${SITE.legalUrl}/datenschutz`}
              target="_blank"
              rel="noopener"
              className="hover:text-white transition"
            >
              Datenschutz
            </a>
            <CookieSettingsLink />
          </div>
        </div>
      </div>
    </footer>
  )
}
