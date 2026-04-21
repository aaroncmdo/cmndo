// AAR-691: Intercepting-Route für /admin/sachverstaendige/anlegen.
// Der Anlegen-Wizard (Solo/Büro/Akademie/Community) wird im Drawer über
// der Karte gerendert. Full-Page-Fallback bleibt für Deep-Links.

import AnlegenPage from '../../anlegen/page'
import DrawerShell from '../DrawerShell'

export default async function InterceptedAnlegenPage() {
  return (
    <DrawerShell title="Neuer Sachverständiger" widthClass="sm:w-[920px]">
      <div className="px-6 py-6">
        <AnlegenPage />
      </div>
    </DrawerShell>
  )
}
