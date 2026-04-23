'use client'

// AAR-723: Shared Tasks-Pill — zeigt die Anzahl offener Tasks, die mir
// (zugewiesen_an = me ODER empfaenger_user_id = me) zugewiesen sind. Wird in
// allen Portalen außer Kunde oben links neben dem Portal-Logo eingehängt.
//
// K1-Konsolidierung: Realtime + Count via useRealtimeCount-Hook, kein
// eigenes useEffect-Boilerplate mehr.

import { useCallback } from 'react'
import Link from 'next/link'
import { ClipboardListIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeCount } from '@/lib/realtime/use-realtime-count'

const OFFENE_STATUS = ['offen', 'in-bearbeitung'] as const

type Variant = 'dark' | 'light'

export default function TasksPill({
  userId,
  href,
  variant = 'dark',
  initialCount = 0,
}: {
  userId: string
  href: string
  variant?: Variant
  initialCount?: number
}) {
  const fetchCount = useCallback(async () => {
    if (!userId) return 0
    const supabase = createClient()
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .or(`zugewiesen_an.eq.${userId},empfaenger_user_id.eq.${userId}`)
      .in('status', OFFENE_STATUS as unknown as string[])
    return count ?? 0
  }, [userId])

  const { count } = useRealtimeCount({ fetchCount, table: 'tasks', initialCount })

  if (count <= 0) return null

  const isDark = variant === 'dark'

  return (
    <Link
      href={href}
      aria-label={`${count} offene Tasks`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
        isDark
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : 'bg-red-100 hover:bg-red-200 text-red-700 border border-red-200'
      }`}
    >
      <ClipboardListIcon className="w-3.5 h-3.5" />
      <span>{count > 99 ? '99+' : count}</span>
    </Link>
  )
}
