import PageHeader from '@/components/shared/PageHeader'
import { ladeGutachterFinderAnfragen } from './actions'
import GutachterFinderUebersichtClient from './GutachterFinderUebersichtClient'

export default async function DispatchGutachterFinderPage() {
  const result = await ladeGutachterFinderAnfragen()
  const anfragen = result.ok ? result.data : []

  const offen = anfragen.filter((a) => a.status === 'neu' || a.status === 'in_bearbeitung')
  const abgeschlossen = anfragen.filter((a) => a.status !== 'neu' && a.status !== 'in_bearbeitung')

  return (
    <div className="py-6 space-y-6">
      <PageHeader
        title="Gutachter-Finder"
        actions={
          <span className="text-sm text-claimondo-ondo">
            {offen.length} offen · {abgeschlossen.length} abgeschlossen
          </span>
        }
      />
      <GutachterFinderUebersichtClient anfragen={anfragen} />
    </div>
  )
}
