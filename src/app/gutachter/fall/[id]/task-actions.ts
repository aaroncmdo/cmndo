'use server'

// AAR-291: Server-Actions für SV-Tasks (erledigen). Safety: nur eigene
// (empfaenger_rolle gutachter|sachverstaendiger) Tasks dürfen erledigt werden.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function erledigeSvTask(
  taskId: string,
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'erledigt',
      erledigt_am: new Date().toISOString(),
    })
    .eq('id', taskId)
    .in('empfaenger_rolle', ['gutachter', 'sachverstaendiger'])

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/gutachter/fall/${fallId}`)
  return { ok: true }
}
