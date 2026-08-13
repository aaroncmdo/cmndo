// Ops-Test 13.08.: Dispatch hatte keine Aufgabenliste.
//
// Es gab nur ein Dashboard-Widget mit `limit 10`, sortiert nach `created_at DESC` — also
// "die zehn neuesten" statt "die zehn wichtigsten". Bei 347 offenen Aufgaben wurde damit
// alles, was liegenblieb, SYSTEMATISCH unsichtbar: genau das Gegenteil dessen, wofuer eine
// Aufgabenliste da ist. Aufgefallen beim Regel-4-Nachweis fuer den Haenger-Detektor (#5223):
// dessen Tasks entstehen korrekt, kamen aber nie in der Anzeige an.
//
// Zwei bewusste Entscheidungen:
//   1. ESKALATIONEN ZUERST, DARIN AELTESTE ZUERST. Der Zweck dieser Liste ist "was
//      braucht Aufmerksamkeit", nicht "was ist neu" — der Live-Feed bleibt das Dashboard.
//      ⚠ Eine reine Datums-Sortierung reicht dafuer NICHT: die Haenger-Tasks (#5223) sind
//      die juengsten und landeten damit auf Position 328-347 von 347 — bei limit 300 waeren
//      sie gar nicht erschienen. Erst seit #5273 traegt `prioritaet` wieder ein Signal
//      (21 dringend statt 347), vorher waere diese Sortierung wirkungslos gewesen.
//   2. ANZAHL SICHTBAR je Status-Tab. Vorher war die Menge unsichtbar ("10 von ???"); der
//      aelteste offene Task ist vom 14.07. Wer nicht weiss, wie gross der Berg ist, kann
//      ihn nicht abtragen.
//
// Rollen-Gate kommt aus dispatch/layout.tsx (requirePortalAccess(['dispatch','admin'])).

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'offen', label: 'Offen' },
  { key: 'in-bearbeitung', label: 'In Bearbeitung' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'alle', label: 'Alle' },
] as const

/** Obergrenze pro Ansicht. Wird sie erreicht, sagt die Seite es — kein stilles Abschneiden. */
const MAX_ZEILEN = 300

/** Wohin fuehrt eine Aufgabe? Lead-Aufgaben in die Lead-Maske, fall-bezogene in die Akte. */
function zielHref(t: { lead_id: string | null; fall_id: string | null }): string | null {
  if (t.lead_id) return `/dispatch/leads/${t.lead_id}`
  if (t.fall_id) return `/faelle/${t.fall_id}`
  return null
}

export default async function DispatchTasksSeite({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { status: statusRoh } = await searchParams
  const status = TABS.some((t) => t.key === statusRoh) ? (statusRoh as string) : 'offen'
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  const basis = () => supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('typ', 'dispatch')

  const [offenC, inArbeitC, erledigtC, alleC, meineC] = await Promise.all([
    basis().eq('status', 'offen'),
    basis().eq('status', 'in-bearbeitung'),
    basis().eq('status', 'erledigt'),
    basis(),
    // Macht die Zahl in der TasksPill nachvollziehbar: die Pill zaehlt die MIR
    // zugewiesenen, die Liste zeigt das ganze Team-Postfach.
    user ? basis().eq('status', 'offen').eq('zugewiesen_an', user.id) : Promise.resolve({ count: 0 }),
  ])
  const zaehler: Record<string, number> = {
    offen: offenC.count ?? 0,
    'in-bearbeitung': inArbeitC.count ?? 0,
    erledigt: erledigtC.count ?? 0,
    alle: alleC.count ?? 0,
  }

  // ESKALATIONEN ZUERST, darin aelteste zuerst — in ZWEI Abfragen statt einer.
  //
  // Warum nicht `.order('prioritaet')`: die Spalte ist `text` mit CHECK, kein Enum.
  // Alphabetisch ergaebe das dringend < kritisch < normal — kritisch stuende also
  // hinter dringend. Und eine rein clientseitige Sortierung waere noch schlechter:
  // sie kaeme zu SPAET, weil das `limit` in der DB bereits nach Datum vorausgewaehlt
  // haette. Genau daran waere diese Seite fast gescheitert — Messung 13.08.: die 20
  // Haenger-Tasks lagen bei reiner Datums-Sortierung auf Position 328-347 von 347
  // (sie sind die juengsten) und waeren bei limit 300 GAR NICHT erschienen.
  const felder = 'id, titel, beschreibung, status, prioritaet, faellig_am, created_at, lead_id, fall_id'

  let eskalationQ = supabase
    .from('tasks')
    .select(felder)
    .eq('typ', 'dispatch')
    .in('prioritaet', ['kritisch', 'dringend'])
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(MAX_ZEILEN)
  if (status !== 'alle') eskalationQ = eskalationQ.eq('status', status)
  const { data: eskalationen } = await eskalationQ
  const oben = eskalationen ?? []

  let routineQ = supabase
    .from('tasks')
    .select(felder)
    .eq('typ', 'dispatch')
    .eq('prioritaet', 'normal')
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(Math.max(0, MAX_ZEILEN - oben.length))
  if (status !== 'alle') routineQ = routineQ.eq('status', status)
  const { data: routine } = await routineQ

  const liste = [...oben, ...(routine ?? [])]
  const gesamt = zaehler[status] ?? 0
  const abgeschnitten = gesamt > liste.length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Aufgaben"
        description={
          `Alle Dispatch-Aufgaben — Eskalationen zuerst, darin die am längsten liegenden.` +
          (meineC.count ? ` ${meineC.count} davon sind Ihnen persönlich zugewiesen.` : '')
        }
        size="lg"
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dispatch/tasks?status=${t.key}`}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-body-xs font-medium transition-colors',
              status === t.key
                ? 'bg-claimondo-navy text-white'
                : 'border border-claimondo-border bg-white text-claimondo-ondo hover:bg-claimondo-bg',
            )}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums opacity-70">{zaehler[t.key] ?? 0}</span>
          </Link>
        ))}
      </div>

      {abgeschnitten ? (
        <p className="text-body-xs text-claimondo-ondo/70">
          Zeigt die {liste.length} ältesten von {gesamt} Aufgaben.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
        {liste.length === 0 ? (
          <p className="px-4 py-16 text-center text-body-sm text-claimondo-ondo/70">
            Keine Aufgaben in dieser Kategorie
          </p>
        ) : (
          <div className="divide-y divide-claimondo-border">
            {liste.map((t) => {
              const href = zielHref(t)
              const inhalt = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-caption font-bold',
                          t.prioritaet === 'kritisch'
                            ? 'bg-danger-soft text-danger-strong'
                            : t.prioritaet === 'dringend'
                              ? 'bg-warning-soft text-warning-strong'
                              : 'bg-claimondo-bg text-claimondo-ondo',
                        )}
                      >
                        {t.prioritaet}
                      </span>
                      <p className="truncate text-body-sm font-medium text-claimondo-navy">{t.titel}</p>
                    </div>
                    {t.beschreibung ? (
                      <p className="mt-1 line-clamp-2 text-body-xs text-claimondo-ondo">{t.beschreibung}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-body-xs text-claimondo-ondo/70">
                    {t.faellig_am
                      ? new Date(t.faellig_am as string).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                      : new Date(t.created_at as string).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  </span>
                </>
              )
              return href ? (
                <Link
                  key={t.id}
                  href={href}
                  className="flex items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-claimondo-bg"
                >
                  {inhalt}
                </Link>
              ) : (
                // Ohne Bezug kein Link — ein toter Klick ist schlimmer als gar keiner.
                <div key={t.id} className="flex items-start justify-between gap-3 px-4 py-3.5">
                  {inhalt}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
