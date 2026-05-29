import { CLUSTER } from '@/lib/cluster'
import { LEISTUNGEN } from '@/lib/content'

// LEISTUNGEN (6 Schritte) — Mock-Zeilen 868-892.
// Server-Component (keine Interaktivitaet). Karten aus content.ts (LEISTUNGEN),
// nicht hartkodiert. Bilder shared: /assets/img/shared/besichtigung/{img}.
// Telefon-CTA: <a href={`tel:${CLUSTER.phone.tel}`} data-cta="besichtigung_call"> —
// Klick-Tracking laeuft delegiert ueber SiteScripts (kein onClick noetig).
export function LeistungenSection() {
  return (
    <section id="leistungen" className="py-[clamp(52px,7vw,84px)] bg-paper">
      <div className="max-w-wrap mx-auto px-6">
        <div className="max-w-[700px] mx-auto text-center mb-[clamp(32px,4vw,46px)]">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
            <span className="eyebrow-dot" /> Haftpflichtgutachten · Ihr Anspruch
          </span>
          <h2 className="font-display font-bold text-section-h2 mb-3.5">Gerichtsfestes Gutachten in 6 Schritten</h2>
        </div>
        <div className="max-w-[720px] mx-auto text-center mb-[clamp(28px,4vw,42px)]">
          <div className="font-display font-bold text-[clamp(19px,2vw,23px)] text-ink mb-2.5">Das Wichtigste sieht man nach einem Unfall oft gar nicht.</div>
          <p className="text-secondary text-base">Genau dafür kommt unser Sachverständiger. Schritt für Schritt — damit kein Schaden übersehen wird und Sie am Ende bekommen, was Ihnen zusteht.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {LEISTUNGEN.map((l, i) => (
            <div
              key={l.img}
              className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm hover:-translate-y-[3px] hover:shadow-md transition"
            >
              <div className="aspect-[4/3] bg-gradient-to-br from-[#cdd9dd] to-[#aebfc6] relative">
                <span className="absolute top-3 left-3 w-[30px] h-[30px] rounded-full bg-amber text-white font-mono font-bold text-[13px] grid place-items-center">
                  {i + 1}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/assets/img/shared/besichtigung/${l.img}`}
                  alt={l.title}
                  loading="lazy"
                  data-placeholder="true"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-[18px]">
                <h3 className="font-display font-bold text-[17px] mb-[7px]">{l.title}</h3>
                <p className="text-sm text-secondary mb-3">{l.text}</p>
                <div className="text-[12.5px] text-petrol bg-petrol-tint rounded-lg px-[11px] py-2 font-semibold">
                  <b className="font-mono font-bold">{l.badgeLabel}</b> {l.badgeText}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <p className="text-secondary text-[16.5px] max-w-[660px] mx-auto mb-5">
            So bleibt kein Schaden übersehen — und Sie bekommen, was Ihnen zusteht. Bei unverschuldetem Unfall für Sie{' '}
            <strong>100% kostenlos</strong>.
          </p>
          <a
            className="inline-flex items-center gap-2 bg-amber text-white font-display font-bold text-[17px] px-8 py-[18px] rounded-cta shadow-[0_6px_18px_color-mix(in_srgb,var(--amber)_32%,transparent)] hover:bg-amber-700 hover:-translate-y-px transition"
            href={`tel:${CLUSTER.phone.tel}`}
            data-cta="besichtigung_call"
          >
            ☎ Jetzt Besichtigung anfragen
          </a>
        </div>
      </div>
    </section>
  )
}
