// Item 7: Regulierungs-Verlauf — chronologische Ereignis-Zeitleiste der Kanzlei-/VS-
// Regulierung fuer die Kunde-Sicht (ergaenzt den groben Phasen-Stepper um konkrete
// Ereignisse mit Datum). Rein praesentational (keine Hooks); Daten aus
// vm.kanzlei.verlauf (kanzlei_faelle-Datumsfelder).

import { Card } from '@/components/primitives'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const fmtD = (iso: string): string =>
  new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  })

type VerlaufEvent = { datum: string; titel: string; detail?: string }

export function RegulierungsVerlaufCard({ vm }: { vm: KundeClaimViewModel }) {
  const v = vm.kanzlei.verlauf
  if (!v) return null

  const events: VerlaufEvent[] = []
  if (v.anschlussschreibenAm)
    events.push({ datum: v.anschlussschreibenAm, titel: 'Anschlussschreiben an die Versicherung verschickt' })
  if (v.vsReaktionAm)
    events.push({
      datum: v.vsReaktionAm,
      titel: 'Rückmeldung der Versicherung',
      detail: v.vsReaktionTyp ?? undefined,
    })
  if (v.regulierungAngekuendigtAm)
    events.push({ datum: v.regulierungAngekuendigtAm, titel: 'Regulierung angekündigt' })
  if (v.regulierungAm)
    events.push({
      datum: v.regulierungAm,
      titel: 'Reguliert',
      detail:
        v.kuerzungsBetrag != null && v.kuerzungsBetrag > 0
          ? `Kürzung: ${EUR.format(v.kuerzungsBetrag)}${v.vsKuerzungGrund ? ` (${v.vsKuerzungGrund})` : ''}`
          : undefined,
    })
  if (v.ausgezahltAm) events.push({ datum: v.ausgezahltAm, titel: 'Auszahlung erfolgt' })
  if (v.klageUebergebenAm)
    events.push({ datum: v.klageUebergebenAm, titel: 'An die Rechtsabteilung übergeben' })

  if (events.length === 0) return null
  events.sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())

  return (
    <Card p={4} className="space-y-3">
      <h2 className="text-body-sm font-semibold text-claimondo-navy">Verlauf mit der Kanzlei</h2>
      <ol className="space-y-0">
        {events.map((e, i) => (
          <li key={`${e.datum}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-claimondo-ondo mt-1.5 shrink-0" />
              {i < events.length - 1 && <span className="w-px flex-1 bg-claimondo-border/70" />}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <p className="text-body-xs text-claimondo-ondo">{fmtD(e.datum)}</p>
              <p className="text-body-sm font-medium text-claimondo-navy">{e.titel}</p>
              {e.detail && <p className="text-body-xs text-claimondo-ondo/90 mt-0.5">{e.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
