import Link from 'next/link'
import { loadAusstehende, StatusBadge } from './AusstehendeZahlungenWidget'

// KFZ-155: Volle Tabelle mit allen ausstehenden Zahlungen — wird im
// Finance-Tab eingebunden. Nutzt loadAusstehende() aus dem Widget,
// zeigt aber alle Eintraege statt nur top 5.

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

export default async function AusstehendeZahlungenTable() {
  const { rows: top5, gesamt, total } = await loadAusstehende()
  // Hack: loadAusstehende slict auf 5; um die volle Liste zu bekommen muessten
  // wir die Logik duplizieren oder aufbohren. Da der Widget bewusst auf top5
  // begrenzt ist, ruft die Tabelle hier den dedizierten Loader (siehe unten).
  const all = await loadAusstehendeFull()

  const rows = all.length ? all : top5
  const totalCount = all.length || total
  const totalSum = all.length
    ? all.reduce((s, r) => s + r.betrag, 0)
    : gesamt

  return (
    <div className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
      <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-claimondo-navy">Ausstehende Zahlungen</h2>
          <p className="text-[11px] text-claimondo-ondo">Anzahlungen + ueberfaellige Rechnungen + Einzugs-Fehler</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-claimondo-ondo">Gesamt offen</p>
          <p className="text-lg font-bold text-amber-600 tabular-nums">{fmtEur(totalSum)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-claimondo-ondo">Keine offenen Forderungen.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claimondo-border bg-claimondo-bg">
                <th className="text-left px-5 py-3 text-[11px] text-claimondo-ondo font-semibold uppercase tracking-wide">Empfaenger</th>
                <th className="text-left px-5 py-3 text-[11px] text-claimondo-ondo font-semibold uppercase tracking-wide">Email</th>
                <th className="text-right px-5 py-3 text-[11px] text-claimondo-ondo font-semibold uppercase tracking-wide">Betrag</th>
                <th className="text-center px-5 py-3 text-[11px] text-claimondo-ondo font-semibold uppercase tracking-wide">Faellig seit</th>
                <th className="text-left px-5 py-3 text-[11px] text-claimondo-ondo font-semibold uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg transition-colors">
                  <td className="px-5 py-3">
                    <Link href={r.href} className="text-claimondo-navy font-medium hover:text-claimondo-ondo">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-claimondo-ondo text-xs">{r.email ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-claimondo-navy font-semibold tabular-nums">{fmtEur(r.betrag)}</td>
                  <td className="px-5 py-3 text-center text-claimondo-ondo tabular-nums">
                    {r.faelligSeitTage !== null ? `${r.faelligSeitTage} ${r.faelligSeitTage === 1 ? 'Tag' : 'Tage'}` : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-claimondo-bg border-t border-claimondo-border">
                <td colSpan={2} className="px-5 py-2.5 text-xs text-claimondo-ondo font-semibold">
                  {totalCount} offene Forderungen
                </td>
                <td className="px-5 py-2.5 text-right text-amber-600 font-bold tabular-nums">{fmtEur(totalSum)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// Voller Loader (gleiche Logik wie loadAusstehende, aber kein slice).
async function loadAusstehendeFull() {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  type Row = {
    key: string
    name: string
    email: string | null
    betrag: number
    faelligSeitTage: number | null
    status: 'anzahlung_offen' | 'rechnung_ueberfaellig' | 'einzug_failed'
    href: string
  }

  function tageSeit(iso: string | null): number | null {
    if (!iso) return null
    const ms = Date.now() - new Date(iso).getTime()
    return Math.max(0, Math.floor(ms / 86400000))
  }

  const result: Row[] = []

  // AAR SV-Audit-Konsolidierung: gelöschte SVs nicht in der Mahnliste.
  const { data: svRows } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, onboarding_anzahlung_betrag, vertrag_unterschrieben_am, vertrag_unterschrieben, portal_zugang_freigeschaltet')
    .eq('vertrag_unterschrieben', true)
    .eq('portal_zugang_freigeschaltet', false)
    .is('geloescht_am', null)
    .gt('onboarding_anzahlung_betrag', 0)
    .limit(200)

  const profileIds = (svRows ?? []).map(r => r.profile_id).filter(Boolean) as string[]
  let profileMap = new Map<string, { vorname: string | null; nachname: string | null; email: string | null }>()
  if (profileIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname, email')
      .in('id', profileIds)
    profileMap = new Map((profs ?? []).map(p => [p.id, p]))
  }

  for (const r of svRows ?? []) {
    const p = r.profile_id ? profileMap.get(r.profile_id) : null
    result.push({
      key: `sv-${r.id}`,
      name: p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—' : '—',
      email: p?.email ?? null,
      betrag: Number(r.onboarding_anzahlung_betrag ?? 0),
      faelligSeitTage: tageSeit(r.vertrag_unterschrieben_am),
      status: 'anzahlung_offen',
      href: `/admin/sachverstaendige/${r.id}`,
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data: rRows } = await supabase
    .from('abrechnungen')
    .select('id, empfaenger_typ, empfaenger_id, empfaenger_email, empfaenger_name, summe_brutto, faellig_am, status, storniert_am, bezahlt_am')
    .is('bezahlt_am', null)
    .is('storniert_am', null)
    .lt('faellig_am', today)
    .order('faellig_am', { ascending: true })
    .limit(200)

  for (const r of rRows ?? []) {
    const failed = (r.status ?? '').toLowerCase().includes('failed') || (r.status ?? '').toLowerCase().includes('einzug')
    result.push({
      key: `r-${r.id}`,
      name: r.empfaenger_name ?? '—',
      email: r.empfaenger_email ?? null,
      betrag: Number(r.summe_brutto ?? 0),
      faelligSeitTage: tageSeit(r.faellig_am),
      status: failed ? 'einzug_failed' : 'rechnung_ueberfaellig',
      // AAR-614: Siehe AusstehendeZahlungenWidget — Link immer auf
      // /admin/finance/abrechnungen (Detail-Drilldown), nicht auf tote SV-Route.
      href: '/admin/finance/abrechnungen',
    })
  }

  result.sort((a, b) => {
    const ta = a.faelligSeitTage ?? 0
    const tb = b.faelligSeitTage ?? 0
    if (tb !== ta) return tb - ta
    return b.betrag - a.betrag
  })

  return result
}
