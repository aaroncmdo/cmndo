'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { entscheideCompedToggle, type CompedZiel } from '@/lib/netzwerk/comped-toggle'

// Admin-Netzwerk-Sektion: comped setzen/entziehen (P1.6 "Bestand comped" / Deal-Hebel).
// Die Entscheidungslogik (inkl. der Invariante "Stripe-gefuehrte Status nie anfassen")
// lebt pure + unit-getestet in @/lib/netzwerk/comped-toggle. Hier nur Guard + I/O.
// BEWUSST kein Admin-Pfad fuer status='aktiv' — zahlend bleibt Stripe-gefuehrt
// (Webhook applyNetzwerkAboEvent + Dunning-Cron).
export async function setzeNetzwerkComped(
  svId: string,
  ziel: CompedZiel,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') {
    return { ok: false, error: 'Nur Admins dürfen den Netzwerkpartner-Status ändern.' }
  }

  const admin = createAdminClient()
  const { data: rows, error: readErr } = await admin
    .from('sv_netzwerk_abonnements')
    .select('id, status')
    .eq('sv_id', svId)
  if (readErr) return { ok: false, error: `Abo-Read fehlgeschlagen: ${readErr.message}` }

  const entscheidung = entscheideCompedToggle(
    (rows ?? []) as Array<{ id: string; status: string }>,
    ziel,
  )
  if (!entscheidung.ok) return { ok: false, error: entscheidung.error }

  if (entscheidung.aktion === 'insert_comped') {
    const { error } = await admin
      .from('sv_netzwerk_abonnements')
      .insert({ sv_id: svId, status: 'comped' })
    if (error) return { ok: false, error: `Freistellen fehlgeschlagen: ${error.message}` }
  } else if (entscheidung.aktion === 'set_inaktiv') {
    // .select()-Row-Check: ein Write ohne erreichte Rows darf nicht als Erfolg
    // durchgehen (Lektion DSGVO-Storno-Silent-Failure).
    const { data: upd, error } = await admin
      .from('sv_netzwerk_abonnements')
      .update({ status: 'inaktiv', aktualisiert_am: new Date().toISOString() })
      .in('id', entscheidung.rowIds)
      .select('id')
    if (error) return { ok: false, error: `Entziehen fehlgeschlagen: ${error.message}` }
    if ((upd ?? []).length !== entscheidung.rowIds.length) {
      return { ok: false, error: 'Nicht alle Abo-Zeilen wurden erreicht — Seite neu laden und erneut versuchen.' }
    }
  }
  // 'noop' faellt durch: Zielzustand besteht bereits.

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  return { ok: true }
}
