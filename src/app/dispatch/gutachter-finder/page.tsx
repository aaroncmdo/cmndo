import { ladeGutachterFinderAnfragen } from './actions'
import GutachterFinderUebersichtClient from './GutachterFinderUebersichtClient'

// Redesign (02.07.): PageHeader -> inline Header + StatBar-At-a-Glance im Client.
// Die dringenden DAT-SV-Anrufe (matching_typ=lead_fallback) waren nur im Tab
// versteckt — StatBar toned sie jetzt sichtbar. Datenschicht (Loader) unveraendert.
export default async function DispatchGutachterFinderPage() {
  const result = await ladeGutachterFinderAnfragen()
  const anfragen = result.ok ? result.data : []

  return (
    <div className="py-6 space-y-5">
      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Gutachter-Finder</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">
          Finder-Anfragen — verwertbare zuerst, DAT-SV-Anrufe markiert.
        </p>
      </div>
      <GutachterFinderUebersichtClient anfragen={anfragen} />
    </div>
  )
}
