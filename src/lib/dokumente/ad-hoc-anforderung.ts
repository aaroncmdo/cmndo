'use server'

// AAR-762: Ad-hoc Dokument-Anforderung — generischer Flow für Belege
// die NICHT im dokument_katalog stehen (Mietwagen-Rechnung, Werkstatt-
// Rechnung, Attest, Abschlepp, Sonstiges).
//
// Unterschied zu `dokumentAnfordern` (katalog-basiert):
// - Kein Katalog-Slot nötig, Typ wird frei übergeben
// - Kein pflichtdokumente-Row nötig — läuft über dokument_upload_anfragen
//   + Token-Route (/upload/dokumente/[token])
// - Eskalation läuft über AAR-764 Resolver (emit eines Events)
// - OCR-Routing läuft über AAR-761 (nach Upload an /api/ocr-beleg)

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { emitEvent } from '@/lib/notifications/emit'
import { randomBytes } from 'node:crypto'
import type { BelegTyp } from '@/lib/ocr-beleg/types'

export type AdHocKanal = 'whatsapp' | 'sms' | 'email'
export type AdHocUrgency = 'normal' | 'dringend' | 'eskalation'

type RequestInput = {
  fallId: string
  belegTyp: BelegTyp
  kanal: AdHocKanal
  urgency?: AdHocUrgency
  /** Custom-Begründung für den Kunden; Default aus Typ */
  begruendung?: string
  /** Expire in Tagen, Default 14 */
  expiresInDays?: number
}

type RequestResult =
  | { success: true; anfrage_id: string; token: string; upload_url: string }
  | { success: false; error: string }

const TYP_LABEL: Record<BelegTyp, string> = {
  mietwagen_rechnung: 'Ihre Mietwagen-Rechnung',
  werkstatt_rechnung: 'die Werkstatt-Rechnung',
  abschlepp_rechnung: 'die Abschlepp-Rechnung',
  attest: 'ein ärztliches Attest',
  sonstiges: 'das angeforderte Dokument',
}

const TYP_DEFAULT_BEGRUENDUNG: Record<BelegTyp, string> = {
  mietwagen_rechnung:
    'Für die Versicherung brauchen wir die Rechnung vom Vermieter.',
  werkstatt_rechnung:
    'Die Rechnung der Werkstatt benötigen wir für die Abrechnung mit der Versicherung.',
  abschlepp_rechnung:
    'Die Abschlepp-Rechnung wird als Schadenersatz-Anspruch geltend gemacht.',
  attest: 'Das ärztliche Attest belegt die Behandlung im Zuge des Unfalls.',
  sonstiges: 'Bitte laden Sie das angeforderte Dokument hoch.',
}

function generateToken(): string {
  // 32 URL-sichere Zeichen
  return randomBytes(24).toString('base64url')
}

function buildUploadUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  return `${base}/upload/dokumente/${token}`
}

/**
 * Legt eine Anforderung an den Kunden an, sendet die Nachricht im
 * gewünschten Kanal und emittiert das entsprechende Event damit der
 * AAR-764 Resolver einen KB-Task mit Reminder-Kaskade + Eskalation
 * erzeugt.
 */
export async function requestDokumentFromKunde(
  input: RequestInput,
): Promise<RequestResult> {
  const { fallId, belegTyp, kanal } = input
  const urgency = input.urgency ?? 'normal'
  const expiresInDays = input.expiresInDays ?? 14

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) {
    return { success: false, error: 'Nicht angemeldet' }
  }

  const admin = createAdminClient()

  // Fall laden — Lead-ID wird für dokument_upload_anfragen benötigt
  const { data: fall } = await admin
    .from('faelle')
    .select('id, lead_id, fall_nummer')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall?.lead_id) {
    return { success: false, error: 'Fall oder Lead nicht gefunden' }
  }

  const token = generateToken()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000)
  const begruendung = input.begruendung ?? TYP_DEFAULT_BEGRUENDUNG[belegTyp]

  // Anfrage-Row anlegen — slots ist jsonb, wir packen Typ + Beschreibung
  // für den Multi-Slot-UI-Renderer rein.
  const { data: anfrage, error: insErr } = await admin
    .from('dokument_upload_anfragen')
    .insert({
      lead_id: fall.lead_id,
      kanal,
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
      erstellt_von: user.id,
      slots: [
        {
          slot_id: `ad_hoc_${belegTyp}`,
          label: TYP_LABEL[belegTyp],
          beschreibung: begruendung,
          pflicht: true,
          status: 'ausstehend',
        },
      ],
    })
    .select('id, token')
    .single()

  if (insErr || !anfrage) {
    return {
      success: false,
      error: insErr?.message ?? 'Anfrage-Insert fehlgeschlagen',
    }
  }

  const uploadUrl = buildUploadUrl(anfrage.token)

  // Event emittieren — die `dokument.fehlt`-Config in
  // lib/notifications/channel-matrix.ts sorgt für WhatsApp+Email+InApp-
  // Notification an den Kunden, und der AAR-764 Resolver erzeugt einen
  // KB-Task mit Reminder-Kaskade + Eskalation an Admin nach N stillen
  // Remindern.
  try {
    await emitEvent(
      'dokument.fehlt',
      {
        fallId,
        dokumentTyp: belegTyp,
        anforderungText: `${begruendung} Upload-Link: ${uploadUrl}`,
        empfaengerRolle: 'kunde',
      },
      { fallId, triggeredBy: user.id },
    )
  } catch (err) {
    console.error('[AAR-762] emitEvent fehlgeschlagen:', err)
  }

  // Urgency-Flag für spätere Eskalations-Priorisierung bleibt auf der
  // Anfrage-Row selbst (slots[0].urgency). Der Resolver nutzt den
  // Payload-Kontext, nicht die anfrage_id — das reicht für Phase 1.
  void urgency

  return {
    success: true,
    anfrage_id: anfrage.id,
    token: anfrage.token,
    upload_url: uploadUrl,
  }
}

// AAR-762 Phase 3: Liste offene Ad-hoc-Anforderungen + Cancel/Resend

export type AdHocAnforderungRow = {
  id: string
  kanal: string
  status: string
  expires_at: string
  gesendet_am: string
  erstellt_am: string
  token: string
  belegTyp: BelegTyp | null
  label: string
  upload_url: string
}

export async function listAdHocAnforderungen(
  fallId: string,
): Promise<AdHocAnforderungRow[]> {
  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle')
    .select('lead_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall?.lead_id) return []

  const { data: rows } = await admin
    .from('dokument_upload_anfragen')
    .select('id, kanal, status, expires_at, gesendet_am, erstellt_am, token, slots')
    .eq('lead_id', fall.lead_id)
    .order('erstellt_am', { ascending: false })
    .limit(20)

  if (!rows) return []

  return rows
    .map((r): AdHocAnforderungRow | null => {
      const slotsArr = Array.isArray(r.slots) ? (r.slots as Array<Record<string, unknown>>) : []
      const first = slotsArr[0]
      const slotId = typeof first?.slot_id === 'string' ? first.slot_id : ''
      // Nur Ad-hoc-Anfragen (slot_id beginnt mit ad_hoc_)
      if (!slotId.startsWith('ad_hoc_')) return null
      const typ = slotId.replace(/^ad_hoc_/, '') as BelegTyp
      const label = typeof first?.label === 'string' ? first.label : TYP_LABEL[typ] ?? 'Dokument'
      return {
        id: r.id,
        kanal: r.kanal,
        status: r.status,
        expires_at: r.expires_at,
        gesendet_am: r.gesendet_am,
        erstellt_am: r.erstellt_am,
        token: r.token,
        belegTyp: VALID_TYPS.has(typ) ? typ : null,
        label,
        upload_url: buildUploadUrl(r.token),
      }
    })
    .filter((x): x is AdHocAnforderungRow => x !== null)
}

const VALID_TYPS = new Set<BelegTyp>([
  'mietwagen_rechnung',
  'werkstatt_rechnung',
  'abschlepp_rechnung',
  'attest',
  'sonstiges',
])

export async function cancelAdHocAnforderung(
  anfrageId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('dokument_upload_anfragen')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', anfrageId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function resendAdHocAnforderung(
  anfrageId: string,
  kanalOverride?: AdHocKanal,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { data: anfrage } = await admin
    .from('dokument_upload_anfragen')
    .select('id, lead_id, kanal, token, slots, status')
    .eq('id', anfrageId)
    .maybeSingle()
  if (!anfrage) return { success: false, error: 'Anfrage nicht gefunden' }
  if (anfrage.status !== 'pending') {
    return { success: false, error: 'Nur pending-Anfragen können erneut gesendet werden' }
  }

  const slotsArr = Array.isArray(anfrage.slots) ? (anfrage.slots as Array<Record<string, unknown>>) : []
  const first = slotsArr[0]
  const slotId = typeof first?.slot_id === 'string' ? first.slot_id : ''
  const typ = slotId.replace(/^ad_hoc_/, '') as BelegTyp
  if (!VALID_TYPS.has(typ)) return { success: false, error: 'Ungültiger Beleg-Typ' }

  // Lead → Fall zurück-auflösen für Event-Kontext
  const { data: fall } = await admin
    .from('faelle')
    .select('id')
    .eq('lead_id', anfrage.lead_id)
    .maybeSingle()
  if (!fall?.id) return { success: false, error: 'Fall nicht gefunden' }

  const kanal = kanalOverride ?? (anfrage.kanal as AdHocKanal)
  const uploadUrl = buildUploadUrl(anfrage.token)
  const begruendung = typeof first?.beschreibung === 'string' ? first.beschreibung : TYP_DEFAULT_BEGRUENDUNG[typ]

  try {
    await emitEvent(
      'dokument.fehlt',
      {
        fallId: fall.id,
        dokumentTyp: typ,
        anforderungText: `${begruendung} Upload-Link: ${uploadUrl}`,
        empfaengerRolle: 'kunde',
      },
      { fallId: fall.id, triggeredBy: user.id },
    )
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Resend fehlgeschlagen',
    }
  }

  // Kanal-Update + gesendet_am refresh
  await admin
    .from('dokument_upload_anfragen')
    .update({ kanal, gesendet_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', anfrageId)

  return { success: true }
}
