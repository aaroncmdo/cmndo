import { Scale, ExternalLink } from 'lucide-react'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export interface Urteil {
  /** Aktenzeichen, z. B. "BGH VI ZR 253/22" oder "AG Köln 275 C 179/15". */
  az: string
  /** ISO-Datum YYYY-MM-DD. */
  datum: string
  gericht: string
  streitthema: string
  ergebnis: string
  quellenUrl?: string
}

interface Props {
  urteile: Urteil[]
}

function formatDatum(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Urteils-Liste (CONTRACT F-24): wegweisende Gerichtsentscheidungen rund um die
 * Schadensregulierung dieses Versicherers, als Karten.
 */
export function UrteilsListe({ urteile }: Props) {
  if (urteile.length === 0) return null
  return (
    <section>
      <h2 style={HEAD_FONT} className="text-2xl font-extrabold text-claimondo-navy">
        Wegweisende Gerichtsentscheidungen
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {urteile.map((u) => (
          <li
            key={u.az}
            className="flex flex-col rounded-ios-md border border-claimondo-border bg-white p-4 shadow-claimondo-sm"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-claimondo-navy">
              <Scale className="h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
              {u.az}
            </div>
            <div className="mt-0.5 text-xs text-claimondo-shield/60">
              {u.gericht} · {formatDatum(u.datum)}
            </div>
            <p className="mt-2 text-[0.9375rem] font-semibold text-claimondo-navy">{u.streitthema}</p>
            <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">{u.ergebnis}</p>
            {u.quellenUrl && (
              <a
                href={u.quellenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-claimondo-ondo hover:underline"
              >
                Quelle <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
