'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { entscheideCompedToggle, type AboRowMin, type CompedZiel } from '@/lib/netzwerk/comped-toggle'
import { logPartnerEvent } from '@/lib/partner/log-partner-event'

// Ein reines Datum (YYYY-MM-DD, aus <input type=date>) auf Tagesende-UTC heben, damit
// "gueltig bis <Tag>" den Tag EINSCHLIESST (sonst laueft comped um Mitternacht-Start ab).
function normalisiereAblauf(gueltigBis: string | null | undefined): string | null {
  if (!gueltigBis) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(gueltigBis) ? `${gueltigBis}T23:59:59.000Z` : gueltigBis
}

// Admin-Netzwerk-Sektion: comped setzen/entziehen (P1.6 "Bestand comped" / Deal-Hebel).
// Die Entscheidungslogik (inkl. der Invariante "Stripe-gefuehrte Status nie anfassen")
// lebt pure + unit-getestet in @/lib/netzwerk/comped-toggle. Hier nur Guard + I/O.
// BEWUSST kein Admin-Pfad fuer status='aktiv' — zahlend bleibt Stripe-gefuehrt
// (Webhook applyNetzwerkAboEvent + Dunning-Cron).
//
// opts (nur beim Setzen relevant): gueltigBis = optionale Befristung (Deal mit Ablauf),
// grund = Freitext, landet in der Audit-Spur (partner_aktivitaeten-Cockpit).
export async function setzeNetzwerkComped(
  svId: string,
  ziel: CompedZiel,
  opts?: { gueltigBis?: string | null; grund?: string },
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
    .select('id, status, gueltig_bis')
    .eq('sv_id', svId)
  if (readErr) return { ok: false, error: `Abo-Read fehlgeschlagen: ${readErr.message}` }

  const aboRows: AboRowMin[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as string,
    gueltigBis: (r.gueltig_bis as string | null) ?? null,
  }))
  const entscheidung = entscheideCompedToggle(aboRows, ziel)
  if (!entscheidung.ok) return { ok: false, error: entscheidung.error }

  const ablauf = normalisiereAblauf(opts?.gueltigBis)
  const grund = opts?.grund?.trim() || null

  if (entscheidung.aktion === 'insert_comped') {
    const { error } = await admin
      .from('sv_netzwerk_abonnements')
      .insert({ sv_id: svId, status: 'comped', gueltig_bis: ablauf })
    if (error) return { ok: false, error: `Freistellen fehlgeschlagen: ${error.message}` }

    const befristung = ablauf ? ` (befristet bis ${new Date(ablauf).toLocaleDateString('de-DE')})` : ''
    await logPartnerEvent({
      partnerTyp: 'sv',
      partnerId: svId,
      typ: 'einstufung',
      text: `Als Netzwerkpartner freigestellt (comped)${befristung}${grund ? ` — ${grund}` : ''}`,
      meta: { admin_id: user.id, gueltig_bis: ablauf, grund },
    })
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

    await logPartnerEvent({
      partnerTyp: 'sv',
      partnerId: svId,
      typ: 'einstufung',
      text: 'Comped-Freistellung entzogen',
      meta: { admin_id: user.id },
    })
  }
  // 'noop' faellt durch: Zielzustand besteht bereits.

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  return { ok: true }
}
