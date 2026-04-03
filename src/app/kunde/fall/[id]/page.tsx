import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import FallDetailClient from './FallDetailClient'

export default async function KundeFallPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Fetch the case
  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', id)
    .single()

  if (!fall) notFound()

  // Check ownership: primary via kunde_id, fallback via lead email
  const ownedByKundeId = fall.kunde_id === user.id
  let ownedByLeadEmail = false

  if (!ownedByKundeId && fall.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('email')
      .eq('id', fall.lead_id)
      .single()
    ownedByLeadEmail = lead?.email === user.email
  }

  if (!ownedByKundeId && !ownedByLeadEmail) notFound()

  // Redirect to onboarding if not completed
  if (fall.onboarding_complete === false && ownedByKundeId) {
    redirect(`/kunde/onboarding/${fall.id}`)
  }

  // Fetch kundenbetreuer profile
  let kundenbetreuer: {
    vorname: string | null
    nachname: string | null
    email: string | null
    telefon: string | null
  } | null = null
  if (fall.kundenbetreuer_id) {
    const { data: kbProfile } = await supabase
      .from('profiles')
      .select('vorname, nachname, email, telefon')
      .eq('id', fall.kundenbetreuer_id as string)
      .single()
    kundenbetreuer = kbProfile
  }

  // Fetch all related data in parallel
  const [
    { data: dokumente },
    svResult,
    { data: nachrichten },
  ] = await Promise.all([
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, created_at, kategorie, quelle, sichtbar_fuer, hochgeladen_von_rolle')
      .eq('fall_id', id)
      .contains('sichtbar_fuer', ['kunde'])
      .order('created_at'),
    fall.sv_id
      ? supabase
          .from('sachverstaendige')
          .select('id, paket, profiles(vorname, nachname, telefon)')
          .eq('id', fall.sv_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .in('kanal', ['portal-kunde-claimondo', 'portal-kunde-gutachter'])
      .order('created_at', { ascending: true }),
  ])

  // Normalize SV profile join
  let sv = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const profileRaw = raw.profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw ?? null
    sv = {
      id: raw.id as string,
      paket: raw.paket as string,
      profile: profile as { vorname: string | null; nachname: string | null; telefon: string | null } | null,
    }
  }

  // Phase-Stepper Berechnung
  const progress = computeProgress(fall)

  return (
    <div>
      {/* KFZ-126: Phase-Stepper mit Prozent */}
      <div className="px-5 pt-5 pb-3 max-w-lg mx-auto">
        <Link href="/kunde" className="text-xs text-gray-400 hover:text-[#4573A2] mb-3 inline-block">&larr; Zurueck</Link>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[#0D1B3E]">{progress.label}</p>
            <span className="text-sm font-bold text-[#4573A2]">{progress.pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full mb-3">
            <div className="h-full bg-[#4573A2] rounded-full transition-all duration-700" style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="text-sm text-gray-500">{progress.next}</p>

          {/* Mini-Phasen nur bis zur aktuellen */}
          <div className="flex items-center gap-0.5 mt-4">
            {PHASE_STEPS.map((step, i) => {
              const reached = step.pct <= progress.pct
              const isCurrent = step.pct === progress.pct || (i < PHASE_STEPS.length - 1 && PHASE_STEPS[i + 1].pct > progress.pct && step.pct <= progress.pct)
              if (step.pct > progress.pct + 10) return null // nur abgeschlossene + aktuelle + naechste
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${reached ? 'bg-[#4573A2]' : 'bg-gray-200'} ${isCurrent ? 'ring-2 ring-[#4573A2]/30' : ''}`} />
                  {i < PHASE_STEPS.length - 1 && step.pct <= progress.pct + 10 && (
                    <div className={`flex-1 h-0.5 mx-0.5 ${reached ? 'bg-[#4573A2]/40' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex mt-1 gap-0.5">
            {PHASE_STEPS.map(step => {
              if (step.pct > progress.pct + 10) return null
              return (
                <span key={step.key} className={`flex-1 text-[8px] ${step.pct <= progress.pct ? 'text-[#4573A2]' : 'text-gray-300'}`}>
                  {step.label}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <FallDetailClient
        fall={fall}
        dokumente={dokumente ?? []}
        sv={sv}
        nachrichten={nachrichten ?? []}
        kundenbetreuer={kundenbetreuer}
      />
    </div>
  )
}

// ─── Phase Stepper ──────────────────────────────────────────────────────────

const PHASE_STEPS = [
  { key: 'kontakt', label: 'Kontakt', pct: 5 },
  { key: 'sa', label: 'SA', pct: 10 },
  { key: 'sv', label: 'Gutachter', pct: 15 },
  { key: 'termin', label: 'Termin', pct: 20 },
  { key: 'besichtigung', label: 'Besicht.', pct: 30 },
  { key: 'gutachten', label: 'Gutachten', pct: 50 },
  { key: 'fertig', label: 'Fertig', pct: 55 },
  { key: 'kanzlei', label: 'Kanzlei', pct: 65 },
  { key: 'ansprueche', label: 'Ansprueche', pct: 75 },
  { key: 'regulierung', label: 'Regulierung', pct: 85 },
  { key: 'auszahlung', label: 'Auszahlung', pct: 100 },
]

function computeProgress(fall: Record<string, unknown>): { pct: number; label: string; next: string } {
  const status = (fall.status as string) ?? 'ersterfassung'
  const sa = fall.sa_unterschrieben === true
  const svId = fall.sv_id as string | null
  const svTermin = fall.sv_termin as string | null
  const gutachtenAm = fall.gutachten_eingegangen_am as string | null

  if (status === 'abgeschlossen') return { pct: 100, label: 'Abgeschlossen', next: 'Ihr Schadensfall wurde erfolgreich abgeschlossen!' }
  if (status === 'regulierung') return { pct: 85, label: 'Regulierung', next: 'Die Versicherung bearbeitet Ihren Schaden.' }
  if (status === 'anschlussschreiben') return { pct: 75, label: 'Ansprueche eingereicht', next: 'Die Kanzlei hat Ihre Ansprueche geltend gemacht.' }
  if (status === 'kanzlei-uebergeben') return { pct: 65, label: 'Kanzlei', next: 'Ihr Fall wurde an die Partnerkanzlei uebergeben.' }
  if (status === 'filmcheck' || status === 'qc-pruefung') return { pct: 55, label: 'Gutachten fertig', next: 'Ihr Gutachten wird geprueft.' }
  if (gutachtenAm || status === 'gutachten-eingegangen') return { pct: 55, label: 'Gutachten fertig', next: 'Ihr Gutachten ist fertig.' }
  if (status === 'besichtigung') return { pct: 30, label: 'Besichtigung', next: 'Der Gutachter besichtigt Ihr Fahrzeug.' }
  if (svTermin) {
    const d = new Date(svTermin as string)
    return { pct: 20, label: 'Termin vereinbart', next: `Besichtigung: ${d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })} um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` }
  }
  if (svId) return { pct: 15, label: 'Gutachter zugewiesen', next: 'Ihr Gutachter meldet sich fuer einen Termin.' }
  if (sa) return { pct: 10, label: 'SA unterschrieben', next: 'Ein Gutachter wird Ihnen zugewiesen.' }
  return { pct: 5, label: 'Kontakt aufgenommen', next: 'Ihr Fall wird geprueft.' }
}
