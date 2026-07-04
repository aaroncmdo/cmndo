// SP2d: geteilter Content-Builder fuer admin_termine-Kalender-Events (Google + CalDAV).
// Extrahiert aus google-calendar/admin-event-sync.ts, damit beide Provider identische
// Titel/Beschreibung/Zeiten nutzen (DRY, konsistente Kalender).
import type { createAdminClient } from '@/lib/supabase/admin'

export type AdminEventInput = {
  typ: string
  titel: string
  beschreibung: string | null
  notizen: string | null
  lead_id: string | null
  fall_id: string | null
  start_zeit: string
  end_zeit: string | null
}
export type AdminEventContent = { title: string; description: string; startIso: string; endIso: string }

const TYP_LABEL: Record<string, string> = {
  rueckruf: 'Rückruf',
  kunde: 'Kundentermin',
  intern: 'Intern',
  kb_beratung: 'KB-Beratung',
}

/** Pure: Termin (+ optional Lead) -> Titel/Description/Zeiten. startIso/endIso = rohe UTC-ISO. */
export function formatAdminEventContent(
  t: AdminEventInput,
  lead: { vorname: string | null; nachname: string | null; telefon: string | null } | null,
): AdminEventContent {
  const leadInfo = lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') : ''
  const leadTel = lead?.telefon ?? ''
  const typLabel = TYP_LABEL[t.typ] ?? t.typ
  const title = `Claimondo · ${typLabel}${t.titel && t.titel !== leadInfo ? ` · ${t.titel}` : leadInfo ? ` · ${leadInfo}` : ''}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const description = [
    t.beschreibung,
    leadInfo ? `Kunde: ${leadInfo}` : null,
    leadTel ? `Telefon: ${leadTel}` : null,
    t.notizen ? `Notiz: ${t.notizen}` : null,
    t.lead_id ? `Lead: ${appUrl}/dispatch/leads/${t.lead_id}` : null,
    t.fall_id ? `Fall: ${appUrl}/faelle/${t.fall_id}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  const startDate = new Date(t.start_zeit)
  const endIso = t.end_zeit ?? new Date(startDate.getTime() + 15 * 60 * 1000).toISOString()
  return { title, description, startIso: t.start_zeit, endIso }
}

/** I/O: holt Lead-Kontext (falls lead_id gesetzt) + formatiert. */
export async function buildAdminEventContent(
  t: AdminEventInput,
  db: ReturnType<typeof createAdminClient>,
): Promise<AdminEventContent> {
  let lead: { vorname: string | null; nachname: string | null; telefon: string | null } | null = null
  if (t.lead_id) {
    const { data } = await db.from('leads').select('vorname, nachname, telefon').eq('id', t.lead_id).maybeSingle()
    lead = (data as typeof lead) ?? null
  }
  return formatAdminEventContent(t, lead)
}
