import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import VorOrtClient from './VorOrtClient'

// KFZ-200: Vor-Ort-Modus für SV.

export const dynamic = 'force-dynamic'

export default async function VorOrtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  const db = (await import('@/lib/supabase/admin')).createAdminClient()

  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    // CMM-49 sv_id-Drop (Termin-Engine-Handoff): sv_id aus Select entfernt (unused) + Filter -> assignee
    .select('id, fall_id, start_zeit, sv_angekommen_am, durchgefuehrt_am')
    .eq('id', id)
    .eq('typ', 'sv_begutachtung')
    .eq('assignee_id', sv.id)
    .eq('assignee_typ', 'sachverstaendiger')
    .single()

  if (tErr || !termin) redirect(`/gutachter/termine/${id}`)

  // CMM-49 (Entity-Sweep): faelle -> v_claim_full. fahrzeug_*/kennzeichen flach
  // (value-identisch, div=0); claim_nummer flach statt claims-Embed.
  const { data: fall } = await db
    .from('v_claim_full')
    .select('id:fall_id, lead_id, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, claim_nummer')
    .eq('fall_id', termin.fall_id)
    .single()

  let leadName = '—'
  let leadVorname = 'Kunde'
  if (fall?.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
    if (lead) {
      leadName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      leadVorname = lead.vorname ?? 'Kunde'
    }
  }

  // Dokumente die Kunde bereits hochgeladen hat
  const { data: kundeDokumente } = await db
    .from('fall_dokumente')
    .select('id, dokument_typ, original_filename, hochgeladen_am, discrepancy_flag')
    .eq('fall_id', termin.fall_id)
    .eq('uploaded_by_kunde', true)
    .order('hochgeladen_am', { ascending: false })

  // SV-Dokumente
  const { data: svDokumente } = await db
    .from('fall_dokumente')
    .select('id, dokument_typ, original_filename, hochgeladen_am, discrepancy_flag')
    .eq('fall_id', termin.fall_id)
    .eq('uploaded_by_sv', true)
    .order('hochgeladen_am', { ascending: false })

  const fahrzeug = [fall?.fahrzeug_hersteller, fall?.fahrzeug_modell].filter(Boolean).join(' ')

  return (
    <VorOrtClient
      terminId={id}
      fallId={termin.fall_id}
      fallNummer={(fall?.claim_nummer as string | null) ?? id.slice(0, 8)}
      leadName={leadName}
      leadVorname={leadVorname}
      fahrzeug={fahrzeug || null}
      kennzeichen={fall?.kennzeichen ?? null}
      kundeDokumente={(kundeDokumente ?? []).map(d => ({
        id: String(d.id),
        dokument_typ: String(d.dokument_typ ?? ''),
        dateiname: d.original_filename ? String(d.original_filename) : null,
        erstellt_am: String(d.hochgeladen_am),
        discrepancy_flag: Boolean(d.discrepancy_flag),
      }))}
      svDokumente={(svDokumente ?? []).map(d => ({
        id: String(d.id),
        dokument_typ: String(d.dokument_typ ?? ''),
        dateiname: d.original_filename ? String(d.original_filename) : null,
        erstellt_am: String(d.hochgeladen_am),
        discrepancy_flag: Boolean(d.discrepancy_flag),
      }))}
      alreadyDone={!!termin.durchgefuehrt_am}
    />
  )
}
