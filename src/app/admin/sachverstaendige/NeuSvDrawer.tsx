'use client'

// ARCH-1 POLISH Befund 4: Slide-out Drawer fuer "+ Neu" auf der
// /admin/sachverstaendige Seite. Importiert die existing AnlegenTabs
// (NICHT neu bauen) und fired Toast + router.refresh() bei Success.
// AAR-235: Büro-Orgs-Lazy-Load entfernt (Sub-SV-Tab gibt es nicht mehr).

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import AnlegenTabs from './anlegen/AnlegenTabs'

export default function NeuSvDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  function handleSuccess(info: { name: string; email: string }) {
    // AAR-237: Drawer NICHT automatisch schließen — sonst sieht der User
    // den Erfolgs-Screen aus AAR-205 nicht. Nur Toast + Liste im Hintergrund
    // refreshen; der User schließt den Drawer selbst via "Zur SV-Liste" oder
    // "Weiteren SV anlegen".
    toast.success(`SV ${info.name} wurde angelegt`, {
      description: `Welcome-Mail an ${info.email} versendet.`,
    })
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* ARCH-1 POLISH Aaron-Feedback: 40vw responsive mit Mindest-Breite 600px,
          damit der Drawer auf grossen Screens grosszuegig ist und auf kleineren
          Screens trotzdem nicht zu schmal wird. sm:max-w-none ueberschreibt das
          shadcn-Default sm:max-w-sm. */}
      <SheetContent
        side="right"
        className="w-full sm:w-[40vw] sm:min-w-[600px] sm:max-w-none overflow-y-auto"
      >
        <SheetHeader className="border-b border-gray-200">
          <SheetTitle>Neuen Sachverstaendigen anlegen</SheetTitle>
          <SheetDescription>
            Solo-SV, Buero mit Sub-Standorten oder Sub-SV zu bestehender Org hinzufuegen.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <AnlegenTabs onSuccess={handleSuccess} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
