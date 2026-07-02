import type { AnspruchSpanne } from '@/lib/anspruch/types'

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function AnspruchPositionsListe({
  spanne,
  gesamtLabel = 'Ihr möglicher Anspruch',
  disclaimer = 'Unverbindliche Ersteinschätzung anhand Ihrer Fotos. Den verbindlichen Anspruch ermittelt Ihr Gutachter.',
}: {
  spanne: AnspruchSpanne
  gesamtLabel?: string
  disclaimer?: string
}) {
  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-4">
      <ul className="divide-y divide-claimondo-border">
        {spanne.positionen.map((p) => (
          <li key={p.typ} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="text-body font-medium text-claimondo-navy">{p.label}</p>
              {p.hinweis ? <p className="text-caption text-claimondo-shield">{p.hinweis}</p> : null}
            </div>
            <div className="shrink-0 text-right text-body font-semibold text-claimondo-navy">
              {p.gedecktDurchGegner || p.minEur == null || p.maxEur == null ? (
                <span className="text-success-strong">Gegnerversicherung</span>
              ) : p.minEur === p.maxEur ? (
                eur(p.minEur)
              ) : (
                `${eur(p.minEur)} – ${eur(p.maxEur)}`
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between rounded-ios-md bg-claimondo-navy px-4 py-3">
        <span className="text-body font-medium text-white">{gesamtLabel}</span>
        <span className="text-heading-sm font-bold text-white">
          {eur(spanne.gesamtMinEur)} – {eur(spanne.gesamtMaxEur)}
        </span>
      </div>

      {spanne.hinweise.map((h) => (
        <p key={h} className="mt-2 text-caption text-claimondo-shield">{h}</p>
      ))}
      <p className="mt-2 text-caption text-claimondo-shield">{disclaimer}</p>
    </div>
  )
}
