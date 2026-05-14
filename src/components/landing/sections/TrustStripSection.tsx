// Generischer Trust-Strip (4-Spalten KPI-Reihe) für alle Premium-Pages.
// Pendant-Pattern auf Hauptseite, Stadt-Pages, /vorteile, /wie-es-funktioniert,
// /faq, /ueber-uns, /schadensreport-2026, /ersteinschaetzung.

export type KpiItem = { wert: string; label: string }

type Props = {
  kpis: KpiItem[]
  /** Optional aria-label (default 'Kennzahlen'). */
  ariaLabel?: string
}

export function TrustStripSection({ kpis, ariaLabel = 'Kennzahlen' }: Props) {
  return (
    <section className="border-y border-claimondo-border/60 bg-white" aria-label={ariaLabel}>
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-claimondo-border/60 px-5 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="py-6 text-center">
            <div className="text-2xl font-extrabold text-claimondo-navy sm:text-3xl">{k.wert}</div>
            <div className="mt-1 text-xs text-claimondo-ondo">{k.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
