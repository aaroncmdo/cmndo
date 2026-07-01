'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { generateDraft } from './actions'

export default function GenerateDraftButton({ themaId }: { themaId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateDraft(themaId)
      if (!result.ok) {
        toast.error(result.error ?? 'Draft-Generierung fehlgeschlagen')
        return
      }
      toast.success('Draft generiert und zur Review bereitgestellt.')
    })
  }

  return (
    <Button
      variant="ondo"
      size="sm"
      loading={isPending}
      onClick={handleGenerate}
    >
      Draft generieren
    </Button>
  )
}
