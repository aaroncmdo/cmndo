import { CLUSTER, cityNamesList, seoTextFor, type City } from '@/lib/cluster'
import { MapSection } from './MapSection'

// Einsatzgebiet-Sektion (Server-Component). Enthaelt die Client-Sub-Komponente
// MapSection (Leaflet, lazy) — bleibt selbst Server. Wahrzeichen-Hero +
// Facts-Grid + Verkehrs-Brennpunkte. Bild-Pfade: Cluster ueber CLUSTER.imgPath,
// Brennpunkte ueber /assets/img/local/brennpunkte/. Mock-Zeilen 921-968.
// Radius-Mapping: Mock 'rounded-2xl'/'rounded-xl' verbatim, 'rounded' → rounded-card.
export function EinsatzgebietSection({ city }: { city: City }) {
  return (
    <section id="einsatzgebiet" className="py-[clamp(52px,7vw,84px)] bg-petrol-tint">
      <div className="max-w-wrap mx-auto px-6">
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

        {/* Leaflet-Karte (lazy-loaded, Client) */}
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

        {/* Per-Stadt Lokal-Text — einzigartig pro Spoke (SEO gegen Doorway/Duplicate). */}
        <div className="max-w-[820px] mx-auto mb-8">
          <p className="text-secondary text-[15.5px] leading-relaxed">{seoTextFor(city.slug)}</p>
        </div>

        {/* Wahrzeichen + Facts + Brennpunkte NUR auf der Hub-Seite (sonst wuerde die
            Spoke ein fremdes Wahrzeichen + fremde Brennpunkte als ihre eigenen zeigen). */}
        {city.main && (
        <>
        {/* Wahrzeichen-Hero */}
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

        {/* Facts-Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {CLUSTER.facts.map((fact, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4 text-center shadow-sm">
              <div className={`font-mono font-bold text-[22px] ${fact.accent ? 'text-amber' : 'text-petrol'}`}>{fact.value}</div>
              <div className="text-[12px] text-muted mt-1">{fact.label}</div>
            </div>
          ))}
        </div>

        {/* Brennpunkte: Wo Sie aufpassen sollten */}
        <div className="mb-6">
          <h3 className="font-display font-bold text-[clamp(17px,2vw,20px)] mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 stroke-amber fill-none flex-none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
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
          <p className="text-muted text-[12px] mt-3">Beispiele verkehrsreicher Bereiche im Stadtgebiet — bei einem Unfall sind wir schnell vor Ort.</p>
        </div>
        </>
        )}

        {/* areaTagsList — cluster-dynamisch */}
        <p className="text-muted text-[13px]">Wir bedienen {cityNamesList()}.</p>
      </div>
    </section>
  )
}
