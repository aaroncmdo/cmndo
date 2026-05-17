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
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

type ClaimNrJoin = { claim_nummer: string | null } | { claim_nummer: string | null }[] | null

type GutachterTerminRow = {
  id: string
  start_zeit: string
  end_zeit: string | null
  status: string
  kanal: string | null
  adresse: string | null
  fall_id: string | null
  sv_id: string | null
  fall:
    | { id: string; claims: ClaimNrJoin; kundenbetreuer_id: string | null; lead_id: string | null }
    | { id: string; claims: ClaimNrJoin; kundenbetreuer_id: string | null; lead_id: string | null }[]
    | null
  sachverstaendige:
    | { id: string; profile_id: string | null }
    | { id: string; profile_id: string | null }[]
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
      'id, start_zeit, end_zeit, status, kanal, adresse, fall_id, sv_id, ' +
        'fall:faelle!gutachter_termine_fall_id_fkey(id, claims:claim_id(claim_nummer), kundenbetreuer_id, lead_id), ' +
        'sachverstaendige!gutachter_termine_sv_id_fkey(id, profile_id)',
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
    const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { kundenbetreuer_id: string | null } | null)
    return fall?.kundenbetreuer_id === user.id
  })

  // Kunden-Namen für Lead-Ids nachladen
  const leadIds = Array.from(
    new Set(
      termine
        .map((t) => {
          const f = Array.isArray(t.fall) ? t.fall[0] ?? null : (t.fall as { lead_id: string | null } | null)
          return f?.lead_id ?? null
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

  // SV-Namen nachladen (Join über profile_id)
  const profileIds = Array.from(
    new Set(
      termine
        .map((t) => {
          const s = Array.isArray(t.sachverstaendige) ? t.sachverstaendige[0] ?? null : (t.sachverstaendige as { profile_id: string | null } | null)
          return s?.profile_id ?? null
        })
        .filter(Boolean) as string[],
    ),
  )
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
    <div className="space-y-6">
      <PageHeader
        title="Kundentermine"
        description="SV-Besichtigungen der Fälle, die du als Kundenbetreuer begleitest. Nur lesend — Terminänderungen erfolgen im Fall."
        size="lg"
      />

      {groups.size === 0 && (
        <div className="bg-white rounded-ios-lg shadow-ios-md px-6 py-16 text-center">
          <p className="text-sm text-claimondo-ondo/70">Keine anstehenden Kundentermine</p>
        </div>
      )}

      {Array.from(groups.entries()).map(([day, rows]) => {
        const isToday = day === nowIso.slice(0, 10)
        return (
          <section key={day} className="bg-white rounded-ios-lg shadow-ios-md">
            <div className="px-4 py-3 border-b border-claimondo-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-claimondo-navy">
                {new Date(day + 'T00:00:00').toLocaleDateString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                })}
                {isToday && <span className="ml-2 text-xs text-claimondo-ondo">(heute)</span>}
              </h2>
              <span className="text-xs text-claimondo-ondo">{rows?.length ?? 0}</span>
            </div>
            <div className="divide-y divide-claimondo-border">
              {(rows ?? []).map((t) => {
                const fall = Array.isArray(t.fall) ? t.fall[0] ?? null : (t.fall as { id: string; claims: ClaimNrJoin; lead_id: string | null } | null)
                const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
                const sv = Array.isArray(t.sachverstaendige) ? t.sachverstaendige[0] ?? null : (t.sachverstaendige as { profile_id: string | null } | null)
                const kundeName = fall?.lead_id ? leadNameMap[fall.lead_id] ?? 'Kunde' : 'Kunde'
                const svName = sv?.profile_id ? svNameMap[sv.profile_id] ?? 'SV' : 'SV'
                const href = fall ? `/faelle/${fall.id}` : '#'
                return (
                  <Link key={t.id} href={href} className="block px-4 py-3 hover:bg-claimondo-bg transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-claimondo-ondo/10 text-claimondo-ondo border-claimondo-ondo/20">
                        <CalendarIcon className="w-3 h-3" />
                        SV-Termin
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-claimondo-navy truncate">
                          {fallClaim?.claim_nummer ?? '—'} · {kundeName}
                        </p>
                        <p className="text-xs text-claimondo-ondo flex items-center gap-1 flex-wrap">
                          <span>
                            {new Date(t.start_zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <UsersIcon className="w-3 h-3 text-claimondo-ondo/70" />
                          <span>{svName}</span>
                          {t.adresse && (
                            <>
                              <MapPinIcon className="w-3 h-3 text-claimondo-ondo/70" />
                              <span className="truncate">{t.adresse}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-claimondo-ondo/70">{t.status}</span>
                    </div>
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
