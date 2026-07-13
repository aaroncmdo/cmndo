'use server'

// Vertrieb-Cockpit Phase C: cockpit-seitiger Loader fuer die Firmen-Flotten-Konten (B2B).
// Spiegelt den inline-Loader aus src/app/admin/firmen-flotte/page.tsx 1:1 (firmen_flotten_konten
// + je Konto profiles + firmen). firmen_flotten_konten ist noch nicht in database.types
// (Regel-2-Lag) -> AnyDb-Cast wie in der Standalone-Seite.
// Admin-only: die firmen-flotte-Standalone-Seite UND createFirmenFlotteKonto gaten beide auf
// rolle=admin (die Cockpit-Roster-Loader erlauben zusaetzlich dispatch — hier bewusst enger).
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FlottenKontoRow } from '../../firmen-flotte/FirmenFlotteAdminClient'

export async function getFirmenFlottenKontenDaten(): Promise<
  { ok: true; konten: FlottenKontoRow[] } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: rawKonten } = await admin
    .from('firmen_flotten_konten')
    .select('user_id, firma_id, status, created_at')
    .order('created_at', { ascending: false })

  const konten: FlottenKontoRow[] = []
  if (Array.isArray(rawKonten)) {
    for (const k of rawKonten as Array<{
      user_id: string
      firma_id: string
      status: string | null
      created_at: string | null
    }>) {
      const { data: prof } = await admin
        .from('profiles')
        .select('email, vorname, telefon')
        .eq('id', k.user_id)
        .maybeSingle()
      const { data: firma } = await admin
        .from('firmen')
        .select('name')
        .eq('id', k.firma_id)
        .maybeSingle()

      konten.push({
        user_id: k.user_id,
        firma_id: k.firma_id,
        firma_name: (firma?.name as string | null) ?? null,
        email: (prof?.email as string | null) ?? null,
        vorname: (prof?.vorname as string | null) ?? null,
        telefon: (prof?.telefon as string | null) ?? null,
        status: k.status,
        created_at: k.created_at,
      })
    }
  }

  return { ok: true, konten }
}
