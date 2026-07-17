'use client'
// B4: haengt im Vertrieb-Layout — ?aktion=vorlagen oeffnet die Mail-Vorlagen als Drawer
// auf JEDER Konsolen-Seite in-place (kein Kontextverlust; der Layout-Link zeigt hierher).
// Nutzt denselben ?aktion-Param wie die Aktionsleiste, aber einen Key, den diese NICHT
// bedient -> kein Doppel-Drawer. Deep-Link + Browser-Back via useUrlDrawerParam (B1).
import { useRouter } from 'next/navigation'
import { Drawer } from '@/components/primitives'
import VorlagenDrawerContent from './wizards/VorlagenDrawerContent'
import { useUrlDrawerParam } from '@/lib/navigation/use-url-drawer-param'

export default function VorlagenDrawerHost() {
  const router = useRouter()
  const aktionDrawer = useUrlDrawerParam('aktion')

  function schliessen() {
    aktionDrawer.close()
    // Vorlagen-Edits sollen serverseitige Ansichten aktualisieren (Action revalidiert
    // die Vorlagen-Route; das Cockpit selbst konsumiert die Texte nicht direkt).
    router.refresh()
  }

  return (
    <Drawer open={aktionDrawer.value === 'vorlagen'} onClose={schliessen} width={720} ariaLabel="Mail-Vorlagen">
      <VorlagenDrawerContent />
    </Drawer>
  )
}
