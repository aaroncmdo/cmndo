// CMM-38: Kanzlei-SLA-Status sichtbar in der Fallakte (Admin/KB).
//
// AAR-431 trackt Kanzlei-SLAs in sla_tracking (target_rolle='kanzlei') und
// mahnt automatisch in 3 Stufen. Bisher sah der KB den SLA-Stand nur via
// Tasks („Kanzlei nachfassen"). Diese Card aggregiert die aktiven SLAs
// direkt im Fall — der KB sieht beim Oeffnen sofort wieviele Tage die
// Kanzlei blockt + welche Mahnungs-Stufe schon raus ist.

import { createAdminClient } from '@/lib/supabase/admin'

type SlaRow = {
  id: string
  sla_typ: string
  status: string
  breach_at: string | null
  letzte_mahnung_am: string | null
  n_mahnungen: number | null
  blocker_rolle: string | null
  blocker_grund: string | null
}

const SLA_LABEL: Record<string, string> = {
  kanzlei_as_versand: 'Anschlussschreiben',
  kanzlei_ruege_versand: 'Ruege',
  kanzlei_kuerzung_antwort: 'VS-Kuerzungs-Antwort',
  kanzlei_vs_nachfass: 'VS-Nachfassung',
}

function fmtDays(iso: string | null): string {
  if (!iso) return '—'
  try {
    const ms = Date.now() - new Date(iso).getTime()
    const d = Math.floor(ms / (1000 * 60 * 60 * 24))
    if (d <= 0) return 'heute'
    if (d === 1) return 'seit 1 Tag'
    return `seit ${d} Tagen`
  } catch {
    return iso
  }
}

function fmtUntil(iso: string | null): string {
  if (!iso) return '—'
  try {
    const ms = new Date(iso).getTime() - Date.now()
    const d = Math.ceil(ms / (1000 * 60 * 60 * 24))
    if (d <= 0) return 'jetzt'
    if (d === 1) return 'in 1 Tag'
    return `in ${d} Tagen`
  } catch {
    return iso
  }
}

export default async function KanzleiSlaStatusCard({ fallId }: { fallId: string }) {
  const db = createAdminClient()

  const { data: slas } = await db
    .from('sla_tracking')
    .select('id, sla_typ, status, breach_at, letzte_mahnung_am, n_mahnungen, blocker_rolle, blocker_grund')
    .eq('fall_id', fallId)
    .eq('target_rolle', 'kanzlei')
    .in('status', ['pending', 'breached'])
    .order('breach_at', { ascending: true })

  const rows = (slas ?? []) as SlaRow[]
  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-claimondo-navy">Kanzlei-SLA-Status</p>
          <p className="text-xs text-claimondo-ondo">Offene Fristen mit Mahnungs-Stand</p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {rows.map((sla) => {
          const isBreached = sla.status === 'breached'
          const stufe = sla.n_mahnungen ?? 0
          const tone = isBreached
            ? (stufe >= 3 ? 'rose' : stufe >= 2 ? 'amber' : 'amber')
            : 'violet'
          const toneCls =
            tone === 'rose'
              ? 'border-rose-300 bg-rose-50 text-rose-900'
              : tone === 'amber'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-violet-300 bg-violet-50 text-violet-900'

          const label = SLA_LABEL[sla.sla_typ] ?? sla.sla_typ

          let zeilen2: string
          if (isBreached) {
            const breachInfo = sla.breach_at ? fmtDays(sla.breach_at) : ''
            const stufeLabel = stufe === 0
              ? 'Mahnung ausstehend'
              : stufe === 3
                ? 'Letzte Mahnung versendet — Wechsel pruefen'
                : `Mahnung Stufe ${stufe} versendet`
            zeilen2 = `Frist ueberzogen ${breachInfo} · ${stufeLabel}`
          } else {
            zeilen2 = `Frist faellt ${fmtUntil(sla.breach_at)}`
          }

          const blockerText = sla.blocker_rolle && sla.blocker_grund
            ? ` · Blocker: ${sla.blocker_rolle === 'kanzlei' ? 'Kanzlei' : sla.blocker_rolle === 'kunde' ? 'Kunde' : 'SV'} (${sla.blocker_grund})`
            : ''

          return (
            <li
              key={sla.id}
              className={`rounded-lg border px-3 py-2 ${toneCls}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold">{label}</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                  {isBreached ? 'überfällig' : 'läuft'}
                </span>
              </div>
              <p className="text-[11px] mt-0.5">
                {zeilen2}{blockerText}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
