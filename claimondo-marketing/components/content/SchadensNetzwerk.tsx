import Link from 'next/link'
import { Building2, AlertTriangle } from 'lucide-react'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

interface Props {
  pruefdienste: string[]
  restwertboerse?: string
  werkstattnetz?: string
  mietwagenpartner?: string
  kalkulationssoftware?: string[]
  /** Allianz: ControlExpert-Mehrheit explizit markieren (CONTRACT F-25). */
  controlExpertHinweis?: boolean
  /** Link zum ControlExpert-/Prüfbericht-Decoder (ab Welle 3). */
  pruefberichtDecoderUrl?: string
}

/**
 * Schadens-Netzwerk (CONTRACT F-25): Prüfdienstleister-Verflechtung + Restwert-/
 * Werkstatt-/Mietwagen-Apparat eines Versicherers.
 */
export function SchadensNetzwerk({
  pruefdienste,
  restwertboerse,
  werkstattnetz,
  mietwagenpartner,
  kalkulationssoftware,
  controlExpertHinweis,
  pruefberichtDecoderUrl,
}: Props) {
  const rows: Array<[string, string]> = []
  if (restwertboerse) rows.push(['Restwertbörse', restwertboerse])
  if (werkstattnetz) rows.push(['Werkstattnetz', werkstattnetz])
  if (mietwagenpartner) rows.push(['Mietwagen-Prüfung', mietwagenpartner])
  if (kalkulationssoftware?.length) rows.push(['Kalkulationssoftware', kalkulationssoftware.join(', ')])

  return (
    <section className="rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-claimondo-ondo" aria-hidden />
        <h2 style={HEAD_FONT} className="text-lg font-extrabold text-claimondo-navy">
          Schadens-Netzwerk &amp; Prüfdienste
        </h2>
      </div>

      <div className="mt-4">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-claimondo-shield/60">
          Prüfdienstleister
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {pruefdienste.map((p) => (
            <li
              key={p}
              className="rounded-full border border-claimondo-border bg-claimondo-bg px-3 py-1 text-[0.8125rem] font-semibold text-claimondo-shield"
            >
              {p}
            </li>
          ))}
        </ul>
      </div>

      {rows.length > 0 && (
        <dl className="mt-4 divide-y divide-claimondo-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2 text-sm">
              <dt className="font-semibold text-claimondo-shield/70">{k}</dt>
              <dd className="text-right font-medium text-claimondo-navy">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {controlExpertHinweis && (
        <div className="mt-4 flex gap-2.5 rounded-ios-md border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm leading-relaxed text-amber-900">
            Der Prüfdienstleister <strong>ControlExpert</strong> steht seit 2020 mehrheitlich im
            Eigentum der Allianz (Bundeskartellamt-Freigabe B9-49/20, 21.10.2020). Prüfberichte sind
            kein neutrales Gutachten.{' '}
            {pruefberichtDecoderUrl && (
              <Link href={pruefberichtDecoderUrl} className="font-semibold text-claimondo-ondo hover:underline">
                Was tun bei einem Prüfbericht? →
              </Link>
            )}
          </p>
        </div>
      )}
    </section>
  )
}
