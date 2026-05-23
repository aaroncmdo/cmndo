// Geteilter Tool-Seiten-Header (RSC) — gleiche Optik wie ArticleHeader, ohne
// Article-Objekt. Genutzt von /rechner · /kuerzungs-checker · /unfallbericht ·
// /schadenfreiheitsklasse/rechner (>2 Consumer → Shared, AGENTS §Redundanz).
export function ToolPageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string
  title: string
  intro: string
}) {
  return (
    <header className="mb-8">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-0.5 w-12 bg-au-amber" aria-hidden />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
          {eyebrow}
        </span>
      </div>
      <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-au-ink sm:text-5xl">
        {title}
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-au-ink-soft">{intro}</p>
    </header>
  )
}
