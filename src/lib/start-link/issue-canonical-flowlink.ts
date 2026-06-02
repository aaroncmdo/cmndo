import 'server-only'

// AAR-956 Phase A · Task 3 — anon kanonischer Issue-Pfad.
//
// Verwandelt eine Monika/Self-Service-Anfrage (gutachter_finder_anfragen) konversion-first
// in EINEN lead-gekeyten FlowLink:
//   gfa → Lead (kanonisch via createLead, zugewiesen_an=Dispatcher round-robin)
//       → EIN flow_links-Eintrag (lead_id)
//       → einfacher Initial-Link-Versand (WA bevorzugt, Email-Fallback)
//
// Das ist die Auflösung des „Doppels" (AAR-956): KEIN /anfrage-self_service_token mehr —
// der Kunde bekommt den kanonischen /flow/[token]-Link (flow_links.lead_id).
//
// service_role (createAdminClient), anon-aufrufbar (von der /start-Route nach HMAC-Verify).
// Idempotent: schon konvertiert + gültiger flow_link → reuse (kein zweiter Lead/Token).
//
// Versand (Wrinkle 1, stream8b): NICHT das flowlink_versand-WA-Template (braucht SV-Name
// + Termin = 6 Placeholder, die ein frischer Self-Service-Lead nicht hat). Stattdessen ein
// einfacher Plain-Link (nur URL) — das Termin-Template kommt erst nach dem /flow-Slot-Step.
//
// Picked-SV (§3a): leads hat KEINE zugeordneter_sv_id-Spalte. Der gepickte SV bleibt auf
// der gfa und ist via gfa.konvertiert_zu_lead_id ↔ lead erreichbar. Das datengetriebene
// /flow (cdd8f4f3) liest den Picked-SV über diesen Back-Reference.

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { pickRoundRobinDispatcher } from './pick-dispatcher'
import { checkAndCacheAvailability } from '@/lib/whatsapp/availability'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendEmail } from '@/lib/email/google/client'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
const FLOWLINK_TTL_MS = 72 * 60 * 60 * 1000

export type IssueKanal = 'whatsapp' | 'email' | 'none'
export type IssueCanonicalResult =
  | { ok: true; token: string; leadId: string; kanal: IssueKanal; wiederverwendet: boolean }
  | { ok: false; error: string }

// leads_schadentyp_check erlaubt nur diese 5 Werte. gfa.schadentyp ist Freitext
// (Marketing-Wizard-Labels wie "Parkschaden"/"Auffahrunfall") → contains-Mapping + Clamp.
const SCHADENTYP_ALLOWED = new Set(['spurwechsel', 'auffahrunfall', 'vorfahrtsverletzung', 'parkplatz', 'sonstiges'])
function clampSchadentyp(raw: string | null): string {
  const v = (raw ?? '').toLowerCase().trim()
  if (SCHADENTYP_ALLOWED.has(v)) return v
  if (v.includes('auffahr')) return 'auffahrunfall'
  if (v.includes('park')) return 'parkplatz'
  if (v.includes('spur')) return 'spurwechsel'
  if (v.includes('vorfahr')) return 'vorfahrtsverletzung'
  return 'sonstiges'
}

function buildText(vorname: string | null, url: string): string {
  const greet = vorname ? `Hallo ${vorname}` : 'Hallo'
  return [
    `${greet}, hier geht es zu Ihrer Schadensregulierung bei Claimondo.`,
    '',
    `Ihr persönlicher Link (gültig 72 Stunden):`,
    url,
    '',
    'Mit wenigen Klicks prüfen wir Ihren Fall, Sie buchen einen Gutachter-Termin und unterschreiben die Vollmacht.',
  ].join('\n')
}

function buildHtml(vorname: string | null, url: string): string {
  const greet = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    `<p>${greet},</p>` +
    `<p>hier geht es zu Ihrer Schadensregulierung bei Claimondo. Mit wenigen Klicks prüfen wir Ihren Fall, Sie buchen einen Gutachter-Termin und unterschreiben die Vollmacht.</p>` +
    `<p><a href="${url}">Jetzt fortfahren</a> (Link gültig 72 Stunden)</p>` +
    `<p style="color:#888;font-size:12px">${url}</p>`
  )
}

async function sendeInitialLink(opts: {
  anfrageId: string
  telefon: string | null
  email: string | null
  vorname: string | null
  url: string
}): Promise<IssueKanal> {
  const { anfrageId, telefon, email, vorname, url } = opts
  // WhatsApp bevorzugt — nur wenn laut 'gfa'-Cache/Lookup verfügbar.
  if (telefon && telefon.trim().length >= 6) {
    try {
      const wa = await checkAndCacheAvailability('gfa', anfrageId, telefon)
      if (wa.verfuegbar === true) {
        const sent = await sendWhatsAppText(telefon, buildText(vorname, url))
        if (sent.ok) return 'whatsapp'
      }
    } catch (err) {
      console.error('[issueCanonicalFlowLink] WA-Send fehlgeschlagen:', err)
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
        template: 'canonical_flowlink',
      })
      return 'email'
    } catch (err) {
      console.error('[issueCanonicalFlowLink] Email-Send fehlgeschlagen:', err)
    }
  }
  return 'none'
}

/**
 * Konversion-first: gfa-Anfrage → Lead → EIN kanonischer flow_links-FlowLink → Versand.
 * Idempotent. service_role; anon-aufrufbar nach HMAC-Verify (/start-Route).
 */
export async function issueCanonicalFlowLinkForAnfrage(anfrageId: string): Promise<IssueCanonicalResult> {
  if (!anfrageId) return { ok: false, error: 'anfrage_id fehlt' }
  const admin = createAdminClient()

  // gfa laden (select * — eine Zeile, billig; self_service_token-Spalten egal).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gfaRow, error: gfaErr } = await (admin as any)
    .from('gutachter_finder_anfragen')
    .select('*')
    .eq('id', anfrageId)
    .maybeSingle()
  if (gfaErr || !gfaRow) return { ok: false, error: 'Anfrage nicht gefunden' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gfa = gfaRow as Record<string, any>

  // 1. Lead (idempotent): schon konvertiert → bestehenden Lead nutzen.
  let leadId = (gfa.konvertiert_zu_lead_id as string | null) ?? null
  if (!leadId) {
    const dispatcherId = await pickRoundRobinDispatcher(admin)
    const created = await createLead(
      admin,
      {
        source_channel: (gfa.source as string | null) ?? 'self_service',
        status: 'neu',
        vorname: (gfa.vorname as string | null) ?? null,
        nachname: (gfa.nachname as string | null) ?? null,
        telefon: (gfa.telefon as string | null) ?? null,
        email: (gfa.email as string | null) ?? null,
      },
      {
        zugewiesen_an: dispatcherId,
        qualifizierungs_phase: 'erstkontakt',
        schadentyp: clampSchadentyp(gfa.schadentyp as string | null),
        schadens_hergang:
          (gfa.schadens_kurzbeschreibung as string | null) ??
          (gfa.schadentyp as string | null) ??
          (gfa.schadenort as string | null) ??
          null,
        fahrzeug_standort_lat: (gfa.schadenort_lat as number | null) ?? null,
        fahrzeug_standort_lng: (gfa.schadenort_lng as number | null) ?? null,
        fahrzeug_standort_adresse:
          (gfa.besichtigungsort_adresse as string | null) ??
          (gfa.schadenort as string | null) ??
          null,
        fin: (gfa.fin_vin as string | null) ?? null,
        kennzeichen: (gfa.kennzeichen as string | null) ?? null,
        hsn: (gfa.hsn as string | null) ?? null,
        tsn: (gfa.tsn as string | null) ?? null,
        fahrzeug_hersteller: (gfa.fahrzeug_hersteller as string | null) ?? null,
        fahrzeug_modell: (gfa.fahrzeug_modell as string | null) ?? null,
        fahrzeug_baujahr: (gfa.fahrzeug_baujahr as number | null) ?? null,
        wunschtermin: (gfa.wunschtermin as string | null) ?? null,
        ga_client_id: (gfa.ga_client_id as string | null) ?? null,
      },
    )
    if (!created.ok) return { ok: false, error: created.error }
    leadId = created.leadId

    // gfa-Marker (read-only Capture): Verweis + Status. Best-effort.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('gutachter_finder_anfragen')
      .update({
        konvertiert_zu_lead_id: leadId,
        konvertiert_am: new Date().toISOString(),
        status: 'konvertiert',
      })
      .eq('id', anfrageId)
  }

  // 2. flow_links (idempotent): gültigen Link wiederverwenden, sonst neuen minten.
  //    token = DB-Default (wie sendFlowLinkMultiChannel — kein Token mitgeben).
  let token: string | null = null
  let wiederverwendet = false
  const { data: vorhanden } = await admin
    .from('flow_links')
    .select('token, expires_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (vorhanden?.token && vorhanden.expires_at && new Date(vorhanden.expires_at).getTime() > Date.now()) {
    token = vorhanden.token
    wiederverwendet = true
  } else {
    const { data: fl, error: flErr } = await admin
      .from('flow_links')
      .insert({
        lead_id: leadId,
        expires_at: new Date(Date.now() + FLOWLINK_TTL_MS).toISOString(),
        service_typ: (gfa.service_typ as string | null) ?? 'komplett',
        sprache: (gfa.sprache as string | null) ?? 'de',
      })
      .select('token')
      .single()
    if (flErr || !fl?.token) return { ok: false, error: flErr?.message ?? 'FlowLink-Anlage fehlgeschlagen' }
    token = fl.token
  }

  if (!token) return { ok: false, error: 'FlowLink-Token konnte nicht ermittelt werden.' }

  // 3. Einfacher Initial-Link-Versand (best-effort, non-fatal).
  const url = `${APP_URL}/flow/${token}`
  const kanal = await sendeInitialLink({
    anfrageId,
    telefon: (gfa.telefon as string | null) ?? null,
    email: (gfa.email as string | null) ?? null,
    vorname: (gfa.vorname as string | null) ?? null,
    url,
  })

  return { ok: true, token, leadId, kanal, wiederverwendet }
}
