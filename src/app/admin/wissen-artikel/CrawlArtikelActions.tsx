'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { zuruckziehenArtikel } from './actions'

export default function CrawlArtikelActions({ artikelId }: { artikelId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleZuruckziehen() {
    startTransition(async () => {
      const result = await zuruckziehenArtikel(artikelId)
      if (!result.ok) {
        toast.error(result.error ?? 'Zurückziehen fehlgeschlagen')
        return
      }
      toast.success('Artikel zurückgezogen und archiviert.')
    })
  }

  return (
    <Button
      variant="bare"
      size="sm"
      loading={isPending}
      onClick={handleZuruckziehen}
    >
      Zurückziehen
    </Button>
  )
}
