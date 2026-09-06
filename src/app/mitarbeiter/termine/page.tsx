// AAR-637: Mitarbeiter-Terminuebersicht. Zeigt alle meine admin_termine
// (zugewiesen_an = user.id) + KB-Beratungen. NEUKONZEPTION (Zeitplan statt
// flacher Tagesliste): Ueberfaellige abgetrennt + priorisiert oben; kommende
// Termine relativ nach Tag (Heute/Morgen/Wochentag) als Zeit-Rail-Liste mit
// "Als Naechstes"-Marker. Datenschicht unveraendert.

import { createClient } from '@/lib/supabase/server'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PhoneCallIcon, CalendarIcon, UsersIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { ladeInterneTerminNotizen } from '@/lib/termine/intern-notizen'
import KundentermineView from './_views/KundentermineView'

export const dynamic = 'force-dynamic'

const TYP_META: Record<string, { label: string; icon: typeof PhoneCallIcon; cls: string }> = {
  rueckruf: { label: 'Rückruf', icon: PhoneCallIcon, cls: 'bg-warning-soft text-warning-strong border-warning/30' },
  kunde: { label: 'Kunde', icon: UsersIcon, cls: 'bg-success-soft text-success-strong border-success/30' },
  intern: { label: 'Intern', icon: CalendarIcon, cls: 'bg-claimondo-bg text-claimondo-navy border-claimondo-border' },
  kb_beratung: { label: 'KB-Beratung', icon: CalendarIcon, cls: 'bg-claimondo-ondo/[0.06] text-claimondo-navy border-claimondo-ondo/30' },
}

// W2.8: Toggle „Meine Termine" / „Kundentermine" — kundentermine ist ?view= dieser Seite
// (vorher eigene Route /mitarbeiter/kundentermine).
function TermineTabs({ active }: { active: 'meine' | 'kundentermine' }) {
  const base = 'flex items-center gap-1.5 rounded-ios-lg px-3 py-1.5 text-body-xs font-medium whitespace-nowrap shrink-0 transition-colors'
  const on = 'bg-claimondo-shield text-white'
  const off = 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Link href="/mitarbeiter/termine" className={`${base} ${active === 'meine' ? on : off}`}>
        <CalendarIcon className="h-3.5 w-3.5" />Meine Termine
      </Link>
      <Link href="/mitarbeiter/termine?view=kundentermine" className={`${base} ${active === 'kundentermine' ? on : off}`}>
        <UsersIcon className="h-3.5 w-3.5" />Kundentermine
      </Link>
    </div>
  )
}

export default async function MitarbeiterTermine({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // W2.8 (Routen-Cleanup): Kundentermine ist ein ?view= dieser Seite statt eigener Route.
  // Pro Tab nur dessen Daten laden — die admin_termine/KB-Queries unten laufen nur im
  // Default-View.
  const view = (await searchParams)?.view === 'kundentermine' ? 'kundentermine' : 'meine'
  if (view === 'kundentermine') {
    return (
      <div className="space-y-5">
        <TermineTabs active="kundentermine" />
        <KundentermineView />
      </div>
    )
  }

  type TerminRow = {
    id: string
    typ: string
    titel: string
    start_zeit: string
    end_zeit: string | null
    status: string
    notizen: string | null
    lead_id: string | null
    fall_id: string | null
    lead: { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | { id: string; vorname: string | null; nachname: string | null; telefon: string | null }[] | null
    fall: { id: string; claim_nummer: string | null } | null
  }

  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const [adminR, kbR] = await Promise.all([
    supabase
      .from('admin_termine')
      .select(
        'id, typ, titel, start_zeit, end_zeit, status, notizen, lead_id, fall_id, ' +
          'lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon), ' +
          'fall:faelle_claim_bridge!admin_termine_fall_id_fkey(id:fall_id, claims:claims!fk_bridge_claim(claim_nummer))',
      )
      .eq('zugewiesen_an', user.id)
      .eq('status', 'offen')
      .gte('start_zeit', sinceIso)
      .order('start_zeit', { ascending: true }),
    // AAR-640: KB-Beratungen (gutachter_termine typ=kb_beratung, kb_id=user)
    supabase
      .from('gutachter_termine')
      .select(
        'id, start_zeit, end_zeit, status, fall_id, lead_id, kanal, ' +
          'fall:faelle_claim_bridge!gutachter_termine_fall_id_fkey(id:fall_id, claims:claims!fk_bridge_claim(claim_nummer, lead_id))',
      )
      .eq('typ', 'kb_beratung')
      .eq('kb_id', user.id)
      .in('status', ['reserviert', 'bestaetigt'])
      .is('cancelled_at', null)
      .gte('start_zeit', sinceIso)
      .order('start_zeit', { ascending: true }),
  ])

  // CMM-44 SP-A3: claim_nummer aus dem nested claims-Embed auf das flache
  // TerminRow.fall normalisieren (Array|Objekt je nach Cardinality).
  type ClaimNrJoin = { claim_nummer: string | null } | { claim_nummer: string | null }[] | null
  // CMM-49 #2688-Fix: KB-fall liest lead_id jetzt aus dem nested claims-Embed (faelle-Embed
  // ueber bridge, faelle.lead_id direkt nicht mehr resolvebar).
  type ClaimNrLeadJoin = { claim_nummer: string | null; lead_id: string | null } | { claim_nummer: string | null; lead_id: string | null }[] | null
  const adminTermine: TerminRow[] = ((adminR.data ?? []) as unknown as Array<
    Omit<TerminRow, 'fall'> & {
      fall: { id: string; claims: ClaimNrJoin } | { id: string; claims: ClaimNrJoin }[] | null
    }
  >).map((t) => {
    const fallRaw = t.fall as unknown
    const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { id: string; claims: ClaimNrJoin } | null)
    const claim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    return { ...t, fall: fall ? { id: fall.id, claim_nummer: claim?.claim_nummer ?? null } : null }
  })
  type KbRow = {
    id: string
    start_zeit: string
    end_zeit: string | null
    status: string
    fall_id: string | null
    lead_id: string | null
    kanal: string | null
    fall: { id: string; claims: ClaimNrLeadJoin } | { id: string; claims: ClaimNrLeadJoin }[] | null
  }
  const kbTermineRaw = (kbR.data ?? []) as unknown as KbRow[]
  // notiz_intern lebt jetzt in gutachter_termine_intern (Staff-only, Kunde-Leak-Fix).
  const kbInternNotizen = await ladeInterneTerminNotizen(supabase, kbTermineRaw.map(k => k.id))

  // Namen für KB-Leads laden (via fall.lead_id oder direkt kb.lead_id)
  const kbLeadIds = [
    ...new Set(
      kbTermineRaw
        .map(k => {
          const fallRaw = k.fall as unknown
          const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { claims: ClaimNrLeadJoin } | null)
          const claim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
          return claim?.lead_id ?? k.lead_id
        })
        .filter(Boolean) as string[],
    ),
  ]
  const kbLeadNameMap: Record<string, string> = {}
  if (kbLeadIds.length > 0) {
    const { data: leads } = await supabase.from('leads').select('id, vorname, nachname').in('id', kbLeadIds)
    for (const l of leads ?? []) kbLeadNameMap[l.id] = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
  }

  const kbAsTermine: TerminRow[] = kbTermineRaw.map(k => {
    const fallRaw = k.fall as unknown
    const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { id: string; claims: ClaimNrLeadJoin } | null)
    const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    const namesLeadId = fallClaim?.lead_id ?? k.lead_id
    const kundenName = namesLeadId ? kbLeadNameMap[namesLeadId] : null
    return {
      id: k.id,
      typ: 'kb_beratung',
      titel: kundenName ? `KB-Beratung · ${kundenName}` : 'KB-Beratung',
      start_zeit: k.start_zeit,
      end_zeit: k.end_zeit,
      status: k.status,
      notizen: kbInternNotizen[k.id] ?? null,
      lead_id: k.lead_id,
      fall_id: k.fall_id,
      lead: null,
      fall: fall ? { id: fall.id, claim_nummer: fallClaim?.claim_nummer ?? null } : null,
    }
  })

  const termine = [...adminTermine, ...kbAsTermine].sort(
    (a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime(),
  )

  // ── Praesentations-Logik: Ueberfaellig abtrennen + relativ nach Tag gruppieren ──
  const now = new Date()
  const berlinDay = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const todayKey = berlinDay(now.toISOString())
  const tomorrowKey = berlinDay(new Date(now.getTime() + 86_400_000).toISOString())

  const overdue = termine.filter((t) => new Date(t.start_zeit) < now)
  const upcoming = termine.filter((t) => new Date(t.start_zeit) >= now)
  const nextId = upcoming[0]?.id ?? null

  const dayGroups: { key: string; rows: TerminRow[] }[] = []
  for (const t of upcoming) {
    const k = berlinDay(t.start_zeit)
    const last = dayGroups[dayGroups.length - 1]
    if (last && last.key === k) last.rows.push(t)
    else dayGroups.push({ key: k, rows: [t] })
  }
  const dayLabel = (key: string) => {
    if (key === todayKey) return 'Heute'
    if (key === tomorrowKey) return 'Morgen'
    return new Date(key + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
  }

  const heuteCount = dayGroups.find((g) => g.key === todayKey)?.rows.length ?? 0
  const summaryParts: string[] = []
  if (overdue.length) summaryParts.push(`${overdue.length} überfällig`)
  summaryParts.push(`${heuteCount} heute`)
  summaryParts.push(`${termine.length} gesamt`)

  // Eine Termin-Zeile: Zeit-Rail links (tabular), Node + Inhalt rechts. Volle Klickflaeche.
  function TerminZeile(t: TerminRow) {
    const meta = TYP_META[t.typ] ?? TYP_META.intern
    const Icon = meta.icon
    const leadRaw = t.lead as unknown
    const lead = Array.isArray(leadRaw) ? leadRaw[0] ?? null : (leadRaw as { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | null)
    const fall = t.fall
    const subject = lead
      ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Lead'
      : fall?.claim_nummer ?? t.titel
    const href =
      t.typ === 'kb_beratung'
        ? `/mitarbeiter/konsultation/${t.id}`
        : lead
        ? `/dispatch/leads/${lead.id}`
        : fall
        ? `/faelle/${fall.id}`
        : null
    const isOverdue = new Date(t.start_zeit) < now
    // Ziel-loser Termin (kein lead + kein fall, non-KB) -> nicht-klickbar statt totem href='#'.
    const zeile = (
      <>
        {/* Zeit-Rail */}
        <div className="flex w-12 shrink-0 flex-col items-end pt-px text-right">
          <span className={`text-body-sm font-semibold tabular-nums ${isOverdue ? 'text-danger-strong' : 'text-claimondo-navy'}`}>
            {formatBerlin(t.start_zeit, { hour: '2-digit', minute: '2-digit' })}
          </span>
          {t.end_zeit && (
            <span className="text-caption tabular-nums text-claimondo-ondo/60">
              {formatBerlin(t.end_zeit, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {/* Node + Inhalt */}
        <div className="min-w-0 flex-1 border-l border-claimondo-border pl-3 sm:pl-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium ${meta.cls}`}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
            {t.id === nextId && (
              <span className="rounded-full bg-claimondo-navy px-2 py-0.5 text-caption font-medium text-white">Als Nächstes</span>
            )}
          </div>
          <p className="mt-1 truncate text-body-sm font-medium text-claimondo-navy">{subject}</p>
          {(t.notizen || isOverdue) && (
            <p className={`mt-0.5 truncate text-body-xs ${isOverdue ? 'font-medium text-danger' : 'text-claimondo-ondo'}`}>
              {isOverdue && 'überfällig'}
              {isOverdue && t.notizen && ' · '}
              {t.notizen}
            </p>
          )}
        </div>
        {/* Telefon (Desktop) */}
        {lead?.telefon && (
          <span className="hidden shrink-0 self-center text-body-xs text-claimondo-ondo/70 sm:block">{lead.telefon}</span>
        )}
      </>
    )
    return href ? (
      <Link key={t.id} href={href} className="group flex items-stretch gap-3 px-4 py-3 transition-colors hover:bg-claimondo-bg sm:gap-4">
        {zeile}
      </Link>
    ) : (
      <div key={t.id} className="group flex items-stretch gap-3 px-4 py-3 sm:gap-4">
        {zeile}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <TermineTabs active="meine" />
      <PageHeader
        title="Zeitplan"
        description={termine.length === 0 ? 'Rückrufe und Kundentermine, die Ihnen zugewiesen sind.' : summaryParts.join(' · ')}
        size="lg"
      />

      {termine.length === 0 && (
        <div className="rounded-ios-md border border-claimondo-border bg-white px-6 py-16 text-center text-body-sm text-claimondo-ondo/70">
          Keine offenen Termine
        </div>
      )}

      {/* Ueberfaellig — abgetrennt + priorisiert */}
      {overdue.length > 0 && (
        <section className="overflow-hidden rounded-ios-md border border-danger/30 bg-white">
          <div className="flex items-center justify-between border-b border-danger/20 bg-danger-soft/50 px-4 py-2.5">
            <h2 className="text-heading-sm font-semibold text-danger-strong">Überfällig</h2>
            <span className="text-body-sm font-medium text-danger-strong">{overdue.length}</span>
          </div>
          <div className="divide-y divide-claimondo-border">{overdue.map(TerminZeile)}</div>
        </section>
      )}

      {/* Kommende Termine — relativ nach Tag */}
      {dayGroups.map((g) => {
        const isToday = g.key === todayKey
        return (
          <section key={g.key} className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
            <div className="flex items-center justify-between border-b border-claimondo-border px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-heading-sm capitalize text-claimondo-navy">
                <span className={isToday ? 'font-semibold' : ''}>{dayLabel(g.key)}</span>
                {isToday && <span className="h-1.5 w-1.5 rounded-full bg-claimondo-ondo" aria-hidden />}
              </h2>
              <span className="text-body-sm text-claimondo-ondo">{g.rows.length}</span>
            </div>
            <div className="divide-y divide-claimondo-border">{g.rows.map(TerminZeile)}</div>
          </section>
        )
      })}
    </div>
  )
}
