import { CLUSTER } from '@/lib/cluster'
import { NetzwerkCompare } from './NetzwerkCompare'

// SERVER-Section "Das Claimondo-Netzwerk" (Mock Z585-866). Links Bild-Karte
// (cluster-spezifisches Kundengespraech + Schadensbetreuer-Karte mit Monika),
// rechts Text + 4 Fakten-Badges + Client-Toggle <NetzwerkCompare /> mit der
// animierten Vergleichstabelle. Keine Props.
export function NetzwerkSection() {
  return (
    <section className="py-[clamp(52px,7vw,84px)] bg-petrol text-white">
      <div className="max-w-wrap mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.25fr] gap-[46px] items-start">
          {/* Bild-Karte: Kundengespräch (cluster-spezifisch) + Schadensbetreuer-Karte */}
          <div
            id="netzwerkCard"
            className="relative bg-cover bg-center bg-no-repeat border border-white/[.14] rounded-2xl overflow-hidden min-h-[400px] flex flex-col justify-end"
            style={{
              backgroundImage: `linear-gradient(180deg,rgba(14,24,32,.15) 0%,rgba(14,24,32,.50) 55%,rgba(14,24,32,.88) 100%),url('${CLUSTER.imgPath}kundengespraech-${CLUSTER.key}.webp')`,
            }}
          >
            <div className="p-5 flex flex-col gap-2.5">
              <div className="flex items-center gap-3 w-full bg-white/12 border border-white/20 rounded-[14px] p-3 backdrop-blur-[4px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="w-[54px] h-[54px] rounded-full object-cover flex-none border-2 border-white/60"
                  src="/assets/img/shared/monika.png"
                  alt="Monika — Ihre persönliche Schadensbetreuerin"
                  loading="lazy"
                />
                <div className="text-left flex-1 min-w-0">
                  <strong className="block text-white text-[14.5px] leading-tight">
                    Ihre persönliche Schadensbetreuerin
                  </strong>
                  <span className="block text-white/80 text-[12px] mt-[3px] leading-snug">
                    <span className="text-green font-semibold">● online</span> · 24/7 erreichbar &amp; eigenes
                    Kundenportal
                  </span>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 text-white/[.82] text-[11.5px] font-semibold">
                Lokaler DAT-/BVSK-Sachverständiger vor Ort
              </div>
            </div>
          </div>

          {/* Text + Fakten + Tabelle */}
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
              <span className="eyebrow-dot"></span> Das Claimondo-Netzwerk
            </span>
            <h2 className="font-display font-bold text-section-h2 text-white mb-4 leading-tight">
              Sie bekommen nicht <em className="not-italic text-white/60">einen</em> Gutachter.
              <br />
              Sie bekommen ein ganzes <span className="text-amber">Netzwerk</span>.
            </h2>
            <p className="text-white/[.86] text-[15.5px] leading-relaxed mb-5">
              Über uns erhalten Sie Zugriff auf{' '}
              <strong className="text-white">
                90+ unabhängige, nach DAT- und BVSK-Standard zertifizierte Kfz-Sachverständige
              </strong>{' '}
              in Ihrer Region — mit eigenem Online-Portal, persönlichem Schadensbetreuer und voller Abwicklung über
              unsere Partnerkanzlei. Und falls die Versicherung kürzt:{' '}
              <strong className="text-white">
                Wir prüfen gegen und setzen Ihre Ansprüche mit einem gerichtsfesten Gegengutachten durch
              </strong>
              .
            </p>

            {/* Fakten-Leiste: 4 kompakte Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-mono font-bold text-amber text-[22px] leading-none tabular-nums">90+</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  zertifizierte
                  <br />
                  Gutachter
                </div>
              </div>
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-display font-bold text-white text-[14px] leading-tight">DAT · BVSK</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  anerkannte
                  <br />
                  Standards
                </div>
              </div>
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-display font-bold text-white text-[14px] leading-tight">Eigenes Portal</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  Schaden jederzeit
                  <br />
                  im Blick
                </div>
              </div>
              <div className="bg-white/[.06] border border-white/[.14] rounded-xl px-3 py-3 text-center">
                <div className="font-mono font-bold text-amber text-[22px] leading-none tabular-nums">0 €</div>
                <div className="text-[10.5px] text-white/75 mt-1.5 leading-tight">
                  bei unverschuldetem
                  <br />
                  Unfall
                </div>
              </div>
            </div>

            {/* Toggle + vollständige Vergleichstabelle (Client) */}
            <NetzwerkCompare />

            <p className="mt-4 text-[12.5px] text-white/[.62] leading-relaxed">
              Hinweis: „Gegengutachten“ bezeichnet die fachliche Widerlegung eines Prüfberichts/Versicherergutachtens
              nach DAT/BVSK-Standard. Die erzielbare Auszahlung ist einzelfallabhängig.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
