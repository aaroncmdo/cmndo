import { RATGEBER, type RatgeberCard } from '@/lib/content'

// Server-Component: Ratgeber-Deep-Links auf autounfall.io (4 Karten aus content.ts).
// Icon je card.icon (euro|file|user|check) → SVG exakt aus Mock (Z. 1003/1011/1019/1027).
// Klick-Tracking laeuft delegiert ueber SiteScripts (data-action/data-topic, kein onClick).
function CardIcon({ icon }: { icon: RatgeberCard['icon'] }) {
  switch (icon) {
    case 'euro':
      return (
        <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    case 'file':
      return (
        <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      )
    case 'user':
      return (
        <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
        </svg>
      )
    case 'check':
      return (
        <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
  }
}

export function RatgeberSection() {
  return (
    <section id="ratgeber" className="py-[clamp(52px,7vw,84px)] bg-paper">
      <div className="max-w-wrap mx-auto px-6">
        <div className="max-w-[700px] mx-auto text-center mb-[clamp(32px,4vw,46px)]">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber mb-3.5">
            <span className="eyebrow-dot" /> Tiefer einsteigen
          </span>
          <h2 className="font-display font-bold text-section-h2 mb-3.5">Häufige Fragen rund um Ihr Kfz-Gutachten</h2>
          <p className="text-secondary text-[17px] leading-relaxed">Antworten von unserem Ratgeber-Team — kostenfrei, ohne Anmeldung.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {RATGEBER.map((card) => (
            <a
              key={card.topic}
              className="group block bg-surface border border-border rounded-2xl p-5 shadow-sm hover:-translate-y-[3px] hover:shadow-md transition relative overflow-hidden"
              href={card.href}
              target="_blank"
              rel="noopener"
              data-action="ratgeber_click"
              data-topic={card.topic}
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber to-amber-700 opacity-0 group-hover:opacity-100 transition rounded-l-2xl" />
              <div className="w-11 h-11 rounded-[11px] bg-green-soft text-green grid place-items-center mb-3">
                <CardIcon icon={card.icon} />
              </div>
              <span className="font-mono text-[11px] font-bold tracking-[.06em] uppercase text-amber">{card.eyebrow}</span>
              <h3 className="font-display font-bold text-[17px] mt-1 mb-1.5">{card.title}</h3>
              <p className="text-sm text-secondary leading-relaxed mb-3">{card.text}</p>
              <span className="text-sm font-semibold text-petrol flex items-center gap-1 group-hover:text-amber transition">
                Mehr erfahren{' '}
                <svg className="w-4 h-4 stroke-current fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </span>
            </a>
          ))}
        </div>
        <p className="text-center mt-8 text-muted text-sm font-medium">
          Alle Ratgeber-Artikel:{' '}
          <a href="https://autounfall.io/" target="_blank" rel="noopener" className="text-petrol font-bold underline underline-offset-[3px]">
            autounfall.io →
          </a>
        </p>
      </div>
    </section>
  )
}
