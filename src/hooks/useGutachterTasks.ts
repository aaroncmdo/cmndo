'use client'

// AAR-291: Live-Tasks-Hook für SV-Fallakte. Realtime-Subscription auf
// tasks-Inserts/Updates für den aktuellen Fall.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type GutachterTask = {
  id: string
  fall_id: string | null
  task_typ: string | null
  titel: string
  beschreibung: string | null
  status: string
  prioritaet: string | null
  faellig_am: string | null
  empfaenger_rolle: string | null
  created_at: string | null
  erledigt_am: string | null
}

export function useGutachterTasks(fallId: string, initialTasks: GutachterTask[]) {
  const [tasks, setTasks] = useState<GutachterTask[]>(initialTasks)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select(
        'id, fall_id, task_typ, titel, beschreibung, status, prioritaet, faellig_am, empfaenger_rolle, created_at, erledigt_am',
      )
      .eq('fall_id', fallId)
      .in('empfaenger_rolle', ['gutachter', 'sachverstaendiger'])
      .in('status', ['offen', 'in-bearbeitung'])
      .order('prioritaet', { ascending: false })
      .order('faellig_am', { ascending: true, nullsFirst: false })
    setTasks((data ?? []) as GutachterTask[])
  }, [fallId])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`tasks-sv-${fallId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `fall_id=eq.${fallId}` },
        () => {
          refetch()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fallId, refetch])

  return { tasks, refetch }
}
