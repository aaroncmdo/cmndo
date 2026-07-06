// Sub-Projekt 5 (Kunde-Portal 1+): Schaden-Uebersicht fuer Multi-Fall-Kunden
// (v.a. Firmen mit mehreren Schaeden) — Status-Summary ueber dem Fall-Grid, damit
// man auf einen Blick sieht wieviele Schaeden offen/abgeschlossen sind + welche
// Aufmerksamkeit brauchen. Rendert nur auf dem /kunde-Dashboard (>=2 Faelle).

import { SectionCard } from '@/components/shared/SectionCard'

export default function KundeSchadenUebersicht({
  gesamt,
  abgeschlossen,
  aktionErforderlich,
}: {
  gesamt: number
  abgeschlossen: number
  aktionErforderlich: number
}) {
  const offen = Math.max(0, gesamt - abgeschlossen)
  const stats: { label: string; value: number; highlight?: boolean }[] = [
    { label: 'Schäden gesamt', value: gesamt },
    { label: 'In Bearbeitung', value: offen },
    { label: 'Abgeschlossen', value: abgeschlossen },
  ]
  if (aktionErforderlich > 0) {
    stats.push({ label: 'Aktion nötig', value: aktionErforderlich, highlight: true })
  }

  return (
    <SectionCard title="Ihre Schäden im Überblick">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className={`text-2xl font-bold ${s.highlight ? 'text-warning-strong' : 'text-claimondo-navy'}`}>{s.value}</p>
            <p className="mt-0.5 text-xs text-claimondo-ondo">{s.label}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
