// Token-Audit-Skip: DiagPage rendert Crash-Magenta bewusst auffällig (vor Theme).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
// AAR-100: Kunden-Portal Onboarding Page
// CMM-14: alle async-Calls in try/catch — wenn was crashed, rendern
// wir eine sichtbare Diagnose-Page direkt (Boundary greift nicht zuverlässig
// für RSC-Stream-Errors).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import OnboardingWizard from './OnboardingWizard'
import { getPflichtdokumenteStand, getFreieSlotsFuerKunde } from './actions'
import { getClaimForRole, resolveClaimId } from '@/lib/claims/get-claim-for-role'
import type { ClaimFull } from '@/lib/claims/types'
// CMM-33: Zentrale PflichtdokumenteSection liest dieselben Slots wie
// Detail-Page + Banner — gleicher Bucket, identisches Verhalten.
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
// Pflichtdok-Kanonisierung: vorberechnen auf Server-Seite, als Prop weitergeben.
import { getAlleSlots } from '@/lib/dokumente/katalog'
import { buildDokumentKontext } from '@/lib/dokumente/build-kontext'
import { getOffeneDokumentAnforderungen } from '@/lib/claims/data-requirements'
import { ladeSvAssigneeName } from '@/lib/termine/termin-assignee-name'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'

export const dynamic = 'force-dynamic'

function DiagPage({ stage, error }: { stage: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : null
  const showDebug = process.env.NODE_ENV !== 'production'
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-ios-md bg-claimondo-card border border-claimondo-border shadow-claimondo-md p-8 text-center">
        <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger-strong text-2xl">
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
              <pre className="text-[10px] font-mono text-claimondo-shield/70 bg-claimondo-bg border border-claimondo-border rounded-ios-sm p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
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

  type FallRow = {
    id: string
    claim_nummer: string | null
    kennzeichen: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    sv_termin: string | null
    polizei_vor_ort: boolean | null
    personenschaden_flag: boolean | null
    hat_vorschaeden: boolean | null
    lead_id: string | null
    besichtigungsort_adresse: string | null
    onboarding_complete: boolean | null
  } | null
  let fall: FallRow = null
  try {
    const { data, error } = await supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id, claim_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sv_termin, polizei_vor_ort, personenschaden_flag, hat_vorschaeden, lead_id, besichtigungsort_adresse, onboarding_complete')
      .eq('kunde_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`v_faelle_mit_aktuellem_termin: ${error.message}`)
    fall = data as FallRow
  } catch (err) {
    return <DiagPage stage="fall-load" error={err} />
  }

  // 2026-05-14: Redirect-Loop-Fix. Vorher knallte /kunde ↔ /kunde/onboarding
  // in eine Endlos-Schleife: /kunde redirected wenn fall.onboarding_complete
  // false ist, /kunde/onboarding redirected wenn profile.onboarding_completed_at
  // gesetzt ist. Wenn BEIDE Bedingungen wahr sind (User hat Account-Onboarding
  // gemacht, neuer Fall braucht Wizard), bouncen die Seiten ewig.
  //
  // Logik jetzt: Redirect zu /kunde nur wenn das Account-Onboarding fertig IST
  // UND es entweder keinen Fall gibt ODER der Fall sein per-Fall-Onboarding
  // auch erledigt hat. Explizites step= bleibt als Override (für Direct-Link
  // auf einzelne Wizard-Steps z.B. aus Notion).
  const fallNeedsOnboarding = fall?.onboarding_complete === false
  if (profile?.onboarding_completed_at && !step && !fallNeedsOnboarding) {
    redirect('/kunde')
  }

  let svName: string | null = null
  let terminDatum: string | null = null
  if (fall?.id) {
    try {
      // AAR-956 17.07.: SV-Name via Zwei-Schritt ueber die assignee-Achse — das fruehere
      // sachverstaendige(...)-Embed hat auf gutachter_termine keinen FK (PGRST200), die
      // Query starb still und das Onboarding zeigte nie SV/Termin.
      const { data: termin } = await supabase
        .from('gutachter_termine')
        .select('start_zeit, assignee_typ, assignee_id')
        // bezug-aware: bezug-native Termine tragen fall_id NULL (bezug_typ='fall'+bezug_id).
        // Ohne das zeigt das Onboarding weder SV-Name noch Termin — genau der Defekt,
        // den der Kommentar oben fuer die Embed-Variante beschreibt, nur eine Ebene tiefer.
        .or(bezugOrExpr('fall', fall.id))
        .in('status', ['reserviert', 'bestaetigt'])
        .order('start_zeit', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (termin) {
        terminDatum = (termin.start_zeit as string | null) ?? null
        const t = termin as { assignee_typ?: string | null; assignee_id?: string | null }
        const name = await ladeSvAssigneeName(supabase, t.assignee_typ ?? null, t.assignee_id ?? null)
        svName = name?.vorname ?? null
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

  // Pflichtdok-Kanonisierung: dokAnforderungen server-seitig berechnen und als
  // Prop weitergeben — der Client (OnboardingWizard) kann getAlleSlots nicht awaiten.
  // FIX: Lead vollstaendig laden damit konditionale Katalog-Slots korrekt evaluieren.
  let dokAnforderungen: Awaited<ReturnType<typeof getOffeneDokumentAnforderungen>> = []
  if (claim && fall?.id) {
    try {
      const admin = createAdminClient()
      let lead: Record<string, unknown> | null = null
      if (fall.lead_id) {
        const { data } = await admin
          .from('leads')
          .select('id, finanzierung_leasing, gewerbe_flag, vorsteuerabzugsberechtigt, zb1_status, polizei_vor_ort, fahrerflucht, zeugen_vorhanden, halter_ungleich_fahrer_flag, personenschaden_flag, sachschaden_flag')
          .eq('id', fall.lead_id)
          .maybeSingle()
        lead = data
      }
      const katalogRows = await getAlleSlots(supabase)
      const ctx = buildDokumentKontext({ claim, lead })
      dokAnforderungen = getOffeneDokumentAnforderungen(katalogRows, ctx, pflichtDocs)
    } catch (err) {
      // Non-fatal: Wizard rendert ohne Smart-Filter wenn Katalog nicht geladen werden kann.
      console.error('[OnboardingPage] dokAnforderungen failed, falling back to empty:', err)
    }
  }

  // Audit-Bug D: abrechnungsweg liegt weder in v_faelle_mit_aktuellem_termin noch in ClaimFull
  // -> gezielter Read (adminClient ist untyped; Spalte type-lagged, prod-verifiziert im
  // self-service-Pfad). Fehler/null = SV-Weg annehmen (sicherer Default: Termin-Step zeigen).
  let abrechnungsweg: string | null = null
  if (claim) {
    try {
      const { data } = await createAdminClient()
        .from('claims')
        .select('abrechnungsweg')
        .eq('id', claim.id)
        .maybeSingle()
      abrechnungsweg = ((data as Record<string, unknown> | null)?.abrechnungsweg as string | null) ?? null
    } catch (err) {
      console.error('[OnboardingPage] abrechnungsweg-Read failed (non-fatal):', err)
    }
  }

  try {
    return (
      <OnboardingWizard
        vorname={profile?.vorname ?? ''}
        fall={fall ? { id: fall.id, claim_nummer: fall.claim_nummer, kennzeichen: fall.kennzeichen, fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') } : null}
        claim={claim}
        termin={terminDatum ? { datum: terminDatum, svName, ort: fall?.besichtigungsort_adresse ?? null } : null}
        pflichtDocs={pflichtDocs}
        abrechnungsweg={abrechnungsweg}
        pflichtSlots={pflichtSlots}
        freieSlots={freieSlots}
        dokAnforderungen={dokAnforderungen}
      />
    )
  } catch (err) {
    return <DiagPage stage="render-wizard" error={err} />
  }
}
