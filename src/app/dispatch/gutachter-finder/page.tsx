import PageHeader from '@/components/shared/PageHeader'
import { ladeGutachterFinderAnfragen } from './actions'
import GutachterFinderUebersichtClient from './GutachterFinderUebersichtClient'

export default async function DispatchGutachterFinderPage() {
  const result = await ladeGutachterFinderAnfragen()
  const anfragen = result.ok ? result.data : []

  const offen = anfragen.filter((a) => a.status === 'neu' || a.status === 'in_bearbeitung')
  // entwurf = nie abgeschickte Kunden-Entwuerfe (Gros der Zeilen) — nicht als
  // "abgeschlossen" zaehlen; eigener Bucket. abgeschlossen = terminale Nicht-Entwurf-Status.
  const entwuerfe = anfragen.filter((a) => a.status === 'entwurf')
  const abgeschlossen = anfragen.filter(
    (a) => a.status !== 'neu' && a.status !== 'in_bearbeitung' && a.status !== 'entwurf',
  )

  return (
    <div className="py-6 space-y-6">
      <PageHeader
        title="Gutachter-Finder"
        actions={
          <span className="text-sm text-claimondo-ondo">
            {offen.length} offen · {abgeschlossen.length} abgeschlossen
            {entwuerfe.length > 0 && ` · ${entwuerfe.length} Entwürfe`}
          </span>
        }
      />
      <GutachterFinderUebersichtClient anfragen={anfragen} />
    </div>
  )
}
