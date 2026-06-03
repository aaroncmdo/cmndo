import 'server-only'

// AAR-940 Phase 1: Self-Service-FlowLink-Ausgabe (server-seitig, service_role).
// Setzt self_service_token + _expires_at auf der Anfrage und versendet den Link
// /anfrage/[token] — WhatsApp bevorzugt (Entity 'gfa'), Email-Fallback. KEIN
// neuer anon-Schreibpfad. Idempotent: gueltiger Token wird wiederverwendet.
//
// Send-Reuse: checkAndCacheAvailability('gfa') + sendWhatsAppText + sendEmail
// (NICHT dispatchMagicLink — das ist lead-gekeyt; hier existiert noch kein Lead).

import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAndCacheAvailability } from '@/lib/whatsapp/availability'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendEmail } from '@/lib/email/google/client'
import { istSelfServiceFaehig, type SelfServiceAnfrage } from './eligibility'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
const TOKEN_TTL_MS = 72 * 60 * 60 * 1000

export type IssueKanal = 'whatsapp' | 'email' | 'none'
export type IssueResult =
  | { ok: true; token: string; kanal: IssueKanal; wiederverwendet: boolean }
  | { ok: false; error: string }

type GfaRow = SelfServiceAnfrage & {
  id: string
  vorname: string | null
  self_service_token: string | null
  self_service_token_expires_at: string | null
}

function buildText(vorname: string | null, url: string): string {
  const greet = vorname ? `Hallo ${vorname}` : 'Hallo'
  return [
    `${greet}, hier geht es zu Ihrer Schadensregulierung bei Claimondo.`,
    '',
    `Ihr persönlicher Link (gültig 72 Stunden):`,
    url,
    '',
    'Mit wenigen Klicks prüfen wir Ihren Fall, Sie unterschreiben die Vollmacht und buchen direkt einen Gutachter-Termin.',
  ].join('\n')
}

function buildHtml(vorname: string | null, url: string): string {
  const greet = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    `<p>${greet},</p>` +
    `<p>hier geht es zu Ihrer Schadensregulierung bei Claimondo. Mit wenigen Klicks prüfen wir Ihren Fall, Sie unterschreiben die Vollmacht und buchen direkt einen Gutachter-Termin.</p>` +
    `<p><a href="${url}">Jetzt fortfahren</a> (Link gültig 72 Stunden)</p>` +
    `<p style="color:#888;font-size:12px">${url}</p>`
  )
}

async function sendeLink(opts: {
  anfrageId: string
  telefon: string | null
  email: string | null
  vorname: string | null
  url: string
}): Promise<IssueKanal> {
  const { anfrageId, telefon, email, vorname, url } = opts

  // WhatsApp bevorzugt — nur wenn laut 'gfa'-Cache/Lookup verfuegbar.
  if (telefon && telefon.trim().length >= 6) {
    try {
      const wa = await checkAndCacheAvailability('gfa', anfrageId, telefon)
      if (wa.verfuegbar === true) {
        const sent = await sendWhatsAppText(telefon, buildText(vorname, url))
        if (sent.ok) return 'whatsapp'
      }
    } catch (err) {
      console.error('[issueSelfServiceFlowLink] WA-Send fehlgeschlagen:', err)
    }
  }

  // Email-Fallback.
  if (email && email.includes('@')) {
    try {
      await sendEmail({
        to: email,
        subject: 'Ihre Schadensregulierung bei Claimondo',
        html: buildHtml(vorname, url),
        empfaengerTyp: 'kunde',
        template: 'self_service_flowlink',
      })
      return 'email'
    } catch (err) {
      console.error('[issueSelfServiceFlowLink] Email-Send fehlgeschlagen:', err)
    }
  }

  return 'none'
}

/**
 * Phase 1: stellt der Anfrage einen Self-Service-FlowLink aus (Token + Expiry
 * auf der GFA) und versendet ihn (WA bevorzugt, Email-Fallback). service_role-
 * only. Idempotent: ein noch gueltiger Token wird wiederverwendet (kein zweiter
 * erzeugt); der Versand laeuft bei jedem Aufruf (Re-Trigger erlaubt).
 */
export async function issueSelfServiceFlowLink(anfrageId: string): Promise<IssueResult> {
  if (!anfrageId) return { ok: false, error: 'anfrage_id fehlt' }
  const admin = createAdminClient()

  // self_service_token-Spalten sind (noch) nicht in database.types → Cast wie slots.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('gutachter_finder_anfragen')
    .select(
      'id, source, telefon, email, vorname, status, konvertiert_zu_lead_id, self_service_token, self_service_token_expires_at',
    )
    .eq('id', anfrageId)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'Anfrage nicht gefunden' }
  const anfrage = data as GfaRow

  if (!istSelfServiceFaehig(anfrage)) {
    return { ok: false, error: 'Anfrage nicht self-service-faehig' }
  }

  // Idempotenz: gueltigen Token wiederverwenden.
  const tokenGueltig =
    !!anfrage.self_service_token &&
    !!anfrage.self_service_token_expires_at &&
    new Date(anfrage.self_service_token_expires_at).getTime() > Date.now()

  let token: string
  let wiederverwendet = false
  if (tokenGueltig && anfrage.self_service_token) {
    token = anfrage.self_service_token
    wiederverwendet = true
  } else {
    token = randomBytes(16).toString('hex')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (admin as any)
      .from('gutachter_finder_anfragen')
      .update({
        self_service_token: token,
        self_service_token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      })
      .eq('id', anfrageId)
    if (updErr) return { ok: false, error: updErr.message }
  }

  const url = `${APP_URL}/anfrage/${token}`
  const kanal = await sendeLink({
    anfrageId,
    telefon: anfrage.telefon,
    email: anfrage.email,
    vorname: anfrage.vorname,
    url,
  })

  return { ok: true, token, kanal, wiederverwendet }
}
