// Mitarbeiter-Kundentermine. Zeigt SV-Besichtigungen der Fälle die ich
// als KB/LB betreue (faelle.kundenbetreuer_id = user.id). Unterschied zu
// /mitarbeiter/termine: dort sind MEINE Termine (Rückrufe etc., bei denen
// ich anwesend bin). Hier sind Kunden-Termine meiner Fälle (SV-Besich-
// tigung beim Kunden — ich bin nicht vor Ort, aber muss den Ablauf
// kennen).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarIcon, UsersIcon, MapPinIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

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

export default async function MitarbeiterKundentermine() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const nowIso = new Date().toISOString()
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  // SV-Termine der Fälle wo ich KB bin. Join fall → kundenbetreuer_id=me.
  const { data: termineRaw } = await supabase
    .from('gutachter_termine')
    .select(
      'id, start_zeit, end_zeit, status, kanal, adresse, fall_id, assignee_id, assignee_typ, ' +
        'fall:faelle_claim_bridge!gutachter_termine_fall_id_fkey(id:fall_id, claims:claim_id(claim_nummer, kundenbetreuer_id, lead_id))',
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

  // Gruppieren nach Tag
  const groups = new Map<string, GutachterTerminRow[]>()
  for (const t of termine) {
    const dayKey = new Date(t.start_zeit).toISOString().slice(0, 10)
    const bucket = groups.get(dayKey) ?? []
    bucket.push(t)
    groups.set(dayKey, bucket)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Kundentermine</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">SV-Besichtigungen der Fälle, die du als Kundenbetreuer begleitest. Nur lesend — Änderungen erfolgen im Fall.</p>
      </div>

      {groups.size === 0 && (
        <div className="rounded-ios-md border border-claimondo-border bg-white px-6 py-16 text-center text-body-sm text-claimondo-ondo/70">
          Keine anstehenden Kundentermine
        </div>
      )}

      {Array.from(groups.entries()).map(([day, rows]) => {
        const isToday = day === nowIso.slice(0, 10)
        return (
          <section key={day} className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
            <div className="flex items-center justify-between border-b border-claimondo-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-heading-sm text-claimondo-navy">
                <span className="capitalize">
                  {new Date(day + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                </span>
                {isToday && <span className="rounded-full bg-claimondo-navy px-2 py-0.5 text-caption text-white">Heute</span>}
              </h2>
              <span className="text-body-sm text-claimondo-ondo">{rows?.length ?? 0}</span>
            </div>
            <div className="divide-y divide-claimondo-border">
              {(rows ?? []).map((t) => {
                const fall = Array.isArray(t.fall) ? t.fall[0] ?? null : (t.fall as { id: string; claims: ClaimJoin } | null)
                const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
                const svProfileId = t.assignee_typ === 'sachverstaendiger' && t.assignee_id ? svProfileMap.get(t.assignee_id) ?? null : null
                const kundeName = fallClaim?.lead_id ? leadNameMap[fallClaim.lead_id] ?? 'Kunde' : 'Kunde'
                const svName = svProfileId ? svNameMap[svProfileId] ?? 'SV' : 'SV'
                const href = fall ? `/faelle/${fall.id}` : '#'
                return (
                  <Link key={t.id} href={href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-claimondo-bg">
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-claimondo-ondo/20 bg-claimondo-ondo/10 px-2 py-0.5 text-caption font-medium text-claimondo-ondo">
                      <CalendarIcon className="h-3 w-3" />
                      SV-Termin
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-claimondo-navy">
                        {fallClaim?.claim_nummer ?? '—'} · {kundeName}
                      </p>
                      <p className="flex flex-wrap items-center gap-1 text-body-xs text-claimondo-ondo">
                        <span className="tabular-nums">
                          {new Date(t.start_zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <UsersIcon className="h-3 w-3 text-claimondo-ondo/70" />
                        <span>{svName}</span>
                        {t.adresse && (
                          <>
                            <MapPinIcon className="h-3 w-3 text-claimondo-ondo/70" />
                            <span className="truncate">{t.adresse}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-caption uppercase text-claimondo-ondo/70">{t.status}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
