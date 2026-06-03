import { CLUSTER, cityNamesList, seoTextFor, cityHref, type City } from '@/lib/cluster'
import { MapSection } from './MapSection'

// Einsatzgebiet-Sektion (Server-Component). MapSection (Leaflet, Client) bleibt
// selbst Server-gehostet und initialisiert BEIDE Karten (#clusterMap Desktop +
// #clusterMapMobile in der sm:hidden-Insel) — nur die jeweils sichtbare wird
// per IntersectionObserver geladen.
// MOBILE (sm:hidden, #einsatzMobile, v2): eigener H2 (city + region-Dativ) +
// Map-Card (#clusterMapMobile + 3 Mini-Stats) + Brennpunkte (main-only) + Staedte-
// Pills + CTA. DESKTOP (hidden sm:block): Original (Wahrzeichen/Facts/Brennpunkte
// main-only + Karte + Legende + areaTags). SHARED (beide): per-Stadt-SEO-Text +
// areaTagsList — bewusst auch auf Mobile sichtbar (mobile-first SEO, Abweichung vom Mock).
export function EinsatzgebietSection({ city }: { city: City }) {
  return (
    <section id="einsatzgebiet" className="py-[clamp(52px,7vw,84px)] bg-petrol-tint">
      <div className="max-w-wrap mx-auto px-6">
        {/* ============ MOBILE-ONLY · Variante B ============ */}
        <div className="sm:hidden max-w-[440px] mx-auto" id="einsatzMobile">
          <div className="text-center mb-5">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3">
              <span className="eyebrow-dot" /> Einsatzgebiet
            </span>
            <h2 className="einsatz-mobile-h2">
              Vor Ort in <span className="text-amber">{city.name}</span>
              <br />
              &amp; im <span className="einsatz-mobile-region">{CLUSTER.regionDative}</span>.
            </h2>
            <p className="einsatz-mobile-lead">
              Wir kommen zu Ihnen — zuhause, am Arbeitsplatz oder an der Unfallstelle.
            </p>
          </div>

          {/* Map-Card + Mini-Stats (Leaflet via MapSection auf #clusterMapMobile) */}
          <div className="einsatz-map-card">
            <div
              id="clusterMapMobile"
              className="einsatz-map h-[220px] rounded-lg overflow-hidden relative isolate"
              role="img"
              aria-label="Karte des Einsatzgebiets"
            />
            <div className="einsatz-stats">
              <div className="einsatz-stat">
                <p className="einsatz-stat-num">{CLUSTER.cities.length}</p>
                <p className="einsatz-stat-label">Städte</p>
              </div>
              <div className="einsatz-stat-sep" />
              <div className="einsatz-stat">
                <p className="einsatz-stat-num">60</p>
                <p className="einsatz-stat-label">Min vor Ort</p>
              </div>
              <div className="einsatz-stat-sep" />
              <div className="einsatz-stat">
                <p className="einsatz-stat-num">24/7</p>
                <p className="einsatz-stat-label">erreichbar</p>
              </div>
            </div>
          </div>

          {/* Brennpunkte (nur Hub-Seite — Spoke wuerde Hub-Brennpunkte als eigene zeigen) */}
          {city.main && (
            <div className="einsatz-brennpunkte">
              <p className="einsatz-brennpunkte-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Wo Sie aufpassen sollten
              </p>
              <ul className="einsatz-brennpunkte-list">
                {CLUSTER.brennpunkte.map((b) => (
                  <li key={b.name}>
                    <div className="einsatz-brennpunkt">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="einsatz-brennpunkt-img"
                        src={`/assets/img/local/brennpunkte/${b.img}`}
                        alt={`${b.name} ${city.name} — Unfallschwerpunkt`}
                        loading="lazy"
                      />
                      <div className="einsatz-brennpunkt-body">
                        <p className="einsatz-brennpunkt-name">{b.name}</p>
                        <p className="einsatz-brennpunkt-text">{b.desc}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="einsatz-brennpunkte-source">Quelle: {CLUSTER.quellenAnker}</p>
            </div>
          )}

          {/* Städte-Pills (Text-only; keine Stadt-Thumbnails im Asset-Set) */}
          <div className="einsatz-pills-wrap">
            <p className="einsatz-pills-label">Auch im Umland für Sie da</p>
            <div className="einsatz-pills">
              {CLUSTER.cities.map((c) => (
                <a
                  key={c.slug}
                  href={cityHref(c)}
                  aria-current={c.slug === city.slug ? 'page' : undefined}
                  className={`einsatz-pill${c.slug === city.slug ? ' is-active' : ''}`}
                >
                  {c.name}
                </a>
              ))}
            </div>
          </div>

          {/* CTA */}
          <a className="einsatz-mobile-cta" href={`tel:${CLUSTER.phone.tel}`} data-cta="einsatz_call_mobile">
            <span className="einsatz-mobile-cta-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <span className="einsatz-mobile-cta-text">Vor-Ort-Termin anfragen</span>
            <span className="einsatz-mobile-cta-chev">→</span>
          </a>
        </div>

        {/* ============ DESKTOP / TABLET — Original ============ */}
        <div className="hidden sm:block">
          <div className="max-w-[700px] mx-auto text-center mb-[clamp(32px,4vw,46px)]">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
              <span className="eyebrow-dot" /> Einsatzgebiet
            </span>
            <h2 className="font-display font-bold text-section-h2 mb-3.5">
              In <span className="text-amber">{city.name}</span> &amp; im Umland für Sie unterwegs
            </h2>
            <p className="text-secondary text-[17px] leading-relaxed">
              Wir kommen zu Ihnen — zuhause, am Arbeitsplatz, in der Werkstatt oder an der Unfallstelle.
            </p>
          </div>

          {/* Leaflet-Karte Desktop (#clusterMap, lazy, Client) */}
          <MapSection city={city} />

          {/* Legende */}
          <div className="flex flex-wrap gap-4 justify-center text-xs text-secondary mt-3 mb-6">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber border-2 border-white shadow" /> aktuelle Stadt
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-petrol border-2 border-white shadow" /> weitere Orte
            </span>
            {city.main && (
              <span className="flex items-center gap-1.5">
                <span className="bg-red-500 rotate-45 border-2 border-white shadow" style={{ width: '10px', height: '10px' }} /> Verkehrsschwerpunkt
              </span>
            )}
          </div>

          {/* Wahrzeichen + Facts + Brennpunkte NUR auf der Hub-Seite */}
          {city.main && (
            <>
              <div className="rounded-2xl overflow-hidden mb-6 relative" style={{ minHeight: '280px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${CLUSTER.imgPath}${CLUSTER.landmark.img}`}
                  alt={`Wahrzeichen ${city.name} — ${CLUSTER.landmark.label}`}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
                <div className="relative z-[1] flex flex-col justify-end h-full p-6 md:p-8 pb-6 md:pb-8">
                  <span className="inline-block font-mono text-[11px] font-bold tracking-[.12em] uppercase text-white/70 bg-white/10 border border-white/20 rounded-full px-3 py-1 mb-3 backdrop-blur-[3px] w-fit">
                    {CLUSTER.landmark.label}
                  </span>
                  <p className="text-white font-display font-bold text-[clamp(20px,2.5vw,26px)] leading-tight max-w-[480px]">
                    Schnell bei Ihnen — in ganz {city.name} &amp; Umland.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {CLUSTER.facts.map((fact, i) => (
                  <div key={i} className="bg-surface border border-border rounded-xl p-4 text-center shadow-sm">
                    <div className={`font-mono font-bold text-[22px] ${fact.accent ? 'text-amber' : 'text-petrol'}`}>{fact.value}</div>
                    <div className="text-[12px] text-muted mt-1">{fact.label}</div>
                  </div>
                ))}
              </div>

              <div className="mb-6">
                <h3 className="font-display font-bold text-[clamp(17px,2vw,20px)] mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 stroke-amber fill-none flex-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>{' '}
                  Wo Sie aufpassen sollten
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {CLUSTER.brennpunkte.map((b) => (
                    <div key={b.name} className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                      <div className="aspect-[16/9] bg-gradient-to-br from-[#cdd9dd] to-[#aebfc6]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/assets/img/local/brennpunkte/${b.img}`}
                          alt={`${b.name} ${city.name} — Unfallschwerpunkt`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-semibold text-petrol">{b.name}</div>
                        <div className="text-[12px] text-muted mt-1">{b.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-muted text-[11.5px] mt-3 italic">Quelle: {CLUSTER.quellenAnker}</p>
              </div>
            </>
          )}

          {/* areaTags-Pill-Row (Desktop) */}
          <div className="flex flex-wrap gap-2">
            {CLUSTER.cities.map((c) => {
              const isActive = c.slug === city.slug
              return (
                <a
                  key={c.slug}
                  href={cityHref(c)}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? 'inline-flex items-center px-3 py-1.5 rounded-full bg-amber text-white border border-amber text-sm font-semibold shadow-sm'
                      : 'inline-flex items-center px-3 py-1.5 rounded-full bg-surface border border-border text-sm font-semibold text-petrol hover:bg-amber hover:text-white hover:border-amber transition'
                  }
                >
                  {c.name}
                </a>
              )
            })}
          </div>
        </div>

        {/* ============ SHARED (Mobile + Desktop): SEO-Text + areaTagsList ============ */}
        <div className="max-w-[820px] mx-auto mt-8 mb-4">
          <p className="text-secondary text-[15.5px] leading-relaxed">{seoTextFor(city.slug)}</p>
        </div>
        <p className="text-muted text-[13px]">Wir bedienen {cityNamesList()}.</p>
      </div>
    </section>
  )
}
