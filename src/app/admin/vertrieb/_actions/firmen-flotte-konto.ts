'use server'

// Firmen-Flotten Admin-Action: Flottenmanager-Konto-Status setzen (aktiv/pausiert/deaktiviert).
// firmen_flotten_konten ist noch nicht in database.types (Regel-2-Lag) -> AnyDb-Cast.
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function setzeFlottenKontoStatus(
  firmaId: string,
  kontoId: string,
  status: 'aktiv' | 'pausiert' | 'deaktiviert',
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { error } = await admin.from('firmen_flotten_konten').update({ status }).eq('id', kontoId)
  if (error) return { ok: false, error: (error as { message: string }).message }
  revalidatePath(`/admin/vertrieb/firmen-flotte/${firmaId}`)
  return { ok: true }
}
