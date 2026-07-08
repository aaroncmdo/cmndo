import type { AnspruchSpanne } from '@/lib/anspruch/types'
import { darstellePositionen } from '@/lib/anspruch/darstellung'

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function AnspruchPositionsListe({
  spanne,
  titel,
  gesamtLabel = 'Ihr möglicher Anspruch',
  disclaimer = 'Unverbindliche Ersteinschätzung anhand Ihrer Fotos. Den verbindlichen Anspruch ermittelt Ihr Gutachter.',
}: {
  spanne: AnspruchSpanne
  titel?: string
  gesamtLabel?: string
  disclaimer?: string
}) {
  const { positionen, gesamt } = darstellePositionen(spanne, gesamtLabel)

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-4">
      {titel ? (
        <p className="mb-3 text-body font-semibold text-claimondo-navy">{titel}</p>
      ) : null}
      <ul className="divide-y divide-claimondo-border">
        {positionen.map((p) => (
          <li
            key={p.key}
            className={`flex items-start justify-between gap-3 py-3 ${p.art === 'nicht_gedeckt' ? 'opacity-60' : ''}`}
          >
            <div>
              <p className="text-body font-medium text-claimondo-navy">{p.label}</p>
              {p.hinweis ? <p className="text-caption text-claimondo-shield">{p.hinweis}</p> : null}
            </div>
            <div className="shrink-0 text-right text-body font-semibold">
              {p.art === 'gegner' ? (
                <span className="text-success-strong">Gegnerversicherung</span>
              ) : p.art === 'nicht_gedeckt' ? (
                <span className="font-normal text-claimondo-shield">entfällt</span>
              ) : p.minEur === p.maxEur ? (
                <span className="text-claimondo-navy">{eur(p.minEur ?? 0)}</span>
              ) : (
                <span className="text-claimondo-navy">{`${eur(p.minEur ?? 0)} – ${eur(p.maxEur ?? 0)}`}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between rounded-ios-md bg-claimondo-navy px-4 py-3">
        <span className="text-body font-medium text-white">{gesamt.label}</span>
        <span className="text-heading-sm font-bold text-white">
          {eur(gesamt.minEur)} – {eur(gesamt.maxEur)}
        </span>
      </div>

      {spanne.hinweise.map((h) => (
        <p key={h} className="mt-2 text-caption text-claimondo-shield">{h}</p>
      ))}
      {disclaimer ? <p className="mt-2 text-caption text-claimondo-shield">{disclaimer}</p> : null}
    </div>
  )
}
