// AAR-100: Kunden-Portal Onboarding Page
// CMM-14 Diag: alle async-Calls in try/catch — wenn was crashed, rendern
// wir eine sichtbare Diagnose-Page direkt (Boundary greift nicht zuverlässig
// für RSC-Stream-Errors).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingWizard from './OnboardingWizard'
import { getPflichtdokumenteStand, getFreieSlotsFuerKunde } from './actions'

export const dynamic = 'force-dynamic'

function DiagPage({ stage, error }: { stage: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : null
  return (
    <div style={{ minHeight: '100vh', background: '#ff0066', color: 'white', padding: 24, fontFamily: 'monospace', fontSize: 12 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        🚨 ONBOARDING CRASH @ {stage}
      </h1>
      <div style={{ marginBottom: 8 }}><strong>Message:</strong> {message}</div>
      <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
        {stack || '(kein Stack)'}
      </pre>
    </div>
  )
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // ─── Stage 1: Profile ──────────────────────────────────────────────────
  let profile: { vorname?: string | null; onboarding_completed_at?: string | null } | null = null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('vorname, onboarding_completed_at')
      .eq('id', user.id)
      .single()
    if (error) throw new Error(`profiles.select: ${error.message}`)
    profile = data
  } catch (err) {
    return <DiagPage stage="profile" error={err} />
  }

  const { step } = await searchParams
  if (profile?.onboarding_completed_at && !step) redirect('/kunde')

  // ─── Stage 2: Aktiver Fall ─────────────────────────────────────────────
  type FallRow = {
    id: string
    fall_nummer: string | null
    kennzeichen: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    sv_termin: string | null
    polizei_vor_ort: boolean | null
    personenschaden_flag: boolean | null
    hat_vorschaeden: boolean | null
    lead_id: string | null
  } | null
  let fall: FallRow = null
  try {
    const { data, error } = await supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sv_termin, polizei_vor_ort, personenschaden_flag, hat_vorschaeden, lead_id')
      .eq('kunde_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`v_faelle_mit_aktuellem_termin: ${error.message}`)
    fall = data as FallRow
  } catch (err) {
    return <DiagPage stage="fall-load" error={err} />
  }

  // ─── Stage 3: ZB1 ──────────────────────────────────────────────────────
  let zb1StatusLead: string | null = null
  if (fall?.lead_id) {
    try {
      const { data: zb1Row } = await supabase
        .from('leads')
        .select('zb1_status')
        .eq('id', fall.lead_id)
        .single()
      zb1StatusLead = (zb1Row?.zb1_status as string | null) ?? null
    } catch (err) {
      return <DiagPage stage="zb1-status" error={err} />
    }
  }

  // ─── Stage 4: SV-Termin ────────────────────────────────────────────────
  let svName: string | null = null
  let terminDatum: string | null = null
  if (fall?.id) {
    try {
      const { data: termin } = await supabase
        .from('gutachter_termine')
        .select('start_zeit, sachverstaendige(profile_id, profiles!sachverstaendige_profile_id_fkey(vorname))')
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
    } catch (err) {
      return <DiagPage stage="termin-load" error={err} />
    }
  }

  // ─── Stage 5: Pflichtdokumente ────────────────────────────────────────
  let pflichtDocs: Awaited<ReturnType<typeof getPflichtdokumenteStand>> = []
  if (fall?.id) {
    try {
      pflichtDocs = await getPflichtdokumenteStand(fall.id)
    } catch (err) {
      return <DiagPage stage="pflichtdokumente" error={err} />
    }
  }

  // ─── Stage 6: Freie Slots ──────────────────────────────────────────────
  let freieSlots: Awaited<ReturnType<typeof getFreieSlotsFuerKunde>> = []
  if (fall?.id) {
    try {
      freieSlots = await getFreieSlotsFuerKunde(fall.id)
    } catch (err) {
      return <DiagPage stage="freie-slots" error={err} />
    }
  }

  const zb1Hochgeladen =
    zb1StatusLead === 'bestaetigt' ||
    pflichtDocs.some(d => d.slot_id === 'fahrzeugschein' && !!d.dokument_url)
  const polizeiberichtHochgeladen = pflichtDocs.some(d => d.slot_id === 'polizeibericht' && !!d.dokument_url)
  const attestHochgeladen = pflichtDocs.some(d => d.slot_id === 'aerztliches_attest' && !!d.dokument_url)

  // ─── Stage 7: Render ───────────────────────────────────────────────────
  try {
    return (
      <OnboardingWizard
        vorname={profile?.vorname ?? ''}
        fall={fall ? { id: fall.id, fall_nummer: fall.fall_nummer, kennzeichen: fall.kennzeichen, fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') } : null}
        termin={terminDatum ? { datum: terminDatum, svName } : null}
        pflichtDocs={pflichtDocs}
        freieSlots={freieSlots}
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
  } catch (err) {
    return <DiagPage stage="render-wizard" error={err} />
  }
}
