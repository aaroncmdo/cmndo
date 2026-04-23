'use client'

// AAR-723: Shared Tasks-Pill — zeigt die Anzahl offener Tasks, die mir
// (zugewiesen_an = me ODER empfaenger_user_id = me) zugewiesen sind. Wird in
// allen Portalen außer Kunde oben links neben dem Portal-Logo eingehängt.
//
// Realtime: Postgres-Changes-Subscription auf `tasks` re-queried den Counter
// live. Filter wird nicht serverseitig gesetzt (Supabase Realtime-Filter
// unterstützen kein OR) — stattdessen triggern wir ein Recount bei jedem
// Event und lassen die Query die Autoritätsfrage klären. Volumen ist klein
// genug (< 100 aktive Tasks typisch), dass das günstig bleibt.

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { ClipboardListIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  const [count, setCount] = useState<number>(initialCount)
  const channelSuffix = useId()

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    async function recount() {
      // Single-Query mit OR — verhindert Double-Counting (jede Zeile erscheint
      // genau einmal, egal ob sie über zugewiesen_an oder empfaenger_user_id
      // matcht). Zwei parallele Queries mit anschließendem Summieren wären
      // falsch: `neq('zugewiesen_an', userId)` würde `NULL != userId` als
      // NULL werten und Legacy-Tasks mit zugewiesen_an=NULL +
      // empfaenger_user_id=me komplett ausschließen.
      const { count: total } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .or(`zugewiesen_an.eq.${userId},empfaenger_user_id.eq.${userId}`)
        .in('status', OFFENE_STATUS as unknown as string[])
      setCount(total ?? 0)
    }

    recount()

    const channel = supabase
      .channel(`tasks-pill-${channelSuffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        recount()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, channelSuffix])

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
