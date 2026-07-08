'use server'
// Vertrieb-CRM P0 Task 6: gegatetes Editieren eines Partner-Felds. Staff-Role-Guard
// PFLICHT (adminClient ohne Guard = IDOR), Whitelist je kind, Audit best-effort.
// Vorbild: src/app/mitarbeiter/claim-edit-actions.ts (updateClaimField).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { VERTRIEB_EDIT_TARGET } from '@/lib/vertrieb/vertrieb-edit-fields'
import type { VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'

// Module-local (nicht exportiert) — keine 'use server'-const-Export-Falle (AAR-664).
const STAFF_ROLLEN = new Set(['admin', 'dispatch'])

export async function updateVertriebFeld(
  kind: VertriebKind,
  id: string,
  feld: string,
  wert: string | number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = VERTRIEB_EDIT_TARGET[kind]
  if (!target || !target.fields.includes(feld)) {
    return { ok: false, error: 'Feld nicht editierbar' }
  }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const rolle = (profile?.rolle as string | null) ?? null
  if (!rolle || !STAFF_ROLLEN.has(rolle)) return { ok: false, error: 'Keine Berechtigung' }

  const { error: upErr } = await admin.from(target.table).update({ [feld]: wert }).eq('id', id)
  if (upErr) return { ok: false, error: upErr.message }

  // Audit — best-effort (Partner haben kein claim_id; timeline ist claim/lead-scoped ->
  // Referenz in metadata. Schlaegt der Insert fehl, wird er geschluckt, ohne den Write zu brechen).
  try {
    await admin.from('timeline').insert({
      typ: 'vertrieb_edit',
      titel: `Vertrieb-Feld bearbeitet: ${feld}`,
      erstellt_von: user.id,
      metadata: { kind, id, feld, wert },
    })
  } catch (err) {
    console.error('[updateVertriebFeld] audit insert failed', err)
  }

  revalidatePath('/admin/vertrieb')
  return { ok: true }
}
