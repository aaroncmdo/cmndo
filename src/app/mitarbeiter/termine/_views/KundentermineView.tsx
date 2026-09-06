// Mitarbeiter-Kundentermine — jetzt ?view=kundentermine der /mitarbeiter/termine-Seite
// (W2.8 Routen-Cleanup: vorher eigene Route /mitarbeiter/kundentermine, 1:1 dasselbe
// Zeit-Rail/Tag-Gruppen-Layout wie „Meine Termine", nur andere Datenquelle).
// Zeigt SV-Besichtigungen der Fälle die ich als KB/LB betreue
// (claims.kundenbetreuer_id = user.id) — nur lesend, ich bin nicht vor Ort.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UsersIcon, MapPinIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

// CMM-49 #2688-Fix: faelle-Embed laeuft jetzt ueber faelle_claim_bridge (die fall_id-FKs
// zeigen nach #2688 auf bridge). kundenbetreuer_id + lead_id wandern in den nested
// claims-Embed (claims = SSoT, 0-diff; faelle.* direkt nicht mehr resolvebar).
type ClaimJoin = { claim_nummer: string | null; kundenbetreuer_id: string | null; lead_id: string | null } | { claim_nummer: string | null; kundenbetreuer_id: string | null; lead_id: string | null }[] | null

type GutachterTerminRow = {
  id: string
  start_zeit: string
  end_zeit: string | null
  status: string
  kanal: string | null
  adresse: string | null
  fall_id: string | null
  assignee_id: string | null
  assignee_typ: string | null
  fall:
    | { id: string; claims: ClaimJoin }
    | { id: string; claims: ClaimJoin }[]
    | null
}

export default async function KundentermineView() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  // SV-Termine der Fälle wo ich KB bin. Join fall → kundenbetreuer_id=me.
  const { data: termineRaw } = await supabase
    .from('gutachter_termine')
    .select(
      // CMM-Drift-Fix (16.07.): gutachter_termine hat besichtigungsort_adresse, KEIN adresse
      // (gleiche Spalte wie #4251/sv-event-sync — diese Stelle wurde dort verpasst). Der
      // Select warf PostgREST-400 -> die KB-Kundentermine-Seite lud NIE Termine. Alias haelt
      // Typ + UI (t.adresse) stabil.
      'id, start_zeit, end_zeit, status, kanal, adresse:besichtigungsort_adresse, fall_id, assignee_id, assignee_typ, ' +
        'fall:faelle_claim_bridge!gutachter_termine_fall_id_fkey(id:fall_id, claims:claims!fk_bridge_claim(claim_nummer, kundenbetreuer_id, lead_id))',
    )
    .neq('typ', 'kb_beratung')
    .in('status', ['reserviert', 'bestaetigt'])
    .is('cancelled_at', null)
    .gte('start_zeit', sinceIso)
    .order('start_zeit', { ascending: true })
    .limit(200)

  const termineAll = (termineRaw ?? []) as unknown as GutachterTerminRow[]

  // Filter auf fall.kundenbetreuer_id = user.id (server-side). Wir filtern
  // hier client-side nach dem Query, weil Supabase Nested-FK-Filter nicht
  // immer zuverlässig durchreicht. Bei Bedarf als RLS-Policy umziehen.
  const termine = termineAll.filter((t) => {
    const fallRaw = t.fall as unknown
    const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { claims: ClaimJoin } | null)
    const claim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    return claim?.kundenbetreuer_id === user.id
  })

  // Kunden-Namen für Lead-Ids nachladen
  const leadIds = Array.from(
    new Set(
      termine
        .map((t) => {
          const f = Array.isArray(t.fall) ? t.fall[0] ?? null : (t.fall as { claims: ClaimJoin } | null)
          const claim = Array.isArray(f?.claims) ? f?.claims[0] : f?.claims
          return claim?.lead_id ?? null
        })
        .filter(Boolean) as string[],
    ),
  )
  const leadNameMap: Record<string, string> = {}
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, vorname, nachname')
      .in('id', leadIds)
    for (const l of leads ?? []) {
      leadNameMap[l.id] = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
    }
  }

  // SV-Namen nachladen — CMM-49 sv_id-Drop: der FK-Embed
  // sachverstaendige!gutachter_termine_sv_id_fkey haengt an der zu droppenden
  // sv_id-FK → ersetzt durch assignee_id-Lookup (typ-guarded, value-identisch).
  const svAssigneeIds = Array.from(
    new Set(
      termine
        .filter((t) => t.assignee_typ === 'sachverstaendiger' && t.assignee_id)
        .map((t) => t.assignee_id as string),
    ),
  )
  const svProfileMap = new Map<string, string>() // assignee_id (= SV-id) -> profile_id
  if (svAssigneeIds.length > 0) {
    const { data: svs } = await supabase
      .from('sachverstaendige')
      .select('id, profile_id')
      .in('id', svAssigneeIds)
    for (const s of svs ?? []) {
      if (s.profile_id) svProfileMap.set(s.id, s.profile_id)
    }
  }
  const profileIds = Array.from(new Set(Array.from(svProfileMap.values())))
  const svNameMap: Record<string, string> = {}
  if (profileIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname')
      .in('id', profileIds)
    for (const p of profs ?? []) {
      svNameMap[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
    }
  }

  // ── Praesentation: relativ nach Tag (inkl. Zurueckliegendes im 24h-Fenster) + Zeit-Rail ──
  const now = new Date()
  const berlinDay = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const todayKey = berlinDay(now.toISOString())
  const tomorrowKey = berlinDay(new Date(now.getTime() + 86_400_000).toISOString())

  const dayGroups: { key: string; rows: GutachterTerminRow[] }[] = []
  for (const t of termine) {
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
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

  const heuteCount = dayGroups.find((g) => g.key === todayKey)?.rows.length ?? 0
  const summaryParts = [`${heuteCount} heute`, `${termine.length} gesamt`]

  // Status = zentrales Monitoring-Signal (ist die Besichtigung bestaetigt?).
  const STATUS_META: Record<string, { label: string; cls: string }> = {
    reserviert: { label: 'Reserviert', cls: 'bg-warning-soft text-warning-strong border-warning/30' },
    bestaetigt: { label: 'Bestätigt', cls: 'bg-success-soft text-success-strong border-success/30' },
  }

  function TerminZeile(t: GutachterTerminRow) {
    const fall = Array.isArray(t.fall) ? t.fall[0] ?? null : (t.fall as { id: string; claims: ClaimJoin } | null)
    const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    const svProfileId = t.assignee_typ === 'sachverstaendiger' && t.assignee_id ? svProfileMap.get(t.assignee_id) ?? null : null
    const kundeName = fallClaim?.lead_id ? leadNameMap[fallClaim.lead_id] ?? 'Kunde' : 'Kunde'
    const svName = svProfileId ? svNameMap[svProfileId] ?? 'SV' : 'SV'
    const href = fall ? `/faelle/${fall.id}` : null
    const status = STATUS_META[t.status] ?? { label: t.status, cls: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border' }
    // Ziel-loser SV-Termin (kein fall, Pre-FlowLink-Direktbuchung) -> nicht-klickbar statt totem href='#'.
    const zeile = (
      <>
        {/* Zeit-Rail */}
        <div className="flex w-12 shrink-0 flex-col items-end pt-px text-right">
          <span className="text-body-sm font-semibold tabular-nums text-claimondo-navy">{fmtTime(t.start_zeit)}</span>
          {t.end_zeit && <span className="text-caption tabular-nums text-claimondo-ondo/60">{fmtTime(t.end_zeit)}</span>}
        </div>
        {/* Inhalt */}
        <div className="min-w-0 flex-1 border-l border-claimondo-border pl-3 sm:pl-4">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-body-sm font-medium text-claimondo-navy">
              {fallClaim?.claim_nummer ?? '—'} · {kundeName}
            </p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption font-medium ${status.cls}`}>{status.label}</span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-body-xs text-claimondo-ondo">
            <UsersIcon className="h-3 w-3 shrink-0 text-claimondo-ondo/70" />
            <span className="truncate">{svName}</span>
            {t.adresse && (
              <>
                <MapPinIcon className="h-3 w-3 shrink-0 text-claimondo-ondo/70" />
                <span className="truncate">{t.adresse}</span>
              </>
            )}
          </p>
        </div>
      </>
    )
    return href ? (
      <Link key={t.id} href={href} className="flex items-stretch gap-3 px-4 py-3 transition-colors hover:bg-claimondo-bg sm:gap-4">
        {zeile}
      </Link>
    ) : (
      <div key={t.id} className="flex items-stretch gap-3 px-4 py-3 sm:gap-4">
        {zeile}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Kundentermine"
        description={
          termine.length === 0
            ? 'SV-Besichtigungen der Fälle, die Sie als Kundenbetreuer begleitest. Nur lesend — Änderungen erfolgen im Fall.'
            : summaryParts.join(' · ')
        }
        size="lg"
      />

      {termine.length === 0 && (
        <div className="rounded-ios-md border border-claimondo-border bg-white px-6 py-16 text-center text-body-sm text-claimondo-ondo/70">
          Keine anstehenden Kundentermine
        </div>
      )}

      {dayGroups.map((g) => {
        const isToday = g.key === todayKey
        const isPast = g.key < todayKey
        return (
          <section key={g.key} className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
            <div className="flex items-center justify-between border-b border-claimondo-border px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-heading-sm capitalize text-claimondo-navy">
                <span className={isToday ? 'font-semibold' : isPast ? 'text-claimondo-ondo' : ''}>{dayLabel(g.key)}</span>
                {isToday && <span className="h-1.5 w-1.5 rounded-full bg-claimondo-ondo" aria-hidden />}
              </h2>
              <span className="text-body-sm text-claimondo-ondo">{g.rows.length}</span>
            </div>
            <div className="divide-y divide-claimondo-border">{g.rows.map(TerminZeile)}</div>
          </section>
        )
      })}
    </>
  )
}
