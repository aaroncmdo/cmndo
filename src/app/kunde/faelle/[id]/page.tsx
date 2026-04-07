import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { berechneProgress, SZENARIO_PHASEN } from '@/components/kunde/stepperConfig'
import ScenarioStepper from '@/components/kunde/ScenarioStepper'
import FallDetailSections from './FallDetailSections'

export default async function KundeFallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()

    // Fall laden
    const { data: fall } = await supabase.from('faelle').select('*').eq('id', id).single()
    if (!fall) notFound()

    // Ownership: kunde_id oder lead-email
    const owned = fall.kunde_id === user.id
    if (!owned) {
      if (fall.lead_id) {
        const { data: lead } = await admin.from('leads').select('email').eq('id', fall.lead_id).single()
        if (lead?.email !== user.email) notFound()
      } else {
        notFound()
      }
    }

    // SV-Daten laden
    let svName: string | null = null
    let svTelefon: string | null = null
    if (fall.sv_id) {
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
      if (sv?.profile_id) {
        const { data: p } = await admin.from('profiles').select('vorname, nachname, telefon').eq('id', sv.profile_id).single()
        if (p) { svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || null; svTelefon = p.telefon }
      }
    }

    // KB-Daten laden
    let kbName: string | null = null
    if (fall.kundenbetreuer_id) {
      const { data: kb } = await admin.from('profiles').select('vorname, nachname').eq('id', fall.kundenbetreuer_id).single()
      if (kb) kbName = [kb.vorname, kb.nachname].filter(Boolean).join(' ') || null
    }

    // Dokumente laden
    const { data: dokumente } = await admin.from('dokumente')
      .select('id, typ, datei_url, datei_name, created_at')
      .eq('fall_id', id)
      .order('created_at')

    // Nachrichten laden (alle Kanaele inkl. Gruppe)
    const { data: nachrichten } = await admin.from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: true })

    // KFZ-129: Chat-Teilnehmer laden
    const { getChatTeilnehmer } = await import('@/lib/chatGruppe')
    const chatTeilnehmer = await getChatTeilnehmer(id)

    // Progress berechnen
    const szenario = ((fall.szenario as string) ?? 'normalfall') as keyof typeof SZENARIO_PHASEN
    const phasen = SZENARIO_PHASEN[szenario] ?? SZENARIO_PHASEN.normalfall
    const progress = berechneProgress(fall as Record<string, unknown>, phasen)

    const kennzeichen = (fall.kennzeichen as string) ?? ''
    const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
    const adresse = (fall.besichtigungsort_adresse as string) || (fall.unfallort as string) || [(fall.schadens_adresse as string), (fall.schadens_plz as string), (fall.schadens_ort as string)].filter(Boolean).join(', ') || ''

    return (
      <div className="w-full px-4 pt-5 pb-8 max-w-xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <Link href="/kunde" className="text-xs text-gray-400 hover:text-[#4573A2] mb-2 inline-block">&larr; Meine Faelle</Link>
          <h1 className="text-lg font-bold text-[#0D1B3E]">
            {kennzeichen || fall.fall_nummer || 'Schadensfall'}{fahrzeug ? ` — ${fahrzeug}` : ''}
          </h1>
          {adresse && <p className="text-sm text-gray-500 mt-0.5">{adresse}</p>}
        </div>

        {/* Stepper Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-base font-semibold text-[#0D1B3E]">Ihr Fortschritt</p>
            <span className="text-base font-bold text-[#4573A2]">{progress.pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full mb-5">
            <div className="h-full bg-[#4573A2] rounded-full transition-all duration-700" style={{ width: `${progress.pct}%` }} />
          </div>
          <ScenarioStepper phasen={phasen} progress={progress} />
          {szenario === 'ruegefall' && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <p className="text-xs text-amber-700 font-medium">Die Versicherung hat Einwaende erhoben. Unsere Partnerkanzlei kuemmert sich darum.</p>
            </div>
          )}
        </div>

        {/* Fall-Details + Dokumente + Chat */}
        <FallDetailSections
          fall={fall as Record<string, unknown>}
          svName={svName}
          svTelefon={svTelefon}
          kbName={kbName}
          dokumente={dokumente ?? []}
          nachrichten={nachrichten ?? []}
          userId={user.id}
          chatTeilnehmer={chatTeilnehmer}
        />
      </div>
    )
  } catch (err) {
    console.error('[KundeFallDetail] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-semibold">Fehler beim Laden</p>
        <p className="text-sm text-gray-500 mt-1">Bitte versuchen Sie es erneut.</p>
      </div>
    )
  }
}
