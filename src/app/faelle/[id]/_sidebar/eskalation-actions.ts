'use server'

// KB-Eskalation an einen Admin. Setzt faelle.eskaliert_an_admin_id;
// der Admin erscheint daraufhin als Mit-betreuer in den Kunde-Sidebar-
// Cards (read-only) und ist im KB- + Gruppenchat als zusaetzlicher
// Sender + sichtbarer Bubble-Avatar.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function listAdminsFuerEskalation(): Promise<
  | { ok: true; admins: Array<{ id: string; vorname: string | null; nachname: string | null; email: string | null }> }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['kundenbetreuer', 'admin'].includes((profile.rolle as string) ?? '')) {
    return { ok: false, error: 'Keine Berechtigung' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, vorname, nachname, email')
    .eq('rolle', 'admin')
    .eq('aktiv', true)
    .order('vorname', { ascending: true })
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    admins: ((data ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null; email: string | null }>),
  }
}

export async function eskaliereFallAnAdmin(
  fallId: string,
  adminId: string,
  grund?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('faelle')
    .update({
      eskaliert_an_admin_id: adminId,
      eskaliert_am: new Date().toISOString(),
      eskaliert_grund: grund ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fallId)
  if (error) return { ok: false, error: error.message }

  // Timeline-Eintrag fuer Audit
  await admin.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'An Admin eskaliert',
    beschreibung: grund ?? 'KB hat den Fall an einen Admin eskaliert.',
  })

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/kunde')
  return { ok: true }
}

export async function eskalationZuruecknehmen(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('faelle')
    .update({
      eskaliert_an_admin_id: null,
      eskaliert_am: null,
      eskaliert_grund: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fallId)
  if (error) return { ok: false, error: error.message }

  await admin.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Eskalation zurueckgenommen',
    beschreibung: null,
  })

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/kunde')
  return { ok: true }
}
