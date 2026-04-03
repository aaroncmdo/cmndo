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
  const progress = berechneProgress(fall)

  return (
    <div>
      {/* KFZ-126: Vertikaler Phase-Stepper */}
      <div className="px-5 pt-5 pb-3 max-w-lg mx-auto">
        <Link href="/kunde" className="text-xs text-gray-400 hover:text-[#4573A2] mb-3 inline-block">&larr; Zurueck</Link>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          {/* Fortschrittsbalken oben */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-base font-semibold text-[#0D1B3E]">Ihr Fortschritt</p>
            <span className="text-base font-bold text-[#4573A2]">{progress.pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full mb-5">
            <div className="h-full bg-[#4573A2] rounded-full transition-all duration-700" style={{ width: `${progress.pct}%` }} />
          </div>

          {/* Vertikale Timeline */}
          <div className="space-y-0">
            {PHASES.map((phase, pi) => {
              const phaseComplete = pi < progress.phase
              const phaseCurrent = pi === progress.phase
              const phaseVisible = pi <= progress.phase
              if (!phaseVisible) return null

              return (
                <div key={phase.key}>
                  {/* Hauptphase — grosser Punkt */}
                  <div className="flex items-start gap-3 relative">
                    <div className="flex flex-col items-center">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        phaseComplete ? 'bg-green-500' : phaseCurrent ? 'bg-[#4573A2] animate-pulse' : 'bg-gray-200'
                      }`}>
                        {phaseComplete && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                    <div className="pb-1">
                      <p className={`text-base font-semibold ${phaseComplete ? 'text-green-600' : phaseCurrent ? 'text-[#0D1B3E]' : 'text-gray-400'}`}>
                        {phase.label}
                      </p>
                      {phaseCurrent && <p className="text-sm text-gray-500 mt-0.5">{phase.desc}</p>}
                    </div>
                  </div>

                  {/* Subprozesse — kleine Punkte eingerueckt */}
                  {phase.subs.map((sub, si) => {
                    const subComplete = phaseComplete || (phaseCurrent && si < progress.subStep)
                    const subCurrent = phaseCurrent && si === progress.subStep
                    const subVisible = phaseComplete || (phaseCurrent && si <= progress.subStep)
                    if (!subVisible) return null

                    return (
                      <div key={sub} className="flex items-start gap-3 pl-8 relative">
                        <div className="flex flex-col items-center">
                          {/* Verbindungslinie */}
                          <div className={`w-0.5 h-2 ${subComplete || subCurrent ? 'bg-green-300' : 'bg-gray-200'}`} />
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            subComplete ? 'bg-green-400' : subCurrent ? 'bg-[#4573A2]' : 'bg-gray-200'
                          }`} />
                          <div className={`w-0.5 h-2 ${subComplete ? 'bg-green-300' : 'bg-gray-200'}`} />
                        </div>
                        <p className={`text-sm py-1 ${subComplete ? 'text-green-600' : subCurrent ? 'text-[#0D1B3E] font-medium' : 'text-gray-400'}`}>
                          {sub}
                        </p>
                      </div>
                    )
                  })}

                  {/* Verbindungslinie zur naechsten Hauptphase */}
                  {pi < progress.phase && (
                    <div className="pl-[9px]">
                      <div className="w-0.5 h-3 bg-green-300" />
                    </div>
                  )}
                  {phaseCurrent && pi < PHASES.length - 1 && (
                    <div className="pl-[9px]">
                      <div className="w-0.5 h-3 bg-gray-200" />
                    </div>
                  )}
                </div>
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

// ─── 8 Hauptphasen mit Subprozessen ────────────────────────────────────────

const PHASES = [
  { key: 'kontakt', label: 'Kontakt aufgenommen', desc: 'Ihr Schadenfall wurde erfasst.',
    subs: ['Schadenfall erfasst', 'Erstberatung abgeschlossen'] },
  { key: 'sa', label: 'Sicherungsabtretung', desc: 'Ihre SA wird unterschrieben.',
    subs: ['Datenschutz akzeptiert', 'SA unterschrieben', 'Account erstellt'] },
  { key: 'gutachter', label: 'Gutachter wird gesucht', desc: 'Ein Sachverstaendiger wird zugewiesen.',
    subs: ['Gutachter zugewiesen', 'Termin vereinbart', 'Terminbestaetigung erhalten'] },
  { key: 'besichtigung', label: 'Fahrzeug-Besichtigung', desc: 'Der Gutachter besichtigt Ihr Fahrzeug.',
    subs: ['Gutachter vor Ort', 'Besichtigung abgeschlossen', 'Fotos erstellt'] },
  { key: 'gutachten', label: 'Gutachten wird erstellt', desc: 'Das Gutachten wird angefertigt.',
    subs: ['Gutachten in Bearbeitung', 'Gutachten hochgeladen', 'Qualitaetspruefung bestanden'] },
  { key: 'kanzlei', label: 'Kanzlei uebernimmt', desc: 'Ihr Fall wurde an die Partnerkanzlei uebergeben.',
    subs: ['Mandat eroeffnet', 'Anspruchsschreiben an Versicherung'] },
  { key: 'versicherung', label: 'Versicherung bearbeitet', desc: 'Die Versicherung reguliert Ihren Schaden.',
    subs: ['Ansprueche eingereicht', 'Frist laeuft', 'Regulierung angekuendigt'] },
  { key: 'auszahlung', label: 'Auszahlung', desc: 'Ihr Geld wird ausgezahlt.',
    subs: ['Zahlung eingegangen', 'Auszahlung an Sie erfolgt', 'Fall abgeschlossen'] },
]

function berechneProgress(fall: Record<string, unknown>): { phase: number; subStep: number; pct: number } {
  const status = (fall.status as string) ?? 'ersterfassung'
  const sa = fall.sa_unterschrieben === true
  const kundeId = fall.kunde_id as string | null
  const svId = fall.sv_id as string | null
  const svTermin = fall.sv_termin as string | null
  const terminStatus = (fall.gutachter_termin_status as string) ?? ''
  const gutachtenAm = fall.gutachten_eingegangen_am as string | null
  const regulierungAm = fall.regulierung_am as string | null

  // Phase 8: Auszahlung
  if (status === 'abgeschlossen') return { phase: 7, subStep: 2, pct: 100 }
  if (regulierungAm) return { phase: 7, subStep: 1, pct: 95 }

  // Phase 7: Versicherung
  if (status === 'regulierung') return { phase: 6, subStep: 2, pct: 82 }
  if (status === 'anschlussschreiben') return { phase: 6, subStep: 1, pct: 72 }

  // Phase 6: Kanzlei
  if (status === 'kanzlei-uebergeben') return { phase: 5, subStep: 0, pct: 58 }

  // Phase 5: Gutachten
  if (status === 'filmcheck' || status === 'qc-pruefung') return { phase: 4, subStep: 2, pct: 48 }
  if (gutachtenAm || status === 'gutachten-eingegangen') return { phase: 4, subStep: 1, pct: 42 }

  // Phase 4: Besichtigung
  if (status === 'besichtigung') return { phase: 3, subStep: 1, pct: 28 }

  // Phase 3: Gutachter
  if (terminStatus === 'bestaetigt' && svTermin) return { phase: 2, subStep: 2, pct: 20 }
  if (svTermin) return { phase: 2, subStep: 1, pct: 18 }
  if (svId) return { phase: 2, subStep: 0, pct: 15 }

  // Phase 2: SA
  if (sa && kundeId) return { phase: 1, subStep: 2, pct: 10 }
  if (sa) return { phase: 1, subStep: 1, pct: 8 }

  // Phase 1: Kontakt
  if (status !== 'ersterfassung') return { phase: 0, subStep: 1, pct: 5 }
  return { phase: 0, subStep: 0, pct: 2 }
}
