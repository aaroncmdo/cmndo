'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useId } from 'react'

interface Props {
  invitation_id: string
  initialStatus?: string
}

const STATUS_LABELS: Record<string, string> = {
  offen: '⏳ Einladung gesendet',
  geoeffnet: '👁️ Gegner hat Link geöffnet',
  daten_eingegeben: '✍️ Gegner gibt Daten ein',
  konvertiert: '✅ Gegner ist Voll-Kunde geworden',
  widerrufen: '🚫 Einladung zurückgezogen',
  abgelaufen: '⏰ Einladung abgelaufen',
}

export function InvitationStatusBadge({ invitation_id, initialStatus }: Props) {
  const channelId = useId()
  const [status, setStatus] = useState<string>(initialStatus ?? 'lädt...')

  useEffect(() => {
    const supabase = createClient()

    // Initial laden
    supabase
      .from('airdrop_invitations')
      .select('status')
      .eq('id', invitation_id)
      .single()
      .then(({ data }) => {
        if (data) setStatus(STATUS_LABELS[data.status] ?? data.status)
      })

    // Realtime-Updates
    const channel = supabase
      .channel(`invitation-status-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'airdrop_invitations',
          filter: `id=eq.${invitation_id}`,
        },
        (payload) => {
          const newStatus = (payload.new as { status: string }).status
          setStatus(STATUS_LABELS[newStatus] ?? newStatus)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [invitation_id, channelId])

  return <span className="font-medium">{status}</span>
}
