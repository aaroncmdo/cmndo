'use server'
// Vertrieb-CRM P2: Lead-Detail-Loader (Ansprechpartner + Aktivitaeten). Staff-gegatet,
// Admin-Client nur nach Guard (kein IDOR). Der Client-Drawer ruft diese Server-Action.
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapLeadDetail, type VertriebLeadDetail } from '../_lib/lead-detail'

export async function getVertriebLeadDetail(
  leadId: string,
): Promise<{ ok: true; data: VertriebLeadDetail } | { ok: false; error: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()

  const { data: lead, error: leadErr } = await admin
    .from('partner_leads')
    .select(
      'id, status, einstufung, notiz, ansprechpartner_vorname, ansprechpartner_nachname, ansprechpartner_position, ansprechpartner_email, ansprechpartner_telefon',
    )
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr) return { ok: false, error: leadErr.message }
  if (!lead) return { ok: false, error: 'Lead nicht gefunden.' }

  const { data: akts, error: aktErr } = await admin
    .from('partner_lead_aktivitaeten')
    .select('id, typ, text, erstellt_von, erstellt_am')
    .eq('partner_lead_id', leadId)
    .order('erstellt_am', { ascending: false })
  if (aktErr) return { ok: false, error: aktErr.message }
  const rows = akts ?? []

  const ids = [...new Set(rows.map((a) => a.erstellt_von).filter((x): x is string => Boolean(x)))]
  const nameById: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: profs } = await admin.from('profiles').select('id, vorname, nachname').in('id', ids)
    for (const p of profs ?? []) {
      const name = [p.vorname, p.nachname].filter(Boolean).join(' ')
      nameById[p.id] = name || p.id
    }
  }

  return { ok: true, data: mapLeadDetail(lead, rows, nameById) }
}
