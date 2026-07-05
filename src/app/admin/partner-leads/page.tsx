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
import type { PartnerLeadRow, StaffOption } from './types'

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
      'id, rolle, status, firma, ansprechpartner_vorname, ansprechpartner_nachname, email, telefon, plz, ort, source_channel, rollen_details, zugewiesen_an, konvertiert_zu_user_id, konvertiert_zu_partner_id, konvertiert_am, notiz, erstellt_am, aktualisiert_am',
    )
    .order('erstellt_am', { ascending: false })
    .limit(500)

  if (error) console.error('[admin/partner-leads] Query:', error.message)

  // Staff-Liste fuer Zuweisungs-Dropdown + Namensauflösung (zugewiesen_an).
  const { data: staffRaw } = await supabase
    .from('profiles')
    .select('id, vorname, nachname, email')
    .in('rolle', VERTRIEB_ROLLEN)
    .order('vorname', { ascending: true })

  const staff: StaffOption[] = (staffRaw ?? []).map((s) => ({
    id: s.id as string,
    name:
      [s.vorname, s.nachname].filter(Boolean).join(' ') ||
      (s.email as string | null) ||
      'Unbenannt',
  }))

  return (
    <PartnerLeadsClient
      leads={(leadsRaw ?? []) as PartnerLeadRow[]}
      staff={staff}
    />
  )
}
