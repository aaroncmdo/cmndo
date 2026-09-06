'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'

// Lead-Server-Action für autounfall.io /gutachter-finden. EINZIGE Supabase-
// Schreibung im ganzen au.io-Port. Pfad: anfragen-Insert (Inbox/Audit, mit
// dsgvo_zustimmung_am) → atomic RPC convert_anfrage_zu_lead → in-app Dispatcher-
// Benachrichtigung. Muster 1:1 aus claimondo-v2 submitKfzgutachterLead.
//
// STANDALONE: kein Gmail/Baileys (au.io hat die Infra nicht — Aaron 2026-05-24:
// "nur in-app"). Der Lead landet trotzdem im geteilten Dispatch-Portal; die
// Email/WA-Notification ist ein WP-8-Follow-up.
//
// Result-Object statt throw (AGENTS §Server-Actions). Bei Convert-Failure bleibt
// die Anfrage persistent (Audit-Trail) + Soft-Error mit anfrageId.

const LeadSchema = z.object({
  name: z.string().min(2, 'Bitte Ihren Namen angeben').max(100).trim(),
  telefon: z.string().regex(/[+0-9\s\-()]{8,}/, 'Ungültige Telefonnummer'),
  email: z
    .string()
    .trim()
    .email('Ungültige E-Mail-Adresse')
    .max(160)
    .optional()
    .or(z.literal('')),
  plz_oder_stadt: z.string().min(2, 'Bitte Ort oder PLZ angeben').max(100).trim(),
  dsgvo: z.literal('on', { message: 'Bitte der Datenverarbeitung zustimmen' }),
})

type Field = 'name' | 'telefon' | 'email' | 'plz_oder_stadt' | 'dsgvo'

export type SubmitLeadResult =
  | { ok: true; leadId: string; anfrageId: string }
  | { ok: false; error: string; field?: Field; anfrageId?: string }

const SCHADENSTYP_WHITELIST = [
  'auffahrunfall',
  'parkschaden',
  'totalschaden',
  'hagel-sturm',
  'wildschaden',
  'vandalismus',
  'steinschlag',
  'e-auto',
  'sonstiges',
]

export async function submitAutounfallLead(formData: FormData): Promise<SubmitLeadResult> {
  // 1. Validierung
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Eingaben unvollständig',
      field: (issue?.path[0] as Field | undefined) ?? undefined,
    }
  }

  // 2. Audit-Header + UTMs (Hidden-Inputs im Client)
  const h = await headers()
  const xff = h.get('x-forwarded-for') ?? ''
  const clientIp = (xff.split(',')[0] ?? '').trim() || h.get('x-real-ip') || null
  const userAgent = h.get('user-agent') ?? null
  const refererUrl = h.get('referer') ?? null

  const utm = {
    utm_source: String(formData.get('utm_source') ?? '') || null,
    utm_medium: String(formData.get('utm_medium') ?? '') || null,
    utm_campaign: String(formData.get('utm_campaign') ?? '') || null,
    utm_term: String(formData.get('utm_term') ?? '') || null,
    utm_content: String(formData.get('utm_content') ?? '') || null,
  }

  // Optionaler Schadenskontext (Whitelist gegen View-Vergiftung) + ref-Slug.
  const rawTyp = String(formData.get('schadenstyp') ?? '').trim().toLowerCase()
  const schadenstyp = SCHADENSTYP_WHITELIST.includes(rawTyp) ? rawTyp : null
  const rawRef = String(formData.get('ref') ?? '').trim()
  const ref = /^[a-z0-9_-]{1,64}$/.test(rawRef) ? rawRef : null

  // Optionale SV-Praeferenz aus dem Karten-Pin-Klick (weiche Zuordnung; Dispatch
  // sieht sie im Payload, KEIN hartes Routing). UUID-validiert gegen View-Vergiftung.
  const rawSvId = String(formData.get('zugeordneter_sv_id') ?? '').trim()
  const svPref = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSvId) ? rawSvId : null

  const payload: Record<string, string> = {}
  if (schadenstyp) payload.schadenstyp = schadenstyp
  if (ref) payload.ref = ref
  if (svPref) payload.zugeordneter_sv_id = svPref

  const email = parsed.data.email && parsed.data.email !== '' ? parsed.data.email : null

  const sb = createServiceClient()

  // 3. Anfrage anlegen (mit DSGVO-Zustimmungs-Zeitstempel, PR #1569)
  const { data: anfrage, error: anfErr } = await sb
    .from('anfragen')
    .insert({
      quelle: 'autounfall-io-gutachter-finden',
      quelle_variant: ref,
      quelle_url: refererUrl,
      ...utm,
      kontakt_name: parsed.data.name,
      kontakt_telefon: parsed.data.telefon,
      kontakt_email: email,
      kontakt_plz_oder_stadt: parsed.data.plz_oder_stadt,
      payload,
      client_ip: clientIp,
      user_agent: userAgent,
      dsgvo_zustimmung_am: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (anfErr || !anfrage) {
    console.error('[autounfall-io] Anfrage-Insert fehlgeschlagen:', anfErr?.message)
    return { ok: false, error: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.' }
  }

  // 4. Atomic Convert via RPC
  const { data: leadId, error: convErr } = await sb.rpc('convert_anfrage_zu_lead', {
    p_anfrage_id: anfrage.id,
  })

  if (convErr || !leadId) {
    console.error('[autounfall-io] Convert fehlgeschlagen:', convErr?.message, 'anfrageId:', anfrage.id)
    return {
      ok: false,
      error: 'Ihre Anfrage ist eingegangen — die Verarbeitung läuft. Wir melden uns.',
      anfrageId: anfrage.id,
    }
  }

  // 5. In-app Dispatcher-/Admin-Benachrichtigung (fire-and-forget, geteilte DB).
  //    Ein Insert-Fail darf den Lead NICHT brechen.
  //    ⚠ Hier stand "Kein Email/WA (au.io standalone — Aaron 2026-05-24)". Das gilt für
  //    den KUNDEN-Kanal weiter; für das Team ist es seit 06.09.2026 aufgehoben (Schritt 6).
  try {
    const { data: dispatchers } = await sb
      .from('profiles')
      .select('id')
      .in('rolle', ['dispatch', 'admin'])
    if (dispatchers && dispatchers.length > 0) {
      const titel = `Neuer Lead aus ${parsed.data.plz_oder_stadt}: ${parsed.data.name}`
      const beschreibung = ['autounfall.io', schadenstyp ? `Schaden: ${schadenstyp}` : null, parsed.data.telefon]
        .filter(Boolean)
        .join(' · ')
      const link = `/dispatch/leads/${String(leadId)}`
      await Promise.all(
        dispatchers.map((d) =>
          sb.from('benachrichtigungen').insert({
            user_id: d.id,
            typ: 'neuer-lead',
            titel,
            beschreibung,
            link,
          }),
        ),
      )
    }
  } catch (err) {
    console.error('[autounfall-io] Dispatcher-Notify fehlgeschlagen (nicht kritisch):', (err as Error).message)
  }

  // 6. Team-WhatsApp (Aaron 06.09.2026: "bitte auch eine whatsapp an nicolas und mich
  //    wenn bei autounfall io was reinkommt"). Hebt die "nur in-app"-Entscheidung vom
  //    24.05. fuer den TEAM-Kanal auf; an Kunden schickt au.io weiterhin nichts.
  //
  //    Der Baileys-Dienst liegt auf demselben VPS (localhost:3055) — kein Umweg ueber
  //    die Haupt-App noetig. Wirft nie: ohne Token oder bei Baileys-Ausfall bleibt der
  //    Lead trotzdem angelegt, und der Fehlschlag steht im Log.
  await notifyTeamWhatsApp(
    [
      `🚗 Neuer Lead auf autounfall.io`,
      `${parsed.data.name} · ${parsed.data.plz_oder_stadt}`,
      parsed.data.telefon,
      schadenstyp ? `Schaden: ${schadenstyp}` : null,
      `https://app.claimondo.de/dispatch/leads/${String(leadId)}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return { ok: true, leadId: String(leadId), anfrageId: anfrage.id }
}
