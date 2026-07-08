// Partner-Vertriebsdashboard — rollen-uebergreifende Prospect-Triage (SV,
// Werkstatt, Makler). Verallgemeinert die SV-only Waitlist. Auth-Guard +
// Daten-Fetch hier, Interaktion im Client (PartnerLeadsClient).
//
// Reichbarkeit: das /admin-Layout gatet zusaetzlich hart auf 'admin'
// (requirePortalAccess(['admin'])) — dispatch/leadbearbeiter landen heute in
// ihrem eigenen Portal. Der Page-Guard akzeptiert dennoch alle drei Rollen
// (deckungsgleich mit dem RLS-Gate partner_leads_staff_all), damit die Seite
// sofort funktioniert, falls die Layout-Weiche spaeter geoeffnet wird.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PartnerLeadsClient from './PartnerLeadsClient'
import type { PartnerLeadRow, StaffOption, PartnerLeadAktivitaetRow } from './types'

export const dynamic = 'force-dynamic'

const VERTRIEB_ROLLEN = ['admin', 'dispatch', 'leadbearbeiter']

export default async function PartnerLeadsPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  const rolle = (profile?.rolle as string | undefined) ?? ''
  if (!VERTRIEB_ROLLEN.includes(rolle)) redirect('/login?error=Nur+Vertriebs-Team')

  // partner_leads via RLS-Client (partner_leads_staff_all deckt die drei Rollen).
  const { data: leadsRaw, error } = await supabase
    .from('partner_leads')
    .select(
      'id, rolle, status, firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon, plz, ort, source_channel, einstufung, rollen_details, zugewiesen_an, konvertiert_zu_user_id, konvertiert_zu_partner_id, konvertiert_am, notiz, erstellt_am, aktualisiert_am',
    )
    .order('erstellt_am', { ascending: false })
    .limit(500)

  if (error) console.error('[admin/partner-leads] Query:', error.message)

  const leads = (leadsRaw ?? []) as PartnerLeadRow[]

  // Aktivitaeten aller sichtbaren Leads in einem Zug laden (partner_lead_akt_staff_all
  // gatet auf dieselben drei Rollen). Neueste zuerst — der Drawer filtert je Lead.
  const leadIds = leads.map((l) => l.id)
  const { data: aktRaw } = leadIds.length
    ? await supabase
        .from('partner_lead_aktivitaeten')
        .select('id, partner_lead_id, typ, text, erstellt_von, erstellt_am')
        .in('partner_lead_id', leadIds)
        .order('erstellt_am', { ascending: false })
        .limit(2000)
    : { data: [] }

  // Staff-Liste fuer Zuweisungs-Dropdown + Namensauflösung (zugewiesen_an +
  // Aktivitaets-Bearbeiter). Bearbeiter koennen theoretisch auch Nicht-mehr-Staff
  // sein → Namens-Auflösung faellt dann auf null (Client zeigt "System").
  const { data: staffRaw } = await supabase
    .from('profiles')
    .select('id, vorname, nachname, email')
    .in('rolle', VERTRIEB_ROLLEN)
    .order('vorname', { ascending: true })

  const nameById = new Map<string, string>()
  for (const s of staffRaw ?? []) {
    nameById.set(
      s.id as string,
      [s.vorname, s.nachname].filter(Boolean).join(' ') ||
        (s.email as string | null) ||
        'Unbenannt',
    )
  }

  const staff: StaffOption[] = (staffRaw ?? []).map((s) => ({
    id: s.id as string,
    name: nameById.get(s.id as string) ?? 'Unbenannt',
  }))

  const aktivitaeten: PartnerLeadAktivitaetRow[] = (aktRaw ?? []).map((a) => ({
    id: a.id as string,
    partner_lead_id: a.partner_lead_id as string,
    typ: a.typ as PartnerLeadAktivitaetRow['typ'],
    text: (a.text as string | null) ?? null,
    erstellt_von: (a.erstellt_von as string | null) ?? null,
    erstellt_von_name: a.erstellt_von ? nameById.get(a.erstellt_von as string) ?? null : null,
    erstellt_am: a.erstellt_am as string,
  }))

  return (
    <PartnerLeadsClient
      leads={leads}
      staff={staff}
      aktivitaeten={aktivitaeten}
    />
  )
}
