import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { berechneProgress, SZENARIO_PHASEN } from '@/components/kunde/stepperConfig'

export default async function KundeStartseite() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  try {
  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname')
    .eq('id', user.id)
    .single()

  // Alle Faelle des Kunden
  let faelle: Record<string, unknown>[] = []

  const { data: directFaelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sa_unterschrieben, sv_id, sv_termin, gutachten_eingegangen_am, gutachter_termin_status, regulierung_am, szenario, onboarding_complete, kunde_id, kundenbetreuer_id, polizei_vor_ort, created_at')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })

  faelle = directFaelle ?? []

  // Fallback via Lead-Email
  if (faelle.length === 0) {
    const { data: leads } = await supabase.from('leads').select('id').eq('email', user.email!)
    const leadIds = (leads ?? []).map(l => l.id)
    if (leadIds.length) {
      const { data } = await supabase
        .from('faelle')
        .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sa_unterschrieben, sv_id, sv_termin, gutachten_eingegangen_am, gutachter_termin_status, regulierung_am, szenario, onboarding_complete, kunde_id, kundenbetreuer_id, polizei_vor_ort, created_at')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
      faelle = data ?? []
    }
  }

  // KFZ-207: Auto-Reaktivierung kalt-Lead wenn Kunde Portal öffnet
  try {
    const { createAdminClient: createAdmin } = await import('@/lib/supabase/admin')
    const admin = createAdmin()
    const { data: kaltLeads } = await admin.from('leads')
      .select('id, vorname, nachname')
      .eq('email', user.email!)
      .eq('qualifizierungs_phase', 'kalt')
    for (const lead of kaltLeads ?? []) {
      await admin.from('leads').update({ qualifizierungs_phase: 'in-qualifizierung', updated_at: new Date().toISOString() }).eq('id', lead.id)
      // Fall-ID für Task + Timeline ermitteln
      const { data: linkedFall } = await admin.from('faelle').select('id').eq('lead_id', lead.id).limit(1).maybeSingle()
      const fallId = linkedFall?.id ?? null
      await admin.from('tasks').insert({ fall_id: fallId, titel: `Lead reaktiviert: ${lead.vorname ?? ''} ${lead.nachname ?? ''} (Portal geöffnet)`, typ: 'dispatch', prioritaet: 'dringend', status: 'offen' })
      // Timeline-Entry
      if (fallId) {
        await admin.from('timeline').insert({ fall_id: fallId, typ: 'system', titel: 'Lead reaktiviert (Kunde hat Portal geöffnet)', beschreibung: `${lead.vorname ?? ''} ${lead.nachname ?? ''} war kalt, hat sich selbst reaktiviert.` })
      }
    }
  } catch { /* non-critical */ }

  // Onboarding-Redirect
  // BUG-63: Redirect auf Fall-Detail statt /kunde/onboarding (Route existiert nicht)
  const needsOnboarding = faelle.find(f => f.onboarding_complete === false)
  if (needsOnboarding) redirect(`/kunde/faelle/${needsOnboarding.id}`)

  // KFZ-128: Ungelesene Nachrichten pro Fall zaehlen (non-critical)
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const faelleWithUnread = await Promise.all(faelle.map(async (f) => {
      const { count } = await admin
        .from('nachrichten')
        .select('id', { count: 'exact', head: true })
        .eq('fall_id', f.id as string)
        .eq('gelesen', false)
        .neq('sender_id', user.id)
      return { ...f, ungelesene_nachrichten: count ?? 0 }
    }))
    // Sortierung: Faelle mit ungelesenen Nachrichten OBEN
    faelleWithUnread.sort((a, b) => b.ungelesene_nachrichten - a.ungelesene_nachrichten)
    faelle = faelleWithUnread
  } catch (e) {
    console.error('[KundeStartseite] Ungelesene Nachrichten Fehler:', e)
    // Seite funktioniert trotzdem — ohne Badges
  }

  // AAR-125: Prüfen ob Polizeibericht fehlt für Fälle mit polizei_vor_ort=true
  // Banner-Trigger: Fall hat polizei_vor_ort=true UND kein polizeibericht-Doc mit URL.
  const polizeiFaelleIds = faelle
    .filter((f) => f.polizei_vor_ort === true)
    .map((f) => f.id as string)
  let polizeiBerichtFehltFallId: string | null = null
  if (polizeiFaelleIds.length) {
    const { data: dokumente } = await supabase
      .from('pflichtdokumente')
      .select('fall_id, dokument_typ, dokument_url')
      .in('fall_id', polizeiFaelleIds)
      .eq('dokument_typ', 'polizeibericht')
    const hatBerichtFallIds = new Set(
      (dokumente ?? []).filter((d) => d.dokument_url).map((d) => d.fall_id as string),
    )
    polizeiBerichtFehltFallId = polizeiFaelleIds.find((id) => !hatBerichtFallIds.has(id)) ?? null
  }

  const vorname = profile?.vorname ?? user.email?.split('@')[0] ?? 'Kunde'

  // KFZ-200: SV unterwegs / vor Ort Status laden (non-critical)
  let svUnterwegsInfo: {
    fallId: string
    svVorname: string
    svUnterwegs: boolean
    svVorOrt: boolean
    etaMinuten: number | null
  } | null = null
  try {
    const fallIds = faelle.map(f => f.id as string).filter(Boolean)
    if (fallIds.length) {
      const { createAdminClient: adminCl } = await import('@/lib/supabase/admin')
      const adminDb = adminCl()
      const { data: aktiveTermine } = await adminDb
        .from('gutachter_termine')
        .select('id, fall_id, sv_id, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, status')
        .in('fall_id', fallIds)
        .eq('typ', 'sv_begutachtung')
        .not('sv_unterwegs_seit', 'is', null)
        .is('durchgefuehrt_am', null)
        .order('sv_unterwegs_seit', { ascending: false })
        .limit(1)

      const t = aktiveTermine?.[0]
      if (t) {
        let svName = 'Gutachter'
        if (t.sv_id) {
          const { data: sv } = await adminDb.from('sachverstaendige').select('profile_id').eq('id', t.sv_id).single()
          if (sv?.profile_id) {
            const { data: p } = await adminDb.from('profiles').select('vorname').eq('id', sv.profile_id).single()
            if (p?.vorname) svName = p.vorname
          }
        }
        svUnterwegsInfo = {
          fallId: String(t.fall_id),
          svVorname: svName,
          svUnterwegs: !t.sv_angekommen_am,
          svVorOrt: !!t.sv_angekommen_am,
          etaMinuten: t.sv_eta_minuten ? Number(t.sv_eta_minuten) : null,
        }
      }
    }
  } catch { /* non-critical */ }

  return (
    <div className="w-full px-4 md:px-8 py-6 max-w-xl md:max-w-none mx-auto">
      <h1 className="text-xl font-bold text-[#0D1B3E] mb-1">Hallo {vorname}</h1>
      <p className="text-sm text-gray-500 mb-6">Hier sehen Sie den Stand Ihrer Fälle.</p>

      {/* AAR-125: Polizeibericht-fehlt Banner */}
      {polizeiBerichtFehltFallId && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Polizeibericht fehlt</p>
              <p className="text-xs text-amber-700 mt-1">
                Die Polizei war bei Ihrem Unfall vor Ort. Bitte laden Sie den Polizeibericht hoch,
                sobald Sie ihn haben. Falls er bis zum Besichtigungstermin nicht vorliegt,
                nimmt der Gutachter die Daten vor Ort auf.
              </p>
              <Link
                href="/kunde/onboarding?step=dokumente"
                className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-900 hover:text-amber-700"
              >
                Jetzt hochladen →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KFZ-200: SV unterwegs Banner */}
      {svUnterwegsInfo?.svUnterwegs && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🚗</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Ihr Gutachter ist unterwegs!</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {svUnterwegsInfo.svVorname} ist auf dem Weg zu Ihnen.
                {svUnterwegsInfo.etaMinuten ? ` Ankunft in ca. ${svUnterwegsInfo.etaMinuten} Min.` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KFZ-200: SV vor Ort Banner */}
      {svUnterwegsInfo?.svVorOrt && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">✅</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-900">Ihr Gutachter ist vor Ort!</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {svUnterwegsInfo.svVorname} führt gerade die Begutachtung durch.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AAR-101: Beratungstermin-Card entfernt (KB bucht Videotermine via Google Calendar) */}

      {faelle.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-[#0D1B3E] font-semibold">Noch kein Schadensfall</p>
          <p className="text-sm text-gray-500 mt-1">Sobald ein Fall für Sie angelegt wird, erscheint er hier.</p>
        </div>
      ) : (
        <div className="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">
          {faelle.map(fall => {
            const szenario = ((fall.szenario as string) ?? 'normalfall') as keyof typeof SZENARIO_PHASEN
            const phasen = SZENARIO_PHASEN[szenario] ?? SZENARIO_PHASEN.normalfall
            const progress = berechneProgress(fall, phasen)
            const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
            const currentPhase = phasen[progress.phase]

            return (
              <Link key={fall.id as string} href={`/kunde/faelle/${fall.id}`}
                className="block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow active:scale-[0.99]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[#0D1B3E] font-semibold text-base">{(fall.kennzeichen as string) || (fall.fall_nummer as string) || 'Fall'}</p>
                    {fahrzeug && <p className="text-sm text-gray-500">{fahrzeug}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {((fall as Record<string, unknown>).ungelesene_nachrichten as number) > 0 && (
                      <span className="inline-flex items-center gap-0.5 bg-[#4573A2] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        💬 {(fall as Record<string, unknown>).ungelesene_nachrichten as number}
                      </span>
                    )}
                    <span className="text-sm font-bold text-[#4573A2]">{progress.pct}%</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full mb-3">
                  <div className="h-full bg-[#4573A2] rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="text-sm font-medium text-[#0D1B3E]">{currentPhase?.label ?? 'In Bearbeitung'}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
  } catch (err) {
    console.error('[KundeStartseite] Error:', err)
    return (
      <div className="w-full px-4 md:px-8 py-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-[#0D1B3E] font-semibold">Fehler beim Laden</p>
          <p className="text-sm text-gray-500 mt-1">Bitte versuchen Sie es erneut.</p>
        </div>
      </div>
    )
  }
}
