'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { approveThema, rejectThema } from './actions'

export default function ThemaActions({ themaId }: { themaId: string }) {
  const [isPendingApprove, startApprove] = useTransition()
  const [isPendingReject, startReject] = useTransition()

  function handleApprove() {
    startApprove(async () => {
      const result = await approveThema(themaId)
      if (!result.ok) {
        toast.error(result.error ?? 'Freigabe fehlgeschlagen')
        return
      }
      toast.success('Thema freigegeben.')
    })
  }

  function handleReject() {
    startReject(async () => {
      const result = await rejectThema(themaId)
      if (!result.ok) {
        toast.error(result.error ?? 'Ablehnung fehlgeschlagen')
        return
      }
      toast.success('Thema abgelehnt.')
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="navy"
        size="sm"
        loading={isPendingApprove}
        onClick={handleApprove}
      >
        Freigeben
      </Button>
      <Button
        variant="bare"
        size="sm"
        loading={isPendingReject}
        onClick={handleReject}
      >
        Ablehnen
      </Button>
    </div>
  )
}
