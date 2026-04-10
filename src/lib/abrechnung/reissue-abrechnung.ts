import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-150 Block C: Re-Issue einer stornierten Abrechnung.
 * Erstellt eine neue Abrechnung mit den verbleibenden (nicht-stornierten) Fällen
 * desselben Monats/SVs. Alte Abrechnung wird verknüpft.
 *
 * Wird aufgerufen aus revertCaseBilling (Szenario B) oder manuell vom Admin.
 */
export async function reissueAbrechnung(
  alteAbrechnungId: string,
): Promise<{ neue_abrechnung_id: string | null }> {
  const db = createAdminClient()

  // 1. Alte Abrechnung laden
  const { data: alte } = await db.from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_typ, empfaenger_id, empfaenger_email, empfaenger_name, abrechnungs_zeitraum_start, abrechnungs_zeitraum_ende, ust_satz, stripe_payment_intent_id')
    .eq('id', alteAbrechnungId)
    .single()

  if (!alte) throw new Error('Alte Abrechnung nicht gefunden')

  // 2. Verbleibende aktive Fälle im gleichen Zeitraum für denselben Empfänger
  //    (Fälle die auf diese Abrechnung zeigen ODER im gleichen Monat sind)
  let query = db.from('faelle')
    .select('id, created_at, kennzeichen, schadenhoehe_netto, lead_preis_netto, lead_preis_typ, guthaben_verrechnet_netto, sv_nachzahlung_netto')
    .eq('abrechnung_id', alteAbrechnungId)
    .is('storniert_am', null)

  const { data: faelle } = await query

  if (!faelle?.length) {
    // Keine Fälle mehr übrig — keine neue Abrechnung
    // Stripe PaymentIntent canceln falls vorhanden
    if (alte.stripe_payment_intent_id) {
      try {
        const { stripe } = await import('@/lib/stripe/client')
        await stripe.paymentIntents.cancel(alte.stripe_payment_intent_id)
      } catch { /* PI might already be cancelled/captured */ }
    }
    return { neue_abrechnung_id: null }
  }

  // 3. Neue Rechnungsnummer: alte Nr + Suffix '-K' (Korrektur)
  const neueNr = alte.abrechnungs_nr.endsWith('-K')
    ? alte.abrechnungs_nr // Already a correction
    : `${alte.abrechnungs_nr}-K`

  // 4. Positionen + Summen berechnen
  const positionen = faelle.map(f => ({
    fall_id: f.id,
    fall_datum: f.created_at,
    kennzeichen: f.kennzeichen,
    schadenhoehe_netto: Number(f.schadenhoehe_netto ?? 0),
    lead_preis_netto: Number(f.lead_preis_netto ?? 0),
    lead_preis_typ: f.lead_preis_typ,
    guthaben_verrechnet_netto: Number(f.guthaben_verrechnet_netto ?? 0),
    sv_nachzahlung_netto: Number(f.sv_nachzahlung_netto ?? 0),
  }))

  const summeNetto = positionen.reduce((s, p) => s + p.sv_nachzahlung_netto, 0)
  const ustSatz = Number(alte.ust_satz ?? 19)
  const ustBetrag = Math.round(summeNetto * (ustSatz / 100) * 100) / 100
  const summeBrutto = Math.round((summeNetto + ustBetrag) * 100) / 100
  const now = new Date().toISOString()

  // 5. Neue Abrechnung erstellen
  const { data: neue, error: insertErr } = await db.from('abrechnungen').insert({
    empfaenger_typ: alte.empfaenger_typ,
    empfaenger_id: alte.empfaenger_id,
    empfaenger_email: alte.empfaenger_email,
    empfaenger_name: alte.empfaenger_name,
    abrechnungs_nr: neueNr,
    abrechnungs_zeitraum_start: alte.abrechnungs_zeitraum_start,
    abrechnungs_zeitraum_ende: alte.abrechnungs_zeitraum_ende,
    positionen: positionen,
    summe_netto: summeNetto,
    ust_satz: ustSatz,
    ust_betrag: ustBetrag,
    summe_brutto: summeBrutto,
    status: 'versendet',
    versand_datum: now,
    faellig_am: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    notiz: `Korrekturabrechnung — ersetzt stornierte Rechnung ${alte.abrechnungs_nr}`,
  }).select('id').single()

  if (insertErr || !neue) {
    throw new Error(`Re-Issue fehlgeschlagen: ${insertErr?.message}`)
  }

  // 6. Verbleibende Fälle auf neue Abrechnung umlinken
  for (const f of faelle) {
    await db.from('faelle').update({ abrechnung_id: neue.id }).eq('id', f.id)
  }

  // 7. Alte Abrechnung verknüpfen
  await db.from('abrechnungen').update({
    ersetzt_durch_abrechnung_id: neue.id,
  }).eq('id', alteAbrechnungId)

  // 8. Stripe PaymentIntent der alten Abrechnung canceln falls vorhanden
  if (alte.stripe_payment_intent_id) {
    try {
      const { stripe } = await import('@/lib/stripe/client')
      await stripe.paymentIntents.cancel(alte.stripe_payment_intent_id)
    } catch { /* PI might already be cancelled/captured */ }
  }

  // 9. Email an Empfänger (best effort)
  try {
    const { sendEmail } = await import('@/lib/email/google/client')
    const { render } = await import('@react-email/render')
    const { AbrechnungReminderEmail } = await import('@/lib/email/google/templates/AbrechnungReminder')
    const html = await render(AbrechnungReminderEmail({
      vorname: alte.empfaenger_name.split(' ')[0] || null,
      abrechnungs_nr: neueNr,
      summe_brutto: summeBrutto,
      faellig_am: new Date(Date.now() + 14 * 86400000).toISOString(),
    }))
    await sendEmail({
      to: alte.empfaenger_email,
      subject: `Korrekturabrechnung ${neueNr} — Rechnung ${alte.abrechnungs_nr} wurde widerrufen`,
      html,
      empfaengerTyp: alte.empfaenger_typ ?? 'sv',
      template: 'abrechnung_reissue',
    })
  } catch (e) {
    console.error('[KFZ-150] Re-Issue Email fehlgeschlagen:', e)
  }

  return { neue_abrechnung_id: neue.id }
}
