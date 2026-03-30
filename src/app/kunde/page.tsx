import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import KundeBottomSheet from './KundeBottomSheet'
import MeineAufgabenServer from '@/components/MeineAufgabenServer'

const STATUS_STEPS = [
  { key: 'ersterfassung', label: 'Meldung' },
  { key: 'sv-zugewiesen', label: 'Gutachter' },
  { key: 'gutachten-eingegangen', label: 'Besichtigung' },
  { key: 'filmcheck', label: 'Gutachten' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei' },
  { key: 'regulierung', label: 'Versicherung' },
  { key: 'abgeschlossen', label: 'Auszahlung' },
]

const STATUS_TO_STEP: Record<string, number> = {
  ersterfassung: 0, 'sv-zugewiesen': 1, 'sv-termin': 2, besichtigung: 2,
  'gutachten-eingegangen': 3, filmcheck: 3, 'qc-pruefung': 3,
  'kanzlei-uebergeben': 4, anschlussschreiben: 5, regulierung: 5,
  abgeschlossen: 6, storniert: -1,
}

const STATUS_GRADIENT: Record<string, string> = {
  laufend: 'linear-gradient(135deg, #3b82f6, #6366f1)',
  warten: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  erfolg: 'linear-gradient(135deg, #10b981, #059669)',
  abgeschlossen: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
}

const NEXT_STEP_TEXT: Record<string, string> = {
  ersterfassung: 'Ihr Fall wird geprüft. Ein Gutachter wird Ihnen zugewiesen.',
  'sv-zugewiesen': 'Ihr Gutachter meldet sich für einen Termin.',
  'sv-termin': 'Der Besichtigungstermin steht. Bitte halten Sie das Fahrzeug bereit.',
  besichtigung: 'Die Besichtigung läuft. Nach Abschluss erhalten Sie das Gutachten.',
  'gutachten-eingegangen': 'Das Gutachten wird geprüft und an die Kanzlei übergeben.',
  filmcheck: 'Die Qualitätsprüfung läuft.',
  'kanzlei-uebergeben': 'Die Kanzlei hat Ihren Fall übernommen und setzt Ihren Anspruch durch.',
  anschlussschreiben: 'Das Anspruchsschreiben wurde an die Versicherung gesendet.',
  regulierung: 'Die Versicherung bearbeitet Ihren Fall. Wir melden uns bei Neuigkeiten.',
  abgeschlossen: 'Ihr Schadensfall wurde erfolgreich abgeschlossen!',
}

function getStatusPhase(status: string) {
  if (status === 'abgeschlossen') return 'abgeschlossen'
  if (status === 'regulierung' || status === 'anschlussschreiben') return 'warten'
  if (['kanzlei-uebergeben', 'filmcheck', 'gutachten-eingegangen'].includes(status)) return 'laufend'
  return 'laufend'
}

function fmtCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

export default async function KundeDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname')
    .eq('id', user.id)
    .single()

  // Fetch case
  let fall: Record<string, unknown> | null = null
  const { data: directFall } = await supabase
    .from('faelle')
    .select('*')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  fall = directFall

  if (!fall) {
    const { data: leads } = await supabase.from('leads').select('id').eq('email', user.email!)
    const leadIds = (leads ?? []).map(l => l.id)
    if (leadIds.length) {
      const { data } = await supabase
        .from('faelle')
        .select('*')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      fall = data
    }
  }

  if (fall && fall.onboarding_complete === false) {
    redirect(`/kunde/onboarding/${fall.id}`)
  }

  const vorname = profile?.vorname ?? user.email?.split('@')[0] ?? 'Kunde'

  if (!fall) {
    return (
      <div className="px-5 py-8">
        <p className="text-white text-xl font-bold mb-1" style={{ letterSpacing: '-0.03em' }}>
          Hallo {vorname}
        </p>
        <div className="mt-8 rounded-3xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-4xl mb-3">📋</div>
          <p className="text-white font-semibold">Noch kein Schadensfall</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Sobald ein Fall für Sie angelegt wird, erscheint er hier.
          </p>
        </div>
      </div>
    )
  }

  const fallId = fall.id as string
  const status = fall.status as string
  const stepIdx = STATUS_TO_STEP[status] ?? 0
  const phase = getStatusPhase(status)

  // Fetch betreuer
  let betreuer: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null } | null = null
  if (fall.kundenbetreuer_id) {
    const { data } = await supabase.from('profiles').select('vorname, nachname, email, telefon').eq('id', fall.kundenbetreuer_id as string).single()
    betreuer = data
  }

  // Estimate total
  const schadenhoehe = (fall.schadenhoehe_netto as number) ?? null
  const nutzungsausfall = ((fall.nutzungsausfall_tage as number) ?? 0) * ((fall.nutzungsausfall_tagessatz as number) ?? 0)
  const gutachterHonorar = (fall.gutachter_honorar as number) ?? 0
  const anwaltskosten = schadenhoehe ? schadenhoehe * 0.13 : 0
  const total = (fall.regulierung_betrag as number) ?? (schadenhoehe ? schadenhoehe + nutzungsausfall + gutachterHonorar + anwaltskosten : null)
  const gutachtenDatum = fall.gutachten_eingegangen_am ? new Date(fall.gutachten_eingegangen_am as string).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

  // Breakdown data for bottom sheet
  const breakdown = total != null ? {
    schadenhoehe: schadenhoehe ?? 0,
    nutzungsausfall,
    gutachterHonorar,
    anwaltskosten,
    total,
    regulierungBetrag: (fall.regulierung_betrag as number) ?? null,
  } : null

  return (
    <div className="px-5 py-6">
      {/* Greeting */}
      <p className="text-xl font-bold text-white mb-5 kunde-animate kunde-animate-1" style={{ letterSpacing: '-0.03em' }}>
        Hallo {vorname}
      </p>

      {/* Meine Aufgaben */}
      {/* @ts-expect-error Async Server Component */}
      <MeineAufgabenServer mode="user" rolle="kunde" title="Was Sie noch tun muessen" fallLinkPrefix="/kunde/fall/" />
      <div className="mb-4" />

      {/* Hero Status Card */}
      <div className="kunde-animate kunde-animate-2">
        <div className="rounded-3xl p-6 mb-5 relative overflow-hidden cursor-pointer" style={{ background: STATUS_GRADIENT[phase], minHeight: 180 }}>
          <Link href={`/kunde/fall/${fallId}`} className="absolute inset-0 z-10" />
          {/* Subtle overlay glow */}
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)' }} />

          {total != null ? (
            <>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1" style={{ letterSpacing: '0.05em' }}>
                Voraussichtliche Auszahlung
              </p>
              <p className="text-white font-extrabold tabular-nums mb-1" style={{ fontSize: 36, letterSpacing: '-0.03em' }}>
                {fmtCurrency(total)}
              </p>
              {gutachtenDatum && (
                <p className="text-white/50 text-xs mb-3">Basierend auf Gutachten vom {gutachtenDatum}</p>
              )}
              {/* Bottom sheet trigger - sits above the Link */}
              <KundeBottomSheet breakdown={breakdown!} />
            </>
          ) : (
            <>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1" style={{ letterSpacing: '0.05em' }}>
                Ihr Schadensfall
              </p>
              <p className="text-white font-bold text-lg mb-4">
                {fall.fall_nummer as string}
              </p>
            </>
          )}

          <p className="text-white/80 text-sm font-medium relative">
            {NEXT_STEP_TEXT[status] ?? 'Ihr Fall wird bearbeitet.'}
          </p>
        </div>
      </div>

      {/* Progress Stepper */}
      {status !== 'storniert' && (
        <div className="mb-5 rounded-3xl p-5 kunde-animate kunde-animate-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-medium uppercase mb-4" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
            Fortschritt
          </p>
          <div className="flex items-center gap-0">
            {STATUS_STEPS.map((step, i) => {
              const reached = i <= stepIdx
              const isCurrent = i === stepIdx
              return (
                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
                    isCurrent
                      ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]'
                      : reached
                      ? 'bg-blue-500/60'
                      : 'bg-zinc-800'
                  }`} className={isCurrent ? 'kunde-step-active' : ''} />
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-0.5 ${i < stepIdx ? 'bg-blue-500/40' : 'bg-zinc-800'}`} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex mt-2">
            {STATUS_STEPS.map((step, i) => (
              <div key={step.key} className="flex-1 last:flex-none">
                <span className="text-[9px]" style={{
                  color: i === stepIdx ? '#93bbfc' : i <= stepIdx ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
                  fontWeight: i === stepIdx ? 600 : 400,
                }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Step Card */}
      <div className="mb-5 rounded-3xl p-5 kunde-animate kunde-animate-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs font-medium uppercase mb-2" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
          Was passiert als nächstes?
        </p>
        <p className="text-white text-sm leading-relaxed">
          {NEXT_STEP_TEXT[status] ?? 'Ihr Fall wird bearbeitet. Wir melden uns bei Neuigkeiten.'}
        </p>
      </div>

      {/* Ansprechpartner */}
      <div className="grid grid-cols-2 gap-3 mb-5 kunde-animate kunde-animate-5">
        {/* Kundenbetreuer */}
        <div className="rounded-3xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] font-medium uppercase mb-3" style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
            Ihr Betreuer
          </p>
          {betreuer ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                  <span className="text-white text-[10px] font-bold">
                    {(betreuer.vorname?.[0] ?? '').toUpperCase()}{(betreuer.nachname?.[0] ?? '').toUpperCase()}
                  </span>
                </div>
                <p className="text-white text-xs font-medium truncate">
                  {[betreuer.vorname, betreuer.nachname].filter(Boolean).join(' ')}
                </p>
              </div>
              <div className="space-y-1.5">
                {betreuer.telefon && (
                  <a href={`tel:${betreuer.telefon}`} className="flex items-center gap-1.5 text-blue-400 text-[11px] hover:text-blue-300">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                    Anrufen
                  </a>
                )}
                <Link href="/kunde/chat" className="flex items-center gap-1.5 text-emerald-400 text-[11px] hover:text-emerald-300">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
                  Chat
                </Link>
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Wird zugewiesen</p>
          )}
        </div>

        {/* Kanzlei */}
        <div className="rounded-3xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] font-medium uppercase mb-3" style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
            Ihre Kanzlei
          </p>
          {(fall.kanzlei_ansprechpartner_name as string) ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-cyan-400"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>
                </div>
                <p className="text-white text-xs font-medium truncate">
                  {fall.kanzlei_ansprechpartner_name as string}
                </p>
              </div>
              {(fall.kanzlei_ansprechpartner_telefon as string) && (
                <a href={`tel:${fall.kanzlei_ansprechpartner_telefon}`} className="flex items-center gap-1.5 text-blue-400 text-[11px] hover:text-blue-300">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                  Anrufen
                </a>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Nach Kanzlei-Übergabe</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href={`/kunde/fall/${fallId}`}
          className="rounded-3xl p-4 text-center transition-all hover:scale-[1.02]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          <p className="text-white text-xs font-medium">Alle Details</p>
        </Link>
        <Link href="/kunde/dokumente"
          className="rounded-3xl p-4 text-center transition-all hover:scale-[1.02]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
          <p className="text-white text-xs font-medium">Dokument hochladen</p>
        </Link>
      </div>
    </div>
  )
}
