'use client'

// Vertrieb-Cockpit Phase C: dedizierter, immer sichtbarer Einstieg "Firmen-Flotten" (B2B).
// Bewusst KEIN Rollen-Pill (89f501f6-Entscheidung) und NICHT Teil der pill-scoped
// VertriebAktionsleiste — eine globale Verwaltungs-Flaeche (wie der Mail-Vorlagen-Link im Layout).
// Oeffnet einen Drawer mit FirmenFlotteAdminClient (Liste + Anlage). Die Admin-only-Grenze
// setzt der Loader (getFirmenFlottenKontenDaten) durch; der Button ist immer sichtbar, ein
// dispatch-User bekommt im Drawer ein fail-soft "Kein Zugriff".
import { useState } from 'react'
import { BuildingIcon } from 'lucide-react'
import { Button, Drawer } from '@/components/primitives'
import FirmenFlottenDrawerContent from './wizards/FirmenFlottenDrawerContent'

export default function FirmenFlottenCockpitEntry() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        iconLeft={<BuildingIcon className="w-4 h-4" />}
      >
        Firmen-Flotte anlegen
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={860}
        ariaLabel="Firmen-Flotte anlegen"
      >
        <FirmenFlottenDrawerContent />
      </Drawer>
    </>
  )
}
