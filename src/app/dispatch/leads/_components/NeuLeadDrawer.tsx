'use client'

// Quick-Create-Button: legt einen leeren Lead-Stub an und navigiert direkt
// in die Lead-Maske. Kein Drawer-Modal mehr — der Dispatcher füllt alle
// Daten in der Maske, wo er auch alle Phase-Inputs sieht.
//
// Aaron-Spec:
//   „lass es weg und leg bei klick auf+ neuer lead halt einfach einen
//    neuen lead an und öffne die maske"

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from 'lucide-react'
import { createManualLead } from '../actions'

export default function NeuLeadDrawer({ fab = false }: { fab?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await createManualLead({
        anrede: null,
        vorname: '',
        nachname: '',
        telefon: '',
        email: '',
        kunde_adresse: '',
        kunde_strasse: '',
        kunde_plz: '',
        kunde_stadt: '',
        kunde_lat: null,
        kunde_lng: null,
        source_channel: 'manuell',
        notizen: '',
      })
      if (result.success && result.leadId) {
        router.push(`/dispatch/leads/${result.leadId}`)
      } else {
        alert(result.error ?? 'Lead konnte nicht angelegt werden')
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={fab
        ? 'flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-semibold bg-claimondo-navy hover:bg-claimondo-shield text-white shadow-lg shadow-claimondo-navy/30 transition-colors disabled:opacity-60'
        : 'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-claimondo-shield hover:bg-claimondo-ondo text-white transition-colors disabled:opacity-60'
      }
    >
      <PlusIcon className="w-4 h-4" />
      {pending ? 'Erstelle …' : 'Neuer Lead'}
    </button>
  )
}
