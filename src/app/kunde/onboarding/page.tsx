// AAR-100: Kunden-Portal Onboarding Page
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingWizard from './OnboardingWizard'
import { getPflichtdokumenteStand } from './actions'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, onboarding_completed_at')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed_at) redirect('/kunde')

  // Aktiver Fall des Kunden — AAR-231: zusätzlich polizei_vor_ort,
  // personenschaden_flag, hat_vorschaeden für Vorbereitungs-Checkliste.
  // AAR-231 Audit: lead_id mitnehmen um ZB1-Status zu laden (dispatch-ZB1
  // Upload läuft auf leads.zb1_status, nicht über pflichtdokumente).
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sv_termin, polizei_vor_ort, personenschaden_flag, hat_vorschaeden, lead_id')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // AAR-231 Audit: ZB1-Status direkt aus leads laden — falls via Dispatch
  // Phase 4 erhoben, gibt es kein fahrzeugschein-Pflichtdokument (AAR-228
  // Bug 4 Fix), aber zb1_status='bestaetigt'.
  let zb1StatusLead: string | null = null
  if (fall?.lead_id) {
    const { data: zb1Row } = await supabase
      .from('leads')
      .select('zb1_status')
      .eq('id', fall.lead_id)
      .single()
    zb1StatusLead = (zb1Row?.zb1_status as string | null) ?? null
  }

  // Reservierter SV-Termin mit Name
  let svName: string | null = null
  let terminDatum: string | null = null
  if (fall?.id) {
    const { data: termin } = await supabase
      .from('gutachter_termine')
      .select('start_zeit, sachverstaendige(profile_id, profiles(vorname))')
      .eq('fall_id', fall.id)
      .in('status', ['reserviert', 'bestaetigt'])
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (termin) {
      terminDatum = (termin.start_zeit as string | null) ?? null
      const svJoin = termin.sachverstaendige as unknown
      const svRow = Array.isArray(svJoin) ? svJoin[0] : svJoin
      const p = (svRow as { profiles?: { vorname?: string | null } | { vorname?: string | null }[] } | null)?.profiles
      const pRow = Array.isArray(p) ? p[0] : p
      svName = pRow?.vorname ?? null
    }
  }

  // AAR-323: Pflichtdokumente mit Katalog-Metadaten (Label, Beschreibung,
  // Frist, Begründung, max_mb, accepted mimes). Ersetzt den vorherigen
  // Plain-Select aus pflichtdokumente.
  const pflichtDocs = fall?.id ? await getPflichtdokumenteStand(fall.id) : []

  // AAR-231: Vorbereitungs-Flags aus Pflichtdokumenten + Fall-Feldern ableiten.
  // AAR-231 Audit: zb1Hochgeladen = fahrzeugschein-Doc MIT URL ODER
  // zb1_status='bestaetigt' (via Dispatch Phase 4) — sonst würde der
  // Kunde den Checklist-Hinweis "Fahrzeugschein hochladen" sehen obwohl
  // der ZB1 via Dispatch bereits da ist.
  const zb1Hochgeladen =
    zb1StatusLead === 'bestaetigt' ||
    pflichtDocs.some(d => d.slot_id === 'fahrzeugschein' && !!d.dokument_url)
  const polizeiberichtHochgeladen = pflichtDocs.some(d => d.slot_id === 'polizeibericht' && !!d.dokument_url)
  const attestHochgeladen = pflichtDocs.some(d => d.slot_id === 'aerztliches_attest' && !!d.dokument_url)

  return (
    <OnboardingWizard
      vorname={profile?.vorname ?? ''}
      fall={fall ? { id: fall.id, fall_nummer: fall.fall_nummer, kennzeichen: fall.kennzeichen, fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') } : null}
      termin={terminDatum ? { datum: terminDatum, svName } : null}
      pflichtDocs={pflichtDocs}
      vorbereitung={{
        zb1Hochgeladen,
        polizeiVorOrt: !!fall?.polizei_vor_ort,
        polizeiberichtHochgeladen,
        personenschaden: !!fall?.personenschaden_flag,
        attestHochgeladen,
        hatVorschaeden: !!fall?.hat_vorschaeden,
      }}
    />
  )
}
