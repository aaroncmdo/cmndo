'use server'

// Makler legt proaktiv einen Kunden an. Entweder kanonischer FlowLink (Kunde macht
// den Gutachter-Finder im lead-gekeyten /flow/[token] selbst) ODER Rueckruf (Default).
// Attribution IMMER via leads.promotion_code_id = eigener Makler-Promo-Code -> bestehende
// Pipeline (convert-lead-to-claim -> claims.makler_id -> makler_provisionen). Service-role
// fuer Writes; Auth-Gate user-scoped via getCurrentMakler. Komponiert nur bestehende Infra.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentMakler, getMaklerPrimaryPromoCode } from '@/lib/makler/queries'
import { createLead } from '@/lib/leads/create-lead'
import { pickRoundRobinDispatcher } from '@/lib/start-link/pick-dispatcher'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { revalidatePath } from 'next/cache'

export type MaklerAnfrageAusgang = 'rueckruf' | 'flowlink'

export type MaklerAnfrageInput = {
  vorname: string
  nachname: string
  telefon: string
  email?: string | null
  standortPlz?: string | null
  standortOrt?: string | null
  ausgang: MaklerAnfrageAusgang
  rueckrufStartZeit?: string | null
}

export type MaklerAnfrageResult =
  | { ok: true; leadId: string; ausgang: MaklerAnfrageAusgang; token?: string; terminId?: string; warnung?: string }
  | { ok: false; error: string }

export async function erstelleMaklerAnfrage(input: MaklerAnfrageInput): Promise<MaklerAnfrageResult> {
  // 1. Auth-Gate: eingeloggter, aktiver Makler.
  const makler = await getCurrentMakler()
  if (!makler || makler.status !== 'aktiv') return { ok: false, error: 'Kein aktiver Makler-Zugang.' }
  if (!makler.user_id) return { ok: false, error: 'Makler ohne User-Account.' }

  // 2. Attribution: eigener Promo-Code (Fremd-Attribution unmoeglich — aus makler.id).
  const promo = await getMaklerPrimaryPromoCode(makler.id)
  if (!promo) return { ok: false, error: 'Kein aktiver Promo-Code hinterlegt. Bitte Admin kontaktieren.' }

  // 3. Validierung.
  const vorname = input.vorname?.trim() ?? ''
  const nachname = input.nachname?.trim() ?? ''
  const telefon = input.telefon?.trim() ?? ''
  const email = input.email?.trim() || null
  const standortPlz = input.standortPlz?.trim() || null
  const standortOrt = input.standortOrt?.trim() || null
  if (vorname.length < 1 || nachname.length < 1) return { ok: false, error: 'Vor- und Nachname erforderlich.' }
  if (telefon.length < 5) return { ok: false, error: 'Telefonnummer erforderlich.' }
  if (input.ausgang === 'flowlink' && !telefon && !email) {
    return { ok: false, error: 'Fuer den Link-Versand wird Telefon oder Email benoetigt.' }
  }

  // 4a. RUECKRUF (Default): bestehende Rueckruf-Infra (Lead status/phase='rueckruf' + admin_termine
  //     + Mitteilungen + Team-Notify + Kunde-WA), additiv um promotionCodeId + Standort erweitert.
  if (input.ausgang === 'rueckruf') {
    const res = await erstelleOeffentlichenRueckruf({
      name: `${vorname} ${nachname}`.trim(),
      telefon,
      email,
      startZeit: input.rueckrufStartZeit ?? null,
      quelle: 'makler-anfrage',
      promotionCodeId: promo.id,
      standortPlz,
      standortOrt,
    })
    if (!res.ok) return { ok: false, error: res.error }
    revalidatePath('/makler/leads')
    return { ok: true, leadId: res.leadId, ausgang: 'rueckruf', terminId: res.terminId }
  }

  // 4b. FLOWLINK: kanonische Lead-Anlage (status='neu'/phase='erstkontakt') + kanonischer Sender.
  const admin = createAdminClient()
  const dispatcherId = await pickRoundRobinDispatcher(admin)
  const created = await createLead(
    admin,
    { source_channel: 'makler-anfrage', status: 'neu', vorname, nachname, telefon, email },
    {
      promotion_code_id: promo.id,
      service_typ: 'komplett',
      qualifizierungs_phase: 'erstkontakt',
      zugewiesen_an: dispatcherId,
      sprache: await getLocaleCookie(),
      ...(standortPlz ? { fahrzeug_standort_plz: standortPlz } : {}),
      ...(standortOrt ? { fahrzeug_standort_adresse: standortOrt } : {}),
    },
  )
  if (!created.ok) return { ok: false, error: created.error }
  const leadId = created.leadId

  // Versand-Kaskade WhatsApp -> SMS -> Email. Der Core mintet den Token (idempotent) UND
  // setzt selbst status='flow-gesendet'/qualifizierungs_phase='flow-versendet'.
  const actorId = makler.user_id
  let sent: { success: boolean; error?: string; token?: string } = { success: false }
  if (telefon) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'whatsapp', actorId)
  if (!sent.success && telefon) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'sms', actorId)
  if (!sent.success && email) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'email', actorId)

  // Team-Notify (non-critical).
  try {
    await notifyNewLead({
      leadId,
      source: 'Makler-Anfrage',
      name: `${vorname} ${nachname}`.trim(),
      phone: telefon,
      email,
      extraFields: [{ label: 'Makler', value: makler.firma }],
    })
  } catch (err) {
    console.error('[erstelleMaklerAnfrage] notifyNewLead:', err)
  }

  revalidatePath('/makler/leads')
  if (!sent.success) {
    return {
      ok: true,
      leadId,
      ausgang: 'flowlink',
      warnung: 'Lead angelegt, aber der Link konnte nicht zugestellt werden — das Team kuemmert sich.',
    }
  }
  return { ok: true, leadId, ausgang: 'flowlink', token: sent.token }
}
