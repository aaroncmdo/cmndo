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

  // Phase-Stepper Berechnung (szenario-basiert)
  const szenario = ((fall.szenario as string) ?? 'normalfall') as 'normalfall' | 'ruegefall' | 'klagefall'
  const phasen = SZENARIO_PHASEN[szenario] ?? SZENARIO_PHASEN.normalfall
  const progress = berechneProgress(fall, phasen)

  return (
    <div>
      {/* KFZ-126: Vertikaler Szenario-Stepper */}
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
            {phasen.map((phase, pi) => {
              const phaseComplete = pi < progress.phase
              const phaseCurrent = pi === progress.phase
              const phaseVisible = pi <= progress.phase
              if (!phaseVisible) return null

              return (
                <div key={phase.key}>
                  {/* Hauptphase — grosser Punkt: GRUEN sobald angefangen (pi <= progress.phase) */}
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      (phaseComplete || phaseCurrent) ? 'bg-green-500' : 'bg-gray-200'
                    }`}>
                      {(phaseComplete || phaseCurrent) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="pb-1">
                      <p className={`text-base font-semibold ${(phaseComplete || phaseCurrent) ? 'text-green-600' : 'text-gray-400'}`}>
                        {phase.label}
                      </p>
                      {phaseCurrent && phase.desc && <p className="text-sm text-gray-500 mt-0.5">{phase.desc}</p>}
                    </div>
                  </div>

                  {/* Subprozesse — kleine Punkte eingerueckt */}
                  {phase.subs.map((sub, si) => {
                    const subComplete = phaseComplete || (phaseCurrent && si < progress.subStep)
                    const subCurrent = phaseCurrent && si === progress.subStep
                    const subVisible = phaseComplete || (phaseCurrent && si <= progress.subStep)
                    if (!subVisible) return null

                    return (
                      <div key={`${phase.key}-${si}`} className="flex items-center gap-3 pl-8">
                        <div className="flex flex-col items-center">
                          <div className={`w-0.5 h-2 ${subComplete || subCurrent ? 'bg-green-300' : 'bg-gray-200'}`} />
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            subComplete ? 'bg-green-400' : subCurrent ? 'bg-[#4573A2] animate-pulse' : 'bg-gray-200'
                          }`} />
                          <div className={`w-0.5 h-2 ${subComplete ? 'bg-green-300' : 'bg-gray-200'}`} />
                        </div>
                        <p className={`text-sm ${subComplete ? 'text-green-600' : subCurrent ? 'text-[#0D1B3E] font-medium' : 'text-gray-400'}`}>
                          {sub}
                        </p>
                      </div>
                    )
                  })}

                  {/* Verbindungslinie zur naechsten Phase */}
                  {(phaseComplete || phaseCurrent) && pi < phasen.length - 1 && pi <= progress.phase && (
                    <div className="pl-[9px]"><div className={`w-0.5 h-3 ${phaseComplete ? 'bg-green-300' : 'bg-gray-200'}`} /></div>
                  )}
                </div>
              )
            })}
          </div>

          {szenario === 'ruegefall' && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <p className="text-xs text-amber-700 font-medium">Die Versicherung hat Einwaende erhoben. Unsere Partnerkanzlei kuemmert sich darum.</p>
            </div>
          )}
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

// ─── Szenario-basierte Phasen ──────────────────────────────────────────────

type Phase = { key: string; label: string; desc: string; subs: string[]; pctFrom: number; pctTo: number }

const NORMALFALL_PHASEN: Phase[] = [
  { key: 'kontakt', label: 'Kontakt aufgenommen', desc: 'Ihr Schadenfall wurde erfasst.',
    subs: ['Schadenfall erfasst', 'Erstberatung abgeschlossen'], pctFrom: 0, pctTo: 5 },
  { key: 'sa', label: 'Sicherungsabtretung', desc: 'Ihre SA wird unterschrieben.',
    subs: ['Datenschutz akzeptiert', 'SA unterschrieben', 'Account erstellt'], pctFrom: 5, pctTo: 10 },
  { key: 'gutachter', label: 'Gutachter wird gesucht', desc: 'Ein Sachverstaendiger wird zugewiesen.',
    subs: ['Gutachter zugewiesen', 'Termin vereinbart', 'Terminbestaetigung erhalten'], pctFrom: 10, pctTo: 20 },
  { key: 'besichtigung', label: 'Fahrzeug-Besichtigung', desc: 'Der Gutachter besichtigt Ihr Fahrzeug.',
    subs: ['Gutachter vor Ort', 'Besichtigung abgeschlossen', 'Fotos erstellt'], pctFrom: 20, pctTo: 30 },
  { key: 'gutachten', label: 'Gutachten wird erstellt', desc: 'Das Gutachten wird angefertigt.',
    subs: ['Gutachten in Bearbeitung', 'Gutachten hochgeladen', 'Qualitaetspruefung bestanden'], pctFrom: 30, pctTo: 50 },
  { key: 'kanzlei', label: 'Kanzlei uebernimmt', desc: 'Ihr Fall wurde an die Partnerkanzlei uebergeben.',
    subs: ['Mandat eroeffnet', 'Anspruchsschreiben an Versicherung'], pctFrom: 50, pctTo: 65 },
  { key: 'versicherung', label: 'Versicherung bearbeitet', desc: 'Die Versicherung reguliert Ihren Schaden.',
    subs: ['Ansprueche eingereicht', 'Regulierung angekuendigt'], pctFrom: 65, pctTo: 85 },
  { key: 'auszahlung', label: 'Auszahlung', desc: 'Ihr Geld wird ausgezahlt.',
    subs: ['Zahlung eingegangen', 'Auszahlung an Sie erfolgt', 'Fall abgeschlossen'], pctFrom: 85, pctTo: 100 },
]

const RUEGEFALL_PHASEN: Phase[] = [
  { key: 'kontakt', label: 'Kontakt aufgenommen', desc: 'Ihr Schadenfall wurde erfasst.',
    subs: ['Schadenfall erfasst', 'Erstberatung abgeschlossen'], pctFrom: 0, pctTo: 3 },
  { key: 'sa', label: 'Sicherungsabtretung', desc: 'Ihre SA wird unterschrieben.',
    subs: ['Datenschutz akzeptiert', 'SA unterschrieben', 'Account erstellt'], pctFrom: 3, pctTo: 7 },
  { key: 'gutachter', label: 'Gutachter wird gesucht', desc: 'Ein Sachverstaendiger wird zugewiesen.',
    subs: ['Gutachter zugewiesen', 'Termin vereinbart', 'Terminbestaetigung erhalten'], pctFrom: 7, pctTo: 14 },
  { key: 'besichtigung', label: 'Fahrzeug-Besichtigung', desc: 'Der Gutachter besichtigt Ihr Fahrzeug.',
    subs: ['Gutachter vor Ort', 'Besichtigung abgeschlossen', 'Fotos erstellt'], pctFrom: 14, pctTo: 21 },
  { key: 'gutachten', label: 'Gutachten wird erstellt', desc: 'Das Gutachten wird angefertigt.',
    subs: ['Gutachten in Bearbeitung', 'Gutachten hochgeladen', 'Qualitaetspruefung bestanden'], pctFrom: 21, pctTo: 35 },
  { key: 'kanzlei', label: 'Kanzlei uebernimmt', desc: 'Ihr Fall wurde an die Partnerkanzlei uebergeben.',
    subs: ['Mandat eroeffnet', 'Anspruchsschreiben an Versicherung'], pctFrom: 35, pctTo: 45 },
  { key: 'versicherung', label: 'Versicherung — Einwaende', desc: 'Die Versicherung hat Einwaende erhoben. Unsere Kanzlei kuemmert sich.',
    subs: [
      'Ansprueche eingereicht', 'Frist laeuft (14 Tage)', 'Keine Antwort — Nachfrage gesendet',
      'Ruege/Kuerzung erhalten', 'Stellungnahme wird erstellt',
      'Mahnung mit Verzugszinsen', 'Letzte Mahnung + Klageankuendigung',
      'Versicherung lenkt ein / Nachregulierung',
    ], pctFrom: 45, pctTo: 85 },
  { key: 'auszahlung', label: 'Auszahlung', desc: 'Ihr Geld wird ausgezahlt.',
    subs: ['Zahlung eingegangen', 'Auszahlung an Sie erfolgt', 'Fall abgeschlossen'], pctFrom: 85, pctTo: 100 },
]

const SZENARIO_PHASEN: Record<string, Phase[]> = {
  normalfall: NORMALFALL_PHASEN,
  ruegefall: RUEGEFALL_PHASEN,
  klagefall: RUEGEFALL_PHASEN, // Platzhalter
}

function berechneProgress(fall: Record<string, unknown>, phasen: Phase[]): { phase: number; subStep: number; pct: number } {
  const status = (fall.status as string) ?? 'ersterfassung'
  const sa = fall.sa_unterschrieben === true
  const kundeId = fall.kunde_id as string | null
  const svId = fall.sv_id as string | null
  const svTermin = fall.sv_termin as string | null
  const terminStatus = (fall.gutachter_termin_status as string) ?? ''
  const gutachtenAm = fall.gutachten_eingegangen_am as string | null
  const regulierungAm = fall.regulierung_am as string | null
  const ruegeAm = fall.ruege_erhalten_am as string | null

  // Helper: Prozent innerhalb einer Phase interpolieren
  function pct(phaseIdx: number, subIdx: number): number {
    const p = phasen[phaseIdx]
    if (!p) return 0
    const range = p.pctTo - p.pctFrom
    const subPct = p.subs.length > 0 ? (subIdx / p.subs.length) * range : 0
    return Math.round(p.pctFrom + subPct)
  }

  // Phase 8: Auszahlung
  if (status === 'abgeschlossen') return { phase: 7, subStep: 2, pct: 100 }
  if (regulierungAm) return { phase: 7, subStep: 1, pct: pct(7, 1) }

  // Phase 7: Versicherung (Ruegefall hat mehr Sub-Steps)
  if (status === 'regulierung') {
    if (ruegeAm) return { phase: 6, subStep: 7, pct: pct(6, 7) } // Nachregulierung
    return { phase: 6, subStep: 1, pct: pct(6, 1) }
  }
  if (status === 'anschlussschreiben') return { phase: 6, subStep: 0, pct: pct(6, 0) }

  // Phase 6: Kanzlei
  if (status === 'kanzlei-uebergeben') return { phase: 5, subStep: 0, pct: pct(5, 0) }

  // Phase 5: Gutachten
  if (status === 'filmcheck' || status === 'qc-pruefung') return { phase: 4, subStep: 2, pct: pct(4, 2) }
  if (gutachtenAm || status === 'gutachten-eingegangen') return { phase: 4, subStep: 1, pct: pct(4, 1) }

  // Phase 4: Besichtigung
  if (status === 'besichtigung') return { phase: 3, subStep: 1, pct: pct(3, 1) }

  // Phase 3: Gutachter
  if (terminStatus === 'bestaetigt' && svTermin) return { phase: 2, subStep: 2, pct: pct(2, 2) }
  if (svTermin) return { phase: 2, subStep: 1, pct: pct(2, 1) }
  if (svId) return { phase: 2, subStep: 0, pct: pct(2, 0) }

  // Phase 2: SA
  if (sa && kundeId) return { phase: 1, subStep: 2, pct: pct(1, 2) }
  if (sa) return { phase: 1, subStep: 1, pct: pct(1, 1) }

  // Phase 1: Kontakt
  if (status !== 'ersterfassung') return { phase: 0, subStep: 1, pct: pct(0, 1) }
  return { phase: 0, subStep: 0, pct: pct(0, 0) }
}
