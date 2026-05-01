'use server'

// CMM-32i: Kanzlei-Fall-Lifecycle-Actions.
// - kanzleiVsKontaktErfasst: KB hat erstmaligen Kontakt zur gegnerischen VS.
// - kanzleiAuszahlungEingegangen: Auszahlung gekommen → status='auszahlung'.
// Beide Actions sind Admin/KB-only und nehmen die fall_id (nicht kanzlei_faelle.id),
// weil die Caller über die Fallakte kommen.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function getKbOrAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
    return { error: 'Nur Admin/KB darf das' as const }
  }
  return {
    user,
    name:
      [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'KB',
  }
}

export async function kanzleiVsKontaktErfasst(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getKbOrAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = createAdminClient()

  // CMM-37: Read via claim_id (kanonisch). fall_id wird vom Sync-Trigger
  // gepflegt, ist aber nicht mehr der primaere Lookup-Pfad.
  const { data: fall } = await db
    .from('faelle').select('claim_id').eq('id', fallId).maybeSingle()
  const claimId = (fall as { claim_id?: string | null } | null)?.claim_id
  if (!claimId) return { ok: false, error: 'Fall hat keinen Claim' }
  const { data: kf } = await db
    .from('kanzlei_faelle')
    .select('id, vs_kontakt_am')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (!kf) return { ok: false, error: 'Kein Kanzlei-Fall — Gutachten ist noch nicht freigegeben' }
  if (kf.vs_kontakt_am) return { ok: true }

  const now = new Date().toISOString()
  const { error: uErr } = await db
    .from('kanzlei_faelle')
    .update({ vs_kontakt_am: now })
    .eq('id', kf.id)
  if (uErr) return { ok: false, error: uErr.message }

  try {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'vs_kontakt_erfasst',
      titel: 'VS-Kontakt erfasst',
      beschreibung: `${auth.name} hat den Erstkontakt zur gegnerischen Versicherung dokumentiert.`,
      erstellt_von: auth.user.id,
    })
  } catch (err) {
    console.warn('[kanzleiVsKontaktErfasst] Timeline fehlgeschlagen:', err)
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)
  return { ok: true }
}

export async function kanzleiAuszahlungEingegangen(
  fallId: string,
  betrag?: number,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getKbOrAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const db = createAdminClient()

  const { data: fall2 } = await db
    .from('faelle').select('claim_id').eq('id', fallId).maybeSingle()
  const claimId2 = (fall2 as { claim_id?: string | null } | null)?.claim_id
  if (!claimId2) return { ok: false, error: 'Fall hat keinen Claim' }
  const { data: kf } = await db
    .from('kanzlei_faelle')
    .select('id, status, ausgezahlt_am')
    .eq('claim_id', claimId2)
    .maybeSingle()
  if (!kf) return { ok: false, error: 'Kein Kanzlei-Fall — Gutachten ist noch nicht freigegeben' }
  if (kf.ausgezahlt_am) return { ok: true }

  const now = new Date().toISOString()
  const { error: uErr } = await db
    .from('kanzlei_faelle')
    .update({ status: 'auszahlung', ausgezahlt_am: now })
    .eq('id', kf.id)
  if (uErr) return { ok: false, error: uErr.message }

  try {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'auszahlung_eingegangen',
      titel: 'Auszahlung eingegangen',
      beschreibung: betrag
        ? `${auth.name}: Auszahlung ${betrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € eingegangen.`
        : `${auth.name} hat die Auszahlung als eingegangen markiert.`,
      erstellt_von: auth.user.id,
    })
  } catch (err) {
    console.warn('[kanzleiAuszahlungEingegangen] Timeline fehlgeschlagen:', err)
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)
  return { ok: true }
}
