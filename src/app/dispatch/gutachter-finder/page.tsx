import { ladeGutachterFinderAnfragen } from './actions'
import GutachterFinderUebersichtClient from './GutachterFinderUebersichtClient'
import PageHeader from '@/components/shared/PageHeader'

// Redesign (02.07.): PageHeader -> inline Header + StatBar-At-a-Glance im Client.
// Die dringenden DAT-SV-Anrufe (matching_typ=lead_fallback) waren nur im Tab
// versteckt — StatBar toned sie jetzt sichtbar. Datenschicht (Loader) unveraendert.
// 14.07. (Portal-Header Phase 2): Titel/Untertitel zurueck auf shared PageHeader
// migriert (portal-weite Konsistenz) — StatBar-At-a-Glance bleibt im Client.
export default async function DispatchGutachterFinderPage() {
  const result = await ladeGutachterFinderAnfragen()
  const anfragen = result.ok ? result.data : []

  return (
    <div className="py-6 space-y-5">
      <PageHeader
        title="Gutachter-Finder"
        description="Finder-Anfragen — verwertbare zuerst, DAT-SV-Anrufe markiert."
        size="lg"
      />
      <GutachterFinderUebersichtClient anfragen={anfragen} />
    </div>
  )
}
