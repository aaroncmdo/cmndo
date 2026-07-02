import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RueckrufActions from './RueckrufActions'
import { RueckrufeRealtimeRefresher } from './RueckrufeRealtimeRefresher'
import { RueckrufDeepLinkScroll } from './RueckrufDeepLinkScroll'
import PhoneButton from '@/components/shared/PhoneButton'
import EmptyState from '@/components/shared/EmptyState'
import { StatBar, type StatBarItem } from '@/components/shared/StatBar'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { PhoneOffIcon, PhoneCallIcon } from 'lucide-react'

// AAR-637: Rückrufe aus admin_termine (typ='rueckruf') lesen statt aus
// leads.rueckruf_*. Die Legacy-Spalten wurden gedroppt. Admin-Kalender-
// Rückrufe und Dispatch-Rückrufe sind jetzt dieselbe Liste.
//
// Redesign (02.07.): flache Liste -> Rückruf-Queue. Überfällige oben in einem
// eskalierten danger-Band, Kommende relativ nach Tag gruppiert (Heute/Morgen/
// Wochentag) als Zeit-Rail-Liste mit "Als Nächstes"-Marker — spiegelt die
// "Zeitplan"-Sprache aus mitarbeiter/termine. Datenschicht (Query + AAR-724
// mark-seen) unverändert; Zeiten jetzt Berlin-TZ (formatBerlin) statt naked
// toLocaleString (runtime-TZ-abhängig).

type RueckrufRow = {
  id: string
  start_zeit: string
  notizen: string | null
  lead_id: string | null
  // AAR-724: Noch nicht vom Dispatcher angesehen → roter Punkt.
  gesehen_am: string | null
  lead: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    email: string | null
    qualifizierungs_phase: string | null
    anruf_versuche: number | null
    letzter_anruf_am: string | null
    letzter_anruf_status: string | null
  } | null
}

export default async function DispatchRueckrufe({
  searchParams,
}: {
  searchParams?: Promise<{ open?: string }>
}) {
  // Deep-Link aus Notifications/Dashboard/Finder: ?open=<admin_termine.id>
  // fokussiert die betroffene Rückruf-Zeile (Highlight via Server-Ring +
  // sanftes Scroll via Client-Sidekick RueckrufDeepLinkScroll).
  const sp = (await searchParams) ?? {}
  const openId = sp.open ?? null
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('admin_termine')
    .select(
      'id, start_zeit, notizen, lead_id, gesehen_am, lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon, email, qualifizierungs_phase, anruf_versuche, letzter_anruf_am, letzter_anruf_status)',
    )
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .not('lead_id', 'is', null)
    .order('start_zeit', { ascending: true })

  const termine: RueckrufRow[] = ((raw ?? []) as unknown as RueckrufRow[]).map((t) => ({
    ...t,
    lead: Array.isArray(t.lead) ? t.lead[0] ?? null : t.lead,
  }))

  // AAR-724: Sobald der Dispatcher die Rückrufliste öffnet, markieren wir
  // alle ungesehenen Rückrufe als „gesehen". Die Render-Daten kommen aus
  // dem bereits gelesenen `termine`-Snapshot — die roten Punkte bleiben
  // für diesen Aufruf sichtbar und verschwinden beim nächsten Reload.
  const ungesehenIds = termine.filter((t) => !t.gesehen_am).map((t) => t.id)
  if (ungesehenIds.length > 0) {
    try {
      await supabase
        .from('admin_termine')
        .update({ gesehen_am: new Date().toISOString() })
        .in('id', ungesehenIds)
    } catch (err) {
      console.error('[AAR-724] mark-seen rueckrufe failed:', err)
    }
  }

  // ── Präsentation: nur Rückrufe mit Lead; Überfällige abtrennen; Rest relativ nach Tag ──
  const rows = termine.filter(
    (t): t is RueckrufRow & { lead: NonNullable<RueckrufRow['lead']> } => !!t.lead,
  )
  const now = Date.now()
  const berlinDay = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))
  const todayKey = berlinDay(new Date(now).toISOString())
  const tomorrowKey = berlinDay(new Date(now + 86_400_000).toISOString())

  const overdue = rows.filter((t) => new Date(t.start_zeit).getTime() < now)
  const upcoming = rows.filter((t) => new Date(t.start_zeit).getTime() >= now)
  // "Als Nächstes" = dringendstes Item: ältester Überfälliger, sonst nächster Anstehender.
  const nextId = overdue[0]?.id ?? upcoming[0]?.id ?? null
  const ungesehenCount = rows.filter((t) => !t.gesehen_am).length

  const dayGroups: { key: string; rows: typeof rows }[] = []
  for (const t of upcoming) {
    const k = berlinDay(t.start_zeit)
    const last = dayGroups[dayGroups.length - 1]
    if (last && last.key === k) last.rows.push(t)
    else dayGroups.push({ key: k, rows: [t] })
  }
  const dayLabel = (key: string) => {
    if (key === todayKey) return 'Heute'
    if (key === tomorrowKey) return 'Morgen'
    return new Date(key + 'T12:00:00').toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
  }

  const stats: StatBarItem[] = [
    { label: 'Offen', value: rows.length, icon: PhoneCallIcon },
    { label: 'Überfällig', value: overdue.length, tone: overdue.length ? 'danger' : 'default' },
    { label: 'Ungesehen', value: ungesehenCount, tone: ungesehenCount ? 'warning' : 'default' },
  ]

  // Eine Rückruf-Zeile: Zeit-Rail links (tabular), Node + Inhalt, Aktion rechts.
  // KEIN Full-Row-Link (die Zeile enthält interaktive Aktionen) — nur der Name linkt.
  function RueckrufZeile(t: (typeof rows)[number]) {
    const lead = t.lead
    const isOverdue = new Date(t.start_zeit).getTime() < now
    const isFocus = t.id === openId
    const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Lead'
    return (
      <div
        key={t.id}
        id={`rueckruf-${t.id}`}
        className={`flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
          isFocus ? 'bg-claimondo-ondo/[0.06] ring-1 ring-inset ring-claimondo-ondo/30' : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-stretch gap-3 sm:gap-4">
          {/* Zeit-Rail */}
          <div className="flex w-12 shrink-0 flex-col items-end pt-px text-right">
            <span
              className={`text-body-sm font-semibold tabular-nums ${
                isOverdue ? 'text-danger-strong' : 'text-claimondo-navy'
              }`}
            >
              {formatBerlin(t.start_zeit, { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isOverdue && (
              <span className="text-caption tabular-nums text-danger/70">
                {formatBerlin(t.start_zeit, { day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>
          {/* Node + Inhalt */}
          <div className="min-w-0 flex-1 border-l border-claimondo-border pl-3 sm:pl-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* AAR-724: Roter Punkt für noch nicht gesehene Rückrufe. */}
              {!t.gesehen_am && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-danger"
                  aria-label="Neu, noch nicht angesehen"
                />
              )}
              <Link
                href={`/dispatch/leads/${lead.id}`}
                className="truncate text-body-sm font-medium text-claimondo-navy hover:text-claimondo-ondo"
              >
                {name}
              </Link>
              {t.id === nextId && (
                <span className="rounded-full bg-claimondo-navy px-2 py-0.5 text-caption font-medium text-white">
                  Als Nächstes
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-claimondo-ondo">
              {lead.telefon && (
                <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
              )}
              {isOverdue && <span className="font-medium text-danger">überfällig</span>}
              <span>Versuche: {lead.anruf_versuche ?? 0}</span>
              {lead.letzter_anruf_am && (
                <span className="text-claimondo-ondo/70">
                  Letzter: {new Date(lead.letzter_anruf_am).toLocaleDateString('de-DE')}
                  {lead.letzter_anruf_status ? ` (${lead.letzter_anruf_status})` : ''}
                </span>
              )}
            </div>
            {t.notizen && (
              <p className="mt-0.5 truncate text-body-xs text-claimondo-ondo/70">{t.notizen}</p>
            )}
          </div>
        </div>
        {/* Aktion — mobil unter der Zeile (eine Instanz), Desktop rechts */}
        <div className="shrink-0 sm:self-center">
          <RueckrufActions leadId={lead.id} anrufVersuche={lead.anruf_versuche ?? 0} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 py-6">
      <RueckrufeRealtimeRefresher />
      {openId && <RueckrufDeepLinkScroll targetId={openId} />}

      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Rückrufe</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">
          Rückrufe, die auf einen Anruf warten — überfällige zuerst.
        </p>
      </div>

      {rows.length > 0 && <StatBar items={stats} />}

      {rows.length === 0 && <EmptyState icon={PhoneOffIcon} title="Keine offenen Rückrufe" />}

      {/* Überfällig — abgetrennt + priorisiert */}
      {overdue.length > 0 && (
        <section className="overflow-hidden rounded-ios-md border border-danger/30 bg-white">
          <div className="flex items-center justify-between border-b border-danger/20 bg-danger-soft/50 px-4 py-2.5">
            <h2 className="text-heading-sm font-semibold text-danger-strong">Überfällig</h2>
            <span className="text-body-sm font-medium text-danger-strong">{overdue.length}</span>
          </div>
          <div className="divide-y divide-claimondo-border">{overdue.map(RueckrufZeile)}</div>
        </section>
      )}

      {/* Kommende Rückrufe — relativ nach Tag */}
      {dayGroups.map((g) => {
        const isToday = g.key === todayKey
        return (
          <section
            key={g.key}
            className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white"
          >
            <div className="flex items-center justify-between border-b border-claimondo-border px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-heading-sm capitalize text-claimondo-navy">
                <span className={isToday ? 'font-semibold' : ''}>{dayLabel(g.key)}</span>
                {isToday && <span className="h-1.5 w-1.5 rounded-full bg-claimondo-ondo" aria-hidden />}
              </h2>
              <span className="text-body-sm text-claimondo-ondo">{g.rows.length}</span>
            </div>
            <div className="divide-y divide-claimondo-border">{g.rows.map(RueckrufZeile)}</div>
          </section>
        )
      })}
    </div>
  )
}
