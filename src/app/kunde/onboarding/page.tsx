// Token-Audit-Skip: DiagPage rendert Crash-Magenta bewusst auffällig (vor Theme).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
// AAR-100: Kunden-Portal Onboarding Page
// CMM-14: alle async-Calls in try/catch — wenn was crashed, rendern
// wir eine sichtbare Diagnose-Page direkt (Boundary greift nicht zuverlässig
// für RSC-Stream-Errors).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingWizard from './OnboardingWizard'
import { getPflichtdokumenteStand, getFreieSlotsFuerKunde } from './actions'
import { getClaimForRole, resolveClaimId } from '@/lib/claims/get-claim-for-role'
import type { ClaimFull } from '@/lib/claims/types'
// CMM-33: Zentrale PflichtdokumenteSection liest dieselben Slots wie
// Detail-Page + Banner — gleicher Bucket, identisches Verhalten.
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'

export const dynamic = 'force-dynamic'

function DiagPage({ stage, error }: { stage: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : null
  const showDebug = process.env.NODE_ENV !== 'production'
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-claimondo-md bg-claimondo-card border border-claimondo-border shadow-claimondo-md p-8 text-center">
        <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-2xl">
          ⚠
        </div>
        <h1 className="text-claimondo-navy text-xl font-bold mb-2">
          Onboarding konnte nicht geladen werden
        </h1>
        <p className="text-claimondo-shield/80 text-sm mb-6">
          Wir konnten einige Daten nicht abrufen. Bitte laden Sie die Seite neu — wenn das Problem bestehen bleibt, melden Sie sich bei uns.
        </p>
        {showDebug && (
          <div className="mt-6 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-shield/60 mb-1">
              Debug · {stage}
            </p>
            <p className="text-xs font-mono text-claimondo-shield break-all mb-2">{message}</p>
            {stack && (
              <pre className="text-[10px] font-mono text-claimondo-shield/70 bg-claimondo-bg border border-claimondo-border rounded-claimondo-sm p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                {stack}
              </pre>
            )}
          </div>
        )}
      </div>
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
    besichtigungsort_adresse: string | null
  } | null
  let fall: FallRow = null
  try {
    const { data, error } = await supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sv_termin, polizei_vor_ort, personenschaden_flag, hat_vorschaeden, lead_id, besichtigungsort_adresse')
      .eq('kunde_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`v_faelle_mit_aktuellem_termin: ${error.message}`)
    fall = data as FallRow
  } catch (err) {
    return <DiagPage stage="fall-load" error={err} />
  }

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

  // ─── CMM-19: Claim-Daten via SSoT-Loader für Step 1 navy-Cards ────────
  let claim: ClaimFull | null = null
  if (fall?.id) {
    try {
      const claimId = await resolveClaimId(supabase, fall.id)
      if (claimId) {
        claim = await getClaimForRole(supabase, claimId, 'kunde')
      }
    } catch (err) {
      return <DiagPage stage="claim-load" error={err} />
    }
  }

  let pflichtDocs: Awaited<ReturnType<typeof getPflichtdokumenteStand>> = []
  if (fall?.id) {
    try {
      pflichtDocs = await getPflichtdokumenteStand(fall.id)
    } catch (err) {
      return <DiagPage stage="pflichtdokumente" error={err} />
    }
  }

  // CMM-33: parallel die zentrale Slot-Sicht für PflichtdokumenteSection laden.
  let pflichtSlots: Awaited<ReturnType<typeof getPflichtdokumenteForFall>> = []
  if (fall?.id) {
    try {
      pflichtSlots = await getPflichtdokumenteForFall(supabase, fall.id, 'kunde')
    } catch (err) {
      return <DiagPage stage="pflicht-slots" error={err} />
    }
  }

  let freieSlots: Awaited<ReturnType<typeof getFreieSlotsFuerKunde>> = []
  if (fall?.id) {
    try {
      freieSlots = await getFreieSlotsFuerKunde(fall.id)
    } catch (err) {
      return <DiagPage stage="freie-slots" error={err} />
    }
  }

  try {
    return (
      <OnboardingWizard
        vorname={profile?.vorname ?? ''}
        fall={fall ? { id: fall.id, fall_nummer: fall.fall_nummer, kennzeichen: fall.kennzeichen, fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') } : null}
        claim={claim}
        termin={terminDatum ? { datum: terminDatum, svName, ort: fall?.besichtigungsort_adresse ?? null } : null}
        pflichtDocs={pflichtDocs}
        pflichtSlots={pflichtSlots}
        freieSlots={freieSlots}
      />
    )
  } catch (err) {
    return <DiagPage stage="render-wizard" error={err} />
  }
}
