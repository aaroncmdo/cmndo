'use server'

// AAR-956 WS4 — Embed-Buchungs-Kern. Step-2/3-Submit des Finder-Wizards:
//   gfa anlegen (anon, source=NULL → passt gfa_insert_public-RLS)
//   → issueCanonicalFlowLinkForAnfrage(send:false) promotet gfa→lead→flow_link → token
//   → der Wizard reicht den token an <FlowSlotStep> (Inline-Termin via Engine).
//
// WICHTIG (Aaron 11.06.): der Besichtigungsort (wo steht das Auto) wird ZUERST
// abgefragt und MUSS in die Anfrage/DB, damit die Engine den SV findet. Wir
// schreiben ihn auf gfa.schadenort_lat/lng + schadenort; issueCanonical mappt das
// auf lead.fahrzeug_standort_lat/lng → ladeMatchingFlow hat die Koordinaten →
// Engine-Matching ohne ort_abfragen-Umweg.
//
// KEIN /api/anfrage-from-lp (cross-origin/origin-gated, Monikas Revier) — der
// Embed ist same-origin und nutzt den nativen Anon-Pfad.

import { erstelleGutachterFinderAnfrage } from '@/lib/actions/gutachter-finder-actions'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'

export type EmbedBuchungInput = {
  vorname: string
  nachname: string
  telefon: string
  email: string
  schadentyp: string
  ort: { adresse: string; lat: number; lng: number }
}

export async function starteEmbedBuchung(
  input: EmbedBuchungInput,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  // 1) gfa (Anfrage) anlegen — Ort landet auf schadenort_* (→ lead.fahrzeug_standort_*).
  const gfa = await erstelleGutachterFinderAnfrage({
    vorname: input.vorname,
    nachname: input.nachname,
    email: input.email,
    telefon: input.telefon,
    schadentyp: input.schadentyp,
    schadenort: input.ort.adresse,
    schadenort_lat: input.ort.lat,
    schadenort_lng: input.ort.lng,
  })
  if (!gfa.ok) return { ok: false, error: gfa.error }

  // 2) gfa → lead → flow_link (Service-Role, idempotent). send:true = Flowlink-WA an den
  //    Kunden raus (Aaron 11.06.: beim Absenden des Kontaktformulars muss die WhatsApp raus)
  //    + Self-Service-Einstieg. Der Nutzer bucht zusätzlich inline weiter (FlowSlotStep).
  const issued = await issueCanonicalFlowLinkForAnfrage(gfa.id, { send: true })
  if (!issued.ok) return { ok: false, error: issued.error }

  return { ok: true, token: issued.token }
}

/**
 * AAR-956 WS5: Bestaetigungs-WhatsApp NACH der Termin-Reservierung (Aaron 12.06.:
 * "auch eine bei der Termin-Reservierung"). Getriggert aus FinderWizard.onGebucht,
 * sobald <FlowSlotStep> einen Slot reserviert hat. Resolved flow_links-Token → Lead
 * → telefon/name und schickt zwei Nachrichten:
 *   - an den Kunden: Termin-Bestaetigung ("Ihr Termin ist reserviert …")
 *   - ans Team: Reservierungs-Notiz (notifyTeamWhatsApp, dieselben Empfaenger wie Leads)
 *
 * Fire-and-forget / non-critical: der Termin ist zu diesem Zeitpunkt bereits race-safe
 * in der DB reserviert (bucheTerminFlow via Engine) — ein Baileys-Fail aendert daran
 * nichts und wird nur geloggt. KEIN Eingriff in bucheTerminFlow (geteilt mit dem
 * echten /flow-Pfad); der Reservierungs-Send haengt embed-seitig am onGebucht-Callback.
 */
export async function sendeEmbedTerminBestaetigung(input: {
  token: string
  svVorname: string
  startIso: string
}): Promise<void> {
  try {
    if (!input.token || !input.startIso) return
    const admin = createAdminClient()

    // flow_links-Token → Lead (service_role; identisch zu resolveFlowLead im /flow-Pfad).
    const { data: flowLink } = await admin
      .from('flow_links')
      .select('lead_id')
      .eq('token', input.token)
      .maybeSingle()
    const leadId = (flowLink?.lead_id as string | null) ?? null
    if (!leadId) return

    const { data: lead } = await admin
      .from('leads')
      .select('vorname, nachname, telefon')
      .eq('id', leadId)
      .maybeSingle()
    if (!lead) return

    const vorname = ((lead.vorname as string | null) ?? '').trim()
    const name =
      [vorname, ((lead.nachname as string | null) ?? '').trim()].filter(Boolean).join(' ').trim() || 'Kunde'
    const telefon = ((lead.telefon as string | null) ?? '').trim()

    // Server laeuft UTC → explizite Berlin-TZ, sonst 2h-Versatz. Matcht das Format
    // der On-Screen-"Termin reserviert"-Bestaetigung im Wizard.
    const wann = new Date(input.startIso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    // ── an den Kunden ──
    if (telefon.length >= 5) {
      const kundeText = [
        '✅ Ihr Termin ist reserviert',
        '',
        `Hallo ${vorname || name},`,
        `Ihr Kfz-Gutachter ${input.svVorname} ist für ${wann} Uhr reserviert.`,
        '',
        'Wir bestätigen Ihren Termin in Kürze. Bei Rückfragen antworten Sie einfach auf diese Nachricht.',
        '',
        'Ihr Claimondo-Team',
      ].join('\n')
      const r = await sendWhatsAppText(telefon, kundeText)
      if (!r.ok) console.error('[embed-termin-bestaetigung] Kunde-WA fehlgeschlagen:', r.code, r.error)
    }

    // ── ans Team ──
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    const teamText = [
      '📅 Neuer Termin reserviert (Gutachter-Finder)',
      '',
      `👤 ${name}`,
      telefon ? `📞 ${telefon}` : null,
      `🔧 SV: ${input.svVorname}`,
      `🕐 ${wann} Uhr`,
      '',
      `${base}/dispatch/leads/${leadId}`,
    ]
      .filter(Boolean)
      .join('\n')
    await notifyTeamWhatsApp(teamText)
  } catch (err) {
    console.error('[embed-termin-bestaetigung] fehlgeschlagen (nicht kritisch):', (err as Error).message)
  }
}
