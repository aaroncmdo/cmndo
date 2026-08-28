// SV-Galerie (Zustandsdoku-Vorzustand): read-only Kachel-Galerie des letzten abgeschlossenen
// Fahrzeug-Scans fuer den Gutachter im Claim — Foto + Qualitaets-Ampel (#4697) + dokumentierte
// Vorschaeden. Zeigt dem SV den Vorzustand -> Neuschaden vs. Vorschaden unterscheidbar.
// Server-Component (kein 'use client'): die URLs sind serverseitig signiert (Loader), es gibt
// keine Interaktion. scan null / keine Fotos -> null (Card erscheint dann gar nicht).
import { SectionCard } from '@/components/shared/SectionCard'
import { VehicleScanFotoGrid } from '@/components/shared/VehicleScanFotoGrid'
import type { VehicleScanView } from '@/lib/vehicles/vehicle-scan-view'

function formatDatum(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function VehicleScanGalerie({ scan }: { scan: VehicleScanView | null }) {
  if (!scan || scan.fotos.length === 0) return null

  const datum = formatDatum(scan.erstelltAm)
  const meta = [
    datum ? `Dokumentiert am ${datum}` : null,
    scan.kilometerstand != null ? `${scan.kilometerstand.toLocaleString('de-DE')} km` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <SectionCard
      title="Fahrzeug-Zustandsdoku (Vorzustand)"
      subtitle="Vom Flottenmanager vor dem Schaden erfasste Fotostrecke — zur Unterscheidung Neuschaden vs. Vorschaden. Die Ampel bewertet die Foto-Qualität für die Schadenerkennung."
    >
      <div className="space-y-4">
        {meta ? <p className="text-caption text-claimondo-ondo/60">{meta}</p> : null}

        <VehicleScanFotoGrid fotos={scan.fotos} />

        {scan.vorschaeden.length > 0 ? (
          <div className="space-y-1 border-t border-claimondo-border pt-3">
            <p className="text-caption font-semibold text-claimondo-ondo/70">
              Dokumentierte Vorschäden
            </p>
            {scan.vorschaeden.map((v) => (
              <p key={v.id} className="text-body-sm text-claimondo-navy">
                • {v.art ?? 'Schaden'}
                {v.schwere ? ` (${v.schwere})` : ''}
                {v.beschreibung ? ` — ${v.beschreibung}` : ''}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
}
