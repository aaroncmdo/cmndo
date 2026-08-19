'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'
// CMM-63 SP-C: Ownership zentral über claim_parties (SSoT). Ersetzt den inline-Check
// (faelle.kunde_id + leads.user_id-Fallback) durch den prod-erprobten Helper
// (claim_parties-primär + faelle.kunde_id + leads.email-Fallback).
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'

export async function waehleNachbesichtigungsTermin(
  fallId: string,
  datum: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()

  // Zugehörigkeit prüfen (CMM-63 SP-C: zentraler Helper, claim_parties-SSoT)
  const ownership = await assertKundeOwnsFall(db, user.id, user.email ?? null, fallId)
  if (!ownership.ok) {
    return { success: false, error: ownership.error === 'not_found' ? 'Fall nicht gefunden' : 'Nicht autorisiert' }
  }

  // CMM-49/AAR-552: kanonischer aktueller Termin (== v_faelle `t`-Selektion, status-
  // priorisiert) via RPC statt simple-`start_zeit DESC` — so treffen Guard-Check UND Write
  // denselben Termin, den die Reader (v_faelle / get-kunde-faelle) lesen (sonst Mismatch bei
  // >1 Termin/Claim). Eine Selektion fuer beides (Status fuer den Guard + id fuer den Write).
  let aktTermin: { id: string; nachbesichtigung_status: string | null } | null = null
  if (ownership.claimId) {
    const { data: terminId } = await db.rpc('get_aktueller_gt_termin_id', { p_claim_id: ownership.claimId })
    if (terminId) {
      const { data: t } = await db
        .from('gutachter_termine')
        .select('id, nachbesichtigung_status')
        .eq('id', terminId as string)
        .maybeSingle()
      aktTermin = (t as { id: string; nachbesichtigung_status: string | null } | null) ?? null
    }
  }

  if (aktTermin?.nachbesichtigung_status !== 'angefordert') {
    return { success: false, error: 'Keine offene Nachbesichtigung' }
  }

  // CMM-44 SP-D PR2b: nachbesichtigung_termin_datum + _status → gutachter_termine (aktueller Termin, SSoT).
  // Die Terminwahl des Kunden. Bleibt der Status auf 'angefordert', ist seine Wahl
  // verloren und der Guard oben laesst ihn erneut waehlen — ohne dass jemand merkt,
  // dass die erste Wahl nie ankam.
  const { error: wahlFehler } = await db.from('gutachter_termine').update({
    nachbesichtigung_termin_datum: datum,
    nachbesichtigung_status: 'termin-gewaehlt',
  }).eq('id', aktTermin.id)
  if (wahlFehler) {
    console.error(`[nachbesichtigung] Terminwahl nicht gespeichert (Termin ${aktTermin.id}):`, wahlFehler.message)
    return { success: false, error: 'Der Termin konnte nicht gespeichert werden — bitte erneut versuchen.' }
  }

  await db.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Nachbesichtigungstermin gewählt',
    beschreibung: `Kunde hat ${new Date(datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} gewählt.`,
  })

  // WA: Termin bestaetigt
  // C3a: durable via Notification-Outbox. dedupKey mit dem gewaehlten Datum als
  // Fenster — ein Doppelklick auf denselben Slot ergibt genau eine Bestaetigung,
  // waehlt der Kunde spaeter ein ANDERES Datum, bekommt er wieder eine (ein Key
  // ohne Fenster haette die Umwahl-Bestaetigung verschluckt).
  await enqueue({
    dedupKey: buildDedupKey({ template: 'nachbesichtigung_termin', claimId: fallId, fenster: datum }),
    kanal: 'whatsapp',
    template: 'nachbesichtigung_termin',
    claimId: fallId,
  }).catch(() => {})

  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/kunde/nachbesichtigung`)
  return { success: true }
}
