import { createAdminClient } from '@/lib/supabase/admin'

// ─── Twilio WhatsApp ────────────────────────────────────────────────────────

export async function sendWhatsApp(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

  if (!sid || !token) {
    console.error('[whatsapp] TWILIO_ACCOUNT_SID oder TWILIO_AUTH_TOKEN FEHLT — Nachricht wird NICHT gesendet. Bitte in Vercel Environment setzen.')
    return { success: false, error: 'Twilio-Credentials fehlen' }
  }

  // Telefonnummer normalisieren: 0163... → +49163..., 0049... → +49...
  let cleanTo = to.replace(/[^0-9+]/g, '')
  if (cleanTo.startsWith('00')) cleanTo = '+' + cleanTo.slice(2)
  if (cleanTo.startsWith('0')) cleanTo = '+49' + cleanTo.slice(1)
  if (!cleanTo.startsWith('+')) cleanTo = '+49' + cleanTo

  const whatsappTo = cleanTo.startsWith('whatsapp:') ? cleanTo : `whatsapp:${cleanTo}`
  const whatsappFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`

  console.log(`[whatsapp] Sende an ${whatsappTo} von ${whatsappFrom}`)

  try {
    const twilio = (await import('twilio')).default
    const client = twilio(sid, token)
    const result = await client.messages.create({
      from: whatsappFrom,
      to: whatsappTo,
      body: message,
    })
    console.log('[whatsapp] Gesendet:', result.sid)
    return { success: true, sid: result.sid }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[whatsapp] Twilio Fehler:', msg)
    return { success: false, error: msg }
  }
}

type NachrichtTyp =
  | 'nach_sa_unterschrift'
  | 'nach_gutachter_dispatch'
  | 'nach_terminbestaetigung'
  | 'erinnerung_24h'
  | 'erinnerung_2h'
  | 'nach_gutachten'
  | 'nach_qc_freigabe'
  | 'nach_anspruchsschreiben'
  | 'nach_regulierung'
  | 'nach_zahlung'
  | 'nach_abschluss'
  | 'eskalation_vs03'
  | 'eskalation_vs05'
  | 'eskalation_vs06'
  | 'zahlung_teilweise'
  | 'kuerzung_ruege'
  | 'kuerzung_akzeptiert'
  | 'auszahlung'
  | 'dokument_fehlt'
  | 'termin_vereinbart_kb'
  | 'termin_erinnerung_kb'
  | 'nachbesserung_gutachten'
  | 'status_update'

type FallContext = {
  fall_nummer?: string
  vorname?: string
  nachname?: string
  gutachter_name?: string
  termin_datum?: string
  termin_uhrzeit?: string
  termin_ort?: string
  betrag?: string
  kb_name?: string
  dokument_name?: string
  portal_link?: string
  termin_typ?: string
  meet_link?: string
  kuerzung_betrag?: string
  status_text?: string
}

function buildNachricht(typ: NachrichtTyp, ctx: FallContext): string {
  const name = [ctx.vorname, ctx.nachname].filter(Boolean).join(' ') || 'Kunde'
  const portal = ctx.portal_link ? `\n\nIhr Portal: ${ctx.portal_link}` : ''

  switch (typ) {
    case 'nach_sa_unterschrift':
      return `Hallo ${name}, vielen Dank! Ihre Unterlagen sind bei uns eingegangen. Wir beauftragen jetzt einen Gutachter fuer Ihr Fahrzeug. Sie werden in Kuerze kontaktiert.${portal}\n\nIhr Claimondo-Team`

    case 'nach_gutachter_dispatch':
      return `Hallo ${name}, Ihr Gutachter ${ctx.gutachter_name ?? ''} wurde beauftragt und wird sich innerhalb von 24 Stunden bei Ihnen melden, um einen Termin zu vereinbaren.${portal}\n\nIhr Claimondo-Team`

    case 'nach_terminbestaetigung':
      return `Hallo ${name}, Ihr Gutachtertermin wurde bestaetigt:\n${ctx.termin_datum ?? '—'} um ${ctx.termin_uhrzeit ?? '—'} Uhr${ctx.termin_ort ? `\nOrt: ${ctx.termin_ort}` : ''}\nGutachter: ${ctx.gutachter_name ?? '—'}${portal}\n\nIhr Claimondo-Team`

    case 'erinnerung_24h':
      return `Hallo ${name}, zur Erinnerung: Morgen kommt Ihr Gutachter ${ctx.gutachter_name ?? ''} zu Ihrem Termin${ctx.termin_uhrzeit ? ` um ${ctx.termin_uhrzeit} Uhr` : ''}. Bitte halten Sie Ihr Fahrzeug bereit.${portal}\n\nIhr Claimondo-Team`

    case 'erinnerung_2h':
      return `Hallo ${name}, in 2 Stunden ist Ihr Gutachter ${ctx.gutachter_name ?? ''} bei Ihnen. Bitte stellen Sie sicher, dass Ihr Fahrzeug zugaenglich ist.${portal}\n\nIhr Claimondo-Team`

    case 'nach_gutachten':
      return `Hallo ${name}, das Gutachten fuer Ihr Fahrzeug wurde erstellt und wird jetzt an unsere Partnerkanzlei uebergeben. Wir halten Sie auf dem Laufenden.${portal}\n\nIhr Claimondo-Team`

    case 'nach_qc_freigabe':
      return `Hallo ${name}, Ihre Akte wurde geprueft und an unsere Partnerkanzlei uebergeben. Die Kanzlei wird jetzt Ihre Ansprueche gegenueber der Versicherung geltend machen.${portal}\n\nIhr Claimondo-Team`

    case 'nach_anspruchsschreiben':
      return `Hallo ${name}, das Anspruchsschreiben wurde an die gegnerische Versicherung gesendet. Die Versicherung hat 14 Tage Zeit zu reagieren. Wir informieren Sie ueber jeden Fortschritt.${portal}\n\nIhr Claimondo-Team`

    case 'nach_regulierung':
      return `Hallo ${name}, gute Nachrichten! Die Versicherung hat die Regulierung Ihres Schadens angekuendigt. Die Auszahlung wird in Kuerze erfolgen.${portal}\n\nIhr Claimondo-Team`

    case 'nach_zahlung':
      return `Hallo ${name}, die Zahlung${ctx.betrag ? ` in Hoehe von ${ctx.betrag}` : ''} ist eingegangen! Die Abrechnung folgt in Kuerze. Vielen Dank fuer Ihr Vertrauen.${portal}\n\nIhr Claimondo-Team`

    case 'nach_abschluss':
      return `Hallo ${name}, Ihr Fall ${ctx.fall_nummer ?? ''} wurde erfolgreich abgeschlossen! Wir freuen uns, dass wir Ihnen helfen konnten.\n\nWenn Sie zufrieden waren, wuerden wir uns ueber eine Google-Bewertung freuen: https://g.page/claimondo/review\n\nIhr Claimondo-Team`

    case 'eskalation_vs03':
      return `Hallo ${name}, wir haben die gegnerische Versicherung erneut kontaktiert, da die 14-Tage-Frist abgelaufen ist. Wir halten Sie auf dem Laufenden.${portal}\n\nIhr Claimondo-Team`

    case 'eskalation_vs05':
      return `Hallo ${name}, die Versicherung hat auf unsere Anfragen nicht reagiert. Eine Mahnung mit Verzugszinsen wurde verschickt. Wir setzen alle Hebel in Bewegung.${portal}\n\nIhr Claimondo-Team`

    case 'eskalation_vs06':
      return `Hallo ${name}, Ihr Kundenbetreuer wird Sie in Kuerze anrufen, um die naechsten Schritte mit Ihnen zu besprechen.${portal}\n\nIhr Claimondo-Team`

    case 'zahlung_teilweise':
      return `Hallo ${name}, wir haben eine Teilzahlung der Versicherung erhalten. Leider wurden einige Positionen gekuerzt. Ihr Kundenbetreuer ${ctx.kb_name ?? ''} wird Sie in Kuerze anrufen um die naechsten Schritte zu besprechen.${portal}\n\nIhr Claimondo-Team`

    case 'kuerzung_ruege':
      return `Hallo ${name}, die Versicherung hat Ihren Anspruch um ${ctx.kuerzung_betrag ?? '—'} gekuerzt. Wir akzeptieren das nicht und haben unsere Partnerkanzlei beauftragt ein Ruegeschreiben zu verfassen. Sie muessen nichts weiter tun - wir kaempfen fuer Ihr Recht.${portal}\n\nIhr Claimondo-Team`

    case 'kuerzung_akzeptiert':
      return `Hallo ${name}, nach Pruefung der Zahlung der Versicherung wird Ihr Fall jetzt mit dem eingegangenen Betrag von ${ctx.betrag ?? '—'} abgerechnet. Die Auszahlung erfolgt in den naechsten 2-5 Werktagen.${portal}\n\nIhr Claimondo-Team`

    case 'auszahlung':
      return `Hallo ${name}, die Auszahlung in Hoehe von ${ctx.betrag ?? '—'} wurde veranlasst. Der Betrag sollte innerhalb von 2-3 Werktagen auf Ihrem Konto eingehen.${portal}\n\nIhr Claimondo-Team`

    case 'dokument_fehlt':
      return `Hallo ${name}, fuer Ihren Fall fehlt noch: ${ctx.dokument_name ?? 'ein Dokument'}. Bitte laden Sie es in Ihrem Portal hoch oder senden Sie es hier per WhatsApp.${portal}\n\nIhr Claimondo-Team`

    case 'termin_vereinbart_kb':
      return `Hallo ${name}, Ihr Kundenbetreuer ${ctx.kb_name ?? ''} hat einen Termin mit Ihnen vereinbart: ${ctx.termin_typ === 'video-call' ? 'Video-Call' : 'Telefonat'} am ${ctx.termin_datum ?? '—'} um ${ctx.termin_uhrzeit ?? '—'}.${ctx.meet_link ? `\nLink: ${ctx.meet_link}` : ''}${portal}\n\nIhr Claimondo-Team`

    case 'termin_erinnerung_kb':
      return `Hallo ${name}, zur Erinnerung: Heute um ${ctx.termin_uhrzeit ?? '—'} haben Sie einen ${ctx.termin_typ === 'video-call' ? 'Video-Call' : 'Telefonat'} mit Ihrem Kundenbetreuer ${ctx.kb_name ?? ''}.${ctx.meet_link ? `\nLink: ${ctx.meet_link}` : ''}${portal}\n\nIhr Claimondo-Team`

    case 'nachbesserung_gutachten':
      return `Hallo ${name}, bei der Pruefung Ihres Gutachtens sind kleine Nachbesserungen noetig. Wir kuemmern uns darum - Sie muessen nichts tun.${portal}\n\nIhr Claimondo-Team`

    case 'status_update':
      return `Hallo ${name}, es gibt ein Update zu Ihrem Fall: ${ctx.status_text ?? 'Status geaendert'}. Bei Fragen koennen Sie uns jederzeit hier antworten.${portal}\n\nIhr Claimondo-Team`
  }
}

function titelFuerTyp(typ: NachrichtTyp): string {
  const map: Record<NachrichtTyp, string> = {
    nach_sa_unterschrift: 'Unterlagen eingegangen',
    nach_gutachter_dispatch: 'Gutachter beauftragt',
    nach_terminbestaetigung: 'Termin bestaetigt',
    erinnerung_24h: 'Terminerinnerung (24h)',
    erinnerung_2h: 'Terminerinnerung (2h)',
    nach_gutachten: 'Gutachten erstellt',
    nach_qc_freigabe: 'Akte an Kanzlei uebergeben',
    nach_anspruchsschreiben: 'Anspruchsschreiben gesendet',
    nach_regulierung: 'Regulierung angekuendigt',
    nach_zahlung: 'Zahlung eingegangen',
    nach_abschluss: 'Fall abgeschlossen',
    eskalation_vs03: 'Eskalation: Frist abgelaufen',
    eskalation_vs05: 'Eskalation: Mahnung + Verzugszinsen',
    eskalation_vs06: 'Eskalation: Kundenrueckruf',
    zahlung_teilweise: 'Teilzahlung eingegangen',
    kuerzung_ruege: 'Kürzung - Rügeschreiben',
    kuerzung_akzeptiert: 'Kürzung akzeptiert',
    auszahlung: 'Auszahlung veranlasst',
    dokument_fehlt: 'Dokument fehlt',
    termin_vereinbart_kb: 'Termin vereinbart',
    termin_erinnerung_kb: 'Termin-Erinnerung',
    nachbesserung_gutachten: 'Nachbesserung nötig',
    status_update: 'Status-Update',
  }
  return map[typ]
}

/**
 * Send a manual WhatsApp message via Twilio (replaces wa.me links).
 */
export async function sendManualWhatsApp(telefon: string, message: string, fallId?: string): Promise<{ success: boolean; error?: string }> {
  if (!telefon) return { success: false, error: 'Keine Telefonnummer' }
  const result = await sendWhatsApp(telefon, message)
  console.log(`[whatsapp:manual] ${telefon} → success=${result.success}${result.error ? ` error=${result.error}` : ''}`)

  // Store in nachrichten if fall context
  if (fallId) {
    try {
      const supabase = createAdminClient()
      await supabase.from('nachrichten').insert({
        fall_id: fallId,
        kanal: 'whatsapp',
        sender_id: null,
        sender_rolle: 'admin',
        nachricht: message,
        hat_anhang: false,
      })
      await supabase.from('timeline').insert({
        fall_id: fallId,
        typ: 'whatsapp',
        titel: 'WhatsApp manuell gesendet',
        beschreibung: `An ${telefon}: ${message.slice(0, 100)}...`,
      })
    } catch { /* non-critical */ }
  }

  return result
}

/**
 * Sends a WhatsApp status notification to the customer.
 * For now: stores the message in the nachrichten table (kanal='whatsapp').
 * WhatsApp Business API will be connected later.
 */
export async function sendStatusWhatsApp(
  fallId: string,
  nachrichtTyp: NachrichtTyp,
  extraCtx?: Partial<FallContext>,
) {
  try {
    const supabase = createAdminClient()

    // Load fall data
    const { data: fall } = await supabase
      .from('faelle')
      .select('id, fall_nummer, lead_id, sv_id, kunde_id, regulierung_betrag')
      .eq('id', fallId)
      .single()

    if (!fall) return

    // Get customer name + phone from lead or profile
    let vorname = ''
    let nachname = ''
    let telefon: string | null = null

    if (fall.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('vorname, nachname, telefon')
        .eq('id', fall.lead_id)
        .single()
      if (lead) {
        vorname = lead.vorname ?? ''
        nachname = lead.nachname ?? ''
        telefon = lead.telefon
      }
    }

    // Fallback: try profile via kunde_id
    if (!telefon && fall.kunde_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('vorname, nachname, telefon')
        .eq('id', fall.kunde_id)
        .single()
      if (profile) {
        vorname = vorname || profile.vorname || ''
        nachname = nachname || profile.nachname || ''
        telefon = profile.telefon
      }
    }

    // Get gutachter name if needed
    let gutachterName: string | undefined
    if (fall.sv_id) {
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('profile_id')
        .eq('id', fall.sv_id)
        .single()
      if (sv?.profile_id) {
        const { data: svProfile } = await supabase
          .from('profiles')
          .select('vorname, nachname')
          .eq('id', sv.profile_id)
          .single()
        if (svProfile) {
          gutachterName = [svProfile.vorname, svProfile.nachname].filter(Boolean).join(' ')
        }
      }
    }

    // Build portal link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://claimondo.de')
    const portalLink = `${appUrl}/kunde`

    // Build context
    const ctx: FallContext = {
      fall_nummer: fall.fall_nummer,
      vorname,
      nachname,
      gutachter_name: gutachterName,
      portal_link: portalLink,
      betrag: fall.regulierung_betrag
        ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(fall.regulierung_betrag))
        : undefined,
      ...extraCtx,
    }

    const nachricht = buildNachricht(nachrichtTyp, ctx)
    const titel = titelFuerTyp(nachrichtTyp)

    // Store in nachrichten table
    await supabase.from('nachrichten').insert({
      fall_id: fallId,
      kanal: 'whatsapp',
      sender_id: null,
      sender_rolle: 'system',
      nachricht,
      hat_anhang: false,
    })

    // Timeline entry
    await supabase.from('timeline').insert({
      fall_id: fallId,
      typ: 'whatsapp',
      titel: `WhatsApp: ${titel}`,
      beschreibung: telefon
        ? `Nachricht an ${telefon} gesendet.`
        : 'Keine Telefonnummer hinterlegt – Nachricht nur protokolliert.',
    })

    // Send via Twilio WhatsApp
    if (telefon) {
      await sendWhatsApp(telefon, nachricht).catch(err => {
        console.error(`[whatsapp] Twilio send failed:`, err)
        // Timeline vermerk
        supabase.from('timeline').insert({
          fall_id: fallId, typ: 'system',
          titel: 'WhatsApp-Versand fehlgeschlagen',
          beschreibung: `Nachricht an ${telefon} konnte nicht gesendet werden.`,
        }).then(() => {})
      })
    }

    // Set google_review_gesendet flag on case close
    if (nachrichtTyp === 'nach_abschluss') {
      await supabase
        .from('faelle')
        .update({ google_review_gesendet: true })
        .eq('id', fallId)
    }
  } catch (err) {
    console.error(`[whatsapp] Failed to send ${nachrichtTyp} for fall ${fallId}:`, err)
  }
}
