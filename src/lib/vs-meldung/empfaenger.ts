// Slice 2c — die Verzweigung "koennen wir automatisch melden?".
// 85 von 96 aktiven Versicherern haben eine schaden_email (88,5 %, geprueft 14.07.).
// Die restlichen 11,5 % + jeder Gegner, der seine VS nicht aus der Liste gewaehlt hat,
// laufen bewusst NICHT ins Leere, sondern in einen Dispatch-Task.
import { getVersicherungById } from '@/lib/versicherungen/search-actions'

export type VsEmpfaenger =
  | { kann: true; versicherungId: string; name: string; email: string }
  | { kann: false; grund: 'keine_versicherung' | 'keine_schaden_email'; versicherungName?: string }

export async function resolveVsEmpfaenger(gegnerVersicherungId: string | null): Promise<VsEmpfaenger> {
  if (!gegnerVersicherungId) return { kann: false, grund: 'keine_versicherung' }

  const vs = await getVersicherungById(gegnerVersicherungId)
  if (!vs) return { kann: false, grund: 'keine_versicherung' }

  const email = vs.schaden_email?.trim()
  if (!email) return { kann: false, grund: 'keine_schaden_email', versicherungName: vs.name }

  return { kann: true, versicherungId: vs.id, name: vs.name, email }
}
