// Makler-Vertriebs-Pipeline-Karte fuers Dashboard: der Funnel Offene Leads →
// Vermittelt → Ausgezahlt + die Geld-Pipeline (abrechenbar = naechste Auszahlung,
// ausgezahlt gesamt). Ergaenzt das Monats-Stat-Grid um eine All-Time-Flow-Sicht.
// Nutzt die shared SectionCard (kein handgerolltes Card-Markup).

import { SectionCard } from '@/components/shared/SectionCard'
import type { MaklerPipeline } from '@/lib/makler/pipeline'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

type Props = {
  offeneLeads: number
  pipeline: MaklerPipeline
}

function Stufe({ value, label, hint }: { value: number; label: string; hint: string }) {
  return (
    <div className="flex-1 text-center">
      <p className="text-2xl font-bold text-claimondo-navy">{value}</p>
      <p className="text-xs font-medium text-claimondo-navy mt-1">{label}</p>
      <p className="text-xs text-claimondo-ondo">{hint}</p>
    </div>
  )
}

function vermittlungLabel(n: number): string {
  return n === 1 ? 'Vermittlung' : 'Vermittlungen'
}

export function MaklerPipelineCard({ offeneLeads, pipeline }: Props) {
  return (
    <SectionCard title="Ihre Pipeline">
      <div className="flex items-center gap-1">
        <Stufe value={offeneLeads} label="Offene Leads" hint="noch offen" />
        <span className="text-claimondo-ondo shrink-0" aria-hidden>
          →
        </span>
        <Stufe value={pipeline.vermittelt} label="Vermittelt" hint="erfolgreich" />
        <span className="text-claimondo-ondo shrink-0" aria-hidden>
          →
        </span>
        <Stufe value={pipeline.ausgezahltAnzahl} label="Ausgezahlt" hint="abgeschlossen" />
      </div>

      <div className="mt-5 pt-4 border-t border-claimondo-border grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-claimondo-ondo">Abrechenbar</p>
          <p className="text-lg font-semibold text-success-strong">
            {EUR.format(pipeline.abrechenbarSumme)}
          </p>
          <p className="text-xs text-claimondo-ondo">
            nächste Auszahlung · {pipeline.abrechenbarAnzahl} {vermittlungLabel(pipeline.abrechenbarAnzahl)}
          </p>
        </div>
        <div>
          <p className="text-xs text-claimondo-ondo">Ausgezahlt gesamt</p>
          <p className="text-lg font-semibold text-claimondo-navy">
            {EUR.format(pipeline.ausgezahltSumme)}
          </p>
          <p className="text-xs text-claimondo-ondo">
            {pipeline.ausgezahltAnzahl} {vermittlungLabel(pipeline.ausgezahltAnzahl)}
          </p>
        </div>
      </div>
    </SectionCard>
  )
}
