import { ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

const BAFIN_QUELLE =
  'https://www.bafin.de/DE/Verbraucher/BeschwerdenAnsprechpartner/Beschwerdestatistik/beschwerdestatistik_node.html'

interface Props {
  versicherer: string
  beschwerden2024: number | null
  quote2024: number | null
  branchenschnitt?: number
  quellenUrl?: string
  stand?: string
  /** Pflicht-Kontext wenn quote2024 null ODER erklärungsbedürftig (B2/K10). */
  note?: string
}

/**
 * BaFin-Faktencheck (CONTRACT F-23): Beschwerdequote vs. Branchenschnitt mit
 * Quellenangabe. Grün wenn unter Schnitt, rot wenn darüber. Stand sichtbar.
 */
export function BafinFaktencheck({
  versicherer,
  beschwerden2024,
  quote2024,
  branchenschnitt = 2.2,
  quellenUrl = BAFIN_QUELLE,
  stand = '2024',
  note,
}: Props) {
  const hasQuote = quote2024 !== null
  const ueberSchnitt = hasQuote && quote2024 > branchenschnitt
  const ratio = hasQuote ? Math.min(quote2024 / (branchenschnitt * 2), 1) : 0

  return (
    <section className="rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm">
      <div className="flex items-center gap-2">
        {ueberSchnitt ? (
          <ShieldAlert className="h-5 w-5 text-red-600" aria-hidden />
        ) : (
          <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden />
        )}
        <h2 style={HEAD_FONT} className="text-lg font-extrabold text-claimondo-navy">
          BaFin-Faktencheck {stand}
        </h2>
      </div>

      {hasQuote ? (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`text-4xl font-extrabold ${ueberSchnitt ? 'text-red-600' : 'text-emerald-600'}`}>
              {quote2024.toLocaleString('de-DE')}
            </span>
            <span className="text-sm text-claimondo-shield/70">
              Beschwerden je 100.000 Verträge
              {beschwerden2024 !== null && ` (${beschwerden2024.toLocaleString('de-DE')} absolut)`}
            </span>
          </div>
          <div className="mt-3" aria-hidden>
            <div className="h-2 w-full overflow-hidden rounded-full bg-claimondo-bg">
              <div
                className={`h-full rounded-full ${ueberSchnitt ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-claimondo-shield">
            {ueberSchnitt
              ? `Über dem Branchenschnitt von ${branchenschnitt.toLocaleString('de-DE')}.`
              : `Im oder unter dem Branchenschnitt von ${branchenschnitt.toLocaleString('de-DE')}.`}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-claimondo-shield">
          {note ?? 'Für diesen Versicherer ist die BaFin-Kfz-Quote 2024 nicht separat ausgewiesen.'}
        </p>
      )}

      {hasQuote && note && <p className="mt-2 text-sm text-claimondo-shield/80">{note}</p>}

      <a
        href={quellenUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-claimondo-ondo hover:underline"
      >
        Quelle: BaFin-Beschwerdestatistik <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
      <p className="mt-2 text-xs leading-relaxed text-claimondo-shield/60">
        Die BaFin-Statistik erfasst alle abschließend bearbeiteten Kfz-Beschwerden (Vertrag, Kasko,
        Haftpflicht) — kein isolierter Drittschaden-Indikator, aber die einzige offizielle Quelle.
      </p>
    </section>
  )
}
