'use client'

import { useTransition, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { createThema } from './actions'

export default function ThemaForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createThema(formData)
      if (!result.ok) {
        setError(result.error ?? 'Unbekannter Fehler')
        toast.error(result.error ?? 'Fehler beim Anlegen')
        return
      }
      toast.success('Thema angelegt und freigegeben.')
      formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="titel" className="block text-xs font-medium text-claimondo-navy mb-1">
            Titel <span className="text-danger">*</span>
          </label>
          <input
            id="titel"
            name="titel"
            type="text"
            required
            placeholder="z.B. Nutzungsausfall nach Unfall"
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:outline-none focus:border-claimondo-ondo"
          />
        </div>
        <div>
          <label htmlFor="primary_keyword" className="block text-xs font-medium text-claimondo-navy mb-1">
            Primäres Keyword
          </label>
          <input
            id="primary_keyword"
            name="primary_keyword"
            type="text"
            placeholder="z.B. nutzungsausfall berechnen"
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:outline-none focus:border-claimondo-ondo"
          />
        </div>
      </div>

      <div>
        <label htmlFor="kurzbrief" className="block text-xs font-medium text-claimondo-navy mb-1">
          Kurzbrief
        </label>
        <input
          id="kurzbrief"
          name="kurzbrief"
          type="text"
          placeholder="Kurze Beschreibung des Artikels"
          className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:outline-none focus:border-claimondo-ondo"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="cluster" className="block text-xs font-medium text-claimondo-navy mb-1">
            Cluster
          </label>
          <input
            id="cluster"
            name="cluster"
            type="text"
            placeholder="z.B. H3 / Schadensregulierung"
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:outline-none focus:border-claimondo-ondo"
          />
        </div>
        <div>
          <label htmlFor="artikel_typ" className="block text-xs font-medium text-claimondo-navy mb-1">
            Artikel-Typ
          </label>
          <input
            id="artikel_typ"
            name="artikel_typ"
            type="text"
            placeholder="z.B. ratgeber / lexikon / faq"
            className="w-full border border-claimondo-border rounded-ios-md px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:outline-none focus:border-claimondo-ondo"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}

      <div>
        <Button type="submit" variant="navy" size="sm" loading={isPending}>
          Thema anlegen
        </Button>
      </div>
    </form>
  )
}
