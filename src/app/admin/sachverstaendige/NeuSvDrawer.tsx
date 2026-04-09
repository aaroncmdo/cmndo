'use client'

// ARCH-1 POLISH Befund 4: Slide-out Drawer fuer "+ Neu" auf der
// /admin/sachverstaendige Seite. Importiert die existing AnlegenTabs
// (NICHT neu bauen) und fired Toast + router.refresh() bei Success.

import { useEffect, useState } from 'react'
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
import { listBueroOrganisationen } from './anlegen/actions'

export default function NeuSvDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [organisationen, setOrganisationen] = useState<Array<{ id: string; name: string }>>([])
  const [loaded, setLoaded] = useState(false)

  // Lazy-load der Buero-Orgs nur wenn der Drawer wirklich geoeffnet wird.
  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    listBueroOrganisationen()
      .then(orgs => {
        if (!cancelled) {
          setOrganisationen(orgs)
          setLoaded(true)
        }
      })
      .catch(err => {
        console.error('[NeuSvDrawer] listBueroOrganisationen failed:', err)
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [open, loaded])

  function handleSuccess(info: { name: string; email: string }) {
    toast.success(`SV ${info.name} wurde angelegt`, {
      description: `Welcome-Mail an ${info.email} versendet.`,
    })
    onOpenChange(false)
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
          {loaded ? (
            <AnlegenTabs organisationen={organisationen} onSuccess={handleSuccess} />
          ) : (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#4573A2] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
