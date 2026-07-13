'use server'

import { requireRole } from '@/lib/auth/guards'
import { getGesellschaftOptions } from '@/lib/makler/gesellschaft'

export async function getMaklerAnlegenOptionen(): Promise<
  | { ok: true; versicherungen: { id: string; name: string }[]; maklerpools: { id: string; name: string }[] }
  | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  const { versicherungen, maklerpools } = await getGesellschaftOptions()
  return { ok: true, versicherungen, maklerpools }
}
