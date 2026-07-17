// AAR-956: KB-Konsultations-Cockpit. Service-role + Ownership-Gate (kb_id==user),
// weil der KB keinen RLS-Pfad auf claim-lose Abbrecher-Leads hat (siehe Spec).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { KonsultationCockpit, type Lead, type FlowLink } from './KonsultationCockpit'
import { ladeInterneTerminNotizen } from '@/lib/termine/intern-notizen'

export const dynamic = 'force-dynamic'

export default async function KonsultationPage({ params }: { params: Promise<{ terminId: string }> }) {
  const { terminId } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, typ, kb_id, lead_id, start_zeit, end_zeit, status, kanal, durchgefuehrt_am')
    .eq('id', terminId)
    .maybeSingle()
  if (!termin || termin.typ !== 'kb_beratung' || termin.kb_id !== user.id) notFound()

  // notiz_intern lebt in gutachter_termine_intern (Staff-only, Kunde-Leak-Fix).
  const interneNotizen = await ladeInterneTerminNotizen(admin, [termin.id])

  const { data: lead } = termin.lead_id
    ? await admin
        .from('leads')
        .select(
          'id, vorname, nachname, telefon, email, service_typ, schadentyp, schadentyp_freitext, ' +
            'schadens_hergang, unfalldatum, unfallort, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, ' +
            'fahrzeug_baujahr, qualifizierungs_phase, status, flow_link_geoeffnet, flow_link_abgeschlossen, ' +
            'anruf_versuche, letzter_anruf_status, notiz',
        )
        .eq('id', termin.lead_id)
        .maybeSingle()
    : { data: null }

  const { data: flowLink } = termin.lead_id
    ? await admin
        .from('flow_links')
        .select('gesendet_am, gesendet_kanal, gesendet_anzahl, geoeffnet_am, abgeschlossen_am')
        .eq('lead_id', termin.lead_id)
        .order('erstellt_am', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  return (
    <KonsultationCockpit
      termin={{
        id: termin.id,
        startZeit: termin.start_zeit,
        status: termin.status,
        kanal: termin.kanal,
        notizIntern: interneNotizen[termin.id] ?? null,
        durchgefuehrtAm: termin.durchgefuehrt_am,
      }}
      lead={lead as unknown as Lead}
      flowLink={flowLink as unknown as FlowLink}
    />
  )
}
