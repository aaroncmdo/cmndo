'use server'

// Admin-Anlage eines Flottenmanager-Kontos. Muster: admin/makler/actions.ts.
// Auth-User + profiles(rolle=flottenmanager) + firmen_flotten_konten-Link via
// anlegeFlottenmanagerKern; Firma via ensureFirma (find-or-create).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendFlottenmanagerWelcome } from '@/lib/email/google/flows'
import { anlegeFlottenmanagerKern } from '@/lib/partner/anlege-flottenmanager'
import { ensureFirma } from '@/lib/firmen/ensure-firma'

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase
    .from('profiles')
    .select('id, rolle')
    .eq('id', user.id)
    .single()
  return p?.rolle === 'admin' ? { id: user.id } : null
}

export async function createFirmenFlotteKonto(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Flottenmanager-Konten anlegen.' }

  const firmaName = String(formData.get('firma_name') ?? '').trim()
  const vorname = String(formData.get('vorname') ?? '').trim()
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const telefon = String(formData.get('telefon') ?? '').trim() || null

  if (!firmaName || !email || !vorname) {
    return {
      ok: false,
      error: 'Firmenname, Ansprechpartner-Vorname und E-Mail sind Pflichtfelder.',
    }
  }

  const admin = createAdminClient()

  // Firma find-or-create
  const firmaResult = await ensureFirma({
    db: admin,
    snapshot: { name: firmaName, quelle: 'firmen_flotte_admin' },
  })
  if (!firmaResult.ok) return { ok: false, error: firmaResult.error }

  // Flottenmanager-Konto anlegen
  const result = await anlegeFlottenmanagerKern(admin, {
    firmaId: firmaResult.firmaId,
    email,
    telefon,
    vorname,
    aktiviertVon: adminUser.id,
  })
  if (!result.ok) return { ok: false, error: result.error }

  // Welcome-Mail (best-effort, non-critical)
  try {
    await sendFlottenmanagerWelcome({ to: email, vorname, firmaName })
  } catch (err) {
    console.error('[createFirmenFlotteKonto] Welcome-Email fehlgeschlagen (non-critical):', err)
  }

  revalidatePath('/admin/firmen-flotte')
  return { ok: true }
}
